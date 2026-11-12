import type { createLocalInspectionDraftStore, DraftResult, LocalNotesDraft, NotesSeed } from "../../services/localInspectionDraftStore";
import { changeChecklistAnswer, emptyServicingDraft, validateServicingDraft, type ServicingDraft } from "./servicingDraft.ts";
import { isDevelopmentWaterChecklistOutdated, routineServicingForAsset, planRoutineInspection } from "./inspectionChecklistSelection.ts";
import type { RoutineInspectionKind } from "./pendingRoutineChecklist";

type SiteStore = ReturnType<ReturnType<typeof createLocalInspectionDraftStore>["forSite"]>;
export interface NotesViewState {
  loading: boolean;
  draft: LocalNotesDraft | null;
  notes: string;
  servicing: ServicingDraft;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  recovery: boolean;
  contextChanged: boolean;
  closed: boolean;
  replacing: boolean;
}
const errorCode = (error: unknown) => (error as { code?: string })?.code ?? "SAVE_FAILED";

/** Screen behaviour kept independent of React so navigation/save races are testable. */
export function createInspectionNotesController(site: SiteStore, seed: NotesSeed, resumeInspectionId?: string, options: { gaugePresent?: boolean; inspectionKind?: RoutineInspectionKind | null; newInspection?: boolean } = {}) {
  if (options.newInspection && resumeInspectionId) throw new Error("CONFLICTING_INSPECTION_INTENT");
  const approvedAsset = { ...seed };
  const newRequest = options.newInspection ? site.prepareNewNotes(approvedAsset) : null;
  const gaugePresent = options.gaugePresent;
  const inspectionKind = options.inspectionKind;
  let state: NotesViewState = { loading: true, draft: null, notes: "", servicing: emptyServicingDraft(), dirty: false, saving: false, error: null, recovery: false, contextChanged: false, closed: false, replacing: false };
  const listeners = new Set<(value: NotesViewState) => void>();
  let opening: Promise<void> | undefined;
  let saving: Promise<boolean> | undefined;
  let leaving: Promise<boolean> | undefined;
  let replacement: Promise<boolean> | undefined;
  function publish(patch: Partial<NotesViewState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  }
  function live() {
    if (state.closed) return false;
    try { site.assertCurrentSession(); return true; }
    catch { invalidate(); return false; }
  }
  function invalidate() {
    publish({ closed: true, draft: null, notes: "", servicing: emptyServicingDraft(), dirty: false, saving: false, loading: false, replacing: false, error: "AUTH_SESSION_CHANGED" });
  }
  function storedServicing(draft: LocalNotesDraft) { return draft.localSchemaVersion === 3 ? draft.servicing : emptyServicingDraft(); }
  function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }
  function accept(result: DraftResult, replaceNotes: boolean) {
    if (result.draft.localSchemaVersion === 1) throw new Error("DRAFT_KIND_MISMATCH");
    const notes = replaceNotes ? result.draft.engineerNotes : state.notes;
    const servicing = replaceNotes ? storedServicing(result.draft) : state.servicing;
    publish({ draft: result.draft, notes, servicing, dirty: notes !== result.draft.engineerNotes || !same(servicing, storedServicing(result.draft)),
      recovery: !result.canEdit, contextChanged: state.contextChanged || result.contextChanged, loading: false });
  }
  function open() {
    if (opening) return opening;
    if (state.draft || !live()) return Promise.resolve();
    opening = (async () => {
      publish({ loading: true, error: null });
      try {
        const result = resumeInspectionId ? await site.load(resumeInspectionId) : newRequest ? await newRequest.start() : await site.startOrResumeNotes(approvedAsset);
        if (!live()) return;
        if (!result) throw Object.assign(new Error("LOCAL_DRAFT_NOT_FOUND"), { code: "LOCAL_DRAFT_NOT_FOUND" });
        if (result.draft.localSchemaVersion === 1 || result.draft.assetDocId !== approvedAsset.assetDocId) throw Object.assign(new Error("DRAFT_KIND_MISMATCH"), { code: "DRAFT_KIND_MISMATCH" });
        const stored = result.draft;
        const changed = Object.keys(approvedAsset).some((key) => approvedAsset[key as keyof NotesSeed] !== stored[key as keyof NotesSeed]);
        accept({ ...result, contextChanged: result.contextChanged || changed }, true);
        // A new, blank draft may use verified configuration directly. Never
        // retemplate an existing/explicitly resumed snapshot or infer a gauge.
        if (!resumeInspectionId && result.canEdit && stored.localSchemaVersion === 2 && stored.localRevision === 1
          && stored.engineerNotes === "" && inspectionKind !== null && (newRequest || typeof gaugePresent === "boolean")) {
          try {
            const servicing = planRoutineInspection(emptyServicingDraft(), approvedAsset.equipmentType, inspectionKind ?? "annual-basic", gaugePresent);
            changeServicing(servicing); await save();
          } catch { /* Unknown/unsupported equipment keeps the existing inline confirmation path. */ }
        }
      }
      catch (error) { if (live()) publish({ loading: false, error: errorCode(error) }); }
    })().finally(() => { opening = undefined; });
    return opening;
  }
  function save(): Promise<boolean> {
    if (saving) return saving;
    if (!live() || state.recovery || !state.draft) return Promise.resolve(false);
    saving = (async () => {
      publish({ saving: true });
      try {
        while (state.dirty && live()) {
          const draft = state.draft!; const notes = state.notes; const servicing = JSON.parse(JSON.stringify(state.servicing)) as ServicingDraft;
          try {
            const result = draft.localSchemaVersion === 3 || !same(servicing, emptyServicingDraft())
              ? await site.updateServicing(draft.inspectionId, draft.localRevision, notes, servicing)
              : await site.updateNotes(draft.inspectionId, draft.localRevision, notes);
            if (!live()) return false;
            accept(result, false); publish({ error: null });
          } catch (error) {
            if (!live()) return false;
            // Reconcile lost local acknowledgements without replacing newer editor text.
            try {
              const latest = await site.load(draft.inspectionId);
              if (!live()) return false;
              if (latest && latest.draft.localSchemaVersion !== 1) {
                if (latest.recovered || (latest.draft.engineerNotes === notes && same(storedServicing(latest.draft), servicing))
                  || (latest.draft.engineerNotes === draft.engineerNotes && same(storedServicing(latest.draft), storedServicing(draft)))) {
                  accept(latest, false);
                  if (!state.dirty && !state.recovery) { publish({ error: null }); return true; }
                }
              }
            } catch { if (!live()) return false; }
            publish({ error: errorCode(error) }); return false;
          }
        }
        return live() && !state.dirty;
      } finally { if (!state.closed) publish({ saving: false }); }
    })().finally(() => { saving = undefined; });
    return saving;
  }
  async function recover() {
    if (!live() || !state.draft || !state.recovery || state.saving) return false;
    const original = state.draft;
    publish({ saving: true, error: null });
    try {
      const result = await site.recoverNotes(state.draft.inspectionId, state.draft.localRevision);
      if (!live()) return false;
      accept(result, false);
    } catch (error) {
      if (!live()) return false;
      try {
        const latest = await site.load(original.inspectionId);
        if (!live()) return false;
        if (latest?.canEdit && latest.draft.localSchemaVersion !== 1
          && latest.draft.localRevision > original.localRevision
          && latest.draft.recoveryArchiveId !== null && latest.draft.recoveryArchiveId !== original.recoveryArchiveId) {
          accept(latest, false); publish({ error: null });
        } else { publish({ error: errorCode(error) }); return false; }
      } catch { if (live()) publish({ error: errorCode(error) }); return false; }
    }
    finally { if (!state.closed) publish({ saving: false }); }
    return state.dirty ? save() : true;
  }
  function changeServicing(servicing: ServicingDraft) {
    if (!live() || !state.draft || state.recovery || state.replacing) return;
    validateServicingDraft(servicing);
    const captured = JSON.parse(JSON.stringify(servicing)) as ServicingDraft;
    publish({ servicing: captured, dirty: state.notes !== state.draft.engineerNotes || !same(captured, storedServicing(state.draft)) });
  }
  function canReplaceDevelopmentDemo() {
    return site.developmentChecklistReplacementEnabled && isDevelopmentWaterChecklistOutdated(state.draft, approvedAsset) && !state.recovery && !state.closed;
  }
  function replaceDevelopmentDemo(gaugePresent: boolean): Promise<boolean> {
    if (replacement) return replacement;
    if (!live() || !canReplaceDevelopmentDemo()) return Promise.resolve(false);
    publish({ replacing: true, error: null });
    replacement = (async () => {
      try {
        if ((state.dirty || saving) && !await save()) return false;
        if (!live() || !state.draft) return false;
        const original = state.draft;
        try {
          const result = await site.replaceDevelopmentDemo(original.inspectionId, original.localRevision, approvedAsset, gaugePresent);
          if (!live()) return false;
          accept(result, true); publish({ error: null }); return true;
        } catch (error) {
          if (!live()) return false;
          // Reconcile a persisted replacement whose local acknowledgement was lost.
          try {
            const latest = await site.load(original.inspectionId);
            const expected = routineServicingForAsset(approvedAsset, gaugePresent).checklist;
            if (!live()) return false;
            if (latest?.canEdit && latest.draft.localSchemaVersion === 3 && latest.draft.localRevision > original.localRevision
              && latest.draft.recoveryArchiveId !== original.recoveryArchiveId
              && JSON.stringify(latest.draft.servicing.checklist) === JSON.stringify(expected)) {
              accept(latest, true); publish({ error: null }); return true;
            }
          } catch { if (!live()) return false; }
          publish({ error: errorCode(error) }); return false;
        }
      } finally { if (!state.closed) publish({ replacing: false }); }
    })().finally(() => { replacement = undefined; });
    return replacement;
  }
  return {
    getAsset: () => ({ ...approvedAsset }),
    getState: () => state,
    subscribe(listener: (value: NotesViewState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open, save, recover, invalidate,
    isCurrentSession: live,
    canReplaceDevelopmentDemo, replaceDevelopmentDemo,
    getGaugePresence: () => gaugePresent,
    async loadPreservedDevelopmentDemo() {
      if (!live() || !state.draft) return null;
      const result = await site.loadPreservedDevelopmentDemo(state.draft.inspectionId);
      return live() ? result : null;
    },
    changeNotes(notes: string) {
      if (!live() || !state.draft || state.recovery || state.replacing || notes.length > 8000) return;
      publish({ notes, dirty: notes !== state.draft.engineerNotes || !same(state.servicing, storedServicing(state.draft)) });
    },
    changeServicing,
    changeAnswer(questionId: string, patch: Partial<ServicingDraft["answers"][number]>) {
      if (!live() || !state.draft || state.recovery || state.replacing) return;
      changeServicing(changeChecklistAnswer(state.servicing, questionId, patch));
    },
    leave(navigate: () => void): Promise<boolean> {
      if (state.replacing) return Promise.resolve(false);
      if (leaving) return leaving;
      leaving = (async () => {
        if (!live()) return false;
        if (state.saving && !saving) return false; // Recovery must finish before navigation.
        if ((state.dirty || saving) && !await save()) return false;
        if (!live()) return false;
        publish({ closed: true }); navigate(); return true;
      })().finally(() => { leaving = undefined; });
      return leaving;
    },
  };
}
