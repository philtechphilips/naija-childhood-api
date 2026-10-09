/** Calendar day in Lagos (WAT, UTC+1, no daylight saving) as YYYY-MM-DD. */
export function lagosDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Start of the current week (Monday 00:00 Lagos time) as a UTC Date. */
export function lagosWeekStart(at: Date = new Date()): Date {
  const local = new Date(at.getTime() + 60 * 60 * 1000);
  const dow = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  return new Date(monday - 60 * 60 * 1000);
}
