import type { createLocalFireAlarmDraftStore, FireAlarmAnswer, FireAlarmDraft, FireAlarmRead } from "../../services/localFireAlarmDraftStore";
import { emptySystemChecks, validateSystemChecks, arcPassAllowed, toggleResult, type SystemChecks } from "./systemChecks.ts";

type SystemStore = ReturnType<ReturnType<typeof createLocalFireAlarmDraftStore>["forSystem"]>;
type State = { loading: boolean; draft: FireAlarmDraft | null; answers: FireAlarmAnswer[]; systemChecks: SystemChecks | null; dirty: boolean; saving: boolean; recovery: boolean; error: string | null; closed: boolean };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function createFireAlarmTestingController(store: SystemStore, deviceIds: string[]) {
  const ids = [...deviceIds]; let state: State = { loading: true, draft: null, answers: [], systemChecks: null, dirty: false, saving: false, recovery: false, error: null, closed: false };
  const listeners = new Set<(value: State) => void>(); let opening: Promise<void> | undefined; let saving: Promise<boolean> | undefined; let recovery: Promise<boolean> | undefined; let leaving: Promise<boolean> | undefined;
  const publish = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)); };
  function live() {
    if (state.closed) return false;
    try { store.assertCurrentSession(); return true; } catch { publish({ closed: true, draft: null, answers: [], systemChecks: null, dirty: false, saving: false, loading: false, error: "AUTH_SESSION_CHANGED" }); return false; }
  }
  function accept(result: FireAlarmRead, replace: boolean) {
    const answers = replace ? result.draft.answers : state.answers;
    const systemChecks = replace ? result.draft.systemChecks ?? null : state.systemChecks;
    publish({ draft: result.draft, answers, systemChecks, dirty: !same(answers, result.draft.answers) || !same(systemChecks, result.draft.systemChecks ?? null), recovery: result.recovery, loading: false });
  }
  function error(error: unknown) { return (error as { code?: string }).code ?? "SAVE_FAILED"; }
  function open() {
    if (opening) return opening;
    if (!live() || state.draft) return Promise.resolve();
    opening = (async () => {
      publish({ loading: true, error: null });
      try { const result = await store.open(ids); if (live()) accept(result, true); }
      catch (e) { if (live()) publish({ loading: false, error: error(e) }); }
    })().finally(() => { opening = undefined; }); return opening;
  }
  function save(): Promise<boolean> {
    if (saving) return saving;
    if (!live() || !state.draft || state.recovery) return Promise.resolve(false);
    saving = (async () => {
      publish({ saving: true });
      try {
        while (live() && state.dirty) {
          const draft = state.draft!; const captured = state.answers.map((row) => ({ ...row })); const checks = state.systemChecks ? JSON.parse(JSON.stringify(state.systemChecks)) as SystemChecks : null;
          try { const result = await store.save(draft.draftId, draft.revision, captured, checks); if (!live()) return false; accept(result, false); publish({ error: null }); }
          catch (e) {
            if (!live()) return false;
            try {
              const latest = await store.open(ids); if (!live()) return false;
              if (latest.recovery || (same(latest.draft.answers, captured) && same(latest.draft.systemChecks ?? null, checks)) || (latest.draft.revision === draft.revision && same(latest.draft.answers, draft.answers) && same(latest.draft.systemChecks ?? null, draft.systemChecks ?? null))) {
                accept(latest, false); if (!state.dirty && !state.recovery) { publish({ error: null }); return true; }
              }
            } catch { if (!live()) return false; }
            publish({ error: error(e) }); return false;
          }
        }
        return live() && !state.dirty;
      } finally { if (!state.closed) publish({ saving: false }); }
    })().finally(() => { saving = undefined; }); return saving;
  }
  function change(deviceId: string, patch: Partial<Pick<FireAlarmAnswer, "result" | "fault">>) {
      if (!live() || !state.draft || state.recovery || recovery) return;
      if (!ids.includes(deviceId) || (patch.result !== undefined && ![null, "pass", "fail", "na"].includes(patch.result)) || (patch.fault !== undefined && (typeof patch.fault !== "string" || patch.fault.length > 2000))) return;
      const answers = state.answers.map((row) => row.deviceId === deviceId ? { ...row,
        ...(patch.result !== undefined ? { result: patch.result } : {}), ...(patch.fault !== undefined ? { fault: patch.fault } : {}) } : row);
      publish({ answers, dirty: !same(answers, state.draft.answers) || !same(state.systemChecks, state.draft.systemChecks ?? null) });
  }
  return {
    getState: () => state, open, save, change,
    subscribe(listener: (value: State) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    selectDeviceResult(deviceId: string, result: "pass" | "fail" | "na") {
      const answer = state.answers.find((row) => row.deviceId === deviceId);
      if (answer) change(deviceId, { result: toggleResult(answer.result, result) });
    },
    changeSystem(update: (value: SystemChecks) => SystemChecks) {
      if (!live() || !state.draft || state.recovery || recovery) return;
      const current = state.systemChecks ?? emptySystemChecks();
      const next = update(JSON.parse(JSON.stringify(current)) as SystemChecks); validateSystemChecks(next);
      const arc = next.answers.find((row) => row.checkId === "arc-signalling-receipt");
      const oldArc = current.answers.find((row) => row.checkId === "arc-signalling-receipt");
      if (arc?.result === "pass" && oldArc?.result !== "pass" && !arcPassAllowed(next)) return;
      publish({ systemChecks: next, dirty: !same(state.answers, state.draft.answers) || !same(next, state.draft.systemChecks ?? null) });
    },
    leave(navigate: () => void): Promise<boolean> {
      if (leaving) return leaving;
      leaving = (async () => {
        if (opening) await opening;
        if (recovery || !live() || (state.dirty || saving) && !await save()) return false;
        if (!live()) return false; publish({ closed: true }); navigate(); return true;
      })().finally(() => { leaving = undefined; }); return leaving;
    },
    recover(): Promise<boolean> {
      if (recovery) return recovery;
      if (!live() || !state.draft || !state.recovery) return Promise.resolve(false);
      const draft = state.draft; publish({ saving: true });
      recovery = (async () => {
        try { const result = await store.recover(draft.draftId, draft.revision); if (!live()) return false; accept(result, false); publish({ error: null }); return state.dirty ? await save() : true; }
        catch (e) {
          if (!live()) return false;
          try { const result = await store.open(ids); if (live() && !result.recovery && result.draft.revision > draft.revision) { accept(result, false); publish({ error: null }); return state.dirty ? await save() : true; } } catch { if (!live()) return false; }
          if (live()) publish({ error: error(e) }); return false;
        } finally { if (!state.closed) publish({ saving: false }); }
      })().finally(() => { recovery = undefined; }); return recovery;
    },
  };
}
