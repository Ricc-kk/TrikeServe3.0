/**
 * A terminal's plotted roads.
 *
 * `terminals.routes` is jsonb (ADD_TERMINAL_ROUTES.sql): an array of
 * `{ id, name, points, buffer_m, enabled }`. A TODA commonly runs more than one
 * road — a main road and the lanes either side of it — and each needs its own
 * corridor width and its own line on the map.
 *
 * Nothing here talks to Supabase. These are the pure functions that read, shape
 * and measure that column, kept separate so both the Route tool and the
 * terminal editor can use them without either one owning the format.
 */

import type { LatLngPoint } from "./supabase";
import { DEFAULT_ROAD_WIDTH_M } from "./supabase";

/** A new route starts at the same corridor the single-road editor defaulted to. */
export const DEFAULT_ROUTE_BUFFER_M = DEFAULT_ROAD_WIDTH_M;
export const MIN_ROUTE_BUFFER_M = 20;
export const MAX_ROUTE_BUFFER_M = 2000;

export type TerminalRoute = {
  /** Stable per route, so a draft can be matched back to what was loaded. */
  id: string;
  name: string;
  /** The plotted waypoints, in order. May be empty while a route is being drawn. */
  points: LatLngPoint[];
  /** The route's own corridor width in metres; each side gets half of it. */
  buffer_m: number;
  /** false keeps the route saved but stops the drop-off check using it. */
  enabled: boolean;
};

/**
 * Every road of a terminal is drawn in the terminal's own colour
 * (`terminals.route_color`).
 *
 * There is deliberately no per-route colour. That column is how a terminal is
 * identified on every other map in the app — the queue, the drop-off screen — and
 * a terminal whose second road came out a different colour on the one screen
 * where roads are drawn is a terminal that now reads as two.
 */

function toPoints(raw: unknown): LatLngPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLngPoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { lat, lng } = entry as { lat?: unknown; lng?: unknown };
    const la = Number(lat);
    const ln = Number(lng);
    // A point that is not a coordinate would break the polyline and, worse, the
    // corridor maths downstream — so it is dropped here rather than guarded for
    // at every read.
    if (Number.isFinite(la) && Number.isFinite(ln)) out.push({ lat: la, lng: ln });
  }
  return out;
}

function toBuffer(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ROUTE_BUFFER_M;
  return Math.min(MAX_ROUTE_BUFFER_M, Math.max(MIN_ROUTE_BUFFER_M, Math.round(n)));
}

/**
 * Read `terminals.routes` into routes, whatever shape it arrives in.
 *
 * jsonb normally comes back as an array, but the column is also written as a
 * JSON string by older code paths, and a hand-edited row can hold anything at
 * all. Every failure here returns an empty list rather than throwing: a terminal
 * with an unreadable `routes` value should read as "no routes yet", not as a
 * page that will not load.
 */
export function normalizeTerminalRoutes(raw: unknown): TerminalRoute[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  const out: TerminalRoute[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const r = entry as Partial<TerminalRoute>;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `r_${index}`,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : `Route ${index + 1}`,
      points: toPoints(r.points),
      buffer_m: toBuffer(r.buffer_m),
      enabled: r.enabled !== false,
    });
  });
  return out;
}

/**
 * A terminal whose only plotted road is the legacy `boundary_polygon`.
 *
 * The migration backfills those into `routes`, but only where it has been run
 * against that row, so the Route tool reconstructs the same single route rather
 * than telling an admin their terminal has no road at all. Saving writes it
 * back in the new shape.
 */
export function legacyRouteFromBoundary(
  boundaryPolygon: unknown,
  roadWidth: unknown,
): TerminalRoute[] {
  const points = toPoints(boundaryPolygon);
  if (points.length < 2) return [];
  return [
    {
      id: "r_legacy",
      name: "Main route",
      points,
      buffer_m: toBuffer(roadWidth),
      enabled: true,
    },
  ];
}

/**
 * What `boundary_polygon` and `road_width_m` must hold so the single-road gate
 * keeps answering correctly.
 *
 * The migration leaves those columns in step with the FIRST route, because the
 * drop-off and delivery checks still read them rather than `routes`.
 *
 * Returns no keys at all for a first route with nothing plotted. That is not
 * tidiness: writing null would delete a road the admin is in the middle of
 * redrawing, and a half-drawn route is the exact state a plotting tool spends
 * most of its time in.
 */
export function mirrorFirstRoute(routes: TerminalRoute[]): {
  boundary_polygon?: LatLngPoint[];
  road_width_m?: number;
} {
  const first = routes[0];
  if (!first || first.points.length < 2) return {};
  return { boundary_polygon: first.points, road_width_m: first.buffer_m };
}

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function segmentMeters(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How long a plotted route is, in metres.
 *
 * The sum of its segments rather than the straight line from first point to
 * last: a road is what it is made of, and a route that doubles back has to say
 * so. Off by the odd percent against a real odometer, which is fine for an
 * estimate shown beside the waypoint count.
 */
export function routeDistanceMeters(points: LatLngPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += segmentMeters(points[i - 1], points[i]);
  }
  return total;
}

/** A distance in metres, written the way a person would say it. */
export function formatRouteDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/** Ids have to survive a JSON round trip and never collide within a terminal. */
export function newRouteId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Whether two route lists would serialise the same, for the unsaved-changes check. */
export function routesEqual(a: TerminalRoute[], b: TerminalRoute[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((route, i) => {
    const other = b[i];
    if (!other) return false;
    return (
      route.id === other.id &&
      route.name === other.name &&
      route.buffer_m === other.buffer_m &&
      route.enabled === other.enabled &&
      route.points.length === other.points.length &&
      route.points.every(
        (p, n) =>
          Math.abs(p.lat - other.points[n].lat) < 1e-9 &&
          Math.abs(p.lng - other.points[n].lng) < 1e-9,
      )
    );
  });
}