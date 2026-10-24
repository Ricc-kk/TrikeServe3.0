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
  // The hyphen and underscore spellings both occur in the codebase for the same
  // step. Two lists that differ by a character is how a ride ends up live for the
  // driver and free for the customer, so both are covered here and nowhere else.
  "driver-found",
  "driver_found",
  "picked-up",
  "in-transit",
  "in-progress",
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

/** Customer-only storage keys keep browser state from following another account. */
export function customerActiveRideStorageKey(customerId: string): string {
  return `trikeserve_active_ride_customer:${customerId}`;
}

export function customerActiveShareLobbyStorageKey(customerId: string): string {
  return `trikeserve_active_share_lobby_customer:${customerId}`;
}

function getLobbyPassengerLists(lobby: any): any[][] {
  if (!lobby) return [];
  return [lobby.passengers_json, lobby.passengers].flatMap((source) => {
    if (Array.isArray(source)) return [source];
    if (typeof source === "string") {
      try {
        const parsed = JSON.parse(source);
        return Array.isArray(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    }
    return [];
  });
}

/** Parse a lobby passenger list and confirm that a customer is actually in it. */
export function isCustomerLobbyPassenger(lobby: any, customerId: string | null | undefined): boolean {
  if (!customerId || !lobby) return false;
  return getLobbyPassengerLists(lobby).some((passengers) =>
    passengers.some((passenger: any) => {
      const passengerId = String(passenger?.id || "");
      return passengerId === customerId || passengerId.startsWith(`${customerId}_companion_`);
    }),
  );
}

/** A customer's own seats stop blocking bookings once each is completed and paid. */
function hasUnfinishedLobbyPassenger(lobby: any, customerId: string): boolean {
  const ownedPassengers = getLobbyPassengerLists(lobby)
    .flat()
    .filter((passenger: any) => {
      const passengerId = String(passenger?.id || "");
      return passengerId === customerId || passengerId.startsWith(`${customerId}_companion_`);
    });
  const uniquePassengersById = new Map<string, any>();
  ownedPassengers.forEach((passenger: any) => {
    const passengerId = String(passenger?.id || "");
    // `passengers_json` is the authoritative field when both legacy shapes exist.
    if (passengerId && !uniquePassengersById.has(passengerId)) {
      uniquePassengersById.set(passengerId, passenger);
    }
  });
  const uniquePassengers = [...uniquePassengersById.values()];

  if (uniquePassengers.length === 0) return false;
  return uniquePassengers.some((passenger: any) => {
    const dropoffStatus = String(passenger?.dropoff_status || passenger?.dropoffStatus || "").toLowerCase();
    const paymentStatus = String(passenger?.payment_status || passenger?.paymentStatus || "").toLowerCase();
    return dropoffStatus !== "completed" || !["received", "prepaid"].includes(paymentStatus);
  });
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
   * The customer's most recent actual ride is consulted; delivery jobs are
   * stored in `ride_requests` too, but an order delivery is not a passenger ride.
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
   * The newest actual ride request is the one that reflects reality: if it is
   * finished, the ride is over, whatever earlier rows still claim.
   */
  const { data, error } = await supabase
    .from("ride_requests")
    .select("id, status, accepted_driver_id, order_id, ride_type, pickup_location")
    .eq("customer_id", customerId)
    .is("order_id", null)
    .neq("ride_type", "delivery")
    .not("pickup_location", "like", "DELIVERY|%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed check must not lock the customer out of food ordering. Failing open is
  // the right direction for this particular rule: the cost of a wrong "no ride" is
  // an order they place anyway, while a wrong "on a ride" blocks a paying action
  // with no explanation and no way to tell why.
  if (error) return false;
  return isLiveRideForCustomer(data);
}

/** A delivery job is an order being carried, not a customer passenger ride. */
export function isDeliveryRideRequest(request: any): boolean {
  if (!request) return false;
  const type = String(request.ride_type || request.type || "").trim().toLowerCase();
  const pickup = String(request.pickup_location || request.pickup || "");
  return Boolean(request.order_id) || type === "delivery" || pickup.startsWith("DELIVERY|");
}

/**
 * Whether a `ride_requests` row represents a ride the customer is actually on.
 *
 * An active status alone is not enough. `accepted_driver_id` is the one column
 * that means "a driver is on this ride": it is what the customer's own ride
 * screen keys off, what the driver's active-ride lookup filters on, and what the
 * delivery screens join against.
 *
 * `driver_id` is deliberately NOT accepted as a substitute. It is null on an open
 * request, and one accept path used to write it without `accepted_driver_id`,
 * which produced exactly this bug -- a row that read `accepted` to the customer
 * while the driver, filtering on `accepted_driver_id`, saw no ride at all and the
 * customer stayed locked out with nobody coming.
 */
function isLiveRideForCustomer(ride: any): boolean {
  if (!ride || isDeliveryRideRequest(ride) || !isActiveRideStatus(ride.status)) return false;
  return !!ride.accepted_driver_id;
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

/**
 * The customer's currently blocking ride, if any.
 *
 * Two things mean "this customer is already travelling": an active private ride
 * request, and an unfinished passenger seat in a shared-ride lobby. Read live
 * rather than from screen state, because the booking surfaces can be reached by
 * deep link, the browser back button, or a tab that was opened before the ride
 * started. A shared lobby may stay active for other riders after this customer
 * has completed and paid for all of their own seats.
 *
 * The private ride is the customer's latest passenger-ride request, skipping
 * order delivery jobs. A superseded booking never reaches a terminal status,
 * and counting those would lock the customer out indefinitely.
 */
export async function getActiveRideContext(customerId: string): Promise<{
  privateRide: any | null;
  lobby: any | null;
}> {
  const [{ data: ride, error: rideError }, { data: lobbies, error: lobbyError }] = await Promise.all([
    supabase
      .from("ride_requests")
      .select("*")
      .eq("customer_id", customerId)
      .is("order_id", null)
      .neq("ride_type", "delivery")
      .not("pickup_location", "like", "DELIVERY|%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("shared_ride_lobbies")
      .select("*")
      .in("status", ["waiting", "driver_found", "in_progress"])
      .order("created_at", { ascending: false }),
  ]);

  const privateRide = !rideError && isLiveRideForCustomer(ride) ? ride : null;

  const lobby =
    (!lobbyError &&
      (lobbies || []).find((l: any) =>
        isCustomerLobbyPassenger(l, customerId) && hasUnfinishedLobbyPassenger(l, customerId),
      )) ||
    null;

  return { privateRide, lobby };
}

/**
 * `getActiveRideContext` as a polling hook.
 *
 * Polled because a ride can start (a driver accepts) or end while the booking
 * screen stays mounted, and a customer who books a second ride in that window is
 * exactly the case this guards. The lookup is two indexed reads.
 */
export function useActiveRideContext(customerId: string | null | undefined, pollMs = 8000) {
  const [context, setContext] = useState<{
    customerId: string | null;
    privateRide: any | null;
    lobby: any | null;
    checked: boolean;
  }>({
    customerId: null,
    privateRide: null,
    lobby: null,
    checked: false,
  });

  useEffect(() => {
    if (!customerId) {
      setContext({ customerId: null, privateRide: null, lobby: null, checked: true });
      return;
    }
    let active = true;
    setContext({ customerId, privateRide: null, lobby: null, checked: false });

    const check = async () => {
      const result = await getActiveRideContext(customerId);
      if (!active) return;
      setContext({ customerId, ...result, checked: true });
    };

    check();
    const interval = setInterval(check, pollMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [customerId, pollMs]);

  if (!customerId) return { privateRide: null, lobby: null, checked: true };
  if (context.customerId !== customerId) return { privateRide: null, lobby: null, checked: false };
  return context;
}
