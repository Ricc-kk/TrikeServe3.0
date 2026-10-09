/**
 * Sales series for the business overview, in one place.
 *
 * The overview charts used to be built inline with two hand-rolled loops over the
 * last seven days, both of which were quietly wrong:
 *
 *   - Every day's sales were floored at 100 (`Math.max(amount, 100)`) so that a
 *     quiet day still drew a visible bar. The chart was showing invented money.
 *   - The "This Week" headline then subtracted `days * 100` to partly undo it,
 *     so the number under the chart was arithmetic on invented values rather than
 *     the takings.
 *   - The percentage badge above it was the literal text "+20%", never computed.
 *
 * This module is the real thing: one pass over the orders, bucketed by whatever
 * window the reader picked, with no floors and no corrections. The chart
 * component is then only responsible for drawing the series it is handed.
 *
 * Bucketing is in the reader's local time, not UTC, because "today" is the
 * question a shop owner is actually asking — and orders carry a timestamp, so the
 * only question is which local day they belong to.
 */

/** The ranges the overview offers. */
export type RangeKey = "today" | "week" | "month";

export const RANGE_OPTIONS: ReadonlyArray<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/** Human name for a range, for headlines like "This Week". */
export const RANGE_HEADLINE: Record<RangeKey, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

export interface SeriesPoint {
  /** X-axis label. Already shortened — the chart thins the row further. */
  label: string;
  /** X-axis label with more context, used in the hover readout. */
  fullLabel: string;
  value: number;
}

export interface SalesSeries {
  points: SeriesPoint[];
  /** Sum across the range. */
  total: number;
  /** Number of orders in the range, which is not the same as the sum of a value. */
  count: number;
  /**
   * The equivalent window immediately before this one, for the change badge.
   * Null when there is nothing meaningful to compare against — a new shop has no
   * previous week, and dividing by its zero produces an infinite percentage.
   */
  previousTotal: number | null;
  /** Change against the previous window as a percentage. Null with no comparison. */
  changePct: number | null;
}

interface Window {
  /** Local midnight of the first bucket (or of the first 2-hour slot, for today). */
  start: Date;
  buckets: number;
  bucketMs: number;
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * The buckets a range is divided into.
 *
 * Today is hourly-ish at two-hour slots rather than 24 hourly points: a shop is
 * open for a dozen hours, so 12 slots reads as a shape while 24 reads as noise.
 *
 * Bucket boundaries are computed by adding a fixed millisecond span. That is exact
 * in any zone without daylight saving and drifts by at most an hour in one that
 * has it, which moves an order between two neighbouring buckets and never drops
 * it — the range total is unaffected either way.
 */
function windowFor(range: RangeKey, now: Date): Window {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  if (range === "today") {
    return { start: midnight, buckets: 12, bucketMs: 2 * HOUR };
  }

  if (range === "week") {
    const start = new Date(midnight);
    start.setDate(start.getDate() - 6);
    return { start, buckets: 7, bucketMs: DAY };
  }

  const start = new Date(midnight);
  start.setDate(start.getDate() - 29);
  return { start, buckets: 30, bucketMs: DAY };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function labelFor(bucketStart: Date, range: RangeKey): { label: string; fullLabel: string } {
  if (range === "today") {
    const hour = bucketStart.getHours();
    const suffix = hour < 12 ? "AM" : "PM";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return { label: `${twelve}${suffix}`, fullLabel: `${twelve}:00 ${suffix}` };
  }

  if (range === "week") {
    const name = WEEKDAY[bucketStart.getDay()];
    return {
      label: name,
      fullLabel: `${name} ${bucketStart.getDate()} ${bucketStart.toLocaleDateString(undefined, { month: "short" })}`,
    };
  }

  return {
    label: String(bucketStart.getDate()),
    fullLabel: bucketStart.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
  };
}

/**
 * Sum one measure of the orders that fall inside a window.
 *
 * `valueOf` is what makes this serve both charts: pass `(o) => o.total` for sales,
 * `() => 1` for a count. Buckets with nothing in them are 0, not skipped — an
 * omitted point draws a straight line across a gap, which reads as "steady" when
 * the truth is "no orders that day".
 */
export function buildSeries(
  orders: Array<Record<string, any>>,
  range: RangeKey,
  valueOf: (order: Record<string, any>) => number,
  now: Date = new Date(),
): SalesSeries {
  const win = windowFor(range, now);
  const end = new Date(win.start.getTime() + win.buckets * win.bucketMs);

  const sums = new Array<number>(win.buckets).fill(0);
  let count = 0;
  let total = 0;

  for (const order of orders ?? []) {
    const at = new Date(order.created_at);
    if (Number.isNaN(at.getTime())) continue;
    // Half-open: a bucket owns its start instant and stops before the next one's.
    if (at < win.start || at >= end) continue;

    const index = Math.floor((at.getTime() - win.start.getTime()) / win.bucketMs);
    // The last bucket can be reached by an order in the final sliver of the range.
    if (index < 0 || index >= win.buckets) continue;

    const value = Number(valueOf(order)) || 0;
    sums[index] += value;
    total += value;
    count += 1;
  }

  const points: SeriesPoint[] = sums.map((value, i) => {
    const bucketStart = new Date(win.start.getTime() + i * win.bucketMs);
    const { label, fullLabel } = labelFor(bucketStart, range);
    return { label, fullLabel, value };
  });

  // The comparison window is the same length, immediately before.
  const prevEnd = win.start;
  const prevStart = new Date(prevEnd.getTime() - win.buckets * win.bucketMs);
  let previousTotal = 0;
  let previousHasOrders = false;

  for (const order of orders ?? []) {
    const at = new Date(order.created_at);
    if (Number.isNaN(at.getTime())) continue;
    if (at < prevStart || at >= prevEnd) continue;
    previousHasOrders = true;
    previousTotal += Number(valueOf(order)) || 0;
  }

  /*
   * No previous orders means no comparison, not a 100% rise. Reporting a jump
   * from nothing is the kind of number that looks like progress and means nothing.
   */
  const canCompare = previousHasOrders && previousTotal > 0;
  const changePct = canCompare ? ((total - previousTotal) / previousTotal) * 100 : null;

  return {
    points,
    total,
    count,
    previousTotal: canCompare ? previousTotal : null,
    changePct,
  };
}