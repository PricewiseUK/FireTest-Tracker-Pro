import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type Line = { description: string; quantity: number; unitPence: number; vat: 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside' };
export type Quote = { currency: 'GBP'; lines: Line[]; netPence: number; vatPence: number; totalPence: number };
export type Credentials = { accessToken: string; refreshToken: string; expiresAt: number; tenantId: string; connectionId: string };
export class AccountingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function requireValue(ok: unknown, message = 'The accounting request is invalid.'): asserts ok {
  if (!ok) throw new AccountingError('failed-precondition', message);
}
export function id(value: unknown): string {
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)); return value;
}
export function quote(lines: Line[]): Quote {
  requireValue(Array.isArray(lines) && lines.length > 0 && lines.length <= 100);
  let netPence = 0, vatPence = 0;
  const rates = { standard: 2000, reduced: 500, zero: 0, exempt: 0, outside: 0 };
  for (const line of lines) {
    requireValue(typeof line.description === 'string' && line.description.trim().length > 0 && line.description.length <= 500);
    requireValue(Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 10000);
    requireValue(Number.isSafeInteger(line.unitPence) && line.unitPence >= 0 && line.unitPence <= 100000000);
    requireValue(Object.hasOwn(rates, line.vat));
    const net = line.quantity * line.unitPence;
    netPence += net;
    vatPence += Number((BigInt(net) * BigInt(rates[line.vat]) + 5000n) / 10000n);
  }
  requireValue(Number.isSafeInteger(netPence + vatPence) && netPence + vatPence <= 10000000000);
  return { currency: 'GBP', lines, netPence, vatPence, totalPence: netPence + vatPence };
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function seal(value: Credentials, key: string, workspace: string): string {
  const bytes = Buffer.from(key, 'base64'); requireValue(bytes.length === 32, 'Credential encryption is not configured.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', bytes, iv);
  cipher.setAAD(Buffer.from(`accounting:v1:${workspace}:xero`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(b => b.toString('base64')).join('.');
}
export function unseal(value: string, key: string, workspace: string): Credentials {
  const [iv, tag, body] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  cipher.setAAD(Buffer.from(`accounting:v1:${workspace}:xero`)); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString());
}
export type InvoiceResult = { invoiceId: string; url: string; status: string };
export type AccountingSettings = { salesAccountCode: string; taxTypes: Record<Line['vat'], string> };
export interface AccountingProvider {
  validateSettings?(credentials: Credentials, settings: AccountingSettings): Promise<void>;
  authorisationUrl?(state: string): string;
  refresh?(credentials: Credentials): Promise<Credentials>;
  connectionStatus(credentials: Credentials): 'connected' | 'expired';
  connect(code: string): Promise<Credentials>;
  disconnect(credentials: Credentials): Promise<void>;
  syncContact(credentials: Credentials, customer: { id: string; name: string }, key: string): Promise<string>;
  createDraftInvoice(credentials: Credentials, contactId: string, invoice: Quote, key: string): Promise<InvoiceResult>;
  retrieveInvoiceStatus(credentials: Credentials, invoiceId: string): Promise<string>;
  handleVerifiedWebhook(raw: Buffer, signature: string, key: string): { tenantId: string; resourceId: string }[];
}
/** This release intentionally has no network transport. Mock IDs are deterministic
 * across retries, cold starts and lost responses. Live enablement requires review. */
export class XeroAccountingProvider implements AccountingProvider {
  readonly mode = 'mock';
  constructor(mode = 'mock') { requireValue(mode === 'mock', 'Live Xero access is disabled in this release.'); }
  connectionStatus(c: Credentials) { return c.expiresAt > Date.now() ? 'connected' as const : 'expired' as const; }
  async connect(code: string) {
    requireValue(code === 'demo', 'Xero demo authorisation was not completed.');
    return { accessToken: randomBytes(32).toString('hex'), refreshToken: randomBytes(32).toString('hex'), expiresAt: Date.now() + 3600000, tenantId: 'demo', connectionId: 'demo' };
  }
  async disconnect(_c: Credentials) {}
  async syncContact(_c: Credentials, customer: { id: string; name: string }, key: string) { return `demo-contact-${digest([customer.id, key]).slice(0, 24)}`; }
  async createDraftInvoice(_c: Credentials, _contact: string, _quote: Quote, key: string) {
    const invoiceId = `demo-${digest(key).slice(0, 32)}`;
    return { invoiceId, url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`, status: 'DRAFT' };
  }
  async retrieveInvoiceStatus(_c: Credentials, _invoice: string) { return 'DRAFT'; }
  handleVerifiedWebhook(raw: Buffer, signature: string, key: string) {
    const expected = createHmac('sha256', key).update(raw).digest();
    const supplied = Buffer.from(signature, 'base64');
    requireValue(expected.length === supplied.length && timingSafeEqual(expected, supplied), 'Invalid webhook signature.');
    const body = JSON.parse(raw.toString());
    requireValue(Array.isArray(body.events) && body.events.length <= 100);
    return body.events.filter((e: { eventCategory: string }) => e.eventCategory === 'INVOICE').map((e: { tenantId: string; resourceId: string }) => ({ tenantId: e.tenantId, resourceId: e.resourceId }));
  }
}
