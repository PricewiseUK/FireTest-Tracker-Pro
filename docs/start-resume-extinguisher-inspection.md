# Start / Resume extinguisher inspection — phase 3

The approved asset register now opens a dedicated, notes-only inspection screen.
The existing component-state navigation is preserved, following the explicit task
instruction rather than migrating to Router. No Firebase rules, approved assets,
proposals, photographs, office portal, Fire Alarms or production data were changed.

## Opening an inspection

The module Home and building-level inspection entries lead to the asset register.
Each eligible approved record has a Start / Resume Inspection action. The editor
reads the exact `companies/{company}/sites/{site}/extinguishers/{documentId}` path
again before opening. Proposal paths, nonexistent documents and explicit pending,
rejected or other non-active statuses are rejected. Legacy approved-register
documents without a status field remain supported, as in Phase 1.

The Firestore document ID is authoritative even if stored data contains `id`.
The screen shows the current equipment reference, type, capacity and location.
Capacity is read from `capacity` and optional `capacityUnit`; absent data is shown
as not recorded. The draft's original snapshot remains unchanged if approved
asset details later change, with a visible review notice.

The verified workspace passes user/role/site information through the existing
prop chain. Engineers retain the existing company/site scope; no mandatory
assignment migration is introduced. Proposed senior engineers require a matching
optional `siteIds` entry, consistent with the Phase 1 policy. Other roles cannot
start inspections. These local UI gates do not replace server authorisation or
provide offline permission-revocation guarantees.

## Notes-only data and persistence

Phase 2's version 1 checklist format still requires a validated template, so it is
not used to fabricate a checklist. The same storage service now also supports a
distinct `localSchemaVersion: 2`, `draftKind: "engineer-notes"` envelope. It has
engineer notes, capacity and recovery archive metadata, and deliberately has no
questions, answers, template, completion status or submission timestamp.
The notes-only envelope is not a Firestore inspection payload and is never sent
to Firebase. The server's eight-question limit and version 1 security model are
unchanged. Existing checklist drafts remain intact and separate from notes-only
drafts; converting notes into a validated inspection is future work.

Stable IDs, user/project/company/site scoping, two-copy persistence, readback
confirmation, serialised writes and revision checks come from the existing
storage service. Repeated taps/open calls reuse the same eligible notes draft.
Only notes are editable, with an 8,000-character limit; asset snapshots and scope
cannot be edited through the screen. Drafts and archives remain unencrypted in
AsyncStorage, with the same privacy limits documented in phase 2.

Explicit Save Draft is available. A 500 ms debounce also saves during editing,
and background/inactive events request a best-effort flush. Header Back, Android
hardware Back and bottom navigation wait for outstanding changes to save before
leaving. Failure keeps the editor and unsaved text available for retry. Repeated
back/save actions are coalesced; edits during a pending write are flushed before
safe navigation. Local acknowledgement loss is reconciled against stored data.

Saving, Saved on Device, Pending Sync and Save Failed reflect actual local state.
Unsaved changes are labelled separately rather than falsely showing Saved.
No Synced state or completed inspection is displayed. User switches invalidate
the editor and old storage handles; late results cannot reveal the old user's
notes in the new session.

## Explicit recovery

If one copy is damaged, the editor shows the previous valid notes read-only and
explains that newer changes may be missing. Review Recovery opens a confirmation
dialog. Only Preserve & Continue authorises recovery.

Before replacing a damaged active slot, `recoverNotes` copies every original raw
slot byte-for-byte into a separate user/project/company/site-scoped namespace:

```text
@instafire/inspection-draft-recovery/v1/{project}/{uid}/{company}/{site}/{inspectionId}/{archiveId}/{slot}
```

Each archive write is read back and verified. No archive is overwritten, no
original data is deleted, and no active repair is attempted if archiving fails.
The repaired notes draft records its archive ID. In-memory unsaved notes are
preserved through recovery and saved afterwards. Lost repair acknowledgements
are reconciled. Navigation is blocked while recovery is in progress.

If neither copy can be validated, no replacement draft is created. The screen
offers retry/return and explains that administrator-assisted recovery is needed.
There is no destructive reset or discard action. Archive review/export and
conflict reconciliation remain separate future workflows.

## Verification

On 1 November 2026:

- `npm run test:unit`: **40 passed, zero failed**. Includes all 24 previous tests
  and 16 new asset-entry/controller/store tests for approved-only entry, repeated
  taps, notes persistence, failed saves, navigation away/back, edits during saving,
  user switching, recovery/archive failure and unchanged checklist drafts.
- `npm run test:security`: **65 passed, zero failed**, isolated demo project.
  The previously documented Storage runtime shutdown warning remains after
  successful assertions; the command exits successfully.
- `npm run typecheck`: passed, including the new screen and controllers.
- `npm run lint`: zero errors and the three existing warnings in other source
  files. Targeted lint including App.js also passes, with its three existing
  duplicate-import/unused-Alert warnings. The auth effect is declared after its
  existing workspace helper to satisfy the current lint rule; checks are unchanged.
- `npx expo export --platform android --output-dir .expo/inspection-check`:
  passed on the final implementation. This is a local Metro/Hermes bundle check,
  not an installed Android build or deployment.
- `git diff --check`: passed.

Tests exercise the actual controller and storage together, not native button
events. Untested: physical iOS/Android UI, keyboard/hardware-back interactions,
OS suspension/power-loss timing and live account/asset interactions. Abrupt
termination before the debounce/background flush may lose text not yet saved;
only acknowledged local writes have a durable-save guarantee. Existing workspace
verification still requires network on cold start, and the approved-asset read
requires connectivity or the current SDK session's cached asset. No complete
offline cold-start UI or server sync is claimed.

## Files changed

- App.js — optional inspection leave guard and verified workspace props.
- src/modules/Extinguishers/ExtinguisherHomeScreen.js — inspection entry to register.
- src/modules/Extinguishers/ExtinguisherBuildingsScreen.js — building entry and scope props.
- src/modules/Extinguishers/ExtinguisherAssetRegisterScreen.js — approved record action/editor.
- src/modules/Extinguishers/ExtinguisherInspectionScreen.tsx — notes UI and lifecycle handling.
- src/modules/Extinguishers/inspectionNotesController.ts — tested save/navigation/recovery logic.
- src/modules/Extinguishers/approvedInspectionAsset.ts — approved path and asset projection.
- src/services/localInspectionDraftStore.ts — compatible notes envelope and explicit archiving.
- tests/inspections/inspectionNotes.test.mjs — integration behaviour tests.
- tsconfig.json — include new TypeScript modules and screen.
- This document.

No dependency installation, database migration, Firebase deployment, membership
modification, navigation migration or checklist publication occurred.
