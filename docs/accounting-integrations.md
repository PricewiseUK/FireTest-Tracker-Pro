# Accounting integration implementation and release handoff

## Architecture inspected before implementation

The office portal is a standalone React/Vite application under `office-portal`.
It uses Firebase email/password Authentication, a development company ID and
local page state, rather than a router. Settings and the operational pages were
placeholders. The marketing website and Expo application are separate trees.

The existing workspace boundary is `companies/{companyId}` with memberships at
`members/{uid}`. Both company and membership must be active. Existing office
roles are `owner` and `office_admin`; engineers have no accounting access. An
office administrator additionally needs **trusted-provisioned**
`permissions.accounting: true`. Owners are implicitly authorised. Client writes
to membership remain prohibited. Company ID selection is never authorisation.

There was no deployed Functions configuration. `backend/catalogue` is existing
emulator-only trusted tooling and remains separate from the deployable accounting
entry point. Firebase configuration now declares a dedicated accounting codebase
with Node 22 Functions v2 in `europe-west2`. Nothing was deployed.

There is no implemented completed-job synchronisation pipeline, customer billing
model or office job review workflow in the repository. The existing submitted
inspection model must not be mistaken for explicit job completion. This change
introduces the billing handoff contract below; it does not invent completion
events or read engineers' local drafts.

## Current release mode

The office workflow runs in **mock/demo mode only**. `LIVE_XERO_ENABLED` is a
source-level `false` gate in `backend/accounting/index.ts`. `ACCOUNTING_MODE`
defaults to `mock`; any other value is rejected by the release factory. Supplying
credentials alone cannot enable live calls. Mock connections last one hour;
reconnecting preserves the workspace's deterministic demo tenant identity.
Mock invoice IDs and contacts are deterministic across cold starts and retries.
The displayed Xero URL contains a demo invoice ID and does not open a real invoice.

`AccountingProvider` defines the reusable boundary. `AccountingService` owns
authorisation, approval, integer money, mappings, queue and audit logic.
`XeroAccountingProvider` supplies the release mock. `XeroHttpAccountingProvider`
implements server-only OAuth exchange, connection revocation, refresh, contacts,
draft invoices, reconciliation and status retrieval using an injectable HTTP
transport. All HTTP tests inject mocks. QuickBooks and Sage are disabled cards;
future adapters implement the same interface.

The HTTP callback and webhook Functions are implemented but return 503 while the
live gate is disabled. No live Xero calls were made. This is a tested demo
implementation with a gated live adapter, **not approval to release real billing**.

## Workspace-scoped records and completion contract

All business collections below are under `companies/{companyId}`. Clients cannot
write any of them. Only accounting-authorised office users can read the billing,
mapping, configuration, audit and outbox collections. Encrypted credentials are
never client-readable, including to owners.

| Collection | Contract |
| --- | --- |
| `billingCustomers/{customerId}` | Trusted billing customer record; currently requires `name` (1–200 characters). No automatic email or address export. |
| `billingJobs/{jobId}` | Trusted explicit completed-work handoff: `status: "completed"`, `completionSynced: true`, `customerId`, optional `title`, and `lines`. Only a trusted completion pipeline may set these flags. |
| `accountingSettings/xero` | Office-configured `salesAccountCode` and `taxTypes` for standard, reduced, zero, exempt and outside treatments. No credentials. Live adapter validates active sales accounts and tax rates. |
| `accountingPrivate/xero` | Backend-only encrypted tokens and tenant/connection identity, generation and refresh/disconnection leases. |
| `accountingContacts/{customerId}` | Provider contact ID and tenant generation. |
| `accountingOutbox/{sha256(jobId)}` | One immutable confirmed invoice intent per job; snapshot, fingerprint, idempotency key, attempts, lease and sanitised status. |
| `accountingInvoices/{requestId}` | Job/customer mapping, returned invoice ID, URL, status and approved money snapshot. |
| `accountingAudit/{eventId}` | Connection, configuration, disconnection, work approval, customer mapping, invoice creation/status, retry and failure. No interaction or draft activity logs. |

A billing line has `{ description, quantity, unitPence, vat }`. Quantity is a
positive integer; fractional quantities, negative amounts and discounts are not
supported in this release. Monetary inputs and computed totals are integer pence.
Currency is GBP; prices exclude VAT. VAT is rounded half-up per line with integer
arithmetic: standard 20%, reduced 5%, zero/exempt/outside 0%. Treatment remains
distinct even when the rate is zero. Maximum invoice total is £100 million.
The HTTP adapter converts pence to the decimal external API boundary and verifies
the returned currency, contact, invoice number and total before accepting a result.
Tax treatment selection requires business review; this does not decide eligibility.

Office staff review the customer, line items, VAT and total, explicitly approve
the completed work, then separately confirm **Create draft invoice in Xero**.
Approval fingerprints the billing snapshot. Both enqueue and dispatch recheck
completion and approval; changed billing data invalidates approval. The queue
never automatically invoices an unapproved completed record.

