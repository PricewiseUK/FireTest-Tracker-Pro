import { pendingRoutineChecklist, type PendingRoutineChecklist, type RoutineMedium } from "./pendingRoutineChecklist.ts";
/** Local planning/recording model, not a declaration of BS compliance. */
export type EquipmentClass = "unconfirmed" | "water-based" | "powder" | "primary-sealed-powder" | "co2" | "other";
export type ServiceType = "commissioning" | "monthly-visual" | "annual-basic" | "extended" | "co2-overhaul";
/** Device-only servicing drafts; independent of the unchanged server limit. */
export const MAX_LOCAL_SERVICING_QUESTIONS = 64;
export interface ApprovedChecklist {
  id: string; version: number; equipmentClass: EquipmentClass; serviceType: ServiceType;
  approval: { status: "approved"; approvedBy: string; approvedAt: string; source: string };
  questions: { id: string; prompt: string; allowNA: boolean }[];
}
/** Local UI exercise only; never accepted as a technically approved definition. */
export interface DemonstrationChecklist extends Omit<ApprovedChecklist, "approval"> {
  approval: { status: "demonstration"; approvedBy: string; approvedAt: string; source: string };
}
export interface ServicingDraft {
  schemaVersion: 1;
  equipmentClass: EquipmentClass;
  serviceType: ServiceType | null;
  checklist: ApprovedChecklist | DemonstrationChecklist | PendingRoutineChecklist | null;
  answers: { questionId: string; result: "pass" | "fail" | "na" | null; notes: string; correctiveAction: string }[];
  defectStatus: "not-assessed" | "none-reported" | "open" | "rectified" | "referred";
  defects: { id: string; description: string; correctiveAction: string; status: "open" | "rectified" | "referred" }[];
  evidence: { id: string; reference: string; notes: string }[];
}
/** No formally approved definitions were supplied; do not populate with invented checks. */
export const APPROVED_SERVICE_CHECKLISTS: readonly ApprovedChecklist[] = [];
export function emptyServicingDraft(): ServicingDraft {
  return { schemaVersion: 1, equipmentClass: "unconfirmed", serviceType: null, checklist: null, answers: [], defectStatus: "not-assessed", defects: [], evidence: [] };
}
export function serviceTypesFor(equipment: EquipmentClass): ServiceType[] {
  if (equipment === "unconfirmed" || equipment === "other") return [];
  return equipment === "co2" ? ["commissioning", "monthly-visual", "annual-basic", "co2-overhaul"] : ["commissioning", "monthly-visual", "annual-basic", "extended"];
}
/** Data discrepancy flag only, not automatic classification or a service recommendation. */
export function classificationIssue(assetType: string, chosen: EquipmentClass): string | null {
  const type = assetType.toLowerCase().replaceAll("₂", "2").replace(/[^a-z0-9]/g, "");
  const known: Record<string, EquipmentClass[]> = {
    water: ["water-based"], foam: ["water-based"], wetchemical: ["water-based"], watermist: ["water-based"],
    drypowder: ["powder", "primary-sealed-powder"], powder: ["powder", "primary-sealed-powder"], co2: ["co2"], carbondioxide: ["co2"],
  };
  return chosen !== "unconfirmed" && chosen !== "other" && known[type] && !known[type].includes(chosen)
    ? "Classification differs from the approved asset type. Verify the label and arrange a separate asset correction before servicing." : null;
}
function check(value: unknown, message = "INVALID_SERVICING_DRAFT"): asserts value { if (!value) throw new Error(message); }
function keys(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value));
  check(Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name)));
}
function text(value: unknown, limit: number, empty = true): asserts value is string { check(typeof value === "string" && value.length <= limit && (empty || value.trim().length > 0)); }
function unique(items: { id: string }[]) { check(new Set(items.map((item) => item.id)).size === items.length); }
export function validateServicingDraft(value: ServicingDraft) {
  keys(value, ["schemaVersion", "equipmentClass", "serviceType", "checklist", "answers", "defectStatus", "defects", "evidence"]);
  check(value.schemaVersion === 1 && ["unconfirmed", "water-based", "powder", "primary-sealed-powder", "co2", "other"].includes(value.equipmentClass));
  check(value.serviceType === null || serviceTypesFor(value.equipmentClass).includes(value.serviceType));
  check(["not-assessed", "none-reported", "open", "rectified", "referred"].includes(value.defectStatus));
  check(Array.isArray(value.answers) && value.answers.length <= MAX_LOCAL_SERVICING_QUESTIONS, "CHECKLIST_EXCEEDS_LOCAL_STORAGE_LIMIT");
  if (value.checklist === null) check(value.answers.length === 0);
  else {
    const template = value.checklist;
    keys(template, ["id", "version", "equipmentClass", "serviceType", "approval", "questions", ...(template.approval?.status === "pending-technical-validation" ? ["equipmentMedium", "gaugePresent"] : [])]);
    text(template.id, 1500, false); check(Number.isSafeInteger(template.version) && template.version >= 1);
    check(template.equipmentClass === value.equipmentClass && template.serviceType === value.serviceType);
    keys(template.approval, ["status", "approvedBy", "approvedAt", "source"]);
    check(["approved", "demonstration", "pending-technical-validation"].includes(template.approval.status));
    if (template.approval.status === "pending-technical-validation") {
      const candidate = template as PendingRoutineChecklist;
      check(candidate.serviceType === "monthly-visual" || candidate.serviceType === "annual-basic");
      check(JSON.stringify(candidate) === JSON.stringify(pendingRoutineChecklist(candidate.equipmentMedium, candidate.gaugePresent, candidate.version, candidate.serviceType)));
    }
    if (template.approval.status === "demonstration") {
      // Only our exact labelled exercise can enter this local-only branch.
      check(JSON.stringify(template) === JSON.stringify(demonstrationChecklist(value.equipmentClass, value.serviceType!)));
    }
    text(template.approval.approvedBy, 200, false); text(template.approval.source, 1000, false);
    text(template.approval.approvedAt, 40, false); check(Number.isFinite(Date.parse(template.approval.approvedAt)));
    check(Array.isArray(template.questions) && template.questions.length >= 1 && template.questions.length <= MAX_LOCAL_SERVICING_QUESTIONS, "CHECKLIST_EXCEEDS_LOCAL_STORAGE_LIMIT");
    unique(template.questions); check(value.answers.length === template.questions.length);
    template.questions.forEach((question, index) => {
      keys(question, ["id", "prompt", "allowNA"]); text(question.id, 100, false); text(question.prompt, 2000, false); check(typeof question.allowNA === "boolean");
      const answer = value.answers[index]; keys(answer, ["questionId", "result", "notes", "correctiveAction"]);
      check(answer.questionId === question.id && [null, "pass", "fail", "na"].includes(answer.result));
      // Local N/A is a one-tap observation; legacy allowNA metadata is preserved.
      // This does not change server validation or enable submission.
      text(answer.notes, 2000); text(answer.correctiveAction, 2000);
    });
  }
  check(Array.isArray(value.defects) && value.defects.length <= 30 && Array.isArray(value.evidence) && value.evidence.length <= 30);
  unique(value.defects); unique(value.evidence);
  for (const defect of value.defects) {
    keys(defect, ["id", "description", "correctiveAction", "status"]); text(defect.id, 100, false); text(defect.description, 2000); text(defect.correctiveAction, 2000);
    check(["open", "rectified", "referred"].includes(defect.status));
  }
  for (const evidence of value.evidence) {
    keys(evidence, ["id", "reference", "notes"]); text(evidence.id, 100, false); text(evidence.reference, 1000); text(evidence.notes, 2000);
  }
}
export function attachApprovedChecklist(draft: ServicingDraft, template: ApprovedChecklist): ServicingDraft {
  check(template.approval.status === "approved", "TECHNICALLY_APPROVED_CHECKLIST_REQUIRED");
  return attachChecklist(draft, template);
}
function attachChecklist(draft: ServicingDraft, template: ApprovedChecklist | DemonstrationChecklist | PendingRoutineChecklist): ServicingDraft {
  check(draft.checklist === null, "CHECKLIST_ALREADY_ATTACHED_PRESERVE_EXISTING_ANSWERS");
  const next = { ...draft, checklist: JSON.parse(JSON.stringify(template)), answers: template.questions.map(({ id }) => ({ questionId: id, result: null, notes: "", correctiveAction: "" })) };
  validateServicingDraft(next); return next;
}
export function attachPendingRoutineChecklist(draft: ServicingDraft, medium: RoutineMedium, gaugePresent: boolean): ServicingDraft {
  check(draft.serviceType === "monthly-visual" || draft.serviceType === "annual-basic", "CONFIRMED_SERVICE_INTENT_REQUIRED");
  const template = pendingRoutineChecklist(medium, gaugePresent, 3, draft.serviceType);
  // Explicit attachment only; do not reclassify saved work or infer from capacity.
  check(draft.equipmentClass === template.equipmentClass, "CONFIRMED_SERVICE_INTENT_REQUIRED");
  return attachChecklist(draft, template);
}
export function demonstrationChecklist(equipmentClass: EquipmentClass, serviceType: ServiceType): DemonstrationChecklist {
  check(serviceTypesFor(equipmentClass).includes(serviceType), "CONFIRMED_SERVICE_INTENT_REQUIRED");
  return { id: `DEMO-UI-${equipmentClass}-${serviceType}`, version: 1, equipmentClass, serviceType,
    approval: { status: "demonstration", approvedBy: "NOT TECHNICALLY APPROVED", approvedAt: "2026-11-01T00:00:00Z", source: "UI demonstration only. No BS 5306 servicing guidance or certification." },
    questions: [
      { id: "demo-result", prompt: "DEMO ONLY: Can you record a sample PASS or FAIL?", allowNA: false },
      { id: "demo-defect", prompt: "DEMO ONLY: Can you record a sample outcome and explain any FAIL?", allowNA: false },
      { id: "demo-optional", prompt: "DEMO ONLY: Does this sample optional check apply?", allowNA: true },
    ] };
}
export function attachDemonstrationChecklist(draft: ServicingDraft): ServicingDraft {
  check(draft.serviceType !== null, "CONFIRMED_SERVICE_INTENT_REQUIRED");
  return attachChecklist(draft, demonstrationChecklist(draft.equipmentClass, draft.serviceType));
}
export function changeChecklistAnswer(draft: ServicingDraft, questionId: string, patch: Partial<ServicingDraft["answers"][number]>): ServicingDraft {
  validateServicingDraft(draft);
  check(draft.answers.some((answer) => answer.questionId === questionId), "UNKNOWN_QUESTION");
  // Changing a result keeps earlier notes/actions; nothing is silently discarded.
  const next = { ...draft, answers: draft.answers.map((answer) => answer.questionId === questionId ? { ...answer, ...patch, questionId } : answer) };
  validateServicingDraft(next); return next;
}
export function checklistAnswerComplete(answer: ServicingDraft["answers"][number]): boolean {
  return answer.result === "pass" || answer.result === "na"
    || (answer.result === "fail" && !!answer.notes.trim());
}
export function servicingProgress(draft: ServicingDraft) {
  validateServicingDraft(draft);
  const answered = draft.answers.filter((answer) => answer.result !== null).length;
  const issues: string[] = [];
  if (!draft.checklist) issues.push("Technically approved checklist required");
  if (draft.checklist?.approval.status === "demonstration") issues.push("Demonstration only — not a servicing inspection or certification");
  if (draft.checklist?.approval.status === "pending-technical-validation") issues.push("Pending technical validation — not an approved or certified checklist");
  if (answered !== draft.answers.length) issues.push("Unanswered questions remain");
  if (draft.answers.some((answer) => answer.result === "fail" && !answer.notes.trim())) issues.push("Failed checks need a reason");
  return { answered, complete: draft.answers.filter(checklistAnswerComplete).length,
    failed: draft.answers.filter((answer) => answer.result === "fail").length,
    failedWithoutReason: draft.answers.filter((answer) => answer.result === "fail" && !answer.notes.trim()).length,
    outstanding: draft.answers.filter((answer) => !checklistAnswerComplete(answer)).length,
    total: draft.answers.length, issues, submissionEnabled: false as const };
}
