# Global equipment catalogue and private company workspaces

Standing product requirement and proposed architecture for review. This document
does not implement a catalogue, change Firebase rules, migrate customer data,
create fire alarm test records or authorise production changes.

The [foundation review proposal](shared-equipment-catalogue-foundation-review.md)
now specifies exact candidate paths, reader entitlements, rule snippets and the
TEST-EXT001 migration sequence. Those details remain unimplemented and unapproved.

## Shared definitions, private installations

Use one centrally managed catalogue covering fire alarm panels, fire extinguishers,
emergency lighting, fire doors and fire blankets. Definitions describe equipment
models and versioned technical metadata only. Never put customer names, site
addresses, installation settings, serial-number inventories, credentials,
inspection results, defects, evidence or personal data in shared definitions.

A possible global path, subject to schema review, is:

`equipmentCatalogue/{equipmentType}/models/{modelId}/versions/{versionId}`

Catalogue publication is a separate trusted central permission. A company owner,
office administrator or engineer does not gain catalogue write permissions through
their customer role. Default-deny client writes; centrally publish validated
versions through an authorised backend process. Define catalogue read policy
explicitly during review; a global catalogue is not an instruction to publish
information anonymously or expose private workspaces.

Customer assets retain their existing company/site paths and reference a specific
catalogue model/version. Configuration, installed components, customer-specific
choices, approved assets, proposals, inspections, defects, histories and associated
files remain private to the company. A catalogue reference grants no access to an
installation or another company. Preserve existing approved-asset/proposal paths
and approval protections; do not silently migrate existing documents.

Published definition versions are immutable and retained while referenced. A new
release creates a new version; a separate reviewed pointer can identify the latest
release for future selection. Existing installations stay pinned to their chosen
version and private configuration. Historical records retain the necessary asset/
definition snapshots and version references as recorded at the time. Never resolve
historical reports against a mutable latest definition. Any installation upgrade
is an explicit authorised change, not a catalogue-triggered overwrite or cascade.
Catalogue metadata does not automatically approve candidate servicing procedures.

## One authorisation boundary across every surface

Company identity comes from the requested resource and verified membership, not
an untrusted client field or UI-selected workspace alone. Require appropriate active
company membership, role and applicable site/record ownership checks. Reject
unknown roles and conflicting company/site/asset references. Users legitimately
belonging to several companies must access each resource under that company's
verified permissions; membership in one workspace grants nothing in another.

- **Firestore:** Scope private documents and allowed queries to the company.
  Enforce tenant, role, site and ownership checks in rules; constrain updates so
  company/site/owner fields cannot be changed to move or claim records. Test direct
  document access, list/query/collection-group access, guessed IDs and reference
  substitution. Client-side filtering is presentation only.
- **Trusted backend:** Revalidate the authenticated caller, company, membership,
  assignment and referenced resources before every privileged operation. A
  privileged SDK or background worker must not treat a supplied company ID as
  authorisation. Scope jobs, retries, reports, exports and approval operations to
  the verified company. Authorise any central support access separately; no
  implicit cross-customer access through ordinary office roles.
- **Storage:** Use company/site/record-scoped object paths and enforce equivalent
  ownership/role checks for reads, listing, upload, overwrite and deletion. Check
  related Firestore records and metadata consistently. Prevent cross-company
  file references and access through public/shared links that bypass the intended
  tenant boundary. Catalogue files and private customer evidence have separate
  permissions; shared technical documents must not expose private evidence.
- **Offline data:** Namespace private drafts, queues, cached queries, attachments
  and generated reports by Firebase project, authenticated user and company,
  with site/record scope as applicable. Invalidate in-memory data and stale async
  responses when switching user/company. Preserve unsynchronised work under its
  original scope without displaying or sending it as another workspace. Recheck
  authorisation before retry/upload; a cache hit is not current authorisation.
  Review SDK disk caches and device files explicitly, not just application keys.
- **Office portal:** Authorise company-scoped reads and writes server-side/rules
  as well as in the UI. No broad query followed by browser-side company filtering.
  Reports, evidence downloads, approvals and job summaries obey the same boundary.
  Explicit job events and finished records remain the visibility limit in the
  [no employee tracking principle](no-employee-tracking.md).

Immutable submitted inspections and approval audit records remain protected.
Office approval does not authorise edits to submitted inspection snapshots or
cross-company access. Global definitions never become a back door around those
protections. Existing company isolation must not be weakened to add a catalogue.

## Mandatory production release gate

Before release, run automated cross-tenant tests for **each** module: fire alarms,
fire extinguishers, emergency lighting, fire doors and fire blankets. Cover its
configurations, assets/proposals, inspections, defects, histories and every related
file type. Maintain a coverage matrix naming each actual collection/object path
and backend operation; do not treat a module as covered merely because a shared
helper or a different module passed. An unimplemented module remains disabled;
before enabling it, its complete access matrix must pass the release gate.

Use isolated test projects/emulators and synthetic companies A/B, each with its
own sites, engineers and office accounts. Do not create production test records.
Required cases include:

1. Authorised same-company operations pass for the intended role, site and record
   owner. Company A cannot read, query, create, change, approve or delete B's data
   through any supported client, backend or office operation, and vice versa.
2. Unauthenticated/inactive users, unknown roles, forged company fields, guessed
   IDs, foreign site/asset/template references and attempted ownership transfers
   are denied. Multi-company users and workspace switching retain distinct scopes.
3. Storage reads/listing/uploads/overwrites/deletes and evidence/report retrieval
   cannot cross companies, including mismatched metadata and referenced records.
   Catalogue-file read permission never implies customer-file permission.
4. User/company switching, delayed requests, process restart and offline retries
   cannot expose or upload another scope's cached data. Unsynchronised drafts and
   files remain recoverable by their original authorised user. Test the actual
   configured SDK caches and device storage, in addition to pure store fixtures.
5. Privileged backend operations and office actions reject cross-company requests
   despite their elevated server capabilities. Immutable result/audit protections
   hold independently of tenant checks.
6. Only authorised central publishers can publish catalogue versions. Definition
   updates cannot mutate existing installation settings, snapshots or history;
   shared definitions/files contain no private company data.

Firestore/Storage emulator coverage must be supplemented by backend integration
and client/cache tests where rules cannot enforce the behaviour. Review evidence
for the actual deployed configuration before any production release.

Current extinguisher emulator/unit tests are not a completed all-module release
gate. No all-module tests or live-cache/backend/portal security audit are claimed
by this documentation change. The actual catalogue schema, publication/read roles,
existing live membership/site assignments and any migration plan still require
review. Do not modify production Firebase or create fire alarm test records before
that review; production deployment/migration also requires explicit authorisation.