**Upstream release dependency:** implement and review the trusted explicit job
completion-to-billing handoff before production. No endpoint in this change lets
an office client fabricate a completed job. Do not seed production fixtures or
infer completion from submitted inspections, local saves or draft progress.

## Security and retry behaviour

OAuth state is 256-bit random, stored only as a SHA-256 document ID, expires after
ten minutes and is transactionally claimed once before token exchange. The stored
Firebase UID and company are reauthorised at callback; the HTTP callback accepts
neither from browser parameters. A grant with multiple Xero organisations is
rejected instead of selecting the first. The private `accountingTenants` registry
prevents one Xero organisation being connected to different workspaces. Bindings
are retained on disconnect; transfers require a reviewed trusted procedure.

Credentials use AES-256-GCM with random IVs and authenticated context containing
the workspace and provider. Application secrets are Secret Manager bindings. Raw
provider responses and exceptions are never returned or logged. OAuth state,
tokens and webhook receipts have no client grants. Bearer tokens never reach
React, Expo, browser storage or public Firestore documents.

The Firestore outbox is created transactionally using a server-derived job key,
not a browser-generated key. A worker claims a lease; duplicate trigger deliveries
and repeated clicks converge on the same record. Scheduled recovery handles queued
or abandoned processing; failed records need explicit office retries. Eight attempts
is the limit; the terminal record requests owner reconciliation. Actor membership
is checked again before dispatch. Disconnect blocks active workers; enqueue cannot
use a disconnecting connection. Refresh tokens rotate under a workspace vault lease.

Xero retains idempotency keys for only six minutes. The HTTP adapter additionally
uses a stable unique sales `InvoiceNumber` (`IFP-` plus 48 key characters), looks it
up before creation and verifies the matching contact/GBP/total. ContactNumber is
also stable. Never delete/re-key failed queue records to retry an uncertain invoice.
Changed tenant mappings, inconsistent invoices or exhausted retries need owner
reconciliation rather than a second invoice. Live review must verify this recovery
against a Xero demo company, including timeouts after remote commits and duplicate
number errors. Do not edit/delete the integration's invoice numbers in Xero.

Webhooks verify HMAC-SHA256 over the exact raw body with constant-time comparison.
Tenant bindings and known invoice mappings select the workspace; payloads cannot
provide an arbitrary company path. Status is fetched from Xero, not trusted from
the event body. Receipts and unchanged-status checks make replays harmless.

## Configuration to provide

For local mock Functions, provide `ACCOUNTING_ENCRYPTION_KEY` in ignored
`backend/.secret.local`: a base64-encoded cryptographically random **32-byte** key.
For a future deployment, store it through Firebase's Secret Manager-backed
`functions:secrets:set ACCOUNTING_ENCRYPTION_KEY` flow. Do not commit secret values.
Key rotation needs a reviewed decrypt/re-encrypt migration or reconnection plan;
replacing the key alone makes existing credentials unreadable.

Non-secret backend environment configuration:

| Name | Value |
| --- | --- |
| `ACCOUNTING_MODE` | `mock` for this release. |
| `XERO_CLIENT_ID` | Developer-console app client ID; only needed after live review. |
| `XERO_REDIRECT_URI` | Exact HTTPS URL of the `xeroOAuthCallback` Function registered in Xero. |
| `ACCOUNTING_OFFICE_ORIGIN` | Exact trusted HTTPS office origin, without path or trailing slash. Used only for the callback redirect. |

Later Secret Manager values: `XERO_CLIENT_SECRET` and `XERO_WEBHOOK_SECRET`.
These bindings are deliberately not required for mock deployment.
There are no `VITE_` secrets. `VITE_COMPANY_ID` optionally replaces the portal's
existing development company selection; each selected company still requires
backend authorisation. `VITE_FIREBASE_EMULATORS=true` switches all web Firebase
services to local endpoints and forces project `demo-instafire-accounting`.

For a manual local walkthrough, first run `npm --prefix backend run build`, then
start Auth, Firestore, Storage and Functions using `firebase.emulators.json` and
the `demo-instafire-accounting` project. Supply only synthetic emulator members,
customers and explicitly completed billing job fixtures. Vite must have the two
office `VITE_` values above configured. Local scheduled Functions do not run on a
real Cloud Scheduler; use the created-event worker or explicit Retry. Never point
the manual demo at the production project.

## Xero console and release work still required

1. Supply developer credentials and create an OAuth2 Web/Auth Code application.
   Register the exact callback Function URL. Request `accounting.contacts`,
   `accounting.invoices`, `accounting.settings.read` and `offline_access`.
   Confirm the current granular scope grants in that application's console.
2. Use a UK GBP Xero demo organisation; connect exactly one organisation. Obtain
   its sales account and tax codes, and review zero/exempt/outside semantics.
3. Register the `xeroWebhook` HTTPS Function for invoice events; provide its signing
   secret and pass Xero's intent-to-receive verification after live enablement.
