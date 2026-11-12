import assert from "node:assert/strict";
import test from "node:test";
import { emptySystemChecks, validateSystemChecks, SYSTEM_QUESTIONS, numericReading, systemChecksProgress, systemCmin, arcPassAllowed, toggleResult } from "../../engineer-app/src/modules/FireAlarms/systemChecks.ts";
import { calculateExistingCmin } from "../../engineer-app/src/utils/cminCalculation.ts";
import { createLocalFireAlarmDraftStore, fireAlarmProgress } from "../../engineer-app/src/services/localFireAlarmDraftStore.ts";
import { createFireAlarmTestingController } from "../../engineer-app/src/modules/FireAlarms/fireAlarmTestingController.ts";
const scope = { userId: "engineer", companyId: "company", siteId: "site", systemId: "system" };
function fixture() {
  const data = new Map(); let sequence = 0; let userId = "engineer"; let epoch = 1;
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async getAllKeys() { return [...data.keys()]; }, async setItem(key, raw) { data.set(key, raw); } };
  const create = (projectId = "demo-system-checks") => createLocalFireAlarmDraftStore({ storage, projectId, getSession: () => ({ userId, epoch }), generateId: () => `system_${String(++sequence).padStart(16, "0")}` });
  const store = create(); const controller = (s = scope, reader = store) => createFireAlarmTestingController(reader.forSystem(s), ["device-1", "device-2"]);
  return { data, storage, create, store, controller, switchUser(value) { userId = value; epoch++; } };
}
const active = (f) => [...f.data].filter(([key]) => key.includes("/fire-alarm-fixture-drafts/"));
const change = (id, result, fault = "") => (draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === id ? { ...row, result, fault } : row) });
// Same latest-row update used by the System Checks button handler.
const pressCheck = (id, result) => (draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === id ? { ...row, result: toggleResult(row.result, result) } : row) });

test("result presses select, deselect and switch every PASS/FAIL/N/A combination", () => {
  for (const current of [null, "pass", "fail", "na"]) for (const pressed of ["pass", "fail", "na"]) {
    assert.equal(toggleResult(current, pressed), current === pressed ? null : pressed);
  }
});

test("device deselection preserves fault notes but removes tested/failed counts across offline navigation and restart", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.selectDeviceResult("device-2", "pass");
  for (const result of ["pass", "fail", "na"]) {
    c.selectDeviceResult("device-1", result);
    if (result === "fail") c.change("device-1", { fault: "Retained device fault" });
    assert.equal(fireAlarmProgress(c.getState().answers).tested, 2);
    assert.equal(fireAlarmProgress(c.getState().answers).failed, result === "fail" ? 1 : 0);
    c.selectDeviceResult("device-1", result);
    assert.deepEqual(fireAlarmProgress(c.getState().answers), { total: 2, tested: 1, failed: 0, needsFault: 0 });
    assert.equal(await c.save(), true);
    const reader = f.controller(scope, f.create()); await reader.open();
    assert.equal(reader.getState().answers[0].result, null);
  }
  assert.equal(await c.leave(() => {}), true);
  const resumed = f.controller(scope, f.create()); await resumed.open();
  assert.equal(resumed.getState().answers[0].fault, "Retained device fault");
  resumed.selectDeviceResult("device-1", "pass"); resumed.selectDeviceResult("device-1", "na");
  assert.equal(resumed.getState().answers[0].result, "na");
  resumed.selectDeviceResult("device-1", "fail");
  assert.equal(resumed.getState().answers[0].fault, "Retained device fault");
});

