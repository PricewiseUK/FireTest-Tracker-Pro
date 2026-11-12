import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, beforeEach, after, test } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { boundedChecklistProposal } from "./boundedChecklistProposal.mjs";

// Sequential after the unchanged production-rule suite, in the same LOCAL demo emulator.
let environment;
const path = "companies/alpha/sites/site/extinguisherInspections/inspection";
const templatePath = "companies/alpha/extinguisherInspectionTemplates/synthetic-9";
const db = (user = "engineer") => environment.authenticatedContext(user).firestore();
const definition = (count = 9) => ({ schemaVersion: 1, version: 2, status: "approved", equipmentType: "SYNTHETIC_ONLY", serviceType: "SYNTHETIC_ONLY",
  questions: Array.from({ length: count }, (_, index) => ({ id: `q${index}`, label: "Synthetic emulator fixture, not servicing guidance", allowNA: index !== 0 })) });
const answers = (count = 9, result = null) => Array.from({ length: count }, (_, index) => ({ questionId: `q${index}`, result, notes: result === "fail" || result === "na" ? "x".repeat(2000) : "" }));
const record = (user = "engineer", count = 9) => ({ schemaVersion: 1, companyId: "alpha", siteId: "site", assetDocId: "asset", createdBy: user,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), equipmentType: "SYNTHETIC_ONLY", serviceType: "SYNTHETIC_ONLY", templateId: "synthetic-9", templateVersion: 2,
  assetSnapshot: { type: "SYNTHETIC_ONLY", location: "Synthetic location", assetReference: "SYN001" }, status: "draft", revision: 1, answers: answers(count), submittedAt: null });
