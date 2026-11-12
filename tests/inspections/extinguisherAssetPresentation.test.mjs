import assert from "node:assert/strict";
import test from "node:test";
import { assetCardDetails, inspectionStatus, siteDeviceProgress, readAssetDeviceProgress, UNKNOWN_PROGRESS } from "../../engineer-app/src/modules/Extinguishers/extinguisherAssetPresentation.ts";
import { mapFirestoreDocument } from "../../engineer-app/src/utils/firestoreDocument.mjs";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
const seed = { assetDocId: "actual-document", assetReference: "TEST-EXT001", equipmentType: "Water", assetCapacity: "6 L", assetLocation: "Lobby" };
function fixture() {
  const data = new Map(); let userId = "engineer"; let epoch = 0; let sequence = 0;
  const storage = { async getAllKeys() { return [...data.keys()]; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, raw) { data.set(key, raw); } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-asset-cards", getSession: () => ({ userId, epoch }), generateId: () => `cards_${String(++sequence).padStart(16, "0")}` });
  return { data, store, storage, switchUser(id) { userId = id; epoch++; } };
}
const scope = { companyId: "company", siteId: "site", userId: "engineer", role: "engineer", assignedSites: [] };

test("asset cards preserve real Firestore IDs and show recorded reference, type, capacity, location, manufacturer and model", () => {
  const asset = mapFirestoreDocument({ id: "real-document", data: () => ({ id: "forged", assetId: "TEST-EXT001", type: "Water", capacity: 6, capacityUnit: "L", location: "Ground floor lobby", manufacturer: "Example make", model: "Example model" }) });
  assert.equal(asset.id, "real-document");
  assert.deepEqual(assetCardDetails(asset), { reference: "TEST-EXT001", type: "Water", capacity: "6 L", location: "Ground floor lobby", manufacturer: "Example make", model: "Example model", lastVerifiedServiceDate: "Not Recorded", lastVerifiedServiceResult: "Not Recorded" });
  assert.equal(assetCardDetails({ id: "actual-only" }).reference, "actual-only");
});
test("missing or malformed asset details use Not Recorded and never infer capacity units or fire ratings", () => {
  const details = assetCardDetails({ type: {}, location: "  ", capacity: NaN, manufacturer: false, model: [] });
  assert.ok(Object.values(details).every((value) => value === "Not Recorded"));
  assert.equal(assetCardDetails({ capacity: 6 }).capacity, "6 (unit Not Recorded)");
  assert.equal(assetCardDetails({ capacity: "6 L", capacityUnit: "L" }).capacity, "6 L");
  assert.equal(assetCardDetails({ capacity: "6 L" }).capacity, "6 L");
  assert.equal(assetCardDetails({ make: "Recorded make", modelNumber: "123" }).manufacturer, "Recorded make");
  assert.equal(assetCardDetails({ make: "Recorded make", modelNumber: "123" }).model, "123");
});
test("unverified asset dates/results/completed flags cannot become a verified service history", () => {
  const asset = Object.freeze({ id: "asset", lastServiceDate: "2026-10-30", lastServiceResult: "PASS", status: "completed", inspectionStatus: "Completed", serviceVerified: true });
  const details = assetCardDetails(asset);
  assert.equal(details.lastVerifiedServiceDate, "Not Recorded"); assert.equal(details.lastVerifiedServiceResult, "Not Recorded");
  assert.equal(inspectionStatus(asset.id, { known: true, assetIds: [], recoveryAssetIds: [] }).label, "Not Started");
});
test("all-PASS saved drafts remain In Progress and the site summary counts assets, not answers or certificates", async () => {
  const f = fixture(); const controller = createInspectionNotesController(f.store.forSite("company", "site"), seed, undefined, { gaugePresent: true });
  await controller.open();
  for (const answer of controller.getState().servicing.answers) controller.changeAnswer(answer.questionId, { result: "pass" });
  await controller.save();
  const progress = await readAssetDeviceProgress(f.store, scope);
  assert.equal(inspectionStatus(seed.assetDocId, progress).label, "In Progress");
  assert.match(inspectionStatus(seed.assetDocId, progress).detail, /Not submitted/);
  assert.deepEqual(siteDeviceProgress([{ id: seed.assetDocId }, { id: "other" }, { id: seed.assetDocId }], progress), { total: 2, inProgress: 1, notStarted: 1 });
  assert.equal(controller.getState().draft.sync.state, "pending-sync");
});
test("device statuses and site counts cannot include another user, company or site's drafts", async () => {
  const f = fixture();
  await f.store.forSite("company", "site").startOrResumeNotes(seed);
  await f.store.forSite("other-company", "site").startOrResumeNotes({ ...seed, assetDocId: "foreign-company" });
  await f.store.forSite("company", "other-site").startOrResumeNotes({ ...seed, assetDocId: "foreign-site" });
  f.switchUser("other"); await f.store.forSite("company", "site").startOrResumeNotes({ ...seed, assetDocId: "foreign-user" }); f.switchUser("engineer");
  const before = [...f.data]; const progress = await readAssetDeviceProgress(f.store, scope);
  assert.deepEqual(progress.assetIds, [seed.assetDocId]); assert.deepEqual([...f.data], before);
  assert.deepEqual(siteDeviceProgress([{ id: "foreign-user" }, { id: "foreign-company" }, { id: "foreign-site" }], progress), { total: 3, inProgress: 0, notStarted: 3 });
  f.switchUser("other"); await assert.rejects(readAssetDeviceProgress(f.store, scope), /DRAFT_SCOPE_MISMATCH/);
});
test("unknown/unassigned roles cannot read draft status; failed reads never imply Not Started", async () => {
  const f = fixture();
  for (const role of ["unknown", "office_admin", "owner", "senior_engineer"]) await assert.rejects(readAssetDeviceProgress(f.store, { ...scope, role }), /INSPECTION_ACCESS_REQUIRED/);
  f.storage.getAllKeys = async () => { throw new Error("Storage unavailable"); };
  await assert.rejects(readAssetDeviceProgress(f.store, scope));
  assert.equal(inspectionStatus("asset", UNKNOWN_PROGRESS).label, "Status Unavailable");
  assert.deepEqual(siteDeviceProgress([{ id: "asset" }], UNKNOWN_PROGRESS), { total: 1, inProgress: null, notStarted: null });
});
test("recoverable draft status is explicit and does not erase damaged copies", async () => {
  const f = fixture(); const site = f.store.forSite("company", "site"); const initial = await site.startOrResumeNotes(seed);
  await site.updateNotes(initial.draft.inspectionId, 1, "Latest notes");
  const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "damaged");
  const before = [...f.data]; const progress = await readAssetDeviceProgress(f.store, scope);
  assert.equal(inspectionStatus(seed.assetDocId, progress).label, "In Progress");
  assert.match(inspectionStatus(seed.assetDocId, progress).detail, /Recovery/); assert.deepEqual([...f.data], before);
});
