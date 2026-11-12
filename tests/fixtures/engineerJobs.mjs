// Synthetic emulator fixtures, never imported by production components.
export const engineerJobProject = 'demo-instafire-jobs';
export const scheduledJob = (companyId = 'alpha', overrides = {}) => ({
  schemaVersion: 1, companyId, siteId: 'site',
  customer: { name: 'SYNTHETIC Customer', reference: 'synthetic-customer' },
  site: { name: 'SYNTHETIC Building', reference: 'synthetic-site' },
  inspectionType: 'extinguisher-monthly-visual', assignedEngineerUid: `engineer-${companyId}`,
  scheduledStart: 1794132000000, scheduledEnd: 1794135600000,
  workStatus: 'scheduled', reviewStatus: 'not_submitted',
  assets: [{ assetDocId: 'asset', templateId: 'synthetic-monthly-v1', templateVersion: 1 }],
  inspectionRef: null, completionSummary: null, revision: 1,
  createdAt: 1794130000000, updatedAt: 1794130000000, startedAt: null, completedAt: null,
  ...overrides,
});
export const completionRequest = (companyId = 'alpha', overrides = {}) => ({
  schemaVersion: 1, companyId, siteId: 'site', jobId: 'job', completionId: 'completion_stable_0001', engineerUid: `engineer-${companyId}`, expectedRevision: 1,
  inspectionType: 'extinguisher-monthly-visual', notes: 'Synthetic completed work only.',
  assets: [{ assetDocId: 'asset', templateId: 'synthetic-monthly-v1', templateVersion: 1, assetSnapshot: { type: 'SYNTHETIC', assetReference: 'FIXTURE-001', location: 'Fixture only' }, notes: 'Fixture notes',
    answers: [{ questionId: 'synthetic-check', result: 'pass', notes: '', correctiveAction: '' }, { questionId: 'synthetic-optional', result: 'na', notes: '', correctiveAction: '' }], defects: [] }],
  totals: { totalAssets: 1, pass: 1, fail: 0, na: 1, defectCount: 0 }, ...overrides,
});
export function engineerJobFixtures() {
  const records = {};
  for (const company of ['alpha', 'beta']) {
    const root = `companies/${company}`;
    records[root] = { status: 'active', name: `SYNTHETIC ${company}` };
    records[`${root}/members/office-${company}`] = { status: 'active', role: 'owner', displayName: 'Synthetic Office' };
    records[`${root}/members/engineer-${company}`] = { status: 'active', role: 'engineer', displayName: `Synthetic Engineer ${company}` };
    records[`${root}/sites/site`] = { status: 'active', name: 'SYNTHETIC Building', customerName: 'SYNTHETIC Customer' };
    records[`${root}/sites/site/extinguishers/asset`] = { status: 'active', type: 'SYNTHETIC', assetId: 'FIXTURE-001', location: 'Fixture only' };
    records[`${root}/extinguisherInspectionTemplates/synthetic-monthly-v1`] = { schemaVersion: 1, status: 'approved', version: 1, equipmentType: 'SYNTHETIC', serviceType: 'monthly-visual',
      questions: [{ id: 'synthetic-check', label: 'SYNTHETIC ONLY — no servicing guidance', allowNA: false }, { id: 'synthetic-optional', label: 'SYNTHETIC ONLY — optional', allowNA: true }] };
    records[`${root}/jobs/job`] = scheduledJob(company);
    records[`${root}/jobs/second-job`] = scheduledJob(company);
  }
  records['companies/alpha/members/unassigned'] = { status: 'active', role: 'engineer', displayName: 'Unassigned fixture' };
  records['companies/alpha/members/inactive'] = { status: 'disabled', role: 'engineer' };
  return records;
}
