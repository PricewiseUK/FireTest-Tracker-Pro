import assert from "node:assert/strict";
import test from "node:test";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createEngineerNavigation, orderSites, siteNavigationBack, siteSelectionFeature } from "../../engineer-app/src/modules/Extinguishers/engineerNavigation.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";

const seed = (id = "asset") => ({ assetDocId: id, assetReference: `EXT-${id}`, equipmentType: "Water", assetCapacity: "6 L", assetLocation: "Lobby" });
function fixture() {
  const data = new Map(); let userId = "engineer"; let epoch = 0; let sequence = 0;
  const getSession = () => ({ userId, epoch });
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, raw) { data.set(key, raw); }, async getAllKeys() { return [...data.keys()]; } };
  const create = (projectId = "demo-navigation") => {
    const draftStore = createLocalInspectionDraftStore({ storage, projectId, getSession, generateId: () => `draft_${String(++sequence).padStart(16, "0")}` });
    return { draftStore, navigation: createEngineerNavigation({ storage, projectId, getSession, draftStore }) };
  };
  return { ...create(), create, storage, data, switchUser(id) { userId = id; epoch++; } };
}

test("routine service goes from selected site to assets, then back to sites; register retains details/proposals", () => {
  const building = { id: "site", name: "Lincoln" };
  const routineFeature = siteSelectionFeature(true);
  assert.equal(routineFeature, "assets");
  assert.deepEqual(siteNavigationBack(true, building, routineFeature), { building: null, feature: null, exit: false });
  assert.equal(siteNavigationBack(true, null, null).exit, true);
  assert.equal(siteSelectionFeature(false), null);
  assert.deepEqual(siteNavigationBack(false, building, "assets"), { building, feature: null, exit: false });
  assert.deepEqual(siteNavigationBack(false, building, "create"), { building, feature: null, exit: false });
  assert.deepEqual(siteNavigationBack(false, building, null), { building: null, feature: null, exit: false });
  assert.equal(siteNavigationBack(false, null, null).exit, true);
});

test("remembered sites only reorder currently loaded sites and never restore revoked/missing sites", () => {
  const sites = [{ id: "a", name: "Alpha" }, { id: "z", name: "Zulu" }];
  assert.deepEqual(orderSites(sites, ["revoked", "z"]).map((site) => site.id), ["z", "a"]);
  assert.deepEqual(sites.map((site) => site.id), ["a", "z"]);
  assert.deepEqual(orderSites([], ["revoked"]), []);
});

test("navigation cache stores only minimal site labels, serialises selections and survives restart", async () => {
  const f = fixture(); const scope = f.navigation.forCompany("company");
  await Promise.all([scope.rememberSite({ id: "a", name: "Alpha", contact: "Not cached" }), scope.rememberSite({ id: "b", name: "Beta" })]);
  const restarted = f.create().navigation.forCompany("company");
  assert.deepEqual((await restarted.read()).recentIds, ["b", "a"]);
  assert.deepEqual((await restarted.read()).sites, [{ id: "b", name: "Beta" }, { id: "a", name: "Alpha" }]);
  assert.ok([...f.data.values()].every((raw) => !raw.includes("contact") && !raw.includes("Not cached")));
});

test("site labels and recents are isolated by project, company and authenticated user", async () => {
  const f = fixture(); const first = f.navigation.forCompany("company"); await first.rememberSite({ id: "site", name: "Private label" });
  assert.deepEqual((await f.navigation.forCompany("other-company").read()).sites, []);
  assert.deepEqual((await f.create("other-project").navigation.forCompany("company").read()).sites, []);
  f.switchUser("other"); await assert.rejects(first.read(), /AUTH_SESSION_CHANGED/);
  assert.deepEqual((await f.navigation.forCompany("company").read()).sites, []);
  f.switchUser("engineer"); assert.equal((await f.navigation.forCompany("company").read()).sites[0].name, "Private label");
});

