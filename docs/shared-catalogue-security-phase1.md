# Phase 1: shared catalogue security foundation

Next stage completed in emulators only: see the
[MxPro 5 adapter/definition report](advanced-mxpro5-emulator-catalogue.md).
Its concrete adapter is deliberately local-only; production integration remains
unimplemented. The verification counts below record the original Phase 1 stage.

Implemented locally; not deployed. No production Firebase reads/writes, catalogue
entries, entitlements, publication grants, asset links or migrations were performed.
All test equipment/definitions are synthetic fixtures in isolated demo emulators.
TEST-EXT001 and every existing device draft remain untouched.

## Implemented access boundary

Root `firestore.rules` adds only catalogue/control-plane matches and helpers.
Existing company/site/asset/proposal/photo/inspection matches remain unchanged.
No installed module is enabled by a catalogue grant and no mandatory siteIds are
introduced. Storage rules and office/mobile application code remain unchanged.

Definitions use `equipmentCatalogue/{kind}/models/{modelId}/versions/{versionId}`
for fire-alarm-panels, fire-extinguishers, emergency-lights, fire-doors and
fire-blankets. Customer reads require:

- Authenticated user and an allowlisted kind.
- Backend-provisioned `catalogueAccess/{uid}`: schemaVersion 1, enabled true and
  authorisingCompanyId identifying a real active company.
- A current active membership in that company with engineer, senior_engineer,
  owner or office_admin role. A stale grant cannot override revocation.
- `publicationState: published` on the requested record. Versions also require
  a published model; file manifests require a published model and version.

All customer SDK create/update/delete operations are denied on catalogue roots,
models, versions, availability and file manifests. Custom admin claims do not
override that denial. Customers cannot read/write/enumerate catalogueAccess,
cataloguePublishers or cataloguePublicationAudit. No grant is provisioned by this
phase; customers are denied catalogue reads until trusted provisioning exists.

Model/version discovery queries must constrain publicationState to published.
Broad queries including unpublished records, kind-root enumeration, global
collection-group access and unreviewed descendant paths remain denied. Missing
versions and unpublished definitions fail closed. No implicit latest-version
fallback or customer installation update is introduced.

## Immutable versions and withdrawal

Published versions retain publicationState published permanently. Withdrawal is
a separate backend-managed record at:

`equipmentCatalogue/{kind}/models/{modelId}/versionAvailability/{versionId}`

Its state is active or withdrawn. A withdrawn version remains readable by entitled
customers for historical use; its availability tells a future selection/linking
backend to reject new use. No asset selector or linking workflow is implemented.
A record whose own publicationState is unpublished/withdrawn is not a valid
published version and is unreadable. No withdraw API is implemented in this phase;
the withdrawal tests alter only synthetic fixtures through the privileged emulator.

Global source-file objects remain denied by existing Storage default-deny rules,
as proposed for the foundation. Published file manifests do not grant blob access.
Future authenticated downloads/publication need a reviewed backend/file adapter.
Existing tenant proposal-photo rules are preserved.

## Server-only publication policy

`backend/catalogue/publication.ts` is not imported by the mobile/office app and
does not initialise Firebase, expose an endpoint or contain credentials. It defines
an injectable server-only policy requiring:

1. A caller verified by a trusted server authentication callback, not a UID or
   customer role in the publication payload.
2. A live independent `cataloguePublishers/{uid}` document with schemaVersion 1,
   enabled true and publishVersions true, checked inside the transaction. A customer
   owner/office_admin is not automatically a central publisher.
3. A published parent model of the requested kind; valid stable model/version IDs;
   exact allowlisted identity/source fields. Extra company/private/servicing fields
   are rejected. This deliberately narrow phase accepts no technical specification
   or checklist schemas; source truth/privacy still require central human review.
4. Atomic create-only publication of the version, active availability record and
   a private business publication audit receipt. The version has a deterministic
   content hash and server publication timestamp. The publisher identity stays
   in the private audit, not the shared equipment definition.
5. Identical retry returns the existing verified receipt/version without writing.
   Different content under an existing ID, malformed/conflicting state and attempts
   to replace a version are rejected. A retry never reverses a later withdrawal.

