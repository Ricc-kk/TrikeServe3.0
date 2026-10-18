import { haversineDistanceMeters, type LatLngPoint } from "./supabase";

/**
 * Ride rates configured by an admin, stored as JSON under
 * `admin_settings.setting_key = 'rates'` (and mirrored to localStorage).
 *
 * Rides are priced as `baseFare + perKm × distance`. Delivery is flat and keeps
 * its own base fee. `sharedRide`/`privateRide` are legacy fixed fares, retained
 * so lobbies and bookings made before per-km pricing still resolve a price.
 */
export interface RideRates {
  /** Flat amount added to every ride, before the per-km charge. */
  baseFare: number;
  /** Charge per straight-line kilometre. */
  perKm: number;
  /** Flat delivery fee — delivery is not distance-based. */
  deliveryBaseFee: number;
  /** Legacy fixed shared fare, used only when a distance can't be computed. */
  sharedRide: number;
  /** Legacy fixed private fare, used only when a distance can't be computed. */
  privateRide: number;
}

export const DEFAULT_RATES: RideRates = {
  baseFare: 20,
  perKm: 10,
  deliveryBaseFee: 0,
  sharedRide: 15,
  privateRide: 50,
};

/**
 * Riders a terminal carries when it has no limit of its own.
 *
 * Lives here rather than on the admin screen because two screens read it: the
 * admin field that sets a terminal's limit, and the customer seat picker that
 * obeys it. When each had its own fallback they could disagree -- a terminal
 * showing "4" in the admin list and offering three seats to the customer.
 *
 * The database column defaults to the same number, so a terminal that has never
 * been edited still has a real seat count.
 */
export const DEFAULT_MAX_PASSENGERS = 4;

/** Numeric coercion that treats null/blank/missing as "use the fallback". */
function num(value: any, fallback: number): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Coerce a raw saved config into complete, numeric rates. */
export function normalizeRates(raw: any): RideRates {
  return {
    baseFare: num(raw?.baseFare, DEFAULT_RATES.baseFare),
    perKm: num(raw?.perKm, DEFAULT_RATES.perKm),
    deliveryBaseFee: num(raw?.deliveryBaseFee, DEFAULT_RATES.deliveryBaseFee),
    sharedRide: num(raw?.sharedRide, DEFAULT_RATES.sharedRide),
    privateRide: num(raw?.privateRide, DEFAULT_RATES.privateRide),
  };
}

/**
 * A terminal's own ride pricing.
 *
 * `base_fare` / `per_km` are added by ADD_TERMINAL_FARES.sql and price a shared
 * ride; `private_ride_fee` / `private_ride_fee_per_km` are added by
 * ADD_TERMINAL_PRIVATE_RIDE_FEE.sql and price a private one. Any field can be
 * null when the terminal has not set it, in which case the value it stands in
 * for applies.
 */
export interface TerminalFare {
  base_fare?: number | null;
  per_km?: number | null;
  private_ride_fee?: number | null;
  private_ride_fee_per_km?: number | null;
}

/**
 * Resolve a terminal's ride fare, falling back to the platform defaults for any
 * value the terminal has not set.
 */
export function terminalRates(terminal?: TerminalFare | null): RideRates {
  return {
    ...DEFAULT_RATES,
    baseFare: num(terminal?.base_fare, DEFAULT_RATES.baseFare),
    perKm: num(terminal?.per_km, DEFAULT_RATES.perKm),
  };
}

/**
 * A private ride's own base and per-km rate.
 *
 * A private ride books the whole vehicle, so a terminal can price it separately
 * from a shared seat. The fallback is the terminal's *shared* rate rather than
 * the platform default, and that is deliberate: before this existed, a private
 * ride was priced at exactly the shared base + per-km, so falling back to the
 * share rate keeps every terminal that has not been edited here charging
 * precisely what it charged before.
 *
 * `shared` is the already-resolved share rate to inherit from, so a caller that
 * has no terminal picked yet still gets the platform defaults rather than
 * treating "no terminal" as "private rides are free".
 */
export function privateRideRates(
  terminal?: TerminalFare | null,
  shared: Pick<RideRates, "baseFare" | "perKm"> = DEFAULT_RATES,
): { baseFare: number; perKm: number } {
  return {
    baseFare: num(terminal?.private_ride_fee, num(terminal?.base_fare, shared.baseFare)),
    perKm: num(terminal?.private_ride_fee_per_km, num(terminal?.per_km, shared.perKm)),
  };
}

/** Straight-line kilometres between two points, or null when either is missing. */
export function straightLineKm(
  a?: LatLngPoint | null,
  b?: LatLngPoint | null
): number | null {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  return haversineDistanceMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) / 1000;
}

/**
 * Ride fare = base fare + (rate per km × straight-line distance).
 *
 * Rounded UP to a whole peso. Every peso-per-km step lands on a fraction
 * (₱10/km over 1.37 km is ₱23.70), and a tricycle fare quoted in centavos
 * reads like a miscalculation rather than a price. Rounding up rather than to
 * nearest also keeps the driver whole — the fare they earn never lands a few
 * centavos short of the number quoted to the passenger.
 *
 * `distanceKm` is null when either coordinate is missing, so callers can fall
 * back to the legacy fixed fare instead of charging only the base.
 */
export function computeRideFare(
  rates: Pick<RideRates, "baseFare" | "perKm">,
  pickup?: LatLngPoint | null,
  dropoff?: LatLngPoint | null
): { total: number; distanceKm: number | null } {
  const distanceKm = straightLineKm(pickup, dropoff);
  if (distanceKm == null) return { total: rates.baseFare, distanceKm: null };

  const total = Math.ceil(rates.baseFare + rates.perKm * distanceKm);
  return { total, distanceKm };
}

/** Currency formatting used by the fare breakdown labels. */
export function formatPeso(amount: number): string {
  return `₱${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
