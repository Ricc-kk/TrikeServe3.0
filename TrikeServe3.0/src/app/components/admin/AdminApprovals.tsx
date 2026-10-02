import { useState, useEffect } from "react";
import {
  ClipboardCheck, Menu, CheckCircle, XCircle, Clock, MapPin,
  AlertTriangle, UserPlus, UserMinus, Store, Trash2
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
  type ApprovalRequest,
  type ApprovalRequestType,
} from "../../../lib/supabase";
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
    default:
      return [];
  }
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
      subtitle="Review Rider Admin terminal & driver requests"
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 bg-[var(--muted)] rounded-xl flex items-center justify-center flex-shrink-0">
                        {typeIcon(request.request_type)}
                      </div>
                      <div>
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
                            <p key={i} className="text-sm text-[var(--muted-foreground)]">{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--success)] hover:bg-[var(--success)] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(request); setRejectReason(""); }}
                        disabled={busyId === request.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--error)] hover:bg-[var(--error)] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all"
                      >
                        <XCircle className="w-4 h-4" /> Reject
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
              <div className="overflow-x-auto">
                <table className="w-full">
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
