import assert from "node:assert/strict";
import test from "node:test";
import {
  DETECTOR_SITING_GUIDANCE, emptyDetectorSitingObservations, selectSitingResult,
  observationGuidance, detectorSitingProgress, validateDetectorSitingObservations,
} from "../../engineer-app/src/modules/FireAlarms/detectorSitingGuidance.ts";
import { emptySystemChecks, systemChecksProgress, validateSystemChecks } from "../../engineer-app/src/modules/FireAlarms/systemChecks.ts";
import { createLocalFireAlarmDraftStore } from "../../engineer-app/src/services/localFireAlarmDraftStore.ts";
import { createFireAlarmTestingController } from "../../engineer-app/src/modules/FireAlarms/fireAlarmTestingController.ts";

const scope = { userId: "engineer", companyId: "company", siteId: "site", systemId: "panel" };
const ids = ["device-1", "device-2"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const topicId = DETECTOR_SITING_GUIDANCE[0].checkId;
function fixture() {
  const data = new Map(); let sequence = 0; let userId = scope.userId; let epoch = 1;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async getAllKeys() { return [...data.keys()]; }, async setItem(key, raw) { data.set(key, raw); } };
  const create = (projectId = "demo-siting-tests") => createLocalFireAlarmDraftStore({ storage, projectId,
    getSession: () => ({ userId, epoch }), generateId: () => `siting_${String(++sequence).padStart(16, "0")}` });
  const controller = (owner = scope, store = create()) => createFireAlarmTestingController(store.forSystem(owner), ids);
  return { data, storage, create, controller, switchUser(next) { userId = next; epoch++; } };
}
const active = (f) => [...f.data].filter(([key]) => key.includes("/fire-alarm-fixture-drafts/"));
const newest = (f) => active(f).sort((a, b) => JSON.parse(b[1]).revision - JSON.parse(a[1]).revision)[0];
const updateObservations = (update) => (draft) => ({ ...draft,
  detectorSitingObservations: update(draft.detectorSitingObservations ?? emptyDetectorSitingObservations()) });
const include = updateObservations((draft) => ({ ...draft, inScope: true }));
const press = (checkId, result) => updateObservations((draft) => selectSitingResult(draft, checkId, result));
const note = (checkId, notes) => updateObservations((draft) => ({ ...draft,
  answers: draft.answers.map((row) => row.checkId === checkId ? { ...row, notes, deviceOrLocation: "D01 / ceiling void above reception" } : row) }));

test("siting observations are optional, unanswered and separate from device operation and core checks", () => {
  const checks = emptySystemChecks(); const observations = emptyDetectorSitingObservations();
  validateSystemChecks(checks); validateDetectorSitingObservations(observations);
  assert.equal(checks.detectorSitingObservations, undefined);
  assert.equal(observations.inScope, false); assert.equal(observations.answers.length, 3);
  assert.ok(observations.answers.every((row) => row.result === null && row.guidanceRef === null && row.notes === ""));
  assert.deepEqual(detectorSitingProgress(observations), { total: 0, complete: 0, failed: 0, needsNotes: 0 });
  assert.deepEqual(selectSitingResult(observations, topicId, "fail"), observations);
  assert.deepEqual(systemChecksProgress({ ...checks, detectorSitingObservations: { ...observations, inScope: true } }), systemChecksProgress(checks));
});

test("every PASS/FAIL/N/A selection can be deselected to Not Tested without erasing notes or duplicating rows", () => {
  const base = { ...emptyDetectorSitingObservations(), inScope: true };
  for (const topic of DETECTOR_SITING_GUIDANCE) for (const current of [null, "pass", "fail", "na"]) for (const pressed of ["pass", "fail", "na"]) {
    let value = current ? selectSitingResult(base, topic.checkId, current) : clone(base);
    value.answers.find((row) => row.checkId === topic.checkId).notes = "Engineer-written finding";
    const next = selectSitingResult(value, topic.checkId, pressed); validateDetectorSitingObservations(next);
    const row = next.answers.find((row) => row.checkId === topic.checkId);
    assert.equal(row.result, current === pressed ? null : pressed);
    assert.equal(row.notes, "Engineer-written finding"); assert.equal(next.answers.length, 3);
    assert.equal(new Set(next.answers.map((row) => row.checkId)).size, 3);
    assert.equal(next.answers.filter((row) => row.result !== null).length, current === pressed ? 0 : 1);
    if (current === "fail" && pressed === "fail") assert.equal(observationGuidance(row), null);
  }
});

