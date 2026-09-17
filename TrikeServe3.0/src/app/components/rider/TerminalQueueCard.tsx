import { useState } from "react";
import {
  Car,
  ChevronRight,
  ListOrdered,
  Lock,
  LogOut,
  MapPin,
  Ticket,
  Truck,
  Unlock,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useTerminalQueue } from "../../hooks/useTerminalQueue";

const MAX_VISIBLE_DRIVERS = 5;

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
        active ? "bg-white border-[#10B981]/50" : "bg-white/60 border-[#E2E8F0]"
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${active ? "text-[#059669]" : "text-[#94A3B8]"}`} />
      <span className={`text-[11px] font-bold ${active ? "text-[#065F46]" : "text-[#94A3B8]"}`}>
        {label}
      </span>
      {active ? (
        <Unlock className="w-3 h-3 text-[#059669]" />
      ) : (
        <Lock className="w-3 h-3 text-[#CBD5E1]" />
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
    <div className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? "bg-[#FFF1F2]" : ""}`}>
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${
          isNext
            ? "bg-[#10B981] text-white"
            : isMe
              ? "bg-[#E11D48] text-white"
              : "bg-[#F1F5F9] text-[#64748B]"
        }`}
      >
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${isMe || isNext ? "font-extrabold" : "font-semibold"} text-[#121212]`}>
          {isMe ? "You" : entry.driver_name || "Driver"}
        </p>
        <p className="text-[10px] text-[#94A3B8] truncate">
          {entry.driver_plate || "No plate"} • waiting {formatWaiting(entry.joined_at)}
        </p>
      </div>
      {isNext && (
        <Badge className="bg-[#10B981] text-white text-[9px] font-extrabold tracking-wide border-0 flex-shrink-0">
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
    ? "bg-[#F0FDF4] border-[#10B981]"
    : "bg-[#FFF7ED] border-[#FDBA74]";

  const statusTitle = isFirst
    ? "You're first in line"
    : `${aheadCount} driver${aheadCount !== 1 ? "s" : ""} ahead of you`;
  const statusSubtitle = isFirst
    ? "Private and share rides are unlocked."
    : "Private and share rides unlock at #1.";
  const rankCircle = isFirst ? "bg-[#10B981]" : "bg-[#F59E0B]";

  const joinButton = (
    <Button
      onClick={() => runAction(join)}
      disabled={isMutating || !canJoin}
      className={`font-bold uppercase tracking-wide ${
        isCompact ? "text-[11px] px-3 h-9" : "w-full"
      } ${
        canJoin
          ? "bg-[#E11D48] hover:bg-[#BE123C] text-white"
          : "bg-gray-300 text-gray-500 cursor-not-allowed"
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
      className={`border-[#E2E8F0] text-[#64748B] hover:border-[#E11D48] hover:text-[#E11D48] font-bold uppercase tracking-wide ${
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
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[#E11D48] bg-[#FFF1F2] p-3.5">
          <div className="w-10 h-10 rounded-full bg-[#E11D48] flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[#121212]">No terminal assigned yet</p>
            <p className="text-xs text-[#64748B] mt-0.5">
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
              isFirst ? "shadow-lg shadow-emerald-200" : ""
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
              {isFirst && <Zap className="w-3.5 h-3.5 text-[#059669] flex-shrink-0" />}
              <p className={`text-[13px] font-extrabold truncate ${isFirst ? "text-[#065F46]" : "text-[#92400E]"}`}>
                {myEntry ? statusTitle : "Not in the queue"}
              </p>
            </div>
            <p className={`text-[11px] ${isFirst ? "text-[#047857]" : "text-[#B45309]"}`}>
              {myEntry
                ? `${statusSubtitle} • ${terminalLabel}`
                : "Get assigned to a TODA terminal to accept private and share rides."}
            </p>
            <div className="mt-1.5">
              <AccessChips isFirst={isFirst} />
            </div>
          </div>
          <div className="flex-shrink-0">{myEntry ? leaveButton : joinButton}</div>
        </div>
        {actionError && <p className="text-[11px] text-[#E11D48] font-semibold mt-2">{actionError}</p>}
      </div>
    );
  }

  // ---- Full hero card (rider home) ----
  return (
    <div className="px-5 pt-5 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#E11D48] flex items-center justify-center flex-shrink-0">
            <ListOrdered className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold text-[#121212] leading-none">Terminal Queue</h3>
            <p className="text-[11px] text-[#94A3B8] truncate mt-1">{terminalLabel}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 bg-[#F0FDF4] text-[#059669] text-[10px] font-extrabold px-2 py-1 rounded-full flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
          LIVE
        </span>
      </div>

      {isLoadingState ? (
        <div className="rounded-2xl border-2 border-[#E2E8F0] bg-[#F8F9FA] py-8 text-center">
          <p className="text-xs font-semibold text-[#94A3B8]">Loading queue…</p>
        </div>
      ) : myEntry ? (
        <div className="space-y-3">
          {/* Position hero */}
          <div className={`rounded-2xl border-2 p-4 ${tone}`}>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {isFirst && (
                  <span className="absolute inset-0 rounded-full bg-[#10B981] opacity-30 animate-ping" />
                )}
                <div
                  className={`relative w-[74px] h-[74px] rounded-full flex flex-col items-center justify-center text-white ${rankCircle} shadow-lg ${
                    isFirst ? "shadow-emerald-200" : "shadow-amber-200"
                  }`}
                >
                  <span className="text-[9px] font-extrabold tracking-widest leading-none opacity-90">POSITION</span>
                  <span className="text-[26px] font-extrabold leading-tight">#{position}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isFirst && <Zap className="w-4 h-4 text-[#059669] flex-shrink-0" />}
                  <p className={`text-sm font-extrabold ${isFirst ? "text-[#065F46]" : "text-[#92400E]"}`}>
                    {statusTitle}
                  </p>
                </div>
                <p className={`text-xs mt-0.5 ${isFirst ? "text-[#047857]" : "text-[#B45309]"}`}>
                  {statusSubtitle}
                </p>
                <p className="text-[10px] font-semibold text-[#94A3B8] mt-2">
                  In line for {formatWaiting(myEntry.joined_at)} • {entries.length} waiting
                </p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-black/5">
              <AccessChips isFirst={isFirst} />
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[#94A3B8] mt-2">
                <Truck className="w-3.5 h-3.5" />
                Delivery requests are always open to you.
              </p>
            </div>
          </div>

          {/* Drivers in the queue */}
          <div className="rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#F8F9FA]">
              <p className="text-[10px] font-extrabold tracking-wide text-[#64748B]">
                IN QUEUE ({entries.length})
              </p>
              <p className="text-[10px] font-semibold text-[#94A3B8]">oldest first</p>
            </div>
            <div className="divide-y divide-[#F1F5F9]">
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
              <div className="flex items-center justify-center gap-1 px-3 py-2 bg-[#F8F9FA] border-t border-[#F1F5F9]">
                <span className="text-[10px] font-bold text-[#64748B]">
                  +{hiddenDrivers} more driver{hiddenDrivers !== 1 ? "s" : ""}
                </span>
                <ChevronRight className="w-3 h-3 text-[#94A3B8]" />
              </div>
            )}
          </div>

          <div>
            {leaveButton}
            <p className="text-[10px] text-[#94A3B8] text-center mt-1.5">
              Leaving puts you at the back of the queue next time.
            </p>
          </div>
        </div>
      ) : (
        /* Not in the queue */
        <div className="rounded-2xl border-2 border-dashed border-[#E2E8F0] bg-[#F8F9FA] p-4">
          <div className="text-center mb-3">
            <div className="w-12 h-12 rounded-full bg-white border-2 border-[#E2E8F0] flex items-center justify-center mx-auto mb-2">
              <Ticket className="w-5 h-5 text-[#94A3B8]" />
            </div>
            <p className="text-sm font-extrabold text-[#121212]">You're not in the queue</p>
            <p className="text-xs text-[#64748B] mt-0.5">
              Get assigned to a TODA terminal to accept private and share rides. Delivery is always open.
            </p>
          </div>
          <div className="flex justify-center mb-3">
            <AccessChips isFirst={false} />
          </div>
          {joinButton}
          {!canJoin && (
            <p className="text-[10px] text-[#94A3B8] text-center mt-2">
              Turn on "You're Online" above to join the queue.
            </p>
          )}
        </div>
      )}

      {actionError && (
        <p className="text-[11px] text-[#E11D48] font-semibold text-center mt-2">{actionError}</p>
      )}
      {error && !myEntry && (
        <p className="text-[10px] text-[#94A3B8] text-center mt-2">
          Queue unavailable right now — retrying automatically.
        </p>
      )}
    </div>
  );
}
