import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createLocalInspectionDraftStore, DRAFT_STATES } from "../../engineer-app/src/services/localInspectionDraftStore.ts";

const seed = () => ({
  assetDocId: "asset-document", assetReference: "EXT001", assetLocation: "Test location",
  equipmentType: "SYNTHETIC_TEST_EQUIPMENT", serviceType: "TEST_ONLY", templateId: "synthetic-v1", templateVersion: 1,
  questions: [{ id: "synthetic-0", allowNA: false }, { id: "synthetic-1", allowNA: true }],
});
function backend() {
  const data = new Map();
  return {
    data,
    async getAllKeys() { return [...data.keys()]; },
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
  };
}
function fixture(storage = backend(), projectId = "demo-drafts") {
  let session = { userId: "user-a", epoch: 0 };
  let next = 0;
  const store = createLocalInspectionDraftStore({
    storage, projectId, getSession: () => session,
    generateId: () => `inspection_${String(++next).padStart(12, "0")}`, now: () => 1700000000000 + next,
  });
  return { storage, store, site: () => store.forSite("company", "site"),
    switchUser(userId) { session = { userId, epoch: session.epoch + 1 }; },
  };
}
const answers = (draft, notes = "Fixture notes") => draft.answers.map((answer, index) => ({
  ...answer, result: index ? "na" : "fail", notes,
}));
const errorCode = (code) => (error) => error.code === code;
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("save, reload and update retain exact answers, immutable metadata and pending sync", async () => {
  const f = fixture(); const site = f.site();
  const created = await site.startOrResume(seed());
  assert.equal(created.deviceState, "Saved on Device");
  assert.equal(created.syncState, "Pending Sync");
  assert.ok(created.draft.answers.every((answer) => answer.result === null && answer.notes === ""));
  const saved = await site.update(created.draft.inspectionId, 1, answers(created.draft, "Line one\nLine two"));
  assert.equal(saved.draft.localRevision, 2);
  assert.equal(saved.draft.inspectionId, created.draft.inspectionId);
  assert.deepEqual(await site.load(created.draft.inspectionId), saved);
  assert.equal(saved.draft.templateVersion, 1);
  assert.equal(saved.draft.assetReference, "EXT001");
  assert.deepEqual(saved.draft.sync, { state: "pending-sync", acknowledgedLocalRevision: null });
  assert.equal((await site.list()).length, 1);
  assert.equal(f.storage.data.size, 2);
});

test("simultaneous Start calls, repeated Resume and fresh store instances reuse one stable ID", async () => {
  const f = fixture();
  const [a, b, c] = await Promise.all([f.site().startOrResume(seed()), f.site().startOrResume(seed()), f.site().startOrResume(seed())]);
  assert.equal(a.draft.inspectionId, b.draft.inspectionId);
  assert.equal(a.draft.inspectionId, c.draft.inspectionId);
  const restarted = fixture(f.storage);
  assert.equal((await restarted.site().startOrResume(seed())).draft.inspectionId, a.draft.inspectionId);
  assert.equal(f.storage.data.size, 1);
});

test("separate store instances sharing storage serialize duplicate creation", async () => {
  const storage = backend(); const a = fixture(storage); const b = fixture(storage);
  const results = await Promise.all([a.site().startOrResume(seed()), b.site().startOrResume(seed())]);
  assert.equal(results[0].draft.inspectionId, results[1].draft.inspectionId);
  assert.equal(storage.data.size, 1);
});

test("changed asset or checklist metadata never replaces an existing unsynchronised draft", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  await site.update(first.draft.inspectionId, 1, answers(first.draft));
  const changed = await site.startOrResume({ ...seed(), templateId: "synthetic-v2", templateVersion: 2, assetReference: "Changed" });
  assert.equal(changed.contextChanged, true);
  assert.equal(changed.draft.templateVersion, 1);
  assert.equal(changed.draft.answers[0].notes, "Fixture notes");
  assert.equal(changed.draft.inspectionId, first.draft.inspectionId);
});

test("revision conflicts reject stale edits instead of silently replacing work", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  const results = await Promise.allSettled([
    site.update(first.draft.inspectionId, 1, answers(first.draft, "First")),
    site.update(first.draft.inspectionId, 1, answers(first.draft, "Second")),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].reason.code, "REVISION_CONFLICT");
  assert.equal((await site.load(first.draft.inspectionId)).draft.answers[0].notes, "First");
});

