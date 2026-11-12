import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalInspectionDraftStore } from "../../engineer-app/src/services/localInspectionDraftStore.ts";
import { createInspectionNotesController } from "../../engineer-app/src/modules/Extinguishers/inspectionNotesController.ts";
import { approvedInspectionAsset, canStartInspection } from "../../engineer-app/src/modules/Extinguishers/approvedInspectionAsset.ts";

const seed = () => ({ assetDocId: "approved-doc-id", assetReference: "EXT001", assetLocation: "Lobby", equipmentType: "Water", assetCapacity: "6 L" });
function fixture() {
  const data = new Map(); let id = 0; let epoch = 0; let userId = "engineer-a";
  const storage = { async getAllKeys() { return [...data.keys()]; }, async getItem(key) { return data.get(key) ?? null; }, async setItem(key, raw) { data.set(key, raw); } };
  const store = createLocalInspectionDraftStore({ storage, projectId: "demo-notes", getSession: () => ({ userId, epoch }), generateId: () => `notes_${String(++id).padStart(16, "0")}` });
  const site = () => store.forSite("company", "site");
  return { data, storage, store, site, editor: () => createInspectionNotesController(site(), seed()),
    switchUser(next) { userId = next; epoch++; } };
}
function gate() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

test("approved path and real document ID are required; proposals, wrong sites and pending records are rejected", () => {
  const snapshot = { id: "actual-id", path: "companies/company/sites/site/extinguishers/actual-id", exists: true,
    data: { id: "spoofed", assetId: "EXT0001", type: "Water", capacity: 6, capacityUnit: "L", location: "Lobby" } };
  assert.deepEqual(approvedInspectionAsset("company", "site", snapshot), { ...seed(), assetDocId: "actual-id", assetReference: "EXT0001" });
  for (const invalid of [
    { ...snapshot, exists: false }, { ...snapshot, path: snapshot.path.replace("extinguishers", "extinguisherProposals") },
    { ...snapshot, path: snapshot.path.replace("company/sites", "other/sites") },
    { ...snapshot, data: { ...snapshot.data, status: "pending" } },
  ]) assert.throws(() => approvedInspectionAsset("company", "site", invalid), /APPROVED_ASSET_REQUIRED/);
  const missing = approvedInspectionAsset("company", "site", { ...snapshot, data: {} });
  assert.equal(missing.assetReference, "actual-id"); assert.equal(missing.assetCapacity, "");
});

test("notes entry follows existing engineer scope and proposed senior site assignments", () => {
  assert.equal(canStartInspection("engineer", [], "site"), true);
  assert.equal(canStartInspection("senior_engineer", ["site"], "site"), true);
  for (const role of ["owner", "office_admin", "unknown", ""]) assert.equal(canStartInspection(role, ["site"], "site"), false);
  assert.equal(canStartInspection("senior_engineer", [], "site"), false);
});

test("repeated Start/open calls select one stable notes draft without a synthetic checklist", async () => {
  const f = fixture(); const editor = f.editor(); const other = f.editor();
  await Promise.all([editor.open(), editor.open(), other.open()]);
  const draft = editor.getState().draft;
  assert.equal(draft.inspectionId, other.getState().draft.inspectionId);
  assert.equal(draft.localSchemaVersion, 2);
  assert.equal(draft.engineerNotes, "");
  for (const field of ["questions", "templateId", "templateVersion", "answers", "status", "submittedAt"]) assert.equal(field in draft, false);
  assert.equal(draft.userId, "engineer-a"); assert.equal(draft.companyId, "company"); assert.equal(draft.siteId, "site");
  assert.equal(f.data.size, 1);
});

test("Save Draft and navigation away/back restore the same ID and notes", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  const id = editor.getState().draft.inspectionId;
  editor.changeNotes("Observations\nSecond line");
  assert.equal(await editor.save(), true);
  editor.changeNotes("Saved automatically on leaving");
  let navigated = 0;
  assert.equal(await editor.leave(() => navigated++), true); assert.equal(navigated, 1);
  const resumed = f.editor(); await resumed.open();
  assert.equal(resumed.getState().draft.inspectionId, id);
  assert.equal(resumed.getState().notes, "Saved automatically on leaving");
  assert.equal(resumed.getState().draft.sync.state, "pending-sync");
});

