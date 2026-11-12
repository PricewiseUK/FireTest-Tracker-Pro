# Simple local checklist behaviour

This supersedes the earlier UI requirements for mandatory N/A reasons, corrective
actions and defect-status completion. Existing navigation, calculator, assets,
Firebase rules and durable draft-storage implementation are unchanged. No
draft-selection menus, new-inspection flow or approval steps were added.

- Every displayed check has large PASS / FAIL / N/A buttons, initially unanswered.
- PASS and N/A are one tap with no note or other required field.
- FAIL opens “Why did this check fail?” Its reason is required, but a partial FAIL
  can be saved while typing and does not disable any later questions. Whitespace
  is not a valid failure reason. A corrective action is optional.
- Answered and failed counts are prominent. Unanswered checks and missing FAIL
  reasons remain visible without blocking navigation to other checks or draft saves.
- Result taps request immediate device saves; text uses the existing autosave.
  Explicit Save Draft, resume, revision protection, user isolation, background saves,
  guarded departure and explicit damaged-copy recovery remain in use.
- Old N/A explanations, failure notes and actions are kept when changing an answer.
  They are available as optional saved details, never erased or made mandatory for
  PASS/N/A. Optional defect observations, evidence and saved-detail viewing are
  collapsed away from the primary answer/save flow.

For a known approved asset with no attached checklist, the old construction/service
forms and separate checklist-opening button are removed. Confirming the actual
gauge presence opens the matching pending annual/basic candidate directly. The
medium comes from the explicit approved type, never capacity. Unknown types or
conflicting saved identification are not guessed or overwritten. Existing unusual
construction/non-annual intent is preserved rather than silently reclassified.
No new identification form has been added.

New candidate attachments use shorter version-2 prompts with a distinct ID. The
version-1 generator remains reproducible so existing pending snapshots can still
be validated and resumed unchanged. Existing demo snapshots remain unchanged too;
they are not automatically upgraded or replaced. Version-2 content remains Pending
Technical Validation and is not a complete or approved BS servicing schedule.

## Local length and unchanged server policy

Structured local servicing drafts now support up to 64 questions independently of
the server's eight-question limit. The checklist renders every supplied question;
there is no slicing/truncation. The 64-question device bound is explicit, with the
existing total-record size check still in force. Oversized work returns a storage
error and is not silently discarded. This does not invent additional candidate
questions: current fixed candidate definitions still contain eight topics. Synthetic
12-question fixtures prove save/resume/recovery of every supplied check, including
the final answer; no synthetic template is activated in the app.

Legacy `allowNA` snapshot metadata remains intact, but the local servicing UI/model
now permits one-tap N/A for every displayed check. This intentionally differs from
production server validation. The older server-bound schema-1 draft validation,
production rules and emulator-only bounded-rule proposal are unchanged; those still
require N/A explanations and enforce their own question bounds. Submission and
certification remain disabled. A future transport must redesign that contract; it
must not add invented N/A explanations, drop answers, truncate a checklist or claim
successful submission under the current rules. Older app builds may not understand
new N/A/longer-draft data; use the updated reader rather than clearing local data.

## Verification and device checks

101 unit tests pass, including one-tap PASS/N/A, required FAIL reasons, continuing
after FAIL, saving incomplete work, old notes/actions/version-1 preservation,
12-question save/resume/recovery and explicit local-bound rejection. The pre-existing
tests were updated where they asserted the superseded local N/A/action requirements;
production-rule tests were not weakened. All 78 emulator tests pass (65 current-rule
regressions, 13 existing emulator-only proposal tests). Typecheck, lint and Android
Metro/Hermes bundling pass. Lint retains the same three warnings in untouched files.
The existing Java emulator shutdown exception follows successful assertions/exit zero.
Nothing was deployed.

Expo Go checks still required: open an existing inspection; tap PASS and N/A and
confirm neither opens a mandatory field; tap FAIL, leave its reason blank and
answer the next check; confirm only FAIL asks why. Save/resume offline, enter a
FAIL reason with no corrective action, and confirm saved notes survive restart.
Open a version-1/demo draft and confirm its snapshot and old N/A explanations are
kept. On an unattached test draft, confirm actual gauge presence and verify the
short pending version-2 questions. Check small screens, large text, keyboard and
screen-reader controls. Native interaction/photo operations have not been tested
here; initial workspace/uncached-asset reads still use existing network/cache checks.

Changed files: servicingDraft.ts, pendingRoutineChecklist.ts,
ExtinguisherChecklist.tsx, ExtinguisherServicingPanel.tsx and
InspectionDraftReview.tsx under src/modules/Extinguishers/;
tests/inspections/servicingDraft.test.mjs and pendingRoutineChecklist.test.mjs;
this document and clarification links in the two earlier checklist reports.