test("only a matching failed observation resolves its pinned guidance with the reviewed edition and clauses", () => {
  const clauses = ["21.1.4", "21.2.9", "21.1.5"];
  for (const [index, topic] of DETECTOR_SITING_GUIDANCE.entries()) {
    const value = selectSitingResult({ ...emptyDetectorSitingObservations(), inScope: true }, topic.checkId, "fail");
    value.answers.forEach((row) => {
      assert.equal(observationGuidance(row)?.checkId ?? null, row.checkId === topic.checkId ? topic.checkId : null);
    });
    const ref = value.answers[index].guidanceRef;
    assert.deepEqual(ref, { id: topic.reference.id, libraryVersion: 1, standard: "BS 5839-1", edition: "2025", clause: clauses[index] });
    assert.ok(topic.explanation && topic.action);
    for (const result of ["pass", "na"]) assert.equal(observationGuidance({ ...value.answers[index], result }), null);
  }
});

test("FAIL remains incomplete without the engineer's own non-blank notes, while incomplete drafts stay saveable", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include);
  c.changeSystem(press(topicId, "fail")); c.changeSystem(note(topicId, "  "));
  let progress = detectorSitingProgress(c.getState().systemChecks.detectorSitingObservations);
  assert.deepEqual(progress, { total: 3, complete: 0, failed: 1, needsNotes: 1 });
  assert.equal(await c.save(), true);
  c.changeSystem(note(topicId, "No detection seen in the accessible 900 mm void; design records to be checked."));
  progress = detectorSitingProgress(c.getState().systemChecks.detectorSitingObservations);
  assert.equal(progress.complete, 1); assert.equal(progress.needsNotes, 0);
  assert.equal(systemChecksProgress(c.getState().systemChecks).submissionEnabled, false);
  assert.ok(c.getState().answers.every((row) => row.result === null));
});

test("v1 and v2 drafts reopen unchanged; first observation edit archives originals and upgrades the same draft to v3", async () => {
  for (const priorVersion of [1, 2]) {
    const f = fixture(); const original = f.controller(); await original.open();
    original.selectDeviceResult(ids[0], "pass"); await original.save();
    if (priorVersion === 2) { original.changeSystem((draft) => ({ ...draft, additionalComments: "Historic system notes" })); await original.save(); }
    assert.equal(original.getState().draft.schemaVersion, priorVersion);
    const before = [...f.data]; const reader = f.controller(); await reader.open();
    assert.deepEqual([...f.data], before); assert.equal(reader.getState().systemChecks?.detectorSitingObservations, undefined);
    const draftId = reader.getState().draft.draftId; const originals = active(f); const write = f.storage.setItem;
    f.storage.setItem = async (key, raw) => {
      if (key.includes("/fire-alarm-fixture-drafts/") && JSON.parse(raw).schemaVersion === 3) {
        for (const [, originalRaw] of originals) assert.ok([...f.data].some(([path, value]) => path.includes("/fire-alarm-fixture-recovery/") && value === originalRaw));
      }
      await write(key, raw);
    };
    reader.changeSystem(include); reader.changeSystem(press(topicId, "fail")); reader.changeSystem(note(topicId, "Engineer finding"));
    assert.equal(await reader.save(), true); assert.equal(reader.getState().draft.schemaVersion, 3);
    const resumed = f.controller(); await Promise.all([resumed.open(), resumed.open()]);
    assert.equal(resumed.getState().draft.draftId, draftId);
    assert.equal(resumed.getState().answers[0].result, "pass");
    assert.deepEqual(resumed.getState().systemChecks.detectorSitingObservations, reader.getState().systemChecks.detectorSitingObservations);
    assert.equal(resumed.getState().systemChecks.additionalComments, priorVersion === 2 ? "Historic system notes" : "");
    const persisted = resumed.getState().draft;
    assert.equal(persisted.mode, "fixture-only"); assert.equal(Object.hasOwn(persisted, "sync"), false);
    assert.equal(Object.hasOwn(persisted, "defects"), false); assert.equal(Object.hasOwn(persisted, "certification"), false);
  }
});

test("deselection and scope changes retain notes and references across offline save and resume", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include);
  c.changeSystem(press(topicId, "fail")); c.changeSystem(note(topicId, "Retained finding"));
  const reference = clone(c.getState().systemChecks.detectorSitingObservations.answers[0].guidanceRef);
  c.changeSystem(press(topicId, "fail"));
  c.changeSystem(updateObservations((draft) => ({ ...draft, inScope: false }))); await c.save();
  const resumed = f.controller(); await resumed.open();
  const observations = resumed.getState().systemChecks.detectorSitingObservations;
  assert.equal(observations.inScope, false); assert.equal(observations.answers[0].result, null);
  assert.equal(observations.answers[0].notes, "Retained finding"); assert.deepEqual(observations.answers[0].guidanceRef, reference);
  assert.equal(observationGuidance(observations.answers[0]), null);
  resumed.changeSystem(include); resumed.changeSystem(press(topicId, "fail"));
  assert.equal(resumed.getState().systemChecks.detectorSitingObservations.answers[0].notes, "Retained finding");
});

