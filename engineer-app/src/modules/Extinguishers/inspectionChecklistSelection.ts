import type { LocalNotesDraft, NotesSeed } from "../../services/localInspectionDraftStore";
import { pendingRoutineChecklist, routineMediumFor, type RoutineInspectionKind } from "./pendingRoutineChecklist.ts";
import { attachPendingRoutineChecklist, emptyServicingDraft, classificationIssue, validateServicingDraft, type ServicingDraft } from "./servicingDraft.ts";

/** Choose only on an unattached draft; never retemplate saved answers. */
export function planRoutineInspection(value: ServicingDraft, assetType: string, kind: RoutineInspectionKind, gaugePresent?: boolean): ServicingDraft {
  validateServicingDraft(value);
  if (value.checklist) throw new Error("CHECKLIST_ALREADY_ATTACHED_PRESERVE_EXISTING_ANSWERS");
  const medium = routineMediumFor(assetType);
  if (!medium || classificationIssue(assetType, value.equipmentClass)) throw new Error("EQUIPMENT_IDENTIFICATION_REQUIRED");
  const equipmentClass = medium === "co2" ? "co2" : medium === "powder" ? "powder" : "water-based";
  if (value.equipmentClass !== "unconfirmed" && value.equipmentClass !== equipmentClass) throw new Error("EQUIPMENT_IDENTIFICATION_REQUIRED");
  const planned: ServicingDraft = { ...value, equipmentClass, serviceType: kind };
  validateServicingDraft(planned);
  // Unknown configuration stays an explicit, durable plan until confirmed.
  return typeof gaugePresent === "boolean" ? attachPendingRoutineChecklist(planned, medium, gaugePresent) : planned;
}

export function routineServicingForAsset(asset: NotesSeed, gaugePresent: boolean, kind: RoutineInspectionKind = "annual-basic") {
  const medium = routineMediumFor(asset.equipmentType);
  if (!medium) throw new Error("EQUIPMENT_IDENTIFICATION_REQUIRED");
  const definition = pendingRoutineChecklist(medium, gaugePresent, 3, kind);
  return attachPendingRoutineChecklist({ ...emptyServicingDraft(), equipmentClass: definition.equipmentClass, serviceType: kind }, medium, gaugePresent);
}
export function isDevelopmentWaterDemo(draft: LocalNotesDraft | null, asset: NotesSeed) {
  return asset.assetReference === "TEST-EXT001" && routineMediumFor(asset.equipmentType) === "water"
    && draft?.assetReference === "TEST-EXT001" && routineMediumFor(draft.equipmentType) === "water"
    && draft.assetDocId === asset.assetDocId && draft.localSchemaVersion === 3
    && draft.servicing.checklist?.approval.status === "demonstration" && draft.servicing.answers.length === 3;
}

/** Only known obsolete annual snapshots on the explicitly named development asset. */
export function isDevelopmentWaterChecklistOutdated(draft: LocalNotesDraft | null, asset: NotesSeed) {
  if (isDevelopmentWaterDemo(draft, asset)) return true;
  if (asset.assetReference !== "TEST-EXT001" || routineMediumFor(asset.equipmentType) !== "water"
    || draft?.assetReference !== "TEST-EXT001" || routineMediumFor(draft.equipmentType) !== "water"
    || draft.assetDocId !== asset.assetDocId || draft.localSchemaVersion !== 3) return false;
  const template = draft.servicing.checklist;
  return template?.approval.status === "pending-technical-validation" && "equipmentMedium" in template && "gaugePresent" in template && template.serviceType === "annual-basic"
    && draft.servicing.serviceType === "annual-basic" && template.equipmentMedium === "water"
    && [1, 2].includes(template.version) && draft.servicing.answers.length === 8
    && JSON.stringify(template) === JSON.stringify(pendingRoutineChecklist("water", template.gaugePresent, template.version));
}
