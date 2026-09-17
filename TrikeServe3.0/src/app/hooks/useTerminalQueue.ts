import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseHelpers } from "@/lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export interface TerminalQueueEntry {
  id: string;
  terminal_id: string;
  driver_id: string;
  driver_name?: string | null;
  driver_plate?: string | null;
  status?: string;
  joined_at: string;
}

/** Ride types that are gated by queue position (delivery is not gated). */
export const QUEUE_GATED_TYPES = ["private", "shared"] as const;

/** How often a queued driver refreshes their row so it doesn't look abandoned. */
const HEARTBEAT_MS = 60_000;

/**
 * A row that hasn't heartbeated for this long is treated as gone, so a driver
 * who force-closed the app can't block their terminal's first position forever.
 * Raise this if drivers legitimately keep the app backgrounded for long stretches
 * — but note their slot is lost either way once they exceed it.
 */
const STALE_AFTER_MS = 10 * 60_000;

export function isQueueGatedType(type?: string): boolean {
  return type === "private" || type === "shared";
}

/**
 * Live view of the driver's terminal queue.
 *
 * The queue is FIFO per terminal (`joined_at` ascending) and only the driver at
 * position 1 may accept private and share rides. Ordering lives in the database,
 * so two drivers can never both believe they are first.
 */
export function useTerminalQueue() {
  const { user } = useAuth();
  const [terminalId, setTerminalId] = useState<string | null>(user?.terminalId || null);
  const [terminalName, setTerminalName] = useState<string | null>(user?.terminalName || null);
  const [queue, setQueue] = useState<TerminalQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True until the database lookup for the driver's terminal settles, so
  // consumers never briefly treat a driver as "unassigned".
  const [isResolvingTerminal, setIsResolvingTerminal] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driverId = user?.id;

  // Resolve the driver's terminal fresh from the database — localStorage can be
  // stale when an admin assigns a terminal after the driver logged in.
  useEffect(() => {
    if (!driverId) {
      setIsResolvingTerminal(false);
      return;
    }
    let cancelled = false;

    supabase
      .from("users")
      .select("terminal_id, terminal_name")
      .eq("id", driverId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;

        // The database is the authority: this also clears a stale assignment
        // when an admin unassigns the driver's terminal.
        setTerminalId(data?.terminal_id || null);
        setTerminalName(data?.terminal_name || null);

        if (data?.terminal_id) {
          try {
            const stored = JSON.parse(localStorage.getItem("trikeserve_current_user") || "{}");
            if (!stored.terminalId) {
              stored.terminalId = data.terminal_id;
              stored.terminalName = data.terminal_name;
              localStorage.setItem("trikeserve_current_user", JSON.stringify(stored));
            }
          } catch {
            /* ignore storage errors */
          }
        }

        // Drop queue rows held in any other terminal. Covers both an unassigned
        // driver (keeps none) and one reassigned from t2 -> t1 (keeps t1), so a
        // ghost row can never keep blocking some other terminal's first slot.
        supabaseHelpers
          .clearTerminalQueueRows(driverId, data?.terminal_id || null)
          .catch(() => {});

        setIsResolvingTerminal(false);
      })
      .catch(() => {
        if (!cancelled) setIsResolvingTerminal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const refresh = useCallback(async () => {
    if (!terminalId) {
      setQueue([]);
      setIsLoading(false);
      return;
    }

    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data, error: fetchError } = await supabaseHelpers.getTerminalQueue(terminalId, cutoff);
    if (fetchError) {
      // Table may not be migrated yet — surface it without breaking the page.
      setError(fetchError.message);
      setQueue([]);
      setIsLoading(false);
      return;
    }

    setError(null);
    setQueue((data || []) as TerminalQueueEntry[]);
    setIsLoading(false);

    // Best-effort reap so abandoned rows don't accumulate in the table.
    supabaseHelpers.deleteStaleTerminalQueue(terminalId, cutoff).catch(() => {});
  }, [terminalId]);

  // Initial load + realtime updates, with polling as a fallback.
  useEffect(() => {
    refresh();
    if (!terminalId) return;

    const subscription = supabase
      .channel(`terminal-queue-${terminalId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "terminal_queue",
          filter: `terminal_id=eq.${terminalId}`,
        },
        () => refresh()
      )
      .subscribe();

    const interval = setInterval(refresh, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(subscription);
    };
  }, [terminalId, refresh]);

  const position = useMemo(() => {
    if (!driverId) return 0;
    const index = queue.findIndex((entry) => entry.driver_id === driverId);
    return index === -1 ? 0 : index + 1;
  }, [queue, driverId]);

  const myEntry = useMemo(
    () => queue.find((entry) => entry.driver_id === driverId) || null,
    [queue, driverId]
  );

  // Keep our row fresh while we hold a slot, and beat immediately when the app
  // comes back to the foreground (timers are paused while backgrounded).
  const myEntryId = myEntry?.id;
  useEffect(() => {
    if (!terminalId || !driverId || !myEntryId) return;

    const beat = () => {
      supabaseHelpers.heartbeatTerminalQueue(terminalId, driverId).catch(() => {});
    };
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [terminalId, driverId, myEntryId]);

  const aheadCount = position > 0 ? position - 1 : 0;
  const isFirst = position === 1;
  // Definitive "this driver has no terminal" — only once the DB lookup settled.
  const hasNoTerminal = !isResolvingTerminal && !terminalId;

  const join = useCallback(async () => {
    if (!driverId) return { error: new Error("You must be logged in as a driver.") };
    // Never join before the fresh terminal lookup settles — the cached value may
    // point at a terminal this driver has since been moved out of.
    if (isResolvingTerminal) {
      return { error: new Error("Checking your terminal assignment — try again in a moment.") };
    }
    if (!terminalId) return { error: new Error("You are not assigned to a terminal yet.") };

    setIsMutating(true);
    const { error: joinError } = await supabaseHelpers.joinTerminalQueue({
      terminalId,
      driverId,
      driverName: user?.name,
      driverPlate: user?.todaPlate,
    });
    await refresh();
    setIsMutating(false);

    return { error: joinError };
  }, [driverId, terminalId, isResolvingTerminal, user?.name, user?.todaPlate, refresh]);

  const leave = useCallback(async () => {
    if (!driverId || !terminalId) return { error: null };

    setIsMutating(true);
    const { error: leaveError } = await supabaseHelpers.leaveTerminalQueue(terminalId, driverId);
    await refresh();
    setIsMutating(false);

    return { error: leaveError };
  }, [driverId, terminalId, refresh]);

  return {
    terminalId,
    terminalName,
    queue,
    myEntry,
    position,
    aheadCount,
    isFirst,
    hasNoTerminal,
    isResolvingTerminal,
    isLoading,
    isMutating,
    error,
    join,
    leave,
    refresh,
  };
}
