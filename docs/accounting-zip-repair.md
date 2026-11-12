# Repair of accidental accounting ZIP extraction

## Diagnosis and evidence

Ran `git status --short` and `git diff --name-status` before modifying files.
The office portal, backend, security rules and accounting documentation are
untracked in this working tree, so Git alone cannot recover their earlier state.
Existing tracked changes to the engineer app, marketing website, package files
and other work were preserved; no Git reset or restore was used.

Compared the current portal against both existing archives without extracting
either broadly. Current non-environment source/configuration files matched
`office-portal-xero-integration.zip` byte-for-byte. The older `office-portal.zip`
contains the intended office implementation described by
`docs/accounting-integrations.md`, including the original accounting page,
workspace permissions, isolated emulator configuration and Firebase dependency.

The accidental archive changed eight existing office files and added 21
non-environment code/configuration files. It introduced a second backend under
`office-portal/functions`, a nested Firebase configuration selecting that backend
with Node 20, and an alternative frontend split across hooks/components/services.
The intended deployable backend remains `backend/accounting` under the root
Firebase configuration with Node 22. The accidental README also described its
alternative backend and App Check behaviour rather than the preserved backend.

The proposed file-specific restoration/deletion list was displayed in chat
before any deletion. Immediately before changes, each affected file was checked
again against the accidental archive. Each deletion target was also verified
absent from the older archive. All operations stayed inside the resolved
`D:\FireTest-Tracker-Pro\office-portal\` directory, using individual literal paths.

## Restored files

Restored exactly these eight entries from the older `office-portal.zip`:

- `office-portal/src/App.jsx`
- `office-portal/src/firebaseConfig.js`
- `office-portal/src/pages/AccountingIntegrations.jsx`
- `office-portal/src/pages/AccountingIntegrations.css`
- `office-portal/package.json`
- `office-portal/vite.config.js`
- `office-portal/.gitignore`
- `office-portal/README.md`

`office-portal/package-lock.json`, the lint configuration, existing layout,
dashboard, assets and public files matched both archives and were left intact.
No dependency reinstall or environment configuration change was necessary.

## Removed files

Each of these 21 files was byte-identical to the accidental archive and absent
from the older snapshot and original implementation manifest:

- `office-portal/src/services/accountingApi.js`
- `office-portal/src/hooks/useAccountingIntegration.js`
- `office-portal/src/components/accounting/ProviderCard.jsx`
- `office-portal/src/components/accounting/InvoicePreview.jsx`
- `office-portal/firebase.json`
- `office-portal/firestore.accounting.rules.fragment`
- `office-portal/functions/package.json`
- `office-portal/functions/package-lock.json`
- `office-portal/functions/src/index.js`
- `office-portal/functions/src/accounting/access.js`
- `office-portal/functions/src/accounting/audit.js`
- `office-portal/functions/src/accounting/crypto.js`
- `office-portal/functions/src/accounting/invoice.js`
- `office-portal/functions/src/accounting/oauth.js`
- `office-portal/functions/src/accounting/service.js`
- `office-portal/functions/src/accounting/providers/AccountingProvider.js`
- `office-portal/functions/src/accounting/providers/MockXeroProvider.js`
- `office-portal/functions/src/accounting/providers/XeroProvider.js`
- `office-portal/functions/test/access.test.js`
- `office-portal/functions/test/crypto.test.js`
- `office-portal/functions/test/invoice.test.js`

## Preserved material

Environment files and credentials were excluded from restoration, deletion and
archive-content comparisons. In particular, the archive-added `.env.example`
files remain untouched, including `office-portal/functions/.env.example`. Empty
duplicate source directories can remain; no recursive directory deletion was used.
Both ZIPs and the separate `office-portal-xero-integration/` extraction remain
untouched as recovery evidence and are outside the configured build/deploy paths.

The original `docs/accounting-integrations.md`, all `backend/accounting` sources,
backend package/configuration files, accounting test suite, emulator runner,
root Firebase configuration, Firestore/Storage rules and indexes were preserved.
Protected-file hashes were recorded before the repair under the existing ignored
`.firebase/` directory and compared after the repair. No other application module
was edited. Test/build commands regenerate their usual ignored output files.

The accounting integration remains mock-only with its original live-access gate.
No live Xero request, Firebase deployment or production data operation occurred.

## Verification

All 30 non-environment source/configuration/asset files in the older office
snapshot match their archive hashes after repair. Generated `dist` files are
excluded from that comparison because the production build regenerates them.
All 59 protected existing files match the pre-repair SHA-256 snapshot.

Completed checks:

- `npm run test:unit`: **207 passed**, no failures.
- `npm run typecheck`: passed for the root app and backend.
- `npm run lint`: passed with the two existing unused-variable warnings.
- `npm --prefix office-portal run lint`: passed with the two existing render-time
  Date warnings from the restored original `App.jsx`.
- `npm --prefix backend run build`: passed.
- `npm --prefix office-portal run build`: passed; the same approximately 808 kB
  bundle warning remains. The emitted office asset filenames match the previous
  implementation's recorded production build.

- `npm run test:security`: **134 passed** (15 accounting, 78 inspection and
  41 catalogue), no failures; complete runner exited 0. All projects were local
  `demo-` projects. The same previously documented Java rules-runtime
  `NullPointerException` appeared during emulator shutdown after successful suites.

All requested post-repair checks passed. The remaining warnings match those
documented before the accidental extraction. The integration's original release
limitations in `docs/accounting-integrations.md` continue to apply.
