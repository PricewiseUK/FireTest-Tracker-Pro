import assert from "node:assert/strict";
import test from "node:test";
import { pendingRoutineChecklist, inspectionAudience } from "../../engineer-app/src/modules/Extinguishers/pendingRoutineChecklist.ts";
import { planRoutineInspection, routineServicingForAsset } from "../../engineer-app/src/modules/Extinguishers/inspectionChecklistSelection.ts";
import { emptyServicingDraft, changeChecklistAnswer, servicingProgress, validateServicingDraft } from "../../engineer-app/src/modules/Extinguishers/servicingDraft.ts";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";

const seed = { assetDocId: "water-document", assetReference: "EXT001", equipmentType: "Water", assetLocation: "Lobby", assetCapacity: "6 L" };
function fixture() {
  const data = new Map(); let sequence = 0; let userId = "engineer"; let epoch = 0;
  const storage = { async getAllKeys() { return [...data.keys()]; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, raw) { data.set(key, raw); } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-two-checklists", getSession: () => ({ userId, epoch }), generateId: () => `routine_${String(++sequence).padStart(16, "0")}` });
  return { data, storage, site: () => store.forSite("company", "site"),
    controller: (id, options = { inspectionKind: null, gaugePresent: false }) => createInspectionNotesController(store.forSite("company", "site"), seed, id, options),
    switchUser(next) { userId = next; epoch++; } };
}

test("separate current monthly/annual definitions cover every medium and supported gauge configuration", () => {
  const ids = new Set();
  for (const medium of ["water", "foam", "co2", "powder", "wet-chemical"]) {
    for (const gauge of medium === "co2" ? [false] : [false, true]) {
      for (const [kind, count] of [["monthly-visual", 8], ["annual-basic", 11]]) {
        const template = pendingRoutineChecklist(medium, gauge, 3, kind); ids.add(template.id);
        assert.equal(template.serviceType, kind); assert.equal(template.questions.length, count);
        assert.equal(template.version, 3); assert.equal(template.approval.status, "pending-technical-validation");
        assert.match(template.approval.source, /BS 5306-3:2017/);
        assert.ok(template.approval.source.includes(inspectionAudience(kind)));
        assert.equal(new Set(template.questions.map(({ id }) => id)).size, count);
        assert.ok(template.questions.every(({ allowNA }) => allowNA));
        assert.doesNotMatch(template.questions.map(({ prompt }) => prompt).join(" "), /disassembl|internal examin|lift|tilt/i);
        if (kind === "monthly-visual") {
          assert.equal(template.questions[3].id, "fitted-gauge");
          assert.doesNotMatch(template.questions.map(({ prompt }) => prompt).join(" "), /weight|contents verification/i);
        } else {
          assert.equal(template.questions[6].id, gauge ? "fitted-gauge" : "model-pressure");
          if (!gauge) assert.doesNotMatch(template.questions[6].prompt, /gauge/i);
          assert.equal(template.questions[9].id, "basic-service-actions");
          assert.equal(template.questions[10].id, "service-label");
        }
      }
    }
  }
  assert.equal(ids.size, 18);
  assert.match(pendingRoutineChecklist("co2", false).questions[7].prompt, /weight.*manufacturer/);
  assert.match(pendingRoutineChecklist("wet-chemical", true).questions[5].prompt, /lance/);
  assert.throws(() => pendingRoutineChecklist("water", false, 2, "monthly-visual"));
});

test("monthly no-gauge check remains unanswered until the engineer chooses N/A without notes", () => {
  let value = routineServicingForAsset(seed, false, "monthly-visual");
  assert.equal(value.answers.length, 8); assert.ok(value.answers.every(({ result }) => result === null));
  assert.equal(servicingProgress(value).outstanding, 8);
  value = changeChecklistAnswer(value, "fitted-gauge", { result: "na" });
  assert.equal(value.answers[3].notes, ""); assert.equal(servicingProgress(value).complete, 1);
  assert.equal(servicingProgress(value).submissionEnabled, false);
});

test("both checklist kinds allow one-tap PASS/N/A, partial FAIL and continuing before the FAIL reason", () => {
  for (const kind of ["monthly-visual", "annual-basic"]) {
    let value = routineServicingForAsset(seed, true, kind);
    const [first, second, third] = value.answers.map(({ questionId }) => questionId);
    value = changeChecklistAnswer(value, first, { result: "fail" });
    value = changeChecklistAnswer(value, second, { result: "pass" });
    value = changeChecklistAnswer(value, third, { result: "na" });
    assert.equal(servicingProgress(value).answered, 3); assert.equal(servicingProgress(value).complete, 2);
    assert.equal(servicingProgress(value).failed, 1); assert.equal(servicingProgress(value).failedWithoutReason, 1);
    value = changeChecklistAnswer(value, first, { notes: " " }); assert.equal(servicingProgress(value).complete, 2);
    value = changeChecklistAnswer(value, first, { notes: "Seal damaged" }); assert.equal(servicingProgress(value).complete, 3);
    assert.ok(value.answers.slice(1).every(({ notes, correctiveAction }) => notes === "" && correctiveAction === ""));
    assert.equal(servicingProgress(value).submissionEnabled, false);
  }
});

test("inline kind selection waits for configuration, retains notes/observations, and rejects replacing attached checks", () => {
  const empty = emptyServicingDraft(); empty.evidence.push({ id: "photo", reference: "file:///local.image", notes: "Keep" });
  const planned = planRoutineInspection(empty, "Water", "monthly-visual");
  assert.equal(planned.serviceType, "monthly-visual"); assert.equal(planned.checklist, null);
  const attached = planRoutineInspection(planned, "Water", "monthly-visual", false);
  assert.equal(attached.answers.length, 8); assert.deepEqual(attached.evidence, empty.evidence);
  assert.throws(() => planRoutineInspection(attached, "Water", "annual-basic", false));
  assert.throws(() => planRoutineInspection(empty, "Unknown", "monthly-visual", false));
  assert.throws(() => planRoutineInspection(empty, "CO2", "monthly-visual", true));
  assert.throws(() => planRoutineInspection({ ...empty, equipmentClass: "co2" }, "Water", "annual-basic", false));
});

for (const [kind, count] of [["monthly-visual", 8], ["annual-basic", 11]]) {
  test(`${kind}: offline save, departure and process restart retain all ${count} answers, notes and actions`, async () => {
    const f = fixture(); const controller = f.controller(); await controller.open();
    assert.equal(controller.getState().servicing.checklist, null);
    const id = controller.getState().draft.inspectionId;
    controller.changeNotes("Existing engineer notes");
    controller.changeServicing(planRoutineInspection(controller.getState().servicing, "Water", kind, false));
    for (const [index, answer] of controller.getState().servicing.answers.entries()) {
      controller.changeAnswer(answer.questionId, { result: index === 0 ? "fail" : index % 2 ? "pass" : "na",
        notes: index === 0 ? "Sample defect" : "", correctiveAction: index === 0 ? "Referral recorded" : "" });
    }
    let left = false; assert.equal(await controller.leave(() => { left = true; }), true); assert.equal(left, true);
    const resumed = f.controller(id); await resumed.open();
    assert.equal(resumed.getState().draft.inspectionId, id); assert.equal(resumed.getState().servicing.serviceType, kind);
    assert.equal(resumed.getState().servicing.answers.length, count); assert.equal(servicingProgress(resumed.getState().servicing).complete, count);
    assert.equal(resumed.getState().notes, "Existing engineer notes");
    assert.equal(resumed.getState().servicing.answers[0].correctiveAction, "Referral recorded");
    assert.equal(resumed.getState().draft.sync.state, "pending-sync");
    assert.equal(servicingProgress(resumed.getState().servicing).submissionEnabled, false);
  });

  test(`${kind}: failed writes and damaged-copy recovery preserve unsynchronised work and user isolation`, async () => {
    const f = fixture(); const controller = f.controller(); await controller.open();
    controller.changeServicing(planRoutineInspection(controller.getState().servicing, "Water", kind, false)); await controller.save();
    const id = controller.getState().draft.inspectionId; const original = [...f.data]; const write = f.storage.setItem;
    f.storage.setItem = async () => { throw new Error("Disk full"); };
    const last = controller.getState().servicing.answers.at(-1).questionId;
    controller.changeAnswer(last, { result: "na" }); assert.equal(await controller.save(), false);
    assert.deepEqual([...f.data], original); assert.equal(controller.getState().servicing.answers.at(-1).result, "na");
    f.storage.setItem = write; assert.equal(await controller.save(), true);
    controller.changeNotes("Newest notes"); await controller.save();
    const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0];
    f.data.set(newest[0], "damaged-copy");
    const restarted = f.controller(id); await restarted.open(); assert.equal(restarted.getState().recovery, true);
    assert.equal(await restarted.recover(), true);
    assert.equal(restarted.getState().servicing.answers.length, count); assert.equal(restarted.getState().servicing.answers.at(-1).result, "na");
    assert.ok([...f.data.values()].includes("damaged-copy"));
    f.switchUser("different-engineer"); assert.equal(await restarted.save(), false); assert.equal(restarted.getState().draft, null);
    assert.equal(await f.site().load(id), null);
  });
}

