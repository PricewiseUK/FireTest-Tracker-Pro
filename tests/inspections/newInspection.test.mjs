import assert from "node:assert/strict";
import test from "node:test";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
import { createEngineerNavigation } from "../../engineer-app/src/modules/Extinguishers/engineerNavigation.ts";
import { pendingRoutineChecklist } from "../../engineer-app/src/modules/Extinguishers/pendingRoutineChecklist.ts";
import { emptyServicingDraft, servicingProgress, changeChecklistAnswer, attachPendingRoutineChecklist } from "../../engineer-app/src/modules/Extinguishers/servicingDraft.ts";
import { inspectionDraftSummary } from "../../engineer-app/src/modules/Extinguishers/inspectionDraftSummary.ts";

const seed = { assetDocId: "water-document", assetReference: "TEST-EXT001", equipmentType: "Water", assetCapacity: "6 L", assetLocation: "Lobby" };
function fixture() {
  const data = new Map(); let sequence = 0; let userId = "engineer"; let epoch = 0; let timestamp = 1800000000000;
  const getSession = () => ({ userId, epoch });
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async getAllKeys() { return [...data.keys()]; }, async setItem(key, value) { data.set(key, value); } };
  const create = (generateId = () => `new_${String(++sequence).padStart(16, "0")}`) => createLocalInspectionDraftStore({ storage, projectId: "demo-new-inspection", getSession, generateId, now: () => ++timestamp });
  const store = create(); const site = () => store.forSite("company", "site");
  return { storage, data, create, store, site, getSession,
    controller: (id, options = {}) => createInspectionNotesController(site(), seed, id, options),
    switchUser(next) { userId = next; epoch++; } };
}
const rows = (f, id) => [...f.data].filter(([key]) => key.includes(`/inspection-drafts/`) && key.includes(`/${id}/`));
async function oldAnnual(f, version = 2) {
  const c = f.controller(); await c.open(); const checklist = pendingRoutineChecklist("water", false, version);
  const servicing = { ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic", checklist,
    answers: checklist.questions.map(({ id }, index) => ({ questionId: id, result: index === 0 ? "fail" : "na", notes: index === 0 ? "Original failure" : "Original N/A explanation", correctiveAction: "Original action" })) };
  servicing.evidence.push({ id: "photo", reference: "file:///original.image", notes: "Keep original photo" });
  servicing.defects.push({ id: "defect", description: "Original damage", correctiveAction: "Referral", status: "open" });
  c.changeServicing(servicing); c.changeNotes("Original notes"); await c.save(); return c;
}

for (const version of [1, 2]) test(`New annual alongside v${version} retains every old copy and resumes each exact inspection offline`, async () => {
  const f = fixture(); const old = await oldAnnual(f, version); const original = structuredClone(old.getState().draft);
  const before = rows(f, original.inspectionId); const archives = [...f.data].filter(([key]) => key.includes("/inspection-draft-recovery/"));
  const fresh = f.controller(undefined, { newInspection: true, inspectionKind: "annual-basic", gaugePresent: false }); await fresh.open();
  const current = fresh.getState().draft;
  assert.notEqual(current.inspectionId, original.inspectionId); assert.equal(current.servicing.checklist.version, 3);
  assert.equal(current.servicing.answers.length, 11); assert.ok(current.servicing.answers.every(({ result, notes, correctiveAction }) => result === null && notes === "" && correctiveAction === ""));
  assert.equal(current.engineerNotes, ""); assert.deepEqual(current.servicing.evidence, []); assert.deepEqual(current.servicing.defects, []);
  assert.deepEqual(rows(f, original.inspectionId), before); for (const [key, raw] of archives) assert.equal(f.data.get(key), raw);
  fresh.changeAnswer("service-label", { result: "na" }); fresh.changeNotes("New notes"); assert.equal(await fresh.leave(() => {}), true);
  const restartedStore = f.create(); const site = restartedStore.forSite("company", "site");
  const resumedOld = createInspectionNotesController(site, seed, original.inspectionId); await resumedOld.open();
  assert.deepEqual(resumedOld.getState().draft, original); assert.deepEqual(rows(f, original.inspectionId), before);
  const resumedNew = createInspectionNotesController(site, seed, current.inspectionId); await resumedNew.open();
  assert.equal(resumedNew.getState().notes, "New notes"); assert.equal(resumedNew.getState().servicing.answers.at(-1).result, "na");
  assert.equal(resumedNew.getState().servicing.answers.length, 11); assert.equal(resumedNew.getState().draft.sync.state, "pending-sync");
  assert.equal(servicingProgress(resumedNew.getState().servicing).submissionEnabled, false);
  await assert.rejects(site.startOrResumeNotes(seed), (e) => e.code === "DUPLICATE_DRAFTS"); // No arbitrary fallback selection.
});

