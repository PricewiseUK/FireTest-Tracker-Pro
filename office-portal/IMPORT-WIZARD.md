# Customer data migration preview

The existing **Asset Imports** navigation entry now opens a five-step local
preview: upload, match columns, preview, duplicate checking and review.
**Firestore importing is not enabled. No imported records are saved.**

## Inspection and integration

This checkout is a Vite/React web portal, with no Expo dependency. Its existing
page-state navigation in `src/App.jsx`, `Sidebar`, `Header`, Firebase sign-in and
active owner/office-admin company membership gate are reused. Asset Imports and
Customers & Buildings were placeholders; no existing import utility or CSV/XLSX
parser was present. The accounting page and dashboard are preserved.

Building field names follow the existing reader in the engineer application's
`ExtinguisherBuildingsScreen.js`: `name`, `address`, `postcode`, `customerName`,
`reference`, `contactName`, `contactPhone`, `contactEmail`. No established standalone
customer collection schema was found in the inspected code. Customer previews use
`customerName`, `address` and the same contact fields. These are preview contracts,
not an approved database migration schema. A future backend must review the model,
authorisation and tenant isolation independently before any writes are enabled.

## Files

- Modified: `src/App.jsx`, `package.json`, `package-lock.json`.
- Added: `src/pages/AssetImports.jsx`, `src/pages/AssetImports.css`.
- Added: `src/imports/importModel.js`, `src/imports/parseFile.js`,
  `src/imports/import.worker.js`.
- Added: `tests/imports.test.js`, `tests/AssetImports.test.jsx`,
  `tests/manual-preview.html`, `tests/manual-preview.jsx`.
- Added: `tsconfig.imports.json`, `vitest.config.js`, this document.

## Formats, templates and validation

- UTF-8 comma-separated CSV, including BOM, quoted commas/newlines and escaped
  quotes. XLSX workbooks with exactly one worksheet. CSV values remain text.
- The template download generates a CSV for the selected Customers or Buildings
  type. It includes fictional businesses and addresses, reserved example email
  domains and fictional telephone numbers. Building customers match the fictional
  customer template. No Firebase identifiers or genuine personal information.
- Customer name and address are required; buildings additionally require a
  building name. These columns must be mapped before proceeding. Unknown columns
  may be manually mapped or ignored. Automatic suggestions never reuse a field.
- Required values are validated per row; optional emails and telephone numbers
  are checked when provided. No customer details are invented. Source row numbers
  are retained, including across empty rows.
- Files: at most 5 MiB, 5,000 rows below the header, 50 columns, 2,000 characters
  per cell, 120 characters per heading. Unique, non-empty headings are required.
  Extra CSV cells, malformed quoting, unsupported control characters, invalid
  UTF-8 and header-only files are rejected. Short CSV rows retain missing values.
- XLSX: ZIP container preflight, at most 200 entries and 25 MiB declared expanded
  content. Encrypted/unsupported ZIP containers, macros, external-link parts,
  merged cells, formula cells and spreadsheet errors are rejected. Formula cached
  results are not accepted. Use plain values and remove unused sheets/formatting.
  Range limits are checked against the original range, preventing silent truncation.
- Within-file duplicates use normalised customer name, building name (for sites),
  and postcode; full address is used if postcode is missing. Every matching row is
  flagged and retained. Details show up to eight related rows with a remaining
  count. Duplicate checks are heuristic; live database checks are not performed.
- Summaries count validity independently of duplicate flags; attention counts the
  union of invalid and duplicate rows, without counting an affected row twice.

## Privacy and lifecycle

The import module has no Firebase, analytics, network, storage or logging calls.
Parsing uses a bundled local worker with a 15-second timeout. Reset, type changes
and unmount terminate the worker; leaving the page drops its React state. New files
clear the old preview before parsing, and stale worker replies are ignored. The file
input is cleared after selection. No localStorage/sessionStorage persistence.
Imported values render as React text, including apparent HTML or JavaScript.
CSV exports quote cells and prefix formula-like values with an apostrophe.
The final import button is permanently disabled and has no import handler.

## Local testing

1. Run `npm.cmd install` if dependencies are missing (use `npm` on non-Windows
   shells). The XLSX package is pinned to the official SheetJS 0.20.3 tarball,
   following https://docs.sheetjs.com/docs/getting-started/installation/frameworks/.
2. Run `npm.cmd run dev`; open the printed local address, sign in normally and
   choose **Asset Imports**. Do not use real customer data for initial testing.
3. Download the Customers example, then upload it. Click Next, inspect suggested
   matches, change a match, inspect preview values, continue through duplicates
   and review. Repeat for Buildings. Reset or navigate away to clear the preview.
4. For an isolated component review without Firebase, open
   `/tests/manual-preview.html` on the Vite development server. This harness reuses
   Sidebar/Header but imports no Firebase code. It is not a login route and is not
   included in the production build. Use fictional records here.
5. Test errors by removing a required value, repeating a row, leaving a required
   column unmatched, uploading malformed files and replacing a previously valid
   file. Check narrow screens, keyboard focus, table scrolling and pagination.

Commands: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`,
`npm.cmd run build`. The new type-check is scoped to the import implementation,
with JavaScript checking and JSDoc contracts; this portal previously had no
type-check script. UI tests run in jsdom with a worker stub; parser tests exercise
actual CSV and generated XLSX bytes. They do not establish real-browser worker
execution or authenticated Firebase integration coverage.

## Verification and limitations

All 26 automated tests passed. Import type-check passed. Lint passed with two
pre-existing `Date` render-purity warnings in `src/App.jsx`. Production build
passed, with a warning for the existing main bundle exceeding 500 kB. XLSX is
contained in the worker bundle, while the wizard is lazy-loaded.

The development harness returned HTTP 200. Browser visual QA could not run because
the browser automation host was unavailable; responsive appearance, native file
selection/downloads and worker execution still need a real-browser smoke test.

Equipment imports remain visibly Upcoming. XLSX export, record editing within the
table, corrected-record downloads, database duplicate checks and actual importing
are not provided in this phase. Correct source values in the original file, then
upload again. No Firebase rules, hosting targets, authentication, company logic,
engineer application or live records were modified. Nothing was deployed.
