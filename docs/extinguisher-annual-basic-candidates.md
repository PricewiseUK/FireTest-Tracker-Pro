# Annual/basic candidate workflow — pending technical validation

Later UI/local-policy changes are recorded in [Simple local checklist behaviour](extinguisher-simple-checklist.md).
That update supersedes mandatory N/A reasons/actions, the local eight-question
limit and the earlier setup forms. The server-policy investigation below is historical.

This stage adds a local, review-only annual/basic workflow, not a complete or
approved BS 5306-3 servicing schedule. No final certification, server submission,
rule deployment or database migration is enabled. Navigation, calculator, master
assets, proposal/photo workflow and durable storage implementation are unchanged.

## Equipment-specific definitions and engineer controls

`pendingRoutineChecklist.ts` holds separate water, foam, CO₂, powder and wet chemical
definitions. Shared observational topics are combined with separately worded and
identified equipment-specific candidate topics. This is candidate wording authored
for technical review, not a transcription or certification of any standard.
No operating pressures, mass-loss tolerances, servicing intervals or dismantling
instructions have been supplied. Manufacturer-specific acceptance criteria and
the full servicing method remain unverified. Broad manufacturer-review prompts
are placeholders for that work, not evidence that the full method is implemented.

Each candidate has its own immutable identity, version 1, actual medium and explicit
gauge-presence configuration. All nine supported variants contain exactly eight
questions. These are intentionally limited candidate topics, not a longer approved
schedule cut down to eight. No selected definition is filtered or truncated at
runtime. Any oversized definition is rejected. Longer validated schedules must
wait for a reviewed client/server extension.

Water, foam, powder and wet chemical offer gauge/no-gauge variants only after an
engineer confirms whether the actual unit has an indicator. Unknown presence has
no default and cannot attach a candidate. No-gauge variants contain no gauge
question. CO₂ candidates support only the explicitly confirmed no-gauge variant;
an unusual gauged model is blocked for model-specific technical review. Gauge
presence never comes from capacity or medium alone. N/A appears only on candidate
questions expressly marked as allowing it, with a mandatory reason. Gauge checks
cannot be answered N/A to bypass an incorrect configuration.

The approved asset's explicit type selects the medium; unknown/specialist types,
water mist, unconfirmed construction and primary-sealed powder have no new annual
candidate here. There is no generic annual fallback. The older broad equipment
classes remain in the persisted model for compatibility, but water/foam/wet chemical
candidate identities, content and snapshots remain separate. If a saved candidate's
medium differs from the current asset, the answers are kept read-only for review.

The existing large one-tap controls are reused. Answers start null. PASS requests
an immediate device save without typing; FAIL shows mandatory notes and the existing
corrective-action/referral field. N/A needs a non-whitespace reason. Incomplete
details are saved as partial work and remain outstanding. Bold metrics now show
checks with required details, failed checks, outstanding checks and separate defect
observations. The review view shows all questions/results, notes, actions, defects
and outstanding issues, with a persistent pending-validation warning.

Notes retain the existing autosave; result taps, Save Draft, background saves,
guarded Back, exact-ID Resume and explicit damaged-copy recovery are preserved.
No local save claims server acknowledgement. Optional local evidence remains
available through the existing photo adapter; no new upload or certificate path
was added.

## Snapshot and approval safeguards

Candidates use `approval.status: "pending-technical-validation"`, never "approved".
The local validator accepts only the exact fixed candidate definition for that
medium/configuration/version. The approved-template attachment function rejects
candidates; the approved production catalogue stays empty. Each question card,
the checklist header and review explicitly identify pending content.

Existing demo/approved snapshots and answers are not automatically changed or
replaced. Candidates can attach only to a draft without a checklist after explicit
equipment/service confirmation. Old demo-bearing test drafts cannot be converted
by this stage. Use an approved test asset with an unattached draft; do not delete
old work to try the new candidates. A later historical-preserving transition needs
its own reviewed design. No bulk migration occurs. Existing saved formats remain
valid; older app versions will not understand new pending-status snapshots.

## Firestore limit investigation and safe extension proposal

Active `firestore.rules`, Firebase configuration, server types and all app/store
limits remain at eight. Merely increasing the unrolled checks to sixteen exceeded
Firestore's 1,000-expression budget. Branching once on initial creation and inlining
index bounds reduced the work, but valid 12- and 16-question updates still exceeded
the budget. Ten also failed worst-case permitted N/A and senior-engineer cases.
Those variants were rejected, not deployed or represented as passing.

The final emulator-only proposal in `tests/firebase/boundedChecklistProposal.mjs`
supports **nine** questions with the same answer field/ID/order/result/notes/N/A
checks. It changes only `validAnswers`: a maximum of nine, one initial/edit branch,
and an explicit bound/validation for every index 0–8. The existing `validAnswer`,
company/site/role/ownership gates, revision control, immutable submissions, approved
template requirement and asset/proposal protections are unchanged. A unit test
compares all rule source outside that function and verifies Firebase still targets
the original rule file. The generator refuses unexpected source structure.
No production configuration references or deploys this proposal.