test("one New request and repeated controller opens coalesce; a separate deliberate New action gets a different ID", async () => {
  const f = fixture(); const request = f.site().prepareNewNotes(seed);
  const created = await Promise.all(Array.from({ length: 20 }, () => request.start()));
  assert.ok(created.every(({ draft }) => draft.inspectionId === request.inspectionId)); assert.equal((await f.site().list()).length, 1);
  const c = f.controller(undefined, { newInspection: true, inspectionKind: "annual-basic", gaugePresent: false });
  await Promise.all(Array.from({ length: 20 }, () => c.open())); const id = c.getState().draft.inspectionId;
  await c.open(); assert.equal((await f.site().list()).length, 2); assert.notEqual(id, request.inspectionId);
});

test("new draft write failure retries the same reserved ID without touching existing work", async () => {
  const f = fixture(); const old = await oldAnnual(f); const before = [...f.data]; const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Disk full"); };
  const c = f.controller(undefined, { newInspection: true, gaugePresent: false, inspectionKind: "annual-basic" }); await c.open();
  assert.equal(c.getState().draft, null); assert.ok(c.getState().error); assert.deepEqual([...f.data], before);
  f.storage.setItem = write; await c.open(); assert.equal(c.getState().servicing.answers.length, 11);
  assert.equal((await f.site().list()).length, 2); assert.equal((await f.site().load(old.getState().draft.inspectionId)).draft.engineerNotes, "Original notes");
});

test("lost creation acknowledgement reconciles the original New ID instead of creating a duplicate", async () => {
  const f = fixture(); const read = f.storage.getItem; let lose = true;
  f.storage.getItem = async (key) => {
    const raw = await read(key);
    if (lose && raw && key.includes("/inspection-drafts/")) { lose = false; throw new Error("Lost acknowledgement"); }
    return raw;
  };
  const c = f.controller(undefined, { newInspection: true, inspectionKind: "annual-basic", gaugePresent: false }); await c.open();
  const records = await f.site().list(); assert.equal(records.length, 1); const id = records[0].draft.inspectionId;
  await c.open(); assert.equal(c.getState().draft.inspectionId, id); assert.equal(c.getState().servicing.answers.length, 11);
  assert.equal((await f.site().list()).length, 1);
});

test("ID collisions never reuse or overwrite an existing draft, even for the same asset", async () => {
  const f = fixture(); const old = await oldAnnual(f); const before = [...f.data];
  const collision = f.create(() => old.getState().draft.inspectionId).forSite("company", "site").prepareNewNotes(seed);
  await assert.rejects(collision.start(), (error) => error.code === "ID_COLLISION"); assert.deepEqual([...f.data], before);
});

test("monthly and annual new drafts remain distinct and use their own current unanswered templates", async () => {
  const f = fixture(); const ids = [];
  for (const [kind, count] of [["monthly-visual", 8], ["annual-basic", 11]]) {
    const c = f.controller(undefined, { newInspection: true, inspectionKind: kind, gaugePresent: false }); await c.open();
    ids.push(c.getState().draft.inspectionId); assert.equal(c.getState().servicing.answers.length, count);
    assert.equal(c.getState().servicing.serviceType, kind); assert.ok(c.getState().servicing.answers.every(({ result }) => result === null));
  }
  assert.notEqual(ids[0], ids[1]);
});

test("new annual intent with unknown gauge is saved without guessing; confirmed gauge attaches eleven checks", async () => {
  const f = fixture(); const c = f.controller(undefined, { newInspection: true, inspectionKind: "annual-basic" }); await c.open();
  assert.equal(c.getState().servicing.serviceType, "annual-basic"); assert.equal(c.getState().servicing.checklist, null);
  const resumed = f.controller(c.getState().draft.inspectionId); await resumed.open();
  assert.equal(resumed.getState().servicing.serviceType, "annual-basic"); assert.equal(resumed.getState().servicing.checklist, null);
  resumed.changeServicing(attachPendingRoutineChecklist(resumed.getState().servicing, "water", true)); await resumed.save();
  assert.equal(resumed.getState().servicing.answers.length, 11);
});

