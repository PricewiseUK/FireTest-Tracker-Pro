import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, beforeEach, after, test } from "node:test";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch, runTransaction, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes, listAll, deleteObject } from "firebase/storage";
import { CATALOGUE_KINDS, createCataloguePublisher } from "../../backend/catalogue/publication.ts";

// Synthetic fixtures only, isolated from both production AND the legacy demo suite.
const projectId = "demo-instafire-catalogue";
let environment;
const models = (kind) => `equipmentCatalogue/${kind}/models`;
const model = (kind) => `${models(kind)}/synthetic-model`;
const version = (kind, id = "v1") => `${model(kind)}/versions/${id}`;
const availability = (kind, id = "v1") => `${model(kind)}/versionAvailability/${id}`;
const installed = ["fireAlarmPanels", "extinguishers", "emergencyLights", "fireDoors", "fireBlankets"];
const asset = (name, company) => `companies/${company}/sites/site/${name}/synthetic-asset`;
const db = (uid = "engineer-a", claims) => environment.authenticatedContext(uid, claims).firestore();
const bytes = new Uint8Array([1, 2, 3]);
const definition = () => ({ manufacturer: "SYNTHETIC TEST ONLY", modelDesignation: "NO REAL EQUIPMENT", sourceReferences: ["Emulator fixture only; no technical approval"] });
const input = (kind = "fire-extinguishers", id = "new-v1") => ({ kind, modelId: "synthetic-model", versionId: id, definition: definition() });
async function seed(values) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    for (const [path, value] of Object.entries(values)) batch.set(doc(context.firestore(), path), value);
    await batch.commit();
  });
}
// Emulator-only equivalent of Admin Transaction.create: every path must have
// been transactionally read as absent. Never export this adapter to application code.
function publisher(context, uid = "publisher", override = {}) {
  return createCataloguePublisher({
    verifyCaller: async () => uid ? { uid } : null,
    serverTimestamp,
    runTransaction: (operation) => runTransaction(context.firestore(), async (tx) => {
      const reads = new Map();
      return operation({
        async get(path) { const snapshot = await tx.get(doc(context.firestore(), path)); reads.set(path, snapshot.exists()); return snapshot.exists() ? snapshot.data() : null; },
        create(path, data) { assert.equal(reads.get(path), false, "create requires an absent document read in THIS transaction"); tx.set(doc(context.firestore(), path), data); },
      });
    }),
    ...override,
  });
}
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  environment = await initializeTestEnvironment({ projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") } });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore(); await environment.clearStorage();
  const fixtures = { "cataloguePublishers/publisher": { schemaVersion: 1, enabled: true, publishVersions: true } };
  for (const company of ["alpha", "beta"]) {
    fixtures[`companies/${company}`] = { status: "active" };
    fixtures[`companies/${company}/sites/site`] = { status: "active" };
    for (const name of installed) {
      fixtures[asset(name, company)] = { assetId: "SYNTHETIC ONLY", type: "SYNTHETIC ONLY", location: "Fixture", catalogueRef: { kind: CATALOGUE_KINDS[installed.indexOf(name)], modelId: "synthetic-model", versionId: "v1" } };
      fixtures[`${asset(name, company)}/configurationVersions/v1`] = { private: company };
    }
  }
  for (const [uid, company, role, status] of [
    ["engineer-a", "alpha", "engineer", "active"], ["engineer-b", "beta", "engineer", "active"],
    ["owner", "alpha", "owner", "active"], ["office", "alpha", "office_admin", "active"],
    ["senior", "alpha", "senior_engineer", "active"], ["inactive", "alpha", "engineer", "inactive"],
    ["unknown", "alpha", "unknown", "active"], ["no-grant", "alpha", "engineer", "active"],
  ]) {
    fixtures[`companies/${company}/members/${uid}`] = { role, status };
    if (uid !== "no-grant") fixtures[`catalogueAccess/${uid}`] = { schemaVersion: 1, enabled: true, authorisingCompanyId: company };
  }
  fixtures["catalogueAccess/outsider"] = { schemaVersion: 1, enabled: true, authorisingCompanyId: "alpha" };
  fixtures["catalogueAccess/disabled"] = { schemaVersion: 1, enabled: false, authorisingCompanyId: "alpha" };
  for (const kind of CATALOGUE_KINDS) {
    fixtures[`equipmentCatalogue/${kind}`] = { publicationState: "published" };
    fixtures[model(kind)] = { kind, publicationState: "published", latestVersionId: "v1" };
    fixtures[`${models(kind)}/unpublished-model`] = { kind, publicationState: "unpublished" };
    fixtures[`${models(kind)}/unpublished-model/versions/v1`] = { publicationState: "published" };
    for (const [id, publicationState] of [["v1", "published"], ["withdrawn-version", "published"], ["unpublished", "unpublished"], ["bad-withdrawn-record", "withdrawn"]]) {
      fixtures[version(kind, id)] = { schemaVersion: 1, kind, modelId: "synthetic-model", versionId: id, publicationState, definition: definition() };
      fixtures[`${version(kind, id)}/files/manifest`] = { publicationState: "published", storagePath: `${version(kind, id)}/files/source` };
      fixtures[availability(kind, id)] = { publicationState: "published", state: id === "withdrawn-version" ? "withdrawn" : "active" };
    }
  }
  await seed(fixtures);
});

