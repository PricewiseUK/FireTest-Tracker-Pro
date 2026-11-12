# Stages 2 and 3: inspection findings and proposal only

No job statuses, day submissions, approval records, rules or office features are
implemented by this stage. Review this proposal before any such implementation.

The standing [no employee tracking principle](no-employee-tracking.md) governs
this proposal and all future extensions. Office access to finished records does
not authorise employee activity monitoring or productivity scoring.

The [global catalogue and tenant isolation requirement](global-catalogue-and-tenant-isolation.md)
also governs job references, completion records, files, queues, backend operations
and office review. Shared equipment definitions never grant cross-company access.

## What the repository actually contains

Inspected the mobile screens/services, office-portal source, packaged rule/config
copies, active Firestore rules/index configuration and existing inspection contracts.

- `office-portal/src/App.jsx` authenticates office members through
  `companies/{companyId}/members/{uid}`, accepting owner and office_admin.
  Apart from Dashboard, its pages render an under-development placeholder. There
  is no scheduling page, job query/write service, job assignment schema or daily
  approval implementation in this checkout.
- `office-portal/src/pages/Dashboard.jsx` lists asset approval, buildings,
  engineers, inspections, reports and imports; it does not contain scheduling.
- `App.js` has a Start Testing card described as scheduled tests, but Testing and
  History currently route through the placeholder screen. This label is not
  evidence of a working job collection.
- `firestore.rules` defines companies, members, sites, approved extinguisher assets,
  proposals/photos, company inspection templates and site inspection records.
  There is no jobs/schedule/day-submission match. Unmatched paths are denied.
  `firestore.indexes.json` contains no configured indexes.
- Existing inspections belong at
  `companies/{companyId}/sites/{siteId}/extinguisherInspections/{inspectionId}`.
  The current local engineer-notes/servicing drafts have no verified job ID or
  selected work-date relationship. Their local ID is not proof of a server record.
- Membership policy recognises active engineer/senior_engineer and office
  owner/office_admin for their defined operations. Senior engineers have assigned
  site restrictions; the legacy engineer policy does not require migrated siteIds.
  No new mandatory site assignment or role permission is introduced here.

This is a repository finding, not a statement that the live Firebase database has
no jobs. No production data, membership exports or separate scheduling repository
was accessed. Project configuration alone cannot establish live document shapes.

## Required decision before Stage 2

Confirm the canonical live scheduling/job path and representative redacted records,
including company/site linkage, assigned engineer field(s), work-date/time-zone
semantics, existing status values, reassignment rules, job revisions and any office
writer/backend. Inspect the rules actually used by that system. If records live in
another codebase, inspect its scheduling service too. If no job system exists,
agree its canonical schema separately; do not invent a competing job collection
as a shortcut in this mobile application.

## Visibility boundary: explicit job events only

Individual PASS/FAIL/N/A answers, failure notes, observations and draft saves stay
in the existing durable local store throughout servicing. Autosave, opening or
resuming an inspection, moving between questions and backgrounding the app cause
no inspection-progress writes to Firebase. Network restoration alone must not
upload ordinary drafts: it retries only explicit queued job events/completions.

Do not add per-question listeners, live answered/failed counts in the office,
heartbeats, last-active fields, location tracking, activity telemetry or additional
engineer-monitoring dashboards. The office receives the job lifecycle and finished
results, not the sequence or timing of answers. Existing local draft audit/recovery
data remains local; do not upload keystroke/save history as a completion audit.

## Stage 2 proposal: job status and explicit completion synchronisation

Map these events to the confirmed existing job schema and existing job cards:

| Office status | Trigger | Office visibility |
| --- | --- | --- |
| Scheduled (neutral/grey) | Office assigns/schedules the job | Existing authoritative office record |
| In Progress (amber/orange) | Assigned engineer explicitly starts the job | Acknowledged start event; no answers or draft progress |
| Completed (green) | Engineer finishes and explicitly confirms completion | Only after the full completion package is validated and committed on the server |

Keep one simple status control inside the job. Opening an asset or answering a
question must not implicitly start or complete a job. Scheduled remains controlled
by the office, not a way for engineers to assign/reassign jobs. Completed is an
operational status, not a statement that checks passed, defects were resolved,
the office approved the work or equipment is certified. A job can contain recorded
FAIL outcomes and defects; whether unresolved work permits completion must be an
explicit reviewed job policy, not an assumption based on green status styling.

