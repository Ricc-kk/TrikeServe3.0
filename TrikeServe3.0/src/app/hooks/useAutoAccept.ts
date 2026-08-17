import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

const KEY_PREFIX = "trikeserve_auto_accept_";

/** Whether auto-accept is enabled for the given driver (per-user, persisted). */
export function isAutoAcceptEnabled(userId?: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(KEY_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

/** Enable or disable auto-accept for a driver. */
export function setAutoAcceptEnabled(userId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(KEY_PREFIX + userId, "1");
    else localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Watches for pending private/delivery requests and auto-accepts them when
 * auto-accept is enabled for the driver and the request matches one of the
 * driver's eligible service types. Used by RiderDashboard.
 */
export function useAutoAccept() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const acceptingRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    let cancelled = false;

    const eligibleTypes = (user?.serviceTypes || []).filter(
      (s) => s === "private" || s === "delivery"
    );

    const poll = async () => {
      if (cancelled || acceptingRef.current) return;
      if (!isAutoAcceptEnabled(userId) || eligibleTypes.length === 0) return;

      const { data: pending, error } = await supabaseHelpers.getRideRequests({ status: "pending" });
      if (cancelled || error || !pending || pending.length === 0) return;

      const match = pending.find((r: any) => eligibleTypes.includes(r.type));
      if (!match) return;

      acceptingRef.current = true;
      try {
        // Atomically claim so two drivers can't accept the same request.
        const { data: claimed, error: claimError } = await supabaseHelpers.claimRideRequest(
          match.id,
          userId,
          user.name || "Driver",
          undefined,
          user.todaPlate,
          "4.8"
        );
        if (claimError || !claimed) return;

        const acceptedRide = {
          ...claimed,
          driverId: userId,
          driverName: user.name,
          driverPlate: user.todaPlate,
          driverRating: "4.8",
          status: "accepted",
          acceptedAt: new Date().toISOString(),
          eta: "5 mins",
        };
        localStorage.setItem("trikeserve_active_ride", JSON.stringify(acceptedRide));
        navigate("/rider/active-ride", { state: { acceptedRide } });
      } finally {
        acceptingRef.current = false;
      }
    };

    const interval = setInterval(poll, 5000);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id, user?.name, user?.todaPlate, user?.serviceTypes, navigate]);
}
