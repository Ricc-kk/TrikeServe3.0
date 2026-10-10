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

/* ------------------------------------------------------------------ measures */

/**
 * A cancelled order is not part of any of this.
 *
 * It was placed and then withdrawn, so no money changed hands and no food left the
 * shop. Counting one inflates the order count and adds a total that was never
 * earned — which matters most exactly when a shop needs to trust the number,
 * because the orders it cancelled are the ones it already knows did not pay.
 */
export function isCancelled(order: Record<string, any>): boolean {
  return String(order?.status ?? "").toLowerCase() === "cancelled";
}

/**
 * Revenue: what the shop is actually paid.
 *
 * The delivery fee is not part of it. Checkout takes the food by GCash
 * (`gcash_amount` is the subtotal) and the rider collects the fee in cash at
 * handover, so it passes straight through to the rider and never lands in the
 * shop's account. Summing the whole bill would report money the business does not
 * have, and a shop comparing that figure against what actually arrived would
 * think it had been shorted every week.
 *
 * The fallback is for rows written before `subtotal` was stored: the bill is the
 * food plus the delivery, so the food is whatever is left once the fee is off.
 */
export function revenueOf(order: Record<string, any>): number {
  const subtotal = Number(order?.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  return Math.max(
    (Number(order?.total) || 0) - (Number(order?.delivery_fee) || 0),
    0,
  );
}

/**
 * The orders inside one window.
 *
 * `buildSeries` does its own bucketing, so this is not needed for a series — it is
 * here for the figures that are not series-shaped, like which dishes sold. Those
 * need the orders themselves rather than a sum per bucket.
 */
export function ordersInRange(
  orders: Array<Record<string, any>>,
  range: RangeKey,
  now: Date = new Date(),
): Array<Record<string, any>> {
  const win = windowFor(range, now);
  const end = new Date(win.start.getTime() + win.buckets * win.bucketMs);

  return (orders ?? []).filter((order) => {
    const at = new Date(order?.created_at);
    if (Number.isNaN(at.getTime())) return false;
    // Half-open, matching buildSeries, so an order on a boundary lands in one
    // window and not two.
    return at >= win.start && at < end;
  });
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

/* -------------------------------------------------------------------- growth */

export interface GrowthPoint {
  label: string;
  fullLabel: string;
  /**
   * Change against the previous period, as a percentage.
   *
   * Null where there is no percentage to report: the first period has nothing
   * before it, and a period following a period with no revenue has a zero
   * denominator. Those are drawn as gaps rather than as 0%, because "no revenue
   * last period" and "revenue was exactly the same" are different facts, and a
   * reader cannot tell them apart from a flat line.
   */
  value: number | null;
}

export interface GrowthSeries {
  points: GrowthPoint[];
  /** Mean of the comparable periods, or null when nothing could be compared. */
  averagePct: number | null;
  /** How many periods had nothing to compare against. */
  skipped: number;
}

/**
 * Period-over-period revenue growth, as percentages.
 *
 * Reads off a revenue series rather than the raw orders, so it always covers
 * exactly the window the rest of the overview is showing and cannot drift from it.
 *
 * Negative values are kept. A period that took less than the one before it is the
 * single most useful thing this chart can say, and clamping it away would leave a
 * line that only ever rises.
 */
export function buildGrowthSeries(sales: SalesSeries): GrowthSeries {
  const points: GrowthPoint[] = sales.points.map((point, i) => {
    if (i === 0) return { label: point.label, fullLabel: point.fullLabel, value: null };

    const base = sales.points[i - 1].value;
    if (base <= 0) return { label: point.label, fullLabel: point.fullLabel, value: null };

    return {
      label: point.label,
      fullLabel: point.fullLabel,
      value: ((point.value - base) / base) * 100,
    };
  });

  const comparable = points
    .map((p) => p.value)
    .filter((v): v is number => v != null);

  const averagePct =
    comparable.length > 0 ? comparable.reduce((sum, v) => sum + v, 0) / comparable.length : null;

  return { points, averagePct, skipped: points.length - comparable.length };
}