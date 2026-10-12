import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Inbox, Search, X, XCircle } from "lucide-react";

import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminShell from "./AdminShell";
import { TableSkeleton } from "./AdminSkeleton";
import EmptyState from "../ui/EmptyState";
import {
  getApprovalRequests,
  type ApprovalRequest,
  type ApprovalRequestStatus,
} from "../../../lib/supabase";
import {
  describePayload,
  formatDate,
  requestLabel,
  typeBadgeColor,
  typeIcon,
} from "./approvalView";
import { isSuperAdmin } from "./adminNav";

type StatusFilter = "all" | ApprovalRequestStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function statusStyle(status: ApprovalRequestStatus) {
  switch (status) {
    case "approved":
      return "bg-[var(--success-soft)] text-[var(--success)]";
    case "rejected":
      return "bg-[var(--error-soft)] text-[var(--error)]";
    default:
      return "bg-[var(--amber-soft)] text-[var(--amber-ink)]";
  }
}

function StatusIcon({ status }: { status: ApprovalRequestStatus }) {
  if (status === "approved") return <CheckCircle className="w-4 h-4" aria-hidden="true" />;
  if (status === "rejected") return <XCircle className="w-4 h-4" aria-hidden="true" />;
  return <Clock className="w-4 h-4" aria-hidden="true" />;
}

/** Everything a search box should match against, as one lowercase string. */
function searchableText(request: ApprovalRequest): string {
  const payload = request.payload || {};
  return [
    requestLabel(request),
    request.request_type,
    payload.name,
    payload.driver_name,
    payload.terminal_name,
    payload.new_plate,
    payload.previous_plate,
    payload.after?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Everything this Rider Admin has sent to the Super Admin, and what became of it.
 *
 * Read-only on purpose: approving or rejecting is the Super Admin's call, so
 * this screen only reports the outcome. `getApprovalRequests` is filtered by the
 * signed-in admin's own email, so one Rider Admin can never see another's
 * submissions even if this route were reachable another way.
 */
export default function AdminSubmittedRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const email = user?.email ?? null;
  // A Rider Admin has no one to submit to; showing them the Super Admin's whole
  // inbox would be wrong, and the screen would have nothing to say.
  const isRider = !isSuperAdmin(user);

  const loadRequests = useCallback(async () => {
    if (!email) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const { data, error } = await getApprovalRequests({ requestedByEmail: email });
    if (error) {
      setLoadError(error);
      setRequests([]);
    } else {
      setLoadError(null);
      setRequests(data);
    }
    setLoading(false);
  }, [email]);

  useEffect(() => {
    loadRequests();
    // Matches the 10s poll on Approvals, so a request approved in another tab
    // doesn't sit here reading "Pending" until this one is reloaded.
    const interval = setInterval(loadRequests, 10000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  const counts = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter(r => r.status === "pending").length,
      approved: requests.filter(r => r.status === "approved").length,
      rejected: requests.filter(r => r.status === "rejected").length,
    }),
    [requests]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter(r => {
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      return searchableText(r).includes(needle);
    });
  }, [requests, query, status]);

  return (
    <AdminShell
      title="Submitted Requests"
      subtitle="Everything you have sent to the Super Admin, and what became of it"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3 lg:gap-6">
          <Card className="p-4 lg:p-6 border border-line bg-surface">
            <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Pending</p>
            <h2 className="text-2xl lg:text-4xl font-bold text-[var(--amber)]">{counts.pending}</h2>
          </Card>
          <Card className="p-4 lg:p-6 border border-line bg-surface">
            <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Approved</p>
            <h2 className="text-2xl lg:text-4xl font-bold text-[var(--success)]">{counts.approved}</h2>
          </Card>
          <Card className="p-4 lg:p-6 border border-line bg-surface">
            <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Rejected</p>
            <h2 className="text-2xl lg:text-4xl font-bold text-[var(--error)]">{counts.rejected}</h2>
          </Card>
        </div>

        {loadError && (
          <Card className="p-4 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--amber-ink)]">{loadError}</p>
            </div>
          </Card>
        )}

        {/* Search + status filter. Hidden until there's something to filter, so an
            empty inbox isn't showing controls that do nothing. */}
        {requests.length > 0 && (
          <Card className="p-4 border border-line bg-surface">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="w-4 h-4 text-[var(--muted-foreground)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by terminal, driver or plate…"
                  aria-label="Search submitted requests"
                  className="w-full h-11 pl-9 pr-9 border border-line focus:border-[var(--primary)] rounded-xl text-sm outline-none bg-surface"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[var(--muted)]"
                  >
                    <X className="w-4 h-4 text-[var(--muted-foreground)]" />
                  </button>
                )}
              </div>

              <div
                className="flex gap-2"
                role="group"
                aria-label="Filter by status"
              >
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatus(f.value)}
                    aria-pressed={status === f.value}
                    className={`flex-1 sm:flex-none h-11 px-3 sm:px-4 rounded-xl text-sm font-bold transition-colors ${
                      status === f.value
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length !== requests.length && (
              <p className="text-xs text-[var(--muted-foreground)] mt-3">
                Showing {visible.length} of {requests.length}
              </p>
            )}
          </Card>
        )}

        {loading ? (
          <Card className="border border-line bg-surface p-4">
            <TableSkeleton rows={5} cols={5} />
          </Card>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={isRider ? "You haven't submitted anything yet" : "No submitted requests"}
            description={
              isRider
                ? "Changes you make to your terminal or drivers are sent to the Super Admin and appear here with their outcome."
                : "Requests sent to you by other admins will appear here."
            }
            filipino="Wala pang isinumiteng kahiling. Ang mga pagbabago mo sa terminal o driver ay ipapasa sa Super Admin at lalabas dito kasama ang resulta."
          />
        ) : visible.length === 0 ? (
          <Card className="p-12 border-2 border-dashed border-[var(--border)] text-center">
            <Search className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" aria-hidden="true" />
            <p className="text-[var(--muted-foreground)] text-sm">No requests match your filters</p>
            <button
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
              className="mt-3 text-sm font-bold text-[var(--primary)]"
            >
              Clear filters
            </button>
          </Card>
        ) : (
          <ul className="space-y-3">
            {visible.map(request => (
              <li key={request.id}>
                <Card className="p-4 lg:p-5 border border-line bg-surface">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 bg-[var(--muted)] rounded-xl flex items-center justify-center flex-shrink-0">
                      {typeIcon(request.request_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-[var(--ink)]">
                          {requestLabel(request)}
                        </h3>
                        <Badge className={typeBadgeColor(request.request_type)}>
                          {request.request_type.toUpperCase().replace(/_/g, " ")}
                        </Badge>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${statusStyle(request.status)}`}
                        >
                          <StatusIcon status={request.status} />
                          {request.status === "pending" ? "Awaiting approval" : request.status}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        Submitted {formatDate(request.requested_at)}
                        {request.reviewed_at && request.status !== "pending" && (
                          <> · Reviewed {formatDate(request.reviewed_at)}</>
                        )}
                      </p>

                      <div className="mt-2 space-y-0.5">
                        {describePayload(request).map((line, i) => (
                          <p key={i} className="text-sm text-[var(--muted-foreground)] break-words">
                            {line}
                          </p>
                        ))}
                      </div>

                      {request.status === "rejected" && request.rejection_reason && (
                        <p className="mt-3 text-sm text-[var(--error)] bg-[var(--error-soft)] rounded-xl px-3 py-2">
                          <span className="font-bold">Reason: </span>
                          {request.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
