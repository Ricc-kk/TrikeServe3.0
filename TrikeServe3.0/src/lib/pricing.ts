import { haversineDistanceMeters, type LatLngPoint } from "./supabase";

/**
 * Ride rates configured by an admin, stored as JSON under
 * `admin_settings.setting_key = 'rates'` (and mirrored to localStorage).
 *
 * Rides are priced as `baseFare + perKm × distance beyond baseFareIncludedKm`. Delivery keeps
 * its own base fee. `sharedRide`/`privateRide` are legacy fixed fares, retained
 * so lobbies and bookings made before per-km pricing still resolve a price.
 */
export interface RideRates {
  /** Amount covering the initial included kilometres of a trip. */
  baseFare: number;
  /** Kilometres covered by the base fare before the per-km charge starts. */
  baseFareIncludedKm: number;
  /** Charge per straight-line kilometre after the included distance. */
  perKm: number;
  /** Platform fallback delivery base fee. Terminals may add a per-kilometre rate. */
  deliveryBaseFee: number;
  /** Legacy fixed shared fare, used only when a distance can't be computed. */
  sharedRide: number;
  /** Legacy fixed private fare, used only when a distance can't be computed. */
  privateRide: number;
}

export const DEFAULT_RATES: RideRates = {
  baseFare: 20,
  baseFareIncludedKm: 1,
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
    baseFareIncludedKm: num(raw?.baseFareIncludedKm, DEFAULT_RATES.baseFareIncludedKm),
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
  base_fare_included_km?: number | null;
  per_km?: number | null;
  private_ride_fee?: number | null;
  private_ride_fee_included_km?: number | null;
  private_ride_fee_per_km?: number | null;
  delivery_fee?: number | null;
  delivery_fee_included_km?: number | null;
  delivery_fee_per_km?: number | null;
}

/**
 * Resolve a terminal's ride fare, falling back to the platform defaults for any
 * value the terminal has not set.
 */
export function terminalRates(terminal?: TerminalFare | null): RideRates {
  return {
    ...DEFAULT_RATES,
    baseFare: num(terminal?.base_fare, DEFAULT_RATES.baseFare),
    baseFareIncludedKm: num(terminal?.base_fare_included_km, DEFAULT_RATES.baseFareIncludedKm),
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
  shared: Pick<RideRates, "baseFare" | "baseFareIncludedKm" | "perKm"> = DEFAULT_RATES,
): { baseFare: number; baseFareIncludedKm: number; perKm: number } {
  return {
    baseFare: num(terminal?.private_ride_fee, num(terminal?.base_fare, shared.baseFare)),
    baseFareIncludedKm: num(
      terminal?.private_ride_fee_included_km,
      num(terminal?.base_fare_included_km, shared.baseFareIncludedKm),
    ),
    perKm: num(terminal?.private_ride_fee_per_km, num(terminal?.per_km, shared.perKm)),
  };
}

/** Resolve a terminal delivery rate, falling back to the platform base fee. */
export function deliveryRates(
  terminal: TerminalFare | null | undefined,
  platformDeliveryBase = DEFAULT_RATES.deliveryBaseFee,
): { baseFare: number; baseFareIncludedKm: number; perKm: number } {
  return {
    baseFare: num(terminal?.delivery_fee, platformDeliveryBase),
    baseFareIncludedKm: num(terminal?.delivery_fee_included_km, DEFAULT_RATES.baseFareIncludedKm),
    perKm: num(terminal?.delivery_fee_per_km, 0),
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
 * Fare = base fare + the per-km rate for distance beyond the included kilometres.
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
  rates: Pick<RideRates, "baseFare" | "baseFareIncludedKm" | "perKm">,
  pickup?: LatLngPoint | null,
  dropoff?: LatLngPoint | null
): { total: number; distanceKm: number | null } {
  const distanceKm = straightLineKm(pickup, dropoff);
  const total = computeDistanceFare(rates, distanceKm);
  return { total, distanceKm };
}

/** Price any straight-line trip using the same included-distance rule. */
export function computeDistanceFare(
  rates: Pick<RideRates, "baseFare" | "baseFareIncludedKm" | "perKm">,
  distanceKm: number | null,
): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return rates.baseFare;
  const billableKm = Math.max(0, distanceKm - Math.max(0, rates.baseFareIncludedKm));
  return Math.ceil(rates.baseFare + rates.perKm * billableKm);
}

/**
 * Each shared passenger pays the full base fare plus the full per-km charge for
 * distance beyond the included kilometres. The passenger fare rounds up to a
 * whole peso, matching the other ride fare quotes.
 */
export function computeSharedRideFarePerPassenger(
  rates: Pick<RideRates, "baseFare" | "baseFareIncludedKm" | "perKm">,
  distanceKm: number | null,
): number {
  return computeDistanceFare(rates, distanceKm);
}

/**
 * Fill missing passenger fares from an older lobby row. Historically that row's
 * `price_per_seat` value was the whole lobby fare, so divide it across passengers
 * that do not yet have their own stored fare.
 */
export function backfillLegacySharedRidePassengerFares<T extends { fare?: unknown }>(
  passengers: ReadonlyArray<T>,
  legacyTripTotal = 0,
): Array<T & { fare: number }> {
  const hasFare = (passenger: T) => {
    if (passenger?.fare == null || passenger.fare === "") return false;
    const fare = Number(passenger.fare);
    return Number.isFinite(fare) && fare >= 0;
  };
  const hasAnyFare = passengers.some(hasFare);
  const missingCount = passengers.filter(passenger => !hasFare(passenger)).length;
  const total = Number(legacyTripTotal);
  const validTotal = Number.isFinite(total) && total >= 0 ? total : 0;
  const totalCents = Math.round(validTotal * 100);
  const baseShareCents = missingCount > 0 ? Math.floor(totalCents / missingCount) : 0;
  let remainingShareCents = missingCount > 0 ? totalCents - baseShareCents * missingCount : 0;

  return passengers.map(passenger => {
    if (hasFare(passenger)) return { ...passenger, fare: Number(passenger.fare) };

    // If this row already has individual fares, the old column is a per-seat
    // fallback. Otherwise it is the legacy trip total; split its cents evenly.
    let fare = validTotal;
    if (!hasAnyFare) {
      const shareCents = baseShareCents + (remainingShareCents > 0 ? 1 : 0);
      remainingShareCents = Math.max(0, remainingShareCents - 1);
      fare = shareCents / 100;
    }
    return { ...passenger, fare };
  });
}

/** Sum stored passenger fares, filling legacy passengers from their trip total. */
export function sumSharedRidePassengerFares(
  passengers: ReadonlyArray<{ fare?: unknown }>,
  legacyTripTotal = 0,
): number {
  return backfillLegacySharedRidePassengerFares(passengers, legacyTripTotal)
    .reduce((total, passenger) => total + passenger.fare, 0);
}

/** Currency formatting used by the fare breakdown labels. */
export function formatPeso(amount: number): string {
  return `₱${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
