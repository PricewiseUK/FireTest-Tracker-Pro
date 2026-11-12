import type { createLocalInspectionDraftStore, DraftSession, DraftStorage } from "../../services/localInspectionDraftStore";
import { canStartInspection } from "./approvedInspectionAsset.ts";
import { inspectionDraftSummary } from "./inspectionDraftSummary.ts";

export type SiteLabel = { id: string; name: string };
export type ResumeEntry = { inspectionId: string; siteId: string; siteName: string; assetDocId: string; assetReference: string; updatedAtMs: number; createdAtMs: number; label: string; checks: number; recovery: boolean; compatible: boolean };
type DraftStore = ReturnType<typeof createLocalInspectionDraftStore>;
export function siteSelectionFeature(routine: boolean) { return routine ? "assets" : null; }
export function siteNavigationBack<T>(routine: boolean, building: T | null, feature: string | null) {
  if (feature) return { building: routine && feature === "assets" ? null : building, feature: null, exit: false };
  return { building: null, feature: null, exit: building === null };
}
/** Display preference only: a remembered ID never bypasses the loaded site list. */
export function orderSites<T extends SiteLabel>(sites: T[], recentIds: string[]): T[] {
  return [...sites].sort((a, b) => {
    const ai = recentIds.indexOf(a.id); const bi = recentIds.indexOf(b.id);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a.name.localeCompare(b.name);
  });
}
export function createEngineerNavigation(options: { storage: DraftStorage; draftStore: DraftStore; projectId: string; getSession: () => DraftSession }) {
  const { storage, draftStore, projectId, getSession } = options;
  const queues = new Map<string, Promise<unknown>>();
  return {
    forCompany(companyId: string) {
      const session = { ...getSession() };
      if (!session.userId || !companyId || !projectId) throw new Error("AUTH_REQUIRED");
      const key = "@instafire/extinguisher-navigation/v1/" + [projectId, session.userId, companyId].map(encodeURIComponent).join("/");
      function assertCurrent() {
        const current = getSession();
        if (current.userId !== session.userId || current.epoch !== session.epoch) throw new Error("AUTH_SESSION_CHANGED");
      }
      async function read(): Promise<{ sites: SiteLabel[]; recentIds: string[] }> {
        assertCurrent(); const raw = await storage.getItem(key); assertCurrent();
        if (!raw) return { sites: [], recentIds: [] };
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.sites) || data.sites.length > 500 || !Array.isArray(data.recentIds)
          || data.recentIds.length > 3 || !data.recentIds.every((id: unknown) => typeof id === "string")
          || !data.sites.every((site: SiteLabel) => site && typeof site.id === "string" && site.id.length > 0 && site.id.length <= 1500 && typeof site.name === "string" && site.name.length <= 200)) throw new Error("SITE_CACHE_UNAVAILABLE");
        return { sites: data.sites.map(({ id, name }: SiteLabel) => ({ id, name })), recentIds: data.recentIds };
      }
      return {
        assertCurrent, read,
        rememberSite(site: SiteLabel) {
          assertCurrent();
          if (!site.id || site.id.length > 1500 || typeof site.name !== "string" || site.name.length > 200) return Promise.reject(new Error("INVALID_SITE_LABEL"));
          const captured = { id: site.id, name: site.name };
          const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
            const previous = await read(); assertCurrent();
            const value = { version: 1, recentIds: [captured.id, ...previous.recentIds.filter((id) => id !== captured.id)].slice(0, 3),
              sites: [captured, ...previous.sites.filter((entry) => entry.id !== captured.id)].slice(0, 500) };
            await storage.setItem(key, JSON.stringify(value)); assertCurrent();
          });
          queues.set(key, task); void task.finally(() => { if (queues.get(key) === task) queues.delete(key); }).catch(() => {});
          return task;
        },
        async listDrafts(role: string, assignedSites: readonly string[]) {
          assertCurrent();
          let labels: SiteLabel[] = []; const problems: { siteId: string; message: string }[] = [];
          try { labels = (await read()).sites; } catch { assertCurrent(); problems.push({ siteId: "", message: "Cached site names unavailable. Site IDs are shown; drafts are retained." }); }
          const siteIds = await draftStore.listSiteIds(companyId); assertCurrent();
          const drafts: ResumeEntry[] = [];
          for (const siteId of siteIds.filter((id) => canStartInspection(role, assignedSites, id))) {
            try {
              const records = await draftStore.forSite(companyId, siteId).list(); assertCurrent();
              for (const record of records) {
                const draft = record.draft;
                drafts.push({ inspectionId: draft.inspectionId, siteId, siteName: labels.find((site) => site.id === siteId)?.name || `Site ${siteId} (name not cached)`,
                  assetDocId: draft.assetDocId, assetReference: draft.assetReference, updatedAtMs: draft.updatedAtMs,
                  ...(draft.localSchemaVersion !== 1 ? inspectionDraftSummary(draft) : { createdAtMs: draft.createdAtMs, label: "Earlier Inspection Draft", checks: draft.answers.length }),
                  recovery: !record.canEdit, compatible: draft.localSchemaVersion !== 1 });
              }
            } catch {
              assertCurrent(); problems.push({ siteId, message: "Drafts at this site need storage/recovery review. All copies are retained; use the approved list to open the existing recovery flow." });
            }
          }
          assertCurrent(); return { drafts: drafts.sort((a, b) => b.updatedAtMs - a.updatedAtMs), problems };
        },
      };
    },
  };
}
