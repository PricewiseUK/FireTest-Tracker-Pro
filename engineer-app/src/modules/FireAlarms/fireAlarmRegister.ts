export type FixtureScope = { companyId: string; userId: string };
export type CatalogueReference = { kind: string; modelId: string; versionId: string };
export type CatalogueIdentity = CatalogueReference & { publicationState: string; definition: { manufacturer: string; modelDesignation: string } };
export type AlarmSite = { id: string; companyId: string; name: string };
export type AlarmSystem = { id: string; companyId: string; siteId: string; reference: string; location: string | null;
  catalogueRef: CatalogueReference | null; recordedManufacturer: string | null; recordedModel: string | null;
  loops: { id: string; label: string }[]; zones: { id: string; label: string }[] };
export type AlarmDevice = { id: string; companyId: string; siteId: string; systemId: string; reference: string;
  type: string; location: string | null; loopId: string | null; zoneId: string | null; address: string | null };
export type AlarmFilters = { loopId: string | null; zoneId: string | null };
export type AlarmView = AlarmFilters & { siteId: string | null; systemId: string | null };
export const initialAlarmView = (): AlarmView => ({ siteId: null, systemId: null, loopId: null, zoneId: null });
export function backAlarmView(view: AlarmView) {
  return view.systemId ? { exit: false, view: { ...view, systemId: null, loopId: null, zoneId: null } }
    : { exit: !view.siteId, view: initialAlarmView() };
}
export const recordedAlarmValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "Not Recorded";
/** Exact pinned reference only. Missing/offline catalogue never guesses another model. */
export function resolvePanelIdentity(system: AlarmSystem, catalogue: readonly unknown[]) {
  const reference = system.catalogueRef;
  const matches = reference?.kind === "fire-alarm-panels" ? catalogue.filter((entry): entry is CatalogueIdentity => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const data = entry as Record<string, unknown>;
    return data.publicationState === "published" && data.kind === reference.kind && data.modelId === reference.modelId && data.versionId === reference.versionId;
  }) : [];
  const entry = matches.length === 1 ? matches[0] : undefined;
  return entry && entry.definition && typeof entry.definition.manufacturer === "string" && entry.definition.manufacturer.trim()
    && typeof entry.definition.modelDesignation === "string" && entry.definition.modelDesignation.trim()
    ? { manufacturer: entry.definition.manufacturer, model: entry.definition.modelDesignation, source: "Bundled example catalogue · Offline available" }
    : { manufacturer: recordedAlarmValue(system.recordedManufacturer), model: recordedAlarmValue(system.recordedModel), source: "Recorded example details · Catalogue unavailable" };
}

