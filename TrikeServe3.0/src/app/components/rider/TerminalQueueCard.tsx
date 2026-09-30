import { useState } from "react";
import {
  Car,
  ChevronRight,
  ListOrdered,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  Ticket,
  Truck,
  Unlock,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useTerminalQueue } from "../../hooks/useTerminalQueue";
import type { LatLngPoint } from "@/lib/supabase";

const MAX_VISIBLE_DRIVERS = 5;

/** Short "350 m" / "1.2 km" label. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Informational hint showing the terminal's given service radius and how far the
 * driver currently is from its centre. Display only — it never blocks joining.
 */
function RadiusNote({
  terminalName,
  boundary,
  radiusKm,
  distanceMeters,
  isWithinBoundary,
  isLocating,
  compact = false,
}: {
  terminalName: string;
  boundary: LatLngPoint[] | null;
  radiusKm: number | null;
  distanceMeters: number | null;
  isWithinBoundary: boolean | null;
  isLocating: boolean;
  compact?: boolean;
}) {
  // The admin's plotted boundary area is the terminal's coverage / radius; the
  // centre + radius circle only stands in for terminals with no area drawn yet.
  const hasBoundary = (boundary?.length ?? 0) >= 3;
  if (!hasBoundary && radiusKm == null) return null;

  const unknown = isWithinBoundary == null;
  const inside = isWithinBoundary === true;
  const tone = unknown
    ? "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]"
    : inside
      ? "bg-[var(--success-soft)] border-[var(--success)]/40 text-[var(--success)]"
      : "bg-[var(--amber-soft)] border-[var(--amber)]/40 text-[var(--amber-dark)]";

  const coverageLabel = hasBoundary ? "Boundary area" : `${radiusKm} km radius`;
  const status = unknown
    ? isLocating
      ? "checking your position…"
      : "location unavailable."
    : hasBoundary
      ? inside
        ? `you're inside ${terminalName}'s coverage area.`
        : `you're outside ${terminalName}'s coverage area.`
      : inside
        ? `you're ${formatDistance(distanceMeters || 0)} away — inside the radius.`
        : `you're ${formatDistance(distanceMeters || 0)} away — outside the radius.`;

  return (
    <div className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 ${tone}`}>
      <Navigation className="w-3.5 h-3.5 flex-shrink-0 mt-[1px]" />
      <p className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold leading-snug`}>
        <span className="font-extrabold">{coverageLabel}</span> · {status}
      </p>
    </div>
  );
}

