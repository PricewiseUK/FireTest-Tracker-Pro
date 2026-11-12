import type { ExtinguisherInspectionAnswerV1 } from "../modules/Extinguishers/inspectionTypes";
import { validateServicingDraft, type ServicingDraft } from "../modules/Extinguishers/servicingDraft.ts";
import { isDevelopmentWaterChecklistOutdated, routineServicingForAsset } from "../modules/Extinguishers/inspectionChecklistSelection.ts";

export const DRAFT_STATES = {
  savedOnDevice: "Saved on Device", pendingSync: "Pending Sync",
  synced: "Synced", saveFailed: "Save Failed",
} as const;

export interface DraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}
export interface DraftSession { userId: string | null; epoch: number }
export interface DraftSeed {
  assetDocId: string;
  assetReference: string;
  assetLocation: string;
  equipmentType: string;
  serviceType: string;
  templateId: string;
  templateVersion: number;
  /** Validated template metadata only; no new servicing wording is supplied. */
  questions: { id: string; allowNA: boolean }[];
}
export interface LocalInspectionDraft extends DraftSeed {
  localSchemaVersion: 1;
  projectId: string;
  userId: string;
  companyId: string;
  siteId: string;
  inspectionId: string;
  localRevision: number;
  createdAtMs: number;
  updatedAtMs: number;
  answers: ExtinguisherInspectionAnswerV1[];
  /** Local saves never assert server acknowledgement. Sync transport is absent. */
  sync: { state: "pending-sync"; acknowledgedLocalRevision: null };
}
export type NotesSeed = Pick<DraftSeed, "assetDocId" | "assetReference" | "assetLocation" | "equipmentType"> & { assetCapacity: string };
/** Local only: deliberately has no checklist, answers, completion or submission. */
interface LocalNotesDraftV2 extends NotesSeed {
  localSchemaVersion: 2;
  draftKind: "engineer-notes";
  serviceType: "engineer-notes";
  projectId: string;
  userId: string;
  companyId: string;
  siteId: string;
  inspectionId: string;
  localRevision: number;
  createdAtMs: number;
  updatedAtMs: number;
  engineerNotes: string;
  recoveryArchiveId: string | null;
  sync: { state: "pending-sync"; acknowledgedLocalRevision: null };
}
type AuditEntry = { localRevision: number; atMs: number; action: "servicing-started" | "servicing-updated" | "notes-updated" | "recovered" };
export type LocalNotesDraft = LocalNotesDraftV2 | (Omit<LocalNotesDraftV2, "localSchemaVersion"> & {
  localSchemaVersion: 3; servicing: ServicingDraft; auditHistory: AuditEntry[];
});
type StoredDraft = LocalInspectionDraft | LocalNotesDraft;
export interface DraftResult<T extends StoredDraft = StoredDraft> {
  draft: T;
  deviceState: "Saved on Device" | "Save Failed";
  syncState: "Pending Sync";
  recovered: boolean;
  canEdit: boolean;
  contextChanged: boolean;
}

export class DraftStoreError extends Error {
  readonly deviceState = DRAFT_STATES.saveFailed;
  readonly code: string;
  readonly attemptedDraft?: StoredDraft;
  constructor(code: string, attemptedDraft?: StoredDraft) {
    super(code);
    this.name = "DraftStoreError";
    this.code = code;
    // Failed saves retain a retryable copy for the SAME authenticated session.
    this.attemptedDraft = attemptedDraft;
  }
}

