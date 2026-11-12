# Monthly visual and annual basic candidate checklists

This update supersedes the current-template and setup descriptions in
`extinguisher-simple-checklist.md`. It also retains the compact inspection-screen
presentation: fixed Back control, three-line asset summary, small Local Draft and
Pending Validation notices, answered/failed counts, questions immediately below,
and a fixed Save Draft footer outside the scrollable content. Internal identifiers,
template versions and preserved-demo access are confined to development diagnostics
below the ordinary editor. Corruption recovery and save errors remain visible.

## What is implemented

Two distinct version-3 candidate definitions use the topics supplied by the user:

- Monthly Visual Inspection: eight visual topics, intended for a responsible person
  or designated staff. All eight remain displayed, including the gauge topic on a
  unit without a gauge; the engineer explicitly selects N/A, with no explanation.
  There is no lifting, tilting or contents-weighing instruction.
- Annual Basic Service: eleven topics, intended for a competent extinguisher
  technician. Water, foam, CO2, powder and wet chemical have separate definitions.
  Discharge-assembly wording follows the equipment type; CO2 uses weight
  verification. Units without gauges receive a manufacturer-procedure pressure
  topic rather than a gauge check. No blanket disassembly or internal examination
  instruction has been added.

On a draft without an attached checklist, two compact inline controls select Monthly
Visual or Annual Basic. Explicit approved asset type determines the medium. A
verified boolean gauge configuration attaches the selected candidate immediately;
otherwise the existing inline gauge confirmation remains. Unsupported or ambiguous
equipment is not guessed. CO2 recorded with a gauge requires technical review.
The neutral screen-opening option prevents a blank draft from assuming annual
before the engineer selects the inspection type.

Every answer starts null. PASS/N/A need no notes; FAIL needs a non-whitespace reason
for local check completion. An incomplete FAIL can still be saved, and subsequent
checks remain available. Notes, actions, observations and evidence are retained.
The existing immediate result-save, text autosave, background save, guarded Back,
manual Save Draft, revision handling and explicit recovery remain in use.

These are candidate topics, not verified BS procedures. No licensed standard or
approved manufacturer-specific procedures were supplied. Both remain Pending
Validation until checked against BS 5306-3:2017 and the applicable manufacturer
instructions. No pressures, quantities, intervals or procedural thresholds have
been invented. No new staff account permissions have been granted; existing
engineer/company/site restrictions still apply.

## Compatibility and server boundary

Version-1 and version-2 eight-topic annual snapshots and three-question demos remain
reproducible and load unchanged, including notes, answers, actions and evidence.
Existing snapshots are never automatically upgraded, converted or switched to
another inspection type. Only unattached drafts show the type controls. An existing
TEST-EXT001 draft therefore continues to show its original snapshot; this change
does not replace it. The existing development-only, explicit preserve-original demo
exception remains accessible through development diagnostics.

The local structured draft schema/storage service was not replaced or migrated.
The nested service type now recognises monthly-visual. Local validation retains its
64-question bound independently of the eight-question server contract. All eleven
annual answers are rendered, saved and resumed without truncation. Old builds may
not understand the new monthly type/version; retain local data and use the updated
reader rather than downgrading or clearing app storage.

Formal submission and certification remain disabled for both types, even when all
checks are answered. No synced/successful submission state is introduced. Production
rules and their N/A contract remain unchanged. The existing emulator-only nine-check
proposal is not a solution for the eleven-check annual template; an approved future
server contract must support every answer before transport is enabled.

## Verification

- Unit tests: 129 passed, zero failed. Ten new tests cover all 18 medium/configuration/
  inspection-kind combinations, monthly no-gauge N/A, PASS/FAIL/N/A semantics,
  type selection, unknown equipment, complete eight/eleven-check offline save/resume,
  failed writes, recovery, user isolation and unchanged v1/v2 snapshots. Existing
  candidate/development-replacement assertions now expect current v3 annual counts.
- Firebase Emulator security suite: 78 passed (65 current-rule regressions and 13
  existing emulator-only proposal cases). No rule files changed or deployed. The
  existing Java rules-runtime shutdown NPE occurs after successful assertions.
- Typecheck passed. Lint passed with the same three warnings in CminCalculator,
  LoginScreen and SettingsScreen. Android Metro/Hermes export passed to
  `.expo/inspection-check`.

Native device interaction, exact small-screen layout, keyboard/large-text behaviour,
photo permissions and BS/manufacturer technical approval were not tested here.
Automated behaviour tests exercise the pure model, controller and durable store;
they are not rendered native UI tests. Initial asset verification still follows
the existing Firestore read/cache path; no new offline asset-authentication bypass
has been added.

## Expo Go checks

1. Run `npm start` and open this updated project in Expo Go. Do not clear storage.
2. Resume a pre-existing inspection. Confirm the same questions, notes, answers,
   photos and actions remain, with no automatic template switch.
3. Open an approved, identified asset with an unattached draft. Choose Monthly
   Visual and confirm actual gauge presence if requested. Verify eight rows. On a
   no-gauge unit, select N/A on the gauge row; it must request no explanation.
4. On another unattached draft, choose Annual Basic. Confirm all eleven rows,
   including the last service-label/record topic, and correct equipment wording.
5. Verify nothing is preselected. Tap PASS and N/A without typing. Tap FAIL, leave
   the reason blank, then answer the next check; return and enter a reason.
6. Save, navigate back and resume. Disconnect the network after opening; change
   answers/notes, save, background/terminate/reopen and resume. Confirm the final
   row survives and no Synced/certified/submitted state appears.
7. Check fixed Back/Save controls, first-question visibility, small screen, keyboard,
   large font and screen-reader labels. Switch user and verify private drafts are
   absent for the second account. Test damaged-copy recovery only with disposable
   development fixtures, retaining original data.

## Files changed in this stage

Under `src/modules/Extinguishers/`: pendingRoutineChecklist.ts, servicingDraft.ts,
inspectionChecklistSelection.ts, inspectionNotesController.ts,
ExtinguisherInspectionScreen.tsx, ExtinguisherServicingPanel.tsx,
ExtinguisherChecklist.tsx and InspectionDraftReview.tsx.

Under `tests/inspections/`: monthlyAnnualChecklists.test.mjs (new),
pendingRoutineChecklist.test.mjs and developmentChecklistReplacement.test.mjs.
This document is new. Navigation, calculator, asset records, draft-storage service,
office portal, Fire Alarms and Firebase rules were not modified in this stage.
