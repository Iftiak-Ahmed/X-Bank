/**
 * Local calendar-day key ("YYYY-MM-DD"), independent of the server's UTC
 * offset. Date.toISOString() always renders in UTC, so in a positive-offset
 * timezone (e.g. UTC+6) local midnight is still the previous day in UTC —
 * using it as a bucket key silently drops "today" from day-bucketed charts.
 */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