for (const [index, kind] of CATALOGUE_KINDS.entries()) {
  test(`${kind}: entitled users from independent companies read published definitions and scoped queries`, async () => {
    for (const uid of ["engineer-a", "engineer-b", "owner", "office", "senior"]) {
      for (const path of [`equipmentCatalogue/${kind}`, model(kind), version(kind), `${version(kind)}/files/manifest`, availability(kind)]) await assertSucceeds(getDoc(doc(db(uid), path)));
    }
    const rows = await assertSucceeds(getDocs(query(collection(db(), `${model(kind)}/versions`), where("publicationState", "==", "published"))));
    assert.equal(rows.size, 2);
    await assertSucceeds(getDocs(query(collection(db(), models(kind)), where("publicationState", "==", "published"))));
    await assertFails(getDocs(collection(db(), `${model(kind)}/versions`)));
    await assertFails(getDocs(collection(db(), models(kind))));
  });
  test(`${kind}: customers cannot create/update/delete catalogue data or forge publisher privileges`, async () => {
    const paths = [`equipmentCatalogue/${kind}`, model(kind), version(kind), `${version(kind)}/files/manifest`, availability(kind)];
    for (const path of paths) {
      await assertFails(updateDoc(doc(db("owner"), path), { publicationState: "published", injected: true }));
      await assertFails(deleteDoc(doc(db("owner"), path)));
      await assertFails(setDoc(doc(db("owner"), `${path}new`), { publicationState: "published" }));
    }
    for (const uid of ["engineer-a", "engineer-b", "office", "senior", "outsider", "inactive"]) {
      await assertFails(setDoc(doc(db(uid), version(kind, "new-version")), { publicationState: "published" }));
      await assertFails(updateDoc(doc(db(uid), version(kind)), { definition: { manufacturer: "Overwrite" } }));
      await assertFails(deleteDoc(doc(db(uid), version(kind))));
    }
    await assertFails(setDoc(doc(db("publisher", { admin: true, catalogueAdmin: true }), version(kind, "forged")), { publicationState: "published" }));
  });
  test(`${kind}: unpublished/missing versions deny; withdrawn published history remains readable without modifying its definition`, async () => {
    for (const id of ["unpublished", "missing", "bad-withdrawn-record"]) {
      await assertFails(getDoc(doc(db(), version(kind, id))));
      await assertFails(getDoc(doc(db(), `${version(kind, id)}/files/manifest`)));
      await assertFails(getDoc(doc(db(), availability(kind, id))));
    }
    await assertFails(getDoc(doc(db(), `${models(kind)}/unpublished-model/versions/v1`)));
    const original = (await getDoc(doc(db(), version(kind, "withdrawn-version")))).data();
    assert.equal(original.publicationState, "published");
    assert.equal((await getDoc(doc(db(), availability(kind, "withdrawn-version")))).data().state, "withdrawn");
    await assertFails(updateDoc(doc(db(), availability(kind, "withdrawn-version")), { state: "active" }));
    assert.deepEqual((await getDoc(doc(db(), version(kind, "withdrawn-version")))).data(), original);
  });
  test(`${kind}: catalogue grant does not confer access to another company's installed records or files`, async () => {
    const name = installed[index];
    for (const [uid, other] of [["engineer-a", "beta"], ["owner", "beta"], ["engineer-b", "alpha"]]) {
      await assertSucceeds(getDoc(doc(db(uid), version(kind))));
      await assertFails(getDoc(doc(db(uid), asset(name, other))));
      await assertFails(getDocs(collection(db(uid), `companies/${other}/sites/site/${name}`)));
      await assertFails(setDoc(doc(db(uid), asset(name, other)), { forged: true }));
      await assertFails(updateDoc(doc(db(uid), asset(name, other)), { catalogueRef: { modelId: "hijacked" } }));
      await assertFails(deleteDoc(doc(db(uid), asset(name, other))));
      await assertFails(getDoc(doc(db(uid), `${asset(name, other)}/configurationVersions/v1`)));
    }
    if (name === "extinguishers") await assertSucceeds(getDoc(doc(db(), asset(name, "alpha"))));
    else await assertFails(getDoc(doc(db(), asset(name, "alpha")))); // Module intentionally remains disabled.
    for (const client of [environment.unauthenticatedContext().firestore(), db("inactive")]) {
      await assertFails(getDoc(doc(client, asset(name, "alpha"))));
      await assertFails(getDocs(collection(client, `companies/alpha/sites/site/${name}`)));
      await assertFails(setDoc(doc(client, asset(name, "alpha")), { forged: true }));
      await assertFails(setDoc(doc(client, version(kind, "unauthorised-new")), { publicationState: "published" }));
      await assertFails(updateDoc(doc(client, version(kind)), { publicationState: "unpublished" }));
      await assertFails(deleteDoc(doc(client, version(kind))));
    }
    const privatePath = `${asset(name, "beta")}/files/evidence`;
    const sharedPath = `${version(kind)}/files/source`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), privatePath), bytes);
      await uploadBytes(ref(context.storage(), sharedPath), bytes);
    });
    const storage = environment.authenticatedContext("engineer-a").storage();
    for (const path of [privatePath, sharedPath]) {
      await assertFails(getBytes(ref(storage, path))); await assertFails(uploadBytes(ref(storage, path), bytes));
      await assertFails(deleteObject(ref(storage, path))); await assertFails(listAll(ref(storage, path.slice(0, path.lastIndexOf("/")))));
    }
  });
  test(`${kind}: trusted publication is create-only, idempotent and leaves installed assets unchanged`, async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const before = (await getDoc(doc(context.firestore(), asset(installed[index], "alpha")))).data();
      const service = publisher(context); const result = await service.publish(input(kind)); assert.equal(result.created, true);
      const first = (await getDoc(doc(context.firestore(), result.versionPath))).data();
      assert.equal(first.publicationState, "published"); assert.equal(typeof first.contentHash, "string"); assert.ok(first.publishedAt.toMillis() > 0);
      assert.equal((await service.publish(input(kind))).created, false);
      assert.deepEqual((await getDoc(doc(context.firestore(), result.versionPath))).data(), first);
      await assert.rejects(service.publish({ ...input(kind), definition: { ...definition(), modelDesignation: "Different" } }), /IMMUTABLE_VERSION_CONFLICT/);
      assert.deepEqual((await getDoc(doc(context.firestore(), asset(installed[index], "alpha")))).data(), before);
    });
  });
}

