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
  deliveryBaseFee: 30,
  sharedRide: 15,
  privateRide: 50,
};

/** Coerce a raw saved config into complete, numeric rates. */
export function normalizeRates(raw: any): RideRates {
  const num = (value: any, fallback: number) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

  return {
    baseFare: num(raw?.baseFare, DEFAULT_RATES.baseFare),
    perKm: num(raw?.perKm, DEFAULT_RATES.perKm),
    deliveryBaseFee: num(raw?.deliveryBaseFee, DEFAULT_RATES.deliveryBaseFee),
    sharedRide: num(raw?.sharedRide, DEFAULT_RATES.sharedRide),
    privateRide: num(raw?.privateRide, DEFAULT_RATES.privateRide),
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

  const total = Math.round((rates.baseFare + rates.perKm * distanceKm) * 100) / 100;
  return { total, distanceKm };
}

/** Currency formatting used by the fare breakdown labels. */
export function formatPeso(amount: number): string {
  return `₱${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
