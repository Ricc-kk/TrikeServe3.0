import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  haversineDistanceMeters,
  isPointInPolygon,
  normalizeBoundaryRoad,
  normalizeBoundaryArea,
  normalizeRoadWidth,
  DEFAULT_ROAD_WIDTH_M,
  supabase,
  supabaseHelpers,
  type LatLngPoint,
} from "@/lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useDevModeOnlyFeature, useDevModeOverride } from "./useDevModeSettings";

export interface TerminalGeometry {
  /**
   * The road the admin plotted on the map (terminals.boundary_polygon).
   * This is the terminal's "given area" — whatever the admin draws is what
   * drivers are told about when they queue.
   */
  boundary: LatLngPoint[] | null;
  /**
   * The enclosing border area (terminals.boundary_area). A driver must be inside
   * it to join the queue.
   */
  area: LatLngPoint[] | null;
  /** Full corridor width (m) either side of that road the terminal accepts. */
  roadWidthM: number;
  /**
   * Whether the admin has the boundary check switched on. When false both shapes
   * are still plotted, so they are kept for display but not used to judge the driver.
   */
  boundaryEnabled: boolean;
  /** Terminal centre — only used as a fallback when no road is plotted. */
  center: { lat: number; lng: number } | null;
  /** Fallback radius (km) used only when no road is plotted. */
  radiusKm: number | null;
}

export interface TerminalQueueEntry {
  id: string;
  terminal_id: string;
  driver_id: string;
  driver_name?: string | null;
  driver_plate?: string | null;
  status?: string;
  joined_at: string;
}

function terminalGeometryFromRow(data: any): TerminalGeometry {
  const lat = data?.center_lat == null ? Number.NaN : Number(data.center_lat);
  const lng = data?.center_lng == null ? Number.NaN : Number(data.center_lng);
  const radius = data?.radius_km == null ? Number.NaN : Number(data.radius_km);

  return {
    boundary: normalizeBoundaryRoad(data?.boundary_polygon),
    area: normalizeBoundaryArea(data?.boundary_area),
    roadWidthM: normalizeRoadWidth(data?.road_width_m),
    boundaryEnabled: data?.boundary_enabled !== false,
    center: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    radiusKm: Number.isFinite(radius) ? radius : null,
  };
}

function isLocationInsideTerminal(location: LatLngPoint, geometry: TerminalGeometry): boolean | null {
  if (geometry.area) {
    return isPointInPolygon(location.lat, location.lng, geometry.area);
  }
  if (geometry.center && geometry.radiusKm != null) {
    return haversineDistanceMeters(location, geometry.center) <= geometry.radiusKm * 1000;
  }
  return null;
}

