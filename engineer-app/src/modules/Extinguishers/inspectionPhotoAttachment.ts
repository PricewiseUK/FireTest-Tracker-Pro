import type { createInspectionNotesController } from "./inspectionNotesController";
type Controller = ReturnType<typeof createInspectionNotesController>;
export type PhotoScope = { projectId: string; userId: string; companyId: string; siteId: string; inspectionId: string };
export interface InspectionPhotoAdapter {
  pick(): Promise<string | null>;
  copy(source: string, scope: PhotoScope, id: string): Promise<string>;
  id(): string;
}
/** Keep files if a draft write fails; its reference stays in the retryable editor. */
export async function attachInspectionPhoto(controller: Controller, questionId: string, adapter: InspectionPhotoAdapter) {
  const initial = controller.getState(); const draft = initial.draft;
  if (!controller.isCurrentSession() || !draft || initial.recovery) throw new Error("PHOTO_SESSION_UNAVAILABLE");
  const active = () => controller.isCurrentSession() && controller.getState().draft?.inspectionId === draft.inspectionId && !controller.getState().recovery;
  const source = await adapter.pick();
  if (!source) return;
  if (!active()) throw new Error("PHOTO_SESSION_CHANGED");
  const answer = controller.getState().servicing.answers.find((entry) => entry.questionId === questionId);
  if (answer?.result !== "fail" || controller.getState().servicing.evidence.length >= 30) throw new Error("PHOTO_CHECK_UNAVAILABLE");
  const id = adapter.id();
  const reference = await adapter.copy(source, { projectId: draft.projectId, userId: draft.userId, companyId: draft.companyId, siteId: draft.siteId, inspectionId: draft.inspectionId }, id);
  if (!active()) throw new Error("PHOTO_SESSION_CHANGED");
  const latest = controller.getState().servicing;
  if (latest.evidence.length >= 30) throw new Error("PHOTO_EVIDENCE_LIMIT");
  controller.changeServicing({ ...latest, evidence: [...latest.evidence, { id, reference, notes: `Question ${questionId}: local photograph` }] });
  if (!await controller.save()) throw new Error("PHOTO_DRAFT_SAVE_FAILED");
}
