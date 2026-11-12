import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
import { createCatalogueEmulatorRuntime, createEmulatorCataloguePublisher, assertCatalogueEmulators, CATALOGUE_DEMO_PROJECT } from "../../backend/catalogue/emulatorAdapter.ts";
import { advancedMxPro5DevelopmentDefinition } from "../../backend/catalogue/definitions/advancedMxPro5.ts";

const modelPath = "equipmentCatalogue/fire-alarm-panels/models/advanced-mxpro-5";
const path = `${modelPath}/versions/dev-v1`;
let environment, runtime, publisherToken, customerToken, betaToken;
const db = (uid = "engineer-a") => environment.authenticatedContext(uid).firestore();
async function tokenFor(uid) {
  assertCatalogueEmulators();
  const password = randomBytes(24).toString("hex");
  const email = `${uid}@catalogue-emulator.invalid`;
  await runtime.auth.createUser({ uid, email, password });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(response.status, 200, "Emulator sign-in failed");
  const result = await response.json(); assert.equal(typeof result.idToken, "string"); return result.idToken;
}
async function publish(value = advancedMxPro5DevelopmentDefinition(), token = publisherToken) {
  const service = createEmulatorCataloguePublisher(token);
  try { return await service.publish(value); } finally { await service.close(); }
}
before(async () => {
  assertCatalogueEmulators();
  environment = await initializeTestEnvironment({ projectId: CATALOGUE_DEMO_PROJECT,
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") } });
  runtime = createCatalogueEmulatorRuntime();
});
after(async () => { await runtime?.close(); await environment?.cleanup(); });
beforeEach(async () => {
  assertCatalogueEmulators(); await environment.clearFirestore();
  const cleared = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${CATALOGUE_DEMO_PROJECT}/accounts`, { method: "DELETE" }); assert.equal(cleared.status, 200);
  publisherToken = await tokenFor("mxpro-publisher"); customerToken = await tokenFor("engineer-a"); betaToken = await tokenFor("engineer-b");
  // Explicit trusted local bootstrap, never a customer API or production setup.
  const batch = runtime.firestore.batch();
  batch.create(runtime.firestore.doc("cataloguePublishers/mxpro-publisher"), { schemaVersion: 1, enabled: true, publishVersions: true });
  batch.create(runtime.firestore.doc("equipmentCatalogue/fire-alarm-panels"), { publicationState: "published" });
  batch.create(runtime.firestore.doc(modelPath), { schemaVersion: 1, kind: "fire-alarm-panels", publicationState: "published" });
  for (const [company, uid, loopCount] of [["alpha", "engineer-a", 1], ["beta", "engineer-b", 4]]) {
    batch.create(runtime.firestore.doc(`companies/${company}`), { status: "active" });
    batch.create(runtime.firestore.doc(`companies/${company}/members/${uid}`), { status: "active", role: "engineer" });
    batch.create(runtime.firestore.doc(`companies/${company}/sites/site`), { status: "active" });
    batch.create(runtime.firestore.doc(`companies/${company}/sites/site/fireAlarmPanels/fixture`), { fixtureOnly: true, catalogueRef: { kind: "fire-alarm-panels", modelId: "advanced-mxpro-5", versionId: "dev-v1" }, configuration: { loopCount } });
    batch.create(runtime.firestore.doc(`catalogueAccess/${uid}`), { schemaVersion: 1, enabled: true, authorisingCompanyId: company });
  }
  await batch.commit();
});

test("concrete Admin adapter publishes MxPro 5 once; Company A/B retrieve the identical shared definition", async () => {
  const result = await publish(); assert.equal(result.versionPath, path); assert.equal(result.created, true);
  const a = (await assertSucceeds(getDoc(doc(db(), path)))).data();
  const b = (await assertSucceeds(getDoc(doc(db("engineer-b"), path)))).data();
  assert.deepEqual(a, b); assert.equal(a.schemaVersion, 2); assert.equal(a.definition.manufacturer, "Advanced");
  assert.equal(a.definition.modelDesignation, "MxPro 5"); assert.equal(a.definition.configurationCapabilities.loopCount, "variant-dependent");
  assert.equal(a.definition.configurationCapabilities.deviceAddressFormat, "protocol-and-site-dependent");
  assert.ok(a.publishedAt.toMillis() > 0);
  // Real Auth-emulator tokens also exercise Firestore REST authorisation, rather
  // than relying solely on rules-unit-testing's synthetic authenticated contexts.
  for (const [token, otherCompany] of [[customerToken, "beta"], [betaToken, "alpha"]]) {
    const base = `http://127.0.0.1:8080/v1/projects/${CATALOGUE_DEMO_PROJECT}/databases/(default)/documents`;
    const response = await fetch(`${base}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.fields.definition.mapValue.fields.modelDesignation.stringValue, "MxPro 5");
    const privateResponse = await fetch(`${base}/companies/${otherCompany}/sites/site/fireAlarmPanels/fixture`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(privateResponse.status, 403);
  }
  const list = await assertSucceeds(getDocs(query(collection(db(), `${modelPath}/versions`), where("publicationState", "==", "published")))); assert.equal(list.size, 1);
  for (const [uid, company] of [["engineer-a", "beta"], ["engineer-b", "alpha"]]) {
    await assertFails(getDoc(doc(db(uid), `companies/${company}/sites/site/fireAlarmPanels/fixture`)));
    await assertFails(getDocs(collection(db(uid), `companies/${company}/sites/site/fireAlarmPanels`)));
    await assertFails(updateDoc(doc(db(uid), `companies/${company}/sites/site/fireAlarmPanels/fixture`), { configuration: { loopCount: 99 } }));
  }
  for (const [company, loops] of [["alpha", 1], ["beta", 4]]) assert.equal((await runtime.firestore.doc(`companies/${company}/sites/site/fireAlarmPanels/fixture`).get()).data().configuration.loopCount, loops);
});

test("duplicate and concurrent Admin publication attempts return the same immutable version and one audit", async () => {
  const results = await Promise.all([publish(), publish(), publish()]); assert.equal(results.filter(({ created }) => created).length, 1);
  const initial = (await getDoc(doc(db(), path))).data();
  assert.equal((await publish()).created, false);
  assert.deepEqual((await getDoc(doc(db(), path))).data(), initial);
  assert.equal((await runtime.firestore.collection("cataloguePublicationAudit").get()).size, 1);
});

test("different content cannot replace dev-v1; a deliberate new version leaves historical content unchanged", async () => {
  await publish(); const original = (await getDoc(doc(db(), path))).data();
  const changed = advancedMxPro5DevelopmentDefinition(); changed.definition.modelDesignation = "Changed designation";
  await assert.rejects(publish(changed), /IMMUTABLE_VERSION_CONFLICT/);
  changed.versionId = "dev-v2"; assert.equal((await publish(changed)).created, true);
  assert.deepEqual((await getDoc(doc(db(), path))).data(), original);
});

test("SDK users including forged admin cannot alter the MxPro shared definition or grant publication rights", async () => {
  await publish();
  for (const client of [db(), db("engineer-b"), environment.authenticatedContext("mxpro-publisher", { admin: true }).firestore(), environment.unauthenticatedContext().firestore()]) {
    await assertFails(setDoc(doc(client, `${modelPath}/versions/forged`), { publicationState: "published" }));
    await assertFails(updateDoc(doc(client, path), { definition: {} })); await assertFails(deleteDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, "cataloguePublishers/engineer-a"), { schemaVersion: 1, enabled: true, publishVersions: true }));
  }
});

test("real emulator token verification rejects invalid tokens and customer tokens without central publication rights", async () => {
  await assert.rejects(publish(advancedMxPro5DevelopmentDefinition(), "not-an-id-token"));
  await assert.rejects(publish(advancedMxPro5DevelopmentDefinition(), customerToken), /CATALOGUE_PUBLICATION_FORBIDDEN/);
  await runtime.firestore.doc("cataloguePublishers/mxpro-publisher").update({ enabled: false });
  await assert.rejects(publish(), /CATALOGUE_PUBLICATION_FORBIDDEN/);
  await runtime.firestore.doc("cataloguePublishers/mxpro-publisher").update({ enabled: true });
  await runtime.auth.updateUser("mxpro-publisher", { disabled: true });
  await assert.rejects(publish());
  assert.equal((await runtime.firestore.doc(path).get()).exists, false);
});

test("missing, disabled or inactive catalogue entitlement prevents retrieval of the published MxPro definition", async () => {
  await publish();
  await assertFails(getDoc(doc(db("outsider"), path))); await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  await runtime.firestore.doc("catalogueAccess/engineer-a").delete(); await assertFails(getDoc(doc(db(), path)));
  await runtime.firestore.doc("catalogueAccess/engineer-a").create({ schemaVersion: 1, enabled: false, authorisingCompanyId: "alpha" }); await assertFails(getDoc(doc(db(), path)));
  await runtime.firestore.doc("catalogueAccess/engineer-a").update({ enabled: true });
  await runtime.firestore.doc("companies/alpha/members/engineer-a").update({ status: "inactive" }); await assertFails(getDoc(doc(db(), path)));
  await assertSucceeds(getDoc(doc(db("engineer-b"), path)));
});

test("invalid/private installation metadata is rejected without partial Admin publication", async () => {
  for (const mutate of [
    (v) => { v.definition.configurationCapabilities.loopCount = 4; },
    (v) => { v.definition.configurationCapabilities.zones = ["Zone 1"]; },
    (v) => { v.definition.location = "Private customer room"; },
    (v) => { v.definition.sourceReferences = []; },
    (v) => { v.definition.modelDesignation = ""; },
  ]) { const value = advancedMxPro5DevelopmentDefinition(); mutate(value); await assert.rejects(publish(value), /INVALID_/); }
  assert.equal((await runtime.firestore.doc(path).get()).exists, false);
  assert.equal((await runtime.firestore.collection("cataloguePublicationAudit").get()).size, 0);
});

test("adapter rechecks the emulator-only environment after creation before doing publication I/O", async () => {
  const service = createEmulatorCataloguePublisher(publisherToken); const saved = process.env.GCLOUD_PROJECT;
  try { process.env.GCLOUD_PROJECT = "not-the-demo-project"; await assert.rejects(service.publish(advancedMxPro5DevelopmentDefinition()), /CATALOGUE_LOCAL_EMULATORS_REQUIRED/); }
  finally { process.env.GCLOUD_PROJECT = saved; await service.close(); }
  assert.equal((await runtime.firestore.doc(path).get()).exists, false);
});
