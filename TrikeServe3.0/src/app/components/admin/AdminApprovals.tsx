import { useMemo, useState, useEffect } from "react";
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight, Search, X } from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminShell from "./AdminShell";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import { TableSkeleton } from "./AdminSkeleton";
import {
  getApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  logAudit,
  APPROVAL_REQUEST_LABELS,
  PROFILE_REVIEWED_FIELDS,
  type ApprovalRequest,
  type ApprovalRequestType,
  type BusinessProfileUpdate,
} from "../../../lib/supabase";
import { cuisineLabels } from "../../../lib/foodTaxonomy";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
// Shared with the Rider Admin's Submitted Requests screen, so the two can't drift.
import { describePayload, formatDate, searchableText, typeBadgeColor, typeIcon, requestLabel, RequestDetails } from "./approvalView";

/** One field of a shop-profile change, rendered as before → after. */
type ProfileDiffRow = { key: string; label: string; from: string; to: string };

/** A missing value is "Not set", never a blank cell that reads as "unchanged". */
function showValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }
  if (key === "cuisine") {
    const labels = cuisineLabels(value);
    return labels.length ? labels.join(", ") : "Not set";
  }
  if (key === "latitude" || key === "longitude") {
    return Number(value).toFixed(5);
  }
  return String(value);
}

/**
 * What this change would actually do, field by field.
 *
 * The payload is a whole `restaurants` row, so a reviewer reading it raw sees
 * every column and has to work out which ones moved. Only the fields that
 * differ are listed: an approval screen whose diff is mostly noise is one
 * people click through without reading.
 */
function profileDiff(request: ApprovalRequest): ProfileDiffRow[] {
  const payload = request.payload || {};
  const before = (payload.before || {}) as BusinessProfileUpdate;
  const after = (payload.after || {}) as BusinessProfileUpdate;
  if (!payload.after) return [];

  return PROFILE_REVIEWED_FIELDS.flatMap(({ key, label }) => {
    const from = before[key as keyof BusinessProfileUpdate];
    const to = after[key as keyof BusinessProfileUpdate];
    const same =
      Array.isArray(from) && Array.isArray(to)
        ? from.length === to.length && from.every((v) => to.includes(v as never))
        : from === to;
    if (same) return [];
    return [{ key, label, from: showValue(key, from), to: showValue(key, to) }];
  });
}