test("all separate drafts appear in Resume with dates, service labels and eight/eleven counts", async () => {
  const f = fixture(); const old = await oldAnnual(f); const fresh = f.controller(undefined, { newInspection: true, inspectionKind: "annual-basic", gaugePresent: false }); await fresh.open();
  const navigation = createEngineerNavigation({ storage: f.storage, draftStore: f.store, getSession: f.getSession, projectId: "demo-new-inspection" });
  const scope = navigation.forCompany("company"); await scope.rememberSite({ id: "site", name: "Lincoln" });
  const { drafts } = await scope.listDrafts("engineer", []); assert.equal(drafts.length, 2);
  assert.deepEqual(new Set(drafts.map(({ inspectionId }) => inspectionId)), new Set([old.getState().draft.inspectionId, fresh.getState().draft.inspectionId]));
  assert.deepEqual(new Set(drafts.map(({ checks }) => checks)), new Set([8, 11]));
  assert.ok(drafts.every(({ label, createdAtMs, siteName }) => label === "Annual Basic Service" && Number.isSafeInteger(createdAtMs) && siteName === "Lincoln"));
  assert.equal(inspectionDraftSummary(old.getState().draft).checks, 8);
  assert.deepEqual((await scope.listDrafts("senior_engineer", [])).drafts, []);
});

test("user/company/site isolation holds for New and exact Resume, including an auth change during creation", async () => {
  const f = fixture(); const c = f.controller(undefined, { newInspection: true, gaugePresent: false });
  const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { await write(key, raw); f.switchUser("another-engineer"); };
  await c.open(); assert.equal(c.getState().draft, null); assert.equal(c.getState().closed, true);
  const raw = [...f.data.values()][0]; const id = JSON.parse(raw).inspectionId;
  assert.equal(await f.site().load(id), null);
  f.storage.setItem = write; f.switchUser("engineer");
  assert.ok(await f.site().load(id));
  assert.equal(await f.store.forSite("other-company", "site").load(id), null);
  assert.equal(await f.store.forSite("company", "other-site").load(id), null);
  const staleRequest = f.site().prepareNewNotes(seed); f.switchUser("another-engineer");
  assert.throws(() => staleRequest.start(), (error) => error.code === "AUTH_SESSION_CHANGED");
});

test("corrupt originals block unsafe creation without modifying data; exact Resume retains explicit recovery", async () => {
  const f = fixture(); const old = await oldAnnual(f); old.changeNotes("Another revision"); await old.save();
  const id = old.getState().draft.inspectionId;
  const latest = rows(f, id).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(latest[0], "damaged"); const before = [...f.data];
  await assert.rejects(f.site().prepareNewNotes(seed).start(), (error) => error.code === "RECOVERY_REQUIRED"); assert.deepEqual([...f.data], before);
  const resumed = f.controller(id); await resumed.open(); assert.equal(resumed.getState().recovery, true); assert.equal(await resumed.recover(), true);
  assert.ok([...f.data.values()].includes("damaged"));
});

test("exact Resume never creates a replacement for a missing ID or wrong asset; conflicting intents are rejected", async () => {
  const f = fixture(); const old = await oldAnnual(f); const id = old.getState().draft.inspectionId; const before = [...f.data];
  const missing = f.controller("missing_0000000000000000"); await missing.open(); assert.equal(missing.getState().draft, null); assert.deepEqual([...f.data], before);
  const wrong = createInspectionNotesController(f.site(), { ...seed, assetDocId: "other-asset" }, id); await wrong.open();
  assert.equal(wrong.getState().draft, null); assert.deepEqual([...f.data], before);
  assert.throws(() => f.controller(id, { newInspection: true }), /CONFLICTING_INSPECTION_INTENT/);
});

test("new eleven-check answers still permit PASS/N/A without notes, require only FAIL reasons and never enable submission", () => {
  let value = attachPendingRoutineChecklist({ ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic" }, "water", false);
  value = changeChecklistAnswer(value, "location-risk", { result: "pass" });
  value = changeChecklistAnswer(value, "service-label", { result: "na" });
  value = changeChecklistAnswer(value, "visible-condition", { result: "fail" });
  assert.equal(servicingProgress(value).complete, 2); assert.equal(servicingProgress(value).failedWithoutReason, 1);
  value = changeChecklistAnswer(value, "visible-condition", { notes: "Damage" });
  assert.equal(servicingProgress(value).complete, 3); assert.equal(servicingProgress(value).submissionEnabled, false);
});
