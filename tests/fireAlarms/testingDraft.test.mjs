import assert from "node:assert/strict";
import test from "node:test";
import { createLocalFireAlarmDraftStore, fireAlarmProgress } from "../../engineer-app/src/services/localFireAlarmDraftStore.ts";
import { createFireAlarmTestingController } from "../../engineer-app/src/modules/FireAlarms/fireAlarmTestingController.ts";
import { createFireAlarmFixtureRepository } from "../../engineer-app/src/modules/FireAlarms/fireAlarmRegister.ts";

const scope = { userId: "engineer", companyId: "company", siteId: "example-site-1", systemId: "example-panel-1" };
const ids = ["example-device-1", "example-device-2", "example-device-3", "example-device-4"];
function fixture() {
  const data = new Map(); let sequence = 0; let userId = "engineer"; let epoch = 1;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async getAllKeys() { return [...data.keys()]; }, async setItem(key, raw) { data.set(key, raw); } };
  const create = (projectId = "demo-fire-alarm-drafts") => createLocalFireAlarmDraftStore({ storage, projectId, getSession: () => ({ userId, epoch }), generateId: () => `alarm_${String(++sequence).padStart(16, "0")}` });
  const store = create();
  return { data, storage, create, store, system: (s = scope) => store.forSystem(s),
    controller: (deviceIds = ids, s = scope) => createFireAlarmTestingController(store.forSystem(s), deviceIds),
    switchUser(next) { userId = next; epoch++; } };
}
const active = (f) => [...f.data].filter(([key]) => key.includes("/fire-alarm-fixture-drafts/"));
const newest = (f) => active(f).sort((a, b) => JSON.parse(b[1]).revision - JSON.parse(a[1]).revision)[0];

