import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";

/**
 * Lightweight analytics charts used by the driver and business dashboards.
 *
 * Plain SVG rather than a charting library: they render instantly, stay
 * responsive, and follow the theme's design tokens the same way the existing
 * dashboard charts do.
 *
 * The two line components measure their container and draw in pixel coordinates
 * rather than stretching a fixed viewBox. That is not fussiness — a
 * `preserveAspectRatio="none"` viewBox scales x and y by different factors, which
 * turns every circle into an ellipse and makes stroke width depend on the width
 * of the card. It also means a resize has to redraw, which is what the
 * measurement is for.
 */

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * A point on a line, which may be missing.
 *
 * `null` is a gap, not a zero. It matters for growth, where a period after one
 * with no revenue has no percentage to report and drawing it as 0% would claim
 * the shop held steady through a day it did not trade.
 */
export interface LineDatum {
  label: string;
  value: number | null;
}

export interface DonutDatum {
  label: string;
  value: number;
  /** Any CSS color, including a theme token such as `var(--primary)`. */
  color: string;
}

/** Compact number for axis badges: 1250 -> "1.3k". */
export function formatCompact(value: number): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Width reserved on the right for the value axis. */
const Y_AXIS_WIDTH = 48;

/**
 * A gridline step that yields roughly four intervals at any magnitude.
 *
 * A fixed ladder of steps cannot do this across the range a shop operates in:
 * 250 is sensible at ₱1,400 and produces fifty-seven gridlines at ₱14,000 — which
 * is what overflowed the first version of this axis. Small integers are rounded
 * up as a whole so an order count never gets a "0.50" axis label.
 */
function niceStep(rawMax: number): number {
  if (rawMax <= 8) return 1;
  const target = rawMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalised = target / magnitude;
  const multiple = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return multiple * magnitude;
}

/**
 * Track a container's width so the charts can draw in real pixels.
 *
 * A callback ref rather than an effect. Both charts render an empty state first
 * and only draw once data arrives, so the measured element is not in the DOM on
 * the first commit — an effect with an empty dependency list ran against a null
 * ref, never re-ran, and the chart stayed permanently unmeasured with no SVG in
 * it. A callback ref fires when the node actually attaches, whenever that is.
 */
function useElementWidth() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();

    // Older WebViews have no ResizeObserver. The measurement above still works;
    // the chart simply does not redraw on a resize.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, width };
}

