import { useState, useEffect } from "react";
import {
  ClipboardCheck, Menu, CheckCircle, XCircle, Clock, MapPin,
  AlertTriangle, RefreshCw, UserPlus, UserMinus, Store, Trash2
} from "lucide-react";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";
import {
  getApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  APPROVAL_REQUEST_LABELS,
  type ApprovalRequest,
  type ApprovalRequestType,
} from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";

function typeIcon(type: ApprovalRequestType) {
  switch (type) {
    case "terminal_create":
      return <MapPin className="w-5 h-5 text-[#3B82F6]" />;
    case "terminal_update":
      return <Store className="w-5 h-5 text-[#3B82F6]" />;
    case "terminal_delete":
      return <Trash2 className="w-5 h-5 text-[#EF4444]" />;
    case "driver_assign":
      return <UserPlus className="w-5 h-5 text-[#10B981]" />;
    case "driver_unassign":
      return <UserMinus className="w-5 h-5 text-[#F59E0B]" />;
    default:
      return <ClipboardCheck className="w-5 h-5 text-[#64748B]" />;
  }
}

function typeBadgeColor(type: ApprovalRequestType) {
  if (type.startsWith("terminal")) return "bg-[#3B82F6]";
  if (type === "driver_assign") return "bg-[#10B981]";
  return "bg-[#F59E0B]";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    setRejectTarget(null);
    setRejectReason("");
    await loadRequests();
    setToast({ message: 'Request rejected', variant: 'warning' });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      <AdminSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <div className="flex-1 lg:ml-64">
        {/* Top Header */}
        <div className="bg-white border-b-2 border-[#E2E8F0] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[#121212]" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">Approvals</h1>
                <p className="text-xs lg:text-sm text-[#64748B]">
                  Review Rider Admin terminal &amp; driver requests
                </p>
              </div>
            </div>
            <button
              onClick={loadRequests}
              className="flex items-center gap-2 px-3 py-2 bg-[#F8F9FA] border-2 border-[#E2E8F0] rounded-xl text-sm font-semibold text-[#64748B] hover:border-[#E11D48] transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="p-5 lg:p-8">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6">
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs lg:text-sm text-[#64748B] mb-1">Pending</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[#F59E0B]">{pending.length}</h2>
            </Card>
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs lg:text-sm text-[#64748B] mb-1">Approved</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[#10B981]">
                {history.filter(r => r.status === "approved").length}
              </h2>
            </Card>
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs lg:text-sm text-[#64748B] mb-1">Rejected</p>
              <h2 className="text-2xl lg:text-4xl font-bold text-[#EF4444]">
                {history.filter(r => r.status === "rejected").length}
              </h2>
            </Card>
          </div>

          {loadError && (
            <Card className="p-4 mb-6 border-2 border-amber-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{loadError}</p>
              </div>
            </Card>
          )}

          {/* Pending requests */}
          <h2 className="text-xl lg:text-2xl font-bold text-[#121212] mb-4">Pending Requests</h2>
          {loading ? (
            <Card className="p-12 border-2 border-dashed border-[#E2E8F0] text-center">
              <p className="text-[#64748B] text-sm">Loading requests…</p>
            </Card>
          ) : pending.length === 0 ? (
            <Card className="p-12 border-2 border-dashed border-[#E2E8F0] text-center">
              <CheckCircle className="w-16 h-16 text-[#10B981] mx-auto mb-4" />
              <p className="text-[#64748B] text-sm mb-2">No pending requests</p>
              <p className="text-[#94A3B8] text-xs">Rider Admin changes will appear here for review</p>
            </Card>
          ) : (
            <div className="space-y-3 mb-8">
              {pending.map(request => (
                <Card key={request.id} className="p-4 lg:p-5 border-2 border-[#E2E8F0] bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                        {typeIcon(request.request_type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#121212]">
                            {APPROVAL_REQUEST_LABELS[request.request_type]}
                          </h3>
                          <Badge className={typeBadgeColor(request.request_type)}>
                            {request.request_type.toUpperCase().replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Requested by {request.requested_by_name || request.requested_by_email || 'Rider Admin'}
                          {" · "}{formatDate(request.requested_at)}
                        </p>
                        <div className="mt-2 space-y-0.5">
                          {describePayload(request).map((line, i) => (
                            <p key={i} className="text-sm text-[#64748B]">{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApprove(request)}
                        disabled={busyId === request.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-bold text-xs uppercase rounded-xl transition-all"
                      >
                        <CheckCircle className="w-4 h-4" /> Approve
                      </button>
                      <button
                        onClick={() => { setRejectTarget(request); setRejectReason(""); }}
                        disabled={busyId === request.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-bold text-xs uppercase rounded-xl transition-all"
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
          <h2 className="text-xl lg:text-2xl font-bold text-[#121212] mb-4">Reviewed</h2>
          {history.length === 0 ? (
            <Card className="p-8 border-2 border-dashed border-[#E2E8F0] text-center">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[#64748B] text-sm">No reviewed requests yet</p>
            </Card>
          ) : (
            <Card className="border-2 border-[#E2E8F0] bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F8F9FA] border-b-2 border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Request</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Details</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Requested By</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {history.map(request => (
                      <tr key={request.id} className="hover:bg-[#F8F9FA] transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {typeIcon(request.request_type)}
                            <span className="font-semibold text-sm text-[#121212]">
                              {APPROVAL_REQUEST_LABELS[request.request_type]}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[#64748B]">{describePayload(request).join(" · ")}</p>
                          {request.status === "rejected" && request.rejection_reason && (
                            <p className="text-xs text-[#EF4444] mt-1">Reason: {request.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[#64748B]">
                            {request.requested_by_name || request.requested_by_email || "Rider Admin"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={request.status === "approved" ? "bg-[#10B981]" : "bg-[#EF4444]"}>
                            {request.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[#64748B]">{formatDate(request.reviewed_at)}</p>
                          <p className="text-xs text-[#94A3B8]">{request.reviewed_by_email || ""}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 border-2 border-[#E2E8F0] bg-white">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-[#FEE2E2] rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-[#EF4444]" />
              </div>
              <h2 className="text-2xl font-bold text-[#121212] mb-2">Reject Request?</h2>
              <p className="text-[#64748B] text-sm">
                {APPROVAL_REQUEST_LABELS[rejectTarget.request_type]} — nothing will be applied.
              </p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B] block mb-1">
              Reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this being rejected?"
              className="w-full px-4 py-3 border-2 border-[#CBD5E1] focus:border-[#E11D48] rounded-xl text-sm outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                className="flex-1 px-4 py-3 bg-[#F8F9FA] hover:bg-[#E2E8F0] text-[#121212] font-bold rounded-xl uppercase transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={busyId === rejectTarget.id}
                className="flex-1 px-4 py-3 bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-bold rounded-xl uppercase transition-all"
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
    </div>
  );
}