test("Resume lists only current project/user/company drafts and uses cached site names where safe", async () => {
  const f = fixture();
  const first = await f.draftStore.forSite("company", "site").startOrResumeNotes(seed());
  await f.navigation.forCompany("company").rememberSite({ id: "site", name: "Lincoln Business Centre" });
  await f.draftStore.forSite("other-company", "site").startOrResumeNotes(seed("foreign"));
  await f.create("other-project").draftStore.forSite("company", "site").startOrResumeNotes(seed("foreign-project"));
  f.switchUser("other"); await f.draftStore.forSite("company", "site").startOrResumeNotes(seed("foreign-user")); f.switchUser("engineer");
  const result = await f.navigation.forCompany("company").listDrafts("engineer", []);
  assert.equal(result.drafts.length, 1); assert.equal(result.drafts[0].inspectionId, first.draft.inspectionId);
  assert.equal(result.drafts[0].siteName, "Lincoln Business Centre");
  assert.equal(result.drafts[0].assetReference, "EXT-asset"); assert.equal(result.drafts[0].compatible, true);
  assert.equal(Object.hasOwn(result.drafts[0], "engineerNotes"), false);
});

test("missing cached names use site IDs; senior site assignments and unknown roles remain enforced", async () => {
  const f = fixture();
  await f.draftStore.forSite("company", "allowed").startOrResumeNotes(seed("a"));
  await f.draftStore.forSite("company", "restricted").startOrResumeNotes(seed("b"));
  const scope = f.navigation.forCompany("company");
  const result = await scope.listDrafts("senior_engineer", ["allowed"]);
  assert.equal(result.drafts.length, 1); assert.equal(result.drafts[0].siteId, "allowed");
  assert.match(result.drafts[0].siteName, /allowed.*name not cached/);
  assert.deepEqual((await scope.listDrafts("senior_engineer", [])).drafts, []);
  assert.deepEqual((await scope.listDrafts("unknown", ["allowed"])).drafts, []);
  assert.deepEqual((await scope.listDrafts("office_admin", ["allowed"])).drafts, []);
  assert.equal((await scope.listDrafts("engineer", [])).drafts.length, 2); // Preserve existing legacy engineer policy.
});

test("Resume opens exactly the selected inspection ID, saves notes and returns without duplicates", async () => {
  const f = fixture(); const site = f.draftStore.forSite("company", "site");
  const saved = await site.startOrResumeNotes(seed()); await site.updateNotes(saved.draft.inspectionId, 1, "Offline notes");
  const selected = (await f.navigation.forCompany("company").listDrafts("engineer", [])).drafts[0];
  const controller = createInspectionNotesController(site, seed(), selected.inspectionId); await controller.open();
  assert.equal(controller.getState().draft.inspectionId, saved.draft.inspectionId); assert.equal(controller.getState().notes, "Offline notes");
  controller.changeNotes("Continued via Resume"); let returned = false;
  assert.equal(await controller.leave(() => { returned = true; }), true); assert.equal(returned, true);
  const again = createInspectionNotesController(site, seed(), selected.inspectionId); await again.open();
  assert.equal(again.getState().notes, "Continued via Resume"); assert.equal((await site.list()).length, 1);
});

test("missing/mismatched Resume IDs never create or expose a replacement draft", async () => {
  const f = fixture(); const site = f.draftStore.forSite("company", "site");
  const saved = await site.startOrResumeNotes(seed()); const original = [...f.data];
  const missing = createInspectionNotesController(site, seed(), "missing_0000000000000001"); await missing.open();
  assert.equal(missing.getState().error, "LOCAL_DRAFT_NOT_FOUND"); assert.equal(missing.getState().draft, null);
  const wrong = createInspectionNotesController(site, seed("different"), saved.draft.inspectionId); await wrong.open();
  assert.equal(wrong.getState().error, "DRAFT_KIND_MISMATCH"); assert.equal(wrong.getState().notes, "");
  assert.deepEqual([...f.data], original);
});

