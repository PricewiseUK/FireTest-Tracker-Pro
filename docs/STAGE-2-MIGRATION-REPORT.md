# Stage 2 local consolidation report

Candidate: `D:\InstaFirePilot`. **The original `D:\FireTest-Tracker-Pro` remains authoritative until the owner approves this migration.**

## Directory structure

```text
InstaFirePilot/
  .git/                         Existing history, branch, index and remote
  engineer-app/                 Expo SDK 58 app, assets, manifest, lockfile, TypeScript/lint config
  office-portal/                Latest portal, unchanged
  backend/                      Existing Node 22 backend and shared job contract
  tests/                        Unit, Firebase emulator and fixture tests
  docs/                         Existing docs, reference assets and this report
  firebase.json                 Existing Functions/Hosting/rules configuration
  firebase.emulators.json       Existing local emulator configuration
  .firebaserc                   Existing project/Hosting target bindings
  firestore.rules               Authoritative original rules
  storage.rules                 Authoritative original rules
  firestore.indexes.json        Authoritative original indexes
  package.json / package-lock.json   Root test tooling and delegating scripts
  README.md
  .migration/                   Ignored checksums, file mapping, logs and native exports
```

## Files and preservation

- Original non-dependency files accounted for: 2364.
- Copied from working tree: 1935; relocated in the candidate: 84.
- Retained only in verified Stage 1 backup: 429. These are obsolete `packages` copies, generated output/caches/logs, local tool settings and the dependency ZIP, including their preserved historical material. No omitted file is lost.
- Two project-scoped copies were also made from the existing package/ESLint configuration for the engineer app; new root tooling configuration is separate.
- Five additional MASTER icons copied unchanged to `engineer-app/assets`: callpoint, heat, multisensor, relay and smoke.
- The separate Xero integration remains in the protected backup; it has not been merged into either active application/backend.
- Installed dependency files were copied into independent root, engineer, portal and backend installations. No links to original directories, package upgrades or dependency installs were used. Root tooling lockfile was regenerated offline with lifecycle scripts disabled.
- Detailed mapping and checksums: `.migration/file-migration-manifest.csv`.

## Configuration and path changes

- Mobile `App.js`, `index.js`, `app.json`, `src`, `assets`, `tsconfig.json`, package manifest and original lockfile now live under `engineer-app`.
- Four mobile imports gained one parent directory to reach the existing `backend/shared/jobContract`. The shared contract was not duplicated or edited.
- Repository tests stay at the root; their imports of mobile source now point into `engineer-app/src`.
- Engineer TypeScript includes `../backend/shared`; mobile scripts now delegate repository tests to the parent and type-check the mobile app locally.
- Root package is private test tooling plus application delegation. It has a separate tooling lockfile. Engineer/office/backend package dependency versions and lockfiles are preserved.
- Root ESLint ignores the relocated engineer app and migration evidence; engineer lint has its own existing Expo configuration. Local generated/native/env paths are ignored in Git.
- Expo entry point and asset paths still resolve within the engineer app. A minimal Metro config extends expo/metro-config and watches only the sibling backend/shared directory; native exports initially exposed that filesystem boundary, and exports were repeated after adding it.
- Firebase config, Functions source (`backend`), runtime (`nodejs22`), Hosting output (`office-portal/dist`), emulator paths, Firestore/Storage rules, indexes and project bindings are byte-identical to the originals.

Configuration and import files changed or added:

- `.gitignore`
- `engineer-app/metro.config.js`
- `engineer-app/package.json`
- `engineer-app/src/modules/Extinguishers/jobCompletionDraft.ts`
- `engineer-app/src/modules/Jobs/EngineerJobPanel.tsx`
- `engineer-app/src/services/jobSynchronisation.ts`
- `engineer-app/src/services/localJobCompletionOutbox.ts`
- `engineer-app/tsconfig.json`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `tests/fireAlarms/detectorSitingGuidance.test.mjs`
- `tests/fireAlarms/register.test.mjs`
- `tests/fireAlarms/systemChecks.test.mjs`
- `tests/fireAlarms/testingDraft.test.mjs`
- `tests/firebase/jobs.rules.test.mjs`
- `tests/inspections/assetDocument.test.mjs`
- `tests/inspections/developmentChecklistReplacement.test.mjs`
- `tests/inspections/engineerNavigation.test.mjs`
- `tests/inspections/extinguisherAssetPresentation.test.mjs`
- `tests/inspections/extinguisherCalculations.test.mjs`
- `tests/inspections/inspectionNotes.test.mjs`
- `tests/inspections/jobCompletion.test.mjs`
- `tests/inspections/localDraftStore.test.mjs`
- `tests/inspections/monthlyAnnualChecklists.test.mjs`
- `tests/inspections/newInspection.test.mjs`
- `tests/inspections/pendingRoutineChecklist.test.mjs`
- `tests/inspections/servicingDraft.test.mjs`

