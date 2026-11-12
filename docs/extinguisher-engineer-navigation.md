# Engineer navigation — small local-first stage

The existing component/state navigation remains in use. The Fire Extinguishers
home now offers Start Routine Service, Resume Inspection, View Asset Register,
Building Calculator and a genuinely disabled Service History action. No Router
migration, new inspection workflow, servicing questions, submission or
certification has been introduced.

## Routes and Back behaviour

- Routine: dashboard → site selection → approved extinguisher list → existing
  inspection editor. Site selection lists available sites immediately and
  supports search from the first character. Back from the list returns to sites;
  Back from the editor saves through the existing guard and returns to that list.
- Resume: dashboard → own device drafts → the same inspection editor. The selected
  inspection ID is loaded explicitly. A missing/mismatched ID never creates a
  replacement. Back returns to Resume and refreshes its list after saving.
- Register: dashboard → existing site search → building details → asset lookup or
  proposal. This route preserves the existing proposal/photo workflow. The only
  proposal-screen change makes Android back match its existing fixed Back button:
  navigation is blocked while its upload/submission is running.
- Calculator: existing calculator screen and arithmetic unchanged.
- Each screen has a fixed Back control outside its scrollable content. Android
  back is handled by the visible child; parent screens defer to inspection save
  guards and proposal submission protection. The editor's existing review view
  still returns to checks before leaving. Asset verification/loading/error states
  also have a hardware-back handler.

## Scope, privacy and compatibility

New navigation metadata contains only site IDs/names and up to three recent IDs,
namespaced by Firebase project, authenticated user and company. Labels are cached
only when selecting a site from the loaded company list. Contacts/addresses are
not copied into this metadata. The old company-only recents key is not read or
migrated; its data is left untouched. The latest selected site is highlighted and
placed first for routine selection, never auto-opened. A cached ID absent from
the current loaded/filtered site list cannot appear as a selectable recent site.
Preference-write failures do not prevent work; they may mean the last site is
not remembered. Corrupt metadata is retained and reported by Resume rather than
silently overwritten. The label cache is bounded to 500 sites; evicting a label
never removes a draft.

The local store only adds discovery of site namespaces under the current
project/user/company prefix. All records still pass through its existing scoped,
validated list/load/save/recovery services. Resume returns minimal summaries,
not the draft answers/notes. Session epochs are checked after asynchronous I/O.
Home state is keyed by company/user, and Resume clears private display data when
authentication changes. Known recovered copies are offered for explicit recovery;
unreadable sites generate a warning without preventing other sites from listing.
No damaged record is deleted, replaced or silently turned into a new draft.

Existing role policy is unchanged: standard engineers retain legacy company-wide
inspection access; senior engineers require the existing site assignment; unknown
and office roles cannot resume private inspection drafts through this route.
This stage adds no mandatory siteIds migration and does not enable new roles in
production. The existing workspace verification, approved-asset read and inspection
role/site checks remain in force. Master assets, rules and draft schemas are
unchanged. Drafts continue to show Pending Sync without any server-submission claim.

## Verification and limits

88 unit tests pass, including new route/back transitions, safe recent ordering,
minimal metadata persistence, project/company/user isolation, senior site filtering,
exact-ID resume, missing/mismatched/legacy drafts, failed-save departure guards,
damaged-copy recovery, corrupt-site isolation and authentication changes during
enumeration. All 65 demo-project Firestore/Storage Emulator tests pass. Typecheck,
project lint and Android Metro/Hermes bundling pass. Project lint retains its three
existing warnings in untouched CminCalculator.js, LoginScreen.js and SettingsScreen.js.
The emulator exits zero; the existing Java rules-runtime shutdown exception follows
successful test assertions. Nothing was deployed.

Native navigation/touch/screen-reader behaviour has not been device-tested here;
the route helpers and actual storage/controller interactions are unit-tested.
Draft listing works offline. Opening an editor still uses the existing approved
asset read, so offline opening depends on that asset being cached by Firebase.
Initial login/workspace verification and uncached sites/assets still need network
access. Names not previously cached show the site ID with an explicit fallback;
no site name is guessed. Earlier schema-1 structured drafts are listed as retained
but cannot be opened by the current notes/servicing editor. No implicit conversion
or replacement is performed. A site whose copies are wholly unreadable requires
storage/recovery assistance; the directory cannot display information it cannot
safely validate.

## Expo Go checks

1. Open Fire Extinguishers. Confirm the five named actions, visible large touch
   targets and disabled Service History. Open/return from Building Calculator.
2. Start Routine Service: sites should appear without opening a building-details
   page. Select Lincoln Business Centre, choose TEST-EXT001, and confirm the same
   approved asset details and existing notes/draft ID. Back should save and return
   to the approved list, then to sites, then to the module dashboard.
3. Resume Inspection: confirm only your current company's device drafts, cached
   site names (or explicit site-ID fallback), asset reference and one-tap Resume.
   Open the same draft, edit a note, leave, reopen and restart Expo Go. Confirm the
   same draft ID and saved content. Repeat offline after caching the approved asset.
4. Re-enter Routine Service. Confirm the last selected accessible site is first
   and marked, but is not opened automatically. A newly unassigned senior-engineer
   site must not remain selectable from recents or Resume.
5. View Asset Register: confirm existing building details, lookup and proposal/photo
   entry still work. Test on-screen/Android back, including upload-busy protection,
   using a test proposal; do not create production test data unnecessarily.
6. Confirm failed draft writes still keep the editor open and preserve text for
   retry, and existing damaged-copy recovery requires explicit confirmation.
7. Sign out/switch users and companies. Confirm previous private draft rows and site
   labels are absent. Return to the original user: its local drafts should remain.
8. Check small screens, larger system text, keyboard visibility, fixed back controls
   and bottom navigation. No Firebase rules deployment or database migration is
   needed for this stage.

Changed files: ExtinguisherHomeScreen.js, ExtinguisherBuildingsScreen.js,
ExtinguisherAssetRegisterScreen.js, ExtinguisherInspectionScreen.tsx,
ExtinguisherProposalScreen.js (Back handler only), ExtinguisherResumeScreen.tsx,
engineerNavigation.ts, engineerNavigationStorage.ts and inspectionNotesController.ts
under src/modules/Extinguishers/; src/services/localInspectionDraftStore.ts and
inspectionDraftStorage.ts; tests/inspections/engineerNavigation.test.mjs; this document.
