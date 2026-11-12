import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { canTransition, canonical, totalsFor, validateCompletion, validateJob, validateReceipt } from '../../backend/shared/jobContract.ts';
import { createJobCompletionOutbox } from '../../engineer-app/src/services/localJobCompletionOutbox.ts';
import { completionFromDrafts } from '../../engineer-app/src/modules/Extinguishers/jobCompletionDraft.ts';
import { completionRequest, scheduledJob } from '../fixtures/engineerJobs.mjs';

function fixture() {
  const records = new Map(); let session = { userId: 'engineer-alpha', epoch: 0 }, generated = 0, calls = 0;
  const receipts = new Map();
  const storage = { async getItem(key) { return records.get(key) ?? null; }, async setItem(key, value) { records.set(key, value); }, async getAllKeys() { return [...records.keys()]; } };
  const options = { storage, projectId: 'demo-instafire-jobs', getSession: () => session, generateId: () => `completion_${++generated}`,
    async send(request) { calls++; const key = canonical(request); if (!receipts.has(key)) receipts.set(key, {
      schemaVersion: 1, companyId: request.companyId, siteId: request.siteId, jobId: request.jobId, completionId: request.completionId,
      engineerUid: 'engineer-alpha', inspectionRef: `companies/alpha/sites/site/extinguisherInspections/job_job_${request.completionId}`,
      completedAt: 1794136000000, jobRevision: request.expectedRevision + 1, payloadHash: 'a'.repeat(64), totals: request.totals,
    }); return structuredClone(receipts.get(key)); },
  };
  const create = () => createJobCompletionOutbox(options).forCompany('alpha');
  const { completionId: _, ...seed } = completionRequest();
  return { records, storage, options, create, seed, get calls() { return calls; }, get generated() { return generated; }, switchUser(uid) { session = { userId: uid, epoch: session.epoch + 1 }; } };
}
test('versioned job contract keeps work/review states separate and bounds scheduled work', () => {
  validateJob(scheduledJob());
  assert.throws(() => validateJob(scheduledJob('alpha', { reviewStatus: 'approved' })));
  assert.throws(() => validateJob(scheduledJob('alpha', { workStatus: 'completed' })));
  assert.throws(() => validateJob(scheduledJob('alpha', { scheduledEnd: 1 })));
  assert.throws(() => validateJob(scheduledJob('alpha', { schemaVersion: 2 })));
});
test('only explicit forward work transitions are allowed; completion can follow an offline scheduled job', () => {
  for (const from of ['scheduled','in_progress','completed']) for (const to of ['scheduled','in_progress','completed']) {
    assert.equal(canTransition(from, to), ['scheduled:in_progress','scheduled:completed','in_progress:completed'].includes(`${from}:${to}`));
  }
});
test('totals count check outcomes and distinct explicit defects without conflating failed checks', () => {
  const request = completionRequest(); request.assets[0].answers[0].result = 'fail'; request.assets[0].answers[0].notes = 'Synthetic failure reason';
  request.assets[0].defects = [{ id: 'fault-1', description: 'Fixture fault', correctiveAction: '', status: 'open' }];
  request.totals = totalsFor(request.assets); validateCompletion(request);
  assert.deepEqual(request.totals, { totalAssets: 1, pass: 0, fail: 1, na: 1, defectCount: 1 });
  assert.throws(() => validateCompletion({ ...request, totals: { ...request.totals, pass: 100 } }));
});
test('completion rejects unfinished results, missing FAIL reasons, duplicate assets/questions, extra photos and monitoring fields', () => {
  for (const change of [r => r.assets[0].answers[0].result = null, r => r.assets[0].answers[0].result = 'fail', r => r.assets.push(r.assets[0]), r => r.assets[0].answers.push(r.assets[0].answers[0]), r => r.photos = [], r => r.activityHistory = [], r => r.assets[0].answers[0].answeredAt = 1, r => r.companyId = '../beta', r => r.inspectionType = 'unknown']) {
    const request = completionRequest(); change(request); assert.throws(() => validateCompletion(request));
  }
});
test('offline completion persists the full frozen result, stable ID and pending status through restart and repeated confirmation', async () => {
  const f = fixture(); f.records.set('existing-draft-recovery', 'DO NOT TOUCH');
  const first = await f.create().prepare(f.seed);
  const again = await f.create().prepare(structuredClone(f.seed));
  assert.equal(first.completionId, again.completionId); assert.equal(f.generated, 1);
  const restored = await f.create().load('job');
  assert.equal(restored.workStatus, 'completed'); assert.equal(restored.syncStatus, 'Pending Sync');
  assert.deepEqual(restored.request.assets, f.seed.assets); assert.equal(f.calls, 0);
  assert.equal(f.records.get('existing-draft-recovery'), 'DO NOT TOUCH');
  await assert.rejects(f.create().prepare({ ...f.seed, notes: 'different work' }), /frozen/);
});
test('concurrent confirmation across store instances allocates one completion ID', async () => {
  const f = fixture(); const results = await Promise.all([f.create().prepare(f.seed), f.create().prepare(f.seed)]);
  assert.equal(results[0].completionId, results[1].completionId); assert.equal(f.generated, 1);
});
test('lost network acknowledgement retries the same ID and recovers one receipt without editing source drafts', async () => {
  const f = fixture(); await f.create().prepare(f.seed);
  const send = f.options.send; let lost = true;
  f.options.send = async request => { const receipt = await send(request); if (lost) { lost = false; throw new Error('offline after remote commit'); } return receipt; };
  await assert.rejects(f.create().sync('job'));
  assert.equal((await f.create().load('job')).syncStatus, 'Pending Sync');
  const recovered = await f.create().sync('job'); assert.equal(recovered.completionId, 'completion_1');
  assert.equal((await f.create().load('job')).syncStatus, 'Synced');
  await f.create().sync('job'); assert.equal(f.calls, 2); assert.equal(f.generated, 1);
});
test('failed receipt save is recoverable with a repeated server receipt', async () => {
  const f = fixture(); await f.create().prepare(f.seed);
  const put = f.storage.setItem; let fail = true;
  f.storage.setItem = async (key, value) => { if (fail && key.endsWith('receipt-0')) { fail = false; throw new Error('disk full'); } await put(key, value); };
  await assert.rejects(f.create().sync('job'));
  await f.create().sync('job'); assert.equal((await f.create().load('job')).syncStatus, 'Synced'); assert.equal(f.calls, 2);
});
test('partial initial write recovers the same ID while corrupt or disagreeing copies block transmission', async () => {
  const f = fixture(); const put = f.storage.setItem;
  f.storage.setItem = async (key, value) => { if (key.endsWith('intent-1')) throw new Error('disk full'); await put(key, value); };
  await assert.rejects(f.create().prepare(f.seed)); f.storage.setItem = put;
  await f.create().sync('job'); assert.equal(f.generated, 1);
  const key = [...f.records.keys()].find(key => key.endsWith('intent-1')); f.records.set(key, '{broken');
  await assert.rejects(f.create().sync('job'), /disagree/); assert.equal(f.calls, 1); assert.equal(f.records.get(key), '{broken');
});
test('scope isolation and session changes prevent old-user reads, writes and in-flight acknowledgement', async () => {
  const f = fixture(); const old = f.create(); await old.prepare(f.seed);
  f.switchUser('engineer-beta'); await assert.rejects(old.load('job'), /engineer changed/);
  assert.equal(await f.create().load('job'), null);
  f.switchUser('engineer-alpha'); const current = f.create(), send = f.options.send;
  f.options.send = async request => { const result = await send(request); f.switchUser('engineer-beta'); return result; };
  await assert.rejects(current.sync('job'), /engineer changed/);
  f.switchUser('engineer-alpha'); assert.equal((await f.create().load('job')).syncStatus, 'Pending Sync');
});
test('assignment cache is local, scoped and usable independently of completion transmission', async () => {
  const f = fixture(); await f.create().cacheAssignments([{ id: 'job', job: scheduledJob() }]);
  assert.equal((await f.create().cachedAssignments())[0].job.assignedEngineerUid, 'engineer-alpha');
  f.switchUser('engineer-beta'); assert.deepEqual(await f.create().cachedAssignments(), []); assert.equal(f.calls, 0);
});
test('receipt validation rejects foreign IDs, totals and result paths', async () => {
  const f = fixture(); const request = await f.create().prepare(f.seed), receipt = await f.options.send(request);
  for (const changed of [{ companyId: 'beta' }, { engineerUid: 'other' }, { jobId: 'other' }, { inspectionRef: 'companies/beta/private/result' }, { totals: { ...receipt.totals, fail: 99 } }]) assert.throws(() => validateReceipt({ ...receipt, ...changed }, request, 'engineer-alpha'));
});
test('draft adapter requires approved matching saved work and excludes all recovery/activity metadata', () => {
  const job = scheduledJob();
  const draft = { localSchemaVersion: 3, userId: 'engineer-alpha', companyId: 'alpha', siteId: 'site', assetDocId: 'asset', equipmentType: 'SYNTHETIC', assetReference: 'FIXTURE-001', assetLocation: 'Fixture only', engineerNotes: 'Notes', auditHistory: [{ secretLocalMetadata: true }],
    servicing: { serviceType: 'monthly-visual', checklist: { id: 'synthetic-monthly-v1', version: 1, approval: { status: 'approved' } }, answers: completionRequest().assets[0].answers, defects: [], evidence: [] } };
  const saved = { draft, canEdit: true, recovered: false, contextChanged: false };
  const seed = completionFromDrafts('job', job, 'engineer-alpha', [saved]);
  assert.equal(JSON.stringify(seed).includes('secretLocalMetadata'), false);
  assert.throws(() => completionFromDrafts('job', job, 'engineer-alpha', [{ ...saved, recovered: true }]));
  draft.servicing.checklist.approval.status = 'pending-technical-validation';
  assert.throws(() => completionFromDrafts('job', job, 'engineer-alpha', [saved]), /approved/);
  draft.servicing.checklist.approval.status = 'approved'; draft.servicing.evidence.push({ reference: 'file://private-photo' });
  assert.throws(() => completionFromDrafts('job', job, 'engineer-alpha', [saved]), /Photographs/);
});
test('fixture seeder fails closed for absent, production or remote emulator configuration', () => {
  for (const env of [{}, { GCLOUD_PROJECT: 'instafire-62d54', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, { GCLOUD_PROJECT: 'demo-instafire-jobs', FIRESTORE_EMULATOR_HOST: 'remote.example:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }]) {
    const result = spawnSync(process.execPath, ['tests/firebase/seed-engineer-jobs.mjs'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, GCLOUD_PROJECT: '', FIRESTORE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '', ...env } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /LOCAL_JOB_EMULATORS_REQUIRED/);
  }
});
test('the outbox cannot prepare a payload captured for another engineer or project', async () => {
  const f = fixture(); await assert.rejects(f.create().prepare({ ...f.seed, engineerUid: 'engineer-beta' }), /another workspace or engineer/);
  await f.create().prepare(f.seed);
  const otherProject = createJobCompletionOutbox({ ...f.options, projectId: 'demo-another-project' }).forCompany('alpha');
  assert.equal(await otherProject.load('job'), null); assert.equal(f.calls, 0);
});
