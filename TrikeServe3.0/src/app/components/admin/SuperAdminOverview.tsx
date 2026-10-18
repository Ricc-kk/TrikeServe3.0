import { useState } from "react";
import { ArrowDown, ArrowRight, CheckCircle, ClipboardCheck, Clock3, MapPin, ShieldCheck, Store, Users, XCircle, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { Card } from "../ui/card";
import { TerminalIconGlyph } from "../ui/TerminalIcon";
import AdminAnalytics from "./AdminAnalytics";

type ReviewAccount = {
  id: string;
  name: string;
  type: "rider" | "business";
  email: string;
  phone: string;
  submittedDate: string;
  todaPlate?: string;
};

type OverviewStats = {
  totalUsers: number;
  totalCustomers: number;
  totalRiders: number;
  totalBusinesses: number;
  pendingCount: number;
};

type SuperAdminOverviewProps = {
  stats: OverviewStats;
  pending: ReviewAccount[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refreshToken: number;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

const METRICS: {
  key: keyof OverviewStats;
  label: string;
  description: string;
  Icon: LucideIcon;
  tone: string;
}[] = [
  { key: "totalUsers", label: "Verified accounts", description: "Across all user roles", Icon: ShieldCheck, tone: "bg-[var(--teal-soft)] text-[var(--teal)]" },
  { key: "totalCustomers", label: "Customers", description: "Verified passengers", Icon: Users, tone: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  { key: "totalRiders", label: "Drivers", description: "Verified driver accounts", Icon: TerminalIconGlyph, tone: "bg-[var(--info-soft)] text-[var(--info)]" },
  { key: "totalBusinesses", label: "Businesses", description: "Verified business owners", Icon: Store, tone: "bg-[var(--violet-soft)] text-[var(--violet)]" },
];

const SHORTCUTS = [
  { to: "/admin/users", label: "User management", detail: "Accounts, roles & verification", Icon: Users },
  { to: "/admin/terminals", label: "Terminal directory", detail: "TODAs & driver assignments", Icon: MapPin },
  { to: "/admin/approvals", label: "Change requests", detail: "Review terminal updates", Icon: ClipboardCheck },
];

/** Account actions retain the page's existing confirmation flow. */
export default function SuperAdminOverview({
  stats, pending, loading, error, lastUpdated, refreshToken, onApprove, onReject,
}: SuperAdminOverviewProps) {
  const [showAllPending, setShowAllPending] = useState(false);
  const hasData = lastUpdated !== null;
  const firstLoad = loading && !hasData;
  const shown = showAllPending ? pending : pending.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
      {error && (
        <div role="alert" className="rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-4 py-3 text-sm text-[var(--amber-ink)]">
          {error}
        </div>
      )}

      <section aria-labelledby="overview-summary-title" className="relative isolate overflow-hidden rounded-3xl bg-[var(--ink-solid)] p-5 text-white sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full border-[3rem] border-white/5" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)] sm:text-xs">TrikeServe · Control center</p>
            <h2 id="overview-summary-title" className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Your platform, at a glance.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">Keep your community moving. Review accounts and stay on top of platform activity.</p>
          </div>
          <a href="#pending-verifications" className="group flex min-h-16 shrink-0 items-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10 sm:max-w-56 sm:gap-4">
            <span className="text-3xl font-extrabold text-[var(--mint)] tabular-nums">{hasData ? stats.pendingCount.toLocaleString() : "—"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Pending reviews</span>
              <span className="mt-0.5 block text-xs text-white/70">{hasData && pending.length === 0 ? "You’re all caught up" : "View verification queue"}</span>
            </span>
            <ArrowDown className="size-4 shrink-0 text-[var(--mint)] transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section aria-labelledby="overview-accounts-title" aria-busy={loading}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="overview-accounts-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Accounts at a glance</h2>
          <p role="status" className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
            {loading ? "Refreshing account data…" : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : "Waiting for account data"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {METRICS.map(({ key, label, description, Icon, tone }) => {
            const featured = key === "totalUsers";
            return (
              <Card key={key} className={`min-w-0 gap-0 rounded-2xl p-4 sm:p-5 ${featured ? "border-[var(--teal)]/30 bg-[var(--teal-soft)]" : "border-line bg-card"}`}>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${featured ? "bg-card text-[var(--teal)]" : tone}`}><Icon className="size-[18px]" aria-hidden="true" /></span>
                  {featured && <span className="hidden rounded-full border border-[var(--teal)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--teal)] sm:block">Total</span>}
                </div>
                <p className={`break-all text-3xl font-extrabold leading-none tracking-tight tabular-nums sm:text-4xl ${featured ? "text-[var(--teal)]" : "text-[var(--ink)]"}`}>{hasData ? stats[key].toLocaleString() : "—"}</p>
                <h3 className="mt-2 text-sm font-bold leading-snug text-[var(--ink)]">{label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{description}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Keep the review queue first on smaller screens; only create a side rail
          when both it and the performance charts have enough breathing room. */}
      <div className="grid items-start gap-6 min-[1440px]:grid-cols-[minmax(0,1fr)_20rem]">
        <section id="pending-verifications" aria-labelledby="overview-reviews-title" aria-busy={loading} className="@container min-w-0 scroll-mt-32 min-[1440px]:col-start-2 min-[1440px]:row-start-1">
          <Card className="gap-0 overflow-hidden rounded-3xl border-line bg-card">
            <div className="flex items-center gap-3 border-b border-line p-4 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--amber-soft)] text-[var(--amber-ink)]"><ClipboardCheck className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="overview-reviews-title" className="text-base font-bold text-[var(--ink)]">Pending reviews</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">Accounts awaiting verification</p>
              </div>
              <span className="rounded-lg bg-[var(--amber-soft)] px-2.5 py-1 text-sm font-extrabold text-[var(--amber-ink)] tabular-nums">{hasData ? stats.pendingCount.toLocaleString() : "—"}</span>
            </div>

            {firstLoad ? (
              <div role="status" aria-label="Loading pending accounts" className="space-y-3 p-5">
                <div className="h-16 animate-pulse rounded-xl bg-soft" />
                <div className="h-11 animate-pulse rounded-xl bg-soft" />
              </div>
            ) : !hasData ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">Refresh the overview to load account reviews.</p>
            ) : pending.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success-ink)]"><CheckCircle className="size-6" aria-hidden="true" /></span>
                <p className="mt-3 text-sm font-bold text-[var(--ink)]">You’re all caught up</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted-foreground)]">No driver or business accounts are waiting for verification.</p>
              </div>
            ) : (
              <ul id="overview-pending-list" className="divide-y divide-line">
                {shown.map(account => (
                  <li key={account.id} className="grid items-center gap-4 p-4 sm:p-5 @min-[35rem]:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${account.type === "rider" ? "bg-[var(--info-soft)] text-[var(--info)]" : "bg-[var(--violet-soft)] text-[var(--violet)]"}`}>
                          {account.type === "rider" ? <TerminalIconGlyph className="size-5" aria-hidden="true" /> : <Store className="size-5" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-bold leading-snug text-[var(--ink)]">{account.name}</h3>
                          <p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">{account.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={`rounded-md px-2 py-0.5 font-bold ${account.type === "rider" ? "bg-[var(--info-soft)] text-[var(--info)]" : "bg-[var(--violet-soft)] text-[var(--violet)]"}`}>{account.type === "rider" ? "Driver" : "Business"}</span>
                        <span className="text-[var(--muted-foreground)]">Submitted {account.submittedDate}</span>
                      </div>
                      {(account.phone || account.todaPlate) && (
                        <p className="break-words text-xs text-[var(--muted-foreground)]">{[account.phone, account.todaPlate ? `Plate: ${account.todaPlate}` : null].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={loading} onClick={() => onApprove(account.id)} aria-label={`Approve ${account.name}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--success-ink)] px-3 text-xs font-bold text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50">
                        <CheckCircle className="size-4" aria-hidden="true" /> Approve
                      </button>
                      <button type="button" disabled={loading} onClick={() => onReject(account.id)} aria-label={`Reject ${account.name}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-[var(--error)] transition-colors hover:bg-[var(--error-soft)] disabled:opacity-50">
                        <XCircle className="size-4" aria-hidden="true" /> Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {pending.length > 3 && (
              <button type="button" onClick={() => setShowAllPending(!showAllPending)} aria-expanded={showAllPending} aria-controls="overview-pending-list" className="min-h-11 border-t border-line px-4 py-3 text-xs font-bold text-[var(--teal)] hover:bg-soft">{showAllPending ? "Show fewer accounts" : `Show all ${pending.length} pending accounts`}</button>
            )}
          </Card>
        </section>

        <div className="min-w-0 min-[1440px]:col-start-1 min-[1440px]:row-start-1">
          <AdminAnalytics compact refreshToken={refreshToken} />
        </div>
      </div>

      <section aria-labelledby="overview-shortcuts-title">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="overview-shortcuts-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Quick access</h2>
          <p className="text-xs text-[var(--muted-foreground)]">Your everyday admin tools</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3 sm:gap-4">
          {SHORTCUTS.map(({ to, label, detail, Icon }) => (
            <Link key={to} to={to} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-[var(--teal)]/40 hover:bg-[var(--teal-soft)] sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--teal-soft)] text-[var(--teal)]"><Icon className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--ink)]">{label}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--muted-foreground)]">{detail}</span></span>
              <ArrowRight className="size-4 shrink-0 text-[var(--teal)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
