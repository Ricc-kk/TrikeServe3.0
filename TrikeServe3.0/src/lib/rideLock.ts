import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Statuses that mean the customer is currently on, or about to be on, a ride.
 *
 * `pending` is deliberately excluded: a customer who has requested a tricycle and
 * is waiting for one has not started the trip, and locking food ordering for the
 * whole search window would be punishing for no reason. Once a driver is assigned
 * the ride is real and everything else is noise.
 *
 * Checked against the live table rather than assumed. Every row this app has
 * actually written uses one of four values -- `pending`, `accepted`, `completed`,
 * `cancelled` -- so `accepted` is the only live one. The longer list is here for the
 * intermediate states, which live in `driver_status` today but would be promoted
 * into `status` if the flow ever moves them there; a rule that silently stops
 * locking when that happens is worse than one that is slightly too broad.
 *
 * `completed` and `cancelled` are terminal -- ordering food is allowed again.
 */
export const ACTIVE_RIDE_STATUSES = [
  "accepted",
  "driver-found",
  "picked-up",
  "in-transit",
  "arrived",
  "on-the-way",
  "payment",
  "awaiting-payment",
] as const;

/** The set of statuses in one place, so no screen invents its own list. */
const ACTIVE = new Set<string>([...ACTIVE_RIDE_STATUSES]);

export function isActiveRideStatus(status: string | null | undefined): boolean {
  return !!status && ACTIVE.has(status);
}

/**
 * Whether the customer is mid-ride, read straight from the database.
 *
 * Deliberately not taken from the home screen's `rideStatus` state. The surfaces
 * that need this lock -- the cart, checkout, the bottom nav -- do not share that
 * state, and passing it down would mean every one of them re-derives the rule from
 * a different source. A customer can also reach the cart by deep link or by a stale
 * tab left open from before the ride started; only the database knows.
 */
export async function hasActiveRide(customerId: string): Promise<boolean> {
  /*
   * Only the customer's *most recent* request is consulted.
   *
   * Asking "does any row have an active status?" was wrong, and it blocked food
   * ordering permanently. A booking that is accepted and then superseded by a new
   * booking never reaches `completed` or `cancelled` -- the customer simply books
   * again -- so its row stays `accepted` forever. One test customer had four such
   * orphans, all from the previous day, while their six most recent rides were
   * every one cancelled or completed. With the "any row" rule they were told they
   * were on a ride indefinitely, with no ride on screen and nothing to click to
   * clear it.
   *
   * The newest request is the one that reflects reality: if it is finished, the
   * ride is over, whatever earlier rows still claim.
   */
  const { data, error } = await supabase
    .from("ride_requests")
    .select("id, status")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed check must not lock the customer out of food ordering. Failing open is
  // the right direction for this particular rule: the cost of a wrong "no ride" is
  // an order they place anyway, while a wrong "on a ride" blocks a paying action
  // with no explanation and no way to tell why.
  if (error) return false;
  return isActiveRideStatus(data?.status);
}

/**
 * `hasActiveRide` as a hook, for components that need to render differently rather
 * than just disable a control.
 */
export function useActiveRideLock(customerId: string | null | undefined) {
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setLocked(false);
      setChecked(true);
      return;
    }
    let active = true;
    setChecked(false);
    hasActiveRide(customerId).then((result) => {
      if (!active) return;
      setLocked(result);
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [customerId]);

  return { locked, checked };
}