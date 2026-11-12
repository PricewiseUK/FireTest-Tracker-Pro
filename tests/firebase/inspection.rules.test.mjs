import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

// Explicit demo project and local endpoints: this suite must never touch production.
const projectId = "demo-instafire-inspections";
let environment;
const sitePath = (company = "alpha") => `companies/${company}/sites/site`;
const inspectionPath = (company = "alpha", id = "inspection") => `${sitePath(company)}/extinguisherInspections/${id}`;
const templatePath = (company = "alpha", id = "synthetic-v1") => `companies/${company}/extinguisherInspectionTemplates/${id}`;
const proposalPath = (company = "alpha") => `${sitePath(company)}/extinguisherProposals/proposal`;
const photoPath = (company = "alpha") => `${proposalPath(company)}/photos/photo`;
const db = (user = "engineer-a") => environment.authenticatedContext(user).firestore();
const storage = (user = "engineer-a") => environment.authenticatedContext(user).storage();
const template = (count = 2) => ({
  schemaVersion: 1, version: 1, status: "approved",
  equipmentType: "SYNTHETIC_TEST_EQUIPMENT", serviceType: "TEST_ONLY",
  questions: Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${index}`, label: "EMULATOR FIXTURE ONLY - not servicing guidance", allowNA: index !== 0,
  })),
});
const answers = (count = 2, result = null) => Array.from({ length: count }, (_, index) => ({
  questionId: `synthetic-${index}`, result, notes: "",
}));
const draft = (overrides = {}) => ({
  schemaVersion: 1, companyId: "alpha", siteId: "site", assetDocId: "asset",
  createdBy: "engineer-a", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  equipmentType: "SYNTHETIC_TEST_EQUIPMENT", serviceType: "TEST_ONLY",
  templateId: "synthetic-v1", templateVersion: 1,
  assetSnapshot: { type: "SYNTHETIC_TEST_EQUIPMENT", location: "Test location", assetReference: "EXT001" },
  status: "draft", revision: 1, answers: answers(), submittedAt: null,
  ...overrides,
});
const proposal = () => ({
  createdBy: "engineer-a", createdAt: serverTimestamp(), status: "pending",
  type: "Water", location: "Lobby", reason: "Test fixture", testData: true,
  assetPrefix: "EXT", assetNumber: "001", assetId: "EXT001",
});
const photo = () => ({
  companyId: "alpha", siteId: "site", proposalId: "proposal", photoId: "photo",
  uploadedBy: "engineer-a", uploadedAt: serverTimestamp(), storagePath: photoPath(),
  contentType: "image/webp", photoType: "equipment",
});
async function seed(changes) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    for (const [path, value] of Object.entries(changes)) batch.set(doc(context.firestore(), path), value);
    await batch.commit();
  });
}
async function createDraft(overrides) {
  await assertSucceeds(setDoc(doc(db(), inspectionPath()), draft(overrides)));
}
async function submit() {
  await assertSucceeds(updateDoc(doc(db(), inspectionPath()), {
    answers: answers(2, "pass"), status: "submitted", revision: 2,
    updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
  }));
}

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080", "Run through npm run test:security");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") },
  });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  const fixtures = {};
  for (const company of ["alpha", "beta"]) {
    fixtures[`companies/${company}`] = { status: "active" };
    fixtures[sitePath(company)] = { status: "active" };
    fixtures[`${sitePath(company)}/extinguishers/asset`] = {
      type: "SYNTHETIC_TEST_EQUIPMENT", location: "Test location", assetId: "EXT001", id: "untrusted-stored-id",
    };
    fixtures[templatePath(company)] = template();
  }
  for (const [user, role, status] of [
    ["engineer-a", "engineer", "active"], ["engineer-b", "engineer", "active"],
    ["inactive", "engineer", "inactive"], ["owner", "owner", "active"],
    ["office", "office_admin", "active"], ["senior", "senior_engineer", "active"],
    ["unknown", "unverified_role", "active"],
  ]) fixtures[`companies/alpha/members/${user}`] = { role, status };
  fixtures["companies/alpha/members/senior-assigned"] = { role: "senior_engineer", status: "active", siteIds: ["site"] };
  fixtures["companies/alpha/members/senior-other-site"] = { role: "senior_engineer", status: "active", siteIds: ["other"] };
  fixtures["companies/beta/members/beta-engineer"] = { role: "engineer", status: "active" };
  fixtures["companies/beta/members/beta-office"] = { role: "office_admin", status: "active" };
  await seed(fixtures);
});

test("verified engineer creates an unanswered draft without siteIds and updates own draft", async () => {
  await createDraft();
  await assertSucceeds(updateDoc(doc(db(), inspectionPath()), {
    answers: [{ questionId: "synthetic-0", result: "fail", notes: "Fixture defect" }, answers()[1]],
    revision: 2, updatedAt: serverTimestamp(),
  }));
  const snapshot = await assertSucceeds(getDoc(doc(db(), inspectionPath())));
  assert.equal(snapshot.data().revision, 2);
  assert.equal(snapshot.data().answers[1].result, null);
  await assertSucceeds(getDocs(query(collection(db(), `${sitePath()}/extinguisherInspections`), where("createdBy", "==", "engineer-a"))));
  await assertFails(getDocs(collection(db(), `${sitePath()}/extinguisherInspections`)));
});

for (const user of [null, "outsider", "inactive", "unknown", "senior", "senior-other-site", "owner", "office", "beta-engineer"]) {
  test(`${user ?? "anonymous"} cannot create inspection drafts`, async () => {
    const client = user ? db(user) : environment.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(client, inspectionPath()), draft({ createdBy: user || "anonymous" })));
  });
}

test("another engineer cannot read, edit, submit, delete or take over a draft", async () => {
  await createDraft();
  const target = doc(db("engineer-b"), inspectionPath());
  await assertFails(getDoc(target));
  for (const change of [
    { answers: answers(2, "pass") }, { createdBy: "engineer-b" },
    { status: "submitted", submittedAt: serverTimestamp(), answers: answers(2, "pass") },
  ]) await assertFails(updateDoc(target, { ...change, revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(target));
});

test("proposed senior engineer has own inspection permissions only at assigned sites", async () => {
  const seniorDb = db("senior-assigned");
  await assertSucceeds(setDoc(doc(seniorDb, inspectionPath()), draft({ createdBy: "senior-assigned" })));
  await assertSucceeds(getDoc(doc(seniorDb, inspectionPath())));
  await assertSucceeds(updateDoc(doc(seniorDb, inspectionPath()), {
    revision: 2, updatedAt: serverTimestamp(), answers: answers(2, "pass"),
    status: "submitted", submittedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(seniorDb, `companies/alpha/members/senior-assigned`), {
    role: "owner", status: "active", siteIds: ["site"],
  }));
  await assertFails(setDoc(doc(seniorDb, `${sitePath()}/extinguishers/asset`), { approved: true }));
  await seed({ "companies/alpha/members/senior-assigned": { role: "senior_engineer", status: "active", siteIds: [] } });
  await assertFails(getDoc(doc(seniorDb, inspectionPath())));
});

test("senior engineer reads assigned-site submissions but never another engineer's private draft", async () => {
  await createDraft();
  const target = doc(db("senior-assigned"), inspectionPath());
  await assertFails(getDoc(target));
  await assertFails(updateDoc(target, { createdBy: "senior-assigned", revision: 2, updatedAt: serverTimestamp() }));
  await submit();
  await assertSucceeds(getDoc(target));
  await assertSucceeds(getDocs(query(collection(db("senior-assigned"), `${sitePath()}/extinguisherInspections`), where("status", "==", "submitted"))));
  await assertFails(getDoc(doc(db("senior-other-site"), inspectionPath())));
  await assertFails(getDoc(doc(db("senior-assigned"), inspectionPath("beta"))));
});

test("cross-company paths and forged company/site identities are denied", async () => {
  await createDraft();
  for (const user of ["beta-engineer", "beta-office"]) {
    await assertFails(getDoc(doc(db(user), inspectionPath())));
    await assertFails(getDoc(doc(db(user), `${sitePath()}/extinguishers/asset`)));
    await assertFails(getDoc(doc(db(user), templatePath())));
  }
  await assertFails(setDoc(doc(db(), inspectionPath("beta")), draft({ companyId: "beta" })));
  for (const overrides of [{ companyId: "beta" }, { siteId: "other" }]) {
    await assertFails(setDoc(doc(db(), inspectionPath("alpha", "forged")), draft(overrides)));
  }
});

test("company, site and membership revocation block inspection reads and updates", async () => {
  await createDraft();
  for (const path of ["companies/alpha", sitePath(), "companies/alpha/members/engineer-a"]) {
    const original = path.includes("members") ? { role: "engineer", status: "active" } : { status: "active" };
    await seed({ [path]: { ...original, status: "inactive" } });
    await assertFails(getDoc(doc(db(), inspectionPath())));
    await assertFails(updateDoc(doc(db(), inspectionPath()), { revision: 2, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db(), inspectionPath("alpha", "new")), draft()));
    await seed({ [path]: original });
  }
});

for (const [name, overrides] of Object.entries({
  "forged creator": { createdBy: "engineer-b" },
  "missing asset": { assetDocId: "missing" },
  "stored asset ID": { assetDocId: "untrusted-stored-id" },
  "proposal as asset": { assetDocId: "proposal" },
  "asset path traversal": { assetDocId: "../asset" },
  "template path traversal": { templateId: "../synthetic-v1" },
  "missing template": { templateId: "missing" },
  "template version": { templateVersion: 2 },
  "equipment type": { equipmentType: "Other" },
  "service type": { serviceType: "Other" },
  "snapshot forgery": { assetSnapshot: { type: "Other", location: "Test location", assetReference: "EXT001" } },
  "extra field": { approved: true },
  "schema version": { schemaVersion: 2 },
  "revision": { revision: 2 },
  "fractional revision": { revision: 1.5 },
  "client timestamp": { createdAt: Timestamp.fromMillis(1) },
  "updated timestamp": { updatedAt: Timestamp.fromMillis(1) },
  "preanswered draft": { answers: answers(2, "pass") },
  "missing answer": { answers: answers(1) },
  "duplicate question": { answers: [answers()[0], answers()[0]] },
  "reordered questions": { answers: answers().reverse() },
  "unregistered question": { answers: [...answers(), { questionId: "extra", result: null, notes: "" }] },
  "direct submission": { status: "submitted", submittedAt: serverTimestamp(), answers: answers(2, "pass") },
  "draft submittedAt": { submittedAt: serverTimestamp() },
})) {
  test(`creation rejects ${name}`, async () => {
    await assertFails(setDoc(doc(db(), inspectionPath()), draft(overrides)));
  });
}

test("all required inspection fields must be present", async () => {
  for (const field of Object.keys(draft())) {
    const payload = draft(); delete payload[field];
    await assertFails(setDoc(doc(db(), inspectionPath()), payload));
  }
});

test("valid complete answers submit once and office sees submitted records only", async () => {
  await createDraft();
  for (const user of ["owner", "office"]) await assertFails(getDoc(doc(db(user), inspectionPath())));
  await assertSucceeds(updateDoc(doc(db(), inspectionPath()), {
    answers: [
      { questionId: "synthetic-0", result: "fail", notes: "Fixture defect" },
      { questionId: "synthetic-1", result: "na", notes: "Fixture justification" },
    ], revision: 2, updatedAt: serverTimestamp(), submittedAt: serverTimestamp(), status: "submitted",
  }));
  for (const user of ["engineer-a", "owner", "office"]) {
    await assertSucceeds(getDoc(doc(db(user), inspectionPath())));
  }
  await assertSucceeds(getDocs(query(collection(db("office"), `${sitePath()}/extinguisherInspections`), where("status", "==", "submitted"))));
  await assertFails(getDocs(collection(db("office"), `${sitePath()}/extinguisherInspections`)));
  for (const user of ["engineer-b", "beta-engineer", "beta-office", "senior", "unknown", "inactive"]) {
    await assertFails(getDoc(doc(db(user), inspectionPath())));
  }
});

for (const [name, resultAnswers] of Object.entries({
  "unanswered": answers(),
  "invalid result": [{ questionId: "synthetic-0", result: "PASS", notes: "" }, answers()[1]],
  "fail without notes": [{ questionId: "synthetic-0", result: "fail", notes: "" }, answers(2, "pass")[1]],
  "whitespace notes": [{ questionId: "synthetic-0", result: "fail", notes: " \n\t\r " }, answers(2, "pass")[1]],
  "forbidden NA": [{ questionId: "synthetic-0", result: "na", notes: "Reason" }, answers(2, "pass")[1]],
  "NA without notes": [answers(2, "pass")[0], { questionId: "synthetic-1", result: "na", notes: "" }],
  "oversized notes": [{ questionId: "synthetic-0", result: "pass", notes: "x".repeat(2001) }, answers(2, "pass")[1]],
  "extra answer field": [{ ...answers(2, "pass")[0], trusted: true }, answers(2, "pass")[1]],
  "missing notes": [{ questionId: "synthetic-0", result: "pass" }, answers(2, "pass")[1]],
  "non-string notes": [{ questionId: "synthetic-0", result: "pass", notes: 1 }, answers(2, "pass")[1]],
})) {
  test(`submission rejects ${name}`, async () => {
    await createDraft();
    await assertFails(updateDoc(doc(db(), inspectionPath()), {
      answers: resultAnswers, revision: 2, updatedAt: serverTimestamp(), status: "submitted", submittedAt: serverTimestamp(),
    }));
  });
}

test("immutable draft identity and server timestamps cannot be changed", async () => {
  await createDraft();
  for (const change of [
    { createdBy: "engineer-b" }, { assetDocId: "other" }, { templateId: "other" },
    { templateVersion: 2 }, { schemaVersion: 2 }, { companyId: "beta" }, { siteId: "other" },
    { assetSnapshot: {} }, { serviceType: "other" }, { equipmentType: "other" },
    { createdAt: serverTimestamp() }, { updatedAt: Timestamp.fromMillis(1) },
    { approved: true }, { status: "submitted", submittedAt: Timestamp.fromMillis(1), answers: answers(2, "pass") },
  ]) await assertFails(updateDoc(doc(db(), inspectionPath()), { revision: 2, updatedAt: serverTimestamp(), ...change }));
});

test("stale, skipped and fractional draft revisions fail", async () => {
  await createDraft();
  await assertSucceeds(updateDoc(doc(db(), inspectionPath()), { revision: 2, updatedAt: serverTimestamp() }));
  for (const revision of [1, 2, 4, 2.5]) {
    await assertFails(updateDoc(doc(db(), inspectionPath()), { revision, updatedAt: serverTimestamp() }));
  }
});

test("submitted records cannot be rewritten, reopened, deleted or reassigned by any client role", async () => {
  await createDraft(); await submit();
  for (const user of ["engineer-a", "engineer-b", "owner", "office", "senior", "senior-assigned", "beta-office"]) {
    const target = doc(db(user), inspectionPath());
    for (const change of [
      { answers: answers() }, { status: "draft", submittedAt: null },
      { createdBy: user }, { reviewedBy: user }, { submittedAt: serverTimestamp() },
    ]) await assertFails(updateDoc(target, { ...change, revision: 3, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(target));
    await assertFails(setDoc(target, draft({ createdBy: user })));
  }
});

test("templates are trusted-only; unapproved and oversized definitions cannot create drafts", async () => {
  for (const user of ["engineer-a", "owner", "office", "senior"]) {
    await assertFails(setDoc(doc(db(user), templatePath()), template()));
  }
  for (const definition of [{ ...template(), status: "pending" }, template(0), template(9)]) {
    await seed({ [templatePath()]: definition });
    await assertFails(setDoc(doc(db(), inspectionPath()), draft({ answers: answers(definition.questions.length) })));
  }
});

test("all eight supported template questions are validated, including the final answer", async () => {
  await seed({ [templatePath()]: template(8) });
  await createDraft({ answers: answers(8) });
  const complete = answers(8, "pass");
  complete[7].result = null;
  await assertFails(updateDoc(doc(db(), inspectionPath()), {
    answers: complete, status: "submitted", revision: 2, updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
  }));
  complete[7].result = "pass";
  await assertSucceeds(updateDoc(doc(db(), inspectionPath()), {
    answers: complete, status: "submitted", revision: 2, updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
  }));
});

for (const user of ["engineer-a", "senior-assigned"]) {
  test(`eight Fail answers with maximum notes submit for ${user}`, async () => {
    await seed({ [templatePath()]: template(8) });
    const target = doc(db(user), inspectionPath());
    await assertSucceeds(setDoc(target, draft({ createdBy: user, answers: answers(8) })));
    await assertSucceeds(updateDoc(target, {
      answers: answers(8, "fail").map((answer) => ({ ...answer, notes: "x".repeat(2000) })),
      status: "submitted", revision: 2, updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
    }));
  });
  test(`eight permitted N/A answers with maximum notes submit for ${user}`, async () => {
    const definition = template(8);
    definition.questions = definition.questions.map((question) => ({ ...question, allowNA: true }));
    await seed({ [templatePath()]: definition });
    const target = doc(db(user), inspectionPath());
    await assertSucceeds(setDoc(target, draft({ createdBy: user, answers: answers(8) })));
    await assertSucceeds(updateDoc(target, {
      answers: answers(8, "na").map((answer) => ({ ...answer, notes: "x".repeat(2000) })),
      status: "submitted", revision: 2, updatedAt: serverTimestamp(), submittedAt: serverTimestamp(),
    }));
  });
}

test("withdrawn templates and deleted assets block further draft writes", async () => {
  await createDraft();
  await seed({ [templatePath()]: { ...template(), status: "withdrawn" } });
  await assertFails(updateDoc(doc(db(), inspectionPath()), { revision: 2, updatedAt: serverTimestamp() }));
  await seed({ [templatePath()]: template() });
  await environment.withSecurityRulesDisabled((context) => deleteDoc(doc(context.firestore(), `${sitePath()}/extinguishers/asset`)));
  await assertFails(updateDoc(doc(db(), inspectionPath()), { revision: 2, updatedAt: serverTimestamp() }));
});

test("legacy approved assets without optional display fields use documented snapshot defaults", async () => {
  await seed({ [`${sitePath()}/extinguishers/asset`]: { type: "SYNTHETIC_TEST_EQUIPMENT" } });
  await createDraft({ assetSnapshot: { type: "SYNTHETIC_TEST_EQUIPMENT", location: "", assetReference: "asset" } });
});

test("asset writes, review writes, membership escalation and inspection attachments stay denied", async () => {
  await createDraft();
  for (const user of ["engineer-a", "owner", "office", "senior"]) {
    for (const path of [
      `${sitePath()}/extinguishers/asset`, `companies/alpha/members/${user}`,
      `${inspectionPath()}/reviews/review`, `${inspectionPath()}/photos/photo`,
    ]) await assertFails(setDoc(doc(db(user), path), { approved: true }));
  }
});

test("proposal and photo metadata flow retains ownership, isolation and immutability", async () => {
  await assertSucceeds(setDoc(doc(db(), proposalPath()), proposal()));
  await assertSucceeds(setDoc(doc(db(), photoPath()), photo()));
  await assertSucceeds(getDoc(doc(db("owner"), proposalPath())));
  await assertSucceeds(getDoc(doc(db("office"), photoPath())));
  await assertFails(getDoc(doc(db("beta-engineer"), proposalPath())));
  await assertFails(getDoc(doc(db("beta-office"), photoPath())));
  await assertFails(setDoc(doc(db("engineer-b"), `${proposalPath()}/photos/other`), { ...photo(), uploadedBy: "engineer-b", photoId: "other" }));
  await assertFails(updateDoc(doc(db(), proposalPath()), { status: "approved" }));
  await assertFails(deleteDoc(doc(db(), proposalPath())));
  await assertFails(updateDoc(doc(db(), photoPath()), { contentType: "image/png" }));
  await assertFails(deleteDoc(doc(db(), photoPath())));
  await assertFails(setDoc(doc(db(), `${sitePath()}/extinguisherProposals/forged`), { ...proposal(), createdBy: "engineer-b" }));
  await assertFails(setDoc(doc(db(), `${sitePath()}/extinguisherProposals/approved`), { ...proposal(), status: "approved" }));
});

test("proposal Storage photos preserve pending-owner uploads and office reads", async () => {
  await assertSucceeds(setDoc(doc(db(), proposalPath()), proposal()));
  const bytes = new Uint8Array([1, 2, 3]);
  await assertSucceeds(uploadBytes(ref(storage(), photoPath()), bytes, { contentType: "image/webp" }));
  await assertSucceeds(getBytes(ref(storage("office"), photoPath())));
  await assertFails(getBytes(ref(storage("beta-office"), photoPath())));
  await assertFails(uploadBytes(ref(storage("engineer-b"), `${proposalPath()}/photos/other`), bytes, { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(storage(), photoPath()), new Uint8Array([9, 8, 7, 6]), { contentType: "image/webp" }));
  await assertFails(deleteObject(ref(storage(), photoPath())));
  await assertFails(uploadBytes(ref(storage(), `${proposalPath()}/photos/bad-type`), bytes, { contentType: "text/plain" }));
  await assertFails(uploadBytes(ref(storage(), `${proposalPath()}/photos/empty`), new Uint8Array(), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(storage(), `${proposalPath()}/photos/large`), new Uint8Array(10 * 1024 * 1024 + 1), { contentType: "image/webp" }));
  await seed({ [proposalPath()]: { ...proposal(), status: "approved" } });
  await assertFails(uploadBytes(ref(storage(), `${proposalPath()}/photos/late`), bytes, { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(storage(), `${inspectionPath()}/photos/photo`), bytes, { contentType: "image/webp" }));
});
