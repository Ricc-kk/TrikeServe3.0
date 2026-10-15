import { useState, type ReactNode } from "react";
import {
  ClipboardCheck, IdCard, MapPin, Store, Trash2, UserMinus, UserPlus, UtensilsCrossed,
  ChevronDown, ChevronUp,
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
 * A request's details, collapsed to a summary and expanded on tap.
 *
 * `describePayload` can return five lines, which is a wall inside a table cell
 * and pushes every other column off the row. The first line is the one that
 * identifies the request, so it stays visible and the rest sit behind a toggle —
 * with the whole control a single button, so a tap anywhere on it works rather
 * than only on the small word "more".
 *
 * Rendered as a button with aria-expanded rather than a <details> element so the
 * open/closed state is readable by assistive tech as well as visually.
 */
export function ExpandableDetails({
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
  const all = lines ?? describePayload(request);
  const [summary, ...rest] = all;
  const hasMore = rest.length > 0 || !!children;

  if (!summary && !hasMore) {
    return <p className="text-sm text-[var(--muted-foreground)] italic">No details</p>;
  }

  return (
    <div className="min-w-0">
      {summary && (
        <p className="text-sm text-[var(--ink)] truncate">{summary}</p>
      )}

      {hasMore && (
        <>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? "Hide full details" : "Show full details"}
            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline"
          >
            {open ? "Hide details" : "Show details"}
            {open ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          {open && (
            <div className="mt-2 space-y-1 rounded-xl bg-[var(--muted)] p-3">
              {rest.map((line, i) => (
                <p key={i} className="text-xs text-[var(--muted-foreground)] break-words">{line}</p>
              ))}
              {children}
            </div>
          )}
        </>
      )}
    </div>
  );
}
