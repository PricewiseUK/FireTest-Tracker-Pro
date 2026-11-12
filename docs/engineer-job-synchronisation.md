# Engineer job synchronisation v1

Local implementation only. No Functions, rules, indexes or Hosting were deployed.
The Office Inspections interface is intentionally not implemented. This supersedes
the missing job boundary identified in the earlier jobs/day-approval proposal;
it does not implement daily submission, approval, certification or invoicing.

## Canonical Firestore contract

Jobs live at **`companies/{companyId}/jobs/{jobId}`**. Only trusted scheduling
administration may provision jobs; this release adds no client scheduling writer.
The shared pure TypeScript contract is `backend/shared/jobContract.ts`, imported
by mobile and backend without Admin dependencies entering the mobile bundle.

`JobV1` contains:

| Field | Definition |
| --- | --- |
| `schemaVersion` | `1` |
| `companyId`, `siteId` | Exact company and existing site document IDs |
| `customer`, `site` | Required `{ name, reference }` snapshots from trusted scheduling |
| `inspectionType` | `extinguisher-monthly-visual` or `extinguisher-annual-basic` |
| `assignedEngineerUid` | Firebase Auth UID with an active engineer/senior-engineer membership |
| `scheduledStart`, `scheduledEnd` | UTC integer epoch milliseconds, end not before start |
| `workStatus` | `scheduled`, `in_progress`, `completed` |
| `reviewStatus` | `not_submitted`, `submitted`, `approved`, `changes_requested` |
| `assets` | Ordered, unique planned `{ assetDocId, templateId, templateVersion }` entries, 1–25 |
| `inspectionRef` | `null` until the atomic completion commit; immutable result document path thereafter |
| `completionSummary` | `null` until the atomic completion commit; finished summary thereafter |
| `revision` | Positive integer, incremented by each accepted work transition |
| `createdAt`, `updatedAt`, `startedAt`, `completedAt` | UTC integer epoch milliseconds; start/completion initially `null` |

Event timestamps are produced by the trusted backend, never supplied by a device.
No per-question times, draft-save times, device activity or movement information
are transported. Cached assignments contain no extra last-active metadata.

Detailed results remain under the existing path:

**`companies/{companyId}/sites/{siteId}/extinguisherInspections/job_{jobId}_{completionId}`**

New completed records use `schemaVersion: 2` and `status: "completed"`. This is a
bounded multi-asset completed result, not a server draft. It contains job/completion
IDs, engineer UID/display-name snapshot, customer/site snapshots, inspection type,
all completed assets and answers, defects, corrective actions, engineer notes,
trusted asset and template snapshots, totals and server completion/creation times.
Question definitions are copied from trusted templates so later catalogue/site
changes cannot rewrite the historical result. `reportStatus` is `not_generated`
and `certificateStatus` is `not_issued`; no certification is implied.

The pre-existing schema-v1 draft/submitted inspection contract and its legacy
query/immutability protections remain supported. A new completed schema-v2 record
does **not** use legacy `status: submitted`, and completion never writes a job
submission or approval timestamp.

Ancillary immutable records under the canonical job:

- `completions/{completionId}`: schema-v1 synchronisation receipt, payload SHA-256,
  company/site/job/completion IDs, engineer UID, result reference, resulting job
  revision, completion time and totals. The idempotency identity is scoped to the
  company and job. A job can have only one accepted completion.
- `events/started`: at most one explicit start audit event.
- `events/completed`: one explicit completion audit event with actor, completion
  ID, result reference and server time. No interactions or draft activity logs.

## Callable and atomicity

`engineerJobs` is a Firebase v2 callable in `europe-west2`:

```js
{ action: "start", companyId, jobId, expectedRevision, engineerUid }
{ action: "complete", completion: CompletionRequest }
```

The callable requires Firebase Authentication. The service revalidates active
workspace/membership, engineer role, exact current assignment, senior-engineer site
access, active site, request/job company and site, supported type, revision and
allowed state transition. Owners/office administrators cannot create engineering
results by invoking it.

Explicit transitions are `scheduled → in_progress`, `scheduled → completed`, or
`in_progress → completed`. Direct scheduled completion supports work finished
offline without pretending that a Start event was previously acknowledged.
Repeated starts are harmless. Delayed Start requests cannot regress Completed.
Unfinished jobs must have review `not_submitted` and no completion reference.
There are no submission/approval operations in this release: those review values
are reserved for a separate intentional workflow.

Both start and completion payloads bind the initiating `engineerUid` to the
Firebase-authenticated UID. This prevents an SDK token-fetch race during account
switching from submitting a previous engineer's frozen work under a new account,
even if a job was concurrently reassigned. Display names still come only from
trusted membership records; a client-supplied UID is never itself authorisation.

The completion must contain every planned asset, in the planned order, with its
exact pinned template/version. Assets must exist in the assigned site's approved
extinguisher collection. Templates must be trusted, approved, matching the asset
equipment type and scheduled service. The saved asset snapshot must match its
approved reference/type/location at commit;
changed details block publication and retain the frozen local package for explicit
reconciliation. Every expected question must have exactly
one ordered PASS/FAIL/N/A result; FAIL needs a nonblank reason. N/A is accepted only
where the trusted template permits it; an N/A reason is not required by this new
contract. Explicit defects require descriptions and recognised states.

