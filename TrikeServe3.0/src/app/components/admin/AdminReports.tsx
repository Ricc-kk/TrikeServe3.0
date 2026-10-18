import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Search, AlertTriangle, Flag, Clock3, CheckCircle, Archive, Filter, ChevronDown, X,
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

import { supabaseHelpers } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import { TableSkeleton } from "./AdminSkeleton";
import EmptyState from "../ui/EmptyState";

interface RideReport {
  id: string;
  ride_id?: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  driver_name?: string | null;
  category: string;
  description: string;
  ride_route?: string | null;
  status: string;
  admin_notes?: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: "Pending", badge: "bg-[var(--amber-soft)] text-[var(--amber-ink)]" },
  reviewing: { label: "Reviewing", badge: "bg-[var(--info-soft)] text-[var(--info)]" },
  resolved: { label: "Resolved", badge: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  dismissed: { label: "Dismissed", badge: "bg-soft text-[var(--muted-foreground)]" },
};

const STATUS_FILTERS = ["All", "pending", "reviewing", "resolved", "dismissed"] as const;
type ReportStatusFilter = Exclude<(typeof STATUS_FILTERS)[number], "All">;

function statusMeta(status: string) {
  return STATUS_META[status] || { label: status, badge: "bg-soft text-[var(--muted-foreground)]" };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function AdminReports() {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminType === "business_customer";

  const [reports, setReports] = useState<RideReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<ReportStatusFilter[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadReports = async () => {
    const { data, error } = await supabaseHelpers.getRideReports();
    setLoadError(error ? String(error.message || error) : null);
    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadReports();
    const interval = setInterval(loadReports, 15000);
    return () => clearInterval(interval);
  }, [isSuperAdmin]);

  const setStatus = async (id: string, status: string) => {
    setBusyId(id);
    const previous = reports;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const { error } = await supabaseHelpers.updateRideReportStatus(id, status);
    if (error) {
      setReports(previous);
      alert("Could not update the report. Please try again.");
    }
    setBusyId(null);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilters.length > 0 && !statusFilters.includes(r.status as ReportStatusFilter)) return false;
      if (!term) return true;
      return (
        (r.reporter_name || "").toLowerCase().includes(term) ||
        (r.reporter_email || "").toLowerCase().includes(term) ||
        (r.driver_name || "").toLowerCase().includes(term) ||
        (r.category || "").toLowerCase().includes(term) ||
        (r.description || "").toLowerCase().includes(term) ||
        (r.ride_route || "").toLowerCase().includes(term)
      );
    });
  }, [reports, statusFilters, search]);

  // Lets the empty state explain itself and offer a way back.
  const hasFilter = search.trim() !== "" || statusFilters.length > 0;

  const clearFilters = () => {
    setSearch("");
    setStatusFilters([]);
    setIsFilterOpen(false);
  };

  return (
    <AdminShell
      title="Ride Reports"
      subtitle="Reports submitted by customers about completed rides"
    >

        <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
          {!isSuperAdmin ? (
            <EmptyState
              icon={ShieldCheck}
              title="Super Admin only"
              description="Customer ride reports are reviewed by the Super Admin."
              filipino="Ito ay para sa Super Admin lamang."
            />
          ) : (
            <>
              <AdminPageIntro eyebrow="Ride reports" title="A safer ride starts with listening." description="Review customer concerns, investigate ride issues, and keep track of every outcome." />
              <AdminMetricCards loading={loading} items={[
                { label: 'Total reports', value: reports.length, Icon: Flag },
                { label: 'Needs attention', value: reports.filter(r => r.status === 'pending' || r.status === 'reviewing').length, Icon: Clock3, tone: 'amber' },
                { label: 'Resolved', value: reports.filter(r => r.status === 'resolved').length, Icon: CheckCircle, tone: 'success' },
                { label: 'Dismissed', value: reports.filter(r => r.status === 'dismissed').length, Icon: Archive, tone: 'info' },
              ]} />
              {loadError && (
                <Card className="p-4 mb-6 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--amber-ink)]">
                      {loadError}. If the reports table is missing, run CREATE_RIDE_REPORTS.sql.
                    </p>
                  </div>
                </Card>
              )}

              {/* Search, status filter and selected filters */}
              <div className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-soft px-3 py-2">
                  <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true" />
                  <label htmlFor="admin-report-search" className="sr-only">
                    Search reports
                  </label>
                  <input
                    id="admin-report-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search reporter, driver, details…"
                    className="flex-1 text-sm outline-none bg-transparent min-w-0"
                  />
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-expanded={isFilterOpen}
                    aria-label={`Filter reports${statusFilters.length ? `, ${statusFilters.length} selected` : ''}`}
                    onClick={() => setIsFilterOpen(open => !open)}
                    onKeyDown={event => { if (event.key === 'Escape') setIsFilterOpen(false); }}
                    className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 sm:px-4 text-sm font-bold transition-colors ${statusFilters.length ? 'border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)]' : 'border-line bg-[var(--muted)] text-[var(--ink)] hover:bg-[var(--border)]'}`}
                  >
                    <Filter className="size-4" aria-hidden="true" />
                    <span>Filter</span>
                    {statusFilters.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--teal)] text-[10px] text-white">{statusFilters.length}</span>}
                    <ChevronDown className={`size-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {isFilterOpen && (
                    <div role="group" aria-label="Filter reports by status" className="absolute right-0 top-full z-30 mt-2 max-h-80 w-56 overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-xl">
                      {STATUS_FILTERS.map(status => {
                        const isSelected = status === 'All' ? statusFilters.length === 0 : statusFilters.includes(status);
                        const label = status === 'All' ? 'All statuses' : statusMeta(status).label;
                        const count = status === 'All' ? reports.length : reports.filter(report => report.status === status).length;
                        return (
                          <button
                            key={status}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              if (status === 'All') setStatusFilters([]);
                              else setStatusFilters(current => current.includes(status)
                                ? current.filter(selected => selected !== status)
                                : [...current, status]);
                            }}
                            className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold transition-colors ${isSelected ? 'bg-[var(--teal-soft)] text-[var(--teal)]' : 'text-[var(--ink)] hover:bg-[var(--muted)]'}`}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span>{label} <span className="text-xs opacity-70">({count})</span></span>
                              {isSelected && <CheckCircle aria-hidden="true" className="size-4 shrink-0" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                </div>
                {statusFilters.length > 0 && (
                  <div aria-label="Selected report status filters" className="flex flex-wrap gap-2">
                    {statusFilters.map(status => (
                      <span key={status} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--teal)]/30 bg-[var(--teal-soft)] py-1 pl-3 pr-1.5 text-xs font-semibold text-[var(--teal)]">
                        {statusMeta(status).label}
                        <button
                          type="button"
                          aria-label={`Remove ${statusMeta(status).label} filter`}
                          onClick={() => setStatusFilters(current => current.filter(selected => selected !== status))}
                          className="grid size-6 place-items-center rounded-full transition-colors hover:bg-[var(--teal)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
                        >
                          <X aria-hidden="true" className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-[var(--muted-foreground)] font-medium mb-3">
                {filtered.length} report{filtered.length !== 1 ? "s" : ""}
              </p>

              {loading ? (
                <TableSkeleton rows={4} cols={4} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Flag}
                  title={hasFilter ? "No reports match these filters" : "No reports yet"}
                  description={
                    hasFilter
                      ? "Try a different search term or status."
                      : "Customer ride reports will appear here."
                  }

                  action={
                    hasFilter ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid items-start gap-4 @min-[60rem]:grid-cols-2">
                  {filtered.map((report) => {
                    const meta = statusMeta(report.status);
                    return (
                      <Card key={report.id} className="min-w-0 gap-0 rounded-3xl p-4 sm:p-5 border border-line bg-card">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 w-full">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge className={meta.badge}>{meta.label}</Badge>
                              <span className="text-sm font-bold text-[var(--ink)]">{report.category}</span>
                            </div>
                            <p className="text-sm text-[var(--ink)] break-words">{report.description}</p>
                            <div className="mt-3 space-y-1.5 break-words text-xs text-[var(--muted-foreground)]">
                              {report.ride_route && <p>🛣️ {report.ride_route}</p>}
                              <p>
                                👤 Driver: <span className="font-semibold text-[var(--ink)]">{report.driver_name || "Driver"}</span>
                              </p>
                              <p>
                                🙋 Reported by: <span className="font-semibold text-[var(--ink)]">{report.reporter_name || "Customer"}</span>
                                {report.reporter_email && <span> · {report.reporter_email}</span>}
                              </p>
                              <p>🕒 {formatDate(report.created_at)}</p>
                            </div>
                          </div>

                          <div className="grid w-full grid-cols-2 gap-2 border-t border-line pt-4">
                            {report.status !== "resolved" && (
                              <button
                                disabled={busyId === report.id}
                                onClick={() => setStatus(report.id, "resolved")}
                                aria-label={`Resolve ${report.category} report from ${report.reporter_name || "a customer"}`}
                                className="min-h-11 px-3 rounded-lg bg-[var(--success-ink)] text-[var(--background)] text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                              >
                                Resolve
                              </button>
                            )}
                            {report.status !== "dismissed" && (
                              <button
                                disabled={busyId === report.id}
                                onClick={() => setStatus(report.id, "dismissed")}
                                aria-label={`Dismiss ${report.category} report from ${report.reporter_name || "a customer"}`}
                                className="min-h-11 px-3 rounded-lg bg-[var(--muted)] border border-line text-[var(--muted-foreground)] text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                              >
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
    </AdminShell>
  );
}
