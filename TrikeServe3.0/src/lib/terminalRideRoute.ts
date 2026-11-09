export type TerminalRideRoutePoint = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

function distanceMeters(a: TerminalRideRoutePoint, b: TerminalRideRoutePoint): number {
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function cumulativeDistances(path: TerminalRideRoutePoint[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < path.length; index++) {
    cumulative.push(cumulative[index - 1] + distanceMeters(path[index - 1], path[index]));
  }
  return cumulative;
}

function interpolate(a: TerminalRideRoutePoint, b: TerminalRideRoutePoint, fraction: number): TerminalRideRoutePoint {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction,
  };
}

function projectOntoPath(
  point: TerminalRideRoutePoint,
  path: TerminalRideRoutePoint[],
  cumulative: number[],
): { point: TerminalRideRoutePoint; distanceAlong: number; distanceFromPath: number } | null {
  if (path.length < 2) return null;
  const longitudeScale = Math.cos(toRadians(point.lat));
  let closest: { point: TerminalRideRoutePoint; distanceAlong: number; distanceFromPath: number } | null = null;

  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    const dx = (end.lng - start.lng) * longitudeScale;
    const dy = end.lat - start.lat;
    const px = (point.lng - start.lng) * longitudeScale;
    const py = point.lat - start.lat;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
      : 0;
    const projected = interpolate(start, end, fraction);
    const distanceFromPath = distanceMeters(point, projected);
    if (closest && distanceFromPath >= closest.distanceFromPath) continue;
    closest = {
      point: projected,
      distanceAlong: cumulative[index - 1] + distanceMeters(start, projected),
      distanceFromPath,
    };
  }

  return closest;
}

function pointAtDistance(
  path: TerminalRideRoutePoint[],
  cumulative: number[],
  distance: number,
): TerminalRideRoutePoint {
  if (distance <= 0) return path[0];
  const lastIndex = path.length - 1;
  if (distance >= cumulative[lastIndex]) return path[lastIndex];
  for (let index = 1; index < path.length; index++) {
    if (distance > cumulative[index]) continue;
    const segmentLength = cumulative[index] - cumulative[index - 1];
    const fraction = segmentLength > 0 ? (distance - cumulative[index - 1]) / segmentLength : 0;
    return interpolate(path[index - 1], path[index], fraction);
  }
  return path[lastIndex];
}

function slicePath(
  path: TerminalRideRoutePoint[],
  cumulative: number[],
  startDistance: number,
  endDistance: number,
): TerminalRideRoutePoint[] {
  const total = cumulative[cumulative.length - 1];
  const start = Math.max(0, Math.min(total, startDistance));
  const end = Math.max(0, Math.min(total, endDistance));
  if (end < start) return slicePath(path, cumulative, end, start).reverse();

  const result = [pointAtDistance(path, cumulative, start)];
  for (let index = 1; index < path.length - 1; index++) {
    if (cumulative[index] > start && cumulative[index] < end) result.push(path[index]);
  }
  const endpoint = pointAtDistance(path, cumulative, end);
  if (distanceMeters(result[result.length - 1], endpoint) > 1) result.push(endpoint);
  return result;
}

/** Select the portion of the saved road between the terminal and drop-off. */
function buildTerminalRouteSegment(
  terminal: TerminalRideRoutePoint | null | undefined,
  dropoff: TerminalRideRoutePoint | null | undefined,
  selectedRoute: TerminalRideRoutePoint[] | null | undefined,
): TerminalRideRoutePoint[] {
  if (!terminal || !dropoff || !selectedRoute || selectedRoute.length < 2) return [];

  const buildDirection = (path: TerminalRideRoutePoint[]) => {
    const cumulative = cumulativeDistances(path);
    const totalDistance = cumulative[cumulative.length - 1];
    const start = projectOntoPath(terminal, path, cumulative);
    const end = projectOntoPath(dropoff, path, cumulative);
    if (!start || !end) return null;

    const travelDistance = end.distanceAlong >= start.distanceAlong
      ? end.distanceAlong - start.distanceAlong
      : (totalDistance - start.distanceAlong) + (totalDistance - end.distanceAlong);
    const routeSegment = end.distanceAlong >= start.distanceAlong
      ? slicePath(path, cumulative, start.distanceAlong, end.distanceAlong)
      : [
          ...slicePath(path, cumulative, start.distanceAlong, totalDistance),
          ...slicePath(path, cumulative, end.distanceAlong, totalDistance).reverse().slice(1),
        ];
    return { travelDistance, routeSegment };
  };

  const forward = buildDirection(selectedRoute);
  const reverse = buildDirection([...selectedRoute].reverse());
  const chosen = !forward
    ? reverse
    : !reverse || forward.travelDistance <= reverse.travelDistance
      ? forward
      : reverse;
  if (!chosen?.routeSegment.length) return [];

  return chosen.routeSegment.filter((point, index, points) =>
    index === 0 || distanceMeters(points[index - 1], point) > 1,
  );
}

type RoadRouteResolver = (
  origin: TerminalRideRoutePoint,
  destination: TerminalRideRoutePoint,
) => Promise<TerminalRideRoutePoint[]>;

/**
 * Follow the saved terminal road, using road directions to enter it and to
 * reach the actual drop-off. Keep the legs separate so a missing connector
 * never becomes a straight line across buildings or hides the saved route.
 */
export async function getTerminalRideRoutePaths(
  terminal: TerminalRideRoutePoint | null | undefined,
  dropoff: TerminalRideRoutePoint | null | undefined,
  selectedRoute: TerminalRideRoutePoint[] | null | undefined,
  resolveRoadRoute: RoadRouteResolver,
): Promise<TerminalRideRoutePoint[][]> {
  if (!terminal || !dropoff) return [];

  const roadLeg = async (origin: TerminalRideRoutePoint, destination: TerminalRideRoutePoint) => {
    if (distanceMeters(origin, destination) <= 1) return [];
    try {
      const path = await resolveRoadRoute(origin, destination);
      return path.length > 1 ? path : [];
    } catch {
      return [];
    }
  };

  const savedRoad = buildTerminalRouteSegment(terminal, dropoff, selectedRoute);
  if (savedRoad.length === 0) {
    const path = await roadLeg(terminal, dropoff);
    return path.length > 1 ? [path] : [];
  }

  const [toSavedRoad, toDropoff] = await Promise.all([
    roadLeg(terminal, savedRoad[0]),
    roadLeg(savedRoad[savedRoad.length - 1], dropoff),
  ]);
  return [toSavedRoad, savedRoad, toDropoff].filter(path => path.length > 1);
}
