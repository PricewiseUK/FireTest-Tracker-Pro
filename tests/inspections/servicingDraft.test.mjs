import assert from "node:assert/strict";
import test from "node:test";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
import { classificationIssue, emptyServicingDraft, attachApprovedChecklist, validateServicingDraft, servicingProgress, serviceTypesFor, APPROVED_SERVICE_CHECKLISTS, attachDemonstrationChecklist, changeChecklistAnswer, demonstrationChecklist } from "../../engineer-app/src/modules/Extinguishers/servicingDraft.ts";
import { attachInspectionPhoto } from "../../engineer-app/src/modules/Extinguishers/inspectionPhotoAttachment.ts";
const seed = { assetDocId: "asset", assetReference: "EXT001", assetLocation: "Lobby", assetCapacity: "6 L", equipmentType: "Water" };
function fixture() {
  const data = new Map(); let id = 0; let userId = "engineer"; let epoch = 0;
  const storage = { async getAllKeys() { return [...data.keys()]; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, raw) { data.set(key, raw); } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-servicing", getSession: () => ({ userId, epoch }), generateId: () => `servicing_${String(++id).padStart(16, "0")}` });
  const site = () => store.forSite("company", "site");
  return { data, storage, site, controller: () => createInspectionNotesController(site(), seed), switchUser(next) { userId = next; epoch++; } };
}
const planning = () => ({ ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic" });
const template = (count = 2) => ({ id: "SYNTHETIC_TEST_ONLY", version: 1, equipmentClass: "water-based", serviceType: "annual-basic",
  approval: { status: "approved", approvedBy: "TEST_FIXTURE_ONLY", approvedAt: "2026-11-01T00:00:00Z", source: "Synthetic fixture; not servicing guidance" },
  questions: Array.from({ length: count }, (_, i) => ({ id: `test-${i}`, prompt: "Synthetic test question; not servicing guidance", allowNA: i !== 0 })) });

test("known asset-type discrepancies are flagged without guessing a class from capacity", () => {
  assert.ok(classificationIssue("Water", "co2")); assert.ok(classificationIssue("CO₂", "water-based"));
  assert.equal(classificationIssue("CO₂", "co2"), null); assert.equal(classificationIssue("Dry Powder", "primary-sealed-powder"), null);
  assert.equal(classificationIssue("Other", "unconfirmed"), null);
});

test("no production questions are supplied; service intent respects explicit equipment class", () => {
  assert.deepEqual(APPROVED_SERVICE_CHECKLISTS, []);
  assert.deepEqual(emptyServicingDraft().answers, []);
  assert.equal(emptyServicingDraft().defectStatus, "not-assessed");
  assert.equal(serviceTypesFor("co2").includes("extended"), false);
  assert.equal(serviceTypesFor("co2").includes("co2-overhaul"), true);
  assert.equal(serviceTypesFor("water-based").includes("co2-overhaul"), false);
  assert.deepEqual(serviceTypesFor("other"), []);
  assert.throws(() => validateServicingDraft({ ...planning(), serviceType: "co2-overhaul" }));
});
test("approved versioned fixtures start unanswered, reject unapproved/oversized definitions and never truncate", () => {
  const draft = attachApprovedChecklist(planning(), template(12));
  assert.equal(draft.answers.length, 12); assert.ok(draft.answers.every((answer) => answer.result === null && answer.notes === "" && answer.correctiveAction === ""));
  assert.throws(() => attachApprovedChecklist(planning(), template(65)));
  assert.throws(() => attachApprovedChecklist(planning(), { ...template(), approval: { ...template().approval, status: "pending" } }));
  assert.throws(() => attachApprovedChecklist({ ...planning(), equipmentClass: "co2" }, template()));
  assert.throws(() => attachApprovedChecklist(draft, template()));
});
test("partial FAIL saves remain possible; only a FAIL reason is required for local check completion", () => {
  const draft = attachApprovedChecklist(planning(), template());
  draft.answers[0].result = "fail"; draft.answers[1].result = "na";
  validateServicingDraft(draft);
  assert.equal(servicingProgress(draft).complete, 1);
  assert.equal(servicingProgress(draft).failedWithoutReason, 1);
  draft.answers[0].notes = "Fixture defect";
  assert.equal(servicingProgress(draft).complete, 2);
  assert.equal(draft.answers[0].correctiveAction, "");
  assert.equal(draft.answers[1].notes, "");
  assert.equal(servicingProgress(draft).submissionEnabled, false);
  draft.answers[0].result = "na"; validateServicingDraft(draft);
  assert.equal(draft.answers[0].notes, "Fixture defect");
});

test("migration archives every original v2 copy, preserves ID/notes/snapshot and survives reload", async () => {
  const f = fixture(); const site = f.site(); const initial = await site.startOrResumeNotes(seed);
  await site.updateNotes(initial.draft.inspectionId, 1, "Existing offline notes");
  const originals = [...f.data.values()]; const controller = f.controller(); await controller.open();
  assert.equal(controller.getState().draft.localSchemaVersion, 2); // Opening alone never migrates.
  controller.changeServicing(planning()); assert.equal(await controller.save(), true);
  const current = controller.getState().draft;
  assert.equal(current.localSchemaVersion, 3); assert.equal(current.engineerNotes, "Existing offline notes");
  assert.equal(current.inspectionId, initial.draft.inspectionId); assert.equal(current.createdAtMs, initial.draft.createdAtMs);
  assert.equal(current.assetReference, "EXT001"); assert.equal(current.auditHistory[0].action, "servicing-started");
  assert.deepEqual([...f.data].filter(([key]) => key.includes("/inspection-draft-recovery/")).map(([, raw]) => raw).sort(), originals.sort());
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().servicing.serviceType, "annual-basic");
  assert.equal(resumed.getState().notes, "Existing offline notes"); assert.equal((await site.list()).length, 1);
  resumed.changeNotes("Edited after migration"); await resumed.save();
  assert.equal(resumed.getState().draft.auditHistory.length, 2);
  assert.equal(resumed.getState().draft.sync.state, "pending-sync");
});
test("failed migration archive keeps legacy active data intact and editor changes available", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open(); const originals = [...f.data];
  f.storage.setItem = async () => { throw new Error("Device full"); };
  controller.changeServicing(planning()); controller.changeNotes("New pending notes");
  assert.equal(await controller.save(), false); assert.deepEqual([...f.data], originals);
  assert.equal(controller.getState().notes, "New pending notes"); assert.equal(controller.getState().servicing.serviceType, "annual-basic");
  assert.equal(await controller.leave(() => assert.fail("Must remain on editor")), false);
});
test("approved checklist snapshot is immutable and v3 defects/evidence persist", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  const draft = attachApprovedChecklist(planning(), template());
  draft.defectStatus = "open"; draft.defects.push({ id: "defect-1", description: "Fixture defect", correctiveAction: "Pending", status: "open" });
  draft.evidence.push({ id: "evidence-1", reference: "Existing photo reference", notes: "No file uploaded" });
  controller.changeServicing(draft); assert.equal(await controller.save(), true);
  const saved = controller.getState().draft;
  await assert.rejects(f.site().updateServicing(saved.inspectionId, saved.localRevision, saved.engineerNotes, { ...draft, checklist: { ...draft.checklist, version: 2 } }), (error) => error.code === "CHECKLIST_SNAPSHOT_IMMUTABLE");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().servicing.defects[0].description, "Fixture defect");
  assert.equal(resumed.getState().servicing.evidence[0].reference, "Existing photo reference");
});
test("v3 damaged-copy recovery retains structured work and local history", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open(); controller.changeServicing(planning()); await controller.save();
  controller.changeNotes("Latest notes"); await controller.save();
  const active = [...f.data].filter(([key]) => key.includes("/inspection-drafts/"));
  const newest = active.sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "damaged");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  assert.equal(await resumed.recover(), true); assert.equal(resumed.getState().servicing.serviceType, "annual-basic");
  assert.equal(resumed.getState().draft.auditHistory.at(-1).action, "recovered");
  assert.ok([...f.data.values()].includes("damaged"));
});
test("v3 user switching never exposes another engineer's structured data", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open(); controller.changeServicing(planning()); await controller.save();
  f.switchUser("other-engineer"); controller.changeNotes("Forbidden");
  assert.equal(controller.getState().draft, null); assert.equal(controller.getState().servicing.serviceType, null);
  const other = f.controller(); await other.open(); assert.equal(other.getState().servicing.serviceType, null);
});