`npm run test:security` now runs both the original rule suite and the proposal suite
sequentially against the guarded local demo emulator. Proposal tests check initial
unanswered answers at every position; eight/nine boundaries; zero/10/12/16/extra/
truncated rejection; wrong IDs, reordered answers, unknown fields and oversized
notes at every index; incomplete submissions; N/A reasons/permissions; maximum-length
Fail/N/A notes for engineers and assigned seniors; other engineers, companies,
unknown/unassigned roles, submitted immutability and pending/untrusted templates.

Nine is a modest bounded proposal, not an answer to arbitrarily large schedules.
For substantially longer approved checklists, the next design should use a new
versioned record contract with bounded answer pages and an immutable submission
manifest. Page ownership, completeness, revisions, template identity, cross-page
consistency, atomic finalisation and post-submission immutability need dedicated
getAfter/batch/access-budget tests. That design is proposed only, not implemented
or proven by these tests. Neither page records nor a server synchronisation
transport are introduced here.

Before enabling even nine questions: independently review the rule diff and its
budget headroom, extend all client/server contracts and local validators together,
test legacy snapshots and recovery, provision technically approved immutable
versions with exact ordered question IDs, and implement acknowledged synchronisation.
The present server answer shape also lacks local corrective-action/defect/evidence
fields; a future transport must preserve and validate these, never silently drop
them to fit the old schema. Until then, larger templates and submissions stay off.

## Sources and technical approval still required

- [BSI's BS 5306-3 scope](https://knowledge.bsigroup.com/products/fire-extinguishing-installations-and-equipment-on-premises-commissioning-and-maintenance-of-portable-fire-extinguishers-code-of-practice-1)
  identifies commissioning and maintenance as the standard's subject. Its public
  summary is not the licensed servicing schedule or approval of this content.
- [FIA's short guide](https://www.fia.uk.com/static/uploaded/cb3f79c2-e864-41c8-9a0e8aee95e5677f.pdf)
  is a summary of changes, not a substitute for the full standard/model instructions.
- [ANAF manufacturer maintenance information](https://www.anaf.eu/en/welcome-to-the-guide-area-for-the-correct-maintenance-of-our-products?lang=en)
  and its [specific FS6-LH model document](https://www.anaf.eu/archivioFiles/FS6-LH%20XF%20MAINTENANCE_rev.2%20-%2077.886E.9600.00_c_9482.pdf)
  illustrate model-specific requirements. They do not validate other manufacturers,
  these generic candidate prompts or a universal gauge/service procedure.

No licensed standard or approved company/model template has been supplied. A
competent technical reviewer must approve the exact scope, wording, procedures,
acceptance criteria, applicability/N/A rules, evidence/measurements, service-type
exceptions and completeness separately for each model/construction. A PASS on
candidate content is an engineer-entered draft observation, not approval of that
content, a completed service or compliance certification.

## Verification and Expo Go checks

Final verification: 96 unit tests and 78 emulator tests pass (65 existing security
tests plus 13 proposal tests). Typecheck, lint and Android Metro/Hermes bundling
pass. Lint retains only the three existing warnings in untouched CminCalculator.js,
LoginScreen.js and SettingsScreen.js; targeted tests/modules lint is clean. The
existing emulator Java shutdown exception follows successful assertions and exit
zero. During investigation, an endpoint-guard assertion caught a fixture address
edit before connecting; the fixture was corrected. Nothing was deployed.

Native UI layout, screen-reader/touch/keyboard behaviour and actual device photo
operations have not been tested here. Public references do not constitute technical
validation, and neither nine-question production rules nor sync/certification were
enabled or tested against production.

Expo Go, using approved test equipment with an unattached local draft:

1. Start Routine Service → site → approved water/foam/CO₂/powder/wet chemical asset.
   Confirm construction and Annual basic service. Verify the correct medium's
   pending heading, with no default gauge choice and no default answers.
2. Confirm actual gauge presence and explicitly open the pending annual candidate.
   Expect 0/8 with details, eight outstanding, zero failed checks and a pending
   label on every question. A no-gauge variant must show no indicator question.
   CO₂ with a gauge selected must be blocked. Unknown types must not select a
   generic annual checklist.
3. Tap PASS, then FAIL on another check. Blank defect/action details stay outstanding;
   enter sample notes/action and confirm the counts. Only permitted questions offer
   N/A; whitespace-only reasons remain outstanding. Review all eight responses and
   the disabled submission/certification control.
4. Save, return, Resume Inspection, restart Expo Go and edit in flight mode after
   the approved asset has been cached. Confirm stable ID, exact medium/configuration,
   answers, notes/actions and Pending Sync. Existing initial workspace/uncached
   asset reads still require network; no offline authorisation bypass is added.
5. Reopen an old demo draft and confirm its original three questions, answers and
   notes are unchanged. Do not clear local work to replace its immutable snapshot.
   Exercise failed-write retry and the existing controlled damaged-copy recovery
   flow with test copies; originals must remain retained.

Changed files: pendingRoutineChecklist.ts, servicingDraft.ts,
ExtinguisherServicingPanel.tsx, ExtinguisherChecklist.tsx, InspectionDraftReview.tsx,
ExtinguisherInspectionScreen.tsx (intro wording only), all under
src/modules/Extinguishers/; tests/inspections/pendingRoutineChecklist.test.mjs;
tests/firebase/boundedChecklistProposal.mjs, extendedChecklist.rules.test.mjs and
run-emulators.mjs; this document. Production rule files, storage implementation,
navigation and calculator files were not changed.
