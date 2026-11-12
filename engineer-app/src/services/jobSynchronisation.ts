import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, where, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { AppState } from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { db } from '../firebaseConfig';
import { currentDraftSession } from './inspectionDraftStorage';
import { createJobCompletionOutbox } from './localJobCompletionOutbox';
import { ensure, jobId, validateJob, type JobV1 } from '../../../backend/shared/jobContract.ts';

const jobs = httpsCallable(getFunctions(app, 'europe-west2'), 'engineerJobs');
export const jobCompletionOutbox = createJobCompletionOutbox({ storage: AsyncStorage, projectId: app.options.projectId!, getSession: currentDraftSession,
  generateId: () => doc(collection(db, '_localJobCompletionIds')).id,
  send: async completion => (await jobs({ action: 'complete', completion })).data,
});
export async function assignedJobs(companyId: string, uid: string) {
  jobId(companyId); jobId(uid); ensure(currentDraftSession().userId === uid, 'The signed-in engineer changed.');
  const session = currentDraftSession();
  const cache = jobCompletionOutbox.forCompany(companyId);
  let documents: QueryDocumentSnapshot<DocumentData>[];
  try {
    const member = (await getDocFromServer(doc(db, 'companies', companyId, 'members', uid))).data();
    ensure(member?.status === 'active' && ['engineer','senior_engineer'].includes(member.role), 'Active engineer access is required.', 'permission-denied');
    const base = [where('assignedEngineerUid', '==', uid), where('companyId', '==', companyId)];
    const siteIds: string[] | null = member.role === 'senior_engineer' ? member.siteIds ?? [] : null;
    ensure(siteIds === null || (Array.isArray(siteIds) && siteIds.every(site => typeof site === 'string')), 'Site assignment is invalid.');
    if (siteIds === null) documents = (await getDocsFromServer(query(collection(db, 'companies', companyId, 'jobs'), ...base, limit(100)))).docs;
    else {
      documents = [];
      for (let offset = 0; offset < siteIds.length && documents.length < 100; offset += 30) {
        const snapshot = await getDocsFromServer(query(collection(db, 'companies', companyId, 'jobs'), ...base, where('siteId', 'in', siteIds.slice(offset, offset + 30)), limit(100 - documents.length)));
        documents.push(...snapshot.docs);
      }
    }
  }
  catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'unavailable' && code !== 'deadline-exceeded') throw error;
    return { rows: await cache.cachedAssignments(), fromCache: true };
  }
  ensure(currentDraftSession().userId === uid && currentDraftSession().epoch === session.epoch, 'The signed-in engineer changed.');
  const rows = documents.map(record => { const data = record.data(); validateJob(data); ensure(data.companyId === companyId && data.assignedEngineerUid === uid, 'Invalid assigned job.'); return { id: record.id, job: data as JobV1 }; });
  await cache.cacheAssignments(rows); return { rows, fromCache: false };
}
export async function startAssignedJob(companyId: string, jobId: string, expectedRevision: number) {
  const session = currentDraftSession(); ensure(session.userId, 'Sign in as the assigned engineer.', 'permission-denied');
  const response = await jobs({ action: 'start', companyId, jobId, expectedRevision, engineerUid: session.userId });
  ensure(currentDraftSession().userId === session.userId && currentDraftSession().epoch === session.epoch, 'The engineer session changed.', 'permission-denied');
  return response.data;
}
export function jobSyncError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (value.code?.startsWith('functions/') && value.code !== 'functions/internal') return value.message ?? 'Job synchronisation failed.';
  if (value.code && ['invalid-argument','failed-precondition','permission-denied','already-exists','not-found'].includes(value.code)) return value.message!;
  return 'Synchronisation could not be confirmed. Local work is preserved; reconnect and retry the same completion.';
}
/** Foreground recovery for explicit queued completions only. No heartbeats, server
 * draft reads/writes, background tracking, or network activity when the queue is empty. */
export function startCompletionRetries(companyId: string) {
  const outbox = jobCompletionOutbox.forCompany(companyId);
  let closed = false, timer: ReturnType<typeof setTimeout> | undefined, running = false, delay = 20000;
  const schedule = () => { if (!closed) timer = setTimeout(() => { void tick(); }, delay); };
  const tick = async () => {
    if (closed || running) return;
    running = true;
    try {
      if (AppState.currentState === 'active') {
        const pending = await outbox.pendingJobs();
        for (const job of pending) { if (closed) break; try { await outbox.sync(job); delay = 20000; } catch { delay = Math.min(delay * 2, 300000); } }
      }
    } catch { delay = Math.min(delay * 2, 300000); }
    finally { running = false; schedule(); }
  };
  const subscription = AppState.addEventListener('change', state => { if (state === 'active' && !running) { clearTimeout(timer); void tick(); } });
  void tick();
  return () => { closed = true; clearTimeout(timer); subscription.remove(); };
}