test("demonstration templates remain explicitly unapproved, versioned and unanswered", () => {
  const demo = attachDemonstrationChecklist(planning());
  assert.equal(demo.checklist.approval.status, "demonstration");
  assert.equal(demo.checklist.version, 1);
  assert.ok(demo.checklist.questions.every((question) => question.prompt.includes("DEMO ONLY")));
  assert.ok(demo.answers.every((answer) => answer.result === null && answer.notes === ""));
  assert.equal(servicingProgress(demo).complete, 0);
  assert.equal(servicingProgress(demo).submissionEnabled, false);
  assert.throws(() => attachApprovedChecklist(planning(), demo.checklist));
  assert.throws(() => attachDemonstrationChecklist(emptyServicingDraft()));
  assert.throws(() => attachDemonstrationChecklist(demo));
  assert.throws(() => demonstrationChecklist("co2", "extended"));
  assert.equal(demonstrationChecklist("co2", "co2-overhaul").serviceType, "co2-overhaul");
  const modified = structuredClone(demo); modified.checklist.questions[0].prompt = "Unverified real servicing question";
  assert.throws(() => validateServicingDraft(modified));
});

test("one-tap PASS needs no typing and never answers other checks", () => {
  const original = attachDemonstrationChecklist(planning());
  const next = changeChecklistAnswer(original, "demo-result", { result: "pass" });
  assert.equal(original.answers[0].result, null);
  assert.deepEqual(next.answers.map((answer) => answer.result), ["pass", null, null]);
  assert.equal(next.answers[0].notes, "");
  const progress = servicingProgress(next);
  assert.equal(progress.answered, 1); assert.equal(progress.complete, 1); assert.equal(progress.failed, 0);
  assert.ok(progress.issues.includes("Unanswered questions remain"));
});

