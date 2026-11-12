import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pendingRoutineChecklist, routineMediumFor } from "../../engineer-app/src/modules/Extinguishers/pendingRoutineChecklist.ts";
import { attachPendingRoutineChecklist, attachApprovedChecklist, attachDemonstrationChecklist, emptyServicingDraft, changeChecklistAnswer, validateServicingDraft, servicingProgress, APPROVED_SERVICE_CHECKLISTS } from "../../engineer-app/src/modules/Extinguishers/servicingDraft.ts";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
import { boundedChecklistProposal } from "../firebase/boundedChecklistProposal.mjs";
const planning = (medium = "water") => ({ ...emptyServicingDraft(), equipmentClass: medium === "co2" ? "co2" : medium === "powder" ? "powder" : "water-based", serviceType: "annual-basic" });
const seed = { assetDocId: "asset", assetReference: "EXT001", assetLocation: "Lobby", assetCapacity: "6 L", equipmentType: "Water" };
function fixture() {
  const data = new Map(); let sequence = 0;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key, value) { data.set(key, value); }, async getAllKeys() { return [...data.keys()]; } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-pending", getSession: () => ({ userId: "engineer", epoch: 1 }), generateId: () => `pending_${String(++sequence).padStart(16, "0")}` });
  return { data, storage, controller: () => createInspectionNotesController(store.forSite("company", "site"), seed) };
}
test("five media have distinct fixed pending templates, with all nine supported gauge variants explicitly versioned", () => {
  const ids = new Set();
  for (const medium of ["water", "foam", "co2", "powder", "wet-chemical"]) {
    for (const fitted of medium === "co2" ? [false] : [false, true]) {
      const template = pendingRoutineChecklist(medium, fitted); ids.add(template.id);
      assert.equal(template.questions.length, 11); assert.equal(template.version, 3);
      assert.equal(template.equipmentMedium, medium); assert.equal(template.approval.status, "pending-technical-validation");
      assert.equal(template.questions.some((question) => question.id === "fitted-gauge"), fitted);
      assert.equal(new Set(template.questions.map((question) => question.id)).size, 11);
      const draft = attachPendingRoutineChecklist(planning(medium), medium, fitted);
      assert.ok(draft.answers.every((answer) => answer.result === null && answer.notes === "" && answer.correctiveAction === ""));
      validateServicingDraft(draft);
    }
  }
  assert.equal(ids.size, 9);
  assert.throws(() => pendingRoutineChecklist("co2", true));
  assert.throws(() => pendingRoutineChecklist("water", null));
  assert.throws(() => pendingRoutineChecklist("unknown", false));
  assert.deepEqual(APPROVED_SERVICE_CHECKLISTS, []);
});
test("medium matching uses the explicit type label, never capacity or a generic water-based fallback", () => {
  for (const [type, medium] of [["Water", "water"], ["Foam", "foam"], ["CO₂", "co2"], ["Carbon dioxide", "co2"], ["Dry Powder", "powder"], ["Wet Chemical", "wet-chemical"]]) assert.equal(routineMediumFor(type), medium);
  for (const type of ["6 L", "2kg", "Water mist", "Other", "", "water-based"]) assert.equal(routineMediumFor(type), null);
});
test("pending snapshots cannot be approved, replaced or silently altered", () => {
  const draft = attachPendingRoutineChecklist(planning(), "water", false);
  assert.throws(() => attachApprovedChecklist(planning(), draft.checklist));
  assert.throws(() => attachPendingRoutineChecklist(draft, "foam", false));
  assert.throws(() => attachPendingRoutineChecklist(planning("co2"), "water", false));
  assert.throws(() => attachPendingRoutineChecklist({ ...planning(), serviceType: "extended" }, "water", false));
  for (const patch of [{ equipmentMedium: "foam" }, { gaugePresent: true }, { version: 99 }]) assert.throws(() => validateServicingDraft({ ...draft, checklist: { ...draft.checklist, ...patch } }));
  const oversized = structuredClone(draft); oversized.checklist.questions.push({ id: "extra", prompt: "Extra", allowNA: false }); oversized.answers.push({ questionId: "extra", result: null, notes: "", correctiveAction: "" });
  assert.throws(() => validateServicingDraft(oversized));
  assert.equal(draft.answers.length, 11);
});
test("annual candidate progress requires only FAIL reasons; N/A and PASS have no extra fields", () => {
  let draft = attachPendingRoutineChecklist(planning(), "water", true);
  assert.equal(servicingProgress(draft).outstanding, 11);
  draft = changeChecklistAnswer(draft, "location-risk", { result: "pass" });
  draft = changeChecklistAnswer(draft, "visible-condition", { result: "fail" });
  assert.equal(servicingProgress(draft).failed, 1); assert.equal(servicingProgress(draft).outstanding, 10);
  draft = changeChecklistAnswer(draft, "visible-condition", { notes: "Sample defect" });
  assert.equal(servicingProgress(draft).outstanding, 9);
  draft = changeChecklistAnswer(draft, "fitted-gauge", { result: "na" });
  draft = changeChecklistAnswer(draft, "safety-device", { result: "na", notes: " " });
  assert.equal(servicingProgress(draft).complete, 4); assert.equal(servicingProgress(draft).outstanding, 7);
  assert.equal(draft.answers.find((answer) => answer.questionId === "visible-condition").correctiveAction, "");
  assert.equal(servicingProgress(draft).submissionEnabled, false);
  assert.ok(servicingProgress(draft).issues.some((issue) => issue.includes("Pending technical validation")));
});

