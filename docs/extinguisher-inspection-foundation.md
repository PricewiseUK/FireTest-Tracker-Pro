# Extinguisher inspection foundation (phase 1)

This phase adds a versioned Firestore contract and emulator-tested access rules.
It does not implement an inspection screen, local draft storage, synchronisation,
office review UI, production checklist, deployment, or database migration.

## Evidence and compatibility

Before editing, a read-only REST inspection of the app's configured company found
two membership documents: active `owner` and active `engineer`. Both contain only
`role`, `status`, and `joinedAt`. The one existing site is active and contains no
assignment fields. No senior-engineer membership or permissions were found.
The office portal recognises `owner` and `office_admin`.

The existing `engineer` role may create and update its own inspection drafts. `owner` and
`office_admin` may read submitted inspections, but cannot rewrite them or read
private engineer drafts. The user confirmed `senior_engineer` as the proposed role
name, not an existing membership. The local proposed policy permits seniors to
create/resume/update/submit their own inspections and read submitted inspections
only at explicitly assigned sites. Emulator-only senior fixtures use membership
`siteIds` arrays; missing/empty/unmatched assignments deny access. No role receives
authority to edit another engineer's private draft or submission. Senior asset
approvals remain a separate future authorised workflow, with no new permission
granted here. Membership, billing and administration permissions are unchanged.

No mandatory `siteIds` requirement for existing engineers or migration is introduced. Inspection access
requires active company membership, an active company, and an existing active
site under that company. This retains company-wide site scope for engineers;
per-engineer site assignments are deferred until a safe migration is verified.
The proposed senior role intentionally has no company-wide assignment fallback.
Its actual membership records and assignment schema must be verified before
enabling/deploying the role. No production membership is created or modified.
Client claims/route parameters never grant membership or privileges.

Existing asset, proposal, photo metadata and office rules are unchanged.
Storage proposal-photo creation now explicitly requires `resource == null`:
the emulator allowed replacement through uploadBytes despite the existing
separate `allow update: if false` rule. This additional condition protects evidence
without changing valid new-object uploads, paths, limits or office reads.
The new inspection helpers deliberately do not alter legacy access functions.
The duplicate rules under `packages/` are not deployment sources in firebase.json
and are not changed. No Router or office portal changes are included.

## Server data contract

Path:
`companies/{companyId}/sites/{siteId}/extinguisherInspections/{inspectionId}`.

The TypeScript contract is in
`src/modules/Extinguishers/inspectionTypes.ts`. All listed fields are required;
unknown fields are rejected. An inspection ID identifies one attempt and must be
retained across retries by the future client.

- `schemaVersion`: integer `1`.
- `companyId`, `siteId`: must match the containing path.
- `assetDocId`: exact document ID in this site's protected `extinguishers`
  collection. Display references, proposal IDs and stored `id` fields are not IDs.
- `createdBy`: authenticated engineer UID, immutable.
- `createdAt`, `updatedAt`: server timestamps at creation; creation time immutable.
- `equipmentType`, `serviceType`, `templateId`, `templateVersion`: immutable
  references to the approved equipment-specific template version.
- `assetSnapshot`: immutable `{ type, location, assetReference }`, compared to
  approved asset values at creation. Missing location defaults to empty text;
  missing assetId defaults to the actual document ID. Snapshot values are not
  rewritten if the approved asset later changes.
- `revision`: integer starting at one, incrementing by exactly one per write.
  The future sync service must use transactions/preconditions to handle conflicts.
- `answers`: ordered array matching every template question ID exactly.
  Each entry has exactly `{ questionId, result, notes }`. Initial result is null
  and notes empty; draft changes can remain incomplete. Results are lowercase
  `pass`, `fail`, `na`, or null. Fail and N/A require non-whitespace notes.
  Notes are limited to 2,000 characters. N/A also requires question `allowNA`.
- `status`: `draft` or `submitted`. Creation must be draft. Submission is an
  update with no unanswered questions and a server submission timestamp.
- `submittedAt`: null while draft, server timestamp on submission.

All identity/template/snapshot fields are immutable even while drafting. The
asset must still exist when updating/submitting. Revocation of membership,
company/site activation or template approval prevents subsequent writes.
Deletion is denied, including draft deletion. Submitted records cannot be edited,
reopened, reassigned or deleted by any client role. Admin SDK/IAM access bypasses
rules and must be controlled separately.

