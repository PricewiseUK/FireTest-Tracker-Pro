# Shared equipment catalogue foundation: review proposal

Implementation update: the [Phase 1 security report](shared-catalogue-security-phase1.md)
describes the locally implemented/tested catalogue boundary and publication policy.
It supersedes the draft read snippets' handling of unpublished/withdrawn records.
The installed-asset read-policy changes and production migration below remain
unimplemented; existing tenant permissions were preserved.

Status: design only, awaiting review. No catalogue, Firebase record, deployed rule,
asset reference, local draft schema or migration is changed by this document.
No test fire alarm equipment has been created. This specialises the earlier
`global-catalogue-and-tenant-isolation.md` proposal with exact proposed paths.

## 1. Findings from the current code

- `firebase.json` selects root `firestore.rules` and `storage.rules` for the
  default Firestore database; packaged copies are not the active configuration.
- Existing private paths are:
  - `companies/{companyId}/members/{uid}`
  - `companies/{companyId}/sites/{siteId}`
  - `companies/{companyId}/sites/{siteId}/extinguishers/{assetDocId}`
  - `companies/{companyId}/sites/{siteId}/extinguisherProposals/{proposalId}`
  - Proposal photo metadata and Storage objects at
    `companies/{companyId}/sites/{siteId}/extinguisherProposals/{proposalId}/photos/{photoId}`
  - `companies/{companyId}/sites/{siteId}/extinguisherInspections/{inspectionId}`
  - `companies/{companyId}/extinguisherInspectionTemplates/{templateId}`
- `approvedInspectionAsset.ts` validates the approved collection path and uses the
  actual Firestore document ID. The display reference comes from assetId, then
  prefix/number, then document ID. Capacity/unit, type and location are independent
  recorded fields. `extinguisherAssetPresentation.ts` also reads manufacturer/make
  and model/modelNumber. None of these readers requires a catalogue reference.
- Approved asset writes are denied to all Firebase clients. Proposal creation has
  a strict field allowlist; proposal/photo updates and deletes remain protected.
  Inspection schema 1 also has a strict allowlist, approved company-scoped template
  lookup, an eight-question bound and immutable submitted records. It cannot accept
  a new catalogue field or the local eleven-question annual candidate as-is.
- Current approved extinguisher reads require active company membership and an
  existing site. They do not impose the inspection role whitelist or the senior
  engineer's assigned-site restriction. Inspection access has separate, narrower
  rules. Do not claim those read policies are identical today.
- Storage currently permits only the protected proposal-photo workflow; other
  paths are denied. The other four installed-equipment modules have no approved
  schemas/access matches in the active rules. No shared catalogue exists here.
- Existing device drafts are scoped by project/user/company/site/inspection ID.
  They have strict versions and saved checklist snapshots, not catalogue-backed
  records. Do not modify their seed fields, keys, IDs, snapshots or recovery copies
  as part of catalogue linking.

The phone's TEST-EXT001 record and drafts and the live database were not read here.
Its reference/site are known from the user's report, not a verified live document
path or a confirmed manufacturer/model. Repository fixture IDs are not production
identities and must never be used as migration targets.

## 2. Exact proposed collections

Use one global hierarchy with these five kind IDs, not five separate tenant copies:

| Equipment | Catalogue model document | Immutable definition document |
| --- | --- | --- |
| Fire alarm panel | `equipmentCatalogue/fire-alarm-panels/models/{modelId}` | `equipmentCatalogue/fire-alarm-panels/models/{modelId}/versions/{versionId}` |
| Extinguisher | `equipmentCatalogue/fire-extinguishers/models/{modelId}` | `equipmentCatalogue/fire-extinguishers/models/{modelId}/versions/{versionId}` |
| Emergency light | `equipmentCatalogue/emergency-lights/models/{modelId}` | `equipmentCatalogue/emergency-lights/models/{modelId}/versions/{versionId}` |
| Fire door | `equipmentCatalogue/fire-doors/models/{modelId}` | `equipmentCatalogue/fire-doors/models/{modelId}/versions/{versionId}` |
| Fire blanket | `equipmentCatalogue/fire-blankets/models/{modelId}` | `equipmentCatalogue/fire-blankets/models/{modelId}/versions/{versionId}` |

