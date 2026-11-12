/** Existing app calculation, extracted unchanged. Not technical approval of a duty. */
export function calculateExistingCmin(standbyMA: number, alarmMA: number, hours: number, minutes: number) {
  if (![standbyMA, alarmMA, hours, minutes].every((value) => Number.isFinite(value) && value > 0)) return null;
  const derating = 1.75;
  const cmin = 1.25 * (hours * (standbyMA / 1000) + derating * (alarmMA / 1000) * (minutes / 60));
  return Number.isFinite(cmin) ? { cmin, derating } : null;
}