test("failed saves block navigation, retain edited notes, then allow explicit retry", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  const write = f.storage.setItem;
  f.storage.setItem = async () => { throw new Error("Storage full"); };
  editor.changeNotes("Must not disappear"); let navigated = false;
  assert.equal(await editor.leave(() => { navigated = true; }), false);
  assert.equal(navigated, false); assert.equal(editor.getState().notes, "Must not disappear");
  assert.equal(editor.getState().error, "SAVE_FAILED"); assert.equal(editor.getState().dirty, true);
  f.storage.setItem = write;
  assert.equal(await editor.leave(() => { navigated = true; }), true); assert.equal(navigated, true);
  const resumed = f.editor(); await resumed.open(); assert.equal(resumed.getState().notes, "Must not disappear");
});

test("editing while Saving and repeated back taps flush the latest text before navigating once", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  const started = gate(); const release = gate(); const write = f.storage.setItem; let delayed = true;
  f.storage.setItem = async (key, raw) => { if (delayed) { delayed = false; started.resolve(); await release.promise; } await write(key, raw); };
  editor.changeNotes("First text"); const pending = editor.save(); await started.promise;
  assert.equal(editor.getState().saving, true); editor.changeNotes("Latest text");
  let navigated = 0; const a = editor.leave(() => navigated++); const b = editor.leave(() => navigated++);
  release.resolve(); assert.equal(await pending, true); assert.equal(await a, true); assert.equal(await b, true);
  assert.equal(navigated, 1);
  const resumed = f.editor(); await resumed.open(); assert.equal(resumed.getState().notes, "Latest text");
});

test("lost local save acknowledgement is reconciled without duplicate drafts or a false failure", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open(); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { await write(key, raw); throw new Error("Lost acknowledgement"); };
  editor.changeNotes("Committed despite lost acknowledgement");
  assert.equal(await editor.save(), true); assert.equal(editor.getState().dirty, false);
  assert.equal(editor.getState().error, null);
  assert.equal(editor.getState().draft.sync.acknowledgedLocalRevision, null);
});

test("user switching clears editor content and prevents stale queued screen actions", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  editor.changeNotes("Private observations"); await editor.save(); const id = editor.getState().draft.inspectionId;
  f.switchUser("engineer-b"); editor.changeNotes("Must not be accepted");
  assert.equal(editor.getState().notes, ""); assert.equal(editor.getState().draft, null);
  assert.equal(await editor.leave(() => assert.fail("Stale navigation")), false);
  const other = f.editor(); await other.open(); assert.equal(other.getState().notes, "");
  f.switchUser("engineer-a"); const returned = f.editor(); await returned.open();
  assert.equal(returned.getState().draft.inspectionId, id); assert.equal(returned.getState().notes, "Private observations");
});

test("a damaged newest copy opens read-only; explicit recovery archives exact original bytes before editing", async () => {
  const f = fixture(); const site = f.site(); const first = await site.startOrResumeNotes(seed());
  await site.updateNotes(first.draft.inspectionId, 1, "Newest notes");
  const damagedKey = [...f.data.keys()].find((key) => key.endsWith("/0")); f.data.set(damagedKey, '{"engineerNotes":"partial');
  const originals = [...f.data]; const editor = f.editor(); await editor.open();
  assert.equal(editor.getState().recovery, true); assert.equal(editor.getState().notes, "");
  editor.changeNotes("Ignored until recovered"); assert.equal(editor.getState().notes, "");
  assert.deepEqual([...f.data], originals);
  assert.equal(await editor.recover(), true); assert.equal(editor.getState().recovery, false);
  const archived = [...f.data].filter(([key]) => key.includes("/inspection-draft-recovery/"));
  assert.equal(archived.length, 2);
  assert.deepEqual(archived.map(([, raw]) => raw).sort(), originals.map(([, raw]) => raw).sort());
  editor.changeNotes("Continued after explicit recovery"); assert.equal(await editor.save(), true);
  assert.equal(f.data.get(archived.find(([, raw]) => raw.startsWith('{"engineerNotes"'))[0]), '{"engineerNotes":"partial');
});

test("failed recovery archive leaves all active copies untouched and keeps editing blocked", async () => {
  const f = fixture(); const first = await f.site().startOrResumeNotes(seed());
  const key = [...f.data.keys()][0]; f.data.set(key.replace(/1$/, "0"), "broken"); const originals = [...f.data];
  const editor = f.editor(); await editor.open(); const write = f.storage.setItem;
  f.storage.setItem = async (target, raw) => { if (target.includes("/inspection-draft-recovery/")) throw new Error("Full"); await write(target, raw); };
  assert.equal(await editor.recover(), false); assert.equal(editor.getState().recovery, true);
  assert.deepEqual([...f.data], originals); assert.equal(first.draft.engineerNotes, "");
});

