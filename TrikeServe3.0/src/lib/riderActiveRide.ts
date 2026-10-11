import { supabase } from "./supabase";

/**
 * The rider's pointer to the ride they are on.
 *
 * Both apps used to share one key, `trikeserve_active_ride`. On a device where
 * the two roles are tried in turn the customer's write replaced the driver's,
 * and the customer app removes that key when its own ride ends -- so a driver
 * whose ride was still running was left with no active ride at all. The
 * customer's copy is also a different shape (no `driverId`) and never satisfied
 * the driver's status check, so it was then cleared as invalid. A separate key
 * stops the two from ever standing on each other.
 */
export const RIDER_ACTIVE_RIDE_KEY = "trikeserve_active_ride_rider";

/** The key the customer app uses; read only to adopt a legacy driver record. */
const CUSTOMER_KEY = "trikeserve_active_ride";

/** Statuses that mean the driver has a ride in hand. */
export const RIDER_ACTIVE_STATUSES = ["accepted", "on-the-way", "arrived", "in-progress", "driver_found", "picked-up"];

export function isRiderRideActive(status: unknown): boolean {
  return typeof status === "string" && RIDER_ACTIVE_STATUSES.includes(status);
}

/**
 * Read the rider's saved ride.
 *
 * Adopts a legacy record from the shared key only when it is genuinely the
 * rider's -- it carries a `driverId`. A customer's record is left untouched for
 * the customer app, which still reads that key.
 */
export function readRiderActiveRide(): any | null {
  try {
    const raw = localStorage.getItem(RIDER_ACTIVE_RIDE_KEY);
    if (raw) return JSON.parse(raw);

    const legacy = localStorage.getItem(CUSTOMER_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed?.driverId) {
        localStorage.setItem(RIDER_ACTIVE_RIDE_KEY, legacy);
        localStorage.removeItem(CUSTOMER_KEY);
        return parsed;
      }
    }
  } catch {
    // Unreadable storage counts as "no saved ride"; the database lookup below is
    // the authority anyway.
  }
  return null;
}

export function writeRiderActiveRide(ride: any) {
  try {
    localStorage.setItem(RIDER_ACTIVE_RIDE_KEY, JSON.stringify(ride));
  } catch {
    // Private mode or a full quota. The ride still works, it just will not resume.
  }
}

export function clearRiderActiveRide() {
  try {
    localStorage.removeItem(RIDER_ACTIVE_RIDE_KEY);
  } catch {
    // Nothing to do.
  }
}

/**
 * The ride this driver is actually on, read from the database.
 *
 * The saved copy in storage only exists on the device that accepted the ride, so
 * a driver opening the app elsewhere -- or after clearing site data -- saw no
 * active ride even though the trip was theirs. This rebuilds it from the two
 * tables that can hold a live ride: a shared-ride lobby they accepted, or a
 * private/delivery request assigned to them.
 */
export async function fetchRiderActiveRide(driverId: string): Promise<any | null> {
  // Shared-ride lobby: its status lives on the lobby row, not ride_requests.
  try {
    const { data: lobbies } = await supabase
      .from("shared_ride_lobbies")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", ["driver_found", "in_progress"])
      .order("updated_at", { ascending: false })
      .limit(1);
    const lobby = (lobbies || [])[0];
    if (lobby) return mapLobbyToRiderRide(lobby);
  } catch (e) {
    console.warn("[riderActiveRide] Could not read lobby ride:", e);
  }

  // Private / delivery request assigned to this driver.
  try {
    const { data: rides } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("accepted_driver_id", driverId)
      .in("status", ["accepted", "on-the-way", "arrived", "in-progress"])
      .order("updated_at", { ascending: false })
      .limit(1);
    const ride = (rides || [])[0];
    if (ride) return mapRideRequestToRiderRide(ride);
  } catch (e) {
    console.warn("[riderActiveRide] Could not read private ride:", e);
  }

  return null;
}

function mapLobbyToRiderRide(lobby: any) {
  const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
  const names = passengers.map((p: any) => p?.name).filter(Boolean);
  return {
    id: lobby.id,
    lobbyId: lobby.id,
    type: "shared" as const,
    customerName: names.length > 1 ? names.join(", ") : names[0] || "Customer",
    customerPhoto: "shared",
    pickup: lobby.pickup_location,
    dropoff: lobby.dropoff_location,
    pickupAddress: lobby.pickup_address,
    dropoffAddress: lobby.dropoff_address,
    pickupLat: lobby.pickup_lat ?? undefined,
    pickupLng: lobby.pickup_lng ?? undefined,
    dropoffLat: lobby.dropoff_lat ?? undefined,
    dropoffLng: lobby.dropoff_lng ?? undefined,
    payment: lobby.payment_method === "COD" ? "COD" : "PREPAID",
    amount: Number(lobby.price_per_seat || 0),
    passengers: passengers.length,
    maxPassengers: Number(lobby.max_seats || 3),
    customerId: lobby.customer_id,
    passengerDetails: passengers,
    status: "on-the-way",
    driverId: lobby.driver_id,
    driverName: lobby.driver_name,
    driverPlate: lobby.driver_plate,
    driverRating: lobby.driver_rating,
    eta: "5 mins",
  };
}

function mapRideRequestToRiderRide(ride: any) {
  const rawType = String(ride.ride_type || ride.type || "").toLowerCase();
  const type = rawType === "delivery" ? "delivery" : rawType === "shared" || rawType === "share" ? "shared" : "private";
  return {
    id: ride.id,
    type: type as "delivery" | "shared" | "private",
    // Deliberately generic; ActiveRide resolves the real name from the users
    // table when it is missing, exactly as it does for a freshly accepted ride.
    customerName: "Customer",
    customerPhoto: "",
    pickup: ride.pickup_location,
    dropoff: ride.dropoff_location,
    pickupAddress: ride.pickup_address,
    dropoffAddress: ride.dropoff_address,
    pickupLat: ride.pickup_lat ?? undefined,
    pickupLng: ride.pickup_lng ?? undefined,
    dropoffLat: ride.dropoff_lat ?? undefined,
    dropoffLng: ride.dropoff_lng ?? undefined,
    payment: ride.payment_method === "COD" ? "COD" : "PREPAID",
    amount: Number(ride.amount || 0),
    customerId: ride.customer_id,
    passengerDetails: [],
    orderId: ride.order_id || undefined,
    orderNumber: ride.order_number || undefined,
    status: "on-the-way",
    driverId: ride.accepted_driver_id,
    driverName: ride.driver_name,
    driverPlate: ride.driver_plate,
    driverRating: ride.driver_rating,
    eta: ride.eta || "5 mins",
  };
}
