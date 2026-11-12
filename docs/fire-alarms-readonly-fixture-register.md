# Fire Alarms: first read-only engineer register

Follow-on planning: the [System Checks plan](fire-alarm-system-checks-plan.md)
adds the requested service topics separately from Device Testing. It does not
alter the existing device-testing functionality or enable certification.

Development fixture stage only. No production Firestore/Storage calls, catalogue
publication, installed-equipment writes, rule changes or deployment were made.
Fire Extinguishers, its calculator/drafts, the office portal and backend catalogue
publication code are unchanged.

## Implemented flow

The existing FireAlarms dashboard card and bottom tab now open a dedicated screen.
The module home doubles as site selection to avoid an extra menu:

**Fire Alarms / example sites -> example systems -> device register**.

Every view keeps a visible **EXAMPLE DATA - READ ONLY** banner and states that
there are no live site records. Fictional names use Example Service Centre and
Example Annex, not Lincoln Business Centre or another customer location. Nothing
shown claims to be real assigned work. The prototype is gated by `__DEV__`; release
builds show an unavailable message with Back instead of fixture equipment.

Two example systems at the service centre demonstrate a referenced MxPro 5 family
and an unrecorded model/empty device register. The annex has a separately configured
example MxPro system. All model references are pinned to advanced-mxpro-5/dev-v1;
example loop and zone lists, locations and device addresses live in separate
private-shaped fixture records, never in the shared definition. Example addresses
are arbitrary labelled strings, not a manufacturer's prescribed address format.

Compact loop and zone controls filter devices with AND semantics. All loops/zones
include unrecorded devices; selected filters exclude those without a matching
assignment. Clear filters restores the complete example device list. Missing
manufacturer, model, location, address, loop and zone information is Not Recorded.
No completed/passed inspection or actual service status is inferred from a record.

Back is fixed above the scrollable content and supports Android hardware Back:
devices -> systems -> sites -> dashboard. Moving back or selecting another system
clears filters. The existing bottom navigation remains available. Lists use FlatList,
touch targets are at least 48 px, controls wrap on small screens, text can scale,
and charcoal/black/orange styling follows the existing app. No edit/test/certify
controls, extra administration screens or activity tracking were added.

## Catalogue identity and offline behaviour

The UI resolves manufacturer/model from the exact kind/model/version referenced
by an example panel. It uses a single bundled example catalogue JSON snapshot of
the emulator-tested MxPro definition. A regression test compares it exactly to
the backend input factory, preventing unnoticed drift. The app imports no backend
or Admin SDK code.

The on-screen identity source says **Bundled example catalogue - Offline available**.
This is a development snapshot, not a live server read, production approval,
entitlement acknowledgement or Synced state. If the matching definition is missing,
unpublished, malformed or ambiguous, the resolver uses only the panel's recorded
example manufacturer/model, otherwise Not Recorded. It never selects another
model/latest version or derives identity/configuration from global defaults.

Fixtures and navigation are in memory, with no persistent customer cache, outbox,
listeners, telemetry or writes. The register works without network access once the
app is loaded; initial authentication/workspace restoration still follows the
existing app's behaviour and loading the Expo bundle still needs its usual access.
Selections/filters reset on leaving the module or restarting. No inspection draft
or user work is created by this screen.

## Scope and security limits

The fixture repository captures project-independent fictional data for the current
verified app workspace/user context. Every read checks that company/user scope,
then validates site/system relationships; results are copied so consumers cannot
mutate subsequent reads. Changing company/user/role remounts the fixture screen
and clears selection. Known customer roles can inspect examples, not actual sites.
Real senior-engineer site assignments are not simulated by fictional site IDs.

These fixture checks are **not** Firebase authorisation. No real company site,
panel, device or catalogue entitlement is queried here. Real installed-panel access
remains denied under the existing unapproved module rules. The unit tests do not
establish a positive real-site permission workflow. Future integration must use
reviewed company/site/role rules and trusted backend checks, not UI filtering.
Never automatically substitute examples after a production permission/network
failure; example mode must remain explicit and unmistakable.

