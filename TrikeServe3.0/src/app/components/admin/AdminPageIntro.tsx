import type { ReactNode } from "react";
import { Clock3, RefreshCw, type LucideIcon } from "lucide-react";

export default function AdminPageIntro({ eyebrow, title, description, onRefresh, loading = false, note, children }: {
  eyebrow: string;
  title: string;
  description: string;
  onRefresh?: () => void;
  loading?: boolean;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label={eyebrow} className="relative isolate overflow-hidden rounded-3xl bg-[var(--ink-solid)] p-5 text-white sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full border-[3rem] border-white/5" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)] sm:text-xs">TrikeServe · {eyebrow}</p>
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">{description}</p>
        </div>
        {(onRefresh || children || note) && <div className="shrink-0 space-y-2 sm:max-w-64 sm:text-right">
          {onRefresh && <button type="button" aria-label={`Refresh ${eyebrow.toLowerCase()}`} disabled={loading} onClick={onRefresh} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />{loading ? 'Refreshing…' : 'Refresh data'}</button>}
          {children}
          {note && <p role="status" className="flex items-center gap-1.5 text-xs text-white/70 sm:justify-end"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" />{note}</p>}
        </div>}
      </div>
    </section>
  );
}

export function AdminMetricCards({ items, loading = false }: {
  items: { label: string; value: number | string; detail?: string; Icon: LucideIcon; tone?: 'teal' | 'amber' | 'success' | 'info' }[];
  loading?: boolean;
}) {
  const tones = {
    teal: 'bg-[var(--teal-soft)] text-[var(--teal)]',
    amber: 'bg-[var(--amber-soft)] text-[var(--amber-ink)]',
    success: 'bg-[var(--success-soft)] text-[var(--success-ink)]',
    info: 'bg-[var(--info-soft)] text-[var(--info)]',
  };
  return <div aria-label="Summary metrics" aria-busy={loading} className={`grid grid-cols-2 gap-3 sm:gap-4 ${items.length === 3 ? '@min-[36rem]:grid-cols-3' : '@min-[42rem]:grid-cols-4'}`}>
    {items.map(({ label, value, detail, Icon, tone = 'teal' }) => <div key={label} className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <span className={`mb-4 grid size-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-[18px]" aria-hidden="true" /></span>
      <p className="break-all text-3xl font-extrabold leading-none tracking-tight text-[var(--ink)] tabular-nums">{loading ? '—' : typeof value === 'number' ? value.toLocaleString() : value}</p>
      <h3 className="mt-2 text-sm font-bold leading-snug text-[var(--ink)]">{label}</h3>
      {detail && <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{detail}</p>}
    </div>)}
  </div>;
}
