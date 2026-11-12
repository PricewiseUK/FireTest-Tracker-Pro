# Calculator and safe servicing drafts — review stages

Implemented on 1 November 2026 following the user's clarification: no licensed
standards or formally approved checklists were supplied. Only area arithmetic is
enabled. Standards exceptions, actual servicing questions, BS service schedules,
formal submission and certification remain disabled.

## Stage 1 — offline calculator

Fire Extinguishers → Extinguisher Calculator opens a separate screen. The existing
CMIN fire alarm calculator is unchanged. The new calculator makes no Firebase or
network calls and remains usable in airplane mode once the app is open.

The pure module is `extinguisherCalculations.ts`. Each storey's demand is its
entered m² area multiplied by the user-requested factor 0.065. Installed rating is
the sum of quantity × actual labelled Class A rating across independent groups.
Difference means installed minus area demand. Shortfall is max(0, demand minus
installed). Additional units are the shortfall divided by an explicitly entered
proposed unit's labelled A rating, rounded upwards. No capacity, medium, assumed
13A default or product recommendation is used.

Area inputs accept up to three decimal places. Integer micro-A arithmetic avoids
rounding away a genuine shortfall near a unit boundary. Storeys are calculated
independently: another floor's surplus never offsets a shortfall. Building results
sum the independent shortfalls rather than netting them. Areas are used exactly
as entered; the tool does not establish whether gross/net area or particular
hazard adjustments are appropriate for the premises.

Operational validation bounds: 1–100 storeys; positive area up to 10,000,000 m²;
0–1,000,000 whole installed units per group; positive whole A ratings up to 10,000;
up to 1,000 rating groups per storey in the pure module. These are software bounds,
not recognised product ratings or fire-safety recommendations. A labelled rating
must be verified from the actual equipment. Negative, empty, non-finite and
non-numeric input is rejected. Decimal quantities/ratings are rejected.

Minimum extinguisher quantities, minimum combined ratings and small-premises
exceptions are **not applied**. Therefore zero arithmetic shortfall is not a finding
of adequate provision. Electrical, commercial kitchen, flammable-liquid and
specialist hazard flags produce assessment notices only, with no automatic media,
type or quantity prescriptions. Travel distance, obstructions, accessibility and
positioning require layout/site assessment; no numeric siting rule or distance
verification is represented by the app. Results are explicitly indicative.

### Source review and assumptions

Sources reviewed on 1 November 2026:

