import assert from "node:assert/strict";
import test from "node:test";
import { assertCatalogueEmulators, CATALOGUE_DEMO_PROJECT } from "../../backend/catalogue/emulatorAdapter.ts";
import { advancedMxPro5DevelopmentDefinition } from "../../backend/catalogue/definitions/advancedMxPro5.ts";
import { createCataloguePublisher } from "../../backend/catalogue/publication.ts";

const local = { GCLOUD_PROJECT: CATALOGUE_DEMO_PROJECT, GOOGLE_CLOUD_PROJECT: CATALOGUE_DEMO_PROJECT,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
test("emulator adapter guard rejects absent, production, remote and malformed project/endpoints before I/O", () => {
  assert.doesNotThrow(() => assertCatalogueEmulators(local));
  for (const key of Object.keys(local)) {
    for (const value of [undefined, "", "production-project", "example.com:8080", "http://127.0.0.1:8080"]) assert.throws(() => assertCatalogueEmulators({ ...local, [key]: value }), /CATALOGUE_LOCAL_EMULATORS_REQUIRED/);
  }
});
test("MxPro family capability definition contains no installed counts, addresses, devices or company data", () => {
  const value = advancedMxPro5DevelopmentDefinition();
  assert.equal(value.modelId, "advanced-mxpro-5"); assert.equal(value.versionId, "dev-v1");
  assert.equal(value.definition.configurationCapabilities.loopCount, "variant-dependent");
  assert.equal(value.definition.configurationCapabilities.zones, "site-configured");
  assert.equal(value.definition.configurationCapabilities.deviceAddressFormat, "protocol-and-site-dependent");
  assert.deepEqual(Object.keys(value.definition).sort(), ["configurationCapabilities", "manufacturer", "modelDesignation", "sourceReferences"]);
  const other = advancedMxPro5DevelopmentDefinition(); value.definition.configurationCapabilities.loopCount = "changed";
  assert.equal(other.definition.configurationCapabilities.loopCount, "variant-dependent");
});
test("capability schema rejects fixed installation values, private fields and invalid source metadata before transaction I/O", async () => {
  const service = createCataloguePublisher({ verifyCaller: async () => ({ uid: "test-publisher" }),
    serverTimestamp: () => assert.fail("No write"), runTransaction: () => assert.fail("Invalid metadata must not start a transaction") });
  for (const mutate of [
    (v) => { v.definition.configurationCapabilities.loopCount = 4; },
    (v) => { v.definition.configurationCapabilities.zones = 200; },
    (v) => { v.definition.configurationCapabilities.deviceAddressFormat = "loop.address"; },
    (v) => { v.definition.configurationCapabilities.devices = []; },
    (v) => { v.definition.siteId = "private-site"; },
    (v) => { v.definition.manufacturer = " "; },
    (v) => { v.definition.sourceReferences = ["not-a-url"]; },
    (v) => { v.definition.sourceReferences = ["https://user:password@example.com/doc"]; },
    (v) => { v.kind = "fire-extinguishers"; },
  ]) { const value = advancedMxPro5DevelopmentDefinition(); mutate(value); await assert.rejects(service.publish(value), /INVALID_/); }
});