### Completion package and durable queue

When the engineer confirms Completed, capture a fixed, versioned package containing
the job/company/site/assigned-engineer references, completed inspection snapshots
and every answer, defects and corrective actions, necessary evidence references,
and a concise finished job summary. Use immutable job references on future
inspection records; do not guess a job/work date for existing saved inspections.
Never substitute the master asset record for an inspection snapshot.

Persist this package and a stable operation ID in a durable outbox before sending.
Reuse an existing scheduling outbox if one exists. Scope queue data and local
evidence by Firebase project, authenticated user, company and job, with session
checks at each I/O boundary and no tokens or unnecessary personal data. Keep the
source drafts and recovery copies; do not delete them on enqueue, retry or a
failed/uncertain acknowledgement. Later edits must not silently mutate a queued
snapshot or an acknowledged result; preserve them as a separate local revision.

Offline or during upload, the engineer sees **Completion Pending Sync**, not an
acknowledged Completed status. The office retains its last committed status and
cannot read a partial completion. An offline Start event likewise shows Pending
Sync locally until acknowledged. Preserve event ordering if Start and Completed
are queued offline; a delayed Start retry must never regress a completed job.

Retries use the same operation ID, inspection IDs and captured package identity,
including after process termination. A repeated completion tap, timeout or lost
response must reconcile a server receipt rather than create another submission.
Same ID with different content is rejected. Permission, reassignment, validation
or revision conflicts retain the package and show a clear blocked/retry state;
they must not be silently marked successful or retried as a different payload.

### Secure server commit and acknowledgement

Use the existing trusted job service, or propose a narrowly scoped trusted
completion operation once that service/schema is confirmed. A client status write
alone must never make a job Completed. The operation must:

1. Authenticate the engineer and revalidate active company membership, role,
   authoritative current job assignment, allowed site access, job revision and
   event transition. Deny other users/companies, unknown roles and reassigned jobs;
   legacy company-wide inspection access is not proof of job ownership.
2. Validate the complete package, checklist version and submission eligibility,
   every required answer/FAIL reason, snapshots, defects and evidence scope. Do
   not require PASS/N/A explanations or invent notes. Do not truncate answers.
3. Store complete immutable inspection results under the existing site inspection
   path, finished defects within those results where suitable, and a versioned
   completion manifest/summary referencing the exact records. Uploaded evidence
   required by that manifest must also be confirmed before finalisation.
4. Commit the job's Completed state, authoritative server completion timestamp,
   manifest reference and idempotent acknowledgement receipt together, only after
   all required records are durable and valid. Enforce explicit package/transaction
   size bounds. If larger packages need staged transfers, keep them private and
   unavailable to office queries until a validated atomic finalisation publishes
   the completion reference. No partial upload may appear as a completed job.
5. Return the committed receipt. Only then show acknowledged Completed on the
   device. If the response is lost, query/retry that operation to obtain the same
   receipt; a local cache event or pending Firebase write is not acknowledgement.

Office views use only committed job statuses, completion times, summaries, finished
inspection results and defects. An optional device-reported confirmation time for
offline work is distinct from the authoritative server commit time; it must be
labelled as reported and never masquerade as a verified timestamp. No draft or
staging collection is an office progress feed.

After commitment, engineers cannot edit/delete submitted inspection results,
completion manifests or receipts. Corrections use separately authorised linked
records with business audit history; never overwrite a submitted snapshot. Audit
only explicit start, completion, correction and later review events, not servicing
activity. Office access must remain company scoped and authorised.

### Write budget and current prerequisites

Target one logical Start operation and one logical completion operation per job.
The physical writes are the necessary job transition, lifecycle audit/receipt,
each immutable result once, and completion manifest/summary. Evidence is uploaded
once when required. Store answers together in each inspection record rather than
writing per answer or per autosave. Stable-ID retries return an existing receipt
without duplicating results/audits. Day submission references these records rather
than uploading them again. Avoid duplicating defects in multiple collections
unless the confirmed office schema requires a separate authorised defect workflow.

