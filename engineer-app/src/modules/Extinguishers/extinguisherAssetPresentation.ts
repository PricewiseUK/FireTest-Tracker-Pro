import type { createLocalInspectionDraftStore } from "../../services/localInspectionDraftStore";
import { canStartInspection } from "./approvedInspectionAsset.ts";
export const NOT_RECORDED = "Not Recorded";
export type DeviceProgress = { known: boolean; assetIds: string[]; recoveryAssetIds: string[] };
export const UNKNOWN_PROGRESS: DeviceProgress = { known: false, assetIds: [], recoveryAssetIds: [] };
function recorded(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
export function assetCardDetails(asset: Record<string, unknown>) {
  const capacity = recorded(asset.capacity); const unit = recorded(asset.capacityUnit);
  const reference = recorded(asset.assetId) || `${recorded(asset.assetPrefix)}${recorded(asset.assetNumber)}` || recorded(asset.id) || NOT_RECORDED;
  return { reference, type: recorded(asset.type) || NOT_RECORDED, location: recorded(asset.location) || NOT_RECORDED,
    capacity: !capacity ? NOT_RECORDED : unit ? (capacity.endsWith(unit) ? capacity : `${capacity} ${unit}`)
      : /^\d+(?:\.\d+)?$/.test(capacity) ? `${capacity} (unit Not Recorded)` : capacity,
    manufacturer: recorded(asset.manufacturer) || recorded(asset.make) || NOT_RECORDED,
    model: recorded(asset.model) || recorded(asset.modelNumber) || NOT_RECORDED,
    // No verified-service summary or current-job completion contract exists yet.
    // Ignore ad-hoc asset flags/dates and never turn local answers into a pass.
    lastVerifiedServiceDate: NOT_RECORDED, lastVerifiedServiceResult: NOT_RECORDED };
}
export function inspectionStatus(assetDocId: string, progress: DeviceProgress) {
  if (!progress.known) return { label: "Status Unavailable", detail: "Device drafts not confirmed", inProgress: false };
  const inProgress = progress.assetIds.includes(assetDocId);
  return { label: inProgress ? "In Progress" : "Not Started", inProgress,
    detail: progress.recoveryAssetIds.includes(assetDocId) ? "Device draft · Recovery review needed" : inProgress ? "Saved on this device · Not submitted" : "No draft on this device" };
}
export function siteDeviceProgress(assets: { id: string }[], progress: DeviceProgress) {
  const ids = new Set(assets.map((asset) => asset.id));
  const started = progress.known ? [...ids].filter((id) => progress.assetIds.includes(id)).length : null;
  return { total: ids.size, inProgress: started, notStarted: started === null ? null : ids.size - started };
}
export async function readAssetDeviceProgress(store: ReturnType<typeof createLocalInspectionDraftStore>, scope: {
  companyId: string; siteId: string; userId: string; role: string; assignedSites: readonly string[];
}): Promise<DeviceProgress> {
  if (!canStartInspection(scope.role, scope.assignedSites, scope.siteId)) throw new Error("INSPECTION_ACCESS_REQUIRED");
  const site = store.forSite(scope.companyId, scope.siteId);
  const records = await site.list(); site.assertCurrentSession();
  const assetIds = new Set<string>(); const recovery = new Set<string>();
  for (const { draft, canEdit } of records) {
    if (draft.companyId !== scope.companyId || draft.siteId !== scope.siteId || draft.userId !== scope.userId) throw new Error("DRAFT_SCOPE_MISMATCH");
    assetIds.add(draft.assetDocId); if (!canEdit) recovery.add(draft.assetDocId);
  }
  return { known: true, assetIds: [...assetIds], recoveryAssetIds: [...recovery] };
}