test("legacy structured drafts stay visible but cannot be silently replaced with a notes draft", async () => {
  const f = fixture(); const site = f.draftStore.forSite("company", "site");
  const legacy = await site.startOrResume({ assetDocId: "asset", assetReference: "EXT-asset", assetLocation: "Lobby", equipmentType: "Water",
    serviceType: "annual", templateId: "legacy-template", templateVersion: 1, questions: [{ id: "q", allowNA: false }] });
  const original = [...f.data]; const result = await f.navigation.forCompany("company").listDrafts("engineer", []);
  assert.equal(result.drafts[0].compatible, false);
  const controller = createInspectionNotesController(site, seed(), legacy.draft.inspectionId); await controller.open();
  assert.equal(controller.getState().error, "DRAFT_KIND_MISMATCH"); assert.deepEqual([...f.data], original);
});

test("failed saves from Resume block back and preserve unsynchronised notes until retry", async () => {
  const f = fixture(); const site = f.draftStore.forSite("company", "site"); const saved = await site.startOrResumeNotes(seed());
  const controller = createInspectionNotesController(site, seed(), saved.draft.inspectionId); await controller.open();
  controller.changeNotes("Keep this unsynced work"); const write = f.storage.setItem; f.storage.setItem = async () => { throw new Error("Full"); };
  assert.equal(await controller.leave(() => assert.fail("Must keep editor open")), false);
  assert.equal(controller.getState().notes, "Keep this unsynced work"); assert.equal(controller.getState().dirty, true);
  f.storage.setItem = write; assert.equal(await controller.save(), true);
  assert.equal(controller.getState().draft.sync.state, "pending-sync");
});

test("damaged draft copies remain listed for explicit recovery, never silently replaced", async () => {
  const f = fixture(); const site = f.draftStore.forSite("company", "site"); const saved = await site.startOrResumeNotes(seed());
  await site.updateNotes(saved.draft.inspectionId, 1, "New notes");
  const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0];
  f.data.set(newest[0], "damaged"); const result = await f.navigation.forCompany("company").listDrafts("engineer", []);
  assert.equal(result.drafts[0].recovery, true);
  const controller = createInspectionNotesController(site, seed(), result.drafts[0].inspectionId); await controller.open();
  assert.equal(controller.getState().recovery, true); assert.equal(await controller.save(), false);
  assert.equal(await controller.recover(), true); assert.ok([...f.data.values()].includes("damaged"));
});

test("an unreadable site does not erase or hide recoverable drafts at other sites", async () => {
  const f = fixture(); const broken = await f.draftStore.forSite("company", "broken").startOrResumeNotes(seed("b"));
  await f.draftStore.forSite("company", "good").startOrResumeNotes(seed("g"));
  const brokenKey = [...f.data.keys()].find((key) => key.includes(broken.draft.inspectionId)); f.data.set(brokenKey, "corrupt-only-copy");
  const original = [...f.data]; const result = await f.navigation.forCompany("company").listDrafts("engineer", []);
  assert.equal(result.drafts.length, 1); assert.equal(result.drafts[0].siteId, "good"); assert.equal(result.problems[0].siteId, "broken");
  assert.deepEqual([...f.data], original);
});

test("site discovery and cached reads reject an authentication change during I/O", async () => {
  const f = fixture(); await f.draftStore.forSite("company", "site").startOrResumeNotes(seed());
  const keys = f.storage.getAllKeys;
  f.storage.getAllKeys = async () => { const result = await keys(); f.switchUser("other"); return result; };
  await assert.rejects(f.draftStore.listSiteIds("company"), (error) => error.code === "AUTH_SESSION_CHANGED");
});

test("corrupt site-label cache is surfaced without discarding stored drafts or raw cache", async () => {
  const f = fixture(); await f.draftStore.forSite("company", "site").startOrResumeNotes(seed());
  const scope = f.navigation.forCompany("company"); await scope.rememberSite({ id: "site", name: "Lincoln" });
  const key = [...f.data.keys()].find((key) => key.includes("extinguisher-navigation")); f.data.set(key, "bad-cache");
  const result = await scope.listDrafts("engineer", []);
  assert.equal(result.drafts.length, 1); assert.match(result.drafts[0].siteName, /name not cached/);
  assert.equal(result.problems.length, 1); assert.equal(f.data.get(key), "bad-cache");
  await assert.rejects(scope.rememberSite({ id: "site", name: "Replacement" })); assert.equal(f.data.get(key), "bad-cache");
});