The existing App.js state-based navigation is retained in accordance with the
user's earlier preservation instruction. No Router migration, dependencies or
native projects were added.

## Verification

- **161 unit tests passed**: all 151 previous tests plus 10 Fire Alarms tests.
  New coverage includes fixture scope/isolation, site/system mismatch rejection,
  loop/zone AND filters and empty results, independently configured panels, exact
  pinned catalogue resolution, offline/malformed/missing fallbacks, Not Recorded,
  Back transitions, read-only copying and scope reset.
- **119 existing Firebase Emulator security tests passed**, including catalogue
  publication, real Auth-emulator retrieval and tenant/file isolation regressions
  across the separate demo projects. This UI adds no new Firebase operations or
  permissions. The known Java emulator shutdown NPE occurs after successful tests
  and zero runner exit, as in earlier stages.
- Mobile/backend typecheck passed. Lint passed with zero errors and the three
  existing warnings in CminCalculator, LoginScreen and SettingsScreen.
- Android Metro/Hermes bundling passed to `.expo/fire-alarms-register-check`.

Native Expo Go interaction, device screenshots, screen-reader/large-text behaviour,
physical equipment accuracy, real-site data retrieval and production catalogue/
offline cache integration were not tested. New automated behaviour tests exercise
the pure repository/resolver/navigation model, not rendered native interactions.

## Expo Go verification

1. Run `npm start` and reload this checkout in Expo Go. Do not clear app data.
2. Tap the Fire Alarms dashboard card, then repeat via the bottom tab. Confirm
   the tab highlights correctly and every module view shows the example banner.
3. Choose Example Service Centre -> EXAMPLE PANEL 01. Confirm Advanced / MxPro 5,
   the bundled example catalogue label, example reception and four example devices.
4. Select Loop 2: expect two devices. Also select Ground: expect only EXAMPLE D02.
   Select Loop 1 + First: expect an empty-result message. Clear: expect all four.
5. Verify EXAMPLE D04 shows Not Recorded for missing location/address/assignment.
   Back to systems and open EXAMPLE PANEL 02: expect Not Recorded identity and
   an empty register, not guessed equipment. Try Example Annex separately; its
   loop/zone choices must come from that example installation, not the first one.
6. Check on-screen/hardware Back at every level, bottom-tab switching and return,
   small screens and accessibility text scaling. The last device should remain
   visible above bottom navigation without horizontal scrolling.
7. With the app loaded, disable network and repeat the flow. The bundled example
   identity/filtering must remain available. Do not expect new live records.
8. Switch authenticated user/workspace if available. Confirm selection resets and
   no real private data is displayed. Finally reopen Fire Extinguishers and confirm
   its existing drafts/calculator navigation behave as before.

## Changed files

- `App.js`: import/route the existing FireAlarms target to the new module only.
- `src/modules/FireAlarms/FireAlarmsHomeScreen.tsx`: new development-only UI.
- `src/modules/FireAlarms/fireAlarmRegister.ts`: pure read-only fixture repository,
  scoped types, reference resolution and Back transitions.
- `src/modules/FireAlarms/fixtures/advancedMxPro5Catalogue.json`: one public example
  catalogue snapshot, kept separate from installed fixtures.
- `tests/fireAlarms/register.test.mjs`: 10 new behaviour tests.
- `tsconfig.json`: include Fire Alarms TypeScript files.
- `package.json`: include Fire Alarms tests in the existing unit command.
- This report.

## Next smallest stage

After the real catalogue adapter and module schemas/rules are reviewed, implement
an emulator-backed read-only repository for actual company/site panels and devices
with exact catalogue references, explicit missing/offline states and tenant-scoped
cache tests. Do not enable production queries or replace fixtures silently before
that boundary is approved. Editing, servicing, jobs, submission and certification
remain outside this stage.
