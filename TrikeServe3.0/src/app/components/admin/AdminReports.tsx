import { useState, useEffect, useMemo } from "react";
import {
  Menu, ShieldCheck, Search, AlertTriangle, Flag,
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

import { supabaseHelpers } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
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
  pending: { label: "Pending", badge: "bg-[var(--amber)]" },
  reviewing: { label: "Reviewing", badge: "bg-[var(--info)]" },
  resolved: { label: "Resolved", badge: "bg-[var(--success)]" },
  dismissed: { label: "Dismissed", badge: "bg-[var(--muted-foreground)]" },
};

const STATUS_FILTERS = ["All", "pending", "reviewing", "resolved", "dismissed"] as const;

function statusMeta(status: string) {
  return STATUS_META[status] || { label: status, badge: "bg-[var(--muted-foreground)]" };
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

        <div className="space-y-6">
          {!isSuperAdmin ? (
            <EmptyState
              icon={ShieldCheck}
              title="Super Admin only"
              description="Customer ride reports are reviewed by the Super Admin."
              filipino="Ito ay para sa Super Admin lamang."
            />
          ) : (
            <>
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="flex gap-2 overflow-x-auto">
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      aria-pressed={statusFilter === f}
                      className={`min-h-11 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap capitalize transition-all ${
                        statusFilter === f
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--surface)] border border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {f === "All" ? "All" : statusMeta(f).label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 min-h-11 bg-[var(--surface)] border border-line rounded-xl sm:ml-auto sm:w-64">
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
                  filipino={hasFilter ? "Wala pang tumutugma sa mga filter na ito." : "Wala pang ulat ng rides."}
                  action={
                    hasFilter ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("All");
                        }}
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filtered.map((report) => {
                    const meta = statusMeta(report.status);
                    return (
                      <Card key={report.id} className="p-4 border border-line bg-surface">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge className={`${meta.badge} text-white`}>{meta.label}</Badge>
                              <span className="text-sm font-bold text-[var(--ink)]">{report.category}</span>
                            </div>
                            <p className="text-sm text-[var(--ink)] break-words">{report.description}</p>
                            <div className="mt-2 space-y-0.5 text-xs text-[var(--muted-foreground)]">
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

                          <div className="flex gap-2 flex-shrink-0">
                            {report.status !== "resolved" && (
                              <button
                                disabled={busyId === report.id}
                                onClick={() => setStatus(report.id, "resolved")}
                                aria-label={`Resolve ${report.category} report from ${report.reporter_name || "a customer"}`}
                                className="min-h-11 px-3 rounded-lg bg-[var(--success)] text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
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
