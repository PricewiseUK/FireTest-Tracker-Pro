# Annual checklist: eight saved checks versus eleven current checks

## Cause and evidence

The current Water annual-basic candidate is version 3 and has eleven questions.
`routineServicingForAsset` selects that version; a fresh configured annual draft
has eleven null answers. The local servicing validator permits up to 64 questions.
The renderer maps the entire saved question array, and progress counts the saved
answer array. There is no slicing or eight-question display limit.

Versions 1 and 2 of the annual candidate each have eight questions. The draft
controller's normal open/resume path restores an attached snapshot unchanged;
it only auto-attaches a candidate to a new, blank, configured draft. This is why
updating the template generator did not update an earlier saved inspection.

Regression fixtures reproduce TEST-EXT001 showing eight annual checks when its
saved draft contains version 1 or 2. The previous development-only update path
accepted three-question demonstration drafts only, so an eight-question annual
snapshot had no eligible update action. These are separate issues from the
unchanged eight-question Firestore submission contract.

The actual phone's AsyncStorage was not accessible from this workspace. Its exact
stored version therefore has not been directly inspected. In the updated app,
the compact update action is shown only after loading a canonical old annual
Water snapshot. If no action appears after reloading the current bundle, inspect
the saved checklist in development diagnostics; do not clear device storage.

## Change

The existing protected development replacement now also recognises canonical
version-1/version-2 eight-question Water annual snapshots for TEST-EXT001, with
matching current/stored asset reference, document ID and Water identification.
It excludes monthly/current/unknown templates and other assets. Release builds
remain disabled through the existing storage feature gate and `__DEV__` UI gate.

An eligible old annual draft gets one small inline action below Pending Validation:
**Load latest 11 checks · keep previous inspection**. This opens a short confirmation,
not a new menu, migration screen or draft picker. It uses the verified current
gauge flag or the explicit flag already stored in the validated old snapshot.
The rest of the compact screen and PASS/FAIL/N/A controls are unchanged.

On confirmation, the existing controller saves outstanding edits and serialises
repeated requests. The store checks session, ownership, draft revision and recovery
state, then writes and reads back every original raw copy to a separate recovery
archive before any replacement write. The latest annual snapshot and eleven
unanswered answers become the active revision of the same draft. Original answers,
notes, actions, audit history and evidence remain in the separately recoverable
record; existing archives are untouched. Current engineer notes, defect observations
and evidence references remain on the active draft too. No answers are transferred
into the new checklist or silently marked complete.

Archived eight-question originals can be read in the existing development
diagnostics area, independently of subsequent slot rotation or damaged-copy
recovery. Internal legacy method names ending in `DevelopmentDemo` are retained
for compatibility; their displayed labels now say preserved inspection.

Ordinary open/resume still leaves every existing snapshot unchanged. PASS/N/A need
no explanation; FAIL still needs a reason for check completion, without blocking
partial saves or other questions. All eleven current checks remain visible and
durable offline. Pending Validation, disabled formal submission and disabled
certification remain unchanged. No production rules, approved assets, navigation,
calculator, office portal or Fire Alarms were modified. Nothing was deployed.

## Changed files

- `src/modules/Extinguishers/inspectionChecklistSelection.ts`: narrow obsolete
  development snapshot predicate; current candidate generation unchanged.
- `src/services/localInspectionDraftStore.ts`: reuse that predicate for the existing
  archive-before-replacement path and read-only preserved inspection loader.
- `src/modules/Extinguishers/inspectionNotesController.ts`: expose eligibility for
  old annual snapshots using the existing save/replacement/recovery logic.
- `src/modules/Extinguishers/DevelopmentChecklistReplacement.tsx`: compact action,
  confirmation, known saved gauge handling and updated preserved-inspection labels.
- `src/modules/Extinguishers/ExtinguisherInspectionScreen.tsx`: show the compact
  development-only action when eligible, without changing normal screen layout.
- `tests/inspections/developmentChecklistReplacement.test.mjs`: six additional
  regressions covering fresh eleven-question annual drafts, unchanged v1/v2
  resume, complete archival before update, latest edits, repeated taps, failed
  archival/active writes, offline recovery, scoped eligibility and release denial.
- This report.

`pendingRoutineChecklist.ts`, `servicingDraft.ts` and the checklist renderer were
inspected but did not need changes.

## Verification and Expo Go check

135 unit tests and all 78 Firebase Emulator tests passed. Typecheck passed. Lint
passed with zero errors and three existing warnings in untouched CminCalculator,
LoginScreen and SettingsScreen. Android Metro/Hermes bundling passed to
`.expo/annual-eleven-check`. The known Java emulator shutdown NPE followed successful
tests; the runner exited zero. Emulator-only proposal tests remain separate from
unchanged production rules.

Native Expo Go interaction, exact phone snapshot/version, device storage failure
injection, photo rendering and the technical accuracy of candidate procedures were
not verified on a physical device. Behaviour tests use the pure controller/store.

To verify on the phone:

1. Start this checkout with `npx expo start --clear`, then reload Expo Go. This
   clears Metro's bundle cache, not the app's stored drafts. Do not uninstall the
   app or clear its data.
2. Open TEST-EXT001. Its previous eight answers must still be present. Tap
   **Load latest 11 checks · keep previous inspection**, then confirm preservation.
3. Verify the count is **0/11** and all eleven questions are available, including
   the final service-label/maintenance-record check. Nothing is preselected.
4. In development diagnostics, view the preserved inspection and verify the old
   eight answers, explanations, actions, notes and evidence. Return to Checks.
5. Use PASS/N/A without notes, FAIL with a reason, then Save Draft. Leave, resume,
   disconnect the network and restart as in the existing offline test. All eleven
   checks and edits must survive. No submission/certification is enabled.