// Shared by store instances using the same backend in one JS runtime.
const queues = new WeakMap<DraftStorage, Map<string, Promise<unknown>>>();
const seedFields = ["assetDocId", "assetReference", "assetLocation", "equipmentType", "serviceType", "templateId", "templateVersion", "questions"];
const recordFields = [...seedFields, "localSchemaVersion", "projectId", "userId", "companyId", "siteId", "inspectionId", "localRevision", "createdAtMs", "updatedAtMs", "answers", "sync"];
const notesSeedFields = ["assetDocId", "assetReference", "assetLocation", "equipmentType", "assetCapacity"];
const notesRecordFields = [...notesSeedFields, "localSchemaVersion", "draftKind", "serviceType", "projectId", "userId", "companyId", "siteId", "inspectionId", "localRevision", "createdAtMs", "updatedAtMs", "engineerNotes", "recoveryArchiveId", "sync"];
function check(condition: unknown, code = "INVALID_DRAFT"): asserts condition {
  if (!condition) throw new DraftStoreError(code);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
}
function fields(value: unknown, expected: string[]) {
  object(value);
  check(Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)));
}
function text(value: unknown, max: number, empty = false): asserts value is string {
  check(typeof value === "string" && value.length <= max && (empty || value.trim().length > 0));
}
function integer(value: unknown): asserts value is number {
  check(Number.isSafeInteger(value) && (value as number) >= 1);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function validateSeed(seed: DraftSeed) {
  for (const key of ["assetDocId", "assetReference", "templateId"] as const) text(seed[key], 1500);
  for (const key of ["equipmentType", "serviceType"] as const) text(seed[key], 100);
  check(!seed.assetDocId.includes("/") && !seed.templateId.includes("/"));
  text(seed.assetLocation, 200, true);
  integer(seed.templateVersion);
  check(Array.isArray(seed.questions) && seed.questions.length >= 1 && seed.questions.length <= 8);
  const ids = new Set<string>();
  for (const question of seed.questions) {
    fields(question, ["id", "allowNA"]);
    text(question.id, 100);
    check(typeof question.allowNA === "boolean" && !ids.has(question.id));
    ids.add(question.id);
  }
}
function validateAnswers(answers: ExtinguisherInspectionAnswerV1[], seed: DraftSeed) {
  check(Array.isArray(answers) && answers.length === seed.questions.length);
  answers.forEach((answer, index) => {
    fields(answer, ["questionId", "result", "notes"]);
    check(answer.questionId === seed.questions[index].id);
    check([null, "pass", "fail", "na"].includes(answer.result));
    text(answer.notes, 2000, true);
    check(answer.result !== "na" || seed.questions[index].allowNA);
    // Drafts can contain incomplete Fail/N/A notes while the engineer is typing.
    // Submission validation remains the responsibility of Phase 1 server rules.
  });
}
function captureAnswers(answers: ExtinguisherInspectionAnswerV1[]) {
  check(Array.isArray(answers));
  for (const answer of answers) {
    fields(answer, ["questionId", "result", "notes"]);
    check([null, "pass", "fail", "na"].includes(answer.result));
    text(answer.questionId, 100); text(answer.notes, 2000, true);
  }
  return clone(answers);
}
function identity(draft: DraftSeed) {
  return JSON.stringify(seedFields.map((key) => draft[key as keyof DraftSeed]));
}
function notesIdentity(seed: NotesSeed) {
  return JSON.stringify(notesSeedFields.map((key) => seed[key as keyof NotesSeed]));
}
function storedIdentity(draft: StoredDraft) {
  return draft.localSchemaVersion === 1 ? identity(draft) : notesIdentity(draft);
}
function validateNotesSeed(seed: NotesSeed) {
  text(seed.assetDocId, 1500); check(!seed.assetDocId.includes("/"));
  text(seed.assetReference, 1500); text(seed.assetLocation, 200, true);
  text(seed.equipmentType, 100, true); text(seed.assetCapacity, 100, true);
}

export function createLocalInspectionDraftStore(options: {
  storage: DraftStorage;
  projectId: string;
  getSession: () => DraftSession;
  generateId: () => string;
  now?: () => number;
  allowDevelopmentChecklistReplacement?: boolean;
}) {
  const { storage, projectId, getSession, generateId } = options;
  const now = options.now ?? Date.now;
  text(projectId, 1500);
  let backendQueues = queues.get(storage);
  if (!backendQueues) { backendQueues = new Map(); queues.set(storage, backendQueues); }
  const locks = backendQueues;

  return {
    /** Discover site namespaces only for the current project/user/company. Records
     * are still read/validated through forSite().list(), never parsed here. */
    async listSiteIds(companyId: string): Promise<string[]> {
      text(companyId, 1500);
      const session = { ...getSession() };
      check(session.userId !== null, "AUTH_REQUIRED");
      const prefix = "@instafire/inspection-drafts/v1/" + [projectId, session.userId, companyId].map(encodeURIComponent).join("/") + "/";
      const all = await storage.getAllKeys();
      const current = getSession();
      check(current.userId === session.userId && current.epoch === session.epoch, "AUTH_SESSION_CHANGED");
      const sites = new Set<string>();
      for (const key of all.filter((key) => key.startsWith(prefix))) {
        try {
          const siteId = decodeURIComponent(key.slice(prefix.length).split("/")[0]);
          text(siteId, 1500); sites.add(siteId);
        } catch { throw new DraftStoreError("RECOVERY_REQUIRED"); }
      }
      return [...sites];
    },
    forSite(companyId: string, siteId: string) {
      text(companyId, 1500); text(siteId, 1500);
      const session = { ...getSession() };
      check(session.userId !== null, "AUTH_REQUIRED");
      text(session.userId, 1500);
      const userId = session.userId;
      const prefix = "@instafire/inspection-drafts/v1/" + [projectId, userId, companyId, siteId].map(encodeURIComponent).join("/") + "/";
      function authorised() {
        const current = getSession();
        check(current.userId === userId && current.epoch === session.epoch, "AUTH_SESSION_CHANGED");
      }
      function serial<T>(operation: () => Promise<T>): Promise<T> {
        // Capture authentication before enqueueing, and recheck on every I/O boundary.
        authorised();
        const task = (locks.get(prefix) ?? Promise.resolve()).catch(() => {}).then(async () => {
          authorised();
          try { return await operation(); }
          catch (error) {
            authorised();
            if (error instanceof DraftStoreError) throw error;
            throw new DraftStoreError("STORAGE_UNAVAILABLE");
          }
        });
        const tail = task.catch(() => {});
        locks.set(prefix, tail);
        void tail.then(() => { if (locks.get(prefix) === tail) locks.delete(prefix); });
        return task;
      }
      async function keys() {
        authorised();
        const all = await storage.getAllKeys();
        authorised();
        return all.filter((key) => key.startsWith(prefix));
      }
      function validId(id: string) { check(/^[A-Za-z0-9_-]{16,128}$/.test(id), "INVALID_INSPECTION_ID"); }
      function validateRecord(draft: StoredDraft, id: string) {
        check(draft !== null && typeof draft === "object" && !Array.isArray(draft));
        check(draft.localSchemaVersion === 1 || draft.localSchemaVersion === 2 || draft.localSchemaVersion === 3);
        fields(draft, draft.localSchemaVersion === 1 ? recordFields : draft.localSchemaVersion === 2 ? notesRecordFields : [...notesRecordFields, "servicing", "auditHistory"]);
        check(draft.projectId === projectId && draft.userId === userId && draft.companyId === companyId && draft.siteId === siteId && draft.inspectionId === id);
        if (draft.localSchemaVersion === 1) {
          validateSeed(draft); validateAnswers(draft.answers, draft);
        } else {
          validateNotesSeed(draft); text(draft.engineerNotes, 8000, true);
          check(draft.draftKind === "engineer-notes" && draft.serviceType === "engineer-notes");
          check(draft.recoveryArchiveId === null || /^[A-Za-z0-9_-]{16,128}$/.test(draft.recoveryArchiveId));
          if (draft.localSchemaVersion === 3) {
            check(draft.recoveryArchiveId !== null);
            validateServicingDraft(draft.servicing);
            check(Array.isArray(draft.auditHistory) && draft.auditHistory.length >= 1 && draft.auditHistory.length <= 10000);
            let previous = 0;
            for (const entry of draft.auditHistory) {
              fields(entry, ["localRevision", "atMs", "action"]); integer(entry.localRevision); integer(entry.atMs);
              check(entry.localRevision > previous && entry.localRevision <= draft.localRevision && entry.atMs <= draft.updatedAtMs);
              check(["servicing-started", "servicing-updated", "notes-updated", "recovered"].includes(entry.action)); previous = entry.localRevision;
            }
            check(previous === draft.localRevision);
          }
        }
        integer(draft.localRevision); integer(draft.createdAtMs); integer(draft.updatedAtMs);
        check(draft.updatedAtMs >= draft.createdAtMs);
        fields(draft.sync, ["state", "acknowledgedLocalRevision"]);
        check(draft.sync.state === "pending-sync" && draft.sync.acknowledgedLocalRevision === null);
      }
      async function read(id: string, allKeys: string[]): Promise<DraftResult | null> {
        validId(id);
        const recordPrefix = prefix + id + "/";
        const candidates = allKeys.filter((key) => key.startsWith(recordPrefix));
        const valid: StoredDraft[] = [];
        let damaged = false;
        for (const key of candidates) {
          authorised();
          const raw = await storage.getItem(key);
          authorised();
          try {
            check(key === recordPrefix + "0" || key === recordPrefix + "1");
            check(raw !== null);
            const record = JSON.parse(raw) as StoredDraft;
            validateRecord(record, id);
            check(record.localRevision % 2 === Number(key.slice(-1)));
            valid.push(record);
          } catch { damaged = true; }
        }
        if (!valid.length) {
          check(!candidates.length, "RECOVERY_REQUIRED");
          return null;
        }
        valid.sort((a, b) => b.localRevision - a.localRevision);
        if (valid.length === 2) {
          check(valid[0].localRevision === valid[1].localRevision + 1
            && valid[0].createdAtMs === valid[1].createdAtMs
            && (valid[0].localSchemaVersion === valid[1].localSchemaVersion || (valid[0].localSchemaVersion !== 1 && valid[1].localSchemaVersion !== 1))
            && storedIdentity(valid[0]) === storedIdentity(valid[1]), "RECOVERY_REQUIRED");
        }
        authorised();
        return { draft: valid[0], deviceState: damaged ? "Save Failed" : "Saved on Device", syncState: "Pending Sync", recovered: damaged, canEdit: !damaged, contextChanged: false };
      }
      async function listInternal() {
        const all = await keys();
        const ids = new Set<string>();
        for (const key of all) {
          const parts = key.slice(prefix.length).split("/");
          check(parts.length === 2 && /^[01]$/.test(parts[1]), "RECOVERY_REQUIRED");
          validId(parts[0]); ids.add(parts[0]);
        }
        const records: DraftResult[] = [];
        for (const id of ids) {
          const record = await read(id, all);
          if (record) records.push(record);
        }
        return records;
      }
      async function persist(draft: StoredDraft): Promise<DraftResult> {
        validateRecord(draft, draft.inspectionId);
        const key = prefix + draft.inspectionId + "/" + draft.localRevision % 2;
        const raw = JSON.stringify(draft);
        check(raw.length <= 500000, "DRAFT_TOO_LARGE"); // Bound native row size; never evict unsynced work.
        try {
          authorised();
          await storage.setItem(key, raw);
          authorised();
          const confirmed = await storage.getItem(key);
          authorised();
          check(confirmed === raw, "WRITE_NOT_CONFIRMED");
        } catch {
          authorised(); // Never return another session's data in an error object.
          throw new DraftStoreError("SAVE_FAILED", clone(draft));
        }
        return { draft: clone(draft), deviceState: "Saved on Device", syncState: "Pending Sync", recovered: false, canEdit: true, contextChanged: false };
      }
      async function archiveCopies(inspectionId: string, all: string[]) {
        const archiveId = generateId(); validId(archiveId);
        const archivePrefix = prefix.replace("/inspection-drafts/", "/inspection-draft-recovery/") + inspectionId + "/" + archiveId + "/";
        for (const key of all.filter((value) => value.startsWith(prefix + inspectionId + "/"))) {
          authorised(); const raw = await storage.getItem(key); authorised(); check(raw !== null, "RECOVERY_REQUIRED");
          const target = archivePrefix + key.slice(-1);
          check(await storage.getItem(target) === null, "ID_COLLISION"); authorised();
          await storage.setItem(target, raw); authorised();
          check(await storage.getItem(target) === raw, "ARCHIVE_NOT_CONFIRMED"); authorised();
        }
        return archiveId;
      }
      function audit(draft: LocalNotesDraft, action: AuditEntry["action"], atMs: number) {
        return [...(draft.localSchemaVersion === 3 ? draft.auditHistory : []), { localRevision: draft.localRevision + 1, atMs, action }];
      }
      return {
        assertCurrentSession() { authorised(); },
        developmentChecklistReplacementEnabled: options.allowDevelopmentChecklistReplacement === true,
        /** Explicit local development-only replacement of a known obsolete Water snapshot. */
        replaceDevelopmentDemo(inspectionId: string, expectedRevision: number, verifiedAsset: NotesSeed, gaugePresent: boolean): Promise<DraftResult> {
          fields(verifiedAsset, notesSeedFields); validateNotesSeed(verifiedAsset);
          const asset = clone(verifiedAsset);
          const candidate = routineServicingForAsset(asset, gaugePresent);
          return serial(async () => {
            check(options.allowDevelopmentChecklistReplacement === true, "DEVELOPMENT_REPLACEMENT_DISABLED");
            const all = await keys(); const original = await read(inspectionId, all);
            check(original?.canEdit && original.draft.localSchemaVersion === 3, "RECOVERY_REQUIRED");
            const draft = original.draft;
            check(isDevelopmentWaterChecklistOutdated(draft, asset), "DEVELOPMENT_TEST_DEMO_REQUIRED");
            check(draft.localRevision === expectedRevision, "REVISION_CONFLICT");
            // Every active raw copy is confirmed in a separate archive before
            // the first replacement write. Existing archives are never changed.
            const archiveId = await archiveCopies(inspectionId, all);
            const timestamp = Math.max(now(), draft.updatedAtMs);
            return persist({ ...draft, recoveryArchiveId: archiveId, localRevision: draft.localRevision + 1, updatedAtMs: timestamp,
              servicing: { ...draft.servicing, equipmentClass: candidate.equipmentClass, serviceType: candidate.serviceType,
                checklist: candidate.checklist, answers: candidate.answers },
              auditHistory: audit(draft, "servicing-updated", timestamp) });
          });
        },
        /** Read-only original, retained independently of subsequent slot rotation/recovery. */
        loadPreservedDevelopmentDemo(inspectionId: string): Promise<{ draft: LocalNotesDraft; archiveId: string } | null> {
          return serial(async () => {
            validId(inspectionId);
            const archivePrefix = prefix.replace("/inspection-drafts/", "/inspection-draft-recovery/") + inspectionId + "/";
            authorised(); const all = await storage.getAllKeys(); authorised();
            let found: { draft: LocalNotesDraft; archiveId: string } | null = null;
            for (const key of all.filter((key) => key.startsWith(archivePrefix))) {
              authorised(); const raw = await storage.getItem(key); authorised();
              try {
                const parts = key.slice(archivePrefix.length).split("/");
                validId(parts[0]); check(parts.length === 2 && /^[01]$/.test(parts[1]));
                const draft = JSON.parse(raw!); validateRecord(draft, inspectionId);
                if (draft.localSchemaVersion === 3 && isDevelopmentWaterChecklistOutdated(draft, draft)
                  && (!found || draft.localRevision > found.draft.localRevision)) found = { draft: clone(draft), archiveId: parts[0] };
              } catch { /* Damaged originals remain stored; never replace/delete them. */ }
            }
            return found;
          });
        },
        startOrResume(seed: DraftSeed): Promise<DraftResult> {
          fields(seed, seedFields); validateSeed(seed);
          const captured = clone(seed);
          return serial(async () => {
            const existing = await listInternal();
            check(existing.every((record) => record.canEdit), "RECOVERY_REQUIRED");
            const matches = existing.filter(({ draft }) => draft.assetDocId === captured.assetDocId && draft.serviceType === captured.serviceType);
            check(matches.length <= 1, "DUPLICATE_DRAFTS");
            if (matches.length) {
              check(matches[0].draft.localSchemaVersion === 1, "DRAFT_KIND_MISMATCH");
              return { ...matches[0], contextChanged: identity(matches[0].draft) !== identity(captured) };
            }
            const inspectionId = generateId(); validId(inspectionId);
            check(!existing.some(({ draft }) => draft.inspectionId === inspectionId), "ID_COLLISION");
            const timestamp = now(); integer(timestamp);
            return persist({ ...captured, localSchemaVersion: 1, projectId, userId, companyId, siteId, inspectionId,
              localRevision: 1, createdAtMs: timestamp, updatedAtMs: timestamp,
              answers: captured.questions.map(({ id }) => ({ questionId: id, result: null, notes: "" })),
              sync: { state: "pending-sync", acknowledgedLocalRevision: null },
            });
          });
        },
        load(inspectionId: string) { return serial(async () => read(inspectionId, await keys())); },
        list() { return serial(listInternal); },
        /** One explicit New intent. Retrying this request never allocates a second ID. */
        prepareNewNotes(seed: NotesSeed) {
          fields(seed, notesSeedFields); validateNotesSeed(seed); authorised();
          const captured = clone(seed); const inspectionId = generateId(); validId(inspectionId);
          let attempted = false;
          return { inspectionId, start(): Promise<DraftResult> {
            return serial(async () => {
              const records = await listInternal();
              const existing = records.find(({ draft }) => draft.inspectionId === inspectionId);
              if (existing) {
                // Only reconcile a write made by THIS request, never reuse an old ID.
                check(attempted && existing.draft.localSchemaVersion !== 1
                  && notesIdentity(existing.draft) === notesIdentity(captured), "ID_COLLISION");
                return existing;
              }
              check(records.every((record) => record.canEdit), "RECOVERY_REQUIRED");
              const timestamp = now(); integer(timestamp); attempted = true;
              return persist({ ...captured, localSchemaVersion: 2, draftKind: "engineer-notes", serviceType: "engineer-notes",
                projectId, userId, companyId, siteId, inspectionId, localRevision: 1,
                createdAtMs: timestamp, updatedAtMs: timestamp, engineerNotes: "", recoveryArchiveId: null,
                sync: { state: "pending-sync", acknowledgedLocalRevision: null } });
            });
          } };
        },
        update(inspectionId: string, expectedRevision: number, answers: ExtinguisherInspectionAnswerV1[]): Promise<DraftResult> {
          // Capture caller-owned arrays before waiting for another queued write.
          const captured = captureAnswers(answers);
          return serial(async () => {
            const existing = await read(inspectionId, await keys());
            check(existing, "DRAFT_NOT_FOUND");
            check(existing.draft.localSchemaVersion === 1, "DRAFT_KIND_MISMATCH");
            check(existing.canEdit, "RECOVERY_REQUIRED");
            check(existing.draft.localRevision === expectedRevision, "REVISION_CONFLICT");
            validateAnswers(captured, existing.draft);
            return persist({ ...existing.draft, answers: captured, localRevision: expectedRevision + 1,
              updatedAtMs: Math.max(now(), existing.draft.updatedAtMs),
              sync: { state: "pending-sync", acknowledgedLocalRevision: null },
            });
          });
        },
        startOrResumeNotes(seed: NotesSeed): Promise<DraftResult> {
          fields(seed, notesSeedFields); validateNotesSeed(seed);
          const captured = clone(seed);
          return serial(async () => {
            const records = await listInternal();
            const matches = records.filter(({ draft }) => draft.localSchemaVersion !== 1 && draft.assetDocId === captured.assetDocId);
            check(matches.length <= 1, "DUPLICATE_DRAFTS");
            if (matches.length) return { ...matches[0], contextChanged: notesIdentity(matches[0].draft as LocalNotesDraft) !== notesIdentity(captured) };
            check(records.every((record) => record.canEdit), "RECOVERY_REQUIRED");
            const inspectionId = generateId(); validId(inspectionId);
            check(!records.some(({ draft }) => draft.inspectionId === inspectionId), "ID_COLLISION");
            const timestamp = now(); integer(timestamp);
            return persist({ ...captured, localSchemaVersion: 2, draftKind: "engineer-notes", serviceType: "engineer-notes",
              projectId, userId, companyId, siteId, inspectionId, localRevision: 1,
              createdAtMs: timestamp, updatedAtMs: timestamp, engineerNotes: "", recoveryArchiveId: null,
              sync: { state: "pending-sync", acknowledgedLocalRevision: null },
            });
          });
        },
        updateNotes(inspectionId: string, expectedRevision: number, engineerNotes: string): Promise<DraftResult> {
          text(engineerNotes, 8000, true);
          return serial(async () => {
            const existing = await read(inspectionId, await keys());
            check(existing, "DRAFT_NOT_FOUND");
            check(existing.canEdit, "RECOVERY_REQUIRED");
            check(existing.draft.localSchemaVersion !== 1, "DRAFT_KIND_MISMATCH");
            check(existing.draft.localRevision === expectedRevision, "REVISION_CONFLICT");
            const timestamp = Math.max(now(), existing.draft.updatedAtMs);
            return persist({ ...existing.draft, engineerNotes, localRevision: expectedRevision + 1, updatedAtMs: timestamp,
              ...(existing.draft.localSchemaVersion === 3 ? { auditHistory: audit(existing.draft, "notes-updated", timestamp) } : {}) });
          });
        },
        updateServicing(inspectionId: string, expectedRevision: number, engineerNotes: string, servicing: ServicingDraft): Promise<DraftResult> {
          text(engineerNotes, 8000, true); validateServicingDraft(servicing); const captured = clone(servicing);
          return serial(async () => {
            const all = await keys(); const existing = await read(inspectionId, all);
            check(existing?.canEdit && existing.draft.localSchemaVersion !== 1, "RECOVERY_REQUIRED");
            check(existing.draft.localRevision === expectedRevision, "REVISION_CONFLICT");
            const draft = existing.draft;
            if (draft.localSchemaVersion === 3 && draft.servicing.checklist) {
              check(JSON.stringify(captured.checklist) === JSON.stringify(draft.servicing.checklist), "CHECKLIST_SNAPSHOT_IMMUTABLE");
            }
            const archiveId = draft.localSchemaVersion === 2 ? await archiveCopies(inspectionId, all) : draft.recoveryArchiveId;
            const timestamp = Math.max(now(), draft.updatedAtMs);
            return persist({ ...draft, localSchemaVersion: 3, engineerNotes, servicing: captured, recoveryArchiveId: archiveId,
              localRevision: expectedRevision + 1, updatedAtMs: timestamp,
              auditHistory: audit(draft, draft.localSchemaVersion === 2 ? "servicing-started" : "servicing-updated", timestamp) });
          });
        },
        /** Explicit user recovery only: archive EVERY raw copy before replacing damage. */
        recoverNotes(inspectionId: string, expectedRevision: number): Promise<DraftResult> {
          return serial(async () => {
            const all = await keys(); const existing = await read(inspectionId, all);
            check(existing?.recovered && existing.draft.localSchemaVersion !== 1, "RECOVERY_NOT_AVAILABLE");
            check(existing.draft.localRevision === expectedRevision, "REVISION_CONFLICT");
            const archiveId = await archiveCopies(inspectionId, all);
            const timestamp = Math.max(now(), existing.draft.updatedAtMs);
            return persist({ ...existing.draft, localRevision: expectedRevision + 1,
              updatedAtMs: timestamp, recoveryArchiveId: archiveId,
              ...(existing.draft.localSchemaVersion === 3 ? { auditHistory: audit(existing.draft, "recovered", timestamp) } : {}) });
          });
        },
      };
    },
  };
}
