import { canonical, ensure, jobId, validateCompletion, validateReceipt, validateJob, type CompletionRequest, type JobV1 } from '../../../backend/shared/jobContract.ts';
import type { DraftSession, DraftStorage } from './localInspectionDraftStore';

export type CompletionSeed = Omit<CompletionRequest, 'completionId'>;
const locks = new WeakMap<DraftStorage, Map<string, Promise<unknown>>>();
const listeners = new Map<string, Set<() => void>>();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Separate immutable completion intents. Never edits or removes inspection drafts,
 * their recovery copies, photos or their local save metadata. */
export function createJobCompletionOutbox(options: {
  storage: DraftStorage; projectId: string; getSession: () => DraftSession;
  generateId: () => string; send: (request: CompletionRequest) => Promise<unknown>;
}) {
  const { storage, projectId, getSession } = options;
  ensure(typeof projectId === 'string' && projectId.length > 0, 'Project is required.');
  let queues = locks.get(storage); if (!queues) { queues = new Map(); locks.set(storage, queues); }
  return {
    forCompany(companyId: string) {
      jobId(companyId);
      const session = { ...getSession() }; jobId(session.userId);
      const uid = session.userId;
      const prefix = '@instafire/job-completions/v1/' + [projectId, uid, companyId].map(encodeURIComponent).join('/') + '/';
      const notify = () => { for (const listener of listeners.get(prefix) ?? []) listener(); };
      function current() { const now = getSession(); ensure(now.userId === uid && now.epoch === session.epoch, 'The signed-in engineer changed. Local work is preserved.', 'permission-denied'); }
      async function read(key: string) { current(); const value = await storage.getItem(key); current(); return value; }
      async function write(key: string, value: string) { current(); await storage.setItem(key, value); current(); ensure(await read(key) === value, 'Local completion could not be verified. Retry without deleting drafts.', 'failed-precondition'); }
      function serial<T>(job: string, action: () => Promise<T>): Promise<T> {
        jobId(job); const key = prefix + job;
        const task = (queues!.get(key) ?? Promise.resolve()).catch(() => {}).then(() => { current(); return action(); });
        const tail = task.catch(() => {}); queues!.set(key, tail); void tail.then(() => { if (queues!.get(key) === tail) queues!.delete(key); }); return task;
      }
      async function intent(job: string): Promise<CompletionRequest | null> {
        const raws = await Promise.all([read(prefix + job + '/intent-0'), read(prefix + job + '/intent-1')]);
        const present = raws.filter((raw): raw is string => raw !== null);
        if (!present.length) return null;
        // Disagreeing or malformed copies are never silently replaced or sent.
        ensure(present.every(raw => raw === present[0]), 'Completion copies disagree. Keep them for recovery; contact your administrator.', 'failed-precondition');
        let value: unknown; try { value = JSON.parse(present[0]); } catch { throw new Error('Completion storage needs recovery. All copies are preserved.'); }
        validateCompletion(value);
        ensure(value.companyId === companyId && value.jobId === job && value.engineerUid === uid && canonical(value) === present[0], 'Completion storage needs recovery.', 'failed-precondition');
        return value;
      }
      async function receipt(job: string, request: CompletionRequest) {
        const raws = await Promise.all([read(prefix + job + '/receipt-0'), read(prefix + job + '/receipt-1')]);
        const present = raws.filter((raw): raw is string => raw !== null);
        if (!present.length) return null;
        ensure(present.every(raw => raw === present[0]), 'Receipt copies disagree. Retry receipt recovery without deleting the completion.', 'failed-precondition');
        const result: unknown = JSON.parse(present[0]); validateReceipt(result, request, uid); return result;
      }
      const api = {
        assertCurrentSession: current,
        subscribe(listener: () => void) {
          current(); const callbacks = listeners.get(prefix) ?? new Set(); callbacks.add(listener); listeners.set(prefix, callbacks);
          return () => { callbacks.delete(listener); if (!callbacks.size) listeners.delete(prefix); };
        },
        cacheAssignments(rows: { id: string; job: JobV1 }[]) {
          return serial('assignment-cache', async () => {
            for (const row of rows) { jobId(row.id); validateJob(row.job); ensure(row.job.companyId === companyId && row.job.assignedEngineerUid === uid, 'Invalid assignment cache.'); }
            await write(prefix + 'assignments', canonical(rows));
          });
        },
        cachedAssignments() {
          return serial('assignment-cache', async () => {
            const raw = await read(prefix + 'assignments'); if (!raw) return [];
            const rows = JSON.parse(raw) as { id: string; job: JobV1 }[];
            ensure(Array.isArray(rows) && rows.length <= 100, 'Assignment cache needs recovery.');
            for (const row of rows) { jobId(row.id); validateJob(row.job); ensure(row.job.companyId === companyId && row.job.assignedEngineerUid === uid, 'Invalid assignment cache.'); }
            return rows;
          });
        },
        prepare(seed: CompletionSeed) {
          const snapshot = copy(seed);
          return serial(seed.jobId, async () => {
            ensure(snapshot.companyId === companyId && snapshot.engineerUid === uid, 'Completion belongs to another workspace or engineer.', 'permission-denied');
            const existing = await intent(snapshot.jobId);
            if (existing) {
              const { completionId: _, ...original } = existing;
              ensure(canonical(original) === canonical(snapshot), 'This job already has a frozen local completion. Reconcile it instead of replacing it.', 'already-exists');
              return copy(existing);
            }
            const request = { ...snapshot, completionId: options.generateId() }; validateCompletion(request);
            const raw = canonical(request);
            await write(prefix + snapshot.jobId + '/intent-0', raw);
            await write(prefix + snapshot.jobId + '/intent-1', raw);
            notify();
            return copy(request);
          });
        },
        load(job: string) {
          return serial(job, async () => {
            const request = await intent(job); if (!request) return null;
            const acknowledged = await receipt(job, request);
            return { request: copy(request), receipt: acknowledged ? copy(acknowledged) : null, workStatus: 'completed' as const, syncStatus: acknowledged ? 'Synced' as const : 'Pending Sync' as const };
          });
        },
        sync(job: string) {
          return serial(job, async () => {
            const request = await intent(job); ensure(request, 'No explicit completion is queued.', 'not-found');
            const acknowledged = await receipt(job, request); if (acknowledged) return copy(acknowledged);
            // Repair a missing second copy after a failed initial write, using the
            // same stable ID. Non-null conflicting/corrupt data was rejected above.
            const raw = canonical(request);
            await write(prefix + job + '/intent-0', raw); await write(prefix + job + '/intent-1', raw);
            current(); const result = await options.send(copy(request)); current();
            validateReceipt(result, request, uid);
            await write(prefix + job + '/receipt-0', canonical(result));
            await write(prefix + job + '/receipt-1', canonical(result));
            notify();
            return copy(result);
          });
        },
        async pendingJobs() {
          current(); const keys = await storage.getAllKeys(); current();
          const jobs = [...new Set(keys.filter(key => key.startsWith(prefix) && /\/intent-[01]$/.test(key)).map(key => key.slice(prefix.length).split('/')[0]))];
          const pending: string[] = [];
          for (const job of jobs) { const value = await api.load(job); if (value && !value.receipt) pending.push(job); }
          return pending;
        },
      };
      return api;
    },
  };
}