test("anonymous, inactive, missing/malformed/disabled grants and unknown membership deny all catalogue layers", async () => {
  const kind = CATALOGUE_KINDS[0];
  for (const uid of [null, "inactive", "outsider", "unknown", "disabled", "no-grant", "arbitrary-authenticated-user"]) {
    const client = uid ? db(uid) : environment.unauthenticatedContext().firestore();
    for (const path of [`equipmentCatalogue/${kind}`, model(kind), version(kind), availability(kind), `${version(kind)}/files/manifest`]) await assertFails(getDoc(doc(client, path)));
  }
  for (const grant of [{ enabled: true }, { schemaVersion: 1, enabled: "true", authorisingCompanyId: "alpha" }, { schemaVersion: 1, enabled: true, authorisingCompanyId: "alpha/sites/site" }, { schemaVersion: 1, enabled: true, authorisingCompanyId: "" }, { schemaVersion: 1, enabled: true, authorisingCompanyId: "missing-company" }]) {
    await seed({ "catalogueAccess/engineer-a": grant }); await assertFails(getDoc(doc(db(), version(kind))));
  }
});

test("live membership/company revocation overrides an existing grant; a foreign anchor grants nothing", async () => {
  const path = version(CATALOGUE_KINDS[0]); await assertSucceeds(getDoc(doc(db(), path)));
  await seed({ "companies/alpha": { status: "inactive" } }); await assertFails(getDoc(doc(db(), path)));
  await seed({ "companies/alpha": { status: "active" }, "companies/alpha/members/engineer-a": { status: "inactive", role: "engineer" } }); await assertFails(getDoc(doc(db(), path)));
  await seed({ "catalogueAccess/engineer-a": { schemaVersion: 1, enabled: true, authorisingCompanyId: "beta" } }); await assertFails(getDoc(doc(db(), path)));
});

test("read grants, publisher grants and private publication audit cannot be read, enumerated or self-provisioned by SDK users", async () => {
  for (const name of ["catalogueAccess", "cataloguePublishers", "cataloguePublicationAudit"]) {
    for (const uid of ["engineer-a", "owner", "publisher"]) {
      await assertFails(getDoc(doc(db(uid), `${name}/${uid}`)));
      await assertFails(getDocs(collection(db(uid), name)));
      await assertFails(setDoc(doc(db(uid), `${name}/${uid}`), { schemaVersion: 1, enabled: true, publishVersions: true, authorisingCompanyId: "beta" }));
      await assertFails(deleteDoc(doc(db(uid), `${name}/${uid}`)));
    }
  }
});

