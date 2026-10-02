import { useState, useEffect, useMemo } from "react";
import {
  Menu, ShieldCheck, Search, AlertTriangle, ClipboardList,
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

import { getAuditLogs, type AuditLog } from "../../../lib/supabase";
import AdminShell from "./AdminShell";
import { TableSkeleton } from "./AdminSkeleton";
import EmptyState from "../ui/EmptyState";

/** Display label + badge colour for each recorded action. */
const ACTION_META: Record<string, { label: string; badge: string; category: string }> = {
  // Admin actions
  approve_request: { label: "Approved request", badge: "bg-[var(--success)]", category: "Approvals" },
  reject_request: { label: "Rejected request", badge: "bg-[var(--error)]", category: "Approvals" },
  verify_user: { label: "Verified user", badge: "bg-[var(--success)]", category: "Users" },
  reject_user: { label: "Rejected user", badge: "bg-[var(--error)]", category: "Users" },
  create_terminal: { label: "Created terminal", badge: "bg-[var(--info)]", category: "Terminals" },
  update_terminal: { label: "Updated terminal", badge: "bg-[var(--info)]", category: "Terminals" },
  delete_terminal: { label: "Deleted terminal", badge: "bg-[var(--error)]", category: "Terminals" },
  assign_rider_admin: { label: "Rider admin assignment", badge: "bg-[var(--violet)]", category: "Assignments" },
  update_rate: { label: "Updated rates", badge: "bg-[var(--amber)]", category: "Rates" },
  // Customer actions
  create_ride: { label: "Booked ride", badge: "bg-[var(--primary)]", category: "Rides" },
  cancel_ride: { label: "Cancelled ride", badge: "bg-[var(--error)]", category: "Rides" },
  place_order: { label: "Placed order", badge: "bg-[var(--primary)]", category: "Orders" },
  report_ride: { label: "Reported a ride", badge: "bg-[var(--error)]", category: "Rides" },
  // Driver actions
  accept_ride: { label: "Accepted ride", badge: "bg-[var(--success)]", category: "Rides" },
  complete_ride: { label: "Completed ride", badge: "bg-[var(--success)]", category: "Rides" },
  // Business actions
  update_order_status: { label: "Updated order", badge: "bg-[var(--info)]", category: "Orders" },
};

const CATEGORY_FILTERS = [
  "All", "Approvals", "Users", "Terminals", "Rides", "Orders", "Rates", "Assignments",
] as const;

const ROLE_FILTERS: { key: string; label: string; badge: string }[] = [
  { key: "", label: "All roles", badge: "" },
  { key: "admin", label: "Admin", badge: "bg-[var(--teal)]" },
  { key: "rider", label: "Driver", badge: "bg-[var(--info)]" },
  { key: "customer", label: "Customer", badge: "bg-[var(--success)]" },
  { key: "business", label: "Business", badge: "bg-[var(--violet)]" },
];

const ROLE_META: Record<string, { label: string; badge: string }> = {
  admin: { label: "Admin", badge: "bg-[var(--teal)]" },
  rider: { label: "Driver", badge: "bg-[var(--info)]" },
  customer: { label: "Customer", badge: "bg-[var(--success)]" },
  business: { label: "Business", badge: "bg-[var(--violet)]" },
};

function metaFor(action: string) {
  return (
    ACTION_META[action] || {
      label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      badge: "bg-[var(--muted-foreground)]",
      category: "Other",
    }
  );
}

/** Older admin entries predate actor_role, so default them to "admin". */
function roleFor(log: AuditLog): string {
  return log.actor_role || "admin";
}

function roleMeta(role: string) {
  return ROLE_META[role] || { label: role, badge: "bg-[var(--muted-foreground)]" };
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

function describeDetails(details: any): string {
  if (details == null) return "—";
  if (typeof details !== "object") return String(details);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === "") continue;
    const label = key.replace(/_/g, " ");
    const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
    parts.push(`${label}: ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export default function AuditTrail() {
  const { user } = useAuth();
  const isSuperAdmin = user?.adminType === "business_customer";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>("All");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");

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

  return (
    <AdminShell
      title="Audit Trail"
      subtitle="Admin, customer, driver and business activity"
    >

        <div className="space-y-6">
          {!isSuperAdmin ? (
            <EmptyState
              icon={ShieldCheck}
              title="Super Admin only"
              description="The audit trail records platform-wide activity."
              filipino="Ito ay para sa Super Admin lamang."
            />
          ) : (
            <>
              {loadError && (
                <Card className="p-4 mb-6 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-[var(--amber-dark)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[var(--amber-dark)]">{loadError}</p>
                  </div>
                </Card>
              )}

              {/* Role filter */}
              <div className="flex gap-2 overflow-x-auto mb-3">
                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r.key || "all"}
                    onClick={() => setRole(r.key)}
                    aria-pressed={role === r.key}
                    className={`min-h-11 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="flex gap-2 overflow-x-auto">
                  {CATEGORY_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setCategory(f)}
                      aria-pressed={category === f}
                      className={`min-h-11 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        category === f
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--surface)] border border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 min-h-11 bg-[var(--surface)] border border-line rounded-xl sm:ml-auto sm:w-64">
                  <Search className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0" aria-hidden="true" />
                  <label htmlFor="admin-audit-search" className="sr-only">
                    Search the audit trail
                  </label>
                  <input
                    id="admin-audit-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search actor or action…"
                    className="flex-1 text-sm outline-none bg-transparent min-w-0"
                  />
                </div>
              </div>

              <p className="text-xs text-[var(--muted-foreground)] font-medium mb-3">
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
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
                  filipino={
                    hasFilter
                      ? "Wala pang aktibidad na tumutugma sa mga filter na ito."
                      : "Wala pang naitalang aktibidad."
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
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <Card className="border border-line bg-surface overflow-hidden">
                  {/* Mobile: the 6-column table needs ~800px, so below sm each
                      record becomes a stacked card instead of a scrolling grid. */}
                  <div className="sm:hidden divide-y divide-[var(--border)]">
                    {filtered.map((log) => {
                      const meta = metaFor(log.action);
                      const rMeta = roleMeta(roleFor(log));
                      return (
                        <div key={log.id} className="p-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`${meta.badge} text-white`}>{meta.label}</Badge>
                            <Badge className={`${rMeta.badge} text-white`}>{rMeta.label}</Badge>
                          </div>
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {log.actor_name || log.actor_email || "System"}
                          </p>
                          {log.actor_name && log.actor_email && (
                            <p className="text-xs text-[var(--muted-foreground)] break-all">{log.actor_email}</p>
                          )}
                          <p className="text-sm text-[var(--ink)]">{log.summary || "—"}</p>
                          <p className="text-xs text-[var(--muted-foreground)] break-words">
                            {describeDetails(log.details)}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatDate(log.created_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <caption className="sr-only">
                        Platform activity log, newest first.
                      </caption>
                      <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">When</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Role</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Actor</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Action</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Summary</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {filtered.map((log) => {
                          const meta = metaFor(log.action);
                          const rMeta = roleMeta(roleFor(log));
                          return (
                            <tr key={log.id} className="hover:bg-[var(--muted)] transition-colors">
                              <td className="px-4 py-4 whitespace-nowrap">
                                <p className="text-sm text-[var(--muted-foreground)]">{formatDate(log.created_at)}</p>
                              </td>
                              <td className="px-4 py-4">
                                <Badge className={`${rMeta.badge} text-white whitespace-nowrap`}>
                                  {rMeta.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm font-semibold text-[var(--ink)]">
                                  {log.actor_name || log.actor_email || "System"}
                                </p>
                                {log.actor_name && log.actor_email && (
                                  <p className="text-xs text-[var(--muted-foreground)]">{log.actor_email}</p>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <Badge className={`${meta.badge} text-white whitespace-nowrap`}>
                                  {meta.label}
                                </Badge>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm text-[var(--ink)]">{log.summary || "—"}</p>
                              </td>
                              <td className="px-4 py-4 max-w-md">
                                <p className="text-xs text-[var(--muted-foreground)] break-words">
                                  {describeDetails(log.details)}
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
    </AdminShell>
  );
}
