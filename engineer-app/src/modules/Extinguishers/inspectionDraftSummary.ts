import type { LocalNotesDraft } from "../../services/localInspectionDraftStore";

export function inspectionDraftSummary(draft: LocalNotesDraft) {
  const serviceType = draft.localSchemaVersion === 3 ? draft.servicing.serviceType : null;
  return { createdAtMs: draft.createdAtMs,
    label: serviceType === "annual-basic" ? "Annual Basic Service" : serviceType === "monthly-visual" ? "Monthly Visual Inspection" : "Inspection Draft",
    checks: draft.localSchemaVersion === 3 ? draft.servicing.answers.length : 0 };
}