test("FAIL is saved as partial until its mandatory reason is entered; actions remain optional", () => {
  let draft = changeChecklistAnswer(attachDemonstrationChecklist(planning()), "demo-defect", { result: "fail" });
  assert.equal(servicingProgress(draft).failed, 1); assert.equal(servicingProgress(draft).complete, 0);
  draft = changeChecklistAnswer(draft, "demo-defect", { notes: "   ", correctiveAction: "Referred" });
  assert.equal(servicingProgress(draft).complete, 0);
  draft = changeChecklistAnswer(draft, "demo-defect", { notes: "Sample defect" });
  assert.equal(servicingProgress(draft).complete, 1);
  assert.equal(draft.evidence.length, 0); // Photographs are optional.
  const pass = changeChecklistAnswer(draft, "demo-defect", { result: "pass" });
  assert.equal(pass.answers[1].notes, "Sample defect"); assert.equal(pass.answers[1].correctiveAction, "Referred");
});

test("N/A is one tap with no explanation, including legacy templates with allowNA false", () => {
  let draft = attachDemonstrationChecklist(planning());
  draft = changeChecklistAnswer(draft, "demo-result", { result: "na" });
  assert.equal(draft.checklist.questions[0].allowNA, false); // Snapshot metadata is never rewritten.
  assert.equal(draft.answers[0].notes, "");
  assert.equal(servicingProgress(draft).complete, 1);
  assert.throws(() => changeChecklistAnswer(draft, "unknown", { result: "pass" }));
  draft = changeChecklistAnswer(draft, "demo-optional", { result: "na", notes: " " });
  assert.equal(servicingProgress(draft).complete, 2);
  assert.equal(servicingProgress(draft).submissionEnabled, false);
});