test("system deselection retains hidden fault notes and saves Not Tested without active failures offline", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.changeSystem(pressCheck("vad-operation", "na"));
  for (const result of ["pass", "fail", "na"]) {
    c.changeSystem(pressCheck("sounder-operation", result));
    if (result === "fail") {
      assert.equal(systemChecksProgress(c.getState().systemChecks).complete, 1);
      c.changeSystem(change("sounder-operation", "fail", "Retained sounder fault"));
    }
    assert.equal(systemChecksProgress(c.getState().systemChecks).complete, 2);
    c.changeSystem(pressCheck("sounder-operation", result));
    const progress = systemChecksProgress(c.getState().systemChecks);
    assert.equal(progress.complete, 1); assert.equal(progress.failed, 0);
    assert.equal(await c.save(), true);
    const reader = f.controller(scope, f.create()); await reader.open();
    assert.equal(reader.getState().systemChecks.answers.find((row) => row.checkId === "sounder-operation").result, null);
  }
  assert.equal(await c.leave(() => {}), true);
  const resumed = f.controller(scope, f.create()); await resumed.open();
  assert.equal(resumed.getState().systemChecks.answers.find((row) => row.checkId === "sounder-operation").fault, "Retained sounder fault");
  resumed.changeSystem(pressCheck("sounder-operation", "pass")); resumed.changeSystem(pressCheck("sounder-operation", "na"));
  assert.equal(systemChecksProgress(resumed.getState().systemChecks).failed, 0);
  resumed.changeSystem(pressCheck("sounder-operation", "fail"));
  assert.equal(systemChecksProgress(resumed.getState().systemChecks).failed, 1);
});

test("ARC PASS can be cleared after confirmations are removed without bypassing PASS eligibility", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.changeSystem((d) => ({ ...d, arcConnected: "yes", transmissionConfirmed: true, receiptConfirmed: true }));
  c.changeSystem(pressCheck("arc-signalling-receipt", "pass"));
  c.changeSystem((d) => ({ ...d, receiptConfirmed: false }));
  c.changeSystem(pressCheck("arc-signalling-receipt", "pass"));
  assert.equal(c.getState().systemChecks.answers.find((row) => row.checkId === "arc-signalling-receipt").result, null);
  c.changeSystem(pressCheck("arc-signalling-receipt", "pass"));
  assert.equal(c.getState().systemChecks.answers.find((row) => row.checkId === "arc-signalling-receipt").result, null);
  assert.equal(await c.save(), true);
});