Kind root documents are central metadata, not private installations. Model IDs are
opaque stable IDs, not names/capacities; version IDs are immutable identifiers such
as v1. A model index has schemaVersion, kind, latestVersionId and availability.
It is a discovery index, not the historical source of truth. Only central backend
administration can change its latest pointer or availability.

A definition contains schemaVersion, modelId, kind, version, verified manufacturer,
model designation, applicable technical attributes, source references, publication
time and content hash. Kind-specific attributes require reviewed schemas. Do not
invent model specifications, A ratings, servicing procedures or compliance claims.
Published versions are create-only and retained while referenced. Publication or
retirement does not rewrite an old version, its source files or installed records.
Withdrawn versions stay readable to authorised customers for historical reports;
the model index can prevent new selections without altering history.

Optional centrally managed file manifests:

`equipmentCatalogue/{kind}/models/{modelId}/versions/{versionId}/files/{fileId}`

They identify immutable technical source files with exact Storage path, media type,
size and content hash. No customer photos, serial inventories, configuration,
inspection content, personal data or company identifiers go in global definitions.
Unpublished drafts belong in a separate backend-only publication workspace, not
in readable catalogue collections.

Private installed asset paths:

| Kind | Company/site asset path | Status |
| --- | --- | --- |
| Fire alarm panel | `companies/{companyId}/sites/{siteId}/fireAlarmPanels/{assetId}` | Proposed/reserved; no records or module enabled |
| Extinguisher | `companies/{companyId}/sites/{siteId}/extinguishers/{assetDocId}` | Existing path retained |
| Emergency light | `companies/{companyId}/sites/{siteId}/emergencyLights/{assetId}` | Proposed/reserved |
| Fire door | `companies/{companyId}/sites/{siteId}/fireDoors/{assetId}` | Proposed/reserved |
| Fire blanket | `companies/{companyId}/sites/{siteId}/fireBlankets/{assetId}` | Proposed/reserved |

An optional private configuration revision path is
`companies/{companyId}/sites/{siteId}/{assetCollection}/{assetId}/configurationVersions/{revisionId}`.
It records installed configuration changes, not copies of a global model definition.
No new inspection/defect/history collection is enabled in this foundation. Existing
extinguisher inspections and proposal paths remain exactly as above; other modules'
inspection/file/ownership contracts must be reviewed before enabling them. Service
history is derived from the appropriate private immutable records, not global data.

## 3. Installed reference and historical identity

The only proposed addition to a legacy approved asset is optional catalogueRef:

```json
{
  "catalogueRef": {
    "schemaVersion": 1,
    "kind": "fire-extinguishers",
    "modelId": "<verified-stable-model-id>",
    "versionId": "v1"
  }
}
```

This is an illustrative patch, not a document to write. No company asset points
at a mutable latest pointer. Backend validation enforces the kind-to-asset-collection
mapping, exact reference shape, existence and publication of the pinned version,
and compatibility with verified model identification. No arbitrary document paths
or foreign company references are accepted. Missing catalogueRef remains a valid
legacy asset; no automatic generic model is substituted. Invalid/missing referenced
versions produce an explicit unavailable state without mutating or hiding the asset.

Keep serial number, asset reference, location, installed settings, configuration,
service dates and customer-specific choices private on their existing records.
Do not duplicate entire model definitions or catalogue templates into each company.
Only the minimal installation data and reference are stored there.

Equipment models and servicing checklists are separate concepts. Retain the existing
company-scoped inspection-template path and local candidate snapshots for now.
A model entry cannot approve a candidate checklist or bypass the server contract.
A future global servicing-template design needs separate technical/security review;
do not copy global servicing templates into every company as a catalogue shortcut.

Future inspection schema versions may capture the small pinned catalogueRef plus
the necessary private asset/configuration snapshot at inspection time. Historical
rendering uses that recorded version, never the asset's later link or latest model.
Do not backfill, relabel or rewrite existing submitted inspections or device drafts.
No complete catalogue definition is duplicated in a future inspection snapshot.

