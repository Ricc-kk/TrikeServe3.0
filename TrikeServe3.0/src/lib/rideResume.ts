import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { supabase } from "./supabase";
import { useAuth } from "../app/contexts/AuthContext";
import { ACTIVE_RIDE_STATUSES } from "./rideLock";

/**
 * Remembers an in-progress ride and returns the customer or driver to it after the
 * session comes back.
 *
 * Why this exists: a ride is not a page. If the Supabase session drops -- an expired
 * refresh token, the device losing connectivity long enough for the refresh to fail,
 * the user clearing site data mid-trip -- the app treated the ride as simply over.
 * The customer was dumped on the login screen while a tricycle was still en route,
 * with no indication anything was happening, and nothing put them back afterwards.
 *
 * The marker is written while signed in and only cleared when the ride really ends,
 * so it survives exactly the thing it is here for.
 *
 * It is only a *pointer*. Nothing about the ride is cached here -- no driver, no
 * coordinates, no messages. The database is checked again on return, so a ride that
 * was cancelled while the user was signed out does not get resurrected.
 */

const STORAGE_KEY = "trikeserve_active_ride";

type RememberedRide = {
  role: "customer" | "rider";
  rideId: string;
  /** When the marker was last confirmed against the database. */
  savedAt: number;
};

/** Where each role's ride screen lives. */
const RIDE_PATHS: Record<RememberedRide["role"], string> = {
  // The customer tracks their ride on the home screen; there is no dedicated route.
  customer: "/customer",
  rider: "/rider/active-ride",
};

function read(): RememberedRide | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedRide;
    if (!parsed?.role || !parsed?.rideId || !RIDE_PATHS[parsed.role]) return null;
    return parsed;
  } catch {
    // Corrupt or unavailable storage. Not worth failing over: worst case the ride is
    // not resumed, which is the behaviour we had before this existed.
    return null;
  }
}

export function rememberActiveRide(role: RememberedRide["role"], rideId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, rideId, savedAt: Date.now() }));
  } catch {
    // Private mode or a full quota. The ride still works, it just will not resume.
  }
}

export function forgetActiveRide() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the next write will overwrite it.
  }
}

export function getRememberedRide(): RememberedRide | null {
  return read();
}

/**
 * Records or clears the marker to match the ride's real state, and resumes a
 * remembered ride once the user is authenticated again.
 *
 * Returns the marker state so a screen can write it from the ride it is already
 * showing, rather than this hook re-querying on every screen.
 */
export function useRideResume() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const resumedFor = useRef<string | null>(null);

  // Resume once per sign-in, not once per render.
  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Signed out. Deliberately keep the marker: that is the whole point.
      resumedFor.current = null;
      return;
    }

    const remembered = read();
    if (!remembered) return;

    // Only resume if the marker belongs to this person. Someone else signing in on a
    // shared device must not inherit the previous user's ride.
    const expected = user.role === "rider" ? "rider" : user.role === "customer" ? "customer" : null;
    if (!expected || remembered.role !== expected) return;

    const guardKey = `${user.id}:${remembered.rideId}`;
    if (resumedFor.current === guardKey) return;
    resumedFor.current = guardKey;

    let active = true;
    (async () => {
      // The marker is a hint, not the truth. Confirm against the database before
      // navigating: the ride may have been cancelled or completed while signed out,
      // and dropping the user onto a finished ride would be worse than not resuming.
      const column = remembered.role === "rider" ? "driver_id" : "customer_id";
      const { data } = await supabase
        .from("ride_requests")
        .select("id, status")
        .eq("id", remembered.rideId)
        .eq(column, user.id)
        .in("status", [...ACTIVE_RIDE_STATUSES])
        .limit(1);

      if (!active) return;
      const stillActive = (data ?? []).length > 0;
      if (stillActive) {
        navigate(RIDE_PATHS[remembered.role], { replace: true });
      } else {
        forgetActiveRide();
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, user?.role, loading, navigate]);

  return {
    /** Call with the ride currently on screen; pass `null` once it has ended. */
    sync: (role: RememberedRide["role"], rideId: string | null) => {
      if (rideId) rememberActiveRide(role, rideId);
      else forgetActiveRide();
    },
  };
}