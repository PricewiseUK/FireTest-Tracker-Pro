# Stage 3 final verification and GitHub preparation

Candidate: `D:\InstaFirePilot`. Original `D:\FireTest-Tracker-Pro` and protected backup remain unchanged. The original remains authoritative until the owner approves the switch. No staging, commit, push, merge, deployment or live Firebase writes occurred.

Assessment: **Ready for a selective application checkpoint, with the website boundary and optional binaries held separately.**

## Source and configuration

- Entry-point/required-asset checks: {'engineer_main_exists': True, 'engineer_registers_root': True, 'configured_assets_exist': True, 'office_html_exists': True, 'office_entry_exists': True, 'backend_entry_exists': True, 'backend_runtime_22': True, 'firebase_runtime_22': True}.
- Missing literal imports: 0; runtime/build/test references to original project paths: 0. Historical documentary references are intentionally retained.
- All original source/configuration files were accounted for in Stage 2; 84 relocation records are retained in `.migration/stage3/relocations.json`. Nine tracked mobile paths pair with additions under engineer-app. `.claude/settings.json` is a separate local-settings removal, not a relocation.
- Root `.gitignore` now covers dependencies, caches, generated output, logs, environment files, keys, local Firebase artifacts and temporary archives. The blanket `**/lib/` ignore was removed; only backend/lib is known generated. Placeholder `.env.example` files stay visible.
- Proposed source, rules, security tests, app config, assets and lockfiles were checked against ignore rules; no proposed file is accidentally ignored.
- Explicit `node:buffer` imports were added to three backend TypeScript files and the accounting test. Source behaviour is unchanged. ESLint excludes exactly backend/lib, the generated output directory, without disabling lint rules or suppressing warnings.
- One operational document now points to the consolidated engineer-app directory. Stage 2 documentation clarifies the local-settings deletion count.

## Node 22 verification

- Runtime: `v22.23.5`. Official portable archive verified with SHA-256 `4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3`.
- Source: https://nodejs.org/dist/v22.23.5/node-v22.23.5-win-x64.zip. Download checksum manifest: https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt.
- Node was extracted only under ignored `.migration/stage3/tools`; no installed runtime, app dependencies, lockfiles or Firebase runtime setting were changed. All commands and child npm/node processes used this Node 22 path.
- Backend engines remains 22; Firebase runtime remains nodejs22.

## Complete verification

| Check | Result |
|---|---|
| node22-runtime | PASS |
| backend-build | PASS |
| backend-deployment-typecheck | PASS |
| typechecks | PASS |
| engineer-and-shared-unit-tests | PASS |
| office-production-build | PASS |
| office-tests | PASS |
| lint | PASS |
| engineer-android-production-export | PASS |
| engineer-ios-production-export | PASS |
| backend-and-firebase-security-tests | PASS |

- Engineer/shared/catalogue unit tests: {'tests': 222, 'pass': 222, 'fail': 0}.
- Office Portal: 231 tests passed.
- Backend and Firebase security suites: 151 passed (jobs 17, accounting 15, inspections 78, catalogue/fire alarms 41).
- Total existing tests passed: **604**.
- Backend has no separate test script; its shared-contract/catalogue tests run in the unit suite, and job/accounting/catalogue service plus rules coverage run in the isolated security suites.
- Root lint: zero errors after source imports/generated-output handling. Engineer lint retains five existing duplicate-import/unused-variable warnings. Portal lint retains one existing Date purity warning; it was not suppressed or changed because that would affect render behaviour.
- Portal build may retain its existing large-chunk advisory. Emulator teardown may emit its existing Java rules-runtime shutdown warning after successful suites; runner exit codes above determine the result.

## GitHub checkpoint proposal

- Branch: `Instafire-office-portal`. Fetch/push remote matches `PricewiseUK/FireTest-Tracker-Pro`. Repository privacy is user-provided; no authenticated GitHub visibility query or push was performed.
- Git status counts: {' D': 39, ' M': 4, '??': 276}; index is unchanged and nothing was staged.
- Proposed paths: **286**; held paths: **33**. Exact path/status/category/action/reason list is `docs/STAGE-3-COMMIT-MANIFEST.csv`.
- Include the engineer app, latest portal, backend, rules/indexes/project config, security and unit tests, useful docs and lockfiles. Pair the nine old mobile paths with their new engineer-app paths. Recommend untracking the local .claude settings in the future checkpoint; no content is deleted now.
- Hold all 29 historical website deletions; two optional opaque reference/design binaries pending confidentiality review; and two unreferenced React/Vite starter images. Held files remain preserved locally or in history/backup.
- A normal specific-branch push would exclude local refs/codex checkpoint refs. Do not use --mirror or push private checkpoint refs. All local blobs were scanned, with current branch history distinguished from checkpoint/unreachable material.

## Secrets and large files

- Working/project files scanned: 278; local Git blobs scanned: 3979. Unresolved secret candidates: 0. Archive-review issues: 0. No credential values are printed or stored in the reports.
- Firebase client API identifiers are present in client configuration and some local checkpoint objects; they are not service-account/admin private keys. Rules and service authorisation were kept unchanged and exercised only against demo emulators.
- Candidate source/config files over 10 MiB: 0. Large historical/checkpoint blobs: 4; exact scope/path/size list remains in ignored `.migration/stage3/secret-review.json`.
- The offline scan does not validate credential liveness or guarantee detection of every format; opaque optional binaries are held for owner review. No credentials were uploaded.

## Website boundary

- Independent root: `D:\Instafire Pilot Website\website`. Across 29 historical paths: {'different': 17, 'identical': 12}. The site is public marketing/product content with separate dependencies, navigation, SEO and public Hosting configuration.
- Recommend a separate documented boundary commit only after owner confirmation of the authoritative website. Keep earlier versions in history. Do not restore, merge or stage these deletions automatically.
- Until resolved, the proposed selective app checkpoint would still contain the old website files in a fresh checkout, although they are absent locally and unused by app/backend scripts. See `docs/website-boundary-review.md`.

## Integrity and outstanding decisions

- Original source files rechecked: 2365; changed/missing: 0. Original Git status unchanged: True.
- Every protected-backup file, including Stage 1 reports, rechecked: 2465; changed/missing: 0.
- Firebase config/rules/index checksum matches: {'firebase.json': True, 'firebase.emulators.json': True, '.firebaserc': True, 'firestore.rules': True, 'storage.rules': True, 'firestore.indexes.json': True}. Git refs, HEAD, index and local config preserved. Git fsck exit 0.
- Outstanding: owner approval to switch authoritative development; website boundary decision; optional binary review; existing frontend warnings and release-level security/device checks.
- Passing existing emulator suites does not establish complete tenant-isolation coverage for every equipment module or authorise production changes.

**Stopped before staging, committing or pushing.**
