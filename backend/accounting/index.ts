import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { AccountingService } from './service.js';
import { AccountingError, digest, id, requireValue, XeroAccountingProvider, type AccountingSettings } from './provider.js';
import { XeroHttpAccountingProvider } from './xeroHttp.js';

initializeApp();
const encryptionKey = defineSecret('ACCOUNTING_ENCRYPTION_KEY');
// Reserved Secret Manager bindings for the reviewed live transport. No application
// secret is read by the browser; this release cannot call Xero's network APIs.
const xeroClientSecret = defineSecret('XERO_CLIENT_SECRET');
const xeroWebhookSecret = defineSecret('XERO_WEBHOOK_SECRET');
// Intentional release gate: supplying credentials or an environment variable
// cannot accidentally start sending real customer information to Xero.
const LIVE_XERO_ENABLED: boolean = false;
const options = { region: 'europe-west2', secrets: LIVE_XERO_ENABLED ? [encryptionKey, xeroClientSecret, xeroWebhookSecret] : [encryptionKey] };
const service = async (company: string) => {
  const db = getFirestore();
  const settings = (await db.doc(`companies/${id(company)}/accountingSettings/xero`).get()).data() as AccountingSettings | undefined;
  const provider = LIVE_XERO_ENABLED ? new XeroHttpAccountingProvider({ clientId: process.env.XERO_CLIENT_ID!, clientSecret: xeroClientSecret.value(), redirectUri: process.env.XERO_REDIRECT_URI!, fetch, settings }) : new XeroAccountingProvider(process.env.ACCOUNTING_MODE ?? 'mock');
  return new AccountingService(db, provider, encryptionKey.value());
};
export const accounting = onCall(options, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to your office workspace.');
  try {
    const { companyId, action, jobId, fingerprint, state } = request.data ?? {};
    const company = id(companyId), uid = request.auth.uid, api = await service(company);
    switch (action) {
      case 'status': return await api.status(company, uid);
      case 'connect': return await api.start(company, uid);
      case 'completeDemo': await api.callback(company, uid, state, 'demo'); return { ok: true };
      case 'disconnect': await api.disconnect(company, uid); return { ok: true };
      case 'configure': await api.configure(company, uid, request.data.settings); return { ok: true };
      case 'preview': return await api.preview(company, uid, id(jobId));
      case 'approve': return await api.approve(company, uid, id(jobId), fingerprint);
      case 'invoice': return await api.enqueue(company, uid, id(jobId), fingerprint);
      case 'retry': {
        await api.authorise(company, uid);
        const ref = api.db.doc(`${api.root(company)}/accountingOutbox/${id(request.data.requestId)}`);
        const record = (await ref.get()).data();
        if (!record) throw new AccountingError('not-found', 'Invoice request not found.');
        await api.process(company, ref.id);
        return { ok: true };
      }
      default: throw new AccountingError('invalid-argument', 'Unknown accounting action.');
    }
  } catch (error) {
    if (error instanceof AccountingError) throw new HttpsError(error.code as 'failed-precondition', error.message);
    throw new HttpsError('internal', 'Accounting is temporarily unavailable. Refresh and try again.');
  }
});
export const accountingOutboxCreated = onDocumentCreated({ ...options, document: 'companies/{company}/accountingOutbox/{requestId}', retry: true }, async event => {
  await (await service(event.params.company)).process(event.params.company, event.params.requestId);
});
// Recover lost trigger deliveries and crashed workers. Failed requests require an
// explicit office retry; this schedule only recovers queued/abandoned operations.
export const accountingRecovery = onSchedule({ ...options, schedule: 'every 5 minutes' }, async () => {
  const db = getFirestore();
  for (const status of ['queued', 'processing']) {
    const records = await db.collectionGroup('accountingOutbox').where('status', '==', status).limit(100).get();
    for (const record of records.docs) {
      const company = record.ref.parent.parent!.id;
      await (await service(company)).process(company, record.id);
    }
  }
});

export const xeroOAuthCallback = onRequest(options, async (request, response) => {
  response.set('Cache-Control', 'no-store'); response.set('Referrer-Policy', 'no-referrer');
  if (!LIVE_XERO_ENABLED) { response.status(503).send('Live Xero authorisation is disabled. Use demo mode in the office portal.'); return; }
  try {
    const { state, code } = request.query;
    requireValue(request.method === 'GET' && typeof state === 'string' && /^[a-f0-9]{64}$/.test(state) && typeof code === 'string' && code.length <= 4096);
    const pending = (await getFirestore().doc(`accountingOAuthStates/${digest(state)}`).get()).data();
    requireValue(pending && pending.expiresAt > Date.now() && !pending.claimed);
    // Company and initiating Firebase UID come exclusively from server state.
    await (await service(pending.company)).callback(pending.company, pending.uid, state, code);
    const origin = process.env.ACCOUNTING_OFFICE_ORIGIN;
    requireValue(origin && new URL(origin).protocol === 'https:' && new URL(origin).origin === origin);
    response.redirect(303, `${origin}/?accounting=connected`);
  } catch { response.status(400).send('Xero authorisation could not be completed. Return to Accounting Integrations and connect again.'); }
});

export const xeroWebhook = onRequest(options, async (request, response) => {
  if (!LIVE_XERO_ENABLED) { response.status(503).send('Live webhooks are disabled in demo mode.'); return; }
  try {
    requireValue(request.method === 'POST' && request.rawBody.length <= 1000000);
    const verifier = new XeroAccountingProvider();
    const events = verifier.handleVerifiedWebhook(request.rawBody, request.get('x-xero-signature') ?? '', xeroWebhookSecret.value());
    const db = getFirestore(), receipt = db.doc(`accountingWebhookReceipts/${digest(request.rawBody.toString('base64'))}`);
    if ((await receipt.get()).exists) { response.status(200).send(); return; }
    for (const event of events) {
      requireValue(typeof event.tenantId === 'string' && typeof event.resourceId === 'string');
      const binding = (await db.doc(`accountingTenants/${digest(event.tenantId)}`).get()).data();
      if (!binding) continue;
      const api = await service(binding.company);
      const invoices = await db.collection(`${api.root(binding.company)}/accountingInvoices`).where('invoiceId', '==', event.resourceId).limit(1).get();
      for (const invoice of invoices.docs) {
        const credentials = await api.credentials(binding.company, invoice.data().generation);
        requireValue(credentials.tenantId === event.tenantId);
        const status = await api.provider.retrieveInvoiceStatus(credentials, event.resourceId);
        await db.runTransaction(async tx => {
          const latest = (await tx.get(invoice.ref)).data();
          if (latest?.status === status) return;
          tx.update(invoice.ref, { status }); api.audit(tx, binding.company, 'xero-webhook', 'invoice_status', invoice.id);
        });
      }
    }
    await receipt.set({ receivedAt: Date.now() });
    response.status(200).send();
  } catch (error) {
    response.status(error instanceof AccountingError && error.message === 'Invalid webhook signature.' ? 401 : 503).send('Webhook could not be processed.');
  }
});
