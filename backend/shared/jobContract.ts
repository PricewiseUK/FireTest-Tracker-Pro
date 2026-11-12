/** Pure shared contract. Imported by mobile and backend; no Firebase/Admin imports.
 * Times are UTC integer epoch milliseconds; server event times are authoritative. */
export type WorkStatus = 'scheduled' | 'in_progress' | 'completed';
export type ReviewStatus = 'not_submitted' | 'submitted' | 'approved' | 'changes_requested';
export type InspectionType = 'extinguisher-monthly-visual' | 'extinguisher-annual-basic';
export type Outcome = 'pass' | 'fail' | 'na';
export type JobSnapshot = { name: string; reference: string };
export type PlannedAsset = { assetDocId: string; templateId: string; templateVersion: number };
export type CompletedAsset = PlannedAsset & {
  assetSnapshot: { type: string; assetReference: string; location: string };
  answers: { questionId: string; result: Outcome; notes: string; correctiveAction: string }[];
  defects: { id: string; description: string; correctiveAction: string; status: 'open' | 'rectified' | 'referred' }[];
  notes: string;
};
export type CompletionTotals = { totalAssets: number; pass: number; fail: number; na: number; defectCount: number };
export type CompletionRequest = {
  schemaVersion: 1; companyId: string; siteId: string; jobId: string; completionId: string; engineerUid: string;
  expectedRevision: number; inspectionType: InspectionType; assets: CompletedAsset[]; totals: CompletionTotals; notes: string;
};
export type CompletionSummary = CompletionTotals & {
  engineerUid: string; engineerName: string; customer: JobSnapshot; site: JobSnapshot;
  inspectionType: InspectionType; completedAt: number; inspectionRef: string;
};
export type CompletionReceipt = {
  schemaVersion: 1; companyId: string; siteId: string; jobId: string; completionId: string;
  engineerUid: string; inspectionRef: string; completedAt: number; jobRevision: number; payloadHash: string; totals: CompletionTotals;
};
export type JobV1 = {
  schemaVersion: 1; companyId: string; siteId: string; customer: JobSnapshot; site: JobSnapshot;
  inspectionType: InspectionType; assignedEngineerUid: string; scheduledStart: number; scheduledEnd: number;
  workStatus: WorkStatus; reviewStatus: ReviewStatus; assets: PlannedAsset[];
  inspectionRef: string | null; completionSummary: CompletionSummary | null;
  revision: number; createdAt: number; updatedAt: number; startedAt: number | null; completedAt: number | null;
};
export class JobError extends Error {
  code: 'invalid-argument' | 'permission-denied' | 'failed-precondition' | 'already-exists' | 'not-found';
  constructor(code: JobError['code'], message: string) { super(message); this.code = code; }
}
export function ensure(value: unknown, message: string, code: JobError['code'] = 'invalid-argument'): asserts value {
  if (!value) throw new JobError(code, message);
}
export function jobId(value: unknown): asserts value is string {
  ensure(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value), 'Invalid job reference.');
}
function shape(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  ensure(!!value && typeof value === 'object' && !Array.isArray(value), 'Invalid completion data.');
  ensure(Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), 'Unsupported completion fields. Photographs and activity history cannot be submitted.');
}
function text(value: unknown, max: number, required = false): asserts value is string {
  ensure(typeof value === 'string' && value.length <= max && (!required || !!value.trim()), 'Invalid inspection text.');
}
export function validRevision(value: unknown): asserts value is number {
  ensure(Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) < 1000000000, 'Invalid job revision.');
}
export function inspectionType(value: unknown): asserts value is InspectionType {
  ensure(value === 'extinguisher-monthly-visual' || value === 'extinguisher-annual-basic', 'Unsupported inspection type.');
}
export const serviceType = (type: InspectionType) => type === 'extinguisher-monthly-visual' ? 'monthly-visual' : 'annual-basic';
export function validatePlannedAssets(assets: unknown): asserts assets is PlannedAsset[] {
  ensure(Array.isArray(assets) && assets.length > 0 && assets.length <= 25, 'A job must contain between one and 25 assets.');
  const ids = new Set();
  for (const asset of assets) {
    ensure(asset && typeof asset === 'object' && !Array.isArray(asset), 'Invalid assigned asset.');
    jobId(asset.assetDocId); jobId(asset.templateId); validRevision(asset.templateVersion);
    ensure(!ids.has(asset.assetDocId), 'Duplicate asset.'); ids.add(asset.assetDocId);
  }
}
export function validateJob(value: unknown): asserts value is JobV1 {
  shape(value, ['schemaVersion','companyId','siteId','customer','site','inspectionType','assignedEngineerUid','scheduledStart','scheduledEnd','workStatus','reviewStatus','assets','inspectionRef','completionSummary','revision','createdAt','updatedAt','startedAt','completedAt']);
  ensure(value.schemaVersion === 1, 'Unsupported job version.');
  jobId(value.companyId); jobId(value.siteId); jobId(value.assignedEngineerUid); inspectionType(value.inspectionType); validRevision(value.revision);
  for (const snapshot of [value.customer, value.site]) { shape(snapshot, ['name','reference']); text(snapshot.name, 200, true); text(snapshot.reference, 128); }
  for (const timestamp of [value.scheduledStart, value.scheduledEnd, value.createdAt, value.updatedAt]) ensure(Number.isSafeInteger(timestamp) && Number(timestamp) > 0, 'Invalid job timestamp.');
  ensure(Number(value.scheduledEnd) >= Number(value.scheduledStart), 'Invalid scheduled interval.');
  ensure(['scheduled','in_progress','completed'].includes(String(value.workStatus)) && ['not_submitted','submitted','approved','changes_requested'].includes(String(value.reviewStatus)), 'Invalid job status.');
  validatePlannedAssets(value.assets);
  for (const asset of value.assets) shape(asset, ['assetDocId','templateId','templateVersion']);
  ensure(value.startedAt === null || (Number.isSafeInteger(value.startedAt) && Number(value.startedAt) > 0), 'Invalid start timestamp.');
  if (value.workStatus !== 'completed') ensure(value.reviewStatus === 'not_submitted' && value.completedAt === null && value.inspectionRef === null && value.completionSummary === null, 'Unfinished work cannot have a completion or review.');
  else ensure(Number.isSafeInteger(value.completedAt) && Number(value.completedAt) > 0 && typeof value.inspectionRef === 'string' && !!value.completionSummary, 'Completed job requires its synchronised result.');
}
export function canTransition(from: WorkStatus, to: WorkStatus) {
  return (from === 'scheduled' && (to === 'in_progress' || to === 'completed')) || (from === 'in_progress' && to === 'completed');
}
export function totalsFor(assets: CompletedAsset[]): CompletionTotals {
  const totals = { totalAssets: assets.length, pass: 0, fail: 0, na: 0, defectCount: 0 };
  for (const asset of assets) { for (const answer of asset.answers) totals[answer.result]++; totals.defectCount += asset.defects.length; }
  return totals;
}
/** Stable object-key ordering; array order is part of immutable operation identity. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateCompletion(value: unknown): asserts value is CompletionRequest {
  shape(value, ['schemaVersion','companyId','siteId','jobId','completionId','engineerUid','expectedRevision','inspectionType','assets','totals','notes']);
  ensure(value.schemaVersion === 1, 'Unsupported completion version.');
  for (const key of ['companyId','siteId','jobId','completionId','engineerUid']) jobId(value[key]);
  validRevision(value.expectedRevision); inspectionType(value.inspectionType); text(value.notes, 8000);
  validatePlannedAssets(value.assets);
  let answers = 0;
  for (const asset of value.assets as CompletedAsset[]) {
    shape(asset, ['assetDocId','templateId','templateVersion','assetSnapshot','answers','defects','notes']); text(asset.notes, 8000);
    shape(asset.assetSnapshot, ['type','assetReference','location']); text(asset.assetSnapshot.type, 100, true); text(asset.assetSnapshot.assetReference, 1500, true); text(asset.assetSnapshot.location, 200);
    ensure(Array.isArray(asset.answers) && asset.answers.length > 0 && asset.answers.length <= 64, 'Each asset requires complete results.');
    const questionIds = new Set();
    for (const answer of asset.answers) {
      shape(answer, ['questionId','result','notes','correctiveAction']); jobId(answer.questionId);
      ensure(!questionIds.has(answer.questionId), 'Duplicate question.'); questionIds.add(answer.questionId);
      ensure(['pass','fail','na'].includes(answer.result), 'Every check must have a recorded outcome.');
      text(answer.notes, 2000, answer.result === 'fail'); text(answer.correctiveAction, 2000); answers++;
    }
    ensure(Array.isArray(asset.defects) && asset.defects.length <= 30, 'Invalid defect list.');
    const defectIds = new Set();
    for (const defect of asset.defects) {
      shape(defect, ['id','description','correctiveAction','status']); jobId(defect.id); text(defect.description, 2000, true); text(defect.correctiveAction, 2000);
      ensure(!defectIds.has(defect.id), 'Duplicate defect.'); defectIds.add(defect.id);
      ensure(['open','rectified','referred'].includes(defect.status), 'Invalid defect status.');
    }
  }
  ensure(answers <= 512 && canonical(value).length <= 200000, 'Completion package exceeds the supported size. Split the scheduled work into smaller jobs.');
  shape(value.totals, ['totalAssets','pass','fail','na','defectCount']);
  ensure(canonical(value.totals) === canonical(totalsFor(value.assets as CompletedAsset[])), 'Inspection totals do not match the results.');
}
export const resultPath = (company: string, site: string, job: string, completion: string) => `companies/${company}/sites/${site}/extinguisherInspections/job_${job}_${completion}`;
export function validateReceipt(value: unknown, request: CompletionRequest, uid: string): asserts value is CompletionReceipt {
  shape(value, ['schemaVersion','companyId','siteId','jobId','completionId','engineerUid','inspectionRef','completedAt','jobRevision','payloadHash','totals']);
  ensure(value.schemaVersion === 1 && value.companyId === request.companyId && value.siteId === request.siteId && value.jobId === request.jobId && value.completionId === request.completionId && value.engineerUid === uid && request.engineerUid === uid, 'Receipt belongs to a different job or engineer.');
  ensure(value.inspectionRef === resultPath(request.companyId, request.siteId, request.jobId, request.completionId) && value.jobRevision === request.expectedRevision + 1 && Number.isSafeInteger(value.completedAt) && Number(value.completedAt) > 0 && typeof value.payloadHash === 'string' && /^[a-f0-9]{64}$/.test(value.payloadHash) && canonical(value.totals) === canonical(request.totals), 'Invalid synchronisation receipt.');
}
