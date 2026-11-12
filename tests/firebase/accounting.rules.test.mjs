import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes, createHmac } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { AccountingService } from '../../backend/lib/accounting/service.js';
import { XeroAccountingProvider, digest, quote, seal, unseal } from '../../backend/lib/accounting/provider.js';
import { XeroHttpAccountingProvider } from '../../backend/lib/accounting/xeroHttp.js';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Firestore } = require('firebase-admin/firestore');
const projectId = 'demo-instafire-accounting';
const key = randomBytes(32).toString('base64');
let environment, admin, api, provider;
const root = 'companies/alpha';
const lines = [{ description: 'Completed inspection', quantity: 2, unitPence: 10001, vat: 'standard' }];
const client = uid => environment.authenticatedContext(uid).firestore();
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  admin = new Firestore({ projectId, host: '127.0.0.1:8080', ssl: false });
});
after(async () => { await admin?.terminate(); await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  provider = new XeroAccountingProvider(); api = new AccountingService(admin, provider, key);
  const fixtures = {
    [`${root}`]: { status: 'active' }, 'companies/beta': { status: 'active' },
    [`${root}/members/owner`]: { role: 'owner', status: 'active' },
    [`${root}/members/admin`]: { role: 'office_admin', status: 'active', permissions: { accounting: true } },
    [`${root}/members/office`]: { role: 'office_admin', status: 'active' },
    [`${root}/members/engineer`]: { role: 'engineer', status: 'active' },
    [`${root}/members/inactive`]: { role: 'owner', status: 'disabled' },
    'companies/beta/members/betaOwner': { role: 'owner', status: 'active' },
    [`${root}/billingCustomers/customer`]: { name: 'Synthetic billing customer' },
    [`${root}/billingJobs/job`]: { status: 'completed', completionSynced: true, customerId: 'customer', lines },
  };
  const batch = admin.batch(); for (const [path, data] of Object.entries(fixtures)) batch.set(admin.doc(path), data); await batch.commit();
});
async function connect() { const { state } = await api.start('alpha', 'owner'); await api.callback('alpha', 'owner', state, 'demo'); }
async function enqueue() {
  const preview = await api.preview('alpha', 'owner', 'job');
  await api.approve('alpha', 'owner', 'job', preview.fingerprint);
  return api.enqueue('alpha', 'owner', 'job', preview.fingerprint);
}
test('rules isolate all accounting records, prevent writes and hide encrypted credentials from every client', async () => {
  for (const name of ['billingJobs', 'billingCustomers', 'accountingSettings', 'accountingContacts', 'accountingInvoices', 'accountingOutbox', 'accountingAudit']) {
    const path = `${root}/${name}/record`; await admin.doc(path).set({ safe: true });
    for (const uid of ['owner', 'admin']) await assertSucceeds(getDoc(doc(client(uid), path)));
    for (const uid of ['betaOwner', 'engineer', 'office', 'inactive']) await assertFails(getDoc(doc(client(uid), path)));
    await assertFails(setDoc(doc(client('owner'), path), { changed: true }));
    await assertFails(getDocs(collection(client('betaOwner'), root, name)));
  }
  for (const path of [`${root}/accountingPrivate/xero`, 'accountingOAuthStates/state', 'accountingTenants/tenant']) {
    await admin.doc(path).set({ credentials: 'sensitive' });
    await assertFails(getDoc(doc(client('owner'), path)));
    await assertFails(setDoc(doc(client('owner'), path), { credentials: 'changed' }));
  }
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), `${root}/billingJobs/job`)));
});
test('backend checks membership, admin accounting permission, workspace status and path input', async () => {
  for (const uid of ['betaOwner', 'engineer', 'office', 'inactive']) await assert.rejects(api.start('alpha', uid), /authorised accounting administrator/);
  await assert.rejects(api.start('alpha/other', 'owner'));
  await api.start('alpha', 'admin');
  await admin.doc(root).update({ status: 'disabled' });
  await assert.rejects(api.status('alpha', 'owner'));
});
test('OAuth rejects invalid, wrong workspace, wrong user, expired and replayed state before token exchange', async () => {
  const original = provider.connect.bind(provider); let calls = 0;
  provider.connect = async code => { calls++; return original(code); };
  await assert.rejects(api.callback('alpha', 'owner', 'invalid', 'demo'));
  const { state } = await api.start('alpha', 'owner');
  await assert.rejects(api.callback('beta', 'betaOwner', state, 'demo'));
  await assert.rejects(api.callback('alpha', 'admin', state, 'demo'));
  assert.equal(calls, 0);
  await api.callback('alpha', 'owner', state, 'demo');
  await assert.rejects(api.callback('alpha', 'owner', state, 'demo'));
  assert.equal(calls, 1);
  const next = await api.start('alpha', 'owner');
  await admin.doc(`accountingOAuthStates/${digest(next.state)}`).update({ expiresAt: Date.now() - 1 });
  await assert.rejects(api.callback('alpha', 'owner', next.state, 'demo'));
  assert.equal(calls, 1);
});
test('credentials are encrypted with workspace authenticated context', async () => {
  await connect();
  const stored = (await admin.doc(`${root}/accountingPrivate/xero`).get()).data();
  assert.equal(stored.credentials.includes('accessToken'), false);
  assert.equal(unseal(stored.credentials, key, 'alpha').tenantId, 'demo-alpha');
  assert.throws(() => unseal(stored.credentials, key, 'beta'));
  assert.deepEqual(await api.status('alpha', 'owner'), { status: 'connected', mode: 'mock' });
});
test('unfinished, unapproved and changed billing work cannot be invoiced', async () => {
  await connect(); const preview = await api.preview('alpha', 'owner', 'job');
  await assert.rejects(api.enqueue('alpha', 'owner', 'job', preview.fingerprint), /approved/);
  await api.approve('alpha', 'owner', 'job', preview.fingerprint);
  await admin.doc(`${root}/billingJobs/job`).update({ lines: [{ ...lines[0], unitPence: 20000 }] });
  await assert.rejects(api.enqueue('alpha', 'owner', 'job', preview.fingerprint), /changed/);
  await admin.doc(`${root}/billingJobs/job`).update({ status: 'in_progress' });
  await assert.rejects(api.preview('alpha', 'owner', 'job'), /completed/);
});
test('concurrent clicks and workers create one draft, contact mapping, job mapping and audit', async () => {
  await connect(); const preview = await api.preview('alpha', 'owner', 'job');
  await api.approve('alpha', 'owner', 'job', preview.fingerprint);
  const results = await Promise.all(Array.from({ length: 5 }, () => api.enqueue('alpha', 'owner', 'job', preview.fingerprint)));
  assert.equal(new Set(results.map(r => r.requestId)).size, 1);
  let calls = 0; const create = provider.createDraftInvoice.bind(provider);
  provider.createDraftInvoice = async (...args) => { calls++; return create(...args); };
  const { requestId } = results[0];
  await Promise.all([api.process('alpha', requestId), api.process('alpha', requestId)]);
  await api.process('alpha', requestId);
  assert.equal(calls, 1);
  assert.equal((await admin.doc(`${root}/accountingOutbox/${requestId}`).get()).data().status, 'succeeded');
  const invoice = (await admin.doc(`${root}/accountingInvoices/${requestId}`).get()).data();
  assert.equal(invoice.status, 'DRAFT'); assert.equal(invoice.jobId, 'job'); assert.equal(invoice.invoice.totalPence, 24002);
  assert.equal((await admin.collection(`${root}/accountingContacts`).get()).size, 1);
  const events = (await admin.collection(`${root}/accountingAudit`).get()).docs.map(d => d.data().event);
  for (const event of ['connection', 'work_approval', 'customer_mapping', 'invoice_creation']) assert(events.includes(event));
});
test('expired connection fails recoverably and reconnect plus retry uses the same request', async () => {
  await connect(); const { requestId } = await enqueue();
  const ref = admin.doc(`${root}/accountingPrivate/xero`), connection = (await ref.get()).data();
  const tokens = unseal(connection.credentials, key, 'alpha'); tokens.expiresAt = 0;
  await ref.update({ credentials: seal(tokens, key, 'alpha') });
  await api.process('alpha', requestId);
  let record = (await admin.doc(`${root}/accountingOutbox/${requestId}`).get()).data();
  assert.equal(record.status, 'failed'); assert.match(record.error, /expired/);
  await connect(); await api.process('alpha', requestId);
  record = (await admin.doc(`${root}/accountingOutbox/${requestId}`).get()).data();
  assert.equal(record.status, 'succeeded'); assert.equal(record.attempts, 2);
});
test('lost provider response and stale worker recovery never create a second mock invoice; errors are sanitised', async () => {
  await connect(); const { requestId } = await enqueue();
  const invoices = new Set(); const create = provider.createDraftInvoice.bind(provider); let fail = true;
  provider.createDraftInvoice = async (...args) => {
    const result = await create(...args); invoices.add(result.invoiceId);
    if (fail) { fail = false; throw new Error('SECRET_PROVIDER_TOKEN'); } return result;
  };
  await api.process('alpha', requestId);
  const ref = admin.doc(`${root}/accountingOutbox/${requestId}`);
  assert.equal((await ref.get()).data().error.includes('SECRET'), false);
  await ref.update({ status: 'processing', leaseUntil: 0 });
  await api.process('alpha', requestId);
  assert.equal(invoices.size, 1); assert.equal((await ref.get()).data().status, 'succeeded');
  const events = (await admin.collection(`${root}/accountingAudit`).get()).docs.map(d => d.data().event);
  assert(events.includes('retry')); assert(events.includes('failure'));
});
test('money handles UK VAT in integer pence and rejects fractional amounts and unsupported treatments', () => {
  assert.equal(quote(lines).totalPence, 24002);
  assert.equal(quote([{ ...lines[0], vat: 'exempt' }]).vatPence, 0);
  assert.throws(() => quote([{ ...lines[0], unitPence: 0.1 }]));
  assert.throws(() => quote([{ ...lines[0], vat: 'invented' }]));
  assert.throws(() => quote([{ ...lines[0], quantity: 1.5 }]));
});
test('webhook validates the raw signature before accepting invoice events', () => {
  const raw = Buffer.from(JSON.stringify({ events: [{ eventCategory: 'INVOICE', tenantId: 'tenant', resourceId: 'invoice' }] }));
  const signature = createHmac('sha256', 'webhook-secret').update(raw).digest('base64');
  assert.deepEqual(provider.handleVerifiedWebhook(raw, signature, 'webhook-secret'), [{ tenantId: 'tenant', resourceId: 'invoice' }]);
  assert.throws(() => provider.handleVerifiedWebhook(raw, 'invalid', 'webhook-secret'));
  assert.throws(() => provider.handleVerifiedWebhook(Buffer.from('{}'), signature, 'webhook-secret'));
});
test('configuration and disconnect are role-protected and create meaningful audit events', async () => {
  await connect();
  const settings = { salesAccountCode: '200', taxTypes: { standard: 'OUTPUT2', reduced: 'REDUCED', zero: 'ZERORATEDOUTPUT', exempt: 'EXEMPTOUTPUT', outside: 'NONE' } };
  await assert.rejects(api.configure('alpha', 'office', settings));
  await assert.rejects(api.disconnect('alpha', 'engineer'));
  await api.configure('alpha', 'admin', settings);
  assert.deepEqual((await admin.doc(`${root}/accountingSettings/xero`).get()).data(), settings);
  await api.disconnect('alpha', 'owner');
  assert.equal((await api.status('alpha', 'owner')).status, 'disconnected');
  const events = (await admin.collection(`${root}/accountingAudit`).get()).docs.map(d => d.data().event);
  assert(events.includes('configuration')); assert(events.includes('disconnection'));
});
test('one Xero organisation cannot bind to two workspaces', async () => {
  // The mock URL transports opaque state without making any external request.
  provider.authorisationUrl = state => state;
  const first = await api.start('alpha', 'owner');
  await api.callback('alpha', 'owner', first.url, 'demo');
  const pending = await api.start('beta', 'betaOwner');
  await assert.rejects(api.callback('beta', 'betaOwner', pending.url, 'demo'), /another workspace/);
  assert.equal((await admin.doc('companies/beta/accountingPrivate/xero').get()).exists, false);
});
test('approval withdrawal after queuing prevents provider invoice creation', async () => {
  await connect(); const { requestId } = await enqueue();
  await admin.doc(`${root}/billingJobs/job`).update({ status: 'in_progress' });
  provider.createDraftInvoice = async () => { assert.fail('Provider must not be called for unfinished work'); };
  await api.process('alpha', requestId);
  assert.equal((await admin.doc(`${root}/accountingOutbox/${requestId}`).get()).data().status, 'failed');
  assert.equal((await admin.collection(`${root}/accountingInvoices`).get()).size, 0);
});
test('HTTP OAuth exchange, token refresh, revocation and authorisation URL remain server-only and mocked', async () => {
  const calls = [];
  const http = new XeroHttpAccountingProvider({ clientId: 'test-client', clientSecret: 'test-secret', redirectUri: 'https://example.invalid/callback', fetch: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/connect/token')) return Response.json({ access_token: 'access', refresh_token: 'rotated', expires_in: 1800 });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json([{ tenantId: 'test-tenant', id: 'test-connection' }]);
  } });
  const url = new URL(http.authorisationUrl('opaque-state'));
  assert.equal(url.searchParams.get('state'), 'opaque-state'); assert.equal(url.searchParams.has('client_secret'), false);
  const credentials = await http.connect('one-use-code');
  assert.equal(credentials.tenantId, 'test-tenant');
  const refreshed = await http.refresh(credentials); assert.equal(refreshed.refreshToken, 'rotated');
  await http.disconnect(refreshed);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`);
  assert.equal(calls[2].options.body.get('grant_type'), 'refresh_token');
});
test('Xero HTTP adapter creates a draft via a mocked API and reconciles delayed retries by invoice number', async () => {
  const calls = []; let saved;
  const transport = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'PUT') {
      const invoice = JSON.parse(options.body).Invoices[0];
      assert.equal(invoice.Type, 'ACCREC'); assert.equal(invoice.Status, 'DRAFT'); assert.equal(invoice.CurrencyCode, 'GBP');
      saved = { ...invoice, InvoiceID: 'mock-xero-id', Total: 240.02 }; return Response.json({ Invoices: [saved] });
    }
    return Response.json({ Invoices: saved ? [saved] : [] });
  };
  const http = new XeroHttpAccountingProvider({ clientId: 'client', clientSecret: 'secret', redirectUri: 'https://example.invalid/callback', fetch: transport, settings: { salesAccountCode: '200', taxTypes: { standard: 'OUTPUT2', reduced: 'REDUCED', zero: 'ZERORATEDOUTPUT', exempt: 'EXEMPTOUTPUT', outside: 'NONE' } } });
  const credentials = { accessToken: 'access', refreshToken: 'refresh', tenantId: 'tenant', connectionId: 'connection', expiresAt: Date.now() + 3600000 };
  const one = await http.createDraftInvoice(credentials, 'contact', quote(lines), digest('job'));
  const two = await http.createDraftInvoice(credentials, 'contact', quote(lines), digest('job'));
  assert.equal(one.invoiceId, two.invoiceId); assert.equal(calls.filter(c => c.options.method === 'PUT').length, 1);
  assert.equal(calls[0].options.headers['Xero-tenant-id'], 'tenant');
  assert.equal(calls[1].options.headers['Idempotency-Key'], digest('job'));
});
