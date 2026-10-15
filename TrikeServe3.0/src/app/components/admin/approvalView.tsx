import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ClipboardCheck, IdCard, MapPin, Store, Trash2, UserMinus, UserPlus, UtensilsCrossed,
  Eye, X,
} from "lucide-react";
import {
  APPROVAL_REQUEST_LABELS,
  type ApprovalRequest,
  type ApprovalRequestType,
} from "../../../lib/supabase";

/**
 * How an approval request is presented.
 *
 * Shared by the Super Admin's Approvals screen and the Rider Admin's Submitted
 * Requests log. These were local to AdminApprovals, which meant a second screen
 * showing the same requests had to copy them — and a copy of a label or an icon
 * map is exactly the kind of thing that quietly drifts out of step.
 */

export function typeIcon(type: ApprovalRequestType) {
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
    case "rider_plate_update":
      return <IdCard className="w-5 h-5 text-[var(--amber)]" />;
    default:
      return <ClipboardCheck className="w-5 h-5 text-[var(--muted-foreground)]" />;
  }
}

export function typeBadgeColor(type: ApprovalRequestType) {
  if (type.startsWith("terminal")) return "bg-[var(--info)]";
  if (type === "driver_assign") return "bg-[var(--success)]";
  return "bg-[var(--amber)]";
}

export function formatDate(value?: string | null) {
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
export function describePayload(request: ApprovalRequest): string[] {
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
    case "rider_plate_update":
      return [
        `Driver: ${p.driver_name || "—"}`,
        `Plate: ${p.previous_plate || "Not set"} → ${p.new_plate || "—"}`,
      ];
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

/** The request type in words, e.g. "Edit terminal". */
export function requestLabel(request: ApprovalRequest) {
  return APPROVAL_REQUEST_LABELS[request.request_type] ?? request.request_type;
}

/**
 * Everything a search box should match against, as one lowercase string.
 *
 * Shared rather than written twice: the Super Admin filters an inbox mixed with
 * every request type and needs to search by who sent it, and the Rider Admin
 * searches their own submissions by terminal, driver or plate. The two lists
 * overlap but neither is a superset, and a second copy of this is exactly the
 * thing that quietly drifts — one screen ends up matching on the requester's
 * name and the other silently doesn't.
 */
export function searchableText(request: ApprovalRequest): string {
  const payload = request.payload || {};
  return [
    requestLabel(request),
    request.request_type,
    // Who sent it, and why a rejection was rejected. A no-op for a Rider Admin,
    // who only ever searches their own submissions — but it is how a Super Admin
    // finds one admin's batch, or the request someone is looking for by the
    // complaint that came with it.
    request.requested_by_name,
    request.requested_by_email,
    request.rejection_reason,
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
 * A request's details: the identifying line inline, everything else in a modal.
 *
 * `describePayload` can return five lines. Inline, that is a wall of text that
 * grows the row to five lines' height and, in the Reviewed table, pushes the
 * Status and Reviewed columns off screen entirely — so the columns that decide
 * at a glance whether anything still needs attention become the ones you have to
 * scroll to find.
 *
 * Expanding in place was the wrong shape of fix: it made the row's height depend
 * on whether someone happened to have opened it, so the table's rows no longer
 * lined up with each other. A modal keeps every row exactly one line tall and
 * gives the details room to be read properly, which matters most for the
 * business profile diff — that one is a table of before/after values and has
 * never fitted inside a cell.
 *
 * Escape and a click on the backdrop both close it, and the close button takes
 * focus on open so a keyboard user is not left tabbing through the page behind.
 */
export function RequestDetails({
  request,
  lines,
  children,
}: {
  request: ApprovalRequest;
  /** Defaults to describePayload(request). */
  lines?: string[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const all = lines ?? describePayload(request);
  const summary = all[0];

  // Only listens while open, so a page full of these buttons does not accumulate
  // one Escape handler each.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  if (all.length === 0 && !children) {
    return <p className="text-sm text-[var(--muted-foreground)] italic">No details</p>;
  }

  const label = requestLabel(request);

  return (
    <div className="min-w-0">
      {summary && (
        <p className="text-sm text-[var(--ink)] truncate">{summary}</p>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`View full details of ${label}`}
        className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline"
      >
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        View details
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} details`}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-surface rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b-2 border-[var(--border)]">
              <span className="flex-shrink-0">{typeIcon(request.request_type)}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-[var(--ink)] truncate">{label}</h3>
                <p className="text-xs text-[var(--muted-foreground)] truncate">
                  Requested by {request.requested_by_name || request.requested_by_email || "Rider Admin"}
                  {" · "}{formatDate(request.requested_at)}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close details"
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--muted)] active:scale-90"
              >
                <X className="w-5 h-5 text-[var(--ink)]" aria-hidden="true" />
              </button>
            </div>

            {/* Scrolls rather than growing: the profile diff is the tall case, and a
                dialog taller than the viewport puts its own close button off screen. */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {all.map((line, i) => (
                <p key={i} className="text-sm text-[var(--ink)] break-words">{line}</p>
              ))}
              {children}
            </div>

            <div className="border-t-2 border-[var(--border)] p-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-3 text-sm font-bold text-[var(--ink)] bg-[var(--muted)] hover:bg-[var(--border)] rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