Before completion synchronisation can be enabled, review the secure backend
contract for the complete eleven-check annual template, current N/A semantics
and candidate-template eligibility. The current eight-question/mandatory N/A-note
server contract is incompatible. Keep monthly/annual candidates Pending Validation
and formal certification/submission disabled until the relevant technical and
server approvals exist. Neither job completion nor office/day approval can certify
an unapproved checklist. This architecture update enables none of those actions.

Production rules, job paths and trusted writers must be reviewed against the real
scheduling system before implementation. No production rule change or deployment
is authorised or performed by this proposal.

## Stage 3 proposal: one daily Submit Day for Approval action

- This is a separate end-of-day business approval action. Individual job
  completion already synchronises its finished records; day submission groups
  acknowledged job-completion receipts and their immutable inspection references.
  It neither triggers per-question synchronisation nor uploads those results a
  second time. Completing a job does not automatically submit or approve the day.
- Reuse the confirmed daily job overview and work-date definition. For UK work,
  agree Europe/London calendar-day handling and test midnight/DST boundaries;
  avoid deriving a work date from UTC slicing or an inspection's creation date.
- Show Pending Submission for a queued, unsent request; Submitted only after
  server acknowledgement. Approved/Changes Requested must come from an authorised
  office review record, never an engineer-selected field. If prerequisites are
  missing, show the reason and retain local work without claiming submission.
- Day submission depends on Stage 2's acknowledged completion packages and the
  reviewed inspection transport/validation contract. A locally selected Completed
  or Completion Pending Sync job is not eligible. Candidate checklists remain
  technically unapproved; job/day review is not a route to service certification.
- A trusted, idempotent submit operation must revalidate active membership,
  company, every included job's current assignment, selected work date, acknowledged
  Completed status and expected revision. Check every referenced inspection exists
  on the server, belongs to that engineer/company/site/job, has the required
  acknowledged immutable state and meets the approved submission contract.
  Reject local-only IDs, pending sync, missing links, incomplete/invalid records,
  reassignment, stale job versions and cross-company substitutions. Do not trust
  client completion flags or only client-side validation.
- Create an immutable day-submission manifest referencing existing job IDs and
  inspection IDs/revisions. A possible supporting path, subject to review, is
  `companies/{companyId}/engineerDaySubmissions/{submissionId}`. This is an approval
  manifest, not a second job register. Store submitter, work date, server timestamp,
  idempotency key and manifest version; impose and test explicit size/batch bounds
  rather than silently omitting jobs. Require a non-empty eligible selection.
- Keep office decisions and append-only audit events separate from both the day
  manifest and inspection records. Restrict review to verified authorised office
  roles (initially owner/office_admin), with reviewer UID different from submitter
  even if an account has overlapping roles. Senior-engineer asset approval
  permissions do not automatically grant day approval. Record decision, reviewer,
  server time and changes-requested reason. Revised submissions are new versions
  linked to the original; submitted inspections remain immutable.

## Future verification before either stage is enabled

Emulator/integration coverage must include own/other engineer, company isolation,
inactive membership, unknown roles, site restrictions, reassignment during offline
queues, stale revisions, forbidden field edits and idempotent/lost-ack retries.
For day submission also test wrong dates/DST, empty/oversized manifests, incomplete
jobs, unsynchronised/missing/foreign inspection IDs, unapproved/invalid templates,
duplicate submissions, server timestamp enforcement and manifest immutability.
Test office-only decisions, engineer self-approval denial, cross-company reviewer
denial, audit preservation and versioned Changes Requested/resubmission flows.
Test offline restart and user switching without premature Submitted/Approved UI.

For the clarified completion boundary, also test that arbitrarily many answer
taps, draft saves, resumes and network reconnects produce zero inspection-progress
writes/listeners. One explicit Start event must not transmit draft data. Test
offline Start/Completed ordering, completion confirmation/cancellation, full
package persistence before send, restart during transfer, required-evidence
failures, partial staged uploads hidden from the office, commit failure with no
Completed publication, committed receipts after lost responses, duplicate taps
and retries without duplicate writes, different content under the same operation
ID, immutable results and strict tenant/assignment enforcement. Assert office
queries expose finished results only and device-reported times cannot replace
authoritative server timestamps. Assert job completion does not submit a day,
and day submission does not re-upload results or accept unacknowledged jobs.

None of these future job/day tests have been implemented or claimed as passing.
Only Stage 1 and the existing inspection/security regression suite were run.