The adapter must supply an actual atomic create-only transaction implementation;
an upsert is forbidden by its contract. Emulator tests use a transaction adapter
that reads every target as absent before setting it, and test concurrent retries
and rollback. A production Admin SDK adapter, verified-auth integration, IAM
restrictions, grant/model-index provisioning, central management endpoint and
deployment are deliberately not provided by this foundation. Arbitrary privileged
Admin/IAM access is outside client rules; do not claim rules alone enforce backend
immutability. Firebase documents the [server/rules boundary](https://firebase.google.com/docs/firestore/security/get-started).

The helper cannot create/update model indexes, installed assets, reference links,
membership or customer evidence. New version publication does not change the
parent model's latest pointer or a customer's selected definition/history.

## Verification

`npm run test:security` now runs sequentially in two separately started demo projects:

- demo-instafire-inspections: all 78 existing tests (65 current-rule regressions
  plus 13 pre-existing emulator-only question-limit proposal cases).
- demo-instafire-catalogue: 33 new rules/publication tests covering all five kinds.

The new suite covers recognised roles from two independent companies, missing/
disabled/malformed access, inactive company/member, revocation, unauthenticated/
unauthorised users, unknown kinds, published/unpublished/missing versions,
withdrawal overlays, query constraints and all customer SDK write denials.

For each private installed collection, A-to-B/B-to-A access, queries, writes,
configuration reads and associated Storage access are denied despite catalogue
access. Same-company extinguisher reads still pass. The other four modules remain
denied even to same-company users, matching their existing disabled permissions;
these tests are NOT positive authorisation/feature coverage for future modules.
Private evidence/catalogue objects are seeded to ensure download failures are
permission checks, not simply missing files. Existing proposal/photo regressions
still run in the original suite.

Publication tests cover unauthenticated/unauthorised/disabled publishers, payload
validation, immutable conflicts, identical/concurrent retries, server timestamp,
private audit creation and atomic failure/retry, with no installation modifications.
No test uses the application's production Firebase configuration.

Results: 111 security tests passed (78 existing + 33 new); 148 existing unit tests
passed. Mobile and backend typechecks passed. Lint passed with zero errors and
the same three warnings in untouched CminCalculator, LoginScreen and SettingsScreen.
The existing Java rules-runtime shutdown NPE follows successful emulator assertions;
both demo runner exits are zero. Logs: `.security-results.log` and
`.security-catalogue-results.log` (ignored generated files).

Not tested: production IAM/auth adapters, deployed Functions, SDK/device cache
behaviour, portal integration, real catalogue content/technical accuracy, physical
Expo Go interactions and positive access workflows for the four unfinished
modules. This is not the completed all-module production release gate. No Android
bundle was requested or generated for this server/rules-only change.

## Changed files and compatibility

- `firestore.rules`: scoped global catalogue/control-plane rules only.
- `backend/catalogue/publication.ts`: server-only authorisation/publication policy.
- `backend/tsconfig.json`: isolated Node backend typecheck; no Node types added to
  the mobile compiler context.
- `package.json`: typecheck also checks the backend; no dependencies added.
- `tests/firebase/catalogue.rules.test.mjs`: new synthetic catalogue/security suite.
- `tests/firebase/run-emulators.mjs`: runs both separately scoped demo suites with
  explicit project/environment safety checks and per-invocation Java cleanup.
- This report and a status link in the prior review proposal.

`firebase.json`, `firebase.emulators.json`, deployed rules, Storage rules, indexes,
approved assets, proposal payloads, candidate checklists, offline draft schemas,
navigation, office portal and inspection submission gates are unchanged. The
eight-question server contract has not been expanded. Local rules are deployment
candidates only; running this suite does not deploy them.

## Next smallest step

Implement the concrete verified-auth/Admin SDK create-only adapter and dry-run
publication/entitlement provisioning workflow in emulator-only integration tests.
Review central publisher IAM and model identity/source schemas before enabling any
management endpoint. Then add an optional read-only catalogue client/reference
validator, preserving legacy assets. Do not publish real content, provision live
grants or link TEST-EXT001 until separately authorised and its exact model verified.
