import { BarChart3 } from "lucide-react";

/**
 * Lightweight analytics charts used by the driver and business dashboards.
 *
 * Plain SVG/CSS rather than a charting library: they render instantly, stay
 * responsive, and follow the theme's design tokens the same way the existing
 * dashboard charts do.
 */

export interface BarDatum {
  label: string;
  value: number;
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

function EmptyChart({ hint }: { hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <BarChart3 className="w-12 h-12 text-[var(--border)] mb-3" />
      <p className="text-sm text-[var(--muted-foreground)]">No data yet</p>
      {hint && <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Vertical bar chart. Bar heights are relative to the largest value; the value
 * is printed above each bar so small datasets stay readable.
 */
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
