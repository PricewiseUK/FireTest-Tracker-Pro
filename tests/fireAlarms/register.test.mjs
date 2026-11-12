import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createFireAlarmFixtureRepository, resolvePanelIdentity, backAlarmView, initialAlarmView, recordedAlarmValue } from "../../engineer-app/src/modules/FireAlarms/fireAlarmRegister.ts";
import { advancedMxPro5DevelopmentDefinition } from "../../backend/catalogue/definitions/advancedMxPro5.ts";

const catalogue = JSON.parse(await readFile(new URL("../../engineer-app/src/modules/FireAlarms/fixtures/advancedMxPro5Catalogue.json", import.meta.url), "utf8"));
const scope = { companyId: "company-a", userId: "engineer-a" };
const filters = { loopId: null, zoneId: null };
function fixture() {
  const repo = createFireAlarmFixtureRepository(scope); const site = repo.listSites(scope)[0]; const system = repo.listSystems(scope, site.id)[0];
  return { repo, site, system };
}
test("fixture catalogue snapshot exactly matches the emulator-published MxPro family input and pinned version", () => {
  const { publicationState, ...input } = catalogue;
  assert.equal(publicationState, "published"); assert.deepEqual(input, advancedMxPro5DevelopmentDefinition());
});
test("site selection returns only workspace-scoped fictional sites; switching company/user cannot reuse a repository", () => {
  const { repo, site, system } = fixture();
  assert.ok(repo.listSites(scope).every((entry) => entry.companyId === scope.companyId && entry.name.startsWith("Example")));
  for (const foreign of [{ ...scope, companyId: "company-b" }, { ...scope, userId: "engineer-b" }]) {
    assert.throws(() => repo.listSites(foreign), /FIXTURE_SCOPE_MISMATCH/);
    assert.throws(() => repo.listSystems(foreign, site.id), /FIXTURE_SCOPE_MISMATCH/);
    assert.throws(() => repo.listDevices(foreign, site.id, system.id, filters), /FIXTURE_SCOPE_MISMATCH/);
  }
  assert.throws(() => createFireAlarmFixtureRepository({ companyId: "", userId: "" }), /FIXTURE_SCOPE_REQUIRED/);
});
test("system/device reads reject foreign site/system relationships instead of selecting a generic panel", () => {
  const { repo, site, system } = fixture(); const otherSite = repo.listSites(scope)[1];
  assert.throws(() => repo.listSystems(scope, "missing"), /FIXTURE_SITE_NOT_FOUND/);
  assert.throws(() => repo.getSystem(scope, otherSite.id, system.id), /FIXTURE_SYSTEM_NOT_FOUND/);
  assert.throws(() => repo.listDevices(scope, otherSite.id, system.id, filters), /FIXTURE_SYSTEM_NOT_FOUND/);
  assert.ok(repo.listDevices(scope, site.id, system.id, filters).every((entry) => entry.companyId === scope.companyId && entry.siteId === site.id && entry.systemId === system.id));
});
test("loop and zone filters combine independently with AND and clear to all recorded devices", () => {
  const { repo, site, system } = fixture();
  assert.equal(repo.listDevices(scope, site.id, system.id, filters).length, 4);
  assert.equal(repo.listDevices(scope, site.id, system.id, { ...filters, loopId: "loop-2" }).length, 2);
  assert.equal(repo.listDevices(scope, site.id, system.id, { ...filters, zoneId: "zone-g" }).length, 2);
  assert.deepEqual(repo.listDevices(scope, site.id, system.id, { loopId: "loop-2", zoneId: "zone-g" }).map(({ reference }) => reference), ["EXAMPLE D02"]);
  assert.deepEqual(repo.listDevices(scope, site.id, system.id, { loopId: "loop-1", zoneId: "zone-f" }), []);
  assert.equal(repo.listDevices(scope, site.id, system.id, filters).length, 4);
  assert.throws(() => repo.listDevices(scope, site.id, system.id, { ...filters, loopId: "foreign-loop" }), /INVALID_LOOP_FILTER/);
  assert.throws(() => repo.listDevices(scope, site.id, system.id, { ...filters, zoneId: "foreign-zone" }), /INVALID_ZONE_FILTER/);
});
test("private fixture loop/zone configuration is independent of the shared family definition", () => {
  const { repo, site, system } = fixture(); const otherSite = repo.listSites(scope)[1]; const other = repo.listSystems(scope, otherSite.id)[0];
  assert.deepEqual(system.catalogueRef, other.catalogueRef); assert.equal(system.loops.length, 2); assert.equal(other.loops.length, 1);
  const before = structuredClone(catalogue); const copy = repo.getSystem(scope, site.id, system.id);
  copy.loops.push({ id: "changed", label: "Changed" });
  assert.equal(repo.getSystem(scope, site.id, system.id).loops.length, 2); assert.deepEqual(catalogue, before);
  assert.equal(catalogue.definition.configurationCapabilities.loopCount, "variant-dependent");
});
test("offline identity resolution uses only the exact pinned catalogue version", () => {
  const { system } = fixture(); const result = resolvePanelIdentity(system, [catalogue]);
  assert.equal(result.manufacturer, "Advanced"); assert.equal(result.model, "MxPro 5"); assert.match(result.source, /Offline/);
  const future = { ...catalogue, versionId: "future", definition: { manufacturer: "Different", modelDesignation: "Different" } };
  assert.equal(resolvePanelIdentity(system, [future, catalogue]).model, "MxPro 5");
  assert.match(resolvePanelIdentity(system, [future]).source, /unavailable/);
});
test("missing, unpublished, malformed or ambiguous catalogue data safely falls back to recorded details without guessing", () => {
  const { system } = fixture(); const recorded = { ...system, recordedManufacturer: "Recorded maker", recordedModel: "Recorded model" };
  for (const entries of [[], [null], [{ ...catalogue, publicationState: "unpublished" }], [{ ...catalogue, definition: {} }], [catalogue, catalogue], [{ ...catalogue, modelId: "different" }]]) {
    const identity = resolvePanelIdentity(recorded, entries); assert.equal(identity.manufacturer, "Recorded maker"); assert.equal(identity.model, "Recorded model"); assert.match(identity.source, /unavailable/);
  }
  const identity = resolvePanelIdentity({ ...system, catalogueRef: null, recordedManufacturer: null, recordedModel: null }, [catalogue]);
  assert.equal(identity.manufacturer, "Not Recorded"); assert.equal(identity.model, "Not Recorded");
  assert.equal(resolvePanelIdentity({ ...recorded, catalogueRef: { ...recorded.catalogueRef, kind: "fire-extinguishers" } }, [catalogue]).model, "Recorded model");
});
test("missing device information is Not Recorded; empty systems have no invented loops or devices", () => {
  const { repo, site, system } = fixture(); const missing = repo.listDevices(scope, site.id, system.id, filters).find(({ address }) => address === null);
  assert.equal(recordedAlarmValue(missing.address), "Not Recorded"); assert.equal(recordedAlarmValue(missing.location), "Not Recorded");
  for (const value of [null, undefined, "", " ", 10]) assert.equal(recordedAlarmValue(value), "Not Recorded");
  const empty = repo.listSystems(scope, site.id)[1]; assert.deepEqual(empty.loops, []); assert.deepEqual(empty.zones, []);
  assert.deepEqual(repo.listDevices(scope, site.id, empty.id, filters), []);
});
test("Back returns devices to systems, systems to sites and sites to dashboard, clearing filters", () => {
  let view = { siteId: "site", systemId: "system", loopId: "loop", zoneId: "zone" };
  let next = backAlarmView(view); assert.equal(next.exit, false); assert.deepEqual(next.view, { siteId: "site", systemId: null, loopId: null, zoneId: null });
  next = backAlarmView(next.view); assert.equal(next.exit, false); assert.deepEqual(next.view, initialAlarmView());
  assert.equal(backAlarmView(next.view).exit, true);
});
test("fixture register has no write API, resets on fresh scope and cannot mutate another workspace's examples", () => {
  const { repo, site, system } = fixture(); assert.deepEqual(Object.keys(repo).sort(), ["getSystem", "listDevices", "listSites", "listSystems"]);
  const rows = repo.listDevices(scope, site.id, system.id, filters); rows[0].location = "Changed externally";
  assert.equal(repo.listDevices(scope, site.id, system.id, filters)[0].location, "Example reception");
  const nextScope = { companyId: "company-b", userId: "engineer-b" }; const next = createFireAlarmFixtureRepository(nextScope);
  assert.ok(next.listSites(nextScope).every((entry) => entry.companyId === "company-b"));
  assert.equal(next.listDevices(nextScope, site.id, system.id, filters)[0].location, "Example reception");
});