test("all twelve agreed candidate checks start unanswered, numeric/conditional fields have no defaults", () => {
  const value = emptySystemChecks(); validateSystemChecks(value);
  assert.equal(SYSTEM_QUESTIONS.length, 12); assert.equal(value.template.status, "pending-technical-validation");
  assert.ok(value.answers.every((row) => row.result === null && row.fault === ""));
  assert.ok(Object.values(value.measurements).every((text) => text === "")); assert.equal(value.buildingChanges, null); assert.equal(value.arcConnected, null);
  assert.equal(value.additionalComments, ""); assert.equal(systemChecksProgress(value).complete, 0); assert.equal(systemChecksProgress(value).submissionEnabled, false);
  for (const id of ["visible-cables-connections", "circuit-wiring-monitoring", "panel-equipment-condition", "fuse-ratings", "mains-isolation-protection", "arc-signalling-receipt", "sounder-operation", "vad-operation", "zone-plans-records", "cause-effect-interfaces", "faults-disablements", "equipment-cleanliness"]) assert.ok(value.answers.some((row) => row.checkId === id));
});
test("PASS and N/A complete without notes; FAIL needs a short non-whitespace explanation and never blocks other answers", () => {
  let value = emptySystemChecks(); value = change("sounder-operation", "pass")(value); value = change("vad-operation", "na")(value);
  value = change("visible-cables-connections", "fail")(value); validateSystemChecks(value);
  assert.equal(systemChecksProgress(value).complete, 2); assert.equal(systemChecksProgress(value).failed, 1);
  value = change("visible-cables-connections", "fail", " ")(value); assert.equal(systemChecksProgress(value).complete, 2);
  value = change("visible-cables-connections", "fail", "Damaged visible cable")(value); assert.equal(systemChecksProgress(value).complete, 3);
});
test("ARC PASS is rejected until a fitted connection, transmission test and actual receipt are explicitly confirmed", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.changeSystem(change("arc-signalling-receipt", "pass")); assert.equal(c.getState().systemChecks, null);
  c.changeSystem((d) => ({ ...d, arcConnected: "yes" })); c.changeSystem(change("arc-signalling-receipt", "pass"));
  assert.equal(c.getState().systemChecks.answers.find((r) => r.checkId === "arc-signalling-receipt").result, null);
  c.changeSystem((d) => ({ ...d, transmissionConfirmed: true })); c.changeSystem(change("arc-signalling-receipt", "pass"));
  assert.equal(arcPassAllowed(c.getState().systemChecks), false);
  c.changeSystem((d) => ({ ...d, receiptConfirmed: true })); c.changeSystem(change("arc-signalling-receipt", "pass")); assert.equal(await c.save(), true);
  assert.equal(systemChecksProgress(c.getState().systemChecks).complete, 1);
  c.changeSystem((d) => ({ ...d, receiptConfirmed: false })); assert.equal(systemChecksProgress(c.getState().systemChecks).complete, 0);
  c.changeSystem((d) => ({ ...d, arcConnected: "no" })); c.changeSystem(change("arc-signalling-receipt", "na")); assert.equal(await c.save(), true);
  assert.equal(systemChecksProgress(c.getState().systemChecks).complete, 1);
});
test("building changes YES requires details while NO hides the requirement and preserves earlier details; comments remain optional", () => {
  let value = emptySystemChecks(); assert.equal(systemChecksProgress(value).buildingDetailsRequired, false);
  value.buildingChanges = "yes"; assert.equal(systemChecksProgress(value).buildingDetailsRequired, true);
  value.buildingDetails = "New partition affects coverage"; assert.equal(systemChecksProgress(value).buildingDetailsRequired, false);
  value.buildingChanges = "no"; assert.equal(value.buildingDetails, "New partition affects coverage"); validateSystemChecks(value);
  assert.equal(value.additionalComments, "");
});
test("numeric readings validate explicit decimal values/units, reject negatives/exponents/non-finite and allow partial draft storage", () => {
  assert.equal(numericReading("0"), 0); assert.equal(numericReading("0", true), null); assert.equal(numericReading("12,5"), 12.5); assert.equal(numericReading(".5"), 0.5);
  for (const text of ["", "-1", "NaN", "Infinity", "1e3", "0x10", "1,2,3", "twelve", "12 V"]) assert.equal(numericReading(text), null);
  const value = emptySystemChecks(); value.measurements.standbyMA = "-1"; value.measurements.batteryAh = "0"; validateSystemChecks(value);
  assert.deepEqual(systemChecksProgress(value).numericErrors, ["standbyMA", "batteryAh"]); assert.equal(systemCmin(value), null);
});
test("shared Cmin preserves the existing mA conversion, fixed derating and duration arithmetic", () => {
  assert.equal(calculateExistingCmin(500, 1000, 24, 30).cmin, 16.09375);
  assert.ok(Math.abs(calculateExistingCmin(100, 500, 24, 30).cmin - 3.546875) < 1e-12);
  for (const values of [[0, 500, 24, 30], [-1, 500, 24, 30], [100, Infinity, 24, 30], [100, 500, 0, 30], [1e308, 1e308, 1e308, 30]]) assert.equal(calculateExistingCmin(...values), null);
  const value = emptySystemChecks(); value.measurements = { standbyMA: "500", alarmMA: "1000", standbyHours: "24", alarmMinutes: "30", batteryVoltage: "24,5", batteryAh: "17" };
  assert.equal(systemCmin(value).cmin, 16.09375); value.measurements.batteryAh = "100"; value.measurements.batteryVoltage = "0"; assert.equal(systemCmin(value).cmin, 16.09375);
});
test("v1 resume makes no writes; first system edit archives both original copies before compatible v2 upgrade", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.change("device-1", { result: "fail", fault: "Existing device fault" }); await c.save();
  const before = [...f.data]; const originals = active(f); const id = c.getState().draft.draftId;
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().systemChecks, null); assert.deepEqual([...f.data], before);
  const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => {
    if (key.includes("/fire-alarm-fixture-drafts/") && JSON.parse(raw).schemaVersion === 2) for (const [, original] of originals) assert.ok([...f.data].some(([path, value]) => path.includes("/fire-alarm-fixture-recovery/") && value === original));
    await write(key, raw);
  };
  resumed.changeSystem(change("sounder-operation", "pass")); assert.equal(await resumed.save(), true);
  assert.equal(resumed.getState().draft.draftId, id); assert.equal(resumed.getState().draft.schemaVersion, 2);
  assert.equal(resumed.getState().answers[0].fault, "Existing device fault");
});
test("device and system fields save/resume together after new store restart without changing IDs or filter-owned device results", async () => {
  const f = fixture(); const c = f.controller(); await c.open();
  c.change("device-2", { result: "na" }); c.changeSystem((d) => ({ ...change("sounder-operation", "fail", "Sounders not operating")(d), additionalComments: "Return visit", buildingChanges: "yes", buildingDetails: "New partition", measurements: { ...d.measurements, standbyMA: "150", alarmMA: "900", batteryAh: "7", batteryVoltage: "25.1" } }));
  assert.equal(await c.leave(() => {}), true);
  const resumed = f.controller(scope, f.create()); await resumed.open();
  assert.equal(resumed.getState().answers[1].result, "na"); assert.equal(resumed.getState().systemChecks.additionalComments, "Return visit");
  assert.equal(resumed.getState().systemChecks.measurements.standbyMA, "150"); assert.equal(resumed.getState().systemChecks.buildingDetails, "New partition");
  resumed.change("device-1", { result: "pass" }); await resumed.save(); const again = f.controller(); await again.open();
  assert.equal(again.getState().systemChecks.answers.find((r) => r.checkId === "sounder-operation").fault, "Sounders not operating");
});
test("migration/archive failure retains original v1 and unsaved system changes, blocks leave and retries without data loss", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const before = active(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { if (key.includes("/fire-alarm-fixture-recovery/")) throw new Error("Disk full"); await write(key, raw); };
  c.changeSystem((d) => ({ ...d, additionalComments: "Keep pending comments" })); assert.equal(await c.save(), false); assert.deepEqual(active(f), before);
  assert.equal(await c.leave(() => assert.fail("Must retain edits")), false); assert.equal(c.getState().systemChecks.additionalComments, "Keep pending comments");
  f.storage.setItem = write; assert.equal(await c.save(), true);
});
test("v2 corrupt-copy recovery retains both sections, original damage and unsaved system fields", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(change("sounder-operation", "pass")); await c.save();
  c.change("device-1", { result: "pass" }); await c.save(); c.changeSystem((d) => ({ ...d, additionalComments: "Latest" })); await c.save();
  const newest = active(f).sort((a, b) => JSON.parse(b[1]).revision - JSON.parse(a[1]).revision)[0]; f.data.set(newest[0], "broken-system-copy");
  c.changeSystem((d) => ({ ...d, buildingChanges: "yes", buildingDetails: "Unsaved alterations" })); assert.equal(await c.save(), false); assert.equal(c.getState().recovery, true);
  assert.equal(await c.recover(), true); const resumed = f.controller(); await resumed.open();
  assert.equal(resumed.getState().answers[0].result, "pass"); assert.equal(resumed.getState().systemChecks.buildingDetails, "Unsaved alterations");
  assert.ok([...f.data.values()].includes("broken-system-copy"));
});
test("in-flight saves drain rapid edits from both sections into the same final draft", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(change("sounder-operation", "pass")); await c.save();
  const write = f.storage.setItem; let release, started; const gate = new Promise((r) => { release = r; }); const ready = new Promise((r) => { started = r; }); let first = true;
  f.storage.setItem = async (key, raw) => { if (first) { first = false; started(); await gate; } await write(key, raw); };
  c.change("device-1", { result: "pass" }); const saving = c.save(); await ready;
  c.changeSystem((d) => ({ ...d, additionalComments: "Typed while saving" })); c.change("device-2", { result: "fail", fault: "New device fault" }); release(); assert.equal(await saving, true);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().systemChecks.additionalComments, "Typed while saving"); assert.equal(resumed.getState().answers[1].fault, "New device fault");
});
test("system checks remain private across user/company/site/system/project switches", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem((d) => ({ ...d, additionalComments: "Private" })); await c.save();
  for (const other of [{ ...scope, companyId: "other" }, { ...scope, siteId: "other" }, { ...scope, systemId: "other" }]) { const next = f.controller(other); await next.open(); assert.equal(next.getState().systemChecks, null); }
  const project = f.controller(scope, f.create("other-project")); await project.open(); assert.equal(project.getState().systemChecks, null);
  f.switchUser("other"); assert.equal(await c.save(), false); assert.equal(c.getState().systemChecks, null);
  const other = f.controller({ ...scope, userId: "other" }); await other.open(); assert.equal(other.getState().systemChecks, null);
  f.switchUser("engineer"); const restored = f.controller(); await restored.open(); assert.equal(restored.getState().systemChecks.additionalComments, "Private");
});
test("old writers cannot strip system data and edited/future template snapshots fail validation", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); c.changeSystem(change("sounder-operation", "pass")); await c.save(); const draft = c.getState().draft; const before = [...f.data];
  await assert.rejects(f.store.forSystem(scope).save(draft.draftId, draft.revision, draft.answers), (e) => e.code === "SYSTEM_CHECKS_REQUIRED"); assert.deepEqual([...f.data], before);
  const invalid = emptySystemChecks(); invalid.template.version = 2; assert.throws(() => validateSystemChecks(invalid));
  const extra = emptySystemChecks(); extra.template.questions.push({ id: "invented", prompt: "Extra" }); assert.throws(() => validateSystemChecks(extra));
});

