/**
 * Distance and "near me" ranking.
 *
 * The restaurants table had no coordinates at all until
 * ADD_RESTAURANT_CUISINE_AND_LOCATION.sql, so every "distance to you" surface
 * starts here. One implementation is shared by the customer home feed, the food
 * list and the restaurant detail page so a shop never reports three different
 * distances.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  if (!hasCoords(a) || !hasCoords(b)) return Number.NaN;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Guards against `{lat: 0, lng: 0}`, which is a real place and never a shop. */
export function hasCoords(p: Partial<LatLng> | null | undefined): p is LatLng {
  if (!p) return false;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

/**
 * Human distance, the way a delivery app writes it: "450 m", "1.2 km", "7 km".
 * Returns null when there is nothing to measure, so callers can render
 * "Distance unavailable" instead of "NaN km".
 */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres == null || !Number.isFinite(metres) || metres < 0) return null;
  if (metres < 1000) return `${Math.max(5, Math.round(metres / 5) * 5)} m`;
  const km = metres / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Walking-ish estimate, used where a number of minutes reads better than km. */
export function estimateMinutes(metres: number): number {
  // ~300 m/min covers a tricycle at street pace in dense Metro Manila traffic.
  return Math.max(1, Math.round(metres / 300));
}

/** Anything without coordinates ranks behind everything that has them. */
export type Rankable = {
  rating: number;
  isOpen?: boolean;
  coords?: LatLng | null;
};

const NEAR_RADIUS_M = 5_000;

/**
 * Orders restaurants for a "recommended near you" feed.
 *
 * Blend rather than a hard sort by one field: distance alone buries a 4.9★ shop
 * two kilometres away behind a 4.2★ one next door, and rating alone buries a
 * good shop behind a great one across town. Unpinned shops still appear, last,
 * so a shop that has not pinned itself is never silently dropped.
 */
export function rankRestaurants<T extends Rankable>(
  list: T[],
  origin: LatLng | null,
): T[] {
  const scored = list.map((item) => {
    const metres = origin && hasCoords(item.coords)
      ? haversineMetres(origin, item.coords as LatLng)
      : null;

    if (metres == null) {
      return { item, metres: null, score: -1 };
    }

    // Rating contributes 0-40, proximity 0-60. Closed shops take a penalty so
    // they sink but do not disappear.
    const ratingScore = (Math.max(0, Math.min(5, item.rating)) / 5) * 40;
    const proximityScore = 60 * Math.max(0, 1 - metres / NEAR_RADIUS_M);
    const openPenalty = item.isOpen === false ? 25 : 0;

    return { item, metres, score: ratingScore + proximityScore - openPenalty };
  });

  scored.sort((a, b) => {
    if (a.score === -1 && b.score === -1) return b.item.rating - a.item.rating;
    if (a.score === -1) return 1;
    if (b.score === -1) return -1;
    return b.score - a.score;
  });

  return scored.map((s) => s.item);
}

/** True when nothing nearby had coordinates, so the UI can explain the fallback. */
export function isEmptyRadius(
  list: { coords?: LatLng | null }[],
  origin: LatLng | null,
): boolean {
  if (!origin) return true;
  return !list.some((item) => {
    if (!hasCoords(item.coords)) return false;
    const m = haversineMetres(origin, item.coords as LatLng);
    return Number.isFinite(m) && m <= NEAR_RADIUS_M;
  });
}