test("a failed v2-to-v3 archive preserves original data and unsaved notes, then retries safely", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem((draft) => ({ ...draft, additionalComments: "Existing" })); await c.save();
  const before = active(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { if (key.includes("/fire-alarm-fixture-recovery/")) throw new Error("Disk full"); await write(key, raw); };
  c.changeSystem(include); c.changeSystem(press(topicId, "fail")); c.changeSystem(note(topicId, "Unsaved finding"));
  assert.equal(await c.save(), false); assert.deepEqual(active(f), before);
  assert.equal(await c.leave(() => assert.fail("Must preserve unsaved observation")), false);
  assert.equal(c.getState().systemChecks.detectorSitingObservations.answers[0].notes, "Unsaved finding");
  f.storage.setItem = write; assert.equal(await c.save(), true);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().systemChecks.detectorSitingObservations.answers[0].notes, "Unsaved finding");
});

test("older writers cannot strip v3 observations, including by passing a historical system check shape", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include); await c.save();
  const saved = c.getState().draft; const store = f.create().forSystem(scope); const before = active(f);
  await assert.rejects(store.save(saved.draftId, saved.revision, saved.answers), /SYSTEM_CHECKS_REQUIRED/);
  await assert.rejects(store.save(saved.draftId, saved.revision, saved.answers, emptySystemChecks()), /SITING_OBSERVATIONS_REQUIRED/);
  assert.deepEqual(active(f), before);
});

test("malformed, duplicated or mismatched guidance data fails closed without silently dropping historical notes", () => {
  const value = selectSitingResult({ ...emptyDetectorSitingObservations(), inScope: true }, topicId, "fail");
  for (const mutate of [
    (v) => { v.answers[0].guidanceRef = null; },
    (v) => { v.answers[0].guidanceRef.clause = "21.1.5"; },
    (v) => { v.answers[0].guidanceRef.libraryVersion = 99; },
    (v) => { v.answers[1].checkId = v.answers[0].checkId; },
    (v) => { v.answers.push(clone(v.answers[0])); },
    (v) => { v.answers[0].notes = "x".repeat(2001); },
    (v) => { v.answers[0].deviceOrLocation = "x".repeat(301); },
    (v) => { v.answers[0].interactionTimestamp = "not permitted"; },
  ]) { const malformed = clone(value); mutate(malformed); assert.throws(() => validateDetectorSitingObservations(malformed)); }
});

test("v3 recovery preserves saved observations and pending engineer notes", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include); c.changeSystem(press(topicId, "fail")); c.changeSystem(note(topicId, "Initial finding")); await c.save();
  c.changeSystem(note(topicId, "Latest saved finding")); await c.save();
  f.data.set(newest(f)[0], "damaged observation slot"); c.changeSystem(note(topicId, "Unsaved finding to recover"));
  assert.equal(await c.save(), false); assert.equal(c.getState().recovery, true); assert.equal(await c.recover(), true);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().systemChecks.detectorSitingObservations.answers[0].notes, "Unsaved finding to recover");
  assert.ok([...f.data.values()].includes("damaged observation slot"));
});

test("observation drafts stay isolated by project, user, company, site and system", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include); c.changeSystem(press(topicId, "fail")); c.changeSystem(note(topicId, "Private finding")); await c.save();
  for (const owner of [{ ...scope, companyId: "other" }, { ...scope, siteId: "other" }, { ...scope, systemId: "other" }]) {
    const other = f.controller(owner); await other.open(); assert.equal(other.getState().systemChecks, null);
  }
  const project = f.controller(scope, f.create("other-project")); await project.open(); assert.equal(project.getState().systemChecks, null);
  f.switchUser("other"); const user = f.controller({ ...scope, userId: "other" }); await user.open(); assert.equal(user.getState().systemChecks, null);
  c.changeSystem(include); assert.equal(c.getState().systemChecks, null); assert.equal(c.getState().closed, true);
});

test("rapid edits during an observation save drain the latest notes without adding duplicate observations", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(include); await c.save();
  const write = f.storage.setItem; let release, entered;
  const gate = new Promise((resolve) => { release = resolve; }); const ready = new Promise((resolve) => { entered = resolve; }); let first = true;
  f.storage.setItem = async (key, raw) => { if (first) { first = false; entered(); await gate; } await write(key, raw); };
  c.changeSystem(press(topicId, "fail")); const saving = c.save(); await ready;
  c.changeSystem(note(topicId, "Latest finding")); c.selectDeviceResult(ids[1], "na"); const concurrent = c.save(); release();
  assert.equal(await saving, true); assert.equal(await concurrent, true);
  const resumed = f.controller(); await resumed.open();
  assert.equal(resumed.getState().systemChecks.detectorSitingObservations.answers[0].notes, "Latest finding");
  assert.equal(resumed.getState().systemChecks.detectorSitingObservations.answers.length, 3); assert.equal(resumed.getState().answers[1].result, "na");
});
