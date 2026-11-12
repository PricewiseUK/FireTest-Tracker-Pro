import { Buffer } from 'node:buffer';
import { AccountingError, requireValue, XeroAccountingProvider, type AccountingProvider, type AccountingSettings, type Credentials, type InvoiceResult, type Quote } from './provider.js';

export type XeroConfig = { clientId: string; clientSecret: string; redirectUri: string; fetch: typeof fetch; settings?: AccountingSettings };
/** Server-only live transport, deliberately NOT wired into the release factory.
 * Tests inject an HTTP mock; no import or constructor performs network I/O. */
export class XeroHttpAccountingProvider implements AccountingProvider {
  constructor(private config: XeroConfig) {}
  connectionStatus(c: Credentials) { return c.expiresAt > Date.now() + 60000 ? 'connected' as const : 'expired' as const; }
  authorisationUrl(state: string) {
    return `https://login.xero.com/identity/connect/authorize?${new URLSearchParams({ response_type: 'code', client_id: this.config.clientId, redirect_uri: this.config.redirectUri, scope: 'accounting.contacts accounting.invoices accounting.settings.read offline_access', state })}`;
  }
  private async token(form: Record<string, string>) {
    const response = await this.config.fetch('https://identity.xero.com/connect/token', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new AccountingError('failed-precondition', 'Xero authorisation expired. Reconnect from Accounting Integrations.');
    const data = await response.json();
    requireValue(typeof data.access_token === 'string' && typeof data.refresh_token === 'string' && Number.isInteger(data.expires_in));
    return { accessToken: data.access_token as string, refreshToken: data.refresh_token as string, expiresAt: Date.now() + data.expires_in * 1000 };
  }
  async connect(code: string): Promise<Credentials> {
    const tokens = await this.token({ grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri });
    const response = await this.config.fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${tokens.accessToken}` }, signal: AbortSignal.timeout(20000) });
    requireValue(response.ok, 'Unable to confirm the Xero organisation. Reconnect.');
    const connections = await response.json();
    // Never silently choose the first organisation from a multi-tenant grant.
    requireValue(Array.isArray(connections) && connections.length === 1 && typeof connections[0].tenantId === 'string' && typeof connections[0].id === 'string', 'Connect exactly one Xero organisation to this workspace.');
    return { ...tokens, tenantId: connections[0].tenantId, connectionId: connections[0].id };
  }
  async refresh(c: Credentials): Promise<Credentials> {
    return { ...c, ...await this.token({ grant_type: 'refresh_token', refresh_token: c.refreshToken }) };
  }
  async disconnect(c: Credentials) {
    const response = await this.config.fetch(`https://api.xero.com/connections/${encodeURIComponent(c.connectionId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(20000) });
    requireValue(response.ok || response.status === 404, 'Unable to revoke Xero access. Reconnect and try disconnecting again.');
  }
  private async request(c: Credentials, path: string, method = 'GET', body?: unknown, key?: string) {
    const response = await this.config.fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
      method, headers: { Authorization: `Bearer ${c.accessToken}`, 'Xero-tenant-id': c.tenantId, Accept: 'application/json', 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) throw new AccountingError('failed-precondition', 'Xero access expired. Reconnect your organisation.');
    if (response.status === 429) throw new AccountingError('resource-exhausted', 'Xero is busy. Wait a few minutes and retry the same request.');
    requireValue(response.ok, 'Xero could not save this draft. Check account and VAT configuration, then retry.');
    return response.json();
  }
  async syncContact(c: Credentials, customer: { id: string; name: string }, key: string) {
    const number = `IFP-${key.slice(0, 48)}`;
    const found = await this.request(c, `Contacts?${new URLSearchParams({ where: `ContactNumber=="${number}"` })}`);
    if (found.Contacts?.length === 1) return found.Contacts[0].ContactID as string;
    requireValue(found.Contacts?.length === 0, 'Customer mapping needs owner review.');
    const result = await this.request(c, 'Contacts', 'PUT', { Contacts: [{ Name: customer.name, ContactNumber: number }] }, key);
    requireValue(result.Contacts?.length === 1 && typeof result.Contacts[0].ContactID === 'string');
    return result.Contacts[0].ContactID as string;
  }
  async validateSettings(c: Credentials, settings: AccountingSettings) {
    const accounts = await this.request(c, 'Accounts');
    const taxes = await this.request(c, 'TaxRates');
    requireValue(accounts.Accounts?.some((a: { Code: string; Status: string; Type: string }) => a.Code === settings.salesAccountCode && a.Status === 'ACTIVE' && ['REVENUE', 'SALES'].includes(a.Type)), 'Select an active Xero sales account.');
    const expected = { standard: 20, reduced: 5, zero: 0, exempt: 0, outside: 0 };
    for (const [treatment, code] of Object.entries(settings.taxTypes)) {
      requireValue(taxes.TaxRates?.some((t: { TaxType: string; Status: string; EffectiveRate: number; CanApplyToRevenue: boolean }) => t.TaxType === code && t.Status === 'ACTIVE' && t.CanApplyToRevenue === true && t.EffectiveRate === expected[treatment as keyof typeof expected]), 'Select an active sales VAT code with the correct rate for each treatment.');
    }
  }
  async createDraftInvoice(c: Credentials, contactId: string, invoice: Quote, key: string): Promise<InvoiceResult> {
    // Xero's six-minute idempotency window is insufficient for durable recovery.
    // A unique deterministic sales InvoiceNumber also prevents later duplicates.
    const number = `IFP-${key.slice(0, 48)}`;
    const existing = await this.request(c, `Invoices?${new URLSearchParams({ where: `InvoiceNumber=="${number}"` })}`);
    requireValue(Array.isArray(existing.Invoices) && existing.Invoices.length <= 1, 'Invoice mapping needs owner reconciliation.');
    const settings = this.config.settings;
    requireValue(settings, 'Configure the Xero sales account and VAT codes before invoicing.');
    const taxes = settings.taxTypes;
    const result = existing.Invoices.length ? existing : await this.request(c, 'Invoices', 'PUT', { Invoices: [{
      Type: 'ACCREC', Status: 'DRAFT', CurrencyCode: 'GBP', LineAmountTypes: 'Exclusive', Contact: { ContactID: contactId }, InvoiceNumber: number,
      LineItems: invoice.lines.map(line => ({ Description: line.description, Quantity: line.quantity, UnitAmount: line.unitPence / 100, TaxType: taxes[line.vat], AccountCode: settings.salesAccountCode })),
    }] }, key);
    const saved = result.Invoices?.[0];
    requireValue(result.Invoices?.length === 1 && typeof saved?.InvoiceID === 'string' && saved.InvoiceNumber === number && saved.Contact?.ContactID === contactId && saved.CurrencyCode === 'GBP' && Math.round(saved.Total * 100) === invoice.totalPence && ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID'].includes(saved.Status), 'Xero invoice needs reconciliation. Do not create another invoice.');
    return { invoiceId: saved.InvoiceID, status: saved.Status, url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(saved.InvoiceID)}` };
  }
  async retrieveInvoiceStatus(c: Credentials, invoiceId: string) {
    const result = await this.request(c, `Invoices/${encodeURIComponent(invoiceId)}`);
    requireValue(result.Invoices?.length === 1 && result.Invoices[0].InvoiceID === invoiceId);
    return String(result.Invoices[0].Status);
  }
  handleVerifiedWebhook(raw: Buffer, signature: string, key: string) { return new XeroAccountingProvider().handleVerifiedWebhook(raw, signature, key); }
}