test("demo PASS/FAIL/N/A and existing notes survive offline save, controller restart and navigation", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeNotes("Preserved equipment observation");
  let draft = attachDemonstrationChecklist(planning());
  draft = changeChecklistAnswer(draft, "demo-result", { result: "pass" });
  draft = changeChecklistAnswer(draft, "demo-defect", { result: "fail", notes: "Sample damage", correctiveAction: "Sample referral" });
  draft = changeChecklistAnswer(draft, "demo-optional", { result: "na", notes: "Sample reason" });
  controller.changeServicing(draft); assert.equal(await controller.save(), true);
  let left = false; assert.equal(await controller.leave(() => { left = true; }), true); assert.equal(left, true);
  const resumed = f.controller(); await resumed.open();
  assert.deepEqual(resumed.getState().servicing, draft);
  assert.equal(resumed.getState().notes, "Preserved equipment observation");
  assert.equal(servicingProgress(resumed.getState().servicing).complete, 3);
  assert.equal(servicingProgress(resumed.getState().servicing).submissionEnabled, false);
  assert.equal(resumed.getState().draft.sync.state, "pending-sync");
});

test("failed answer writes retain unsaved checks and retry without losing existing data", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachDemonstrationChecklist(planning())); await controller.save();
  const originals = [...f.data]; const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Device full"); };
  controller.changeServicing(changeChecklistAnswer(controller.getState().servicing, "demo-defect", { result: "fail", notes: "Pending defect" }));
  assert.equal(await controller.save(), false); assert.deepEqual([...f.data], originals);
  assert.equal(controller.getState().servicing.answers[1].notes, "Pending defect");
  assert.equal(await controller.leave(() => assert.fail("Must preserve unsaved check")), false);
  f.storage.setItem = write; assert.equal(await controller.save(), true);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().servicing.answers[1].notes, "Pending defect");
});

test("offline demo recovery keeps damaged copies, template identity and valid answers", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  const draft = changeChecklistAnswer(attachDemonstrationChecklist(planning()), "demo-result", { result: "pass" });
  controller.changeServicing(draft); await controller.save(); controller.changeNotes("Later notes"); await controller.save();
  const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0];
  f.data.set(newest[0], "damaged-demo");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  resumed.changeServicing(changeChecklistAnswer(draft, "demo-defect", { result: "pass" }));
  assert.equal(resumed.getState().servicing.answers[1].result, null); // Read-only until explicit recovery.
  assert.equal(await resumed.recover(), true);
  assert.deepEqual(resumed.getState().servicing, draft);
  assert.ok([...f.data.values()].includes("damaged-demo"));
});