test("failed writes preserve last saved revision and return the attempted draft for retry", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Device storage full"); };
  let failure;
  await assert.rejects(site.update(first.draft.inspectionId, 1, answers(first.draft, "Unsaved work")), (error) => {
    failure = error; return error.code === "SAVE_FAILED" && error.deviceState === "Save Failed";
  });
  assert.equal(failure.attemptedDraft.answers[0].notes, "Unsaved work");
  assert.equal((await site.load(first.draft.inspectionId)).draft.localRevision, 1);
  f.storage.setItem = write;
  const retry = await site.update(first.draft.inspectionId, 1, failure.attemptedDraft.answers);
  assert.equal(retry.draft.answers[0].notes, "Unsaved work");
});

test("write succeeded but acknowledgement was lost: restart discovers the same saved draft", async () => {
  const f = fixture(); const write = f.storage.setItem;
  f.storage.setItem = async (key, value) => { await write(key, value); throw new Error("Acknowledgement lost"); };
  await assert.rejects(f.site().startOrResume(seed()), errorCode("SAVE_FAILED"));
  f.storage.setItem = write;
  const recovered = await fixture(f.storage).site().startOrResume(seed());
  assert.equal(recovered.draft.inspectionId, "inspection_000000000001");
  assert.equal(f.storage.data.size, 1);
  assert.equal(recovered.syncState, "Pending Sync");
});

test("readback failure never reports Saved on Device and does not duplicate the committed record", async () => {
  const f = fixture(); const get = f.storage.getItem;
  f.storage.getItem = async () => { throw new Error("Read failed"); };
  await assert.rejects(f.site().startOrResume(seed()), errorCode("SAVE_FAILED"));
  f.storage.getItem = get;
  const restored = await f.site().startOrResume(seed());
  assert.equal(restored.draft.localRevision, 1);
  assert.equal(f.storage.data.size, 1);
});

test("torn newest copy recovers the previous draft without deleting or replacing damaged work", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  const write = f.storage.setItem;
  f.storage.setItem = async (key) => { f.storage.data.set(key, '{"localSchemaVersion":'); throw new Error("Interrupted write"); };
  await assert.rejects(site.update(first.draft.inspectionId, 1, answers(first.draft)), errorCode("SAVE_FAILED"));
  f.storage.setItem = write;
  const snapshot = [...f.storage.data];
  const recovered = await fixture(f.storage).site().load(first.draft.inspectionId);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.canEdit, false);
  assert.equal(recovered.deviceState, "Save Failed");
  assert.equal(recovered.draft.localRevision, 1);
  await assert.rejects(site.update(first.draft.inspectionId, 1, answers(first.draft)), errorCode("RECOVERY_REQUIRED"));
  await assert.rejects(site.startOrResume(seed()), errorCode("RECOVERY_REQUIRED"));
  assert.deepEqual([...f.storage.data], snapshot);
});

test("unreadable first copy and future versions fail closed without clearing data", async () => {
  for (const raw of ["broken JSON", JSON.stringify({ localSchemaVersion: 2 })]) {
    const f = fixture(); const first = await f.site().startOrResume(seed());
    const key = [...f.storage.data.keys()][0]; f.storage.data.set(key, raw);
    await assert.rejects(f.site().load(first.draft.inspectionId), errorCode("RECOVERY_REQUIRED"));
    await assert.rejects(f.site().startOrResume(seed()), errorCode("RECOVERY_REQUIRED"));
    assert.equal(f.storage.data.get(key), raw);
  }
});

test("user switching partitions drafts, invalidates handles and preserves the original user's work", async () => {
  const f = fixture(); const a = f.site(); const first = await a.startOrResume(seed());
  await a.update(first.draft.inspectionId, 1, answers(first.draft));
  f.switchUser("user-b"); const b = f.site();
  await assert.rejects(async () => a.list(), errorCode("AUTH_SESSION_CHANGED"));
  assert.equal(await b.load(first.draft.inspectionId), null);
  assert.deepEqual(await b.list(), []);
  const other = await b.startOrResume(seed());
  assert.equal(other.draft.userId, "user-b");
  f.switchUser("user-a");
  await assert.rejects(async () => a.list(), errorCode("AUTH_SESSION_CHANGED"));
  const returned = await f.site().load(first.draft.inspectionId);
  assert.equal(returned.draft.answers[0].notes, "Fixture notes");
  assert.equal(returned.syncState, "Pending Sync");
  f.switchUser(null);
  assert.throws(() => f.site());
});

