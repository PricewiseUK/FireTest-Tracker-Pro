# Stage 1: New inspection and exact Resume

Only Stage 1 is implemented. Job status, daily submissions and office approval are
proposed separately in `engineer-jobs-and-day-approval-proposal.md`.

## Engineer behaviour

Selecting an approved extinguisher now offers Start New Annual Basic Service,
Start New Monthly Visual and a Resume action for each existing local inspection.
Existing inspections show creation date, service label and number of checks,
so an eight-check annual inspection and a new eleven-check annual inspection can
be distinguished without internal identifiers. The dashboard Resume list shows
the same information and opens the exact selected inspection ID.

A deliberate New action allocates a fresh stable ID. It does not call the old
start-or-resume operation or replace an old snapshot. Water annual/basic uses the
current eleven-question version-3 candidate; monthly uses its eight-question
candidate. Explicit approved equipment type and known gauge configuration are
used. If gauge configuration is not recorded, the new service intent is saved and
the existing inline confirmation is still required; no gauge is inferred from
capacity or medium. Unsupported equipment remains without a guessed checklist.

The previous inspection remains an independent active draft, with all original
answers, notes, evidence, timestamps, history and recovery copies. Nothing is copied
into the new inspection. Resume loads the selected ID and preserves its original
snapshot, including old eight-question annual or three-question demo versions.
The legacy ambiguous start-or-resume API still fails closed when several drafts
match; the new UI uses explicit New or exact Resume instead.

The compact checklist layout and PASS/FAIL/N/A controls are unchanged. PASS/N/A
need no explanation; only FAIL requires a reason for check completion, without
blocking partial saves or other questions. No development update, archive viewer
or diagnostics menu appears on the normal screen. The old development helper APIs
and archives remain in the code/storage; real damaged-copy recovery still appears
only when needed, retaining its explicit preservation confirmation.

Monthly/annual candidates remain Pending Validation. Formal submission and
certification stay disabled. Every supplied question is rendered; local validation
remains independent of the unchanged eight-question server contract.

## Durability and isolation

`prepareNewNotes` reserves one ID for one explicit New intent. Repeated starts on
that request are serialised and return the same record; a separate deliberate
New action allocates another ID. First-use ID collisions are rejected even for
the same asset. Retries after failed writes or lost read-back acknowledgements
reuse the request's ID instead of generating another inspection. The controller
also coalesces repeated open calls and the UI immediately locks onto one editor.

The existing project/user/company/site namespace, revision checks, two-copy saves,
read-back acknowledgement, raw recovery archives and session/epoch checks remain.
New requests cannot overwrite another inspection. Unsafe/corrupted local records
block creation rather than being removed. Exact Resume retains the existing
recovery path. Current approved-asset verification and company/site/role gating
remain before opening either action; proposals are not eligible inspection assets.

Save Draft, result saves, debounced text autosave, background saving and guarded
departure remain in the existing editor. A process terminating during initial
creation can leave a blank/partially configured draft, which is retained and can
be resumed; it is never silently discarded. No local save is marked Synced.

## Verification

- 148 unit tests pass, including 13 new tests for separate old/new inspections,
  current annual/monthly templates, exact offline resume after store recreation,
  repeated requests, failed writes, lost acknowledgements, ID collisions, missing
  gauge confirmation, date/count labels, wrong/missing resume IDs, corruption
  recovery and user/company/site isolation.
- All 78 existing Firebase Emulator tests pass using the demo-only project.
  Production rules and their proposal protections remain unchanged. The known
  Java emulator shutdown NPE follows successful tests; runner exit is zero.
- Typecheck passes. Lint passes with zero errors and the three existing warnings
  in CminCalculator, LoginScreen and SettingsScreen.
- Android Metro/Hermes bundling passes to `.expo/new-inspection-check`.

Native Expo Go interaction, physical device termination/storage failures, photo
permissions, exact small-screen layout and technical checklist accuracy were not
tested on a device here. Unit tests exercise the model/controller/store rather
than rendered native controls. Initial approved-asset reads still use the existing
Firestore connection/cache behaviour; this stage adds no offline access bypass.

## Expo Go steps

1. Run `npx expo start --clear` from this checkout and reload Expo Go. Do not clear
   app data or uninstall; Metro cache clearing does not clear saved inspections.
2. Open Start Routine Service, select the authorised site, then TEST-EXT001.
3. Tap Resume on the old Annual Basic Service entry showing eight checks. Confirm
   its original questions and saved answers/notes. Return using fixed Back.
4. Select TEST-EXT001 again and tap Start New Annual Basic Service. Confirm gauge
   presence if not recorded. Expect **0/11 answered**, Pending Validation and all
   eleven questions, with no old answers carried across.
5. Tap PASS/N/A without typing; FAIL must ask why and still allow the next answer.
   Save, return, and check that both eight- and eleven-check entries remain.
6. Use dashboard Resume Inspection to open each entry separately. Change the new
   draft's last check, save, disconnect the network after asset opening, background,
   terminate/restart and resume. Confirm old and new data remain separate. Initial
   uncached asset verification may still require a connection.
7. Rapid-tap a New action and verify only one new inspection is created for that
   opening. A later deliberate New action should create another separate record.
8. Switch user and confirm the first engineer's private entries are absent. Check
   compact Back/Save controls, keyboard, large text and screen-reader labels.

## Changed files

- `src/services/localInspectionDraftStore.ts`: idempotent explicit New request.
- `src/modules/Extinguishers/inspectionNotesController.ts`: New intent versus exact
  Resume, reuse current versioned candidate selection and durable saves.
- `src/modules/Extinguishers/ExtinguisherInspectionScreen.tsx`: approved-asset New/
  Resume actions, exact ID routing and removal of normal development controls.
- `src/modules/Extinguishers/inspectionDraftSummary.ts`: new pure draft labels.
- `src/modules/Extinguishers/engineerNavigation.ts`: Resume creation date/type/count.
- `src/modules/Extinguishers/ExtinguisherResumeScreen.tsx`: distinguish each saved
  inspection without raw document IDs.
- `tests/inspections/newInspection.test.mjs`: new Stage 1 regressions.
- This report and `docs/engineer-jobs-and-day-approval-proposal.md`.

No navigation architecture migration, dependency addition, job implementation,
Firebase deployment/rule change, database migration, approved-asset write, office
portal change, calculator change or Fire Alarms change was made.
