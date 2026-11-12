import { ensure, serviceType, totalsFor, validateCompletion, validateJob, type CompletedAsset, type JobV1 } from '../../../../backend/shared/jobContract.ts';
import type { DraftResult } from '../../services/localInspectionDraftStore';
import type { CompletionSeed } from '../../services/localJobCompletionOutbox';

/** Explicitly selected saved drafts only; never guesses the latest draft or exports
 * auditHistory, save times, recovery data or proposal/inspection photographs. */
export function completionFromDrafts(jobId: string, job: JobV1, engineerUid: string, drafts: DraftResult[]): CompletionSeed {
  validateJob(job);
  ensure(job.assignedEngineerUid === engineerUid && job.workStatus !== 'completed' && job.reviewStatus === 'not_submitted', 'This job is not available for your completion.', 'failed-precondition');
  ensure(drafts.length === job.assets.length, 'Select one saved inspection for every assigned asset.');
  const assets: CompletedAsset[] = job.assets.map((plan, index) => {
    const result = drafts[index], draft = result.draft;
    ensure(result.canEdit && !result.recovered && !result.contextChanged, 'Resolve draft recovery or changed asset details before completing.', 'failed-precondition');
    ensure(draft.localSchemaVersion === 3 && draft.userId === engineerUid && draft.companyId === job.companyId && draft.siteId === job.siteId && draft.assetDocId === plan.assetDocId, 'A selected draft belongs to a different asset or engineer.');
    const servicing = draft.servicing;
    ensure(servicing.checklist?.approval.status === 'approved' && servicing.checklist.id === plan.templateId && servicing.checklist.version === plan.templateVersion && servicing.serviceType === serviceType(job.inspectionType), 'A saved inspection using the assigned technically approved checklist is required.', 'failed-precondition');
    ensure(servicing.evidence.length === 0, 'Photographs/evidence cannot be synchronised in this release. The original draft and files are preserved.', 'failed-precondition');
    ensure(servicing.answers.every(answer => answer.result !== null), 'Finish every check before confirming completion.');
    return { ...plan, assetSnapshot: { type: draft.equipmentType, assetReference: draft.assetReference, location: draft.assetLocation }, notes: draft.engineerNotes, answers: servicing.answers.map(answer => ({ ...answer, result: answer.result! })), defects: servicing.defects.map(defect => ({ ...defect })) };
  });
  const seed: CompletionSeed = { schemaVersion: 1, companyId: job.companyId, siteId: job.siteId, jobId, engineerUid, expectedRevision: job.revision, inspectionType: job.inspectionType, assets, totals: totalsFor(assets), notes: '' };
  validateCompletion({ ...seed, completionId: 'validate-only' }); return seed;
}