test("unknown kinds, unpublished root/model, unreviewed descendants and global collection groups remain denied", async () => {
  await seed({ "equipmentCatalogue/unknown": { publicationState: "published" }, "equipmentCatalogue/unknown/models/model": { publicationState: "published" }, "equipmentCatalogue/private": { publicationState: "unpublished" } });
  for (const path of ["equipmentCatalogue/unknown", "equipmentCatalogue/unknown/models/model", "equipmentCatalogue/private", `${model(CATALOGUE_KINDS[0])}/private/record`]) await assertFails(getDoc(doc(db(), path)));
  await assertFails(getDocs(collection(db(), "equipmentCatalogue")));
  await assertFails(getDocs(query(collectionGroup(db(), "versions"), where("publicationState", "==", "published"))));
  for (const name of installed) await assertFails(getDocs(collectionGroup(db(), name)));
});

test("backend publication requires verified caller AND an independent live central publisher grant", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const uid of [null, "engineer-a", "owner", "office", "senior", "outsider"]) await assert.rejects(publisher(context, uid).publish(input()), /PUBLISHER_AUTH_REQUIRED|CATALOGUE_PUBLICATION_FORBIDDEN/);
    for (const grant of [{ schemaVersion: 1, enabled: false, publishVersions: true }, { schemaVersion: 1, enabled: true, publishVersions: false }, { enabled: true, publishVersions: true }]) {
      await setDoc(doc(context.firestore(), "cataloguePublishers/publisher"), grant);
      await assert.rejects(publisher(context).publish(input()), /CATALOGUE_PUBLICATION_FORBIDDEN/);
    }
    assert.equal((await getDoc(doc(context.firestore(), version("fire-extinguishers", "new-v1")))).exists(), false);
  });
});

test("backend rejects extra private fields, invalid IDs/kinds and unreviewed definition fields without writes", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const service = publisher(context);
    for (const value of [{ ...input(), companyId: "alpha" }, { ...input(), kind: "unknown" }, { ...input(), modelId: "../company" }, { ...input(), versionId: "v1/asset" }, { ...input(), definition: { ...definition(), serialNumber: "PRIVATE" } }, { ...input(), definition: { ...definition(), sourceReferences: [] } }, { ...input(), definition: { ...definition(), manufacturer: " " } }]) await assert.rejects(service.publish(value), /INVALID_/);
    assert.equal((await getDoc(doc(context.firestore(), version("fire-extinguishers", "new-v1")))).exists(), false);
    await assert.rejects(service.publish({ ...input(), modelId: "unpublished-model" }), /PUBLISHED_MODEL_REQUIRED/);
  });
});

test("racing publication retries create one immutable version, availability and audit receipt", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const service = publisher(context); const results = await Promise.all(Array.from({ length: 4 }, () => service.publish(input())));
    assert.equal(results.filter(({ created }) => created).length, 1);
    assert.equal((await getDocs(collection(context.firestore(), "cataloguePublicationAudit"))).size, 1);
    const original = (await getDoc(doc(context.firestore(), results[0].versionPath))).data();
    await updateDoc(doc(context.firestore(), availability("fire-extinguishers", "new-v1")), { state: "withdrawn" });
    assert.equal((await service.publish(input())).created, false);
    assert.deepEqual((await getDoc(doc(context.firestore(), results[0].versionPath))).data(), original);
    assert.equal((await getDoc(doc(context.firestore(), availability("fire-extinguishers", "new-v1")))).data().state, "withdrawn");
  });
});

test("backend commit failure is atomic; an explicit retry can publish without orphaned audit or replacement", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const normal = publisher(context);
    const fail = publisher(context, "publisher", { runTransaction: async (operation) => {
      await runTransaction(context.firestore(), async (tx) => {
        await operation({ get: async (path) => { const s = await tx.get(doc(context.firestore(), path)); return s.exists() ? s.data() : null; }, create: (path, value) => tx.set(doc(context.firestore(), path), value) });
        throw new Error("Injected failure before commit");
      });
    } });
    await assert.rejects(fail.publish(input()), /Injected failure/);
    assert.equal((await getDoc(doc(context.firestore(), version("fire-extinguishers", "new-v1")))).exists(), false);
    assert.equal((await getDocs(collection(context.firestore(), "cataloguePublicationAudit"))).size, 0);
    assert.equal((await normal.publish(input())).created, true);
  });
});
