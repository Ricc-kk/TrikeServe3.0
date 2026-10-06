import { useState, useEffect } from "react";
import {
  ClipboardCheck, Menu, CheckCircle, XCircle, Clock, MapPin,
  AlertTriangle, UserPlus, UserMinus, Store, Trash2, UtensilsCrossed, ArrowRight
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminShell from "./AdminShell";
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

function typeIcon(type: ApprovalRequestType) {
  switch (type) {
    case "terminal_create":
      return <MapPin className="w-5 h-5 text-[var(--info)]" />;
    case "terminal_update":
      return <Store className="w-5 h-5 text-[var(--info)]" />;
    case "terminal_delete":
      return <Trash2 className="w-5 h-5 text-[var(--error)]" />;
    case "driver_assign":
      return <UserPlus className="w-5 h-5 text-[var(--success)]" />;
    case "driver_unassign":
      return <UserMinus className="w-5 h-5 text-[var(--amber)]" />;
    case "business_profile_update":
      return <UtensilsCrossed className="w-5 h-5 text-[var(--amber)]" />;
    default:
      return <ClipboardCheck className="w-5 h-5 text-[var(--muted-foreground)]" />;
  }
}

function typeBadgeColor(type: ApprovalRequestType) {
  if (type.startsWith("terminal")) return "bg-[var(--info)]";
  if (type === "driver_assign") return "bg-[var(--success)]";
  return "bg-[var(--amber)]";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-PH", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return value;
  }
}

/** Human-readable summary of what the request will do. */
function describePayload(request: ApprovalRequest): string[] {
  const p = request.payload || {};
  switch (request.request_type) {
    case "terminal_create":
    case "terminal_update":
      return [
        `Name: ${p.name || "—"}`,
        `Boundary: ${p.boundary || "—"}`,
        `Location: ${Number(p.center_lat ?? 0).toFixed(4)}, ${Number(p.center_lng ?? 0).toFixed(4)}`,
        `Status: ${p.is_active ? "Active" : "Inactive"}`,
        `Area: ${
          Array.isArray(p.boundary_polygon) && p.boundary_polygon.length >= 3
            ? `${p.boundary_polygon.length} plotted points`
            : "not plotted"
        }`,
      ];
    case "terminal_delete":
      return [`Terminal: ${p.name || p.id || "—"}`, `Boundary: ${p.boundary || "—"}`];
    case "driver_assign":
      return [`Driver: ${p.driver_name || p.driver_id || "—"}`, `Terminal: ${p.terminal_name || p.terminal_id || "—"}`];
    case "driver_unassign":
      return [`Driver: ${p.driver_name || p.driver_id || "—"}`, `Terminal: ${p.terminal_name || p.terminal_id || "—"}`];
    case "business_profile_update": {
      // The per-field diff carries the detail; this is just the one-line
      // summary that fits above it in both the card and the history table.
      const after = p.after || {};
      const before = p.before || {};
      const name = after.name || before.name || "this shop";
      const moved =
        before.latitude != null &&
        after.latitude != null &&
        (before.latitude !== after.latitude || before.longitude !== after.longitude);
      return [
        `Shop: ${name}`,
        moved ? "Pickup point is being moved" : "Shop details only",
      ];
    }
    default:
      return [];
  }
}

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

  const pending = requests.filter(r => r.status === "pending");
  const history = requests.filter(r => r.status !== "pending");

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
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6">
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Pending</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[var(--amber)]">{pending.length}</h2>
            </Card>
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Approved</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[var(--success)]">
                {history.filter(r => r.status === "approved").length}
              </h2>
            </Card>
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Rejected</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[var(--error)]">
                {history.filter(r => r.status === "rejected").length}
              </h2>
            </Card>
          </div>

          {loadError && (
            <Card className="p-4 mb-6 border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--amber-dark)] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--amber-dark)]">{loadError}</p>
              </div>
            </Card>
          )}

          {/* Pending requests */}
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Pending Requests</h2>
          {loading ? (
            <Card className="border border-line bg-surface p-4">
              <TableSkeleton rows={5} cols={5} />
            </Card>
          ) : pending.length === 0 ? (
            <Card className="p-12 border-2 border-dashed border-[var(--border)] text-center">
              <CheckCircle className="w-16 h-16 text-[var(--success)] mx-auto mb-4" />
              <p className="text-[var(--muted-foreground)] text-sm mb-2">No pending requests</p>
              <p className="text-[var(--muted-foreground)] text-xs">Rider Admin changes will appear here for review</p>
            </Card>
          ) : (
            <div className="space-y-3 mb-8">
              {pending.map(request => (
                <Card key={request.id} className="p-4 lg:p-5 border border-line bg-surface">
                  {/* Narrow screens: the action buttons are flex-shrink-0, so a single row
                      leaves the request text only a few dozen px. Stack below sm. */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 bg-[var(--muted)] rounded-xl flex items-center justify-center flex-shrink-0">
                        {typeIcon(request.request_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[var(--ink)]">
                            {APPROVAL_REQUEST_LABELS[request.request_type]}
                          </h3>
                          <Badge className={typeBadgeColor(request.request_type)}>
                            {request.request_type.toUpperCase().replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                          Requested by {request.requested_by_name || request.requested_by_email || 'Rider Admin'}
                          {" · "}{formatDate(request.requested_at)}
                        </p>
                        <div className="mt-2 space-y-0.5">
                          {describePayload(request).map((line, i) => (
                            <p key={i} className="text-sm text-[var(--muted-foreground)] break-words">{line}</p>
                          ))}
                        </div>
                        {request.request_type === "business_profile_update" && (
                          <ProfileDiff request={request} />
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:flex-shrink-0">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id}
                        aria-label={`Approve ${APPROVAL_REQUEST_LABELS[request.request_type]}`}
                        className="min-h-11 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--success)] hover:bg-[var(--success)] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
                      >
                        <CheckCircle className="w-4 h-4" aria-hidden="true" /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(request); setRejectReason(""); }}
                        disabled={busyId === request.id}
                        aria-label={`Reject ${APPROVAL_REQUEST_LABELS[request.request_type]}`}
                        className="min-h-11 w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--error)] hover:bg-[var(--error)] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
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
          ) : (
            <Card className="border border-line bg-surface overflow-hidden">
              {/* Mobile: the 5-column table needs ~760px, so below sm each reviewed
                  request becomes a stacked card instead of a scrolling grid. */}
              <div className="sm:hidden divide-y divide-[var(--border)]">
                {history.map(request => (
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

              <div className="hidden sm:block overflow-x-auto">
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
                    {history.map(request => (
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
                          <p className="text-sm text-[var(--muted-foreground)]">{describePayload(request).join(" · ")}</p>
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
          <Card className="w-full max-w-md p-6 border border-line bg-surface">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-[var(--error)]" />
              </div>
              <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">Reject Request?</h2>
              <p className="text-[var(--muted-foreground)] text-sm">
                {APPROVAL_REQUEST_LABELS[rejectTarget.request_type]} — nothing will be applied.
              </p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)] block mb-1">
              Reason (optional)
            </label>
            <textarea
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
