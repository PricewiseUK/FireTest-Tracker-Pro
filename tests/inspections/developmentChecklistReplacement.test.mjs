import assert from "node:assert/strict";
import test from "node:test";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
import { attachDemonstrationChecklist, emptyServicingDraft } from "../../engineer-app/src/modules/Extinguishers/servicingDraft.ts";
import { approvedGaugePresence } from "../../engineer-app/src/modules/Extinguishers/approvedInspectionAsset.ts";
import { pendingRoutineChecklist } from "../../engineer-app/src/modules/Extinguishers/pendingRoutineChecklist.ts";
import { routineServicingForAsset, isDevelopmentWaterChecklistOutdated } from "../../engineer-app/src/modules/Extinguishers/inspectionChecklistSelection.ts";
const seed = { assetDocId: "verified-water-id", assetReference: "TEST-EXT001", equipmentType: "Water", assetCapacity: "6 L", assetLocation: "Lobby" };
function fixture(enabled = true) {
  const data = new Map(); let sequence = 0; let userId = "engineer"; let epoch = 0;
  const storage = { async getAllKeys() { return [...data.keys()]; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-replacement", getSession: () => ({ userId, epoch }), generateId: () => `local_${String(++sequence).padStart(16, "0")}`, allowDevelopmentChecklistReplacement: enabled });
  const site = () => store.forSite("company", "site");
  const controller = (asset = seed, id, options) => createInspectionNotesController(site(), asset, id, options);
  return { data, storage, store, site, controller, switchUser(id) { userId = id; epoch++; } };
}
async function existingDemo(f, asset = seed) {
  const controller = f.controller(asset); await controller.open();
  const demo = attachDemonstrationChecklist({ ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic" });
  demo.answers[0] = { ...demo.answers[0], result: "fail", notes: "Old failed check", correctiveAction: "Old action" };
  demo.defectStatus = "open"; demo.defects.push({ id: "old-defect", description: "Old observation", correctiveAction: "Referral", status: "open" });
  demo.evidence.push({ id: "old-photo", reference: "file:///old-photo.image", notes: "Original evidence" });
  controller.changeServicing(demo); controller.changeNotes("Original notes"); await controller.save();
  return controller;
}
const activeRows = (f) => [...f.data].filter(([key]) => key.includes("/inspection-drafts/"));

async function existingAnnual(f, version, asset = seed) {
  const controller = f.controller(asset); await controller.open();
  const checklist = pendingRoutineChecklist("water", false, version);
  const servicing = { ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic", checklist,
    answers: checklist.questions.map(({ id }, index) => ({ questionId: id, result: index === 0 ? "fail" : index === 1 ? "na" : "pass",
      notes: index === 0 ? "Previous defect" : index === 1 ? "Previous N/A note" : "", correctiveAction: index === 0 ? "Previous referral" : "" })) };
  servicing.defects.push({ id: "old-defect", description: "Original observation", correctiveAction: "Referral", status: "open" });
  servicing.evidence.push({ id: "old-photo", reference: "file:///previous.image", notes: "Original evidence" });
  controller.changeServicing(servicing); controller.changeNotes("Original notes"); await controller.save(); return controller;
}

for (const version of [1, 2]) {
  test(`annual v${version}: ordinary resume preserves eight checks; explicit update archives every original before loading eleven`, async () => {
    const f = fixture(); const controller = await existingAnnual(f, version);
    const original = structuredClone(controller.getState().draft); const before = [...f.data];
    const resumed = f.controller(seed, original.inspectionId, { gaugePresent: true, inspectionKind: "annual-basic" }); await resumed.open();
    assert.deepEqual(resumed.getState().draft, original); assert.deepEqual([...f.data], before);
    assert.equal(resumed.getState().servicing.answers.length, 8); assert.equal(resumed.canReplaceDevelopmentDemo(), true);
    const opened = f.controller(seed); await opened.open();
    assert.deepEqual(opened.getState().draft, original); assert.deepEqual([...f.data], before);
    const originals = activeRows(f); const write = f.storage.setItem;
    f.storage.setItem = async (key, raw) => {
      if (key.includes("/inspection-drafts/") && JSON.parse(raw).servicing?.checklist.version === 3) {
        for (const [, old] of originals) assert.ok([...f.data].some(([path, value]) => path.includes("/inspection-draft-recovery/") && value === old));
      }
      await write(key, raw);
    };
    assert.equal(await resumed.replaceDevelopmentDemo(false), true);
    const current = resumed.getState().draft;
    assert.equal(current.inspectionId, original.inspectionId); assert.equal(current.servicing.checklist.version, 3);
    assert.equal(current.servicing.answers.length, 11); assert.ok(current.servicing.answers.every(({ result, notes, correctiveAction }) => result === null && notes === "" && correctiveAction === ""));
    assert.equal(current.engineerNotes, original.engineerNotes); assert.deepEqual(current.servicing.evidence, original.servicing.evidence); assert.deepEqual(current.servicing.defects, original.servicing.defects);
    assert.deepEqual((await resumed.loadPreservedDevelopmentDemo()).draft, original);
    const restarted = f.controller(seed, current.inspectionId); await restarted.open(); assert.equal(restarted.getState().servicing.answers.length, 11);
    assert.equal(restarted.canReplaceDevelopmentDemo(), false); const after = [...f.data];
    assert.equal(await restarted.replaceDevelopmentDemo(false), false); assert.deepEqual([...f.data], after);
    assert.deepEqual((await restarted.loadPreservedDevelopmentDemo()).draft, original);
  });
}

test("old annual update saves latest edits and coalesces rapid taps into one preserved replacement", async () => {
  const f = fixture(); const controller = await existingAnnual(f, 2); controller.changeNotes("Latest unsaved notes");
  controller.changeAnswer("location", { notes: "Latest failure reason" });
  const revision = controller.getState().draft.localRevision;
  const results = await Promise.all(Array.from({ length: 20 }, () => controller.replaceDevelopmentDemo(false)));
  assert.ok(results.every(Boolean)); assert.equal(controller.getState().draft.localRevision, revision + 2);
  const original = await controller.loadPreservedDevelopmentDemo();
  assert.equal(original.draft.engineerNotes, "Latest unsaved notes"); assert.equal(original.draft.servicing.answers[0].notes, "Latest failure reason");
  assert.equal(original.draft.servicing.answers.length, 8);
});

test("old annual update fails safely during archival or active writes, then resumes eleven checks offline after retry", async () => {
  for (const failingPath of ["/inspection-draft-recovery/", "/inspection-drafts/"]) {
    const f = fixture(); const controller = await existingAnnual(f, 2); const original = structuredClone(controller.getState().draft);
    const before = activeRows(f); const write = f.storage.setItem;
    f.storage.setItem = async (key, raw) => { if (key.includes(failingPath)) throw new Error("Full"); await write(key, raw); };
    assert.equal(await controller.replaceDevelopmentDemo(false), false); assert.deepEqual(activeRows(f), before);
    assert.equal(controller.getState().servicing.answers.length, 8);
    f.storage.setItem = write; assert.equal(await controller.replaceDevelopmentDemo(false), true);
    assert.deepEqual((await controller.loadPreservedDevelopmentDemo()).draft, original);
    controller.changeAnswer("service-label", { result: "na" }); await controller.save();
    controller.changeNotes("Later revision"); await controller.save();
    const newest = activeRows(f).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "damaged-updated-annual");
    const resumed = f.controller(seed, original.inspectionId); await resumed.open(); assert.equal(resumed.getState().recovery, true);
    assert.equal(await resumed.recover(), true); assert.equal(resumed.getState().servicing.answers.length, 11);
    assert.equal(resumed.getState().servicing.answers.at(-1).result, "na");
    assert.deepEqual((await resumed.loadPreservedDevelopmentDemo()).draft, original); assert.ok([...f.data.values()].includes("damaged-updated-annual"));
  }
});

test("the eight-check exception excludes other assets, release mode, monthly templates and current annual templates", async () => {
  const f = fixture(); const controller = await existingAnnual(f, 2); const draft = controller.getState().draft;
  assert.equal(isDevelopmentWaterChecklistOutdated(draft, { ...seed, assetDocId: "different-document" }), false);
  assert.equal(isDevelopmentWaterChecklistOutdated(draft, { ...seed, equipmentType: "Foam" }), false);
  assert.equal(isDevelopmentWaterChecklistOutdated(draft, { ...seed, assetReference: "OTHER" }), false);
  for (const kind of ["monthly-visual", "annual-basic"]) assert.equal(isDevelopmentWaterChecklistOutdated({ ...draft, servicing: routineServicingForAsset(seed, false, kind) }, seed), false);
  const release = fixture(false); const disabled = await existingAnnual(release, 1); const before = [...release.data];
  assert.equal(disabled.canReplaceDevelopmentDemo(), false); assert.equal(await disabled.replaceDevelopmentDemo(false), false); assert.deepEqual([...release.data], before);
});

test("a fresh Water annual/basic draft selects all eleven current candidate topics with no default answers", async () => {
  const f = fixture(); const controller = f.controller(seed, undefined, { gaugePresent: false, inspectionKind: "annual-basic" }); await controller.open();
  const servicing = controller.getState().servicing;
  assert.equal(servicing.checklist.version, 3); assert.equal(servicing.checklist.equipmentMedium, "water");
  assert.equal(servicing.checklist.questions.length, 11); assert.equal(servicing.answers.length, 11);
  assert.deepEqual(servicing.checklist.questions.map(({ id }) => id), ["location-risk", "visible-condition", "instructions", "operating-mechanism", "safety-device", "discharge-assembly", "model-pressure", "contents", "service-interval", "basic-service-actions", "service-label"]);
  assert.equal(servicing.answers.at(-1).questionId, "service-label"); assert.ok(servicing.answers.every(({ result }) => result === null));
});

test("test Water demo replacement confirms every original archive before writing eleven unanswered current checks", async () => {
  const f = fixture(); const controller = await existingDemo(f); const original = structuredClone(controller.getState().draft);
  const originals = activeRows(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => {
    if (key.includes("/inspection-drafts/") && raw.includes("pending-technical-validation")) {
      for (const [, old] of originals) assert.ok([...f.data].some(([path, value]) => path.includes("/inspection-draft-recovery/") && value === old));
    }
    await write(key, raw);
  };
  assert.equal(await controller.replaceDevelopmentDemo(true), true);
  const current = controller.getState().draft;
  assert.equal(current.inspectionId, original.inspectionId); assert.equal(current.createdAtMs, original.createdAtMs);
  assert.equal(current.servicing.checklist.version, 3); assert.equal(current.servicing.checklist.equipmentMedium, "water");
  assert.equal(current.servicing.answers.length, 11); assert.ok(current.servicing.answers.every((answer) => answer.result === null && answer.notes === "" && answer.correctiveAction === ""));
  assert.equal(current.engineerNotes, original.engineerNotes); assert.deepEqual(current.servicing.defects, original.servicing.defects); assert.deepEqual(current.servicing.evidence, original.servicing.evidence);
  const preserved = await controller.loadPreservedDevelopmentDemo(); assert.deepEqual(preserved.draft, original);
  assert.notEqual(current.recoveryArchiveId, original.recoveryArchiveId);
  assert.equal(current.sync.state, "pending-sync");
  const resumed = f.controller(seed, original.inspectionId); await resumed.open(); assert.equal(resumed.getState().servicing.answers.length, 11);
});
test("ordinary open and explicit Resume never automatically replace an existing demo snapshot", async () => {
  const f = fixture(); const controller = await existingDemo(f); const before = [...f.data];
  const id = controller.getState().draft.inspectionId;
  const resumed = f.controller(seed, id, { gaugePresent: true }); await resumed.open();
  assert.equal(resumed.getState().servicing.answers.length, 3); assert.equal(resumed.getState().servicing.answers[0].notes, "Old failed check");
  const opened = f.controller(seed, undefined, { gaugePresent: true }); await opened.open();
  assert.equal(opened.getState().servicing.answers.length, 3); assert.deepEqual([...f.data], before);
});
test("rapid replacement taps share one operation, archive latest unsaved edits and block leaving/editing while busy", async () => {
  const f = fixture(); const controller = await existingDemo(f); controller.changeNotes("Latest unsaved notes");
  const revision = controller.getState().draft.localRevision;
  const first = controller.replaceDevelopmentDemo(false);
  controller.changeNotes("Must not race the replacement");
  assert.equal(await controller.leave(() => assert.fail("Cannot leave during preservation")), false);
  const results = await Promise.all([first, ...Array.from({ length: 20 }, () => controller.replaceDevelopmentDemo(false))]);
  assert.ok(results.every(Boolean)); assert.equal(controller.getState().draft.localRevision, revision + 2);
  const preserved = await controller.loadPreservedDevelopmentDemo(); assert.equal(preserved.draft.engineerNotes, "Latest unsaved notes");
  assert.equal(controller.getState().notes, "Latest unsaved notes");
  const before = [...f.data]; assert.equal(await controller.replaceDevelopmentDemo(false), false); assert.deepEqual([...f.data], before);
});
test("release mode, other assets, wrong verified type and stale revisions cannot use the exception", async () => {
  const f = fixture(false); const controller = await existingDemo(f); const before = [...f.data]; const saved = controller.getState().draft;
  const site = f.site(); site.developmentChecklistReplacementEnabled = true;
  await assert.rejects(site.replaceDevelopmentDemo(saved.inspectionId, saved.localRevision, seed, true), (error) => error.code === "DEVELOPMENT_REPLACEMENT_DISABLED");
  assert.deepEqual([...f.data], before);
  const g = fixture(); const other = await existingDemo(g, { ...seed, assetReference: "EXT002" }); const unrelated = other.getState().draft;
  await assert.rejects(g.site().replaceDevelopmentDemo(unrelated.inspectionId, unrelated.localRevision, { ...seed, assetReference: "EXT002" }, false));
  const h = fixture(); const valid = await existingDemo(h); const current = valid.getState().draft; const unchanged = [...h.data];
  await assert.rejects(h.site().replaceDevelopmentDemo(current.inspectionId, current.localRevision, { ...seed, equipmentType: "Foam" }, false));
  await assert.rejects(h.site().replaceDevelopmentDemo(current.inspectionId, current.localRevision - 1, seed, false), (error) => error.code === "REVISION_CONFLICT");
  assert.deepEqual([...h.data], unchanged);
});
test("archive failure leaves the active demo untouched; explicit retry can safely complete", async () => {
  const f = fixture(); const controller = await existingDemo(f); const original = activeRows(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { if (key.includes("/inspection-draft-recovery/")) throw new Error("Full"); await write(key, raw); };
  assert.equal(await controller.replaceDevelopmentDemo(true), false); assert.deepEqual(activeRows(f), original);
  assert.equal(controller.getState().servicing.answers.length, 3);
  f.storage.setItem = write; assert.equal(await controller.replaceDevelopmentDemo(true), true);
  assert.equal((await controller.loadPreservedDevelopmentDemo()).draft.servicing.answers.length, 3);
});
test("lost replacement acknowledgement is reconciled without replacing twice or losing the preserved original", async () => {
  const f = fixture(); const controller = await existingDemo(f); const read = f.storage.getItem; let lose = true;
  f.storage.getItem = async (key) => {
    const raw = await read(key);
    if (lose && key.includes("/inspection-drafts/") && raw?.includes("pending-technical-validation")) { lose = false; throw new Error("Lost acknowledgement"); }
    return raw;
  };
  assert.equal(await controller.replaceDevelopmentDemo(false), true);
  assert.equal(controller.getState().servicing.answers.length, 11);
  assert.equal((await controller.loadPreservedDevelopmentDemo()).draft.servicing.answers[0].notes, "Old failed check");
});

test("a replacement write failure keeps the active demo and a readable separate original until retry", async () => {
  const f = fixture(); const controller = await existingDemo(f); const before = activeRows(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => {
    if (key.includes("/inspection-drafts/") && raw.includes("pending-technical-validation")) throw new Error("Active write failed");
    await write(key, raw);
  };
  assert.equal(await controller.replaceDevelopmentDemo(true), false); assert.deepEqual(activeRows(f), before);
  const preserved = await controller.loadPreservedDevelopmentDemo(); assert.equal(preserved.draft.servicing.answers[0].notes, "Old failed check");
  assert.equal(await f.store.forSite("other-company", "site").loadPreservedDevelopmentDemo(preserved.draft.inspectionId), null);
  assert.equal(await f.store.forSite("company", "other-site").loadPreservedDevelopmentDemo(preserved.draft.inspectionId), null);
  f.storage.setItem = write; assert.equal(await controller.replaceDevelopmentDemo(true), true);
});

test("damaged originals must complete existing recovery before the development exception can run", async () => {
  const f = fixture(); const controller = await existingDemo(f); const initial = controller.getState().draft;
  controller.changeNotes("Newest notes"); await controller.save();
  const newest = activeRows(f).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "damaged-demo");
  const resumed = f.controller(seed, initial.inspectionId); await resumed.open(); const unchanged = [...f.data];
  assert.equal(resumed.getState().recovery, true); assert.equal(resumed.canReplaceDevelopmentDemo(), false);
  assert.equal(await resumed.replaceDevelopmentDemo(true), false); assert.deepEqual([...f.data], unchanged);
});
test("the separate original survives later slot rotation and explicit offline recovery", async () => {
  const f = fixture(); const controller = await existingDemo(f); const original = structuredClone(controller.getState().draft);
  await controller.replaceDevelopmentDemo(false);
  controller.changeAnswer("location-risk", { result: "na" }); await controller.save(); controller.changeNotes("Later notes"); await controller.save();
  const newest = activeRows(f).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "damaged");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  await resumed.recover(); assert.deepEqual((await resumed.loadPreservedDevelopmentDemo()).draft, original);
  assert.ok([...f.data.values()].includes("damaged"));
});
test("authentication changes during archiving stop active replacement and never expose originals to the next engineer", async () => {
  const f = fixture(); const controller = await existingDemo(f); const before = activeRows(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { await write(key, raw); if (key.includes("/inspection-draft-recovery/")) f.switchUser("other"); };
  assert.equal(await controller.replaceDevelopmentDemo(true), false); assert.equal(controller.getState().draft, null); assert.deepEqual(activeRows(f), before);
  assert.equal(await f.site().loadPreservedDevelopmentDemo(JSON.parse(before[0][1]).inspectionId), null);
});
test("fresh drafts automatically select by verified explicit type/configuration; missing information is never inferred", async () => {
  for (const [equipmentType, medium] of [["Water", "water"], ["Foam", "foam"], ["CO₂", "co2"], ["Dry Powder", "powder"], ["Wet Chemical", "wet-chemical"]]) {
    const f = fixture(); const controller = f.controller({ ...seed, equipmentType }, undefined, { gaugePresent: false }); await controller.open();
    assert.equal(controller.getState().servicing.checklist.equipmentMedium, medium); assert.equal(controller.getState().servicing.answers.length, 11);
  }
  for (const [equipmentType, options] of [["Water", {}], ["Unknown", { gaugePresent: false }], ["CO₂", { gaugePresent: true }]]) {
    const f = fixture(); const controller = f.controller({ ...seed, equipmentType }, undefined, options); await controller.open();
    assert.equal(controller.getState().servicing.checklist, null);
  }
  assert.equal(approvedGaugePresence({ gaugePresent: true }), true); assert.equal(approvedGaugePresence({ gaugePresent: false }), false);
  assert.equal(approvedGaugePresence({ gaugePresent: "yes", capacity: "6 L" }), undefined);
  assert.equal(approvedGaugePresence({ type: "Water" }), undefined);
});