test("legacy demo snapshots and existing notes are preserved; no automatic conversion occurs", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  const demo = attachDemonstrationChecklist(planning()); controller.changeServicing(demo); controller.changeNotes("Keep existing notes"); await controller.save();
  const raw = [...f.data]; const resumed = f.controller(); await resumed.open();
  assert.deepEqual(resumed.getState().servicing, demo); assert.equal(resumed.getState().notes, "Keep existing notes");
  assert.throws(() => attachPendingRoutineChecklist(resumed.getState().servicing, "water", false));
  assert.deepEqual([...f.data], raw);
});

test("old pending v1 wording, N/A explanations and actions are preserved while new attachments use the eleven-topic v3 template", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  const legacy = pendingRoutineChecklist("water", false, 1);
  const old = { ...planning(), checklist: legacy, answers: legacy.questions.map(({ id }) => ({ questionId: id, result: null, notes: "", correctiveAction: "" })) };
  old.answers[0] = { ...old.answers[0], result: "na", notes: "Old N/A explanation", correctiveAction: "Old action" };
  controller.changeServicing(old); await controller.save(); const original = [...f.data];
  const resumed = f.controller(); await resumed.open();
  assert.deepEqual([...f.data], original); assert.deepEqual(resumed.getState().servicing, old);
  const latest = pendingRoutineChecklist("water", false);
  assert.equal(latest.version, 3); assert.notEqual(latest.id, legacy.id);
  assert.equal(legacy.questions[0].prompt, "Is the extinguisher accessible at its recorded location?");
  assert.equal(latest.questions[0].prompt, "Correct extinguisher for the location and risk?");
  resumed.changeAnswer("location", { result: "pass" }); await resumed.save();
  assert.equal(resumed.getState().servicing.answers[0].notes, "Old N/A explanation");
  assert.equal(resumed.getState().servicing.answers[0].correctiveAction, "Old action");
  assert.deepEqual(resumed.getState().servicing.checklist, legacy);
});
test("pending annual snapshot, answers, defects and notes save/resume offline with the same ID", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open(); const id = controller.getState().draft.inspectionId;
  controller.changeNotes("Original notes"); controller.changeServicing(attachPendingRoutineChecklist(planning(), "water", false));
  controller.changeAnswer("visible-condition", { result: "fail", notes: "Sample damage", correctiveAction: "Sample referral" });
  assert.equal(await controller.save(), true);
  const resumed = f.controller(); await resumed.open();
  assert.equal(resumed.getState().draft.inspectionId, id); assert.equal(resumed.getState().notes, "Original notes");
  assert.equal(resumed.getState().servicing.answers.find((answer) => answer.questionId === "visible-condition").notes, "Sample damage");
  assert.equal(resumed.getState().servicing.checklist.approval.status, "pending-technical-validation");
  assert.equal(resumed.getState().draft.sync.state, "pending-sync");
});
test("failed pending-draft writes retain the editor changes and explicit recovery keeps raw damage", async () => {
  const f = fixture(); const controller = f.controller(); await controller.open();
  controller.changeServicing(attachPendingRoutineChecklist(planning(), "water", false)); await controller.save();
  const write = f.storage.setItem; const original = [...f.data]; f.storage.setItem = async () => { throw new Error("Full"); };
  controller.changeAnswer("location-risk", { result: "pass" }); assert.equal(await controller.save(), false);
  assert.deepEqual([...f.data], original); assert.equal(controller.getState().servicing.answers[0].result, "pass");
  f.storage.setItem = write; await controller.save(); controller.changeNotes("New revision"); await controller.save();
  const newest = [...f.data].filter(([key]) => key.includes("/inspection-drafts/")).sort((a, b) => JSON.parse(b[1]).localRevision - JSON.parse(a[1]).localRevision)[0]; f.data.set(newest[0], "pending-damaged");
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  assert.equal(await resumed.recover(), true); assert.equal(resumed.getState().servicing.answers[0].result, "pass");
  assert.ok([...f.data.values()].includes("pending-damaged"));
});
test("9-question proposal changes only the bounded validator and is absent from active Firebase config", async () => {
  const source = await readFile("firestore.rules", "utf8"); const proposal = boundedChecklistProposal(source);
  const start = source.indexOf("          function validAnswers"); const end = source.indexOf("          function validShape", start);
  const proposalEnd = proposal.indexOf("          function validShape", start);
  assert.equal(proposal.slice(0, start), source.slice(0, start)); assert.equal(proposal.slice(proposalEnd), source.slice(end));
  assert.match(source.slice(start, end), /questions.size\(\) <= 8/); assert.match(proposal.slice(start, proposalEnd), /questions.size\(\) <= 9/);
  for (let index = 0; index < 9; index++) {
    assert.ok(proposal.includes(`answers[${index}] == { "questionId": questions[${index}].id`));
    assert.ok(proposal.includes(`validAnswer(answers[${index}], questions[${index}], allowedResults)`));
  }
  assert.equal(JSON.parse(await readFile("firebase.json", "utf8")).firestore.rules, "firestore.rules");
  assert.throws(() => boundedChecklistProposal(source.replace("questions.size() <= 8", "questions.size() <= 9")));
});
