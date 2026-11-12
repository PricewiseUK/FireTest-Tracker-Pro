/** Area arithmetic only. No BS minimum quantities, exemptions or siting rules. */
export const AREA_FACTOR = 0.065;
export interface InstalledRating { quantity: number; ratingA: number }
export interface StoreyInput { id: string; name: string; areaM2: number; installed: InstalledRating[]; additionalRatingA?: number }
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function parseDecimal(text: string, label: string, allowZero = false): number {
  requireValue(typeof text === "string" && /^\d+(?:\.\d+)?$/.test(text.trim()), `${label}: enter a decimal number`);
  const number = Number(text.trim());
  requireValue(Number.isFinite(number) && (allowZero ? number >= 0 : number > 0), `${label}: enter ${allowZero ? "zero or a positive" : "a positive"} number`);
  return number;
}
function rating(value: number) { requireValue(Number.isSafeInteger(value) && value > 0 && value <= 10000, "Class A rating must be a positive whole number (maximum 10000)"); }
export function calculateStorey(input: StoreyInput) {
  requireValue(typeof input.id === "string" && input.id.length > 0, "Storey ID is required");
  requireValue(typeof input.name === "string" && input.name.trim().length > 0, "Storey name is required");
  requireValue(Number.isFinite(input.areaM2) && input.areaM2 > 0 && input.areaM2 <= 10000000, "Area must be greater than zero and no more than 10,000,000 m²");
  requireValue(Number(input.areaM2.toFixed(3)) === input.areaM2, "Area supports at most three decimal places");
  requireValue(Array.isArray(input.installed) && input.installed.length <= 1000, "Invalid installed rating groups");
  let installedA = 0; let installedUnits = 0;
  for (const group of input.installed) {
    requireValue(Number.isSafeInteger(group.quantity) && group.quantity >= 0 && group.quantity <= 1000000, "Quantity must be a whole number from 0 to 1,000,000");
    rating(group.ratingA);
    installedA += group.quantity * group.ratingA; installedUnits += group.quantity;
  }
  // Integer micro-A arithmetic: no rounding down a genuine shortfall at unit boundaries.
  const demandMicroA = Math.round(input.areaM2 * 1000) * 65;
  const demandA = demandMicroA / 1000000;
  const shortfallMicroA = Math.max(0, demandMicroA - installedA * 1000000);
  if (input.additionalRatingA !== undefined) rating(input.additionalRatingA);
  return { id: input.id, name: input.name, demandA, installedA, installedUnits,
    differenceA: installedA - demandA,
    shortfallA: shortfallMicroA / 1000000,
    additionalUnits: input.additionalRatingA === undefined ? null : Math.ceil(shortfallMicroA / (input.additionalRatingA * 1000000)),
    additionalRatingA: input.additionalRatingA ?? null,
  };
}
export function calculateBuilding(floors: StoreyInput[]) {
  requireValue(Array.isArray(floors) && floors.length >= 1 && floors.length <= 100, "Enter between 1 and 100 storeys");
  requireValue(new Set(floors.map((floor) => floor.id)).size === floors.length, "Duplicate storey IDs");
  const storeys = floors.map(calculateStorey);
  return { storeys, totalDemandA: storeys.reduce((sum, floor) => sum + floor.demandA, 0),
    totalInstalledA: storeys.reduce((sum, floor) => sum + floor.installedA, 0),
    // A surplus on another storey does not cancel this storey's shortfall.
    totalShortfallA: storeys.reduce((sum, floor) => sum + floor.shortfallA, 0) };
}

export function parseCalendarDate(value: string): Date {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Use YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  requireValue(year >= 1900 && year <= 2200, "Date year must be 1900–2200");
  const date = new Date(Date.UTC(year, month - 1, day));
  requireValue(date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, "Invalid calendar date");
  return date;
}
export function addCalendarMonths(value: string, months: number): string {
  const date = parseCalendarDate(value);
  requireValue(Number.isSafeInteger(months) && months >= 1 && months <= 1200, "Interval must be 1–1200 whole calendar months");
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  requireValue(target.getUTCFullYear() <= 2200, "Projected date exceeds supported range");
  return target.toISOString().slice(0, 10);
}
export interface ApprovedDatePolicy {
  id: string; version: number; approval: "approved"; approvedBy: string; source: string;
  equipmentType: string; serviceType: string; basis: "commissioning" | "last-service" | "cylinder-stamp";
  months: number;
}
/** Intentionally empty: no verified BS schedules supplied or enabled. */
export const APPROVED_DATE_POLICIES: readonly ApprovedDatePolicy[] = [];
export function projectServiceDate(input: { basisDate: string; asOf: string; equipmentType: string; serviceType: string }, policy: ApprovedDatePolicy | null) {
  requireValue(policy?.approval === "approved" && policy.approvedBy.trim() && policy.source.trim() && policy.id.trim()
    && Number.isSafeInteger(policy.version) && policy.version > 0, "Technically approved date policy required");
  requireValue(policy.equipmentType === input.equipmentType && policy.serviceType === input.serviceType, "Date policy does not match equipment/service");
  requireValue(["commissioning", "last-service", "cylinder-stamp"].includes(policy.basis), "Unknown date basis");
  parseCalendarDate(input.basisDate); parseCalendarDate(input.asOf);
  requireValue(input.basisDate <= input.asOf, "Recorded service/basis date cannot be in the future");
  const dueDate = addCalendarMonths(input.basisDate, policy.months);
  return { dueDate, status: dueDate < input.asOf ? "overdue" : dueDate === input.asOf ? "due-today" : "upcoming", policyId: policy.id, policyVersion: policy.version };
}
