import { useState, useEffect, useMemo } from "react";
import ListPagination from "../ui/ListPagination";
import {
  ShieldCheck, Search, AlertTriangle, ClipboardList, ChevronRight, X, Users, Activity,
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";

import { getAuditLogs, type AuditLog } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import { TableSkeleton } from "./AdminSkeleton";
import EmptyState from "../ui/EmptyState";

/** Display label + badge colour for each recorded action. */
const ACTION_META: Record<string, { label: string; badge: string; category: string }> = {
  // Admin actions
  approve_request: { label: "Approved request", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]", category: "Approvals" },
  reject_request: { label: "Rejected request", badge: "bg-[var(--error-soft)] text-[var(--error)]", category: "Approvals" },
  verify_user: { label: "Verified user", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]", category: "Users" },
  reject_user: { label: "Rejected user", badge: "bg-[var(--error-soft)] text-[var(--error)]", category: "Users" },
  create_terminal: { label: "Created terminal", badge: "bg-[var(--info-soft)] text-[var(--info)]", category: "Terminals" },
  update_terminal: { label: "Updated terminal", badge: "bg-[var(--info-soft)] text-[var(--info)]", category: "Terminals" },
  delete_terminal: { label: "Deleted terminal", badge: "bg-[var(--error-soft)] text-[var(--error)]", category: "Terminals" },
  assign_rider_admin: { label: "Rider admin assignment", badge: "bg-[var(--violet-soft)] text-[var(--violet)]", category: "Assignments" },
  assign_toda_admin: { label: "TODA admin assignment", badge: "bg-[var(--violet-soft)] text-[var(--violet)]", category: "Assignments" },
  update_rate: { label: "Updated rates", badge: "bg-[var(--amber-soft)] text-[var(--amber-ink)]", category: "Rates" },
  update_terminal_rates: { label: "Updated terminal rates", badge: "bg-[var(--amber-soft)] text-[var(--amber-ink)]", category: "Rates" },
  // Customer actions
  create_ride: { label: "Booked ride", badge: "bg-[var(--primary-soft)] text-[var(--coral-dark)]", category: "Rides" },
  cancel_ride: { label: "Cancelled ride", badge: "bg-[var(--error-soft)] text-[var(--error)]", category: "Rides" },
  place_order: { label: "Placed order", badge: "bg-[var(--primary-soft)] text-[var(--coral-dark)]", category: "Orders" },
  report_ride: { label: "Reported a ride", badge: "bg-[var(--error-soft)] text-[var(--error)]", category: "Rides" },
  // Driver actions
  accept_ride: { label: "Accepted ride", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]", category: "Rides" },
  complete_ride: { label: "Completed ride", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]", category: "Rides" },
  // Business actions
  update_order_status: { label: "Updated order", badge: "bg-[var(--info-soft)] text-[var(--info)]", category: "Orders" },
};

const CATEGORY_FILTERS = [
  "All", "Approvals", "Users", "Terminals", "Rides", "Orders", "Rates", "Assignments",
] as const;

const ROLE_FILTERS: { key: string; label: string; badge: string }[] = [
  { key: "", label: "All roles", badge: "" },
  { key: "admin", label: "Admin", badge: "bg-[var(--teal-soft)] text-[var(--teal)]" },
  { key: "rider", label: "Driver", badge: "bg-[var(--info-soft)] text-[var(--info)]" },
  { key: "customer", label: "Customer", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  { key: "business", label: "Business", badge: "bg-[var(--violet-soft)] text-[var(--violet)]" },
];

const ROLE_META: Record<string, { label: string; badge: string }> = {
  admin: { label: "Admin", badge: "bg-[var(--teal-soft)] text-[var(--teal)]" },
  rider: { label: "Driver", badge: "bg-[var(--info-soft)] text-[var(--info)]" },
  customer: { label: "Customer", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  business: { label: "Business", badge: "bg-[var(--violet-soft)] text-[var(--violet)]" },
};

function metaFor(action: string) {
  return (
    ACTION_META[action] || {
      label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      badge: "bg-soft text-[var(--muted-foreground)]",
      category: "Other",
    }
  );
}

/** Older admin entries predate actor_role, so default them to "admin". */
function roleFor(log: AuditLog): string {
  return log.actor_role || "admin";
}

function roleMeta(role: string) {
  return ROLE_META[role] || { label: role, badge: "bg-soft text-[var(--muted-foreground)]" };
}

/**
 * The day, for the list.
 *
 * No time: the trail is ordered newest first, so the minute is what tells you two
 * entries on the same day apart -- and it also makes every row read "1:38 PM" in a
 * column wide enough for a date, pushing the summary into a narrower column than
 * it deserves. The exact moment is one tap away in the record.
 */
function formatDay(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

/**
 * Every field of a record's details, whole.
 *
 * This replaces a `describeDetails` that flattened the same data onto one line at
 * 60 characters a field for a table cell. Opening a record is the moment to show
 * what was actually recorded, so nothing here is truncated -- a changed fare cut
 * off at "base_far… : 30" is worse than not offering the detail at all.
 */
function detailEntries(details: any): { label: string; value: string }[] {
  if (details == null || typeof details !== "object") return [];
  const out: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === "") continue;
    out.push({
      label: key.replace(/_/g, " "),
      value: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value),
    });
  }
  return out;
}

/**
 * The exact moment, to the second.
 *
 * The list shows a readable date; this is what an audit is actually checked
 * against, so it is not rounded and not localised away.
 */
function fullDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true,
  });
}

