import type { DraftSession, DraftStorage } from "./localInspectionDraftStore";
import { validateSystemChecks, type SystemChecks } from "../modules/FireAlarms/systemChecks.ts";

export type FireAlarmAnswer = { deviceId: string; result: null | "pass" | "fail" | "na"; fault: string };
export type FireAlarmDraftScope = { userId: string; companyId: string; siteId: string; systemId: string };
export type FireAlarmDraft = FireAlarmDraftScope & { schemaVersion: 1 | 2 | 3; mode: "fixture-only"; dataset: "fire-alarm-fixtures-v1";
  projectId: string; draftId: string; revision: number; answers: FireAlarmAnswer[]; systemChecks?: SystemChecks };
export type FireAlarmRead = { draft: FireAlarmDraft; recovery: boolean };
const queues = new WeakMap<DraftStorage, Map<string, Promise<unknown>>>();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export class FireAlarmDraftError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
function check(value: unknown, code: string): asserts value { if (!value) throw new FireAlarmDraftError(code); }
function text(value: unknown): asserts value is string { check(typeof value === "string" && !!value.trim() && value.length <= 1500, "INVALID_DRAFT_SCOPE"); }
function id(value: unknown): asserts value is string { check(typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value), "INVALID_DRAFT_ID"); }
function answers(value: unknown): asserts value is FireAlarmAnswer[] {
  check(Array.isArray(value) && value.length <= 5000, "INVALID_DEVICE_ANSWERS");
  const ids = new Set();
  for (const row of value) {
    check(row && typeof row === "object" && Object.keys(row).length === 3 && Object.hasOwn(row, "deviceId") && Object.hasOwn(row, "result") && Object.hasOwn(row, "fault"), "INVALID_DEVICE_ANSWERS");
    text(row.deviceId); check(!ids.has(row.deviceId), "INVALID_DEVICE_ANSWERS"); ids.add(row.deviceId);
    check([null, "pass", "fail", "na"].includes(row.result) && typeof row.fault === "string" && row.fault.length <= 2000, "INVALID_DEVICE_ANSWERS");
  }
}
export function fireAlarmProgress(value: readonly FireAlarmAnswer[]) {
  return { total: value.length, tested: value.filter((row) => row.result === "pass" || row.result === "na" || (row.result === "fail" && !!row.fault.trim())).length,
    failed: value.filter((row) => row.result === "fail").length, needsFault: value.filter((row) => row.result === "fail" && !row.fault.trim()).length };
}
/** Fixture-only sibling adapter using the existing storage/session contracts and
 * durable two-slot protocol. No extinguisher schema, logs, timestamps or transport. */