async function photoFixture() {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(changeChecklistAnswer(attachDemonstrationChecklist(planning()), "demo-defect", { result: "fail", notes: "Sample defect" }));
  await controller.save();
  return { f, controller };
}
test("rapid per-question commands merge with the latest state while an offline write is running", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachDemonstrationChecklist(planning())); await controller.save();
  let release; let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { started = resolve; });
  const write = f.storage.setItem; let first = true;
  f.storage.setItem = async (key, value) => { if (first) { first = false; started(); await gate; } await write(key, value); };
  controller.changeAnswer("demo-result", { result: "pass" }); const saving = controller.save(); await ready;
  controller.changeAnswer("demo-defect", { result: "fail" });
  controller.changeAnswer("demo-defect", { notes: "Rapid defect" });
  controller.changeAnswer("demo-optional", { result: "na" });
  controller.changeAnswer("demo-optional", { notes: "Rapid reason" });
  release(); assert.equal(await saving, true);
  const resumed = f.controller(); await resumed.open();
  assert.deepEqual(resumed.getState().servicing.answers.map((answer) => answer.result), ["pass", "fail", "na"]);
  assert.equal(resumed.getState().servicing.answers[1].notes, "Rapid defect");
  assert.equal(resumed.getState().servicing.answers[2].notes, "Rapid reason");
});
test("optional photographs copy into the current draft scope and preserve edits made during the picker", async () => {
  const { f, controller } = await photoFixture();
  let scope;
  await attachInspectionPhoto(controller, "demo-defect", {
    async pick() { controller.changeNotes("Notes edited during selection"); return "file:///picker/photo"; },
    async copy(source, target) { assert.equal(source, "file:///picker/photo"); scope = target; return "file:///scoped/photo.image"; }, id: () => "photo-test",
  });
  assert.equal(scope.userId, "engineer"); assert.equal(scope.companyId, "company"); assert.equal(scope.siteId, "site"); assert.equal(scope.projectId, "demo-servicing");
  assert.equal(scope.inspectionId, controller.getState().draft.inspectionId);
  const resumed = f.controller(); await resumed.open();
  assert.equal(resumed.getState().servicing.evidence[0].reference, "file:///scoped/photo.image");
  assert.equal(resumed.getState().notes, "Notes edited during selection");
});
test("cancelled/failed photo selection adds nothing; auth switching cannot attach another user's photograph", async () => {
  const { f, controller } = await photoFixture();
  const adapter = { async pick() { return null; }, async copy() { assert.fail("No copy on cancel"); }, id: () => "photo-test" };
  await attachInspectionPhoto(controller, "demo-defect", adapter); assert.equal(controller.getState().servicing.evidence.length, 0);
  await assert.rejects(attachInspectionPhoto(controller, "demo-defect", { ...adapter, async pick() { return "file:///picker/photo"; }, async copy() { throw new Error("Copy failed"); } }));
  assert.equal(controller.getState().servicing.evidence.length, 0);
  await assert.rejects(attachInspectionPhoto(controller, "demo-defect", { ...adapter, async pick() { f.switchUser("other"); return "file:///picker/photo"; } }), /PHOTO_SESSION_CHANGED/);
  assert.equal(controller.getState().draft, null);
});
test("photo reference remains retryable if its draft write fails; no upload or sync is claimed", async () => {
  const { f, controller } = await photoFixture(); const write = f.storage.setItem;
  await assert.rejects(attachInspectionPhoto(controller, "demo-defect", {
    async pick() { return "file:///picker/photo"; },
    async copy() { f.storage.setItem = async () => { throw new Error("Device full"); }; return "file:///scoped/kept.image"; }, id: () => "photo-test",
  }), /PHOTO_DRAFT_SAVE_FAILED/);
  assert.equal(controller.getState().servicing.evidence[0].reference, "file:///scoped/kept.image");
  assert.equal(controller.getState().dirty, true);
  f.storage.setItem = write; assert.equal(await controller.save(), true);
  assert.equal(controller.getState().draft.sync.state, "pending-sync");
});

test("user switching after a photo copy retains the file without attaching it to the next engineer", async () => {
  const { f, controller } = await photoFixture(); let copied = false;
  await assert.rejects(attachInspectionPhoto(controller, "demo-defect", {
    async pick() { return "file:///picker/photo"; },
    async copy() { copied = true; f.switchUser("other"); return "file:///first-engineer/kept.image"; }, id: () => "photo-test",
  }), /PHOTO_SESSION_CHANGED/);
  assert.equal(copied, true); assert.equal(controller.getState().draft, null);
  const other = f.controller(); await other.open();
  assert.equal(other.getState().servicing.checklist, null); assert.deepEqual(other.getState().servicing.evidence, []);
});

