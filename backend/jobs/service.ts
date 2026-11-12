import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { canTransition, canonical, ensure, jobId, serviceType, validateCompletion, validateJob, validRevision, type CompletionRequest, type CompletionReceipt } from '../shared/jobContract.js';

export class JobService {
  constructor(private db: Firestore, private now = Date.now) {}
  private async context(tx: Transaction, company: string, job: string, uid: string) {
    jobId(company); jobId(job); jobId(uid);
    const root = `companies/${company}`;
    const [workspaceDoc, memberDoc, jobDoc] = await tx.getAll(this.db.doc(root), this.db.doc(`${root}/members/${uid}`), this.db.doc(`${root}/jobs/${job}`));
    const member = memberDoc.data();
    ensure(workspaceDoc.data()?.status === 'active' && member?.status === 'active' && ['engineer','senior_engineer'].includes(member.role), 'An active assigned engineer is required.', 'permission-denied');
    ensure(jobDoc.exists, 'Assigned job not found.', 'not-found');
    const record = jobDoc.data(); validateJob(record);
    ensure(record.companyId === company && record.assignedEngineerUid === uid, 'This job is not assigned to you.', 'permission-denied');
    ensure(member.role !== 'senior_engineer' || (Array.isArray(member.siteIds) && member.siteIds.includes(record.siteId)), 'Site access is not authorised.', 'permission-denied');
    const site = await tx.get(this.db.doc(`${root}/sites/${record.siteId}`));
    ensure(site.data()?.status === 'active', 'The job site is unavailable.', 'failed-precondition');
    return { root, jobRef: jobDoc.ref, job: record, member };
  }
  async start(company: string, job: string, revision: number, uid: string) {
    validRevision(revision);
    return this.db.runTransaction(async tx => {
      const context = await this.context(tx, company, job, uid);
      if (context.job.workStatus === 'in_progress') return { revision: context.job.revision, workStatus: 'in_progress' };
      ensure(context.job.revision === revision && canTransition(context.job.workStatus, 'in_progress'), 'The job changed. Reload it before starting.', 'failed-precondition');
      const at = this.now();
      tx.update(context.jobRef, { workStatus: 'in_progress', startedAt: at, updatedAt: at, revision: revision + 1 });
      tx.create(context.jobRef.collection('events').doc('started'), { schemaVersion: 1, event: 'job_started', actorUid: uid, at });
      return { revision: revision + 1, workStatus: 'in_progress' };
    });
  }
  async complete(input: unknown, uid: string): Promise<CompletionReceipt> {
    validateCompletion(input); const request: CompletionRequest = input;
    ensure(request.engineerUid === uid, 'Completion belongs to a different engineer session.', 'permission-denied');
    const payloadHash = createHash('sha256').update(canonical(request)).digest('hex');
    return this.db.runTransaction(async tx => {
      const { root, jobRef, job, member } = await this.context(tx, request.companyId, request.jobId, uid);
      ensure(request.siteId === job.siteId && request.inspectionType === job.inspectionType, 'Completion does not match the assigned site or inspection.', 'permission-denied');
      const receiptRef = jobRef.collection('completions').doc(request.completionId);
      const prior = (await tx.get(receiptRef)).data();
      if (prior) {
        ensure(prior.payloadHash === payloadHash && prior.engineerUid === uid, 'This completion ID already contains different results.', 'already-exists');
        return prior as CompletionReceipt;
      }
      ensure(job.revision === request.expectedRevision && canTransition(job.workStatus, 'completed') && job.reviewStatus === 'not_submitted', 'Job status or assignment changed. Keep the local completion and contact the office.', 'failed-precondition');
      ensure(canonical(job.assets) === canonical(request.assets.map(({ assetDocId, templateId, templateVersion }) => ({ assetDocId, templateId, templateVersion }))), 'Complete every assigned asset with its scheduled template.', 'failed-precondition');
      const refs = request.assets.flatMap(asset => [this.db.doc(`${root}/sites/${job.siteId}/extinguishers/${asset.assetDocId}`), this.db.doc(`${root}/extinguisherInspectionTemplates/${asset.templateId}`)]);
      const docs = await tx.getAll(...refs);
      const assets = request.assets.map((result, index) => {
        const asset = docs[index * 2].data(), template = docs[index * 2 + 1].data();
        ensure(asset && [undefined,'active','approved'].includes(asset.status), 'An assigned asset is unavailable.', 'failed-precondition');
        ensure(template?.schemaVersion === 1 && template.status === 'approved' && template.version === result.templateVersion && template.serviceType === serviceType(job.inspectionType) && template.equipmentType === asset.type, 'A matching technically approved checklist is required.', 'failed-precondition');
        ensure(Array.isArray(template.questions) && template.questions.length > 0 && template.questions.length <= 64 && new Set(template.questions.map((q: { id: string }) => q.id)).size === template.questions.length && template.questions.length === result.answers.length, 'The completed checklist does not match its approved version.');
        template.questions.forEach((question: { id: string; allowNA: boolean }, i: number) => {
          const definition = question as { id: string; allowNA: boolean; label?: unknown };
          ensure(typeof definition.label === 'string' && definition.label.length > 0 && definition.label.length <= 2000 && typeof question.allowNA === 'boolean', 'Invalid approved checklist definition.');
          ensure(result.answers[i].questionId === question.id && (result.answers[i].result !== 'na' || question.allowNA === true), 'A result does not match its approved question.');
        });
        const reference = asset.assetId ?? result.assetDocId;
        ensure(typeof asset.type === 'string' && asset.type.length <= 100 && typeof reference === 'string' && reference.length <= 1500 && (asset.location === undefined || (typeof asset.location === 'string' && asset.location.length <= 200)), 'Invalid approved asset details.');
        const assetSnapshot = { type: asset.type, assetReference: reference, location: asset.location ?? '' };
        ensure(canonical(result.assetSnapshot) === canonical(assetSnapshot), 'The approved asset details changed after inspection. Keep the local completion and ask the office to reconcile it.', 'failed-precondition');
        return { ...result, assetSnapshot,
          templateSnapshot: { id: result.templateId, version: result.templateVersion, equipmentType: template.equipmentType, serviceType: template.serviceType,
            questions: template.questions.map((question: { id: string; label: string; allowNA: boolean }) => ({ id: question.id, label: question.label, allowNA: question.allowNA })) } };
      });
      const at = this.now();
      const inspectionRef = `${root}/sites/${job.siteId}/extinguisherInspections/job_${request.jobId}_${request.completionId}`;
      const receipt: CompletionReceipt = { schemaVersion: 1, companyId: request.companyId, siteId: job.siteId, jobId: request.jobId, completionId: request.completionId, engineerUid: uid, inspectionRef, completedAt: at, jobRevision: job.revision + 1, payloadHash, totals: request.totals };
      const engineerName = typeof member.displayName === 'string' && member.displayName.trim() ? member.displayName.slice(0, 200) : uid;
      const summary = { ...request.totals, engineerUid: uid, engineerName, customer: job.customer, site: job.site, inspectionType: job.inspectionType, completedAt: at, inspectionRef };
      const inspection = { schemaVersion: 2, companyId: request.companyId, siteId: job.siteId, jobId: request.jobId, completionId: request.completionId, status: 'completed', createdBy: uid, engineerName, inspectionType: job.inspectionType, customer: job.customer, site: job.site, assets, notes: request.notes, totals: request.totals, completedAt: at, createdAt: at, reportStatus: 'not_generated', certificateStatus: 'not_issued' };
      ensure(Buffer.byteLength(canonical(inspection), 'utf8') <= 900000, 'Completed results exceed the supported document size. Keep the local package and arrange smaller scheduled jobs.', 'failed-precondition');
      tx.create(this.db.doc(inspectionRef), inspection);
      tx.update(jobRef, { workStatus: 'completed', reviewStatus: 'not_submitted', inspectionRef, completionSummary: summary, completedAt: at, updatedAt: at, revision: receipt.jobRevision });
      tx.create(jobRef.collection('events').doc('completed'), { schemaVersion: 1, event: 'job_completed', actorUid: uid, completionId: request.completionId, inspectionRef, at });
      tx.create(receiptRef, receipt);
      return receipt;
    });
  }
}