/** Records shown per page. Matches the shop's order list. */
const PAGE_SIZE = 10;

export default function AuditTrail() {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminType === "business_customer";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>("All");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  /** The record opened for its full contents, or null. */
  const [openLog, setOpenLog] = useState<AuditLog | null>(null);

  // Escape closes the detail sheet, the way every other overlay in the app does.
  useEffect(() => {
    if (!openLog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenLog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLog]);

  const loadLogs = async () => {
    const { data, error } = await getAuditLogs(300);
    setLoadError(error || null);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadLogs();
    const interval = setInterval(loadLogs, 15000);
    return () => clearInterval(interval);
  }, [isSuperAdmin]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (category !== "All" && metaFor(log.action).category !== category) return false;
      if (role && roleFor(log) !== role) return false;
      if (!term) return true;
      return (
        (log.actor_name || "").toLowerCase().includes(term) ||
        (log.actor_email || "").toLowerCase().includes(term) ||
        (log.summary || "").toLowerCase().includes(term) ||
        (log.action || "").toLowerCase().includes(term)
      );
    });
  }, [logs, category, role, search]);

  // Lets the empty state explain itself and offer a way back.
  const hasFilter = search.trim() !== "" || category !== "All" || role !== "";

  /**
   * Ten records to a page.
   *
   * This screen asked for 300 records and rendered every one of them, which on a
   * busy platform is a very long scroll with no way to say "the one I saw an hour
   * ago". Ten matches the shop's order list, so paging through activity and paging
   * through orders feel like the same control.
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /*
   * Hold the page inside the list.
   *
   * Any of the three filters can shrink the list under the page being read, and
   * the trail also refreshes itself every fifteen seconds -- so without this a
   * narrow search would land on page 4 of 1 and render an empty table with no
   * explanation and no way back except changing a filter by accident.
   */
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  /*
   * Back to the first page whenever the question changes.
   *
   * Deliberately not the same effect: a filter narrowing the list should clamp
   * (above), but choosing a filter is a new question being asked, and answering
   * page 7 of the previous question's results is never what anyone meant.
   */
  const applyFilter = <T,>(setter: (v: T) => void) => (value: T) => {
    setPage(1);
    setter(value);
  };

  return (
    <AdminShell
      title="Audit Trail"
      subtitle="Admin, customer, driver and business activity"
    >

        <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
          {!isSuperAdmin ? (
            <EmptyState
              icon={ShieldCheck}
              title="Super Admin only"
              description="The audit trail records platform-wide activity."
              filipino="Ito ay para sa Super Admin lamang."
            />
          ) : (
            <>
              <AdminPageIntro eyebrow="Audit trail" title="Every action, accounted for." description="Trace platform activity, understand changes, and inspect the details behind each recorded event." note="Latest 300 records · Refreshes every 15 seconds" />
              <AdminMetricCards loading={loading} items={[
                { label: 'Loaded records', value: logs.length, detail: 'Latest activity, newest first', Icon: ClipboardList },
                { label: 'Actor roles', value: new Set(logs.map(roleFor)).size, detail: 'Roles represented in these records', Icon: Users, tone: 'info' },
                { label: 'Matching records', value: filtered.length, detail: 'With the current filters', Icon: Activity, tone: 'success' },
              ]} />
              {loadError && (
                <Card className="p-4 mb-6 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--amber-ink)]">{loadError}</p>
                  </div>
                </Card>
              )}

              <section aria-label="Filter audit records" className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="text-base font-bold text-[var(--ink)]">Find an activity</h2>
              <div role="group" aria-label="Filter by actor role" className="flex flex-wrap gap-2">
                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r.key || "all"}
                    onClick={() => applyFilter(setRole)(r.key)}
                    aria-pressed={role === r.key}
                    className={`min-h-11 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      role === r.key
                        ? "bg-[var(--ink-solid)] text-white"
                        : "bg-[var(--surface)] border border-line text-[var(--muted-foreground)]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Category filter + search */}
              <div className="flex flex-col gap-4">
                <div role="group" aria-label="Filter by activity category" className="flex flex-wrap gap-2">
                  {CATEGORY_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => applyFilter(setCategory)(f)}
                      aria-pressed={category === f}
                      className={`min-h-11 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        category === f
                          ? "bg-[var(--teal-soft)] text-[var(--teal)] border border-[var(--teal)]/30"
                          : "bg-[var(--surface)] border border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2 min-h-11 bg-soft border border-line rounded-xl">
                  <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true" />
                  <label htmlFor="admin-audit-search" className="sr-only">
                    Search the audit trail
                  </label>
                  <input
                    id="admin-audit-search"
                    type="search"
                    value={search}
                    onChange={(e) => applyFilter(setSearch)(e.target.value)}
                    placeholder="Search actor or action…"
                    className="flex-1 text-sm outline-none bg-transparent min-w-0"
                  />
                </div>
              </div>

              {hasFilter && <button type="button" onClick={() => { setSearch(''); setRole(''); setCategory('All'); setPage(1); }} className="min-h-11 rounded-xl px-3 text-xs font-bold text-[var(--teal)] hover:bg-[var(--teal-soft)]">Clear filters</button>}
              </section>
              <p role="status" className="text-xs text-[var(--muted-foreground)] font-medium mb-3">
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
                {pageCount > 1 && ` \u00b7 page ${page} of ${pageCount}`}
              </p>

              {loading ? (
                <TableSkeleton rows={8} cols={5} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={hasFilter ? "No activity matches these filters" : "No activity yet"}
                  description={
                    hasFilter
                      ? "Try a different search term, category or role."
                      : "Admin changes plus customer, driver and business activity will appear here."
                  }

                  action={
                    hasFilter ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setCategory("All");
                          setRole("");
                        }}
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <Card className="gap-0 rounded-3xl border border-line bg-card overflow-hidden">
                  {/* Stack records until the content area can comfortably fit the table. */}
                  <div className="divide-y divide-line @min-[60rem]:hidden">
                    {visible.map((log) => {
                      const meta = metaFor(log.action);
                      const rMeta = roleMeta(roleFor(log));
                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => setOpenLog(log)}
                          aria-label={`${meta.label} by ${log.actor_name || log.actor_email || "System"}. Open full details.`}
                          className="block w-full p-4 space-y-1.5 text-left transition-colors hover:bg-[var(--muted)] active:bg-[var(--muted)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Badge className={`${meta.badge}`}>{meta.label}</Badge>
                            <ChevronRight
                              className="size-4 shrink-0 text-[var(--muted-foreground)]"
                              aria-hidden="true"
                            />
                          </div>
                          <p className="text-sm font-semibold text-[var(--ink)] break-all">
                            {log.actor_name || log.actor_email || "System"}
                            <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">
                              {rMeta.label}
                            </span>
                          </p>
                          <p className="text-sm text-[var(--ink)] break-words">{log.summary || "—"}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatDay(log.created_at)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="hidden @min-[60rem]:block overflow-x-auto">
                    <table className="w-full">
                      <caption className="sr-only">
                        Platform activity log, newest first.
                      </caption>
                      <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                        {/*
                          Four columns, down from six.

                          Role and Details were the two that made the table
                          unreadable rather than informative. The role badge
                          repeated what the actor column already implied, and
                          Details flattened a JSON blob onto one line at 60
                          characters a field -- so on a wide screen the summary
                          everyone actually reads was squeezed into a narrow
                          column, and on a phone the table was cut off.

                          Both are in the record itself now: tap any row.
                        */}
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Date</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Actor</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Action</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {visible.map((log) => {
                          const meta = metaFor(log.action);
                          const rMeta = roleMeta(roleFor(log));
                          /*
                            A row that opens the record.

                            `role="button"` plus `tabIndex` and a key handler,
                            because a clickable <tr> is unreachable by keyboard
                            otherwise -- and an audit trail is the last screen
                            where that should be true.
                          */
                          return (
                            <tr
                              key={log.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`${meta.label} by ${log.actor_name || log.actor_email || "System"}. Open full details.`}
                              onClick={() => setOpenLog(log)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setOpenLog(log);
                                }
                              }}
                              className="cursor-pointer hover:bg-[var(--muted)] transition-colors active:bg-[var(--muted)]"
                            >
                              <td className="px-4 py-4 whitespace-nowrap">
                                <p className="text-sm text-[var(--muted-foreground)]">{formatDay(log.created_at)}</p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm font-semibold text-[var(--ink)] break-all">
                                  {log.actor_name || log.actor_email || "System"}
                                </p>
                                {/*
                                  The role moves under the name rather than into
                                  its own column: it qualifies who did it, and
                                  nobody reads a table of roles instead of people.
                                */}
                                <p className="text-xs text-[var(--muted-foreground)]">{rMeta.label}</p>
                              </td>
                              <td className="px-4 py-4">
                                <Badge className={`${meta.badge} whitespace-nowrap`}>
                                  {meta.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <p className="min-w-0 flex-1 text-sm text-[var(--ink)]">
                                    {log.summary || "—"}
                                  </p>
                                  <ChevronRight
                                    className="size-4 shrink-0 text-[var(--muted-foreground)]"
                                    aria-hidden="true"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/*
                One record, in full.

                The list is for scanning; this is for the one time someone
                actually needs to know what was recorded -- the exact second,
                which address an approval carried, what a rate changed from.
                Nothing here is truncated, because a details field cut off at 60
                characters is the thing you opened the record to avoid.
              */}
              {openLog && (
                <div
                  className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 p-4"
                  onClick={() => setOpenLog(null)}
                >
                  <Card
                    role="dialog" aria-modal="true" aria-label="Audit record details" className="min-w-0 w-full max-w-lg max-h-[85dvh] gap-4 overflow-y-auto rounded-3xl bg-card p-5 sm:p-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={`max-w-full whitespace-normal break-words ${metaFor(openLog.action).badge}`}>
                            {metaFor(openLog.action).label}
                          </Badge>
                          <Badge className={`${roleMeta(roleFor(openLog)).badge}`}>
                            {roleMeta(roleFor(openLog)).label}
                          </Badge>
                        </div>
                        <p className="mt-2 break-words text-lg font-bold text-[var(--ink)]">
                          {openLog.summary || "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenLog(null)}
                        aria-label="Close details"
                        className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] active:scale-90"
                      >
                        <X className="size-5" aria-hidden="true" />
                      </button>
                    </div>

                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                          Date
                        </dt>
                        <dd className="mt-0.5 break-words text-[var(--ink)]">{fullDate(openLog.created_at)}</dd>
                      </div>

                      <div>
                        <dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                          Actor
                        </dt>
                        <dd className="mt-0.5 break-words text-[var(--ink)]">
                          {openLog.actor_name || openLog.actor_email || "System"}
                          {openLog.actor_name && openLog.actor_email && (
                            <span className="block break-all text-xs text-[var(--muted-foreground)]">
                              {openLog.actor_email}
                            </span>
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                          Recorded action
                        </dt>
                        {/* The raw key, not the friendly label: an audit is
                            checked against what the system recorded. */}
                        <dd className="mt-0.5 break-all font-mono text-xs text-[var(--ink)]">{openLog.action}</dd>
                      </div>

                      {detailEntries(openLog.details).length > 0 && (
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">
                            Details
                          </dt>
                          <dd className="mt-1 space-y-1.5">
                            {detailEntries(openLog.details).map((d) => (
                              <div
                                key={d.label}
                                className="rounded-lg bg-[var(--muted)] px-3 py-2"
                              >
                                <p className="text-xs font-semibold capitalize text-[var(--muted-foreground)]">
                                  {d.label}
                                </p>
                                <p className="mt-0.5 break-words text-[var(--ink)]">{d.value}</p>
                              </div>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <Button
                      type="button"
                      onClick={() => setOpenLog(null)}
                      className="mt-5 min-h-11 w-full bg-[var(--primary)] text-[var(--primary-foreground)]"
                    >
                      Close
                    </Button>
                  </Card>
                </div>
              )}

              {/*
                Paging.

                Sits below the records rather than above them, because the thing
                being paged is what you have just read. It renders nothing when
                everything fits on one page, so a quiet trail is not decorated with
                controls for a problem it does not have.
              */}
              {!loading && pageCount > 1 && (
                <ListPagination
                  label="Audit record"
                  page={page}
                  pageCount={pageCount}
                  onChange={setPage}
                />
              )}
            </>
          )}
        </div>
    </AdminShell>
  );
}