## 4. Exact proposed Firestore access rules

These are review snippets, NOT active rules and NOT emulator-verified changes.
They belong inside `match /databases/{database}/documents` only after review/tests.

### Global customer read entitlement

Rules need a concrete membership lookup for a global request; they must not search
for memberships or trust a company ID supplied in catalogue data. Propose a
backend-only control document `catalogueAccess/{uid}` with schemaVersion 1,
enabled boolean and authorisingCompanyId. A trusted service provisions it only
after verifying an active company and membership in a recognised customer role.
It is an access anchor, not customer data embedded in model definitions. A user
with multiple companies can use any one verified active membership as this anchor;
it grants no private access to that company or any other company. Revocation or
inactive membership denies reads even if the anchor remains present. If its chosen
membership is revoked, fail closed until the trusted service selects another
verified membership. Do not add anonymous or arbitrary signed-in catalogue access.

```javascript
function catalogueKind(kind) {
  return kind in ['fire-alarm-panels', 'fire-extinguishers',
                  'emergency-lights', 'fire-doors', 'fire-blankets'];
}
function activeCatalogueMember(companyId) {
  let company = get(/databases/$(database)/documents/companies/$(companyId));
  let member = get(/databases/$(database)/documents/companies/$(companyId)/members/$(request.auth.uid));
  return company.data.status == 'active' && member.data.status == 'active'
    && member.data.role in ['engineer', 'senior_engineer', 'owner', 'office_admin'];
}
function canReadCatalogue() {
  let access = get(/databases/$(database)/documents/catalogueAccess/$(request.auth.uid));
  return access.data.schemaVersion == 1 && access.data.enabled == true
    && access.data.authorisingCompanyId is string
    && activeCatalogueMember(access.data.authorisingCompanyId);
}
match /catalogueAccess/{uid} {
  allow read, write: if false;
}
match /equipmentCatalogue/{kind} {
  allow read: if request.auth != null && catalogueKind(kind) && canReadCatalogue();
  allow write: if false;
  match /models/{modelId} {
    allow read: if request.auth != null && catalogueKind(kind) && canReadCatalogue();
    allow write: if false;
    match /versions/{versionId} {
      allow read: if request.auth != null && catalogueKind(kind) && canReadCatalogue();
      allow write: if false;
      match /files/{fileId} {
        allow read: if request.auth != null && catalogueKind(kind) && canReadCatalogue();
        allow write: if false;
      }
    }
  }
}
```

Missing/malformed access, company or membership records deny access. Customers
cannot grant their own entitlement. Customer owner/office_admin and even a browser
claiming a central-admin role still cannot write through client rules. Central
publication is through an authenticated, authorised backend with dedicated IAM.

### Proposed installed asset read policy

This is a reviewed target, not a silent extension of current legacy reads. Replace
the existing extinguisher asset read block with the corresponding target policy
when authorised; do not append a stricter overlapping block and assume it overrides
an existing allow. Preserve all inspection/proposal/photo matches separately.

```javascript
function installedCollection(name) {
  return name in ['fireAlarmPanels', 'extinguishers', 'emergencyLights',
                  'fireDoors', 'fireBlankets'];
}
function canReadInstalled(companyId, siteId) {
  let member = get(/databases/$(database)/documents/companies/$(companyId)/members/$(request.auth.uid));
  return activeCatalogueMember(companyId)
    && exists(/databases/$(database)/documents/companies/$(companyId)/sites/$(siteId))
    && (member.data.role in ['engineer', 'owner', 'office_admin']
      || (member.data.role == 'senior_engineer'
        && member.data.get('siteIds', []) is list
        && siteId in member.data.get('siteIds', [])));
}
match /companies/{companyId}/sites/{siteId}/{assetCollection}/{assetId} {
  allow read: if request.auth != null && installedCollection(assetCollection)
    && canReadInstalled(companyId, siteId);
  allow create, update, delete: if false;
  match /configurationVersions/{revisionId} {
    allow read: if request.auth != null && installedCollection(assetCollection)
      && canReadInstalled(companyId, siteId)
      && exists(/databases/$(database)/documents/companies/$(companyId)/sites/$(siteId)/$(assetCollection)/$(assetId));
    allow create, update, delete: if false;
  }
}
```

