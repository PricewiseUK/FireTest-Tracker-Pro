import type { NotesSeed } from "../../services/localInspectionDraftStore";

function display(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
/** Only an explicit boolean on the approved asset is a known gauge configuration. */
export function approvedGaugePresence(data: Record<string, unknown>): boolean | undefined {
  return typeof data.gaugePresent === "boolean" ? data.gaugePresent : undefined;
}
export function approvedInspectionAsset(companyId: string, siteId: string, snapshot: {
  id: string; path: string; exists: boolean; data: Record<string, unknown>;
}): NotesSeed {
  if (!snapshot.exists || snapshot.path !== `companies/${companyId}/sites/${siteId}/extinguishers/${snapshot.id}`
    || ![undefined, "approved", "active"].includes(snapshot.data.status as string | undefined)) {
    throw new Error("APPROVED_ASSET_REQUIRED");
  }
  const data = snapshot.data;
  const reference = display(data.assetId) || `${display(data.assetPrefix)}${display(data.assetNumber)}` || snapshot.id;
  const capacity = display(data.capacity);
  const unit = display(data.capacityUnit);
  return { assetDocId: snapshot.id, assetReference: reference, equipmentType: display(data.type),
    assetLocation: display(data.location), assetCapacity: capacity && unit && !capacity.endsWith(unit) ? `${capacity} ${unit}` : capacity };
}

export function canStartInspection(role: string, assignedSites: readonly string[], siteId: string) {
  return role === "engineer" || (role === "senior_engineer" && assignedSites.includes(siteId));
}