test("demo answers remain private after user switching and resume under their original engineer", async () => {
  const { f, controller } = await photoFixture();
  f.switchUser("other"); controller.changeAnswer("demo-result", { result: "pass" });
  assert.equal(controller.getState().draft, null);
  const other = f.controller(); await other.open(); assert.equal(other.getState().servicing.checklist, null);
  f.switchUser("engineer"); const original = f.controller(); await original.open();
  assert.equal(original.getState().servicing.answers[1].result, "fail");
  assert.equal(original.getState().servicing.answers[1].notes, "Sample defect");
  assert.equal(original.getState().servicing.answers[0].result, null);
});

test("PASS and N/A save with empty notes; FAIL does not block answering later checks", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachDemonstrationChecklist(planning())); await controller.save();
  controller.changeAnswer("demo-result", { result: "fail" }); await controller.save();
  controller.changeAnswer("demo-defect", { result: "pass" }); await controller.save();
  controller.changeAnswer("demo-optional", { result: "na" }); await controller.save();
  const resumed = f.controller(); await resumed.open();
  assert.deepEqual(resumed.getState().servicing.answers.map((answer) => [answer.result, answer.notes]), [["fail", ""], ["pass", ""], ["na", ""]]);
  assert.equal(servicingProgress(resumed.getState().servicing).failedWithoutReason, 1);
  assert.equal(servicingProgress(resumed.getState().servicing).complete, 2);
  resumed.changeAnswer("demo-result", { notes: "   " }); assert.equal(servicingProgress(resumed.getState().servicing).complete, 2);
  resumed.changeAnswer("demo-result", { notes: "Sample damage" }); await resumed.save();
  assert.equal(servicingProgress(resumed.getState().servicing).complete, 3);
  assert.equal(resumed.getState().servicing.answers[0].correctiveAction, "");
  assert.equal(resumed.getState().draft.sync.state, "pending-sync");
});

test("all twelve supplied local questions survive save/resume, including a one-tap N/A on the last check", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachApprovedChecklist(planning(), template(12))); await controller.save();
  for (let index = 0; index < 12; index++) controller.changeAnswer(`test-${index}`, { result: index === 11 ? "na" : "pass" });
  assert.equal(await controller.save(), true);
  const resumed = f.controller(); await resumed.open();
  assert.equal(resumed.getState().servicing.checklist.questions.length, 12);
  assert.equal(resumed.getState().servicing.answers.length, 12);
  assert.equal(resumed.getState().servicing.answers[11].result, "na"); assert.equal(resumed.getState().servicing.answers[11].notes, "");
  assert.equal(servicingProgress(resumed.getState().servicing).complete, 12);
  assert.equal(servicingProgress(resumed.getState().servicing).submissionEnabled, false);
});

test("device-only question bound is explicit, independent of server eight, and never truncates", () => {
  assert.equal(attachApprovedChecklist(planning(), template(64)).answers.length, 64);
  const supplied = template(65);
  assert.throws(() => attachApprovedChecklist(planning(), supplied), /CHECKLIST_EXCEEDS_LOCAL_STORAGE_LIMIT/);
  assert.equal(supplied.questions.length, 65);
});

test("long local drafts with empty N/A notes survive failed writes and explicit offline recovery", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachApprovedChecklist(planning(), template(12))); await controller.save();
  controller.changeAnswer("test-11", { result: "na" }); const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Full"); };
  assert.equal(await controller.save(), false); assert.equal(controller.getState().servicing.answers[11].result, "na");
  f.storage.setItem = write; await controller.save(); controller.changeNotes("Newer revision"); await controller.save();
  const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0];
  f.data.set(newest[0], "damaged-long-draft");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  assert.equal(await resumed.recover(), true);
  assert.equal(resumed.getState().servicing.answers.length, 12); assert.equal(resumed.getState().servicing.answers[11].result, "na");
  assert.equal(resumed.getState().servicing.answers[11].notes, ""); assert.ok([...f.data.values()].includes("damaged-long-draft"));
});