4. Review the data model, rules, completion handoff, token rotation/revocation,
   webhook lifecycle and ambiguous-write reconciliation. Exercise the live adapter
   against the demo company before approving real customer data or real invoices.
   Production invoice numbering and account/tax mappings require sign-off.
5. Authorise deployment separately. Enable required Functions/Scheduler/Secret
   Manager services, least-privilege secret access, and deploy the reviewed rules,
   indexes, accounting Functions and office build. Keep marketing/Expo releases
   separate. Changing the source-level live gate is a separate reviewed release.

## Validation

`npm run test:security` builds accounting first and runs isolated demo projects.
Accounting tests exercise the service against the Firestore emulator and real
Security Rules, including tenant/role boundaries, OAuth state, encryption, expiry,
approval changes, concurrent duplication, lost responses, recovery, configuration,
audit and mocked HTTP OAuth/invoice operations. They do not invoke deployed
Functions, Google Secret Manager or real Xero. Existing inspection and catalogue
security suites still run. A real Functions emulator/browser walkthrough and a
Xero-console handshake remain release checks; passing service tests alone does
not establish live readiness.

Commands: `npm run typecheck`, `npm run lint`, `npm run test:unit`,
`npm run test:security`, `npm --prefix backend run build`,
`npm --prefix office-portal run lint`, `npm --prefix office-portal run build`.

Validation completed on 8 November 2026:

- Root/mobile and backend TypeScript checks passed.
- Existing unit tests: **207 passed**.
- Firebase security suites: **134 passed** (15 accounting, 78 inspection,
  41 catalogue); the full runner exited 0. These include Firestore and existing
  Storage isolation coverage. The emulator emitted a Java rules-runtime
  `NullPointerException` during shutdown after successful suites; no test failed.
- Root Expo lint passed with two existing unused-variable warnings in
  `LoginScreen.js` and `SettingsScreen.js`. Office lint passed with two existing
  render-time Date warnings in `App.jsx`.
- Accounting Functions compilation and office Vite production build passed.
  Compiled Functions entry-point import exposes all five expected functions.
  Vite still warns about the approximately 808 kB main bundle; the accounting
  page is loaded separately (approximately 14 kB).
- Office and backend dependency installation audits report **zero vulnerabilities**
  after the documented transitive dependency overrides.
- Checks used the installed **Node 24.18.0**; the configured deployment runtime is
  Node 22. A Node 22 Functions emulator/runtime smoke test remains a release check.
- No browser walkthrough, deployment, production migration, real Secret Manager
  access or live Xero request was performed.

Primary references consulted:
[Xero OAuth](https://developer.xero.com/documentation/guides/oauth2/auth-flow/),
[scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/),
[idempotency](https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/),
[invoices](https://developer.xero.com/documentation/api/accounting/invoices),
[webhooks](https://developer.xero.com/documentation/guides/webhooks/overview),
[Firebase secrets](https://firebase.google.com/docs/functions/config-env).

## Files changed by this implementation

Existing unrelated working-tree changes were preserved. The marketing website
and engineer application were not edited by this implementation.

| File | Change |
| --- | --- |
| `.gitignore` | Ignore backend build output, local secrets/environment and local npm cache. |
| `firebase.json` | Dedicated deployable accounting Functions codebase. |
| `firebase.emulators.json` | Local accounting Functions configuration. |
| `firestore.rules` | Accounting permissions and explicit client write/credential denial. |
| `firestore.indexes.json` | Collection-group status index for outbox recovery. |
| `backend/package.json` | Functions dependency, Node runtime, build commands and patched transitive overrides. |
| `backend/package-lock.json` | Reproducible backend dependencies. |
| `backend/tsconfig.json` | Include accounting in existing type checking. |
| `backend/tsconfig.functions.json` | Separate deployable Functions compilation. |
| `backend/accounting/provider.ts` | Provider interface, money, encryption, errors and mock Xero provider. |
| `backend/accounting/xeroHttp.ts` | Gated server-side Xero HTTP implementation with injectable transport. |
| `backend/accounting/service.ts` | Workspace permissions, connection lifecycle, approval, queue, mappings and audit. |
| `backend/accounting/index.ts` | Authenticated callable, callback, webhook, trigger and scheduled recovery Functions. |
| `office-portal/package.json` | Explicit Firebase web dependency and patched gRPC override. |
| `office-portal/package-lock.json` | Reproducible office dependencies. |
| `office-portal/src/App.jsx` | Settings page, accounting permission, configurable workspace and lazy loading. |
| `office-portal/src/firebaseConfig.js` | Optional isolated demo emulator connections. |
| `office-portal/src/pages/AccountingIntegrations.jsx` | Office provider settings, approval, confirmation and sync workflow. |
| `office-portal/src/pages/AccountingIntegrations.css` | Responsive accounting page styles. |
| `tests/firebase/accounting.rules.test.mjs` | Accounting Security Rules, emulator service and mocked HTTP tests. |
| `tests/firebase/run-emulators.mjs` | Build accounting and include the isolated accounting suite. |
| `docs/accounting-integrations.md` | Architecture, contracts, configuration, release limitations and file manifest. |