| Source | What it supports / how used |
| --- | --- |
| [BSI BS 5306-8:2023 product page](https://knowledge.bsigroup.com/products/fire-extinguishing-installations-and-equipment-on-premises-selection-and-positioning-of-portable-fire-extinguishers-code-of-practice-1) | Identifies the current selection/positioning code and its scope. The accessible product material does not validate the full operative clauses or exceptions. |
| [BSI BS 5306-3 catalogue](https://landingpage.bsigroup.com/LandingPage/Undated?UPI=000000000000139706) | Identifies the current 2017 commissioning/maintenance edition; not a supplied licensed maintenance schedule. |
| [FIA short guide to BS 5306-3:2017](https://fia.uk.com/static/uploaded/cb3f79c2-e864-41c8-9a0e8aee95e5677f.pdf) | Highlights maintenance procedure distinctions, manufacturer/safety notices and corrective-action recording. It is not a complete approved checklist for this app. |
| [British Fire Consortium public calculator](https://britishfireconsortium.org.uk/resources/fire-extinguisher-calculator) | Reviewed as public industry guidance mentioning minimum/small-premises provisions. It is not substituted for licensed clause-level technical validation. No exception or hazard prescription from it is enabled. |
| User's explicit instruction | Source of the enabled 0.065 floor-area arithmetic and decision to disable unverified exceptions and schedules. The module does not claim that this factor alone implements BS 5306-8. |

No BS tables or servicing procedures are reproduced. Public summaries and search
excerpts were not used to enable maintenance intervals, exceptions or safety
procedures. A technically competent reviewer must validate licensed/current text
and applicable manufacturer instructions before those features are activated.

### Service-date preparation

The screen accepts a YYYY-MM-DD calendar-date preview and reports invalid dates.
It deliberately calculates no maintenance due date. `APPROVED_DATE_POLICIES` is
empty. No annual/five-year/ten-year preset, tolerance or automatic equipment
schedule is supplied.

The independently tested date architecture supports strict calendar validation,
whole-month addition, month-end/leap-year clamping, policy identity/version,
equipment/service matching, declared date basis, and rejection of future recorded
basis dates relative to an explicit as-of date. Tests use synthetic policies, not
BS schedules. Calendar arithmetic uses UTC calendar parts to avoid DST/timezone
rollover. There is no inferred disposal date or service-life limit. Composite
first-service rules, manufacturer-specific exceptions, date-stamp interpretation
and approved interval values still need a validated policy model before use.

## Stage 2 — compatible structured inspection drafts

The existing inspection screen/controller/store remain in use. A new servicing
panel records confirmed equipment classification, service intent, explicit defect
status, defect descriptions/corrective actions and evidence references. Unknown
or specialist construction has no selectable service procedure. Confirmed CO₂
offers commissioning/basic/overhaul intent, while confirmed water-based and powder
classes offer commissioning/basic/extended intent. These are recording categories,
not verification of model-specific suitability, competence or completed servicing.
Primary-sealed and other manufacturer-specific exceptions require approval.
Recognised approved-type/classification discrepancies are flagged and service
intent buttons are disabled until reviewed. No class is selected automatically
from capacity or medium, and no discrepancy rewrites the approved register.

There are **zero production checklist questions**. The prepared `ApprovedChecklist`
model requires an ID/version, equipment/service applicability and technical
approval metadata. Every newly attached answer is null with empty notes/actions.
Pass/Fail/N/A controls are prepared for a future approved template; N/A requires
explicit question applicability. Draft saving tolerates incomplete explanations
while typing; progress flags missing Fail/N/A explanations, corrective actions,
defect disposition and evidence references. No question list is fabricated from
equipment medium or capacity. Definitions above eight questions are rejected,
never truncated. An attached definition/snapshot cannot be replaced in place.

`APPROVED_SERVICE_CHECKLISTS` remains empty. Technical approval metadata in a
local object is not a substitute for trusted server approval; template delivery
and verification must be implemented before any production checklist is enabled.

### Migration, history and recovery

- Version 1 checklist drafts remain readable and unchanged.
- Version 2 notes drafts remain version 2 on open and on notes-only saves.
- The first actual structured edit upgrades the same draft ID to local version 3.
  Every original raw slot is first copied to the existing user-scoped archive
  namespace and read back. If archiving fails, no active slot is upgraded.
- Notes, original asset snapshot, creation time, project/user/company/site scope
  and existing archives are preserved. A mixed v2/v3 backup pair is understood.
- Version 3 persists a structured payload plus append-only local revision/time/
  action history. Notes updates and explicit recovery append events. This is local
  provenance, not an authenticated or tamper-proof server audit trail.
- The two-copy/readback, revision-conflict, user-switch and preserve-before-repair
  protections continue to apply. Corrupt/unsupported data is never silently reset.
- Draft/archival data remains unencrypted AsyncStorage data. No passwords, tokens,
  customer/contact documents or photo binaries are added. References/notes must
  avoid personal information. There is no automatic deletion or expiry.
- Defects/evidence are bounded at 30 entries each, notes at 8,000 characters,
  per-check/defect text at 2,000, references at 1,000, history at 10,000 events and
  a serialised record at 500,000 UTF-16 code units to constrain native row size.
  Reaching a bound fails explicitly and retains existing data; nothing is evicted
  or silently truncated.

Evidence support currently means references to existing photographs/reports.
Camera capture, durable attachment-file management, upload, office evidence
review and reporting are not implemented. The UI explicitly says no image is
attached or uploaded. No certification or master-asset update occurs.

Save Draft is fixed at the bottom for one-handed use; changes use the existing
debounced autosave/background flush and guarded Back/bottom navigation. The UI
shows Saving, Saved on Device, Pending Sync or Save Failed. It cannot show Synced
or successful submission. Original v2 archive copies are retained for rollback;
an older app that cannot read v3 fails closed rather than overwriting it. Do not
clear app storage to test upgrades or rollbacks.

## Server-submission boundary

Stopped before server submission, as requested. No Firebase rule, index, cloud
path, membership or production document has changed. The existing server contract
has an eight-question validator and does not accept the new local servicing
payload or corrective-action/evidence/history fields. A subsequent review must
design and emulator-test that server contract, immutable submission snapshot,
authoritative template checks, role/site access, exact revision acknowledgement
and offline outbox/conflict behaviour before enabling any Submit control.
Larger questionnaires require a validated scalable server model first. No success
may be reported from a local save or a connectivity event.

## Expo Go test instructions

1. From PowerShell in the consolidated `engineer-app/` directory, run `npx.cmd expo start --clear`.
   Open the project in the compatible Expo Go client and sign in as an authorised
   engineer. No native dependency installation or development build is needed.
2. Open Fire Extinguishers → Extinguisher Calculator. Enter Ground floor area
   `600`, add installed groups `1 × 13A` and `1 × 21A`, then enter proposed rating
   `13`. Expect demand **39A**, installed **34A**, difference **−5A**, shortfall
   **5A** and **1** indicative additional unit at the entered rating.
3. Add an upper storey with area `200`, no installed units and proposed rating
   `13`. Expect its own **13A** shortfall and **1** additional unit. Total independent
   shortfalls are **18A**; changing Ground floor provision must not transfer a
   surplus to the upper floor. Toggle hazard flags: arithmetic must not change.
4. Try area `0`, negative/pasted text and quantity `1.5`; expect validation errors
   with no compliance result. Try date `2025-02-29` (invalid), then `2024-02-29`
   (valid calendar date, still no next-service date). Confirm exceptions, siting
   verification and maintenance schedules remain unavailable.
5. Enable airplane mode after opening the app. Repeat calculator edits and verify
   they remain functional. Calculator inputs currently live only for that screen
   session; they are not a saved building report.
6. Return to the approved asset register and open `TEST-EXT001`. Confirm existing
   notes/draft ID are retained. Confirm equipment classification from its label;
   select an appropriate **service intent only**, add a defect and corrective
   action, and record an evidence reference. Save Draft; expect Saved on Device
   and Pending Sync. The checklist and submission must remain unavailable.
7. Use header Back, Android Back and bottom navigation, then resume. Verify notes,
   intent, defects, references and original snapshot persist. Restart Expo Go and
   repeat offline resumption as supported by the existing tested startup flow.
8. On a suitable approved CO₂ test asset, confirm CO₂ classification and check
   that extended service is not offered. For a water-based classification, CO₂
   overhaul must not be offered. Unknown/specialist classification has no service
   choices. Do not treat these controls as servicing instructions.
9. Switch accounts: the next engineer must not see the previous engineer's drafts.
   Do not manually corrupt real field data to test recovery. Fault/archival cases
   are covered in automated tests; use disposable development fixtures for device
   recovery testing, retaining all original and archived copies.

Physical-device testing of these new controls is still required. The user's
successful Expo Go testing of earlier phases is retained as prior evidence, not
claimed as testing this change. Platform kill/background timing, shared-device
privacy, camera/evidence handling and live technical-template provisioning remain
outside the automated checks.

## Changed files

Stage 1: `extinguisherCalculations.ts`, `ExtinguisherCalculatorScreen.tsx`,
`ExtinguisherHomeScreen.js`, `tests/inspections/extinguisherCalculations.test.mjs`.

Stage 2: `servicingDraft.ts`, `ExtinguisherServicingPanel.tsx`,
`ExtinguisherInspectionScreen.tsx`, `inspectionNotesController.ts`,
`src/services/localInspectionDraftStore.ts`, `tsconfig.json`,
`tests/inspections/servicingDraft.test.mjs`. Module files are under
`src/modules/Extinguishers/`. This document records both stages.

No dependencies were added. Office portal, Fire Alarms, CMIN, approved records,
proposal/photo workflow, production Firebase rules and deployment configuration
are unchanged.

## Final verification results

- Unit tests: **57 passed, zero failed** (all 40 prior tests, eight calculator/date
  tests and nine structured-draft/migration tests).
- Firebase Emulator tests: **65 passed, zero failed**, demo project only. The
  previously known Storage rules runtime shutdown warning remains after successful
  assertions; the command exited successfully.
- Typecheck: passed.
- Project lint: passed, zero errors, the same three existing unused-variable
  warnings in CminCalculator.js, LoginScreen.js and SettingsScreen.js. Targeted
  lint of all changed modules/tests passed with zero errors.
- Android Metro/Hermes export: passed, output under ignored
  `.expo/inspection-check`. This is a bundle check, not a device/native build or
  deployment.
- `git diff --check`: passed.

Server submission was not started or enabled. Both review stages are complete
within the clarified approval-gated scope; the disabled capabilities listed above
require subsequent technical and server-contract work.

## Additional result-readability UI

`ExtinguisherResultCard.tsx` supplies the shared presentation for calculator and
inspection summaries: 36-size bold/tabular numbers by default, 28-size on narrow
windows or larger font-scale settings, high-contrast charcoal/black cards and
orange accents. Text scaling remains enabled. Cards stack vertically, have no
fixed height or one-line truncation, and carry explicit accessibility labels.

Required Rating, Installed Rating and Rating Shortfall are prominent separate
cards. Difference, indicative additional units and building shortfall use the same
presentation. Red marks shortfalls, amber warnings and green a positive area-only
balance; visible text always accompanies colour. Green is explicitly not a
standards-compliance finding. Results still update directly on input changes;
the calculation module, validation rules and stored data are unchanged.

Inspection progress, defect/open-defect counts and evidence-reference counts now
use this shared component. Unassessed or empty defect records do not turn into a
green serviceability result. No completed/verified servicing result is invented.
Future summaries can reuse the component with an explicit label, status and scope.

Files changed for this UI addition: ExtinguisherResultCard.tsx,
ExtinguisherCalculatorScreen.tsx, ExtinguisherServicingPanel.tsx (all under
src/modules/Extinguishers/) and this document. All 57 unit tests and 65 emulator
tests pass again; typecheck, lint and Android bundling pass. The three existing
project lint warnings remain; targeted lint of these three components is clean.

Device check: enter 500 m² and 2 × 13A installed. Expect prominent 32.5A required,
26A installed and 6.5A shortfall in red. Increase provision and confirm the area-only
balance becomes green while the non-compliance disclaimer remains. Test a narrow
phone and increased system text size: values/labels should wrap vertically without
horizontal scrolling or truncation. Physical-device layout and screen-reader
interaction for these changes have not been tested here.

## Compact calculator presentation (supersedes separate calculator result cards)

The building calculator now uses one compact results panel per storey, with
30-size bold numbers. Required and installed ratings share a row; shortfall and
the indicative `+N × labelled rating` addition sit together below. The proposed
total includes the installed rating plus those additional units. No rating is
inferred from equipment capacity or medium. Presets 8A/13A/21A/34A are input
shortcuts, not recommendations; custom whole-number ratings remain supported.
Missing or invalid additional ratings show a prompt without hiding valid base
results. A floor with no shortfall explicitly states that no addition is required
by this calculation. The redundant difference card is removed.

Installed quantity/rating/remove controls share compact rows, stacking on narrow
windows or increased font scaling. Controls retain 48-unit minimum touch heights,
text can wrap, and keyboard avoidance/drag dismissal remain available. The parent
App safe area and bottom navigation layout are unchanged. The back control is
content-width rather than a full-width outlined button. Hazard selections and
safety explanations are in a collapsible section with the flagged count visible
when closed. The inactive service-date preview has been removed from this screen;
date-policy helpers remain disabled pending technical approval. No new date
calculator route or unverified maintenance interval is enabled.

The calculation helper, Firebase rules, inspection/draft services and navigation
were not changed. Additional regression tests cover the 500 m² / 26A example,
preset/custom ratings, rounding up, mixed quantities and independent floor
proposals. Verification: all 61 unit tests and 65 local demo-project emulator
tests pass; typecheck, targeted lint and Android export pass. Project lint has
zero errors and the same three pre-existing warnings listed above. The emulator
runner exits zero; its existing Java rules-runtime shutdown NullPointerException
still appears after the successful assertions. Nothing was deployed.

Expo Go checks still required (native layout/keyboard/screen-reader behaviour has
not been tested here): open Fire Extinguishers → Extinguisher Calculator; enter
500 m², quantity 2 and labelled rating 13, then select additional 13A. Expect
32.5A required, 26A installed, 6.5A SHORTFALL, +1 × 13A and resulting total 39A.
Try a blank, zero or fractional additional rating: no quantity should be offered.
Set installed quantity to 3: expect the area-based rating met message. Add an
upper floor of 600 m² without installed units and select 21A: expect +2 × 21A,
resulting total 42A, and a building shortfall of 39A despite ground-floor surplus.
Test mixed groups, removal controls, hazard collapse/reopen retaining flags,
Android hardware back, the compact back control, flight mode, keyboard-open
scrolling, small screens and increased system text size with bottom navigation.
