# Engineer checklist UI — local demonstration stage

See [Simple local checklist behaviour](extinguisher-simple-checklist.md) for the
current one-tap N/A and FAIL-reason-only local requirements. This earlier report
describes the prior UI policy; existing saved snapshots are still preserved.

The existing approved-asset inspection screen now hosts a reusable compact
checklist and a review view. Navigation, asset reads, durable draft storage,
save/recovery guards and all Firebase rules are preserved. No dependencies,
production data, office portal, Fire Alarms or calculator files were changed.

## What works

- Every attached question starts unanswered. PASS records a result and requests
  an immediate device save without requiring typing. FAIL shows a mandatory
  defect note and the existing corrective-action/referral requirement. Incomplete
  notes/actions are saved as partial drafts; they do not count as checks with all
  required details. N/A is absent unless the template permits it and requires a
  reason. Existing notes/actions survive changes of outcome and can be expanded.
- Bold progress distinguishes answers from checks with required details, and
  shows failed-check counts. No Pass All exists. Per-question commands merge
  against current controller state, including during an in-flight local write.
- Note edits use the existing 500 ms autosave; result taps request an immediate
  save. Explicit Save Draft, background save, guarded departure, scoped resume,
  revision protection and explicit damaged-copy recovery remain available.
- Equipment identity comes from the existing asset view, without repeated forms.
  Equipment construction/service intent is confirmed once, then replaced by a
  compact template label. Defect observations, status and evidence references are
  retained behind an expandable section. Engineer notes remain editable.
- Review displays the asset identity, template/version, each result, missing
  details, notes, defect observations, evidence counts and outstanding issues.
  Both the on-screen back control and Android hardware back return to checks
  first. Leaving the inspection still uses the existing save guard.
- A failed check can select an optional existing photo from the system library.
  Expo FileSystem copies it to app document storage scoped by Firebase project,
  user, company, site and inspection ID. Only its local reference is saved in the
  existing evidence array; no image bytes, EXIF object or token enter AsyncStorage.
  Files are not uploaded or deleted on save failure. Session checks before/after
  selection and copying prevent attaching evidence to another user's draft.

## Deliberate limits

There are no technically approved production questions: the approved-template
catalogue remains empty. The opt-in three-question demonstration exercises only
UI controls, with `approval.status: "demonstration"`, explicit DEMO prompts and a
fixed version scoped to equipment/service intent. It contains no BS servicing
instructions. It cannot be passed to the approved-template attachment function,
and the local validator accepts only the exact demonstration definition.
Submission/certification remain unconditionally disabled, even when all demo
checks have details. No Firestore inspection is created or synchronised.

Demonstration attachment is explicit and preserves all existing notes/observations.
As with earlier approved snapshots, an attached snapshot cannot be replaced or
cleared. Use a test asset/draft to exercise the demo. A later move from such a demo
draft to live approved servicing will need a reviewed transition preserving the
demo history; no such migration is enabled here. Older builds that do not know
the demonstration status cannot open these new demo-bearing drafts, but existing
drafts retain their previous structure and remain valid. No bulk migration runs.

The eight-question maximum is unchanged and larger definitions are rejected,
never truncated. Required corrective-action/disposition rules are preserved.
Local photos are optional and selected from the library; camera capture, photo
preview, upload, managed retention and certification are not included. App sandbox
storage/AsyncStorage are not app-level encrypted. Avoid people/personal data in
evidence. A copied file can remain orphaned if the app terminates before its draft
reference is durably saved; it is retained for manual recovery, never silently
deleted. There is no automatic orphan-file recovery or cleanup in this stage.
Device removal/clearing app storage loses local work; no server backup is claimed.

## Verification and Expo Go checks

Automated tests exercise PASS, FAIL, permitted/forbidden N/A, mandatory notes,
unanswered progress, preservation of previous notes, demo-versus-approved status,
offline save/resume, failed writes/retry, rapid edits during writes, damaged-copy
recovery, user switching and optional-photo cancellation/copy/save/session failures.
Native picker/FileSystem operations are behind an adapter and are mocked in unit
tests; Android bundling/typechecking verifies imports, not device behaviour.

On a test asset in Expo Go:

1. Open Fire Extinguishers → asset register → Start / Resume. Confirm existing
   equipment details and notes. Confirm equipment construction and service intent,
   then explicitly start the labelled demonstration. Expect 0/3 checks with
   required details and no initial results. Do not use this for actual servicing.
2. Tap PASS on question 1. Expect immediate selection/save without a text field.
   Question 1 must have no N/A control; the other questions stay unanswered.
3. Tap FAIL on question 2. Expect one failed check, required defect/action fields
   and partial progress. Enter sample defect/action text. Optionally select a
   photo; cancel once, then select one. Check device-save status and local count.
4. Choose N/A on question 3; leave the reason blank/whitespace and confirm it does
   not count as having required details. Enter a reason, then review the draft.
   Confirm missing status/disposition issues remain visible and submission is
   disabled. Return to checks and change FAIL to PASS: previous notes stay kept.
5. Save, leave, reopen, restart Expo Go and repeat with flight mode enabled after
   the approved asset has been cached. Confirm notes/results/references resume,
   with Pending Sync and no Synced/submission claim. Initial asset verification
   still depends on the existing Firebase read/cache behaviour.
6. Exercise the existing explicit draft-recovery flow on a controlled damaged
   test copy; do not clear production/local unsynchronised data. Switch users and
   confirm private drafts/photos are not shown to the next engineer.
7. Check small phones, increased system text size, screen reader labels, keyboard
   dismissal, Android back and bottom navigation. Controls wrap, retain large
   touch targets and do not use fixed card heights.

Physical-device layout, screen reader, permissions, image selection and actual
photo persistence across OS/app restarts still require those Expo Go checks.

Automated results for this stage: 74 unit tests and 65 Firebase Emulator tests
passed. Typecheck, lint and Android Metro/Hermes export passed. Project lint has
zero errors and three existing warnings in untouched CminCalculator.js,
LoginScreen.js and SettingsScreen.js. Targeted lint of the changed modules/tests
is clean. The emulator runner exits zero; its existing Java rules-runtime
NullPointerException appears on shutdown after successful assertions.

Changed files: ExtinguisherChecklist.tsx, InspectionDraftReview.tsx,
ExtinguisherInspectionScreen.tsx, ExtinguisherServicingPanel.tsx, servicingDraft.ts,
inspectionNotesController.ts, inspectionPhotoAttachment.ts and
inspectionPhotoAdapter.ts under src/modules/Extinguishers/;
tests/inspections/servicingDraft.test.mjs; and this document.