## Verification

| Check | Result |
|---|---|
| resolve-root | PASS |
| resolve-engineer | PASS |
| resolve-office | PASS |
| resolve-backend | PASS |
| typecheck | PASS |
| lint-office | PASS |
| lint-root | FAIL — inspect local log |
| unit-tests | PASS |
| lint-engineer | PASS |
| office-tests | PASS |
| backend-build | PASS |
| office-build | PASS |
| engineer-android-export | PASS |
| engineer-ios-export | PASS |
| security-tests | PASS |

Test totals:

- Unit tests: 222 passed; 0 failed.
- Office Portal: 231 passed; 0 failed (21 files).
- Demo-emulator security tests: 151 passed; 0 failed.
- .security-accounting-results.log: 15 passed; 0 failed.
- .security-catalogue-results.log: 41 passed; 0 failed.
- .security-jobs-results.log: 17 passed; 0 failed.
- .security-results.log: 78 passed; 0 failed.

- Structural integrity: PASS.
- Protected backup: 2447 files rehashed; unchanged: True.
- Original source and Git status unchanged: True.
- Backend source unchanged: True. Portal source, including scheduling and callout modules, unchanged: True.
- All authoritative Firebase config/rules/indexes checksums match: True.
- Git refs, HEAD, index, local config and branch preserved; `git fsck --full` exit 0. Exactly one repository: True.
- Candidate Git status: {' D': 39, ' M': 4, '??': 273}; nothing has been staged. Root app-file deletions reflect their relocation into engineer-app; the 29 pre-existing website deletions remain unresolved.

## Existing issues and migration limits

- Root lint was repeated after backend compilation, resolving the initial six missing generated-import errors. Remaining Buffer errors are pre-existing. Stage 1 root lint already had 24 Buffer no-undef errors and 5 warnings, including stale generated backend/lib and local Firebase helper files. Those generated files were left in the backup. Remaining unchanged source-test lint errors are pre-existing; no lint fixes were applied.
- Engineer source warnings (duplicate Firebase import/unused identifiers) and the portal React Date purity warning are pre-existing. Treat any additional result differences as unresolved until investigated.
- The host has Node v24.18.0; backend engines 22 and Firebase runtime nodejs22 are preserved. These checks do not certify Node 22 runtime execution.
- All existing suites passed: 222 unit tests, 231 portal tests and 151 guarded demo-emulator security tests (604 total). Emulator shutdown emitted a Java NullPointerException warning after successful suites; runner exit was zero. Portal build retains a large-chunk warning. Root lint remains at 13 pre-existing Buffer errors (10 in generated output, 3 in unchanged tests); engineer/portal lint have warnings only.
- Native exports validate bundling, not APK/IPA signing, installation or device behaviour. No cloud/native build, production connection, deployment, commit, push, branch switch, merge, reset or clean was performed.
- Security checks use only the existing guarded demo-project emulators. Passing existing suites does not establish missing cross-tenant coverage for all equipment modules; production release still requires the project policy review/tests.

## Website decision

- Independently maintained root: `D:\Instafire Pilot Website\website`.
- Historical comparison: {'different': 17, 'identical': 12}; 71 additional current source/config/asset files (generated and archived copies excluded from comparison).
- Its deployment notes describe a separate public Hosting site, package and release process. Recommend keeping it separate for this stage and considering a future `website/` folder only after the owner confirms this root as authoritative and resolves the old deletion intent.
- Neither the independent site nor the historical website was merged, restored or modified. Detailed comparison: `.migration/website-comparison.json`.

## Handoff

**This remains a local consolidation candidate. Do not switch authoritative development to it until the owner approves the migration.** Review any failed verification before approval. Originals and protected backup remain the recovery source. Stop after local consolidation and verification.

Stage 3 clarification: the 39 deleted tracked paths comprise 29 historical website files, nine mobile source/config/asset relocations, and one local `.claude/settings.json` file preserved in the protected backup. The local settings file was not a mobile relocation.