test("auth switch during a read rejects without returning previous user's draft", async () => {
  const f = fixture(); const a = f.site(); const first = await a.startOrResume(seed());
  const get = f.storage.getItem; const gate = deferred(); const started = deferred();
  f.storage.getItem = async (key) => { started.resolve(); await gate.promise; return get(key); };
  const pending = a.load(first.draft.inspectionId);
  await started.promise; f.switchUser("user-b"); gate.resolve();
  await assert.rejects(pending, (error) => error.code === "AUTH_SESSION_CHANGED" && error.attemptedDraft === undefined);
  f.storage.getItem = get;
  assert.deepEqual(await f.site().list(), []);
});

test("auth switch during a write retains data only in original namespace and hides error payload", async () => {
  const f = fixture(); const a = f.site(); const first = await a.startOrResume(seed());
  const set = f.storage.setItem; const gate = deferred(); const started = deferred();
  f.storage.setItem = async (key, value) => { started.resolve(); await gate.promise; await set(key, value); };
  const pending = a.update(first.draft.inspectionId, 1, answers(first.draft));
  await started.promise; f.switchUser("user-b"); gate.resolve();
  await assert.rejects(pending, (error) => error.code === "AUTH_SESSION_CHANGED" && error.attemptedDraft === undefined);
  assert.deepEqual(await f.site().list(), []);
  f.switchUser("user-a");
  assert.equal((await f.site().load(first.draft.inspectionId)).draft.answers[0].notes, "Fixture notes");
});

test("project/company/site namespaces cannot collide and delimiters are escaped", async () => {
  const storage = backend(); const a = fixture(storage, "project-one"); const b = fixture(storage, "project-two");
  const sites = [a.store.forSite("company", "site"), a.store.forSite("company:other", "site"),
    a.store.forSite("company", "site:other"), b.store.forSite("company", "site")];
  for (const site of sites) {
    assert.equal((await site.list()).length, 0);
    await site.startOrResume(seed());
  }
  for (const site of sites) assert.equal((await site.list()).length, 1);
  assert.ok([...storage.data.keys()].some((key) => key.includes("company%3Aother")));
});

test("ID collisions never overwrite unrelated assets", async () => {
  const storage = backend(); const first = fixture(storage); await first.site().startOrResume(seed());
  const restarted = fixture(storage);
  await assert.rejects(restarted.site().startOrResume({ ...seed(), assetDocId: "different-asset" }), errorCode("ID_COLLISION"));
  assert.equal((await first.site().list()).length, 1);
});

test("unknown fields, credentials, invalid results and oversized checklists are rejected", async () => {
  const f = fixture();
  for (const extra of [{ password: "do-not-cache" }, { firebaseToken: "do-not-cache" }, { contactName: "Unneeded" }]) {
    assert.throws(() => f.site().startOrResume({ ...seed(), ...extra }), errorCode("INVALID_DRAFT"));
  }
  assert.throws(() => f.site().startOrResume({ ...seed(), questions: Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, allowNA: true })) }));
  const first = await f.site().startOrResume(seed());
  const wrong = answers(first.draft); wrong[0].result = "synced";
  assert.throws(() => f.site().update(first.draft.inspectionId, 1, wrong), errorCode("INVALID_DRAFT"));
  const extra = answers(first.draft); extra[0].token = "do-not-cache";
  assert.throws(() => f.site().update(first.draft.inspectionId, 1, extra), errorCode("INVALID_DRAFT"));
  assert.equal([...f.storage.data.values()].join().includes("do-not-cache"), false);
});

test("failed enumeration/read and unconfirmed writes expose Save Failed without losing saved work", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  const enumerate = f.storage.getAllKeys;
  f.storage.getAllKeys = async () => { throw new Error("Enumeration failed"); };
  await assert.rejects(site.list(), (error) => error.code === "STORAGE_UNAVAILABLE" && error.deviceState === "Save Failed");
  f.storage.getAllKeys = enumerate;
  const get = f.storage.getItem;
  f.storage.getItem = async () => { throw new Error("Read failed"); };
  await assert.rejects(site.load(first.draft.inspectionId), errorCode("STORAGE_UNAVAILABLE"));
  f.storage.getItem = get;
  f.storage.setItem = async () => {}; // Simulate an adapter falsely resolving a write.
  await assert.rejects(site.update(first.draft.inspectionId, 1, answers(first.draft)), errorCode("SAVE_FAILED"));
  assert.equal((await site.load(first.draft.inspectionId)).draft.localRevision, 1);
});

test("pre-existing duplicate attempts are flagged instead of choosing or discarding either", async () => {
  const f = fixture(); await f.site().startOrResume(seed());
  const [key, raw] = [...f.storage.data][0]; const other = JSON.parse(raw);
  other.inspectionId = "inspection_duplicate_001";
  f.storage.data.set(key.replace("inspection_000000000001", other.inspectionId), JSON.stringify(other));
  await assert.rejects(f.site().startOrResume(seed()), errorCode("DUPLICATE_DRAFTS"));
  assert.equal(f.storage.data.size, 2);
  assert.equal((await f.site().list()).length, 2);
});

