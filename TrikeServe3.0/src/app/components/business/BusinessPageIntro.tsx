import type { LucideIcon } from 'lucide-react';

export default function BusinessPageIntro({ section, title, description, metrics = [] }: {
  section: string;
  title: string;
  description: string;
  metrics?: { label: string; value: number | string; Icon: LucideIcon }[];
}) {
  return <section aria-label={`${section} summary`} className="space-y-4">
    <div className="relative isolate overflow-hidden rounded-3xl bg-[var(--ink-solid)] p-5 text-white sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full border-[3rem] border-white/5" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)]">TrikeServe · {section}</p>
      <h2 className="mt-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">{description}</p>
    </div>
    {metrics.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      {metrics.map(({ label, value, Icon }) => <div key={label} className="min-w-0 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <span className="mb-3 grid size-9 place-items-center rounded-xl bg-[var(--teal-soft)] text-[var(--teal)]"><Icon className="size-4" aria-hidden="true" /></span>
        <p className="break-all text-2xl font-extrabold tracking-tight text-[var(--ink)] tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <h3 className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{label}</h3>
      </div>)}
    </div>}
  </section>;
}