export function createLocalFireAlarmDraftStore(options: { storage: DraftStorage; projectId: string; getSession: () => DraftSession; generateId: () => string }) {
  const { storage, projectId, getSession, generateId } = options; text(projectId);
  let locks = queues.get(storage); if (!locks) { locks = new Map(); queues.set(storage, locks); }
  const queue = locks;
  return {
    forSystem(scope: FireAlarmDraftScope) {
      Object.values(scope).forEach(text); const captured = { ...scope }; const session = { ...getSession() };
      const prefix = "@instafire/fire-alarm-fixture-drafts/v1/" + [projectId, scope.userId, scope.companyId, scope.siteId, scope.systemId].map(encodeURIComponent).join("/") + "/";
      function assertCurrentSession() {
        const current = getSession(); check(current.userId === captured.userId && session.userId === captured.userId && current.epoch === session.epoch, "AUTH_SESSION_CHANGED");
      }
      function serial<T>(operation: () => Promise<T>): Promise<T> {
        const task = (queue.get(prefix) ?? Promise.resolve()).catch(() => {}).then(async () => { assertCurrentSession(); return operation(); });
        const tail = task.catch(() => {}); queue.set(prefix, tail); void tail.then(() => { if (queue.get(prefix) === tail) queue.delete(prefix); }); return task;
      }
      async function get(key: string) { assertCurrentSession(); const result = await storage.getItem(key); assertCurrentSession(); return result; }
      async function put(key: string, raw: string) {
        assertCurrentSession(); await storage.setItem(key, raw); assertCurrentSession();
        check(await get(key) === raw, "WRITE_NOT_CONFIRMED");
      }
      function validate(value: FireAlarmDraft) {
        check(value && typeof value === "object" && Object.keys(value).length === (value.schemaVersion >= 2 ? 12 : 11), "INVALID_FIRE_ALARM_DRAFT");
        check([1, 2, 3].includes(value.schemaVersion) && value.mode === "fixture-only" && value.dataset === "fire-alarm-fixtures-v1" && value.projectId === projectId, "INVALID_FIRE_ALARM_DRAFT");
        if (value.schemaVersion >= 2) {
          check(value.systemChecks, "INVALID_FIRE_ALARM_DRAFT"); validateSystemChecks(value.systemChecks);
          check(Object.hasOwn(value.systemChecks, "detectorSitingObservations") === (value.schemaVersion === 3), "INVALID_FIRE_ALARM_DRAFT");
        }
        else check(!Object.hasOwn(value, "systemChecks"), "INVALID_FIRE_ALARM_DRAFT");
        for (const key of ["userId", "companyId", "siteId", "systemId"] as const) check(value[key] === captured[key], "DRAFT_SCOPE_MISMATCH");
        id(value.draftId); check(Number.isSafeInteger(value.revision) && value.revision >= 1, "INVALID_FIRE_ALARM_DRAFT"); answers(value.answers);
      }
      async function read() {
        const raws = await Promise.all([get(prefix + "0"), get(prefix + "1")]); const valid: FireAlarmDraft[] = []; let damaged = false;
        raws.forEach((raw, slot) => {
          if (raw === null) return;
          let value: FireAlarmDraft;
          try { value = JSON.parse(raw); } catch { damaged = true; return; }
          check(!(value && typeof value.schemaVersion === "number" && value.schemaVersion > 3), "NEWER_DRAFT_VERSION");
          try { validate(value); check(value.revision % 2 === slot, "INVALID_DRAFT_SLOT"); valid.push(value); } catch { damaged = true; }
        });
        if (!valid.length) { check(!damaged, "RECOVERY_REQUIRED"); return { draft: null, recovery: false, raws }; }
        check(valid.every((entry) => entry.draftId === valid[0].draftId), "DRAFT_ID_CONFLICT");
        if (valid.length === 2 && valid[0].revision === valid[1].revision) check(JSON.stringify(valid[0]) === JSON.stringify(valid[1]), "REVISION_CONFLICT");
        valid.sort((a, b) => b.revision - a.revision);
        return { draft: valid[0], recovery: damaged, raws };
      }
      async function persist(draft: FireAlarmDraft): Promise<FireAlarmRead> {
        validate(draft); const raw = JSON.stringify(draft); check(raw.length <= 500000, "DRAFT_TOO_LARGE");
        await put(prefix + draft.revision % 2, raw); return { draft: clone(draft), recovery: false };
      }
      async function archive(raws: (string | null)[]) {
        const archiveId = generateId(); id(archiveId);
        const archivePrefix = prefix.replace("fire-alarm-fixture-drafts", "fire-alarm-fixture-recovery") + archiveId + "/";
        for (let i = 0; i < raws.length; i++) {
          const raw = raws[i]; if (raw === null) continue;
          check(await get(archivePrefix + i) === null, "ARCHIVE_ID_COLLISION"); await put(archivePrefix + i, raw);
        }
      }
      return {
        assertCurrentSession,
        open(deviceIds: string[]): Promise<FireAlarmRead> {
          const ids = [...deviceIds];
          const empty = ids.map((deviceId) => ({ deviceId, result: null, fault: "" })); answers(empty);
          return serial(async () => {
            const existing = await read();
            if (existing.draft) {
              check(JSON.stringify(existing.draft.answers.map((a) => a.deviceId).sort()) === JSON.stringify([...ids].sort()), "DEVICE_REGISTER_CHANGED");
              return { draft: clone(existing.draft), recovery: existing.recovery };
            }
            const draftId = generateId(); id(draftId);
            return persist({ ...captured, projectId, schemaVersion: 1, mode: "fixture-only", dataset: "fire-alarm-fixtures-v1", draftId, revision: 1, answers: empty });
          });
        },
        save(draftId: string, revision: number, value: FireAlarmAnswer[], systemChecks: SystemChecks | null = null): Promise<FireAlarmRead> {
          answers(value); const copied = clone(value);
          if (systemChecks) validateSystemChecks(systemChecks);
          const savedChecks = systemChecks ? clone(systemChecks) : null;
          return serial(async () => {
            const existing = await read(); check(existing.draft && !existing.recovery, "RECOVERY_REQUIRED");
            check(existing.draft.draftId === draftId && existing.draft.revision === revision, "REVISION_CONFLICT");
            check(JSON.stringify(copied.map((a) => a.deviceId)) === JSON.stringify(existing.draft.answers.map((a) => a.deviceId)), "DEVICE_REGISTER_CHANGED");
            check(existing.draft.schemaVersion < 2 || savedChecks, "SYSTEM_CHECKS_REQUIRED");
            check(existing.draft.schemaVersion !== 3 || savedChecks?.detectorSitingObservations, "SITING_OBSERVATIONS_REQUIRED");
            const nextVersion = savedChecks?.detectorSitingObservations ? 3 : savedChecks ? 2 : 1;
            if (nextVersion > existing.draft.schemaVersion) await archive(existing.raws);
            if (existing.draft.systemChecks && savedChecks) check(JSON.stringify(savedChecks.template) === JSON.stringify(existing.draft.systemChecks.template), "SYSTEM_TEMPLATE_IMMUTABLE");
            return persist({ ...existing.draft, revision: revision + 1, answers: copied,
              ...(savedChecks ? { schemaVersion: nextVersion as 2 | 3, systemChecks: savedChecks } : {}) });
          });
        },
        recover(draftId: string, revision: number): Promise<FireAlarmRead> {
          return serial(async () => {
            const existing = await read(); check(existing.draft && existing.recovery && existing.draft.draftId === draftId && existing.draft.revision === revision, "RECOVERY_REQUIRED");
            await archive(existing.raws);
            return persist({ ...existing.draft, revision: revision + 1 });
          });
        },
      };
    },
  };
}