/** In-memory EXAMPLE repository, not Firebase authorisation or real company records. */
export function createFireAlarmFixtureRepository(scope: FixtureScope) {
  if (!scope.companyId || !scope.userId) throw new Error("FIXTURE_SCOPE_REQUIRED");
  const owner = { ...scope };
  const sites: AlarmSite[] = [
    { id: "example-site-1", companyId: owner.companyId, name: "Example Service Centre" },
    { id: "example-site-2", companyId: owner.companyId, name: "Example Annex" },
  ];
  const systems: AlarmSystem[] = [
    { id: "example-panel-1", companyId: owner.companyId, siteId: sites[0].id, reference: "EXAMPLE PANEL 01", location: "Example reception",
      catalogueRef: { kind: "fire-alarm-panels", modelId: "advanced-mxpro-5", versionId: "dev-v1" }, recordedManufacturer: "Advanced", recordedModel: "MxPro 5",
      loops: [{ id: "loop-1", label: "Loop 1" }, { id: "loop-2", label: "Loop 2" }], zones: [{ id: "zone-g", label: "Ground" }, { id: "zone-f", label: "First" }] },
    { id: "example-panel-2", companyId: owner.companyId, siteId: sites[0].id, reference: "EXAMPLE PANEL 02", location: "Example workshop",
      catalogueRef: null, recordedManufacturer: null, recordedModel: null, loops: [], zones: [] },
    { id: "example-panel-3", companyId: owner.companyId, siteId: sites[1].id, reference: "EXAMPLE PANEL 03", location: "Example entrance",
      catalogueRef: { kind: "fire-alarm-panels", modelId: "advanced-mxpro-5", versionId: "dev-v1" }, recordedManufacturer: "Advanced", recordedModel: "MxPro 5",
      loops: [{ id: "loop-a", label: "Loop A" }], zones: [{ id: "zone-a", label: "Annex" }] },
  ];
  const devices: AlarmDevice[] = [
    { id: "example-device-1", companyId: owner.companyId, siteId: sites[0].id, systemId: systems[0].id, reference: "EXAMPLE D01", type: "Smoke detector", location: "Example reception", loopId: "loop-1", zoneId: "zone-g", address: "Example A" },
    { id: "example-device-2", companyId: owner.companyId, siteId: sites[0].id, systemId: systems[0].id, reference: "EXAMPLE D02", type: "Manual call point", location: "Example exit", loopId: "loop-2", zoneId: "zone-g", address: "Example B" },
    { id: "example-device-3", companyId: owner.companyId, siteId: sites[0].id, systemId: systems[0].id, reference: "EXAMPLE D03", type: "Heat detector", location: "Example first-floor room", loopId: "loop-2", zoneId: "zone-f", address: "Example C" },
    { id: "example-device-4", companyId: owner.companyId, siteId: sites[0].id, systemId: systems[0].id, reference: "EXAMPLE D04", type: "Device type Not Recorded", location: null, loopId: null, zoneId: null, address: null },
    { id: "example-device-5", companyId: owner.companyId, siteId: sites[1].id, systemId: systems[2].id, reference: "EXAMPLE D05", type: "Manual call point", location: "Example annex exit", loopId: "loop-a", zoneId: "zone-a", address: "Example D" },
  ];
  function authorised(request: FixtureScope) {
    if (request.companyId !== owner.companyId || request.userId !== owner.userId) throw new Error("FIXTURE_SCOPE_MISMATCH");
  }
  function site(request: FixtureScope, siteId: string) {
    authorised(request); const result = sites.find((entry) => entry.id === siteId && entry.companyId === owner.companyId);
    if (!result) throw new Error("FIXTURE_SITE_NOT_FOUND"); return result;
  }
  function system(request: FixtureScope, siteId: string, systemId: string) {
    site(request, siteId); const result = systems.find((entry) => entry.id === systemId && entry.siteId === siteId && entry.companyId === owner.companyId);
    if (!result) throw new Error("FIXTURE_SYSTEM_NOT_FOUND"); return result;
  }
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  return {
    listSites(request: FixtureScope) { authorised(request); return copy(sites); },
    listSystems(request: FixtureScope, siteId: string) { site(request, siteId); return copy(systems.filter((entry) => entry.companyId === owner.companyId && entry.siteId === siteId)); },
    getSystem(request: FixtureScope, siteId: string, systemId: string) { return copy(system(request, siteId, systemId)); },
    listDevices(request: FixtureScope, siteId: string, systemId: string, filters: AlarmFilters) {
      const panel = system(request, siteId, systemId);
      if (filters.loopId !== null && !panel.loops.some(({ id }) => id === filters.loopId)) throw new Error("INVALID_LOOP_FILTER");
      if (filters.zoneId !== null && !panel.zones.some(({ id }) => id === filters.zoneId)) throw new Error("INVALID_ZONE_FILTER");
      return copy(devices.filter((entry) => entry.companyId === owner.companyId && entry.siteId === siteId && entry.systemId === systemId
        && (filters.loopId === null || entry.loopId === filters.loopId) && (filters.zoneId === null || entry.zoneId === filters.zoneId)));
    },
  };
}