function EmptyChart({ hint }: { hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <BarChart3 className="w-12 h-12 text-[var(--border)] mb-3" />
      <p className="text-sm text-[var(--muted-foreground)]">No data yet</p>
      {hint && <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
    </div>
  );
}

/** Vertical bar chart. Bar heights are relative to the largest value; the value
 *  is printed above each bar so small datasets stay readable. */
export function AnalyticsBarChart({
  data,
  color = "var(--primary)",
  valuePrefix = "",
  valueSuffix = "",
  height = 180,
  emptyHint,
}: {
  data: BarDatum[];
  color?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  height?: number;
  emptyHint?: string;
}) {
  const hasData = data.length > 0 && data.some((d) => d.value > 0);
  if (!hasData) return <EmptyChart hint={emptyHint} />;

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const pct = d.value > 0 ? Math.max((d.value / max) * 100, 4) : 0;
          return (
            <div key={`${d.label}-${i}`} className="flex-1 h-full flex flex-col items-center justify-end min-w-0">
              <span className="text-[10px] font-bold text-[var(--muted-foreground)] mb-1 truncate max-w-full">
                {d.value > 0 ? `${valuePrefix}${formatCompact(d.value)}${valueSuffix}` : ""}
              </span>
              <div
                className="w-full max-w-[38px] rounded-t-lg transition-all"
                style={{ height: `${pct}%`, backgroundColor: color }}
                title={`${d.label}: ${valuePrefix}${d.value}${valueSuffix}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className="flex-1 text-center text-xs font-semibold text-[var(--muted-foreground)] truncate"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Line chart with a value axis and a hover readout.
 *
 * A flat series is not "no data". A shop with no orders at 3am has a real series
 * that happens to dip to the baseline at 3am, so the empty state is reserved for
 * a series with no points at all — and for a series that is entirely zero, where
 * a line along the axis would be a chart with nothing to say.
 *
 * Handles a negative series and missing points, both of which a growth chart
 * needs: zero always sits on the plot, so the line's position relative to it
 * reads as gain or loss at a glance, and a `null` breaks the line rather than
 * being drawn through.
 */
export function AnalyticsLineChart({
  data,
  color = "var(--primary)",
  valuePrefix = "",
  valueSuffix = "",
  height = 200,
  emptyHint,
  /** Parallel to `data`; falls back to `label` when omitted. */
  hoverLabels,
}: {
  data: LineDatum[];
  color?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  height?: number;
  emptyHint?: string;
  hoverLabels?: string[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const { ref: hostRef, width } = useElementWidth();
  const fillId = useId();

  const values = data.map((d) => d.value);
  const readings = values.filter((v): v is number => v != null);

  const hasPoints = readings.length > 0;
  // Any departure from zero counts, in either direction: a line that only ever
  // fell is declining revenue, which is the thing most worth seeing.
  const hasMovement = readings.some((v) => v !== 0);

  // Zero is always on the plot, so a chart of percentages has a reference the
  // eye can compare against rather than a floating axis.
  const rawMax = hasPoints ? Math.max(...readings, 0) : 0;
  const rawMin = hasPoints ? Math.min(...readings, 0) : 0;

  const bound = useMemo(() => {
    if (!hasPoints) return { max: 0, min: 0 };
    const step = niceStep(Math.max(Math.abs(rawMax), Math.abs(rawMin)));
    return {
      max: Math.max(Math.ceil(rawMax / step) * step, step),
      min: Math.min(Math.floor(rawMin / step) * step, 0),
    };
  }, [hasPoints, rawMax, rawMin]);

  const span = bound.max - bound.min;

  const gridValues = useMemo(() => {
    if (!hasPoints || span <= 0) return [];
    const step = niceStep(Math.max(Math.abs(rawMax), Math.abs(rawMin)));
    const values: number[] = [];
    for (let v = bound.min; v <= bound.max + 0.001; v += step) {
      values.push(Number(v.toFixed(6)));
    }
    return values;
  }, [bound.min, bound.max, hasPoints, rawMax, rawMin, span]);

  if (!hasPoints || !hasMovement) {
    return <EmptyChart hint={emptyHint} />;
  }

  const plotWidth = Math.max(width - Y_AXIS_WIDTH, 1);

  // First and last points sit on the plot edges: inset by half a step, the line
  // visibly stops short of the chart it belongs to.
  const xFor = (index: number) =>
    data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    span > 0 ? height - ((value - bound.min) / span) * height : height;

  const points = values.map((value, i) =>
    value == null ? null : { x: xFor(i), y: yFor(value) },
  );

  /*
   * The line, broken wherever a reading is missing.
   *
   * Joining across a gap would draw a slope from one side of it to the other, and
   * that slope is a claim about the days in between that nobody measured. One
   * segment per run of consecutive readings instead, so a gap is visibly a gap.
   */
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let run: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point == null) {
      if (run.length > 0) segments.push(run);
      run = [];
      continue;
    }
    run.push(point);
  }
  if (run.length > 0) segments.push(run);

  const labelStride = Math.max(1, Math.ceil(data.length / 7));

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || data.length === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, index)));
  };

  const activeIndex = active;
  const activeValue = activeIndex != null ? values[activeIndex] : null;
  const activePoint = activeIndex != null ? points[activeIndex] : null;
  const peak = Math.max(...readings);
  const trough = Math.min(...readings);

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Value axis. HTML, positioned onto each gridline, so the text is never
            scaled by the chart and never overlaps the plot. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {gridValues.map((value, i) => (
            <span
              key={value}
              /*
               * The outermost labels hang *inside* the plot rather than being
               * centred on their line. Centring put half of the top label above
               * the chart and half of the baseline label below it, so both spilled
               * out of the card.
               */
              className={`absolute right-0 text-[10px] font-bold text-[var(--muted-foreground)] tabular-nums ${
                i === 0
                  ? '-translate-y-full'
                  : i === gridValues.length - 1
                    ? ''
                    : '-translate-y-1/2'
              }`}
              style={{ top: yFor(value) }}
            >
              {valuePrefix}
              {formatCompact(value)}
              {valueSuffix}
            </span>
          ))}
        </div>

        <div
          ref={hostRef}
          className="h-full cursor-crosshair"
          style={{ marginRight: Y_AXIS_WIDTH }}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={`Line chart over ${data.length} periods. Highest ${valuePrefix}${formatCompact(peak)}${valueSuffix}, lowest ${valuePrefix}${formatCompact(trough)}${valueSuffix}.`}
        >
          {/* Nothing is drawn until the width is known — a first paint at an
              assumed width would visibly jump once measured. */}
          {width > 0 && (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

              {gridValues.map((value) => (
                <line
                  key={value}
                  x1="0"
                  x2={plotWidth}
                  y1={yFor(value)}
                  y2={yFor(value)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              ))}

              {segments.map((segment, si) => (
                <path
                  key={`seg-${si}`}
                  d={`${segment
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                    .join(" ")} L ${segment[segment.length - 1].x} ${height} L ${segment[0].x} ${height} Z`}
                  fill={`url(#${fillId})`}
                />
              ))}

              {segments.map((segment, si) => (
                <path
                  key={`line-${si}`}
                  d={segment.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Dots only while they stay distinct — at 30 daily points on a
                  phone they would merge into a smear. */}
              {data.length <= 14 &&
                points.map((p, i) =>
                  p == null ? null : (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={activeIndex === i ? 5 : 3}
                      fill={color}
                      stroke="var(--surface)"
                      strokeWidth="1.5"
                    />
                  ),
                )}

              {activePoint && (
                <>
                  <line
                    x1={activePoint.x}
                    x2={activePoint.x}
                    y1="0"
                    y2={height}
                    stroke={color}
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.5"
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r="5"
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
          )}

          {/* Hover readout, anchored to the point rather than the cursor: on touch
              there is no cursor to follow. Nothing is shown over a gap — there is
              no reading there to report. */}
          {activeValue != null && activePoint && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[var(--ink)] px-2 py-1 text-[11px] font-bold text-white shadow-lg"
              style={{ left: activePoint.x }}
            >
              {hoverLabels?.[activeIndex!] ?? data[activeIndex!].label} · {valuePrefix}
              {formatCompact(activeValue)}
              {valueSuffix}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex" style={{ width: Math.max(width, 0) || '100%' }}>
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className="flex-1 text-center text-xs font-semibold text-[var(--muted-foreground)]"
          >
            {/* Blank rather than hidden, so every slot keeps its width and the row
                does not reflow as the range changes. */}
            {i % labelStride === 0 || i === data.length - 1 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Sparkline for a stat card.
 *
 * This replaces the decorative bars the cards used to carry, which were a fixed
 * array of percentages — the same twelve numbers on every card of every shop,
 * changing nothing when the real figure changed. The number beside it already
 * carries the value; the shape is here to be a real glance at the trend.
 */
export function AnalyticsSparkline({
  data,
  color = "var(--primary)",
  height = 48,
}: {
  data: BarDatum[];
  color?: string;
  height?: number;
}) {
  const { ref, width } = useElementWidth();
  const values = data.map((d) => d.value);

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min;

  // Scaled to the data's own min and max, not from zero: a shop whose takings
  // move between 2000 and 2500 should see that variation, not a line pinned to
  // the bottom of the box.
  const yFor = (value: number) => (span > 0 ? height - ((value - min) / span) * height : height / 2);

  if (values.length < 2) {
    // One point has no shape, and a flat line would read as "steady" — which is a
    // claim. An empty box is the honest answer.
    //
    // Note what is *not* tested here: width. The div carrying the measuring ref
    // lives in the branch below, so returning early on `width <= 0` meant the ref
    // was never attached, width never got set, and the condition could never be
    // satisfied — every sparkline stayed an empty box for good. The line chart
    // avoided this by testing only its data and guarding the drawing separately.
    return <div style={{ height }} aria-hidden="true" />;
  }

  const points = values.map((value, i) => ({
    x: (i / (values.length - 1)) * width,
    y: yFor(value),
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Trend across ${values.length} periods, from ${formatCompact(values[0])} to ${formatCompact(values[values.length - 1])}`}
        >
          <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="3"
            fill={color}
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
        </svg>
      )}
    </div>
  );
}

/** Donut chart with a legend listing each slice's value and share. */
export function AnalyticsDonutChart({
  data,
  centerLabel = "Total",
  centerValue,
  valuePrefix = "",
  emptyHint,
}: {
  data: DonutDatum[];
  centerLabel?: string;
  centerValue?: string;
  valuePrefix?: string;
  emptyHint?: string;
}) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  if (!data.length || total <= 0) return <EmptyChart hint={emptyHint} />;

  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    // `flex-wrap` + a minimum legend width keeps the legend readable when the
    // chart sits in a narrow column: it drops below the donut instead of being
    // squeezed (which chopped the labels and percentages).
    <div className="flex flex-wrap items-center justify-center gap-6">
      {/* Donut */}
      <div className="relative w-40 h-40 flex-shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="15" />
          {data.map((d, i) => {
            if (d.value <= 0) return null;
            const fraction = d.value / total;
            const dashArray = `${fraction * circumference} ${circumference}`;
            const dashOffset = -(accumulated / total) * circumference;
            accumulated += d.value;
            return (
              <circle
                key={`${d.label}-${i}`}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth="15"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-[var(--muted-foreground)]">{centerLabel}</p>
          <p className="text-xl font-extrabold text-[var(--ink)]">
            {centerValue ?? formatCompact(total)}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 min-w-[200px] space-y-3">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={`${d.label}-legend-${i}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-sm font-semibold text-[var(--ink)] truncate">{d.label}</span>
                </div>
                <span className="text-sm font-bold text-[var(--ink)] flex-shrink-0 ml-2">
                  {valuePrefix}
                  {formatCompact(d.value)}
                  <span className="text-[var(--muted-foreground)] font-semibold ml-1.5">{pct}%</span>
                </span>
              </div>
              <div className="w-full bg-[var(--muted)] rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: d.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}