test("both damaged copies fail closed, retaining stored data and exposing a retryable recovery error", async () => {
  const f = fixture(); await f.site().startOrResumeNotes(seed());
  for (const key of f.data.keys()) f.data.set(key, "broken"); const originals = [...f.data];
  const editor = f.editor(); await editor.open();
  assert.equal(editor.getState().draft, null); assert.equal(editor.getState().error, "RECOVERY_REQUIRED");
  await editor.open(); assert.deepEqual([...f.data], originals);
});

test("torn save recovery preserves in-memory notes and only continues after explicit archiving", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  const write = f.storage.setItem; let torn = true;
  f.storage.setItem = async (key, raw) => { if (torn) { torn = false; f.data.set(key, "torn"); throw new Error("Interrupted"); } await write(key, raw); };
  editor.changeNotes("Unsaved text must survive recovery"); assert.equal(await editor.save(), false);
  assert.equal(editor.getState().recovery, true); assert.equal(editor.getState().notes, "Unsaved text must survive recovery");
  assert.equal(await editor.recover(), true);
  const resumed = f.editor(); await resumed.open(); assert.equal(resumed.getState().notes, "Unsaved text must survive recovery");
});

test("checklist drafts and their unanswered questions remain unchanged alongside notes-only drafts", async () => {
  const f = fixture(); const technical = await f.site().startOrResume({ assetDocId: seed().assetDocId, assetReference: "EXT001", assetLocation: "Lobby", equipmentType: "Water",
    serviceType: "TEST_ONLY", templateId: "synthetic-only", templateVersion: 1, questions: [{ id: "synthetic-only", allowNA: false }] });
  const original = JSON.stringify(technical.draft); const editor = f.editor(); await editor.open(); editor.changeNotes("Separate notes"); await editor.save();
  assert.equal(JSON.stringify((await f.site().load(technical.draft.inspectionId)).draft), original);
});

test("recovery with a lost repair acknowledgement is reconciled and navigation waits for recovery", async () => {
  const f = fixture(); await f.site().startOrResumeNotes(seed());
  const key = [...f.data.keys()][0]; f.data.set(key.replace(/1$/, "0"), "broken");
  const editor = f.editor(); await editor.open();
  const write = f.storage.setItem; const started = gate(); const release = gate(); let first = true;
  f.storage.setItem = async (target, raw) => {
    if (first) { first = false; started.resolve(); await release.promise; }
    await write(target, raw);
    if (target.includes("/inspection-drafts/")) throw new Error("Repair acknowledgement lost");
  };
  const recovering = editor.recover(); await started.promise;
  assert.equal(await editor.leave(() => assert.fail("Recovery still running")), false);
  release.resolve(); assert.equal(await recovering, true);
  assert.equal(editor.getState().recovery, false); assert.equal(editor.getState().error, null);
});

test("user switching while a screen save is in flight never returns its notes to the next user", async () => {
  const f = fixture(); const editor = f.editor(); await editor.open();
  const started = gate(); const release = gate(); const write = f.storage.setItem;
  f.storage.setItem = async (key, raw) => { started.resolve(); await release.promise; await write(key, raw); };
  editor.changeNotes("Private notes"); const saving = editor.save(); await started.promise;
  f.switchUser("engineer-b"); release.resolve(); assert.equal(await saving, false);
  assert.equal(editor.getState().notes, ""); assert.equal(editor.getState().draft, null);
  const other = f.editor(); await other.open(); assert.equal(other.getState().notes, "");
});

test("current approved asset details are exposed without rewriting the draft's original snapshot", async () => {
  const f = fixture(); const first = f.editor(); await first.open(); first.changeNotes("Keep original notes"); await first.save();
  const next = createInspectionNotesController(f.site(), { ...seed(), assetLocation: "New location", assetCapacity: "9 L" });
  await next.open(); assert.equal(next.getAsset().assetCapacity, "9 L");
  assert.equal(next.getState().draft.assetCapacity, "6 L"); assert.equal(next.getState().contextChanged, true);
  next.changeNotes("Updated notes"); await next.save(); assert.equal(next.getState().contextChanged, true);
});