test("queued edits are cancelled when the authenticated session changes", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResume(seed());
  const set = f.storage.setItem; const started = deferred(); const gate = deferred();
  f.storage.setItem = async (key, raw) => { started.resolve(); await gate.promise; await set(key, raw); };
  const firstSave = site.update(first.draft.inspectionId, 1, answers(first.draft, "First queued edit"));
  const secondSave = site.update(first.draft.inspectionId, 2, answers(first.draft, "Must not run"));
  const results = Promise.allSettled([firstSave, secondSave]);
  await started.promise; f.switchUser("user-b"); gate.resolve();
  for (const result of await results) assert.equal(result.reason.code, "AUTH_SESSION_CHANGED");
  f.switchUser("user-a");
  assert.equal((await f.site().load(first.draft.inspectionId)).draft.answers[0].notes, "First queued edit");
});

test("partial notes and eight maximum-length draft answers remain durable without network access", async () => {
  const f = fixture(); const site = f.site();
  const first = await site.startOrResume({ ...seed(), questions: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, allowNA: true })) });
  const incomplete = first.draft.answers.map((answer) => ({ ...answer, result: "fail", notes: "" }));
  const partial = await site.update(first.draft.inspectionId, 1, incomplete);
  const full = await site.update(first.draft.inspectionId, 2, partial.draft.answers.map((answer) => ({ ...answer, notes: "x".repeat(2000) })));
  assert.equal((await fixture(f.storage).site().load(first.draft.inspectionId)).draft.answers[7].notes.length, 2000);
  assert.equal(full.syncState, "Pending Sync");
  assert.equal(f.storage.data.size, 2);
  assert.equal(DRAFT_STATES.synced, "Synced");
  assert.equal("markSynced" in site, false);
  const persisted = JSON.parse([...f.storage.data.values()].find((raw) => JSON.parse(raw).localRevision === 3));
  assert.equal(persisted.sync.acknowledgedLocalRevision, null);
});

test("returned objects and caller input cannot mutate persisted data", async () => {
  const f = fixture(); const site = f.site(); const input = seed();
  const pending = site.startOrResume(input); input.questions[0].id = "changed";
  const first = await pending;
  assert.equal(first.draft.questions[0].id, "synthetic-0");
  first.draft.answers[0].notes = "Mutated return value";
  assert.equal((await site.load(first.draft.inspectionId)).draft.answers[0].notes, "");
});

test("draft survives a real child-process exit and reloads in another process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "instafire-drafts-"));
  const file = join(directory, "storage.json");
  const moduleUrl = new URL("../../engineer-app/src/services/localInspectionDraftStore.ts", import.meta.url).href;
  const shared = `
    import { readFile, writeFile } from 'node:fs/promises';
    import { createLocalInspectionDraftStore } from ${JSON.stringify(moduleUrl)};
    const file = process.env.DRAFT_TEST_FILE;
    let data; try { data = JSON.parse(await readFile(file, 'utf8')); } catch { data = {}; }
    const storage = { async getAllKeys() { return Object.keys(data); }, async getItem(k) { return data[k] ?? null; },
      async setItem(k, v) { data[k] = v; await writeFile(file, JSON.stringify(data)); } };
    const site = createLocalInspectionDraftStore({ storage, projectId: 'demo-drafts',
      getSession: () => ({ userId: 'user-a', epoch: 0 }), generateId: () => 'inspection_process_001' }).forSite('company', 'site');
  `;
  function run(code) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", shared + code], {
      env: { ...process.env, DRAFT_TEST_FILE: file }, encoding: "utf8", windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  try {
    const created = run(`const first = await site.startOrResume(${JSON.stringify(seed())});
      const saved = await site.update(first.draft.inspectionId, 1, first.draft.answers.map(a => ({ ...a, notes: 'Survived process exit' })));
      console.log(JSON.stringify(saved));`);
    const restored = run("console.log(JSON.stringify(await site.startOrResume(" + JSON.stringify(seed()) + "))); ");
    assert.deepEqual(restored.draft, created.draft);
    assert.equal(restored.draft.answers[0].notes, "Survived process exit");
    assert.equal(Object.keys(JSON.parse(await readFile(file, "utf8"))).length, 2);
  } finally {
    // Only remove this test's exact, generated file and then its empty directory.
    await rm(file, { force: true });
    const { rmdir } = await import("node:fs/promises"); await rmdir(directory);
  }
});
