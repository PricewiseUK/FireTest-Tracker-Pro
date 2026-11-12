# Asset cards and the preserved TEST-EXT001 demo replacement

## Why the three old questions remained

The register opens the existing inspection editor, whose controller calls
`startOrResumeNotes` or loads the exact selected inspection ID. Both restore the
persisted servicing snapshot. `ExtinguisherServicingPanel` renders that snapshot,
and normal `updateServicing` rejects changes to an attached checklist with
`CHECKLIST_SNAPSHOT_IMMUTABLE`. Updating the candidate factory therefore cannot
replace an existing three-question demo. This was deliberate preservation, not
Firestore's question limit or an Expo bundle-cache diagnosis. Device-local data
was not remotely inspected here; the cause follows the loading/write contracts.

## Narrow, explicit development exception

Only a Water draft with the exact current AND stored reference `TEST-EXT001`, the
same Firestore asset document ID, a valid three-question demonstration snapshot,
and no unresolved recovery can use the exception. The native store enables it
only under `__DEV__`; release stores default to deny. Other assets, approved/pending
snapshots, stale revisions and other users cannot use it. Normal snapshot
immutability and all production Firebase rules remain unchanged.

In Expo Go development, the existing inspection screen offers an inline action
for that specific demo. If approved asset data does not explicitly record the
boolean `gaugePresent`, the engineer confirms the actual gauge configuration
there. A single confirmation explains preservation and unanswered replacement
checks; this is not a new draft picker or office approval screen.

The controller first saves pending edits and freezes editing/departure while the
replacement runs. The store copies EVERY active raw slot to a separate, unique
archive under the existing project/user/company/site/inspection recovery namespace,
reading back each copy before the first replacement write. Existing archive keys
are never changed. Only then does it write the current Water candidate snapshot
and fresh unanswered answers at the next revision. The active inspection ID and
creation time remain stable. Engineer notes, defect observations, evidence and
local history are retained. No old answer is matched or copied into a new check.

The preserved original is a complete separate record, including its original
snapshot, answers, notes, observations and evidence references. “View preserved
original demo” displays it read-only on the same screen. Archived originals remain
available after subsequent slot rotation or recovery; no automatic restore replaces
newer active work. Photo files/references are not removed. Archive/write failures
keep the originals, report failure and permit retry; lost local acknowledgements
are reconciled by reading the stored record. Repeated taps share one operation.

Fresh blank inspections can select the current candidate directly from the explicit
approved equipment type plus an explicit boolean gauge configuration. Unknown
types/configurations are not inferred from capacity. When gauge presence is absent,
the existing single inline gauge confirmation remains. Existing snapshots and
exact-ID Resume are never automatically retemplated. Candidate controls remain
PASS/FAIL/N/A, with only FAIL requiring a reason. All defined questions are rendered;
local capacity remains independent of the unchanged eight-question server rule.
Technical validation, formal submission and certification stay disabled.

## Approved list presentation

The supplied Uptick screenshot informed hierarchy only. Cards retain InstaFirePilot
black/charcoal/orange styling and the existing navigation, with a single tappable
surface, prominent reference/location, type/capacity, manufacturer and model,
history placeholders and an explicit device status. There are no nested controls,
tested toggles or extra menus. Cards wrap without fixed heights or one-line clipping.
Back remains fixed; existing bottom navigation/safe-area ownership is unchanged.

Display fields use recorded `assetId` or prefix/number, with the actual Firestore
document ID as fallback; type, capacity/capacityUnit and location are unchanged.
Manufacturer accepts recorded `manufacturer`/`make`; model accepts `model`/
`modelNumber`. Missing/malformed values read Not Recorded. Missing capacity units
are identified, never inferred. Mapping still protects the real Firestore document
ID against a stored `id` field; selection passes the original company/site/doc ID.

