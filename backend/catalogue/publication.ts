import { createHash } from "node:crypto";

// Server-only policy. No endpoint, credentials, Admin SDK initialisation or mobile import.
export const CATALOGUE_KINDS = ["fire-alarm-panels", "fire-extinguishers", "emergency-lights", "fire-doors", "fire-blankets"] as const;
type RecordData = Record<string, unknown>;
export interface CatalogueTransaction {
  get(path: string): Promise<RecordData | null>;
  /** Adapter MUST use an atomic create-only precondition, never an upsert. */
  create(path: string, data: RecordData): void;
}
export interface CataloguePublicationBackend {
  /** Server-owned request authentication; never accept an input uid/role as proof. */
  verifyCaller(): Promise<{ uid: string } | null>;
  runTransaction<T>(operation: (tx: CatalogueTransaction) => Promise<T>): Promise<T>;
  serverTimestamp(): unknown;
}
function requireValue(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
function exact(value: unknown, fields: string[]): asserts value is RecordData {
  requireValue(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key)), "INVALID_PUBLICATION");
}
function identifier(value: unknown): asserts value is string {
  requireValue(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value), "INVALID_CATALOGUE_ID");
}
function text(value: unknown, max: number): asserts value is string {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max, "INVALID_PUBLICATION");
}
/** Stable map order for persisted definitions (Admin SDK need not preserve insertion order). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as RecordData)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Requires a trusted transactional adapter and verified caller; intentionally not deployed. */
export function createCataloguePublisher(backend: CataloguePublicationBackend) {
  return {
    async publish(input: unknown) {
      const caller = await backend.verifyCaller();
      requireValue(caller && typeof caller.uid === "string" && caller.uid.length > 0 && caller.uid.length <= 128
        && !caller.uid.includes("/"), "PUBLISHER_AUTH_REQUIRED");
      exact(input, ["kind", "modelId", "versionId", "definition"]);
      requireValue(CATALOGUE_KINDS.includes(input.kind as typeof CATALOGUE_KINDS[number]), "INVALID_CATALOGUE_KIND");
      identifier(input.modelId); identifier(input.versionId);
      const hasCapabilities = !!input.definition && typeof input.definition === "object" && Object.hasOwn(input.definition, "configurationCapabilities");
      exact(input.definition, ["manufacturer", "modelDesignation", "sourceReferences", ...(hasCapabilities ? ["configurationCapabilities"] : [])]);
      text(input.definition.manufacturer, 200); text(input.definition.modelDesignation, 200);
      requireValue(Array.isArray(input.definition.sourceReferences) && input.definition.sourceReferences.length > 0
        && input.definition.sourceReferences.length <= 10, "INVALID_PUBLICATION");
      input.definition.sourceReferences.forEach((source) => text(source, 1000));
      let capabilities: RecordData | undefined;
      if (hasCapabilities) {
        requireValue(input.kind === "fire-alarm-panels", "INVALID_CAPABILITY_KIND");
        input.definition.sourceReferences.forEach((source) => {
          let url: URL;
          try { url = new URL(source); } catch { throw new Error("INVALID_SOURCE_REFERENCE"); }
          requireValue(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "INVALID_SOURCE_REFERENCE");
        });
        const data = input.definition.configurationCapabilities;
        exact(data, ["schemaVersion", "scope", "loopCount", "zones", "deviceAddressFormat", "networking"]);
        requireValue(data.schemaVersion === 1 && data.scope === "model-family" && data.loopCount === "variant-dependent"
          && data.zones === "site-configured" && data.deviceAddressFormat === "protocol-and-site-dependent"
          && data.networking === "optional-hardware-dependent", "INVALID_CONFIGURATION_CAPABILITIES");
        capabilities = { schemaVersion: 1, scope: data.scope, loopCount: data.loopCount, zones: data.zones,
          deviceAddressFormat: data.deviceAddressFormat, networking: data.networking };
      }
      // Fixed shape, captured before transactional I/O. No private asset fields or complete
      // servicing checklists are accepted by this deliberately narrow foundation.
      const content = { schemaVersion: hasCapabilities ? 2 : 1, kind: input.kind, modelId: input.modelId, versionId: input.versionId,
        definition: { manufacturer: input.definition.manufacturer, modelDesignation: input.definition.modelDesignation,
          sourceReferences: [...input.definition.sourceReferences], ...(capabilities ? { configurationCapabilities: capabilities } : {}) } };
      // Keep schema-1 hashes reproducible; only the new schema uses canonical hashing.
      const contentHash = createHash("sha256").update(hasCapabilities ? canonical(content) : JSON.stringify(content)).digest("hex");
      const modelPath = `equipmentCatalogue/${content.kind}/models/${content.modelId}`;
      const versionPath = `${modelPath}/versions/${content.versionId}`;
      const availabilityPath = `${modelPath}/versionAvailability/${content.versionId}`;
      const auditPath = `cataloguePublicationAudit/${createHash("sha256").update(versionPath).digest("hex")}`;
      return backend.runTransaction(async (tx) => {
        const grant = await tx.get(`cataloguePublishers/${caller.uid}`);
        requireValue(grant?.schemaVersion === 1 && grant.enabled === true && grant.publishVersions === true, "CATALOGUE_PUBLICATION_FORBIDDEN");
        const model = await tx.get(modelPath);
        requireValue(model?.publicationState === "published" && model.kind === content.kind, "PUBLISHED_MODEL_REQUIRED");
        const existing = await tx.get(versionPath);
        const availability = await tx.get(availabilityPath);
        const audit = await tx.get(auditPath);
        if (existing) {
          // Lost-ack retries return the original record, never mutate it or its
          // availability (including a later withdrawal). Hash alone is not proof.
          requireValue(existing.schemaVersion === content.schemaVersion && existing.contentHash === contentHash && existing.publicationState === "published"
            && canonical(existing.definition) === canonical(content.definition)
            && existing.kind === content.kind && existing.modelId === content.modelId && existing.versionId === content.versionId
            && audit !== null && audit.schemaVersion === 1 && audit.contentHash === contentHash && audit.versionPath === versionPath
            && availability !== null && availability.schemaVersion === 1 && availability.publicationState === "published"
            && ["active", "withdrawn"].includes(availability.state as string),
          "IMMUTABLE_VERSION_CONFLICT");
          return { versionPath, contentHash, created: false };
        }
        requireValue(availability === null && audit === null, "PUBLICATION_STATE_CONFLICT");
        const timestamp = backend.serverTimestamp();
        tx.create(versionPath, { ...content, publicationState: "published", contentHash, publishedAt: timestamp });
        tx.create(availabilityPath, { schemaVersion: 1, publicationState: "published", state: "active" });
        tx.create(auditPath, { schemaVersion: 1, versionPath, contentHash, publishedBy: caller.uid, publishedAt: timestamp });
        return { versionPath, contentHash, created: true };
      });
    },
  };
}