This preserves the legacy engineer's company-wide site-read policy without adding
mandatory siteIds. Senior engineers retain assigned-site checks; office roles
remain company scoped; unknown roles deny. Compared with current extinguisher
asset reads it also requires an active company and restricts roles/senior sites;
verify actual memberships and office usage before adopting those stricter reads.
It does not broaden private draft/inspection access: current inspection-owner and
submitted-reader policies remain separate and unchanged.

Keep default-deny for unspecified paths, new inspection modules and unreviewed
subcollections. No company-recursive read wildcard or global collection-group
query should grant private data access. Query the exact company/site collection;
use explicit kind-scoped catalogue queries. Add only demonstrated required indexes.

## 5. Trusted administration and Storage

Firestore server libraries bypass client Security Rules, so `allow write: false`
does not make backend writes immutable. The central publication service must
separately authenticate/authorise platform administration, validate allowlisted
fields and sources, and use create-only publication/preconditions and idempotency.
Reject overwriting/deleting published definitions. New versions are new records.
Use least-privilege service identities; ordinary customer roles cannot call the
publisher. See Firebase's [server/rules boundary](https://firebase.google.com/docs/firestore/security/get-started).

Customer asset linking uses a separate trusted tenant operation, with active
membership, company/site/record checks and an authorised office role or reviewed
approval workflow. Do not grant direct client master-asset writes. An existing
senior-engineer proposal approval policy is not blanket catalogue administration.
The backend validates all references in the same company and prevents changing
tenant identity, document ID or another company's assets. A central model publisher
does not automatically gain a tenant-asset-linking API permission.

Optional catalogue source object path:

`equipmentCatalogue/{kind}/models/{modelId}/versions/{versionId}/files/{fileId}`

For the initial foundation, propose backend-only object access:

```javascript
// Inside the Storage bucket match; retain existing proposal-photo rules.
match /equipmentCatalogue/{kind}/models/{modelId}/versions/{versionId}/files/{fileId} {
  allow read, write: if false;
}
```

Customer file retrieval, if needed later, goes through an authenticated backend
that applies the same live catalogue entitlement checks, exact manifest lookup and
version selection; no public bucket or reusable bearer download link. Central
uploads verify bytes/content hash and use create-only object generation semantics.
Do not add a permissive recursive Storage match. Future direct authenticated SDK
downloads need their own reviewed/tested rule design; do not assume arbitrary
Firestore lookup chains are suitable for Storage rules.

