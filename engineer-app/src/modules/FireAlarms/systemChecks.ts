import { validateDetectorSitingObservations, type DetectorSitingObservations } from "./detectorSitingGuidance.ts";
import { calculateExistingCmin } from "../../utils/cminCalculation.ts";

export const SYSTEM_QUESTIONS = [
  { id: "panel-equipment-condition", prompt: "Panel and accessible equipment in satisfactory condition?" },
  { id: "visible-cables-connections", prompt: "Visible cables and connections undamaged and satisfactory?" },
  { id: "circuit-wiring-monitoring", prompt: "Circuit wiring and relevant fault monitoring satisfactory?" },
  { id: "fuse-ratings", prompt: "Correct fuse ratings fitted, where verifiable?" },
  { id: "mains-isolation-protection", prompt: "Dedicated mains, labelled isolation and protection satisfactory?" },
  { id: "sounder-operation", prompt: "Sounder operation satisfactory?" },
  { id: "vad-operation", prompt: "VAD operation satisfactory, where required?" },
  { id: "arc-signalling-receipt", prompt: "ARC transmission tested and receipt confirmed, where fitted?" },
  { id: "zone-plans-records", prompt: "Zone plans and system records satisfactory?" },
  { id: "cause-effect-interfaces", prompt: "Cause and effect / interfaces satisfactory?" },
  { id: "faults-disablements", prompt: "Faults and disablements checked and recorded?" },
  { id: "equipment-cleanliness", prompt: "Panel and accessible equipment clean?" },
] as const;
export const MEASUREMENTS = [
  { id: "standbyMA", label: "Standby current", unit: "mA", positive: false },
  { id: "alarmMA", label: "Current in alarm", unit: "mA", positive: false },
  { id: "batteryVoltage", label: "Battery voltage", unit: "V", positive: false },
  { id: "batteryAh", label: "Installed capacity", unit: "Ah", positive: true },
  { id: "standbyHours", label: "Standby duration", unit: "h", positive: true },
  { id: "alarmMinutes", label: "Alarm duration", unit: "min", positive: true },
] as const;
export type MeasurementId = typeof MEASUREMENTS[number]["id"];
export function toggleResult(current: null | "pass" | "fail" | "na", pressed: "pass" | "fail" | "na") {
  return current === pressed ? null : pressed;
}
export type SystemChecks = { template: { id: string; version: number; status: "pending-technical-validation"; questions: { id: string; prompt: string }[] };
  answers: { checkId: string; result: null | "pass" | "fail" | "na"; fault: string }[];
  measurements: Record<MeasurementId, string>; buildingChanges: null | "yes" | "no"; buildingDetails: string;
  arcConnected: null | "yes" | "no"; transmissionConfirmed: boolean; receiptConfirmed: boolean; additionalComments: string; detectorSitingObservations?: DetectorSitingObservations };
export function emptySystemChecks(): SystemChecks {
  return { template: { id: "PENDING-FA-SYSTEM", version: 1, status: "pending-technical-validation", questions: SYSTEM_QUESTIONS.map((row) => ({ ...row })) },
    answers: SYSTEM_QUESTIONS.map(({ id }) => ({ checkId: id, result: null, fault: "" })),
    measurements: { standbyMA: "", alarmMA: "", batteryVoltage: "", batteryAh: "", standbyHours: "", alarmMinutes: "" },
    buildingChanges: null, buildingDetails: "", arcConnected: null, transmissionConfirmed: false, receiptConfirmed: false, additionalComments: "" };
}
function requireValue(value: unknown): asserts value { if (!value) throw new Error("INVALID_SYSTEM_CHECKS"); }
function keys(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((key) => Object.hasOwn(value, key)));
}
export function validateSystemChecks(value: SystemChecks) {
  keys(value, ["template", "answers", "measurements", "buildingChanges", "buildingDetails", "arcConnected", "transmissionConfirmed", "receiptConfirmed", "additionalComments",
    ...(Object.hasOwn(value, "detectorSitingObservations") ? ["detectorSitingObservations"] : [])]);
  if (Object.hasOwn(value, "detectorSitingObservations")) validateDetectorSitingObservations(value.detectorSitingObservations);
  requireValue(JSON.stringify(value.template) === JSON.stringify(emptySystemChecks().template));
  requireValue(Array.isArray(value.answers) && value.answers.length === SYSTEM_QUESTIONS.length);
  value.answers.forEach((answer, index) => {
    keys(answer, ["checkId", "result", "fault"]);
    requireValue(answer.checkId === SYSTEM_QUESTIONS[index].id && [null, "pass", "fail", "na"].includes(answer.result)
      && typeof answer.fault === "string" && answer.fault.length <= 2000);
  });
  keys(value.measurements, MEASUREMENTS.map(({ id }) => id));
  MEASUREMENTS.forEach(({ id }) => requireValue(typeof value.measurements[id] === "string" && value.measurements[id].length <= 40));
  requireValue([null, "yes", "no"].includes(value.buildingChanges) && [null, "yes", "no"].includes(value.arcConnected)
    && typeof value.transmissionConfirmed === "boolean" && typeof value.receiptConfirmed === "boolean");
  for (const text of [value.buildingDetails, value.additionalComments]) requireValue(typeof text === "string" && text.length <= 2000);
}
export function numericReading(text: string, positive = false): number | null {
  const normal = text.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normal)) return null;
  const value = Number(normal); return Number.isFinite(value) && (positive ? value > 0 : value >= 0) ? value : null;
}
export function arcPassAllowed(value: SystemChecks) { return value.arcConnected === "yes" && value.transmissionConfirmed && value.receiptConfirmed; }
export function systemChecksProgress(value: SystemChecks) {
  const complete = value.answers.filter((answer) => answer.result !== null && (answer.result !== "fail" || !!answer.fault.trim())
    && (answer.checkId !== "arc-signalling-receipt" || answer.result !== "pass" || arcPassAllowed(value))).length;
  const buildingComplete = value.buildingChanges === "no" || (value.buildingChanges === "yes" && !!value.buildingDetails.trim());
  return { total: value.answers.length + 1, complete: complete + (buildingComplete ? 1 : 0), failed: value.answers.filter(({ result }) => result === "fail").length,
    buildingDetailsRequired: value.buildingChanges === "yes" && !value.buildingDetails.trim(),
    numericErrors: MEASUREMENTS.filter(({ id, positive }) => value.measurements[id].trim() && numericReading(value.measurements[id], positive) === null).map(({ id }) => id),
    submissionEnabled: false as const };
}
export function systemCmin(value: SystemChecks) {
  const values = ["standbyMA", "alarmMA", "standbyHours", "alarmMinutes"].map((id) => numericReading(value.measurements[id as MeasurementId], true));
  return values.every((v) => v !== null) ? calculateExistingCmin(values[0]!, values[1]!, values[2]!, values[3]!) : null;
}
