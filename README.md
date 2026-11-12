# InstaFirePilot â€” local consolidation candidate

This directory is a review candidate. D:\FireTest-Tracker-Pro remains authoritative until the owner approves this migration. No production resources were changed.

- `engineer-app/`: existing Expo SDK 58 app, entry points, assets and mobile dependencies.
- `office-portal/`: latest scheduling/callout/accounting portal, unchanged.
- `backend/`: existing Firebase Node 22 backend and pure shared job contract.
- `tests/`: repository unit and local Firebase emulator tests.
- `docs/`: existing documentation, references and Stage 2 migration report.
- Root `firebase.json`, `firebase.emulators.json`, `.firebaserc`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`: authoritative Firebase configuration.

Use `npm start`, `npm run typecheck`, `npm run test:unit`, `npm run test:office`, `npm run test:security`, `npm run lint:root`, `npm run lint:engineer`, `npm run lint:office`, `npm run build:backend` and `npm run build:office` from this root. Use Node 22 for the backend as specified by its existing package and Firebase runtime configuration. Dependencies were copied into this candidate; to reinstall independently use `npm ci` at the root, engineer-app, office-portal and backend. No workspaces or shared installation links were introduced. The engineer lockfile and its dependency versions are preserved.

Existing root tests deliberately remain at repository root because their Firebase rules, fixtures and backend paths are rooted here. Mobile imports now point into engineer-app. Pure shared job contracts remain in backend/shared. App identity, business logic and security rules are unchanged. Metro extends the SDK 58 defaults with a watch folder for the single sibling backend/shared directory; native exports validate cross-directory shared-contract resolution. Build the backend before root lint so its generated test imports exist.

Website: D:\Instafire Pilot Website\website remains separate. Historical website deletions remain uncommitted. Do not restore, merge or deploy the website without confirming its authoritative source.

The separate older Xero tree, obsolete packages copies, generated artifacts, logs and office-portal.zip remain preserved in D:\INSTAFIRE PILOT BACKUP 2026-11-12; they were not placed in active code paths. All five unique MASTER icons are in engineer-app/assets.

Migration checks, original-to-new file mapping and local logs are under ignored .migration/. Do not upload the protected backup or local credentials. No commit, push, reset, clean or deployment is part of this migration.