Existing private proposal objects and metadata paths/rules are unchanged. Proposed
future installation evidence stays under the relevant company/site/asset or private
inspection path and is denied until its workflow/rules are separately approved.
Do not move photos to catalogue storage or share customer files between tenants.
Firebase documents cross-product rule checks in its
[Storage conditions guide](https://firebase.google.com/docs/storage/security/rules-conditions).

## 6. TEST-EXT001 and migration plan

1. Review this schema, publisher/reader entitlement, installed-role policy and file
   policy first. Then implement and emulator-test isolated rule candidates and
   pure catalogue/reference validators; no production data is needed for that work.
2. After explicit authorisation for read-only inventory, verify actual company ID,
   Lincoln Business Centre's site document ID and the approved extinguisher's
   Firestore document ID by its display reference TEST-EXT001. Do not infer IDs
   from names, earlier fixtures or the display reference. Inventory the unchanged
   record, existing photo paths and dependencies without exporting private draft
   data into the catalogue.
3. Verify the manufacturer's identity and exact model/variant from recorded data
   or the equipment label/manual. Water plus capacity is insufficient. If unknown,
   leave catalogueRef absent and continue to support the asset as legacy; do not
   create a fictional generic model or guess an A rating/gauge construction.
4. Prepare a central definition/version from verified sources. Only after schema/
   permissions review and explicit write/deployment authorisation may the trusted
   publisher create it. Do not create fire alarm test assets as part of this work.
5. Produce a dry-run patch for the exact existing asset path containing only
   catalogueRef and a separate minimal linking audit entry. Show the selected
   definition/version, expected prior update/version and full field diff. Retain
   existing assetId/type/capacity/location, manufacturer/model fields, approvals,
   photographs and installed configuration. Never copy the definition into it.
6. After approval, a tenant-authorised backend transaction checks the current
   record/precondition and reference and applies that additive field only. Reject
   concurrent changes, conflicting links or tenant mismatches. Do not use an
   unconditional document replacement. Audit the link as a meaningful record event,
   not engineer activity. This is a proposed future write, not executed now.
7. No draft rewrite follows. Existing draft IDs/answers/checklist versions/evidence/
   recovery copies remain intact. The current reader ignores extra asset fields,
   and its NotesSeed does not include catalogueRef, so linking alone must not
   trigger a draft migration or new checklist selection. Keep old inspection
   snapshots unchanged. A future reference-aware draft/inspection schema needs
   separate compatibility tests and explicit version handling.
8. Roll out optional references gradually, with legacy reads and proposals intact.
   Do not add catalogueRef to strict existing proposal/inspection payloads. A
   later versioned proposal can suggest a catalogue link for backend approval;
   it must retain exact field validation and ownership/photo protections.
   Rollback of an incorrect link is an explicitly authorised additive reference
   correction with audit/precondition checks, never deletion of model history,
   original asset records, completed inspections or local drafts.

## 7. Automated test gate before implementation/release

Tests below are planned, not implemented or claimed passing by this design review.
Use a demo-only emulator project after review; no production or fire alarm test
records are created now.

- For every catalogue kind: eligible active customers read model/version/file
  manifests; unauthenticated, disabled grant, wrong/unknown role, inactive/missing
  company/member, malformed anchor and revoked access deny. Cross-company access
  to the shared catalogue is intentionally allowed for independently entitled
  customers, while private workspace data remains isolated.
- Customer engineers, senior engineers, owners and office admins cannot create,
  update or delete kind roots, models, versions, manifests or access anchors.
  Forged admin claims do not enable client writes. Backend integration tests reject
  tenant users invoking the publisher, version overwrite/delete, duplicate IDs
  with different content and invalid cross-kind references.
- Seed synthetic A/B companies and exercise each installed collection in the table
  in both directions: same-company authorised reads pass; foreign get/list/query,
  create/update/delete, forged company fields and guessed IDs fail. Test senior
  site assignment, legacy engineer records without siteIds and unknown roles.
  Until another module's contracts are enabled, unspecified paths stay denied.
- Company A cannot access B's configurations, inspection histories, defects,
  proposal metadata, files, generated reports or backend linking operations.
  Existing proposal/photo and submitted-inspection immutability tests must pass.
  Test Storage paths, metadata/reference substitution and backend download denial.
- Test exact scoped queries and disallowed broad/collection-group queries. Rules
  are not UI filters: see Firebase's
  [query authorisation guidance](https://firebase.google.com/docs/firestore/security/rules-conditions).
- A new catalogue version/latest pointer change leaves A/B installed configuration,
  pinned references and historical renders unchanged. Legacy unlinked assets and
  existing proposals keep working. Invalid/missing versions fail explicitly without
  falling back to a guessed model or overwriting customer values.
- Link TEST-EXT001 only in a synthetic compatibility fixture: preserve its
  document ID and existing fields, resume both old eight-question and current
  eleven-question local inspections unchanged, preserve notes/photos/recovery
  archives, and never migrate answers merely because a catalogue reference exists.
  Include conflicting-link/precondition failures and authorised rollback tests.
- User/company switching, SDK cache behaviour, device files and offline queues
  must not expose another scope's data or upload it to the wrong tenant. Catalogue
  caches contain shared technical definitions only; private configurations never
  use a global model ID as their sole cache key.

All-module authorisation and file coverage is a release gate, not a claim that
the existing extinguisher security suite already covers the other four modules.
This proposal changes documentation only. Active rules, indexes, Firebase records,
asset readers, offline storage and office portal remain untouched. Unit/emulator
implementation and physical Expo Go migration checks await review.
