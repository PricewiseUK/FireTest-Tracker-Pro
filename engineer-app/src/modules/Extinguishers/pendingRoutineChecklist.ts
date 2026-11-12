import type { EquipmentClass, ApprovedChecklist } from "./servicingDraft";

export type RoutineMedium = "water" | "foam" | "co2" | "powder" | "wet-chemical";
export type RoutineInspectionKind = "monthly-visual" | "annual-basic";
export function inspectionAudience(kind: RoutineInspectionKind) {
  return kind === "monthly-visual" ? "Responsible person / designated staff" : "Competent extinguisher technician";
}
export interface PendingRoutineChecklist extends Omit<ApprovedChecklist, "approval"> {
  approval: { status: "pending-technical-validation"; approvedBy: string; approvedAt: string; source: string };
  equipmentMedium: RoutineMedium;
  gaugePresent: boolean;
}
export const ROUTINE_LABELS: Record<RoutineMedium, string> = { water: "Water", foam: "Foam", co2: "CO₂", powder: "Powder", "wet-chemical": "Wet chemical" };
export function routineMediumFor(assetType: string): RoutineMedium | null {
  const key = assetType.toLowerCase().replaceAll("₂", "2").replace(/[^a-z0-9]/g, "");
  const known: Record<string, RoutineMedium> = { water: "water", foam: "foam", co2: "co2", carbondioxide: "co2", powder: "powder", drypowder: "powder", wetchemical: "wet-chemical" };
  return known[key] ?? null;
}
const equipmentClassFor: Record<RoutineMedium, EquipmentClass> = { water: "water-based", foam: "water-based", "wet-chemical": "water-based", co2: "co2", powder: "powder" };
// Candidate wording for technical review, NOT a BS schedule or servicing procedure.
// No pressure/mass thresholds, intervals or dismantling instructions are invented.
const specific: Record<RoutineMedium, [string, string, boolean][]> = {
  water: [
    ["water-discharge", "Are the fitted water discharge hose and nozzle free from apparent damage or obstruction?", true],
    ["water-charge", "Has the water charge assessment been recorded using the model manufacturer's requirements?", false],
    ["water-model", "Have the water model's specific basic-service requirements been assessed?", false],
  ],
  foam: [
    ["foam-label", "Is the foam product identification legible and consistent with this equipment?", false],
    ["foam-discharge", "Are the fitted foam discharge hose and branch/nozzle free from apparent damage or obstruction?", true],
    ["foam-model", "Have the foam model's charge and basic-service requirements been assessed?", false],
  ],
  co2: [
    ["co2-discharge", "Are the CO₂ horn and any fitted hose assembly free from apparent damage or obstruction?", false],
    ["co2-charge", "Has the CO₂ charge/mass assessment been recorded against the model manufacturer's requirements?", false],
    ["co2-cylinder", "Have the cylinder markings and eligibility for continued service been assessed?", false],
  ],
  powder: [
    ["powder-label", "Is the powder product identification legible and consistent with this equipment?", false],
    ["powder-discharge", "Are the fitted powder discharge hose and nozzle free from apparent damage or obstruction?", true],
    ["powder-model", "Have this powder model's construction-specific charge and basic-service requirements been assessed?", false],
  ],
  "wet-chemical": [
    ["wet-label", "Is the wet chemical product identification legible and consistent with this equipment?", false],
    ["wet-discharge", "Are the fitted wet chemical hose, lance and nozzle free from apparent damage or obstruction?", true],
    ["wet-model", "Have the wet chemical model's charge and basic-service requirements been assessed?", false],
  ],
};
const shortPrompts: Record<string, string> = {
  location: "Accessible at the recorded location?", instructions: "Identification and instructions legible?",
  "visible-condition": "Body and controls visibly free from damage, corrosion or leaks?",
  "safety-device": "Safety device and seal intact, if fitted?",
  "water-discharge": "Water hose/nozzle undamaged and unobstructed?", "water-charge": "Water charge assessed to the manufacturer's requirements?", "water-model": "Water model's basic-service requirements assessed?",
  "foam-label": "Foam product identification correct and legible?", "foam-discharge": "Foam hose/nozzle undamaged and unobstructed?", "foam-model": "Foam charge and basic-service requirements assessed?",
  "co2-discharge": "CO₂ horn/hose undamaged and unobstructed?", "co2-charge": "CO₂ charge/mass assessed to the manufacturer's requirements?", "co2-cylinder": "CO₂ cylinder markings and continued-service eligibility assessed?",
  "powder-label": "Powder identification correct and legible?", "powder-discharge": "Powder hose/nozzle undamaged and unobstructed?", "powder-model": "Powder model's charge and basic-service requirements assessed?",
  "wet-label": "Wet chemical identification correct and legible?", "wet-discharge": "Wet chemical hose/lance/nozzle undamaged and unobstructed?", "wet-model": "Wet chemical charge and basic-service requirements assessed?",
  "fitted-gauge": "Fitted pressure indicator assessed to the manufacturer's requirements?",
  "model-review": "Remaining requirements for this model reviewed?",
};
export function pendingRoutineChecklist(medium: RoutineMedium, gaugePresent: boolean, version = 3, kind: RoutineInspectionKind = "annual-basic"): PendingRoutineChecklist {
  if (!Object.hasOwn(ROUTINE_LABELS, medium) || typeof gaugePresent !== "boolean" || (medium === "co2" && gaugePresent)
    || ![1, 2, 3].includes(version) || !["monthly-visual", "annual-basic"].includes(kind)
    || (version < 3 && kind !== "annual-basic")) throw new Error("UNSUPPORTED_ROUTINE_CONFIGURATION");
  if (version === 3) return currentInspectionChecklist(medium, gaugePresent, kind);
  const question = ([id, prompt, allowNA]: [string, string, boolean]) => ({ id, prompt, allowNA });
  const configurationQuestion: [string, string, boolean] = gaugePresent
    ? ["fitted-gauge", "Has the fitted pressure indicator been assessed against the model manufacturer's requirements?", false]
    : ["model-review", "Have the remaining manufacturer-specific basic-service requirements for this confirmed model been reviewed?", false];
  const definition: PendingRoutineChecklist = { id: `PENDING-ANNUAL-${medium}-${gaugePresent ? "GAUGE" : "NO-GAUGE"}`, version: 1, equipmentClass: equipmentClassFor[medium], serviceType: "annual-basic",
    equipmentMedium: medium, gaugePresent,
    approval: { status: "pending-technical-validation", approvedBy: "NOT APPROVED", approvedAt: "2026-11-01T00:00:00Z", source: "Candidate observation prompts only; licensed BS 5306-3 and model-specific technical approval required. Not a complete basic-service procedure." },
    questions: [
      question(["location", "Is the extinguisher accessible at its recorded location?", false]),
      question(["instructions", "Are the identification and operating instructions legible?", false]),
      question(["visible-condition", "Are the visible body and operating parts free from apparent damage, corrosion or leakage?", false]),
      question(["safety-device", "Are the safety device and tamper indication intact where fitted?", true]),
      ...specific[medium].map(question), question(configurationQuestion),
    ] };
  // Keep version 1 byte-for-byte reproducible for existing immutable snapshots.
  return version === 1 ? definition : { ...definition, id: `${definition.id}-v2`, version: 2,
    questions: definition.questions.map((question) => ({ ...question, prompt: shortPrompts[question.id] })) };
}