test("device results initially unanswered; PASS/N/A need no note, only FAIL requires a description for tested count", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  assert.ok(c.getState().answers.every(({ result, fault }) => result === null && fault === ""));
  assert.deepEqual(fireAlarmProgress(c.getState().answers), { total: 4, tested: 0, failed: 0, needsFault: 0 });
  c.change(ids[0], { result: "pass" }); c.change(ids[1], { result: "na" }); c.change(ids[2], { result: "fail" });
  assert.equal(await c.save(), true); assert.deepEqual(fireAlarmProgress(c.getState().answers), { total: 4, tested: 2, failed: 1, needsFault: 1 });
  c.change(ids[2], { fault: " " }); assert.equal(fireAlarmProgress(c.getState().answers).tested, 2);
  c.change(ids[2], { fault: "Sounder did not operate" }); assert.equal(await c.save(), true);
  assert.equal(fireAlarmProgress(c.getState().answers).tested, 3);
  assert.equal(c.getState().answers[0].fault, ""); assert.equal(c.getState().answers[1].fault, "");
});
test("changing a result preserves other devices and previous fault text without requiring it for PASS/N/A", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.change(ids[0], { result: "fail", fault: "Old fault" }); c.change(ids[1], { result: "pass" }); await c.save();
  c.change(ids[0], { result: "na" }); await c.save(); assert.equal(c.getState().answers[0].fault, "Old fault");
  assert.equal(c.getState().answers[1].result, "pass"); assert.equal(fireAlarmProgress(c.getState().answers).needsFault, 0);
  c.change(ids[0], { result: "pass" }); await c.save(); c.change(ids[0], { result: "fail" }); await c.save();
  assert.equal(c.getState().answers[0].fault, "Old fault"); assert.equal(c.getState().answers[1].result, "pass");
});
test("loop/zone changes never trim saved results and overall progress includes hidden devices", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  const repoScope = { userId: scope.userId, companyId: scope.companyId }; const repo = createFireAlarmFixtureRepository(repoScope);
  c.change(ids[0], { result: "pass" }); c.change(ids[2], { result: "fail", fault: "Fault" }); await c.save();
  const filtered = repo.listDevices(repoScope, scope.siteId, scope.systemId, { loopId: "loop-2", zoneId: "zone-g" });
  assert.deepEqual(filtered.map(({ id }) => id), [ids[1]]); c.change(filtered[0].id, { result: "na" }); await c.save();
  assert.deepEqual(c.getState().answers.map(({ result }) => result), ["pass", "na", "fail", null]);
  assert.deepEqual(fireAlarmProgress(c.getState().answers), { total: 4, tested: 3, failed: 1, needsFault: 0 });
  assert.equal(repo.listDevices(repoScope, scope.siteId, scope.systemId, { loopId: null, zoneId: null }).length, 4);
});
test("navigation and new store/controller after process restart resume the same stable draft and all results offline", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const id = c.getState().draft.draftId;
  c.change(ids[3], { result: "na" }); c.change(ids[0], { result: "fail", fault: "Example fault" });
  assert.equal(await c.leave(() => {}), true);
  const before = [...f.data]; const restarted = createFireAlarmTestingController(f.create().forSystem(scope), ids); await restarted.open();
  assert.equal(restarted.getState().draft.draftId, id); assert.equal(restarted.getState().answers[3].result, "na");
  assert.equal(restarted.getState().answers[0].fault, "Example fault"); assert.deepEqual([...f.data], before);
});
test("repeated opens do not create duplicates; reordered device IDs resume by identity, changed IDs fail closed", async () => {
  const f = fixture(); const controllers = [f.controller(), f.controller()]; await Promise.all(controllers.map((c) => c.open()));
  assert.equal(controllers[0].getState().draft.draftId, controllers[1].getState().draft.draftId); assert.equal(active(f).length, 1);
  controllers[0].change(ids[3], { result: "pass" }); await controllers[0].save(); const before = [...f.data];
  const reordered = f.controller([...ids].reverse()); await reordered.open(); assert.equal(reordered.getState().answers.find((a) => a.deviceId === ids[3]).result, "pass");
  const changed = f.controller(ids.slice(0, 3)); await changed.open(); assert.equal(changed.getState().error, "DEVICE_REGISTER_CHANGED"); assert.deepEqual([...f.data], before);
});
test("failed writes preserve edits and disk copies, block navigation, and safely retry", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const before = [...f.data]; const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Full"); }; c.change(ids[0], { result: "pass" });
  assert.equal(await c.save(), false); assert.deepEqual([...f.data], before); assert.equal(c.getState().answers[0].result, "pass");
  assert.equal(await c.leave(() => assert.fail("Must not leave with failed unsaved work")), false);
  f.storage.setItem = write; assert.equal(await c.save(), true); assert.equal(c.getState().error, null);
  let left = 0; await Promise.all([c.leave(() => left++), c.leave(() => left++)]); assert.equal(left, 1);
});
test("lost local write acknowledgement reconciles the persisted revision without duplicating or discarding results", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const read = f.storage.getItem; let lose = true;
  f.storage.getItem = async (key) => { const raw = await read(key); if (lose && raw?.includes('"result":"pass"')) { lose = false; throw new Error("Lost acknowledgement"); } return raw; };
  c.change(ids[0], { result: "pass" }); assert.equal(await c.save(), true); assert.equal(c.getState().draft.revision, 2);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().answers[0].result, "pass");
});
test("rapid edits during an in-flight write drain into the latest full-system state", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const write = f.storage.setItem;
  let release, entered; const gate = new Promise((resolve) => { release = resolve; }); const ready = new Promise((resolve) => { entered = resolve; }); let first = true;
  f.storage.setItem = async (key, raw) => { if (first) { first = false; entered(); await gate; } await write(key, raw); };
  c.change(ids[0], { result: "pass" }); const saving = c.save(); await ready;
  c.change(ids[1], { result: "fail" }); c.change(ids[1], { fault: "Latest text" }); c.change(ids[2], { result: "na" });
  const concurrent = c.save(); release(); assert.equal(await saving, true); assert.equal(await concurrent, true);
  const restarted = f.controller(); await restarted.open(); assert.deepEqual(restarted.getState().answers.map(({ result }) => result), ["pass", "fail", "na", null]); assert.equal(restarted.getState().answers[1].fault, "Latest text");
});
test("damaged newest slot requires explicit recovery, archives every raw copy before writing and preserves results", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.change(ids[0], { result: "pass" }); await c.save(); c.change(ids[1], { result: "na" }); await c.save();
  f.data.set(newest(f)[0], "damaged-newest"); const originals = active(f); const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().recovery, true);
  resumed.change(ids[1], { result: "fail" }); assert.equal(resumed.getState().answers[1].result, null); assert.equal(await resumed.save(), false);
  const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { if (key.includes("/fire-alarm-fixture-drafts/")) for (const [, old] of originals) assert.ok([...f.data].some(([path, value]) => path.includes("/fire-alarm-fixture-recovery/") && value === old)); await write(key, raw); };
  assert.equal(await resumed.recover(), true); assert.equal(resumed.getState().answers[0].result, "pass");
  assert.ok([...f.data.values()].includes("damaged-newest")); const restart = f.controller(); await restart.open(); assert.equal(restart.getState().answers[0].result, "pass");
});
test("archive failure retains originals and pending editor results survive recovery after a failed save", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.change(ids[0], { result: "pass" }); await c.save();
  f.data.set(newest(f)[0], "damaged"); c.change(ids[1], { result: "fail", fault: "Unsynchronised editor text" });
  assert.equal(await c.save(), false); assert.equal(c.getState().recovery, true);
  const before = active(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { if (key.includes("/fire-alarm-fixture-recovery/")) throw new Error("Full"); await write(key, raw); };
  assert.equal(await c.recover(), false); assert.deepEqual(active(f), before); assert.equal(c.getState().answers[1].fault, "Unsynchronised editor text");
  f.storage.setItem = write; assert.equal(await c.recover(), true);
  const restarted = f.controller(); await restarted.open(); assert.equal(restarted.getState().answers[0].result, "pass"); assert.equal(restarted.getState().answers[1].fault, "Unsynchronised editor text");
});
test("both corrupt slots and future versions fail closed without generating replacement drafts", async () => {
  for (const future of [false, true]) {
    const f = fixture(); const c = f.controller(); await c.open(); c.change(ids[0], { result: "pass" }); await c.save();
    for (const [key, raw] of active(f)) f.data.set(key, future ? JSON.stringify({ ...JSON.parse(raw), schemaVersion: 4 }) : "broken");
    const before = [...f.data]; const restart = f.controller(); await restart.open(); assert.equal(restart.getState().draft, null);
    assert.equal(restart.getState().error, future ? "NEWER_DRAFT_VERSION" : "RECOVERY_REQUIRED"); assert.deepEqual([...f.data], before);
    let left = false; assert.equal(await restart.leave(() => { left = true; }), true); assert.equal(left, true);
  }
});
test("user switching during I/O clears editor state and never exposes or overwrites another user's results", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { await write(key, raw); f.switchUser("other"); };
  c.change(ids[0], { result: "pass" }); assert.equal(await c.save(), false); assert.equal(c.getState().draft, null); assert.deepEqual(c.getState().answers, []);
  f.storage.setItem = write; const other = f.controller(ids, { ...scope, userId: "other" }); await other.open(); assert.ok(other.getState().answers.every(({ result }) => result === null));
  f.switchUser("engineer"); const original = f.controller(); await original.open(); assert.equal(original.getState().answers[0].result, "pass");
  c.change(ids[1], { result: "fail" }); assert.deepEqual(c.getState().answers, []);
});
test("fixture drafts use separate project/user/company/site/system namespaces and never touch extinguisher records", async () => {
  const f = fixture(); f.data.set("@instafire/inspection-drafts/v1/keep", "existing extinguisher data");
  const original = f.controller(); await original.open(); original.change(ids[0], { result: "pass" }); await original.save();
  for (const different of [{ ...scope, companyId: "other" }, { ...scope, siteId: "other" }, { ...scope, systemId: "other" }]) {
    const c = f.controller(ids, different); await c.open(); assert.ok(c.getState().answers.every(({ result }) => result === null));
  }
  const project = createFireAlarmTestingController(f.create("another-project").forSystem(scope), ids); await project.open(); assert.ok(project.getState().answers.every(({ result }) => result === null));
  assert.equal(f.data.get("@instafire/inspection-drafts/v1/keep"), "existing extinguisher data");
  for (const [, raw] of active(f)) {
    const draft = JSON.parse(raw); assert.equal(draft.mode, "fixture-only"); assert.equal(draft.dataset, "fire-alarm-fixtures-v1");
    assert.equal(Object.hasOwn(draft, "sync"), false); assert.equal(Object.hasOwn(draft, "auditHistory"), false);
    assert.ok(draft.answers.every((answer) => Object.keys(answer).sort().join(",") === "deviceId,fault,result"));
  }
});
test("stale revisions do not overwrite newer saved results; unsaved edits stay available for reconciliation", async () => {
  const f = fixture(); const a = f.controller(); const b = f.controller(); await a.open(); await b.open();
  a.change(ids[0], { result: "pass" }); await a.save();
  b.change(ids[1], { result: "fail", fault: "Keep this text" }); assert.equal(await b.save(), false); assert.equal(b.getState().error, "REVISION_CONFLICT");
  assert.equal(b.getState().answers[1].fault, "Keep this text"); const restarted = f.controller(); await restarted.open(); assert.equal(restarted.getState().answers[0].result, "pass");
});