async function seed(changes) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore()); for (const [key, value] of Object.entries(changes)) batch.set(doc(context.firestore(), key), value); await batch.commit();
  });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  environment = await initializeTestEnvironment({ projectId: "demo-instafire-inspections", firestore: { host: "127.0.0.1", port: 8080, rules: boundedChecklistProposal(await readFile("firestore.rules", "utf8")) } });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await seed({ "companies/alpha": { status: "active" }, "companies/beta": { status: "active" }, "companies/alpha/sites/site": { status: "active" },
    "companies/alpha/sites/site/extinguishers/asset": { type: "SYNTHETIC_ONLY", location: "Synthetic location", assetId: "SYN001" },
    "companies/alpha/members/engineer": { status: "active", role: "engineer" }, "companies/alpha/members/other": { status: "active", role: "engineer" },
    "companies/alpha/members/senior": { status: "active", role: "senior_engineer", siteIds: ["site"] }, "companies/alpha/members/unassigned": { status: "active", role: "senior_engineer", siteIds: [] },
    "companies/alpha/members/owner": { status: "active", role: "owner" }, "companies/alpha/members/office": { status: "active", role: "office_admin" },
    "companies/alpha/members/unknown": { status: "active", role: "unknown" }, "companies/beta/members/beta": { status: "active", role: "engineer" }, [templatePath]: definition() });
});
test("proposal validates all 9 initial answers and rejects pre-answers at every position", async () => {
  for (let index = 0; index < 9; index++) {
    const invalid = record(); invalid.answers[index].result = "pass";
    await assertFails(setDoc(doc(db(), path), invalid));
  }
  await assertSucceeds(setDoc(doc(db(), path), record()));
});
test("proposal accepts 8/9 questions and rejects zero, 10, truncated and extra answer lists", async () => {
  for (const count of [8, 9]) {
    await seed({ [templatePath]: definition(count) }); await assertSucceeds(setDoc(doc(db(), `${path}${count}`), record("engineer", count)));
  }
  for (const count of [0, 10, 12, 16]) {
    await seed({ [templatePath]: definition(count) }); await assertFails(setDoc(doc(db(), `${path}bad${count}`), record("engineer", count)));
  }
  await seed({ [templatePath]: definition() });
  for (const count of [8, 10]) await assertFails(setDoc(doc(db(), path), record("engineer", count)));
});
test("proposal rejects invalid/missing/reordered/extra-field answers at all positions", async () => {
  await assertSucceeds(setDoc(doc(db(), path), record()));
  for (let index = 0; index < 9; index++) {
    for (const patch of [{ questionId: "wrong" }, { result: "invalid" }, { extra: true }, { notes: "x".repeat(2001) }]) {
      const edited = answers(); edited[index] = { ...edited[index], ...patch };
      await assertFails(updateDoc(doc(db(), path), { answers: edited, revision: 2, updatedAt: serverTimestamp() }));
    }
    const missing = answers(); delete missing[index].notes;
    await assertFails(updateDoc(doc(db(), path), { answers: missing, revision: 2, updatedAt: serverTimestamp() }));
  }
  const reordered = answers(); [reordered[0], reordered[8]] = [reordered[8], reordered[0]];
  await assertFails(updateDoc(doc(db(), path), { answers: reordered, revision: 2, updatedAt: serverTimestamp() }));
});
test("proposal rejects unanswered submissions at every position, including question 9", async () => {
  await assertSucceeds(setDoc(doc(db(), path), record()));
  for (let index = 0; index < 9; index++) {
    const edited = answers(9, "pass"); edited[index].result = null;
    await assertFails(updateDoc(doc(db(), path), { answers: edited, status: "submitted", submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: 2 }));
  }
});
for (const user of ["engineer", "senior"]) {
  for (const result of ["pass", "fail", "na"]) {
    test(`proposal worst-case 9 ${result} answers for ${user} stay within rule evaluation limits`, async () => {
      if (result === "na") { const template = definition(); template.questions[0].allowNA = true; await seed({ [templatePath]: template }); }
      await assertSucceeds(setDoc(doc(db(user), path), record(user)));
      await assertSucceeds(updateDoc(doc(db(user), path), { answers: answers(9, result), status: "submitted", submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), revision: 2 }));
    });
  }
}
test("proposal retains note and N/A restrictions in the second half", async () => {
  await assertSucceeds(setDoc(doc(db(), path), record()));
  for (const index of [0, 7, 8]) {
    const edited = answers(9, "pass"); edited[index] = { ...edited[index], result: "fail", notes: " \n\t" };
    await assertFails(updateDoc(doc(db(), path), { answers: edited, revision: 2, updatedAt: serverTimestamp() }));
    edited[index].result = "na";
    await assertFails(updateDoc(doc(db(), path), { answers: edited, revision: 2, updatedAt: serverTimestamp() }));
  }
  const forbidden = answers(); forbidden[0] = { ...forbidden[0], result: "na", notes: "Reason" };
  await assertFails(updateDoc(doc(db(), path), { answers: forbidden, revision: 2, updatedAt: serverTimestamp() }));
});
test("proposal keeps private ownership, role/site restrictions, company isolation and submitted immutability", async () => {
  await assertSucceeds(setDoc(doc(db(), path), record()));
  for (const user of ["other", "beta", "unknown", "unassigned", "office", "owner"]) {
    await assertFails(getDoc(doc(db(user), path)));
    await assertFails(updateDoc(doc(db(user), path), { answers: answers(9, "pass"), revision: 2, updatedAt: serverTimestamp() }));
  }
  await assertSucceeds(updateDoc(doc(db(), path), { answers: answers(9, "pass"), status: "submitted", submittedAt: serverTimestamp(), revision: 2, updatedAt: serverTimestamp() }));
  for (const user of ["engineer", "senior", "owner", "office"]) {
    await assertFails(updateDoc(doc(db(user), path), { answers: answers(), status: "draft", submittedAt: null, revision: 3, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db(user), path)));
  }
});
test("proposal still denies unapproved templates and engineer template/asset writes", async () => {
  await assertFails(setDoc(doc(db(), templatePath), definition()));
  await assertFails(updateDoc(doc(db(), "companies/alpha/sites/site/extinguishers/asset"), { type: "changed" }));
  for (const status of ["pending", "pending-technical-validation", "demonstration"]) {
    await seed({ [templatePath]: { ...definition(), status } }); await assertFails(setDoc(doc(db(), path), record()));
  }
});
