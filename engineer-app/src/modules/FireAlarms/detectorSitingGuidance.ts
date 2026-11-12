/** Locally bundled, original summaries of the reviewed starting topics.
 * Version 1 is immutable: retain it when adding later editions/versions so saved
 * observations continue to resolve the exact guidance the engineer used.
 * References: BS 5839-1:2025, clauses 21.1.4, 21.2.9 and 21.1.5.
 * These are advisory installation observations, not automatic defect decisions.
 */
export const DETECTOR_SITING_GUIDANCE_VERSION = 1 as const;
const reference = (id: string, clause: string) => ({
  id, libraryVersion: DETECTOR_SITING_GUIDANCE_VERSION, standard: "BS 5839-1", edition: "2025", clause,
});
export const DETECTOR_SITING_GUIDANCE = [
  {
    checkId: "roof-ceiling-void-detection",
    prompt: "Detection coverage in roof and ceiling voids satisfactory within the inspection scope?",
    title: "Detection in roof or ceiling voids",
    reference: reference("fa-siting-voids", "21.1.4"),
    explanation: "Where the system category calls for detection in the surrounding area, horizontal voids 800 mm or higher generally need detection too. Shallower voids can also need protection where fire or smoke could spread, or the fire risk assessment identifies a need. An appropriate omission may be agreed by the interested parties and recorded as a variation in the system documentation.",
    action: "Check the system category, void height, fire risk assessment and design records. Recommend additional detection where justified, taking account of any agreed, documented variation.",
  },
  {
    checkId: "detector-ceiling-obstructions",
    prompt: "Detector separation from light fittings and ceiling obstructions satisfactory within the inspection scope?",
    title: "Detector proximity to luminaires and ceiling obstructions",
    reference: reference("fa-siting-obstructions", "21.2.9"),
    explanation: "Some ceiling obstructions require detector separation of twice their depth: a 100 mm obstruction would mean 200 mm separation. This recommendation concerns relevant attachments up to 250 mm deep that obstruct smoke flow; a gap above the feature greater than 300 mm can change its applicability. Do not apply it to every light fitting without checking geometry, ceiling clearances and manufacturer instructions.",
    action: "Measure the obstruction and detector separation, confirm which recommendation applies, then recommend repositioning where necessary.",
  },
  {
    checkId: "skylight-upstand-detection",
    prompt: "Detection in deep skylights, roof lanterns and upstands satisfactory within the inspection scope?",
    title: "Deep skylights, roof lanterns and ceiling upstands",
    reference: reference("fa-siting-upstands", "21.1.5"),
    explanation: "Within a protected area, a roof or ceiling upstand generally needs its own detector when it is at least 800 mm deep, or when it is used for ventilation.",
    action: "Check the upstand depth, ventilation use and documented detection coverage. Recommend suitable detection where required.",
  },
] as const;

export type SitingResult = null | "pass" | "fail" | "na";
export type GuidanceReference = ReturnType<typeof reference>;
export type SitingObservation = {
  checkId: string; result: SitingResult; notes: string; deviceOrLocation: string;
  guidanceRef: GuidanceReference | null;
};
export type DetectorSitingObservations = { version: 1; inScope: boolean; answers: SitingObservation[] };
export function emptyDetectorSitingObservations(): DetectorSitingObservations {
  return { version: 1, inScope: false, answers: DETECTOR_SITING_GUIDANCE.map(({ checkId }) => ({
    checkId, result: null, notes: "", deviceOrLocation: "", guidanceRef: null,
  })) };
}
export function selectSitingResult(value: DetectorSitingObservations, checkId: string, pressed: Exclude<SitingResult, null>): DetectorSitingObservations {
  if (!value.inScope || !["pass", "fail", "na"].includes(pressed)) return value;
  const topic = DETECTOR_SITING_GUIDANCE.find((entry) => entry.checkId === checkId);
  if (!topic) return value;
  return { ...value, answers: value.answers.map((row) => row.checkId === checkId ? {
    ...row, result: row.result === pressed ? null : pressed,
    guidanceRef: pressed === "fail" ? row.guidanceRef ?? { ...topic.reference } : row.guidanceRef,
  } : row) };
}
export function observationGuidance(answer: SitingObservation) {
  if (answer.result !== "fail" || !answer.guidanceRef) return null;
  return DETECTOR_SITING_GUIDANCE.find((topic) => topic.checkId === answer.checkId &&
    sameReference(topic.reference, answer.guidanceRef!)) ?? null;
}
function sameReference(a: GuidanceReference, b: GuidanceReference) {
  return a.id === b.id && a.libraryVersion === b.libraryVersion && a.standard === b.standard && a.edition === b.edition && a.clause === b.clause;
}
export function detectorSitingProgress(value?: DetectorSitingObservations) {
  const answers = value?.inScope ? value.answers : [];
  return { total: answers.length,
    complete: answers.filter((row) => row.result !== null && (row.result !== "fail" || !!row.notes.trim())).length,
    failed: answers.filter((row) => row.result === "fail").length,
    needsNotes: answers.filter((row) => row.result === "fail" && !row.notes.trim()).length };
}
function requireValue(value: unknown): asserts value { if (!value) throw new Error("INVALID_DETECTOR_SITING_OBSERVATIONS"); }
function keys(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)));
}
export function validateDetectorSitingObservations(value: unknown): asserts value is DetectorSitingObservations {
  keys(value, ["version", "inScope", "answers"]);
  requireValue(value.version === 1 && typeof value.inScope === "boolean" && Array.isArray(value.answers) && value.answers.length === DETECTOR_SITING_GUIDANCE.length);
  (value.answers as unknown[]).forEach((row, index) => {
    keys(row, ["checkId", "result", "notes", "deviceOrLocation", "guidanceRef"]);
    const topic = DETECTOR_SITING_GUIDANCE[index];
    requireValue(row.checkId === topic.checkId && [null, "pass", "fail", "na"].includes(row.result as SitingResult));
    requireValue(typeof row.notes === "string" && row.notes.length <= 2000 && typeof row.deviceOrLocation === "string" && row.deviceOrLocation.length <= 300);
    if (row.guidanceRef !== null) {
      keys(row.guidanceRef, ["id", "libraryVersion", "standard", "edition", "clause"]);
      requireValue(sameReference(topic.reference, row.guidanceRef as GuidanceReference));
    }
    requireValue(row.result !== "fail" || row.guidanceRef !== null);
  });
}