test("unanswered building assessment and missing YES details never count as completed checks", () => {
  const value = emptySystemChecks(); assert.equal(systemChecksProgress(value).total, 13);
  value.buildingChanges = "yes"; assert.equal(systemChecksProgress(value).complete, 0);
  value.buildingDetails = "Partition altered"; assert.equal(systemChecksProgress(value).complete, 1);
  value.buildingChanges = "no"; value.buildingDetails = ""; assert.equal(systemChecksProgress(value).complete, 1);
});
test("lost schema-upgrade acknowledgement reconciles the same inspection and preserves both sections", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const id = c.getState().draft.draftId;
  const read = f.storage.getItem; let lose = true;
  f.storage.getItem = async (key) => { const raw = await read(key); if (lose && key.includes("/fire-alarm-fixture-drafts/") && raw?.includes('"schemaVersion":2')) { lose = false; throw new Error("Lost acknowledgement"); } return raw; };
  c.change("device-1", { result: "pass" }); c.changeSystem((d) => ({ ...d, additionalComments: "Keep upgrade text" })); assert.equal(await c.save(), true);
  assert.equal(c.getState().draft.draftId, id); assert.equal(c.getState().draft.revision, 2);
  const resumed = f.controller(); await resumed.open(); assert.equal(resumed.getState().answers[0].result, "pass"); assert.equal(resumed.getState().systemChecks.additionalComments, "Keep upgrade text");
});
test("account switch during upgrade archival stops the write and exposes no old system answers", async () => {
  const f = fixture(); const c = f.controller(); await c.open(); const originals = active(f); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { await write(key, raw); if (key.includes("/fire-alarm-fixture-recovery/")) f.switchUser("other"); };
  c.changeSystem((d) => ({ ...d, additionalComments: "Private pending text" })); assert.equal(await c.save(), false);
  assert.equal(c.getState().systemChecks, null); assert.deepEqual(c.getState().answers, []); assert.deepEqual(active(f), originals);
  f.storage.setItem = write; const other = f.controller({ ...scope, userId: "other" }); await other.open(); assert.equal(other.getState().systemChecks, null);
});
