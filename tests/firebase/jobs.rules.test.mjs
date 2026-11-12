import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { JobService } from '../../backend/lib/jobs/service.js';
import { JobError } from '../../backend/lib/shared/jobContract.js';
import { engineerJobs } from '../../backend/lib/jobs/functions.js';
import { createJobCompletionOutbox } from '../../engineer-app/src/services/localJobCompletionOutbox.ts';
import { completionRequest, engineerJobFixtures, engineerJobProject } from '../fixtures/engineerJobs.mjs';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Firestore } = require('firebase-admin/firestore');
const { initializeApp, deleteApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
let environment, db, service, app;
const root = 'companies/alpha', jobPath = `${root}/jobs/job`;
const client = uid => environment.authenticatedContext(uid).firestore();
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, engineerJobProject);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  environment = await initializeTestEnvironment({ projectId: engineerJobProject, firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
  db = new Firestore({ projectId: engineerJobProject, host: '127.0.0.1:8080', ssl: false });
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  await import('./seed-engineer-jobs.mjs');
  // A synthetic in-memory certificate is a supported Admin credential type and
  // avoids ADC/metadata discovery. Emulator transport ignores its signature.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  app = initializeApp({ projectId: engineerJobProject, credential: cert({ projectId: engineerJobProject, clientEmail: 'local-tests@demo-instafire-jobs.iam.gserviceaccount.com', privateKey }) });
});
after(async () => {
  try { await db?.terminate(); if (app) await require('firebase-admin/firestore').getFirestore(app).terminate(); }
  finally { if (app) await deleteApp(app); await environment?.cleanup(); }
});
beforeEach(async () => {
  await environment.clearFirestore();
  const batch = db.batch(); for (const [path, value] of Object.entries(engineerJobFixtures())) batch.set(db.doc(path), value); await batch.commit();
  service = new JobService(db);
});
const denied = error => error instanceof JobError && error.code === 'permission-denied';
test('callable rejects anonymous callers and accepts an Auth-emulator engineer identity through its handler', async () => {
  await assert.rejects(engineerJobs.run({ data: { action: 'complete', completion: completionRequest() }, auth: null }), error => error.code === 'unauthenticated');
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'engineer-alpha@example.test', password: 'Synthetic-local-jobs-2026!', returnSecureToken: true }) });
  assert.equal(response.status, 200); const { idToken } = await response.json();
  const token = await getAuth(app).verifyIdToken(idToken);
  assert.equal(token.uid, 'engineer-alpha');
  await assert.rejects(engineerJobs.run({ data: { action: 'start', companyId: 'alpha', jobId: 'second-job', expectedRevision: 1, engineerUid: 'other-engineer' }, auth: { uid: token.uid, token } }), error => error.code === 'permission-denied');
  const started = await engineerJobs.run({ data: { action: 'start', companyId: 'alpha', jobId: 'second-job', expectedRevision: 1, engineerUid: token.uid }, auth: { uid: token.uid, token } });
  assert.equal(started.workStatus, 'in_progress');
  const receipt = await engineerJobs.run({ data: { action: 'complete', completion: completionRequest() }, auth: { uid: token.uid, token } });
  assert.equal(receipt.engineerUid, 'engineer-alpha');
});
test('canonical job reads are office-only or assigned engineer, with tenant and active-membership isolation', async () => {
  for (const uid of ['engineer-alpha', 'office-alpha']) await assertSucceeds(getDoc(doc(client(uid), jobPath)));
  for (const uid of ['unassigned','engineer-beta','office-beta','inactive']) await assertFails(getDoc(doc(client(uid), jobPath)));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), jobPath)));
  await assertSucceeds(getDocs(query(collection(client('engineer-alpha'), root, 'jobs'), where('assignedEngineerUid', '==', 'engineer-alpha'), where('companyId', '==', 'alpha'))));
  await assertFails(getDocs(collection(client('engineer-alpha'), root, 'jobs')));
  await assertSucceeds(getDocs(collection(client('office-alpha'), root, 'jobs')));
  for (const uid of ['engineer-alpha','office-alpha']) {
    await assertFails(updateDoc(doc(client(uid), jobPath), { workStatus: 'completed' }));
    await assertFails(setDoc(doc(client(uid), `${root}/jobs/forged`), engineerJobFixtures()[jobPath]));
    await assertFails(deleteDoc(doc(client(uid), jobPath)));
  }
});
test('backend denies cross-workspace, unassigned, office and inactive engineer completion before writes', async () => {
  for (const uid of ['engineer-beta', 'unassigned', 'office-alpha', 'inactive']) await assert.rejects(service.complete(completionRequest('alpha', { engineerUid: uid }), uid), denied);
  await db.doc(`${root}/members/inactive`).update({ status: 'active' });
  await db.doc(jobPath).update({ assignedEngineerUid: 'inactive' });
  await db.doc(`${root}/members/inactive`).update({ status: 'disabled' });
  await assert.rejects(service.complete(completionRequest('alpha', { engineerUid: 'inactive' }), 'inactive'), denied);
  assert.equal((await db.collection(`${root}/sites/site/extinguisherInspections`).get()).size, 0);
});
test('one atomic completion creates immutable result, job summary, receipt and one meaningful audit without review submission', async () => {
  const request = completionRequest(); const receipt = await service.complete(request, 'engineer-alpha');
  const job = (await db.doc(jobPath).get()).data();
  assert.equal(job.workStatus, 'completed'); assert.equal(job.reviewStatus, 'not_submitted'); assert.equal(job.revision, 2);
  assert.equal(job.inspectionRef, receipt.inspectionRef); assert.equal(job.completionSummary.engineerName, 'Synthetic Engineer alpha');
  assert.deepEqual(job.completionSummary.customer, job.customer); assert.deepEqual(job.completionSummary.site, job.site);
  assert.equal(job.completedAt, receipt.completedAt); assert.equal(job.completionSummary.totalAssets, 1);
  const inspection = (await db.doc(receipt.inspectionRef).get()).data();
  assert.equal(inspection.schemaVersion, 2); assert.equal(inspection.status, 'completed'); assert.equal(inspection.reportStatus, 'not_generated');
  assert.equal(inspection.assets[0].assetSnapshot.assetReference, 'FIXTURE-001');
  assert.equal(Object.hasOwn(inspection, 'submittedAt'), false);
  assert.deepEqual((await db.doc(`${jobPath}/completions/${request.completionId}`).get()).data(), receipt);
  assert.equal((await db.collection(`${jobPath}/events`).get()).size, 1);
  for (const uid of ['engineer-alpha','office-alpha']) {
    await assertSucceeds(getDoc(doc(client(uid), receipt.inspectionRef)));
    await assertFails(updateDoc(doc(client(uid), receipt.inspectionRef), { notes: 'rewrite' }));
    await assertFails(deleteDoc(doc(client(uid), receipt.inspectionRef)));
    await assertFails(setDoc(doc(client(uid), `${jobPath}/completions/forged`), receipt));
  }
  for (const uid of ['engineer-beta','office-beta','unassigned','inactive']) {
    await assertFails(getDoc(doc(client(uid), receipt.inspectionRef)));
    await assertFails(getDoc(doc(client(uid), `${jobPath}/completions/${request.completionId}`)));
  }
});
test('repeated and concurrent completion IDs return the original receipt and never duplicate results or audit', async () => {
  const results = await Promise.all([service.complete(completionRequest(), 'engineer-alpha'), service.complete(completionRequest(), 'engineer-alpha')]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(await service.complete(completionRequest(), 'engineer-alpha'), results[0]);
  assert.equal((await db.collection(`${root}/sites/site/extinguisherInspections`).get()).size, 1);
  assert.equal((await db.collection(`${jobPath}/events`).get()).size, 1);
  await assert.rejects(service.complete(completionRequest('alpha', { notes: 'altered under same id' }), 'engineer-alpha'), error => error.code === 'already-exists');
  await assert.rejects(service.complete(completionRequest('alpha', { completionId: 'different' }), 'engineer-alpha'));
});
test('receipt recovery remains possible after a subsequent office review without submitting on completion', async () => {
  const receipt = await service.complete(completionRequest(), 'engineer-alpha');
  await db.doc(jobPath).update({ reviewStatus: 'approved' }); // Emulates a future trusted review; no client review grant.
  assert.deepEqual(await service.complete(completionRequest(), 'engineer-alpha'), receipt);
});
test('scheduled and explicitly started jobs complete, while backward and stale transitions are denied', async () => {
  const started = await service.start('alpha', 'job', 1, 'engineer-alpha'); assert.equal(started.revision, 2);
  assert.deepEqual(await service.start('alpha', 'job', 1, 'engineer-alpha'), started);
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'));
  await service.complete(completionRequest('alpha', { expectedRevision: 2 }), 'engineer-alpha');
  await assert.rejects(service.start('alpha', 'job', 3, 'engineer-alpha'));
  assert.equal((await db.collection(`${jobPath}/events`).get()).size, 2);
});
test('site/type substitution, missing or duplicate assigned assets and unapproved templates fail without partial publication', async () => {
  for (const change of [r => r.siteId = 'other-site', r => r.inspectionType = 'extinguisher-annual-basic', r => r.assets[0].assetDocId = 'other-asset', r => r.assets[0].templateVersion = 99, r => r.assets[0].templateId = 'other-template']) {
    const request = completionRequest(); change(request); await assert.rejects(service.complete(request, 'engineer-alpha'));
  }
  await db.doc(`${root}/extinguisherInspectionTemplates/synthetic-monthly-v1`).update({ status: 'pending-technical-validation' });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'), /approved/);
  assert.equal((await db.doc(jobPath).get()).data().workStatus, 'scheduled');
  assert.equal((await db.collection(`${root}/sites/site/extinguisherInspections`).get()).size, 0);
  assert.equal((await db.collection(`${jobPath}/completions`).get()).size, 0);
});
test('failure notes, totals, approved question order and N/A eligibility are validated', async () => {
  const malformed = completionRequest(); malformed.assets[0].answers[0].result = 'fail';
  await assert.rejects(service.complete(malformed, 'engineer-alpha'));
  malformed.assets[0].answers[0].notes = 'Synthetic defect reason'; malformed.totals.pass = 0; malformed.totals.fail = 1;
  const wrongTotals = structuredClone(malformed); wrongTotals.totals.fail = 999;
  await assert.rejects(service.complete(wrongTotals, 'engineer-alpha'));
  const wrongQuestion = structuredClone(malformed); wrongQuestion.assets[0].answers[0].questionId = 'invented';
  await assert.rejects(service.complete(wrongQuestion, 'engineer-alpha'));
  const wrongNA = completionRequest(); wrongNA.assets[0].answers[0].result = 'na'; wrongNA.totals.pass = 0; wrongNA.totals.na = 2;
  await assert.rejects(service.complete(wrongNA, 'engineer-alpha'));
  const receipt = await service.complete(malformed, 'engineer-alpha'); assert.equal(receipt.totals.fail, 1);
});
test('reassignment, disabled workspace/site and senior-engineer site restrictions fail closed', async () => {
  await db.doc(jobPath).update({ assignedEngineerUid: 'unassigned' });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'), denied);
  await db.doc(jobPath).update({ assignedEngineerUid: 'engineer-alpha' });
  await db.doc(`${root}/members/engineer-alpha`).update({ role: 'senior_engineer', siteIds: [] });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'), denied);
  await db.doc(`${root}/members/engineer-alpha`).update({ siteIds: ['site'] });
  await db.doc(`${root}/sites/site`).update({ status: 'disabled' });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'));
  await db.doc(`${root}/sites/site`).update({ status: 'active' }); await db.doc(root).update({ status: 'disabled' });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'), denied);
});
test('completed result cannot be client-forged, even by an owner, and orphan results are unreadable', async () => {
  const receipt = await service.complete(completionRequest(), 'engineer-alpha');
  const record = (await db.doc(receipt.inspectionRef).get()).data();
  await assertFails(setDoc(doc(client('office-alpha'), `${root}/sites/site/extinguisherInspections/forged`), record));
  await assertFails(setDoc(doc(client('engineer-alpha'), `${root}/sites/site/extinguisherInspections/forged`), record));
  await db.doc(`${root}/sites/site/extinguisherInspections/orphan`).set(record);
  await assertFails(getDoc(doc(client('office-alpha'), `${root}/sites/site/extinguisherInspections/orphan`)));
});
test('legacy submitted inspections remain immutable under all client roles', async () => {
  const path = `${root}/sites/site/extinguisherInspections/legacy-submitted`;
  await db.doc(path).set({ schemaVersion: 1, companyId: 'alpha', siteId: 'site', createdBy: 'engineer-alpha', status: 'submitted' });
  for (const uid of ['engineer-alpha','office-alpha']) {
    await assertSucceeds(getDoc(doc(client(uid), path)));
    await assertFails(updateDoc(doc(client(uid), path), { status: 'draft' }));
    await assertFails(deleteDoc(doc(client(uid), path)));
  }
});
test('senior-engineer assignment queries must constrain the permitted sites', async () => {
  await db.doc(`${root}/members/engineer-alpha`).update({ role: 'senior_engineer', siteIds: ['site'] });
  const base = collection(client('engineer-alpha'), root, 'jobs');
  await assertSucceeds(getDocs(query(base, where('assignedEngineerUid', '==', 'engineer-alpha'), where('companyId', '==', 'alpha'), where('siteId', 'in', ['site']))));
  await assertFails(getDocs(query(base, where('assignedEngineerUid', '==', 'engineer-alpha'), where('companyId', '==', 'alpha'))));
});
test('real local offline outbox synchronises once through the backend after network recovery', async () => {
  const storage = new Map(); let online = false;
  const adapter = { async getItem(key) { return storage.get(key) ?? null; }, async setItem(key, value) { storage.set(key, value); }, async getAllKeys() { return [...storage.keys()]; } };
  const options = { storage: adapter, projectId: engineerJobProject, getSession: () => ({ userId: 'engineer-alpha', epoch: 1 }), generateId: () => 'offline_stable_0001', send: request => { if (!online) throw new Error('Offline'); return service.complete(request, 'engineer-alpha'); } };
  const { completionId: _, ...seed } = completionRequest();
  await createJobCompletionOutbox(options).forCompany('alpha').prepare(seed);
  await assert.rejects(createJobCompletionOutbox(options).forCompany('alpha').sync('job'));
  assert.equal((await db.doc(jobPath).get()).data().workStatus, 'scheduled');
  online = true;
  const receipt = await createJobCompletionOutbox(options).forCompany('alpha').sync('job');
  assert.equal((await createJobCompletionOutbox(options).forCompany('alpha').load('job')).syncStatus, 'Synced');
  assert.equal((await db.doc(receipt.inspectionRef).get()).data().assets.length, 1);
  assert.equal((await db.collection(`${root}/sites/site/extinguisherInspections`).get()).size, 1);
});
test('a transaction create conflict leaves the job, receipt and audit unmodified', async () => {
  const request = completionRequest();
  const path = `${root}/sites/site/extinguisherInspections/job_job_${request.completionId}`;
  await db.doc(path).set({ sentinel: 'pre-existing result must never be overwritten' });
  await assert.rejects(service.complete(request, 'engineer-alpha'));
  assert.equal((await db.doc(jobPath).get()).data().workStatus, 'scheduled');
  assert.equal((await db.collection(`${jobPath}/events`).get()).size, 0);
  assert.equal((await db.collection(`${jobPath}/completions`).get()).size, 0);
  assert.equal((await db.doc(path).get()).data().sentinel, 'pre-existing result must never be overwritten');
});
test('changed asset snapshots cannot silently replace the details inspected offline', async () => {
  await db.doc(`${root}/sites/site/extinguishers/asset`).update({ location: 'Changed after the inspection' });
  await assert.rejects(service.complete(completionRequest(), 'engineer-alpha'), /asset details changed/);
  assert.equal((await db.doc(jobPath).get()).data().workStatus, 'scheduled');
});
test('an auth switch and reassignment cannot submit a previous engineer frozen payload', async () => {
  await db.doc(jobPath).update({ assignedEngineerUid: 'unassigned' });
  await assert.rejects(service.complete(completionRequest(), 'unassigned'), /different engineer session/);
  assert.equal((await db.doc(jobPath).get()).data().workStatus, 'scheduled');
});