Current progress is based ONLY on the authenticated engineer's validated local
drafts at the selected company/site. One or more draft records for an asset mean
In Progress, even with all PASS answers. No local draft means Not Started on this
device, not a company-wide assertion. Failed/unavailable reads mean Status
Unavailable, not Not Started. Recoverable copies show a recovery warning. Role/site
gates are retained. Returning from the editor reloads the counts after its save guard.
The compact site summary counts distinct assets with drafts, not completed checks
or services, and explicitly labels its device-only scope.

The inspected repository has no verified-service-summary or current work-order
completion contract. Ad-hoc `lastServiceDate`, `lastServiceResult`, `completed` or
`verified` flags are not treated as proof. Last verified service date/result therefore
show Not Recorded. No Completed label or passed-service result is generated.
An authoritative history/current-job data source must be specified and validated
before those can be populated. No Firestore collection or asset field is invented,
written or migrated to manufacture that information.

## Verification

119 unit tests pass, including archive-before-write ordering, preservation of all
original data, fresh unanswered current version, no implicit demo migration,
repeated taps, release/asset/revision gates, failed archive and active writes, lost
acknowledgements, user/company/site isolation and offline recovery. Asset-card tests
cover recorded/missing facts, real document IDs, untrusted historical/completed
flags, all-PASS drafts remaining In Progress, scoped counts, unavailable reads and
damaged-copy preservation. All 78 existing Firebase Emulator tests pass. Typecheck,
lint and Android Metro/Hermes export pass. Three existing lint warnings remain in
untouched files. The existing Java rules-runtime shutdown exception occurs after
successful assertions and exit zero. Nothing was deployed.

Native layout, screen-reader/keyboard/touch interactions and actual Expo Go device
data have not been tested here. The screenshot is a layout reference, not evidence
of a rendered native build. The original draft remains device-local; uninstalling
or clearing app storage removes local data. Initial workspace verification and
uncached approved-asset reads retain their existing network/cache requirements.

## Expo Go checks

1. Start Routine Service → Lincoln Business Centre → TEST-EXT001. Confirm the
   reference, Water/capacity, prominent location and recorded manufacturer/model
   (otherwise Not Recorded). Check that history is not fabricated and a saved
   draft reads In Progress rather than Completed/Passed.
2. Open the asset. While its saved demo is still active, use the scoped development
   action. Confirm the actual gauge presence if requested, then Preserve & Replace.
   Expect eight current Water candidate questions, all unanswered, labelled Pending
   Technical Validation. No question is omitted. PASS/N/A require no notes; FAIL
   shows a reason without blocking later questions.
3. View the preserved original on the same screen. Verify the old three questions,
   answers, notes/actions and evidence. Check the current notes/observations remain
   available, save, return, resume and restart. The current candidate should remain
   active and the original remain readable. Do not clear local storage.
4. Confirm the replacement action is absent for other assets and release builds,
   and cannot bypass the normal recovery flow on a damaged test copy.
5. Open a fresh, supported test asset: verified type and explicit `gaugePresent`
   select the candidate automatically; missing gauge information requires the
   existing inline confirmation. Unknown types are not guessed.
6. Check whole-card taps, fixed Back, small screens/large text, longer model/location
   strings, bottom navigation, offline resume and user switching. Summary/status
   scope must remain device/user/company/site-specific. These still need device QA.

Changed files:
- src/modules/Extinguishers/ExtinguisherAssetRegisterScreen.js
- src/modules/Extinguishers/extinguisherAssetPresentation.ts (new)
- src/modules/Extinguishers/DevelopmentChecklistReplacement.tsx (new)
- src/modules/Extinguishers/inspectionChecklistSelection.ts (new)
- src/modules/Extinguishers/ExtinguisherInspectionScreen.tsx
- src/modules/Extinguishers/approvedInspectionAsset.ts
- src/modules/Extinguishers/inspectionNotesController.ts
- src/services/localInspectionDraftStore.ts
- src/services/inspectionDraftStorage.ts
- tests/inspections/developmentChecklistReplacement.test.mjs (new)
- tests/inspections/extinguisherAssetPresentation.test.mjs (new)
- this document

The Pass/Fail/N/A component, existing navigation/calculator, production rule files,
master asset records, office portal and Fire Alarms were not changed.