/** Compact "waiting 4m" label for a queue entry. */
function formatWaiting(joinedAt?: string): string {
  if (!joinedAt) return "just now";
  const ms = Date.now() - new Date(joinedAt).getTime();
  if (Number.isNaN(ms) || ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

/** Shows which service types the driver's queue position unlocks. */
function AccessChips({ isFirst }: { isFirst: boolean }) {
  const chip = (label: string, Icon: typeof Car, active: boolean) => (
    <div
      key={label}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 border transition-colors ${
        active ? "bg-surface border-[var(--success)]/50" : "bg-white/60 border-[var(--border)]"
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`} />
      <span className={`text-[11px] font-bold ${active ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`}>
        {label}
      </span>
      {active ? (
        <Unlock className="w-3 h-3 text-[var(--success)]" />
      ) : (
        <Lock className="w-3 h-3 text-[var(--border)]" />
      )}
    </div>
  );

  return <div className="flex flex-wrap gap-1.5">{chip("Private", Car, isFirst)}{chip("Share", Users, isFirst)}</div>;
}

function DriverRow({
  entry,
  index,
  isMe,
}: {
  entry: { id: string; driver_name?: string | null; driver_plate?: string | null; joined_at: string };
  index: number;
  isMe: boolean;
}) {
  const isNext = index === 0;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? "bg-[var(--primary-soft)]" : ""}`}>
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${
          isNext
            ? "bg-[var(--success)] text-white"
            : isMe
              ? "bg-[var(--primary)] text-white"
              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
        }`}
      >
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${isMe || isNext ? "font-extrabold" : "font-semibold"} text-[var(--ink)]`}>
          {isMe ? "You" : entry.driver_name || "Driver"}
        </p>
        <p className="text-[10px] text-[var(--muted-foreground)] truncate">
          {entry.driver_plate || "No plate"} • waiting {formatWaiting(entry.joined_at)}
        </p>
      </div>
      {isNext && (
        <Badge className="bg-[var(--success)] text-white text-[9px] font-extrabold tracking-wide border-0 flex-shrink-0">
          NEXT
        </Badge>
      )}
    </div>
  );
}

interface TerminalQueueCardProps {
  /** The result of useTerminalQueue() — owns join/leave so callers stay in sync. */
  queue: ReturnType<typeof useTerminalQueue>;
  variant?: "full" | "compact";
  /** Gate the Join button (e.g. the driver must be online to queue). */
  canJoin?: boolean;
}

/**
 * Terminal queue status card.
 *
 * `full` is the hero used on the rider home sheet, `compact` is the strip used
 * on top of the Passenger Requests list. Both share the same states so the rule
 * ("first in queue may accept private/share rides") reads identically.
 */
export default function TerminalQueueCard({ queue, variant = "full", canJoin = true }: TerminalQueueCardProps) {
  const {
    terminalId,
    terminalName,
    terminalBoundary,
    terminalRadiusKm,
    distanceMeters,
    isWithinBoundary,
    isLocating,
    queue: entries,
    myEntry,
    position,
    aheadCount,
    isFirst,
    hasNoTerminal,
    isLoading,
    isResolvingTerminal,
    isMutating,
    error,
    join,
    leave,
  } = queue;

  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (action: () => Promise<{ error: unknown }>) => {
    setActionError(null);
    const { error: actionFailure } = await action();
    if (actionFailure) setActionError((actionFailure as any)?.message || "Something went wrong. Please try again.");
  };

  const terminalLabel = terminalName || terminalId || "No terminal";
  const isCompact = variant === "compact";
  // While the terminal lookup is in flight the driver's terminal is unknown, so
  // don't invite them to join yet (the cached value may be a stale terminal).
  const isLoadingState = (isLoading || isResolvingTerminal) && !myEntry;
  const visibleDrivers = entries.slice(0, MAX_VISIBLE_DRIVERS);
  const hiddenDrivers = entries.length - visibleDrivers.length;

  const tone = isFirst
    ? "bg-[var(--success-soft)] border-[var(--success)]"
    : "bg-[var(--amber-soft)] border-[var(--amber)]";

  const statusTitle = isFirst
    ? "You're first in line"
    : `${aheadCount} driver${aheadCount !== 1 ? "s" : ""} ahead of you`;
  const statusSubtitle = isFirst
    ? "Private and share rides are unlocked."
    : "Private and share rides unlock at #1.";
  const rankCircle = isFirst ? "bg-[var(--success)]" : "bg-[var(--amber)]";

  const joinButton = (
    <Button
      onClick={() => runAction(join)}
      disabled={isMutating || !canJoin}
      className={`font-bold uppercase tracking-widest ${
        isCompact ? "text-[11px] px-3 h-9" : "w-full"
      } ${
        canJoin
          ? "bg-[var(--primary)] hover:bg-[var(--primary)] text-white"
          : "bg-[var(--border)] text-[var(--muted-foreground)] cursor-not-allowed"
      }`}
    >
      <Ticket className="w-4 h-4 mr-1.5" />
      {isMutating ? "Joining…" : canJoin ? "Join Queue" : isCompact ? "Offline" : "Go Online to Join"}
    </Button>
  );

  const leaveButton = (
    <Button
      onClick={() => runAction(leave)}
      disabled={isMutating}
      variant="outline"
      className={`border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-bold uppercase tracking-widest ${
        isCompact ? "text-[11px] px-3 h-9" : "w-full"
      }`}
    >
      <LogOut className="w-4 h-4 mr-1.5" />
      {isMutating ? "Leaving…" : "Leave"}
    </Button>
  );

  // ---- No terminal: blocked from accepting rides ----
  if (hasNoTerminal) {
    return (
      <div className={`px-5 ${isCompact ? "py-3" : "pt-5 pb-4"}`}>
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--primary)] bg-[var(--primary-soft)] p-3.5">
          <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--ink)]">No terminal assigned yet</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              You can't accept rides yet. Ask an admin to assign your terminal, then go online and join the queue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Compact strip (Passenger Requests) ----
  if (isCompact) {
    return (
      <div className={`rounded-2xl border-2 p-3 ${tone}`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-full flex flex-col items-center justify-center flex-shrink-0 text-white ${rankCircle} ${
              isFirst ? "shadow-lg shadow-[var(--success-soft)]" : ""
            }`}
          >
            {myEntry ? (
              <>
                <span className="text-[8px] font-extrabold tracking-wider leading-none opacity-90">POS</span>
                <span className="text-base font-extrabold leading-tight">#{position}</span>
              </>
            ) : (
              <ListOrdered className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isFirst && <Zap className="w-3.5 h-3.5 text-[var(--success)] flex-shrink-0" />}
              <p className={`text-[13px] font-extrabold truncate ${isFirst ? "text-[var(--success)]" : "text-[var(--amber-dark)]"}`}>
                {myEntry ? statusTitle : "Not in the queue"}
              </p>
            </div>
            <p className={`text-[11px] ${isFirst ? "text-[var(--success)]" : "text-[var(--amber)]"}`}>
              {myEntry
                ? `${statusSubtitle} • ${terminalLabel}`
                : "Get assigned to a TODA terminal to accept private and share rides."}
            </p>
            <div className="mt-1.5">
              <AccessChips isFirst={isFirst} />
            </div>
            <div className="mt-1.5">
              <RadiusNote
                terminalName={terminalLabel}
                boundary={terminalBoundary}
                radiusKm={terminalRadiusKm}
                distanceMeters={distanceMeters}
                isWithinBoundary={isWithinBoundary}
                isLocating={isLocating}
                compact
              />
            </div>
          </div>
          <div className="flex-shrink-0">{myEntry ? leaveButton : joinButton}</div>
        </div>
        {actionError && <p className="text-[11px] text-[var(--primary)] font-semibold mt-2">{actionError}</p>}
      </div>
    );
  }

  // ---- Full hero card (rider home) ----
  return (
    <div className="px-5 pt-5 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
            <ListOrdered className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold text-[var(--ink)] leading-none">Terminal Queue</h3>
            <p className="text-[11px] text-[var(--muted-foreground)] truncate mt-1">{terminalLabel}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 bg-[var(--success-soft)] text-[var(--success)] text-[10px] font-extrabold px-2 py-1 rounded-full flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="mb-3">
        <RadiusNote
          terminalName={terminalLabel}
          boundary={terminalBoundary}
          radiusKm={terminalRadiusKm}
          distanceMeters={distanceMeters}
          isWithinBoundary={isWithinBoundary}
          isLocating={isLocating}
        />
      </div>

      {isLoadingState ? (
        <div className="rounded-2xl border border-line bg-[var(--muted)] py-8 text-center">
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Loading queue…</p>
        </div>
      ) : myEntry ? (
        <div className="space-y-3">
          {/* Position hero */}
          <div className={`rounded-2xl border-2 p-4 ${tone}`}>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {isFirst && (
                  <span className="absolute inset-0 rounded-full bg-[var(--success)] opacity-30 animate-ping" />
                )}
                <div
                  className={`relative w-[74px] h-[74px] rounded-full flex flex-col items-center justify-center text-white ${rankCircle} shadow-lg ${
                    isFirst ? "shadow-[var(--success-soft)]" : "shadow-[var(--amber-soft)]"
                  }`}
                >
                  <span className="text-[9px] font-extrabold tracking-widest leading-none opacity-90">POSITION</span>
                  <span className="text-[26px] font-extrabold leading-tight">#{position}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isFirst && <Zap className="w-4 h-4 text-[var(--success)] flex-shrink-0" />}
                  <p className={`text-sm font-extrabold ${isFirst ? "text-[var(--success)]" : "text-[var(--amber-dark)]"}`}>
                    {statusTitle}
                  </p>
                </div>
                <p className={`text-xs mt-0.5 ${isFirst ? "text-[var(--success)]" : "text-[var(--amber)]"}`}>
                  {statusSubtitle}
                </p>
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)] mt-2">
                  In line for {formatWaiting(myEntry.joined_at)} • {entries.length} waiting
                </p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-black/5">
              <AccessChips isFirst={isFirst} />
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] mt-2">
                <Truck className="w-3.5 h-3.5" />
                Delivery requests are always open to you.
              </p>
            </div>
          </div>

          {/* Drivers in the queue */}
          <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--muted)]">
              <p className="text-[10px] font-extrabold tracking-wide text-[var(--muted-foreground)]">
                IN QUEUE ({entries.length})
              </p>
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)]">oldest first</p>
            </div>
            <div className="divide-y divide-[var(--muted)]">
              {visibleDrivers.map((entry, index) => (
                <DriverRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isMe={entry.driver_id === myEntry.driver_id}
                />
              ))}
            </div>
            {hiddenDrivers > 0 && (
              <div className="flex items-center justify-center gap-1 px-3 py-2 bg-[var(--muted)] border-t border-[var(--muted)]">
                <span className="text-[10px] font-bold text-[var(--muted-foreground)]">
                  +{hiddenDrivers} more driver{hiddenDrivers !== 1 ? "s" : ""}
                </span>
                <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]" />
              </div>
            )}
          </div>

          <div>
            {leaveButton}
            <p className="text-[10px] text-[var(--muted-foreground)] text-center mt-1.5">
              Leaving puts you at the back of the queue next time.
            </p>
          </div>
        </div>
      ) : (
        /* Not in the queue */
        <div className="rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] p-4">
          <div className="text-center mb-3">
            <div className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center mx-auto mb-2">
              <Ticket className="w-5 h-5 text-[var(--muted-foreground)]" />
            </div>
            <p className="text-sm font-extrabold text-[var(--ink)]">You're not in the queue</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Get assigned to a TODA terminal to accept private and share rides. Delivery is always open.
            </p>
          </div>
          <div className="flex justify-center mb-3">
            <AccessChips isFirst={false} />
          </div>
          {joinButton}
          {!canJoin && (
            <p className="text-[10px] text-[var(--muted-foreground)] text-center mt-2">
              Turn on "You're Online" above to join the queue.
            </p>
          )}
        </div>
      )}

      {actionError && (
        <p className="text-[11px] text-[var(--primary)] font-semibold text-center mt-2">{actionError}</p>
      )}
      {error && !myEntry && (
        <p className="text-[10px] text-[var(--muted-foreground)] text-center mt-2">
          Queue unavailable right now — retrying automatically.
        </p>
      )}
    </div>
  );
}