The backend recomputes and validates totals. `totalAssets` counts assets;
`pass`, `fail`, `na` count **check outcomes**, not asset grades; `defectCount`
counts explicit defect records. Failed-check counts and defect counts are distinct.
Limits are 25 assets, 64 checks per asset, 512 checks in total, 30 defects per asset,
200,000 canonical request characters and 900,000 UTF-8 bytes for the completed
result including trusted snapshots. Oversized packages are rejected intact,
never truncated or partially published.

A **single Firestore transaction** creates the result, updates the job and its
summary, creates the receipt and creates the completion audit. No office-visible
partial completion is possible. The summary includes engineer UID/name, customer
and site snapshots, inspection type, server completion time, total assets,
PASS/FAIL/N/A totals, defect count and result reference. The job's review remains
**`not_submitted`**. A lost response can be recovered using the same completion ID.
The service returns the existing receipt before applying revision checks; the
caller must still have active assignment/site access. A changed payload under
the same ID or any second completion ID for a completed job is rejected.

## Mobile durability and explicit confirmation

The existing Testing tab now contains a small assigned-job/completion panel.
Existing tabs/navigation are reused; no navigation system or office page was added.
It shows at most 100 assigned jobs, with manual refresh. Engineers record/resume
checks in the existing extinguisher register, select saved inspections explicitly
for each planned asset, review totals and confirm completion. No newest-draft
guessing occurs. Assignment snapshots are cached per project/user/company for
offline use and labelled as cached; backend assignment/revision validation is
always authoritative.

On confirmation, `localJobCompletionOutbox` generates one stable local completion
ID and stores two identical immutable intent copies before transmission:

`@instafire/job-completions/v1/{projectId}/{uid}/{companyId}/{jobId}/intent-{0,1}`

Receipts use sibling `receipt-{0,1}` keys. Intent disagreement, malformed content
or invalid receipts fail closed and preserve all copies. A missing second intent
copy after a partial write can be reconstructed from the first valid immutable
copy, retaining the same ID. Failed acknowledgements/receipt saves retry the same
operation, rather than generating another inspection. Conflicting or corrupted
copies require administrator recovery; no automatic destructive repair is supplied.

The local job shows **Completed / Pending Sync** until a validated receipt is
durably saved. Server state remains its last committed value while offline. A
receipt makes the local operation Synced. Local completion/receipt notifications
refresh the panel; no per-question listener or activity stream exists.

Foreground recovery checks only this explicit completion queue, retrying with
20-second to five-minute backoff and on app foregrounding. An empty queue makes
no server call. No background execution/closed-app synchronisation is promised;
pending work resumes when the app is active again. Manual retry is also available.
Every storage/network boundary checks the captured auth session. Source drafts,
recovery archives and all original photographs remain untouched. Signing out or
switching company/user cannot attach another engineer's pending work or receipt.

The current built-in monthly/annual candidates remain **pending technical
validation**, and no approved production templates are invented. Completion is
blocked unless a saved draft and the scheduled trusted template are both approved
and match. The adapter excludes local audit/save/recovery metadata. Photographs and
all evidence fields are unsupported; drafts containing evidence are blocked with
a clear message, not silently stripped. Existing proposal evidence is never read
or reused. Server rules continue to deny inspection attachment writes.

## Rules, queries and packaging

Job writes, receipts, new completed results and audits are backend-only. Active
office owners/admins may read their company's jobs, completions and meaningful
events. Engineers may query only their assignments; senior engineers must also
constrain assigned sites. Company and UID query filters are explicit, and the
required equality/site indexes are declared locally. Completed results are
read-only for every client role. New office result access requires the canonical
completed job to reference that exact result. Existing own-inspection access and
legacy submitted-result queries are preserved; cross-company access stays denied.

The existing Firebase codebase identifier `accounting` is retained to avoid an
unrequested deployed-codebase migration. Its source is still `backend`. The build
now emits the shared backend entry point at `backend/lib/index.js`, accounting
under `lib/accounting`, and jobs under `lib/jobs`; accounting tests were adjusted
only for these import locations. The accounting operations and live-Xero gate
are unchanged. Job completion does not populate billing jobs or create invoices.

## Synthetic emulator fixtures

`tests/fixtures/engineerJobs.mjs` supplies synthetic company/site/customer snapshots,
engineer/office memberships, approved synthetic templates with no real servicing
guidance, assets and scheduled jobs. A second company supplies denial cases.
Production components import none of these fixtures.

For an explicit local fixture reset, start the existing emulator configuration
using project **`demo-instafire-jobs`** with Auth, Firestore and Storage. Then set
these process variables and run `node tests/firebase/seed-engineer-jobs.mjs`:

```text
GCLOUD_PROJECT=demo-instafire-jobs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

The script refuses absent, remote or production endpoints. It creates local Auth
users `engineer-alpha@example.test` and `office-alpha@example.test`, with the
synthetic-only password in the fixture script, and resets only demo fixture
documents. It never reads application-default credentials or production data.
Actual engineer app endpoint selection remains its existing configuration; the
service/outbox tests use explicit local transports rather than changing real
mobile credentials. No native-device walkthrough is claimed.

## Files changed

- `App.js`: mount the engineer job control in Testing; scoped foreground retries.
- `backend/index.ts`: shared Functions entry point.
- `backend/shared/jobContract.ts`: shared versioned types/validation/transitions.
- `backend/jobs/service.ts`: authorised atomic start/completion and idempotency.
- `backend/jobs/functions.ts`: authenticated callable and sanitised errors.
- `backend/tsconfig.json`, `backend/tsconfig.functions.json`: include new modules
  and preserve a single backend build entry point.
- `src/services/localJobCompletionOutbox.ts`: immutable local queue, receipts,
  assignment cache, auth isolation and notifications.
- `src/services/jobSynchronisation.ts`: Firebase client adapter and retry lifecycle.
- `src/modules/Extinguishers/jobCompletionDraft.ts`: approved draft-to-completion adapter.
- `src/modules/Jobs/EngineerJobPanel.tsx`: explicit engineer completion controls.
- `tsconfig.json`: include the shared contract and engineer panel.
- `firestore.rules`: canonical jobs/receipt/event permissions and completed results.
- `firestore.indexes.json`: assigned-job equality/site queries.
- `tests/fixtures/engineerJobs.mjs`: synthetic fixture definitions.
- `tests/firebase/seed-engineer-jobs.mjs`: guarded local fixture seeder.
- `tests/inspections/jobCompletion.test.mjs`: validation/outbox/receipt unit tests.
- `tests/firebase/jobs.rules.test.mjs`: job backend and Rules emulator coverage.
- `tests/firebase/run-emulators.mjs`: include the isolated job suite.
- `tests/firebase/accounting.rules.test.mjs`: compiled-module import paths only.
- `docs/engineer-job-synchronisation.md`: this contract and handoff.

No environment files, application credentials, marketing sources, office source
components or native project directories were modified. Existing local draft
services were not edited. Earlier inspection, catalogue and accounting tests
remain part of the validation run.

## Final verification — 8 November 2026

Resumed the existing working tree and checked Git status, the prior test sessions
and Windows test/emulator processes before running verification. No matching
old test, Android-export or demo Firestore processes remained. No implementation
restart or further functional code changes were required during this resume.

The final engineer-session fix is present at every relevant boundary: Start and
Complete bind the captured engineer UID to Firebase Authentication; the local
outbox binds intents and receipts to project, company, job and engineer; session
epochs guard asynchronous storage and acknowledgement handling. Regression tests
cover an account switch combined with job reassignment, foreign payload preparation,
foreign receipt rejection and lost-response recovery using the same completion ID.

Fresh verification results:

| Check | Result |
| --- | --- |
| `npm run test:unit` | **222 passed**: all 207 existing tests plus 15 job-contract/outbox tests |
| `npm run test:security` | **151 passed**: 17 job, 15 accounting, 78 inspection and 41 catalogue tests |
| `npm run typecheck` | Passed for engineer/shared code and backend |
| `npm run lint` | Passed; two pre-existing unused-variable warnings |
| `npm --prefix office-portal run lint` | Passed; two pre-existing Date/purity warnings |
| `npm --prefix backend run build` | Passed; shared entry point exports the original five accounting Functions and `engineerJobs` |
| `npm --prefix office-portal run build` | Passed; existing approximately 808 kB main-bundle warning |
| `expo export --platform android --output-dir .firebase/job-sync-android-build` | Passed: Hermes bundle, 817 modules and 27 assets |

The Android export recovered automatically from an unreadable Metro build cache
by performing a full crawl. This concerned the development build cache, not
inspection drafts, outbox recovery copies or device evidence. The Firebase
emulators emitted the previously observed Java rules-runtime shutdown exception
after successful suites; the test assertions passed. Node's existing module-type
and terminal-colour warnings also remain. Checks used installed Node 24.18.0;
the configured Functions deployment runtime remains Node 22.

Compared the earlier protected-file hash snapshot: 52 files remain unchanged and
the seven changed protected files are precisely the expected integration edits
(`App.js`, both backend TypeScript configurations, Firestore rules/indexes, the
accounting test import paths and the emulator runner). The 21-file feature manifest
above distinguishes this work from unrelated pre-existing working-tree changes.

Only local synthetic emulator data and ignored build/test output were used.
No Hosting, Functions, Firestore rules, Storage rules or indexes were deployed.
The Office Inspections interface, existing draft/recovery implementation,
environment files and application credentials remain untouched. No physical-device
walkthrough or deployed HTTP-callable test is claimed; callable-handler tests use
an Auth-emulator-verified identity and the real Firestore emulator. Pending technical
checklists remain blocked, and approved matching definitions are still required.
