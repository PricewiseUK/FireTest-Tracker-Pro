import { randomBytes, randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { AccountingError, digest, id, quote, requireValue, seal, unseal, type AccountingProvider, type AccountingSettings, type Quote } from './provider.js';

export class AccountingService {
  constructor(readonly db: Firestore, readonly provider: AccountingProvider, readonly key: string) {}
  root(company: string) { return `companies/${id(company)}`; }
  async authorise(company: string, uid: string, tx?: Transaction) {
    const refs = [this.db.doc(this.root(company)), this.db.doc(`${this.root(company)}/members/${id(uid)}`)];
    const [workspace, member] = tx ? await tx.getAll(...refs) : await this.db.getAll(...refs);
    const m = member.data();
    if (workspace.data()?.status !== 'active' || m?.status !== 'active' || !(m.role === 'owner' || (m.role === 'office_admin' && m.permissions?.accounting === true))) {
      throw new AccountingError('permission-denied', 'An owner or authorised accounting administrator is required.');
    }
  }
  audit(tx: Transaction, company: string, uid: string, event: string, recordId = '') {
    tx.create(this.db.collection(`${this.root(company)}/accountingAudit`).doc(), { event, actorId: uid, recordId, at: Date.now(), provider: 'xero' });
  }
  async status(company: string, uid: string) {
    await this.authorise(company, uid);
    const doc = await this.db.doc(`${this.root(company)}/accountingPrivate/xero`).get();
    const credentials = doc.exists ? (this.provider.refresh ? await this.credentials(company, doc.data()!.generation) : unseal(doc.data()!.credentials, this.key, company)) : null;
    return { mode: this.provider.authorisationUrl ? 'live' : 'mock', status: credentials ? this.provider.connectionStatus(credentials) : 'disconnected' };
  }
  async configure(company: string, uid: string, settings: AccountingSettings) {
    await this.authorise(company, uid);
    requireValue(settings && Object.keys(settings).length === 2 && typeof settings.salesAccountCode === 'string' && /^[a-zA-Z0-9_-]{1,30}$/.test(settings.salesAccountCode));
    requireValue(settings.taxTypes && Object.keys(settings.taxTypes).length === 5);
    for (const treatment of ['standard', 'reduced', 'zero', 'exempt', 'outside'] as const) requireValue(typeof settings.taxTypes[treatment] === 'string' && /^[A-Z0-9_]{1,40}$/.test(settings.taxTypes[treatment]));
    if (this.provider.validateSettings) {
      const connection = (await this.db.doc(`${this.root(company)}/accountingPrivate/xero`).get()).data();
      requireValue(connection, 'Connect Xero before configuring accounting.');
      await this.provider.validateSettings(await this.credentials(company, connection.generation), settings);
    }
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      tx.set(this.db.doc(`${this.root(company)}/accountingSettings/xero`), settings);
      this.audit(tx, company, uid, 'configuration');
    });
  }
  async start(company: string, uid: string) {
    const state = randomBytes(32).toString('hex');
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      tx.create(this.db.doc(`accountingOAuthStates/${digest(state)}`), { company, uid, expiresAt: Date.now() + 600000 });
    });
    // State is opaque, random and single-use. The mock completion still exercises
    // the same workspace/user-bound server validation as a real callback.
    return this.provider.authorisationUrl ? { url: this.provider.authorisationUrl(state) } : { state, mode: 'mock' };
  }
  async callback(company: string, uid: string, state: string, code: string) {
    requireValue(typeof state === 'string' && /^[a-f0-9]{64}$/.test(state), 'Authorisation expired. Start connecting again.');
    const ref = this.db.doc(`accountingOAuthStates/${digest(state)}`);
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const pending = (await tx.get(ref)).data();
      requireValue(pending && !pending.claimed && pending.company === company && pending.uid === uid && pending.expiresAt > Date.now(), 'Authorisation expired. Start connecting again.');
      tx.update(ref, { claimed: true });
    });
    const credentials = await this.provider.connect(code);
    if (!this.provider.authorisationUrl) credentials.tenantId = `demo-${company}`;
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const record = (await tx.get(ref)).data();
      requireValue(record && record.company === company && record.uid === uid && record.expiresAt > Date.now(), 'Authorisation expired. Start connecting again.');
      const queue = await tx.get(this.db.collection(`${this.root(company)}/accountingOutbox`).where('status', '==', 'processing').limit(1));
      requireValue(queue.empty, 'An invoice is processing. Try again shortly.');
      const tenantRef = this.db.doc(`accountingTenants/${digest(credentials.tenantId)}`);
      const binding = (await tx.get(tenantRef)).data();
      requireValue(!binding || binding.company === company, 'This Xero organisation is already linked to another workspace.');
      tx.delete(ref);
      tx.set(tenantRef, { company, tenantId: credentials.tenantId });
      tx.set(this.db.doc(`${this.root(company)}/accountingPrivate/xero`), { credentials: seal(credentials, this.key, company), generation: digest([company, credentials.tenantId]) });
      this.audit(tx, company, uid, 'connection');
    });
  }
  async disconnect(company: string, uid: string) {
    const ref = this.db.doc(`${this.root(company)}/accountingPrivate/xero`), token = randomUUID();
    const connection = await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const active = await tx.get(this.db.collection(`${this.root(company)}/accountingOutbox`).where('status', '==', 'processing').limit(1));
      requireValue(active.empty, 'An invoice is processing. Try again shortly.');
      const stored = (await tx.get(ref)).data();
      if (!stored) return null;
      requireValue(!stored.disconnectUntil || stored.disconnectUntil < Date.now(), 'Disconnect is already in progress. Retry shortly.');
      tx.update(ref, { disconnectLease: token, disconnectUntil: Date.now() + 90000 });
      return stored;
    });
    if (connection) {
      try { await this.provider.disconnect(unseal(connection.credentials, this.key, company)); }
      catch { throw new AccountingError('unavailable', 'Unable to revoke Xero access. Wait two minutes, then try disconnecting again.'); }
    }
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const latest = (await tx.get(ref)).data();
      requireValue(!latest || latest.disconnectLease === token, 'Connection changed. Refresh before disconnecting.');
      tx.delete(ref);
      this.audit(tx, company, uid, 'disconnection');
    });
  }
  async credentials(company: string, generation: string) {
    const ref = this.db.doc(`${this.root(company)}/accountingPrivate/xero`);
    const token = randomUUID();
    const connection = await this.db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      requireValue(data && data.generation === generation, 'Connection changed. Ask your workspace owner to reconcile this request.');
      requireValue(!data.disconnectUntil, 'Xero is disconnecting. Reconnect before retrying invoices.');
      const value = unseal(data.credentials, this.key, company);
      if (this.provider.connectionStatus(value) === 'connected') return { value, refresh: false };
      requireValue(this.provider.refresh, 'Connection expired. Reconnect Xero demo mode, then retry this request.');
      requireValue(!data.refreshUntil || data.refreshUntil < Date.now(), 'Xero connection is refreshing. Retry shortly.');
      tx.update(ref, { refreshLease: token, refreshUntil: Date.now() + 90000 });
      return { value, refresh: true };
    });
    if (!connection.refresh) return connection.value;
    const refreshed = await this.provider.refresh!(connection.value);
    await this.db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      requireValue(data?.generation === generation && data?.refreshLease === token, 'Xero connection changed. Reconnect before retrying.');
      tx.update(ref, { credentials: seal(refreshed, this.key, company), refreshLease: null, refreshUntil: 0 });
    });
    return refreshed;
  }
  async preview(company: string, uid: string, jobId: string) {
    await this.authorise(company, uid);
    const job = (await this.db.doc(`${this.root(company)}/billingJobs/${id(jobId)}`).get()).data();
    requireValue(job?.status === 'completed' && job?.completionSynced === true, 'Only synchronised completed work can be invoiced.');
    const customer = (await this.db.doc(`${this.root(company)}/billingCustomers/${id(job.customerId)}`).get()).data();
    requireValue(customer && typeof customer.name === 'string' && customer.name.length <= 200, 'A billing customer is required.');
    const invoice = quote(job.lines);
    const fingerprint = digest({ customerId: job.customerId, customerName: customer.name, invoice });
    return { jobId, customerId: job.customerId as string, customerName: customer.name as string, invoice, fingerprint, approved: job.approval?.status === 'approved' && job.approval.fingerprint === fingerprint };
  }
  async approve(company: string, uid: string, jobId: string, fingerprint: string) {
    const preview = await this.preview(company, uid, jobId);
    requireValue(preview.fingerprint === fingerprint, 'The billing details changed. Review them again.');
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const ref = this.db.doc(`${this.root(company)}/billingJobs/${id(jobId)}`);
      const job = (await tx.get(ref)).data();
      const customer = (await tx.get(this.db.doc(`${this.root(company)}/billingCustomers/${preview.customerId}`))).data();
      const outbox = await tx.get(this.db.doc(`${this.root(company)}/accountingOutbox/${digest(jobId)}`));
      requireValue(!outbox.exists, 'This job already has an invoice request.');
      requireValue(job?.status === 'completed' && job.completionSynced === true && digest({ customerId: job.customerId, customerName: customer?.name, invoice: quote(job.lines) }) === fingerprint, 'The job changed. Review it again.');
      tx.update(ref, { approval: { status: 'approved', fingerprint, by: uid, at: Date.now() } });
      this.audit(tx, company, uid, 'work_approval', jobId);
    });
    return preview;
  }
  async enqueue(company: string, uid: string, jobId: string, fingerprint: string) {
    id(jobId);
    const ref = this.db.doc(`${this.root(company)}/accountingOutbox/${digest(jobId)}`);
    await this.db.runTransaction(async tx => {
      await this.authorise(company, uid, tx);
      const existing = await tx.get(ref);
      if (existing.exists) return; // One invoice per job, regardless of browser key.
      const job = (await tx.get(this.db.doc(`${this.root(company)}/billingJobs/${jobId}`))).data();
      requireValue(job?.status === 'completed' && job.completionSynced === true && job.approval?.status === 'approved', 'Completed work must be reviewed and approved first.');
      const customer = (await tx.get(this.db.doc(`${this.root(company)}/billingCustomers/${id(job.customerId)}`))).data();
      requireValue(customer && typeof customer.name === 'string');
      const invoice = quote(job.lines);
      const current = digest({ customerId: job.customerId, customerName: customer.name, invoice });
      requireValue(current === fingerprint && job.approval.fingerprint === current, 'The billing details changed. Review and approve them again.');
      const connection = (await tx.get(this.db.doc(`${this.root(company)}/accountingPrivate/xero`))).data();
      requireValue(connection && !connection.disconnectUntil, 'Connect Xero demo mode first.');
      tx.create(ref, { jobId, customerId: job.customerId, customerName: customer.name, invoice, fingerprint, key: digest([company, jobId]), generation: connection.generation, status: 'queued', attempts: 0, actorId: uid });
    });
    return { requestId: ref.id };
  }
  async process(company: string, requestId: string) {
    const ref = this.db.doc(`${this.root(company)}/accountingOutbox/${id(requestId)}`);
    const lease = randomUUID();
    const work = await this.db.runTransaction(async tx => {
      const record = (await tx.get(ref)).data();
      if (!record || record.status === 'succeeded' || (record.status === 'processing' && record.leaseUntil > Date.now())) return null;
      if (record.attempts >= 8) {
        tx.update(ref, { status: 'failed', error: 'Retry limit reached. Contact your workspace owner for reconciliation.' });
        this.audit(tx, company, record.actorId, 'failure', requestId);
        return null;
      }
      tx.update(ref, { status: 'processing', lease, leaseUntil: Date.now() + 60000, attempts: record.attempts + 1 });
      if (record.attempts) this.audit(tx, company, record.actorId, 'retry', requestId);
      return record;
    });
    if (!work) return;
    try {
      await this.authorise(company, work.actorId);
      const current = await this.preview(company, work.actorId, work.jobId);
      requireValue(current.approved && current.fingerprint === work.fingerprint, 'The work or billing approval changed. Ask your workspace owner to reconcile this request.');
      const credentials = await this.credentials(company, work.generation);
      const mapping = this.db.doc(`${this.root(company)}/accountingContacts/${work.customerId}`);
      const contact = (await mapping.get()).data();
      const contactId = contact && contact.generation === work.generation ? contact.contactId : await this.provider.syncContact(credentials, { id: work.customerId, name: work.customerName }, digest([company, work.customerId]));
      const result = await this.provider.createDraftInvoice(credentials, contactId, work.invoice as Quote, work.key);
      await this.db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        requireValue(latest?.lease === lease, 'Request is being recovered. Refresh its status.');
        tx.set(mapping, { provider: 'xero', contactId, generation: work.generation });
        tx.set(this.db.doc(`${this.root(company)}/accountingInvoices/${requestId}`), { ...result, provider: 'xero', mode: this.provider.authorisationUrl ? 'live' : 'mock', jobId: work.jobId, customerId: work.customerId, invoice: work.invoice, generation: work.generation });
        tx.update(ref, { status: 'succeeded', error: null, invoiceId: result.invoiceId, url: result.url });
        if (!contact || contact.generation !== work.generation) this.audit(tx, company, work.actorId, 'customer_mapping', work.customerId);
        this.audit(tx, company, work.actorId, 'invoice_creation', requestId);
      });
    } catch (error) {
      await this.db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        if (latest?.lease !== lease) return;
        tx.update(ref, { status: 'failed', error: error instanceof AccountingError ? error.message : 'Xero could not complete the request. Retry from the office portal.' });
        this.audit(tx, company, work.actorId, 'failure', requestId);
      });
    }
  }
}