function getFreshDriverLocation(): Promise<LatLngPoint> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location services are unavailable on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
          reject(new Error("Your current location could not be verified."));
          return;
        }
        resolve({ lat: coords.latitude, lng: coords.longitude });
      },
      () => reject(new Error("Turn on location services to verify that you're at your terminal before joining.")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
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
const OUTSIDE_QUEUE_GRACE_MS = 60_000;

export function isQueueGatedType(type?: string): boolean {
  return type === "private" || type === "shared";
}

/**
 * True when the driver's selected service type is Delivery.
 *
 * Delivery is exclusive with Rides (see ServiceTypes/normalizeServiceSelection),
 * so any selection containing 'delivery' means the driver is on Delivery.
 */
export function isDeliveryServiceMode(serviceTypes?: string[] | null): boolean {
  return (serviceTypes || []).includes("delivery");
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
  const [enforceBoundary] = useDevModeOverride("enforceBoundary");
  const queueJoiningEnabled = useDevModeOnlyFeature("driverQueueJoining");
  const [terminalId, setTerminalId] = useState<string | null>(user?.terminalId || null);
  const [terminalName, setTerminalName] = useState<string | null>(user?.terminalName || null);
  const [queue, setQueue] = useState<TerminalQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True until the database lookup for the driver's terminal settles, so
  // consumers never briefly treat a driver as "unassigned".
  const [isResolvingTerminal, setIsResolvingTerminal] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Terminal geometry + the driver's live position, so the queue card can show
  // whether the driver is inside the terminal area and the join action can verify it.
  const [terminalGeometry, setTerminalGeometry] = useState<TerminalGeometry>({
    boundary: null,
    area: null,
    roadWidthM: DEFAULT_ROAD_WIDTH_M,
    boundaryEnabled: true,
    center: null,
    radiusKm: null,
  });
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [hasLiveQueueLocation, setHasLiveQueueLocation] = useState(false);
  const [outsideQueueSecondsRemaining, setOutsideQueueSecondsRemaining] = useState<number | null>(null);
  const [outsideQueueAutoRemoved, setOutsideQueueAutoRemoved] = useState(false);
  const [outsideQueueError, setOutsideQueueError] = useState<string | null>(null);
  const outsideQueueDeadlineRef = useRef<number | null>(null);
  const outsideQueueLeaveInFlightRef = useRef(false);
  const outsideQueueRetryAtRef = useRef(0);

  const driverId = user?.id;
  const outsideQueueStorageKey = driverId && terminalId
    ? `trikeserve_terminal_queue_outside_since:${driverId}:${terminalId}`
    : null;

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
      .then(async ({ data }) => {
        if (cancelled) return;

        const assignedTerminalId = data?.terminal_id || null;
        let assignedTerminalName = data?.terminal_name || null;
        if (assignedTerminalId) {
          const { data: terminal } = await supabase
            .from("terminals")
            .select("name")
            .eq("id", assignedTerminalId)
            .maybeSingle();
          assignedTerminalName = terminal?.name || assignedTerminalName;
        }
        if (cancelled) return;

        // The database is the authority: this also clears a stale assignment
        // when an admin unassigns the driver's terminal.
        setTerminalId(assignedTerminalId);
        setTerminalName(assignedTerminalName);

        if (assignedTerminalId) {
          try {
            const stored = JSON.parse(localStorage.getItem("trikeserve_current_user") || "{}");
            if (stored.terminalId !== assignedTerminalId || stored.terminalName !== assignedTerminalName) {
              stored.terminalId = assignedTerminalId;
              stored.terminalName = assignedTerminalName;
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
          .clearTerminalQueueRows(driverId, assignedTerminalId)
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

  useEffect(() => {
    if (user?.terminalId === terminalId && user.terminalName) {
      setTerminalName(user.terminalName);
    }
  }, [user?.terminalId, user?.terminalName, terminalId]);

  // Keep terminal boundary settings current for active drivers. Realtime updates
  // apply immediately when available, with polling as a fallback for clients or
  // projects where the terminals table is not in the Realtime publication.
  useEffect(() => {
    if (!terminalId) {
      setTerminalGeometry({ boundary: null, area: null, roadWidthM: DEFAULT_ROAD_WIDTH_M, boundaryEnabled: true, center: null, radiusKm: null });
      return;
    }
    let cancelled = false;
    let requestInFlight = false;

    const refreshTerminalGeometry = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const { data, error } = await supabaseHelpers.getTerminalGeofence(terminalId);
        if (cancelled) return;
        if (error || !data) {
          // Never keep an old boundary active after a failed refresh.
          setTerminalGeometry({ boundary: null, area: null, roadWidthM: DEFAULT_ROAD_WIDTH_M, boundaryEnabled: true, center: null, radiusKm: null });
          return;
        }
        setTerminalGeometry(terminalGeometryFromRow(data));
      } catch {
        if (!cancelled) {
          setTerminalGeometry({ boundary: null, area: null, roadWidthM: DEFAULT_ROAD_WIDTH_M, boundaryEnabled: true, center: null, radiusKm: null });
        }
      } finally {
        requestInFlight = false;
      }
    };

    void refreshTerminalGeometry();
    const subscription = supabase
      .channel(`terminal-geofence-${terminalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "terminals", filter: `id=eq.${terminalId}` },
        () => void refreshTerminalGeometry(),
      )
      .subscribe();
    const interval = setInterval(() => void refreshTerminalGeometry(), 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(subscription);
    };
  }, [terminalId]);

  // One-shot location read; a denial just leaves the distance unknown rather than
  // blocking anything (the radius hint is informational).
  const refreshLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setIsLocating(false);
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDriverLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

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
    setHasLiveQueueLocation(false);
    if (!driverId || !myEntryId || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setDriverLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
        setHasLiveQueueLocation(true);
      },
      () => {
        setIsLocating(false);
        setHasLiveQueueLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverId, myEntryId]);

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

  // Distance to the terminal centre — context for the fallback radius circle.
  const distanceMeters = useMemo(() => {
    if (!terminalGeometry.center || !driverLocation) return null;
    return haversineDistanceMeters(driverLocation, terminalGeometry.center);
  }, [terminalGeometry.center, driverLocation]);

  /**
   * Whether the driver is standing inside their terminal's BORDER.
   *
   * The border area is the gate, not the road: queueing up means being at the
   * terminal, and the road corridor is hundreds of metres wide, so a driver
   * parked a couple of streets away would pass a corridor test while being
   * nowhere near the terminal. Only the area decides.
   *
   * The centre + radius circle is a fallback for terminals with no area plotted.
   * Null when we can't tell, or when the admin has switched the check off.
   */
  const isWithinBoundary = useMemo(() => {
    if (!driverLocation || !terminalGeometry.boundaryEnabled) return null;
    return isLocationInsideTerminal(driverLocation, terminalGeometry);
  }, [driverLocation, terminalGeometry]);
  // Definitive "this driver has no terminal" — only once the DB lookup settled.
  const hasNoTerminal = !isResolvingTerminal && !terminalId;

  const join = useCallback(async () => {
    if (!queueJoiningEnabled) {
      return { error: new Error("Joining the terminal queue is currently disabled.") };
    }
    if (!driverId) return { error: new Error("You must be logged in as a driver.") };
    // Never join before the fresh terminal lookup settles — the cached value may
    // point at a terminal this driver has since been moved out of.
    if (isResolvingTerminal) {
      return { error: new Error("Checking your terminal assignment — try again in a moment.") };
    }
    if (!terminalId) return { error: new Error("You are not assigned to a terminal yet.") };

    setIsMutating(true);
    try {
      if (enforceBoundary) {
        // Read the saved settings at tap time as well as keeping the UI synced
        // through Realtime. This closes the gap between an admin edit and the
        // next client refresh.
        const { data: terminal, error: terminalError } = await supabaseHelpers.getTerminalGeofence(terminalId);
        if (terminalError || !terminal) {
          return { error: new Error("Couldn't verify the terminal boundary. Check your connection and try again.") };
        }

        const latestGeometry = terminalGeometryFromRow(terminal);
        setTerminalGeometry(latestGeometry);

        if (latestGeometry.boundaryEnabled) {
          let location: LatLngPoint;
          try {
            setIsLocating(true);
            location = await getFreshDriverLocation();
            setDriverLocation(location);
          } catch (locationError) {
            const message = locationError instanceof Error
              ? locationError.message
              : "Turn on location services to verify that you're at your terminal before joining.";
            return { error: new Error(message) };
          } finally {
            setIsLocating(false);
          }

          const inside = isLocationInsideTerminal(location, latestGeometry);
          if (inside !== true) {
            return {
              error: new Error(
                inside === false
                  ? "You are outside your terminal's area. Move inside the terminal to join the queue."
                  : "This terminal has no boundary configured, so your location can't be verified. Contact an administrator."
              ),
            };
          }
        }
      }

      const { error: joinError } = await supabaseHelpers.joinTerminalQueue({
        terminalId,
        driverId,
        driverName: user?.name,
        driverPlate: user?.todaPlate,
      });
      await refresh();

      if (!joinError) {
        setOutsideQueueAutoRemoved(false);
        setOutsideQueueError(null);
        outsideQueueDeadlineRef.current = null;
        outsideQueueRetryAtRef.current = 0;
        if (outsideQueueStorageKey) {
          try {
            localStorage.removeItem(outsideQueueStorageKey);
          } catch {
            // Queue join succeeded; local countdown storage is only best effort.
          }
        }
      }

      return { error: joinError };
    } catch (joinError) {
      return {
        error: joinError instanceof Error ? joinError : new Error("Unable to join the terminal queue."),
      };
    } finally {
      setIsMutating(false);
    }
  }, [driverId, terminalId, isResolvingTerminal, enforceBoundary, queueJoiningEnabled, user?.name, user?.todaPlate, refresh, outsideQueueStorageKey]);

  const leave = useCallback(async () => {
    if (!driverId || !terminalId) return { error: null };

    setIsMutating(true);
    try {
      const { error: leaveError } = await supabaseHelpers.leaveTerminalQueue(terminalId, driverId);
      await refresh();
      return { error: leaveError };
    } catch (leaveError) {
      return { error: leaveError };
    } finally {
      setIsMutating(false);
    }
  }, [driverId, terminalId, refresh]);

  // Start a 60-second grace period as soon as a queued driver is confirmed
  // outside the terminal's enabled boundary. The timestamp survives navigation
  // or reloads, and returning inside cancels it without losing queue position.
  useEffect(() => {
    if (!outsideQueueStorageKey) return;

    const clearDeadline = () => {
      try {
        localStorage.removeItem(outsideQueueStorageKey);
      } catch {
        // The in-memory timer still resets when browser storage is unavailable.
      }
      outsideQueueDeadlineRef.current = null;
      outsideQueueRetryAtRef.current = 0;
      setOutsideQueueSecondsRemaining(null);
    };

    if (!myEntryId) {
      if (!isLoading) {
        clearDeadline();
        outsideQueueLeaveInFlightRef.current = false;
      }
      return;
    }

    if (!enforceBoundary || !terminalGeometry.boundaryEnabled) {
      clearDeadline();
      setOutsideQueueError(null);
      return;
    }

    if (isWithinBoundary === true) {
      clearDeadline();
      setOutsideQueueError(null);
      return;
    }

    // A missing fix is unknown, not proof that the driver is outside.
    if (isWithinBoundary !== false) return;
    // Start/resume only after a live location fix confirms the driver is still
    // outside. If GPS drops after the countdown starts, keep the timer running.
    if (!hasLiveQueueLocation && outsideQueueDeadlineRef.current == null) return;

    if (outsideQueueDeadlineRef.current == null) {
      let startedAt = Number.NaN;
      try {
        const stored = JSON.parse(localStorage.getItem(outsideQueueStorageKey) || "null");
        if (stored?.entryId === myEntryId) startedAt = Number(stored.startedAt);
      } catch {
        // Fall back to an in-memory deadline if storage is unavailable.
      }
      if (!Number.isFinite(startedAt) || startedAt <= 0) {
        startedAt = Date.now();
        try {
          localStorage.setItem(outsideQueueStorageKey, JSON.stringify({ entryId: myEntryId, startedAt }));
        } catch {
          // The in-memory deadline still covers this open session.
        }
      }
      outsideQueueDeadlineRef.current = startedAt + OUTSIDE_QUEUE_GRACE_MS;
      setOutsideQueueError(null);
    }

    const tick = () => {
      const deadline = outsideQueueDeadlineRef.current;
      if (deadline == null) return;

      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setOutsideQueueSecondsRemaining(remaining);
      if (
        remaining !== 0 ||
        outsideQueueLeaveInFlightRef.current ||
        Date.now() < outsideQueueRetryAtRef.current
      ) return;

      outsideQueueLeaveInFlightRef.current = true;
      leave().then(({ error: leaveError }) => {
        outsideQueueLeaveInFlightRef.current = false;
        if (leaveError) {
          setOutsideQueueError("We couldn't remove you automatically. Retrying shortly.");
          outsideQueueRetryAtRef.current = Date.now() + 5_000;
          return;
        }

        try {
          localStorage.removeItem(outsideQueueStorageKey);
        } catch {
          // The queue row is already removed; the notice remains in memory.
        }
        outsideQueueDeadlineRef.current = null;
        outsideQueueRetryAtRef.current = 0;
        setOutsideQueueSecondsRemaining(null);
        setOutsideQueueError(null);
        setOutsideQueueAutoRemoved(true);
      }).catch(() => {
        outsideQueueLeaveInFlightRef.current = false;
        setOutsideQueueError("We couldn't remove you automatically. Retrying shortly.");
        outsideQueueRetryAtRef.current = Date.now() + 5_000;
      });
    };

    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [
    outsideQueueStorageKey,
    myEntryId,
    isLoading,
    enforceBoundary,
    terminalGeometry.boundaryEnabled,
    isWithinBoundary,
    hasLiveQueueLocation,
    leave,
  ]);

  const dismissOutsideQueueNotice = useCallback(() => {
    setOutsideQueueAutoRemoved(false);
    setOutsideQueueError(null);
  }, []);

  // Delivery is never queue-gated, so a driver on the Delivery service type must
  // not hold a terminal queue slot — whether they switched to it, logged in with
  // it already selected, or are on their way to the Passenger Requests page.
  const isDeliveryService = isDeliveryServiceMode(user?.serviceTypes);
  useEffect(() => {
    if (isDeliveryService && myEntry) leave();
  }, [isDeliveryService, myEntry?.id, leave]);

  return {
    terminalId,
    terminalName,
    terminalBoundary: terminalGeometry.boundary,
    terminalRoadWidthM: terminalGeometry.roadWidthM,
    terminalRadiusKm: terminalGeometry.radiusKm,
    distanceMeters,
    isWithinBoundary,
    isLocating,
    refreshLocation,
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
    outsideQueueSecondsRemaining,
    outsideQueueAutoRemoved,
    outsideQueueError,
    dismissOutsideQueueNotice,
    join,
    leave,
    refresh,
  };
}
