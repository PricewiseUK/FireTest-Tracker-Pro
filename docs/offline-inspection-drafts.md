# Durable local inspection drafts — phase 2

This phase adds a local storage service and tests. It does not mount a screen,
write to Firestore, submit an inspection, change security rules, or define any
servicing questions. The server contract remains separate and capped at eight
questions. No dependencies were added.

## Service entry point

`src/services/inspectionDraftStorage.ts` binds the testable store to the existing
AsyncStorage 2.2.0 dependency, Firebase app project and authenticated UID. It uses
Firestore's local auto-ID generator without writing a document. Its lifetime
authentication listener increments a session epoch on UID changes. Old handles,
queued work and in-flight results cannot be reused after a user switch, including
A → B → A. Already returned values cannot be revoked: the future UI must clear
forms, displayed results and error payloads whenever authentication changes.

The core is `src/services/localInspectionDraftStore.ts`. Its interfaces are
typechecked; tests inject storage, session, clock and ID providers.

Usage after Firebase has restored the authenticated user and the UI has selected
an authorised company/site:

```ts
const site = inspectionDraftStorage.forSite(companyId, siteId);
const result = await site.startOrResume({
  assetDocId, assetReference, assetLocation, equipmentType, serviceType,
  templateId, templateVersion, questions, // IDs and allowNA from a validated template
});
const saved = await site.update(
  result.draft.inspectionId,
  result.draft.localRevision,
  editedAnswers,
);
const restored = await site.load(result.draft.inspectionId);
const available = await site.list();
```

Initial answers are null with empty notes. Local updates permit incomplete notes
while an engineer is typing, including incomplete Fail/N/A explanations; they
are not submitted records. Phase 1 rules still enforce complete submission notes.
Only the answers can be updated; identifiers and captured template/asset metadata
are immutable. Unknown fields and mismatched question IDs are rejected.

Always await results and catch errors, including synchronous input/session
validation errors. Keep current form values until saving succeeds. A failed write
returns `DraftStoreError` with `deviceState: "Save Failed"`; where the full write
was prepared, `attemptedDraft` retains the same session's data for retry. This
payload is omitted if the authenticated session changes. Read failures are
reported as `STORAGE_UNAVAILABLE`; they never trigger deletion or a fresh draft.

## Persistence and recovery

Keys have the form:

```text
@instafire/inspection-drafts/v1/{project}/{uid}/{company}/{site}/{inspectionId}/{0|1}
```

Every namespace segment is encoded. The service reads only the current user's
exact site prefix and never calls AsyncStorage.clear(), removeItem(), or merges
partial JSON. Each copy is a complete versioned envelope containing identifiers,
asset reference/location, equipment/service type, checklist version and question
metadata, answers/notes, local revision/times and pending-sync state.

Writes alternate between two copies; the previous valid copy remains untouched
while the next copy is saved. A write is reported successful only after setItem
resolves and readback matches exactly. This relies on the storage provider's
acknowledged-write behaviour; it does not promise recovery from OS/device data
loss, storage clearing or a failed write that never reached durable storage.

No separate asset-to-draft index is maintained: discovering full envelopes avoids
an index/document crash window. Repeated Start/Resume actions reuse the existing
draft for the same asset document and service within the user/company/site scope.
Different checklist versions do not silently replace it: `contextChanged` is true
and its original metadata and unsynchronised answers remain intact. Future UI
must display/reconcile that mismatch, never apply the new checklist to old work.
If pre-existing duplicates are found, Start fails with `DUPLICATE_DRAFTS` instead
of picking one. An ID collision also fails without overwriting anything.

Operations are serialised per site across instances sharing the same storage
object in one JS runtime. Updates require the expected local revision, so stale
form snapshots cannot silently overwrite another edit. This is not a multi-device
or multi-runtime locking mechanism; use the exported singleton in the app.