test("explicit new-controller kind attaches the requested version; neutral UI opening never assumes annual", async () => {
  for (const [kind, count] of [["monthly-visual", 8], ["annual-basic", 11]]) {
    const f = fixture(); const controller = f.controller(undefined, { inspectionKind: kind, gaugePresent: false }); await controller.open();
    assert.equal(controller.getState().servicing.answers.length, count); assert.equal(controller.getState().servicing.serviceType, kind);
    const original = [...f.data]; const resumed = f.controller(controller.getState().draft.inspectionId, { inspectionKind: kind === "monthly-visual" ? "annual-basic" : "monthly-visual", gaugePresent: true });
    await resumed.open(); assert.deepEqual([...f.data], original); assert.deepEqual(resumed.getState().servicing, controller.getState().servicing);
  }
});

test("both earlier annual snapshot versions still validate and resume without rewriting any stored copy", async () => {
  for (const version of [1, 2]) {
    const f = fixture(); const controller = f.controller(); await controller.open();
    const checklist = pendingRoutineChecklist("water", false, version);
    const legacy = { ...emptyServicingDraft(), equipmentClass: "water-based", serviceType: "annual-basic", checklist,
      answers: checklist.questions.map(({ id }) => ({ questionId: id, result: "na", notes: "Original explanation", correctiveAction: "Original action" })) };
    validateServicingDraft(legacy); controller.changeServicing(legacy); await controller.save(); const original = [...f.data];
    const resumed = f.controller(controller.getState().draft.inspectionId); await resumed.open();
    assert.deepEqual(resumed.getState().servicing, legacy); assert.deepEqual([...f.data], original);
  }
});