Templates live at
`companies/{companyId}/extinguisherInspectionTemplates/{templateId}` and have
`schemaVersion: 1`, positive integer `version`, `status: "approved"`, equipment
and service types, and one to eight ordered questions with unique IDs, labels
and boolean `allowNA`. Each published template document/version must remain
immutable in trusted tooling. Create a new document for a revised checklist;
never overwrite a definition referenced by historical inspections. Technical
validation, unique question IDs and provisioning belong to trusted tooling.
All client template writes are denied. No production templates are supplied, so
creating inspections remains blocked until validated definitions are provisioned.
The synthetic fixtures are emulator-only and are not servicing guidance.

Rules explicitly validate up to eight answers because the rules language cannot
iterate arbitrary arrays and has a 1,000-expression evaluation limit. The initial
twelve-answer design exceeded that limit in emulator tests. This foundation does
not claim to accommodate a complete servicing checklist: technical approval may
require a different scalable schema or trusted submission validator before UI
work. Never truncate a real checklist to fit the foundation's bound. Larger
questionnaires require a separately reviewed schema/rule version. Future reviews and corrections should be append-only linked
records; those collections and inspection photo uploads remain denied in phase 1.

## Queries and offline boundary

Engineer inspection queries must include `createdBy == currentUser.uid`; office
queries must include `status == "submitted"`, under a specific company/site.
Rules are not result filters. No collection-group read permission is introduced.
No new index is needed for these equality-only queries.

This is the server contract only. The Firebase JS SDK does not provide persistent
Firestore caching on React Native. Reliable offline drafts, a user-scoped local
outbox, acknowledgement/retry handling, offline workspace access and conflict
resolution remain a separate implementation stage. Revision checks alone do not
implement those features or guarantee a single active draft per asset.

## Local verification

Use `npm run test:security` to start only Firestore and Storage emulators with
`firebase.emulators.json` and project `demo-instafire-inspections`. The separate
configuration avoids changing production hosting/deployment settings. Tests
refuse non-local endpoint settings and never use the production project. No
production credentials are used by the tests. Detailed test results are written
to `.security-results.log` (ignored by Git). The runner cleans up only newly
created, project-matching Firestore JVMs on Windows, where CLI shutdown can leave
the Java process listening. Run `npm run test:unit`,
`npm run lint`, and `npm run typecheck` as well.

Typechecking covers the new TypeScript inspection contract; it does not claim
type safety for the existing JavaScript app. Rule tests cover ownership,
isolation, unverified roles, payload validation, revisions, submission locks,
office reads and legacy proposal/Storage regressions. Actual servicing content,
offline/mobile behaviour and office UI are outside this phase.

Do not deploy these rules or migrate membership records as part of phase 1.

## Verification results

Verified on 1 November 2026:

- `npm run test:security`: 65 passed, zero failures, isolated demo project.
  Includes eight maximum-length Fail and permitted N/A answers for both engineer
  and assigned senior-engineer contexts, and final-question completeness checks.
- `npm run test:unit`: two asset-document identity regression tests passed.
- `npm run typecheck`: passed for the new TypeScript contract.
- `npm run lint`: zero errors; three pre-existing unused-variable warnings in
  CminCalculator.js, LoginScreen.js and SettingsScreen.js. Targeted ESLint checks
  for the new types, helper and tests also passed.
- The Storage rules runtime emits a Java NullPointerException during emulator
  shutdown, after all assertions complete; the test runner exits successfully.
  Windows Firestore process cleanup completed before the runner returned.

Not tested or implemented: a mobile inspection UI, on-device offline draft
recovery/synchronisation, production servicing templates, live office approval
UI, production rule deployment, or membership/site-assignment migration.

Changed files: firestore.rules, storage.rules, firebase.emulators.json,
package.json, package-lock.json, .gitignore, eslint.config.js, tsconfig.json,
src/modules/Extinguishers/inspectionTypes.ts,
src/modules/Extinguishers/ExtinguisherAssetRegisterScreen.js,
src/utils/firestoreDocument.mjs,
tests/firebase/inspection.rules.test.mjs, tests/firebase/run-emulators.mjs,
tests/inspections/assetDocument.test.mjs, and this document.