On malformed JSON, invalid scope/schema or unsupported versions, no record is
deleted. If another valid copy exists, load returns that previous draft with
`recovered: true`, `canEdit: false`, and `deviceState: "Save Failed"`. If none
exists, it raises `RECOVERY_REQUIRED`. A damaged copy may contain newer work;
edits/Start are blocked until a separately designed, explicit recovery workflow
can preserve and reconcile it. No repair, purge, expiry or deletion API is added.

## Saving and synchronisation states

Two independent states avoid confusing a device save with a server save:

| Value | Meaning |
| --- | --- |
| Saved on Device | Complete envelope persisted and read back successfully. |
| Pending Sync | No server acknowledgement exists; remains true offline and after restart. |
| Synced | Reserved label only. This local-only phase never emits it. |
| Save Failed | A write/read failed or recovery is required; retain form values and existing copies. |

No public markSynced method exists, and normal update APIs cannot accept sync
state changes. Every persisted record has pending-sync state and a null
acknowledged revision. A future synchronisation adapter must receive a real
server acknowledgement for the exact draft/revision before supporting Synced.
No local timestamp, connectivity event or resolved local write counts as one.

## Privacy and access limits

[Expo's SDK 58 documentation](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/)
confirms AsyncStorage 2.2.0 is compatible and unencrypted. Store only the minimum
operational data: opaque UID/project/company/site identifiers, equipment identity
and location, checklist IDs/version/applicability and engineer-entered answers.
Do not include passwords, Firebase tokens, email addresses, contact details,
customer names, photos or full site/asset documents. Strict field allowlists reject
extra properties, but cannot detect sensitive prose typed into an otherwise valid
notes field; the future UI must discourage personal information in notes.

User-scoped keys and session checks prevent accidental cross-user service access;
they are not encryption or a boundary against compromised devices, backups,
developer tools or other application code with direct AsyncStorage access.
Previously saved work is retained on sign-out to avoid silently deleting unsynced
inspections. Shared-device use with sensitive notes may require an encrypted
store and a separately agreed retention policy before field rollout. No new
credential persistence is introduced; Firebase's existing Auth persistence is
unchanged.

Local company/site identifiers are storage scope, not proof of company membership
or site authorisation. The future UI must use its verified workspace, and server
sync must recheck current Phase 1 permissions. There is no offline permission
revocation guarantee. App.js currently verifies workspace membership from the
server at startup, so this service alone does not enable an offline cold-start UI.

## Verification and remaining integration

Tests use a storage fault adapter and two separate Node processes backed by a
temporary file. They cover save/reload, process exit/restart, duplicated attempts,
revision conflicts, partial writes, lost acknowledgements, failed reads, namespace
isolation, user switches during reads/writes, queued edits and preservation of
unsynchronised/damaged work. They do not claim native iOS/Android kill/power-loss
testing. The TypeScript tests require a Node release with native type stripping
(verified here with Node 24); the root package module type is unchanged.

The next smallest UI step is to connect one approved register asset to
startOrResume and an explicit Save/Resume action, using an already validated
template with at most eight questions. Render both local and sync states, handle
revision/recovery/context-change errors, and clear all UI data on auth changes.
Do not add submission or mark work Synced in that step. On-device lifecycle and
shared-device checks must precede claiming full offline UI support.

Verified on 1 November 2026:

- `npm run test:unit`: 24 passed (22 local-draft tests and two existing asset-ID tests).
- `npm run test:security`: all 65 existing demo-project emulator tests passed.
  The previously recorded Storage runtime shutdown-only warning remains; the
  command exited successfully and its assertions completed before shutdown.
- `npm run typecheck`: passed, including both new service modules.
- `npm run lint`: zero errors, the same three pre-existing unused-variable warnings.
- Targeted ESLint for the new service and tests, and `git diff --check`: passed.

Files changed in this phase: src/services/localInspectionDraftStore.ts,
src/services/inspectionDraftStorage.ts, tests/inspections/localDraftStore.test.mjs,
tsconfig.json, and this document. Firebase rules, Firebase configuration,
authentication/UI code, package dependencies, navigation, office portal and Fire
Alarms were not changed. No production deployment or database migration occurred.