/** The shop-profile change, shown as a per-field before → after diff. */
function ProfileDiff({ request }: { request: ApprovalRequest }) {
  const rows = profileDiff(request);
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        This request carries no readable change. Review the raw payload before approving.
      </p>
    );
  }

  return (
    <dl className="mt-3 space-y-2">
      {rows.map((row) => (
        <div
          key={row.key}
          className="rounded-xl border border-line bg-[var(--muted)] px-3 py-2"
        >
          <dt className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            {row.label}
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 break-words text-[var(--muted-foreground)] line-through">
              {row.from}
            </span>
            <ArrowRight
              className="size-4 flex-shrink-0 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words font-semibold text-[var(--ink)]">{row.to}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminApprovals() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'success';
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Reject modal (needs a free-text reason, so it isn't the shared ConfirmationModal)
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  /*
   * Filters.
   *
   * Type rather than status, because status is already what the two sections are:
   * everything above the line is pending and everything below has been reviewed.
   * A status filter here would be a second, worse way of saying that. Type is the
   * axis that isn't otherwise visible — this inbox mixes shop profile changes,
   * plate changes, terminal edits and driver moves, which are reviewed by
   * different eyes, and nothing on the card says "only look at shop changes"
   * except picking through them.
   *
   * "all" is a sentinel rather than a real value, so `useState<ApprovalRequestType
   * | "all">` cannot be accidentally narrowed to a type the backend may add
   * later without this file noticing at compile time.
   */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ApprovalRequestType | "all">("all");

  const openModal = (config: typeof modalConfig) => {
    setModalConfig(config);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalConfig(null);
  };

  const loadRequests = async () => {
    const { data, error } = await getApprovalRequests();
    if (error) {
      setLoadError(error);
      setRequests([]);
    } else {
      setLoadError(null);
      setRequests(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 10000);
    return () => clearInterval(interval);
  }, []);

  // The unfiltered split. The stat cards read from these, so narrowing the list
  // below never makes the dashboard claim there are fewer requests than there
  // are — a filtered "Pending 2" is a number nobody can act on.
  const pending = requests.filter(r => r.status === "pending");
  const history = requests.filter(r => r.status !== "pending");

  /**
   * The request types actually present, with a count each.
   *
   * Derived from the data rather than a fixed list, so the chips are only ever
   * the ones that have something behind them: a chip reading "Shop profile
   * change 0" is a dead control that costs a tap to discover it is dead. Order
   * follows APPROVAL_REQUEST_LABELS, so the chips read the same way round
   * whatever order the query happened to return rows in.
   */
  const typeCounts = useMemo(() => {
    const counts = new Map<ApprovalRequestType, number>();
    for (const r of requests) {
      counts.set(r.request_type, (counts.get(r.request_type) ?? 0) + 1);
    }
    // APPROVAL_REQUEST_LABELS is keyed by the type, so iterating it gives the
    // types in the order they are meant to be read rather than in whatever order
    // the query happened to return rows.
    return (Object.entries(APPROVAL_REQUEST_LABELS) as [ApprovalRequestType, string][])
      .filter(([value]) => counts.has(value))
      .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
  }, [requests]);

  /**
   * The filtered split, by type and free text.
   *
   * Split out as one predicate rather than two so Pending and Reviewed can never
   * disagree about what is being shown — the same request must not appear in one
   * section and vanish from the other because a filter was applied twice with
   * slightly different rules.
   */
  const { visiblePending, visibleHistory, filterActive } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const active = typeFilter !== "all" || needle !== "";
    const matches = (r: ApprovalRequest) => {
      if (typeFilter !== "all" && r.request_type !== typeFilter) return false;
      if (!needle) return true;
      return searchableText(r).includes(needle);
    };
    return {
      visiblePending: requests.filter(r => r.status === "pending" && matches(r)),
      visibleHistory: requests.filter(r => r.status !== "pending" && matches(r)),
      filterActive: active,
    };
  }, [requests, query, typeFilter]);

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
  };

  const handleApprove = (request: ApprovalRequest) => {
    openModal({
      title: `Approve ${APPROVAL_REQUEST_LABELS[request.request_type]}`,
      message: "This will apply the change immediately to the live data. Continue?",
      variant: "success",
      confirmLabel: "Approve & Apply",
      onConfirm: async () => {
        closeModal();
        setBusyId(request.id);
        const result = await approveApprovalRequest(request, user?.email);
        setBusyId(null);
        if (!result.success) {
          setToast({ message: `Approve failed: ${result.error}`, variant: 'error' });
          return;
        }
        logAudit({
          action: 'approve_request',
          actorRole: 'admin',
          entityType: 'approval',
          entityId: request.id,
          summary: `Approved ${APPROVAL_REQUEST_LABELS[request.request_type]}`,
          details: request.payload,
          actorEmail: user?.email,
          actorName: user?.name,
        });
        await loadRequests();
        setToast({ message: 'Request approved and applied', variant: 'success' });
      },
    });
  };

  const submitRejection = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    const result = await rejectApprovalRequest(rejectTarget.id, user?.email, rejectReason.trim());
    setBusyId(null);
    if (!result.success) {
      setToast({ message: `Reject failed: ${result.error}`, variant: 'error' });
      return;
    }
    logAudit({
      action: 'reject_request',
      actorRole: 'admin',
      entityType: 'approval',
      entityId: rejectTarget.id,
      summary: `Rejected ${APPROVAL_REQUEST_LABELS[rejectTarget.request_type]}`,
      details: { payload: rejectTarget.payload, reason: rejectReason.trim() || null },
      actorEmail: user?.email,
      actorName: user?.name,
    });
    setRejectTarget(null);
    setRejectReason("");
    await loadRequests();
    setToast({ message: 'Request rejected', variant: 'warning' });
  };

  return (
    <AdminShell
      title="Approvals"
      subtitle="Review shop profile changes, Rider Admin terminal & driver requests"
    >
        <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
          <AdminPageIntro eyebrow="Approvals" title="Review changes with confidence." description="Check proposed shop, terminal, and driver updates before they reach the live platform." note="Updates automatically every 10 seconds" />
          {/* Stats */}
          <AdminMetricCards loading={loading} items={[
            { label: 'Pending review', value: pending.length, detail: 'Waiting for a decision', Icon: Clock, tone: 'amber' },
            { label: 'Approved', value: history.filter(r => r.status === 'approved').length, detail: 'Changes applied', Icon: CheckCircle, tone: 'success' },
            { label: 'Rejected', value: history.filter(r => r.status === 'rejected').length, detail: 'Changes not applied', Icon: XCircle, tone: 'info' },
          ]} />

          {loadError && (
            <Card className="p-4 mb-6 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--amber-ink)]">{loadError}</p>
              </div>
            </Card>
          )}

          {/* Search + type filter. Hidden until there's something to filter, so an
              empty inbox isn't showing controls that do nothing. */}
          {requests.length > 0 && (
            <Card className="gap-0 rounded-3xl p-4 sm:p-5 border border-line bg-card">
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
                    placeholder="Search by admin, terminal, driver or shop…"
                    aria-label="Search approval requests"
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

                {filterActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="h-11 px-4 rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)] text-sm font-bold hover:bg-[var(--border)] transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Type chips, each carrying its own count so a chip that would
                  return nothing says so before it is pressed. */}
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by request type"
              >
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  aria-pressed={typeFilter === "all"}
                  className={`min-h-11 max-w-full whitespace-normal px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    typeFilter === "all"
                      ? "bg-[var(--teal-soft)] text-[var(--teal)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                  }`}
                >
                  All types ({requests.length})
                </button>
                {typeCounts.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTypeFilter(t.value)}
                    aria-pressed={typeFilter === t.value}
                    className={`min-h-11 max-w-full whitespace-normal px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      typeFilter === t.value
                        ? "bg-[var(--teal-soft)] text-[var(--teal)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>

              {filterActive && (
                <p className="text-xs text-[var(--muted-foreground)] mt-3" aria-live="polite">
                  Showing {visiblePending.length + visibleHistory.length} of {requests.length}
                </p>
              )}
            </Card>
          )}

          {/* Pending requests */}
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Pending Requests</h2>
          {loading ? (
            <Card className="border border-line bg-surface p-4">
              <TableSkeleton rows={5} cols={5} />
            </Card>
          ) : pending.length === 0 ? (
            <Card className="gap-2 rounded-3xl bg-card p-6 sm:p-10 border border-line text-center">
              <CheckCircle className="w-16 h-16 text-[var(--success)] mx-auto mb-4" />
              <p className="text-[var(--muted-foreground)] text-sm mb-2">No pending requests</p>
              <p className="text-[var(--muted-foreground)] text-xs">Rider Admin changes will appear here for review</p>
            </Card>
          ) : visiblePending.length === 0 ? (
            /* Requests exist and are pending, the filter just hides them. Saying
               "No pending requests" here would be a lie that reads as an all-clear
               — the stat card above still says how many are waiting. */
            <Card className="gap-2 rounded-3xl bg-card p-6 sm:p-10 border border-line text-center">
              <Search className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" aria-hidden="true" />
              <p className="text-[var(--muted-foreground)] text-sm mb-2">
                No pending requests match your filters
              </p>
              <button onClick={clearFilters} className="mt-1 text-sm font-bold text-[var(--primary)]">
                Clear filters
              </button>
            </Card>
          ) : (
            <div className="space-y-3 mb-8">
              {visiblePending.map(request => (
                <Card key={request.id} className="min-w-0 gap-0 rounded-3xl p-4 sm:p-5 border border-line bg-card">
                  {/* Narrow screens: the action buttons are flex-shrink-0, so a single row
                      leaves the request text only a few dozen px. Stack below sm. */}
                  <div className="flex flex-col gap-4 @min-[60rem]:flex-row @min-[60rem]:items-start @min-[60rem]:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 bg-[var(--muted)] rounded-xl flex items-center justify-center flex-shrink-0">
                        {typeIcon(request.request_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[var(--ink)]">
                            {APPROVAL_REQUEST_LABELS[request.request_type]}
                          </h3>
                          <Badge className={`max-w-full whitespace-normal break-words ${typeBadgeColor(request.request_type)}`}>
                            {request.request_type.toUpperCase().replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 break-words">
                          Requested by {request.requested_by_name || request.requested_by_email || 'Rider Admin'}
                          {" · "}{formatDate(request.requested_at)}
                        </p>
                        <div className="mt-2">
                          <RequestDetails request={request}>
                            {request.request_type === "business_profile_update" && (
                              <ProfileDiff request={request} />
                            )}
                          </RequestDetails>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full @min-[60rem]:w-auto @min-[60rem]:flex @min-[60rem]:items-center @min-[60rem]:shrink-0">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id}
                        aria-label={`Approve ${APPROVAL_REQUEST_LABELS[request.request_type]}`}
                        className="min-h-11 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--success-ink)] hover:opacity-90 disabled:opacity-50 text-[var(--background)] font-bold text-xs rounded-xl transition-all"
                      >
                        <CheckCircle className="w-4 h-4" aria-hidden="true" /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(request); setRejectReason(""); }}
                        disabled={busyId === request.id}
                        aria-label={`Reject ${APPROVAL_REQUEST_LABELS[request.request_type]}`}
                        className="min-h-11 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 border border-line hover:bg-[var(--error-soft)] disabled:opacity-50 text-[var(--error)] font-bold text-xs rounded-xl transition-all"
                      >
                        <XCircle className="w-4 h-4" aria-hidden="true" /> Reject
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* History */}
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Reviewed</h2>

          {history.length === 0 ? (
            <Card className="p-8 border-2 border-dashed border-[var(--border)] text-center">
              <Clock className="w-10 h-10 text-[var(--border)] mx-auto mb-3" />
              <p className="text-[var(--muted-foreground)] text-sm">No reviewed requests yet</p>
            </Card>
          ) : visibleHistory.length === 0 ? (
            <Card className="gap-2 rounded-3xl bg-card p-6 sm:p-10 border border-line text-center">
              <Search className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" aria-hidden="true" />
              <p className="text-[var(--muted-foreground)] text-sm mb-2">
                No reviewed requests match your filters
              </p>
              <button onClick={clearFilters} className="mt-1 text-sm font-bold text-[var(--primary)]">
                Clear filters
              </button>
            </Card>
          ) : (
            <Card className="gap-0 rounded-3xl border border-line bg-card overflow-hidden">
              {/* Mobile: the 5-column table needs ~760px, so below sm each reviewed
                  request becomes a stacked card instead of a scrolling grid. */}
              <div className="divide-y divide-line @min-[60rem]:hidden">
                {visibleHistory.map(request => (
                  <div key={request.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="flex-shrink-0">{typeIcon(request.request_type)}</span>
                      <p className="font-semibold text-sm text-[var(--ink)] min-w-0">
                        {APPROVAL_REQUEST_LABELS[request.request_type]}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={request.status === "approved" ? "bg-[var(--success)]" : "bg-[var(--error)]"}>
                        {request.status.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-[var(--muted-foreground)] break-all">
                        {request.requested_by_name || request.requested_by_email || "Rider Admin"}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {describePayload(request).map((line, i) => (
                        <p key={i} className="text-sm text-[var(--muted-foreground)] break-words">{line}</p>
                      ))}
                    </div>
                    {request.status === "rejected" && request.rejection_reason && (
                      <p className="text-xs text-[var(--error)] break-words">Reason: {request.rejection_reason}</p>
                    )}
                    <p className="text-xs text-[var(--muted-foreground)] break-words">
                      Reviewed {formatDate(request.reviewed_at)}
                      {request.reviewed_by_email ? ` · ${request.reviewed_by_email}` : ""}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden @min-[60rem]:block overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Reviewed approval requests with their outcome, requester and reviewer</caption>
                  <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Request</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Details</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Requested By</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleHistory.map(request => (
                      <tr key={request.id} className="hover:bg-[var(--muted)] transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {typeIcon(request.request_type)}
                            <span className="font-semibold text-sm text-[var(--ink)]">
                              {APPROVAL_REQUEST_LABELS[request.request_type]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <RequestDetails request={request}>
                            {request.request_type === "business_profile_update" && (
                              <ProfileDiff request={request} />
                            )}
                          </RequestDetails>
                          {request.status === "rejected" && request.rejection_reason && (
                            <p className="text-xs text-[var(--error)] mt-1">Reason: {request.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[var(--muted-foreground)]">
                            {request.requested_by_name || request.requested_by_email || "Rider Admin"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={request.status === "approved" ? "bg-[var(--success)]" : "bg-[var(--error)]"}>
                            {request.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[var(--muted-foreground)]">{formatDate(request.reviewed_at)}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{request.reviewed_by_email || ""}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <Card role="dialog" aria-modal="true" aria-label="Reject request" className="w-full max-w-md max-h-[85dvh] overflow-y-auto gap-0 rounded-3xl p-5 sm:p-6 border border-line bg-card">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-[var(--error)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">Reject Request?</h2>
              <p className="text-[var(--muted-foreground)] text-sm">
                {APPROVAL_REQUEST_LABELS[rejectTarget.request_type]} — nothing will be applied.
              </p>
            </div>
            <label htmlFor="rejection-reason" className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
              Reason (optional)
            </label>
            <textarea
              id="rejection-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this being rejected?"
              className="w-full px-4 py-3 border border-line focus:border-[var(--primary)] rounded-xl text-sm outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                className="flex-1 px-4 py-3 bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--ink)] font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={busyId === rejectTarget.id}
                className="flex-1 px-4 py-3 bg-[var(--error)] hover:bg-[var(--error)] disabled:opacity-50 text-white font-bold rounded-xl transition-all"
              >
                Reject
              </button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmationModal
        isOpen={modalOpen}
        onConfirm={modalConfig?.onConfirm || (() => {})}
        onCancel={closeModal}
        title={modalConfig?.title || ''}
        message={modalConfig?.message || ''}
        variant={modalConfig?.variant || 'danger'}
        confirmLabel={modalConfig?.confirmLabel || 'Confirm'}
        zIndexClassName="z-[2100]"
      />

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </AdminShell>
  );
}