/** User-supplied 8/11 topic sets. Pending BS/model review, never a certified procedure. */
function currentInspectionChecklist(medium: RoutineMedium, gaugePresent: boolean, kind: RoutineInspectionKind): PendingRoutineChecklist {
  const discharge = medium === "co2" ? "CO₂ horn and any hose satisfactory?"
    : medium === "wet-chemical" ? "Wet chemical hose, lance and nozzle satisfactory?"
      : `${ROUTINE_LABELS[medium]} hose and nozzle satisfactory?`;
  const topics: [string, string][] = kind === "monthly-visual" ? [
    ["location", "Extinguisher accessible and correctly positioned?"],
    ["signage", "Correct signage present and visible?"],
    ["safety-device", "Safety pin and tamper seal intact?"],
    ["fitted-gauge", "Pressure gauge satisfactory, where fitted?"],
    ["visible-condition", "Body free from visible damage or corrosion?"],
    ["discharge-assembly", discharge],
    ["leakage", "No visible signs of discharge or leakage?"],
    ["service-label", "Service label present and details legible?"],
  ] : [
    ["location-risk", "Correct extinguisher for the location and risk?"],
    ["visible-condition", "Body, base and fittings satisfactory?"],
    ["instructions", "Operating instructions and identification legible?"],
    ["operating-mechanism", "Safety pin and operating mechanism satisfactory?"],
    ["safety-device", "Tamper seal and evidence of use checked?"],
    ["discharge-assembly", discharge],
    [gaugePresent ? "fitted-gauge" : "model-pressure", gaugePresent ? "Pressure and gauge checks satisfactory, where applicable?" : "Applicable pressure checks satisfactory to manufacturer procedure?"],
    ["contents", medium === "co2" ? "CO₂ weight verification satisfactory to manufacturer procedure?" : `${ROUTINE_LABELS[medium]} weight or contents verification satisfactory?`],
    ["service-interval", "Relevant service interval and equipment condition checked?"],
    ["basic-service-actions", "Required manufacturer basic-service actions completed?"],
    ["service-label", "Service label and maintenance record updated?"],
  ];
  return { id: `PENDING-${kind === "monthly-visual" ? "MONTHLY" : "ANNUAL"}-${medium}-${gaugePresent ? "GAUGE" : "NO-GAUGE"}-v3`,
    version: 3, equipmentClass: equipmentClassFor[medium], serviceType: kind, equipmentMedium: medium, gaugePresent,
    approval: { status: "pending-technical-validation", approvedBy: "NOT APPROVED", approvedAt: "2026-11-01T00:00:00Z",
      source: `User-supplied ${kind} topics for ${inspectionAudience(kind)}. Pending BS 5306-3:2017 and model-specific manufacturer review; not certified.` },
    // All eight monthly rows remain visible, including the gauge topic on a
    // no-gauge unit. N/A is the engineer's explicit choice, never preselected.
    questions: topics.map(([id, prompt]) => ({ id, prompt, allowNA: true })) };
}
