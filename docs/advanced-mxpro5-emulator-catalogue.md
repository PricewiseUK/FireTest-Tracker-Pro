# Advanced MxPro 5: emulator-only catalogue development stage

Implemented and verified only in local demo emulators. No production Firebase
configuration, Security Rules, customer records, installed assets, entitlement
records or publication grants were changed or deployed. Office portal, mobile
navigation and the extinguisher workflow/draft system are unchanged.

## Reusable definition

Input factory: `backend/catalogue/definitions/advancedMxPro5.ts`.

Published emulator version:

`equipmentCatalogue/fire-alarm-panels/models/advanced-mxpro-5/versions/dev-v1`

It stores manufacturer Advanced, model-family designation MxPro 5, public
manufacturer source URLs and these configuration capability annotations:

- Model-family scope, not identification of a particular installed variant.
- Loop count is variant-dependent; no installed loop count is assigned.
- Zones require site configuration; no zone count/list is supplied.
- Device addressing requires protocol/site verification; no address grammar,
  address range, default or device list is specified. This annotation is not a
  claim that any arbitrary address format is supported.
- Networking depends on optional hardware; it is not assumed installed/enabled.

There are no company/site IDs, serial numbers, physical locations, installed
loops/zones/devices or maintenance/certification procedures in this definition.
No manufacturer PDF is copied into Firestore. Private synthetic panel fixtures
use differing loop counts solely to prove publication cannot change installations.
They are not real customer equipment or technical configuration recommendations.

Manufacturer sources inspected for this development record:

- [Advanced's MxPro datasheet index](https://datasheets.advancedco.com/advancedco/english/uk/mxpro/).
- [MxPro 5 1-4 loop datasheet, version 09/26](https://datasheets.advancedco.com/advancedco/english/uk/mxpro/mxpro-5/panels-and-loop-cards/1-4-loop-fire-alarm-control-panel/).

The datasheet describes expandable loops, programmable zones, protocol-dependent
device capacity and optional networking hardware. Its limits concern a particular
variant; this family record deliberately does not apply them to every installation.
Exact variant/firmware/protocol and manufacturer procedures still need verification
before any future installation configuration or fire alarm testing workflow.

## Concrete backend adapter

`backend/catalogue/emulatorAdapter.ts` provides a real server Firestore transaction
adapter using `Transaction.create`, plus Firebase Admin Authentication token
verification. It is not a simulated Web SDK transaction and exposes no deployed
endpoint. The Admin SDK is pinned to 14.5.0 in a separate private Node backend
package/lockfile; Expo dependencies and production app Firebase config are unchanged.

The adapter refuses to initialise or publish unless both project environment
variables equal `demo-instafire-catalogue`, Firestore is `127.0.0.1:8080`, and Auth
is `127.0.0.1:9099`. It rechecks before authentication and transaction I/O. Firestore
uses an explicit local server transport; no application-default/service-account
credential is loaded. Auth uses the local emulator identity. Test sign-in creates
ephemeral passwords and tokens in memory, never logged or saved in drafts/files.

Publication verifies an Auth-emulator ID token (including revoked/disabled-user
checks), its demo project audience/issuer and the independent live central
`cataloguePublishers/{uid}` capability. A valid customer token alone is insufficient.
Only the trusted local test bootstrap creates synthetic accounts, central grants,
published parent model/index and reader entitlements. SDK customer writes remain
denied by the existing unchanged rules.

Firebase intentionally accepts unsigned tokens when configured for the Auth
emulator; this adapter is therefore **not a production authentication adapter**.
Never remove its guard or deploy it. See the official
[Auth emulator security boundary](https://firebase.google.com/docs/emulator-suite/connect_auth).

Version, availability and private publication audit are created atomically.
Identical/concurrent retries return the existing version without additional audit
records. Changed content under the same version ID is rejected. This operation
does not update installed equipment, private configuration or the model index's
latest pointer. Explicit development version IDs pin all retrievals.

## Backward-compatible schema extension

The publication policy now accepts an exact optional configurationCapabilities
shape for fire-alarm-panels only. New capability-bearing definitions use catalogue
schemaVersion 2 and canonical content hashing. Schema-1 identity-only inputs and
their original hash calculation remain supported, and all earlier security tests
still pass. Persisted definition comparisons use canonical map ordering so Admin
SDK readback cannot cause a false immutable-version conflict.

Capability fields have a strict allowlist and fixed family-level meanings. Numeric
installed counts, address patterns, private location/device fields, unexpected keys,
empty metadata and invalid source URLs are rejected. Schema-2 source URLs require
HTTPS without embedded credentials/query strings/fragments. Source truth and
technical approval still require human review; a valid schema is not certification.

## Reproduction and verification

From a fresh checkout:

1. Install the normal root dependencies as usual.
2. Run `npm ci --prefix backend --ignore-scripts` for the isolated backend SDK.
3. Run `npm run test:security`, `npm run test:unit`, `npm run typecheck` and
   `npm run lint`.

The runner starts the existing inspection demo suite, then a separate catalogue
demo with Firestore, Storage and Auth. It never uses the default production alias.
MxPro publication occurs inside tests with explicit demo-only bootstrap credentials.
These are reproducible test records, not a persistent deployed catalogue: the suite
clears fixtures between tests and stops the emulators at completion. Rerunning
recreates and verifies the development entry; no live seeding command is installed.

Results:

- **119 security tests passed**: 78 existing inspection/proposal/photo tests,
  33 earlier catalogue tests and 8 new concrete-adapter/MxPro tests.
- **151 unit tests passed**: all 148 earlier tests plus 3 new emulator-safety/
  capability-schema tests.
- Mobile and backend typechecks passed.
- Lint passed with zero errors and the same three existing warnings in untouched
  CminCalculator, LoginScreen and SettingsScreen.

New integration tests cover real Auth-emulator publisher/customer tokens,
create-only/concurrent duplicate publication, immutable conflicts/new versions,
invalid/private metadata, disabled publisher, invalid/customer tokens, entitlement
failures and SDK write denials. Company A and B retrieve the same version through
the rules and with real bearer tokens over local Firestore REST, while cross-company
installed equipment access is denied and private fixture configurations stay intact.
Missing/remote/production-like environment settings are rejected before I/O.

The known Java emulator shutdown NPE follows successful test assertions; demo
runner exits are zero. No production IAM, signed production-token validation,
deployed backend, mobile/portal catalogue UI or physical equipment behaviour was
tested. Positive installed-panel access remains disabled under existing rules.
Android bundling was not requested for this backend-only stage.

## Changed files

- `backend/catalogue/emulatorAdapter.ts` (new).
- `backend/catalogue/definitions/advancedMxPro5.ts` (new).
- `backend/catalogue/publication.ts` (strict versioned capabilities/canonical comparison).
- `backend/package.json`, `backend/package-lock.json` (new isolated pinned SDK).
- `backend/tsconfig.json` (TypeScript extension imports for Node tests).
- `firebase.emulators.json` (loopback Auth emulator only).
- `tests/firebase/run-emulators.mjs` (Auth and MxPro test suite in the demo project).
- `tests/firebase/mxpro.rules.test.mjs` (new).
- `tests/catalogue/emulatorSafety.test.mjs` (new).
- Root `package.json` (unit command includes the new backend unit test directory).
- This report and a progress link in the Phase 1 report.

Root `firebase.json`, application Firebase configs, firestore.rules, storage.rules,
root dependency lockfile, customer assets, office portal and extinguisher code were
not modified by this stage. No production resources or credentials were used.

## Required before any real Firebase deployment

1. Technically review the manufacturer/model-family definition, source rights,
   exact variant scope and schema-2 contract. Define variant-specific bounds only
   from approved sources; keep actual site configuration private.
2. Implement a **separate** production adapter with verified signed caller identity,
   explicit target project, central publisher authorisation and genuine atomic
   create-only operations. Never reuse emulator owner credentials/unsigned tokens
   or weaken the emulator adapter's guard.
3. Review backend IAM, supported Node runtime and dependency/lockfile security;
   define controlled publisher/reader-grant provisioning, model-index publication,
   withdrawal administration and audit retention. Customer office roles must not
   become central catalogue administrators.
4. Run staging integration and cross-tenant tests against those concrete production
   paths, including file permissions, revocation, concurrent retries, historical
   version retention and safe SDK/offline caches. The current emulator pass is not
   production authentication/IAM assurance or an all-module feature release gate.
5. Review the exact deployment diff and obtain explicit approval before deploying
   any rules/backend or provisioning live grants/models. Publishing the real
   catalogue entry is a separate approved, audited write with readback verification.
   Do not migrate/link customer assets or touch TEST-EXT001 as part of publication.
