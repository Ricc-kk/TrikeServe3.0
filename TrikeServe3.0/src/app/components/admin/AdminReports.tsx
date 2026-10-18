import { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck, Search, AlertTriangle, Flag, Clock3, CheckCircle, Archive,
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
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
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
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
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
  }, [reports, statusFilter, search]);

  // Lets the empty state explain itself and offer a way back.
  const hasFilter = search.trim() !== "" || statusFilter !== "All";

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
              <AdminPageIntro eyebrow="Ride reports" title="A safer ride starts with listening." description="Review customer concerns, investigate ride issues, and keep track of every outcome." note="Updates automatically every 15 seconds" />
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

              {/* Filters + search */}
              <div className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4 sm:p-5">
                <div role="group" aria-label="Filter reports by status" className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      aria-pressed={statusFilter === f}
                      className={`min-h-11 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap capitalize transition-all ${
                        statusFilter === f
                          ? "bg-[var(--teal-soft)] text-[var(--teal)] border border-[var(--teal)]/30"
                          : "bg-[var(--surface)] border border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {f === "All" ? "All" : statusMeta(f).label}
                    </button>
                  ))}
                </div>
                <div className="flex min-w-0 w-full items-center gap-2 px-3 py-2 min-h-11 bg-soft border border-line rounded-xl">
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
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("All");
                        }}
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
