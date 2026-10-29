export type RoadRouteCoordinate = { lat: number; lng: number };

export type RoadRouteResult = {
  path: RoadRouteCoordinate[];
  durationText?: string;
};

function decodePolyline(encoded: string): RoadRouteCoordinate[] {
  const path: RoadRouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return path;
}

function pathFromDirectionsRoute(route: any): RoadRouteCoordinate[] {
  const overview = route?.overview_path;
  if (Array.isArray(overview) && overview.length > 1) {
    return overview.map((point: any) => ({ lat: point.lat(), lng: point.lng() }));
  }

  const path: RoadRouteCoordinate[] = [];
  for (const step of route?.legs?.flatMap((leg: any) => leg?.steps ?? []) ?? []) {
    const encoded = step?.polyline?.points;
    if (!encoded) continue;
    const decoded = decodePolyline(encoded);
    path.push(...(path.length ? decoded.slice(1) : decoded));
  }
  return path;
}

/**
 * Get the shortest available road route while avoiding travel along highways.
 * The DirectionsService fallback also avoids highways when Routes API access
 * is unavailable.
 */
export async function getShortestAvoidHighwaysRoadRouteDetails(
  origin: RoadRouteCoordinate,
  destination: RoadRouteCoordinate,
  apiKey: string,
): Promise<RoadRouteResult> {
  if (apiKey) {
    try {
      const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          travelMode: 'DRIVE',
          routePreference: 'SHORTER_DISTANCE',
          routeModifiers: { avoidHighways: true },
          computeAlternativeRoutes: true,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        const routes = Array.isArray(data?.routes) ? data.routes : [];
        const shortestRoute = routes
          .filter((route: any) => route?.polyline?.encodedPolyline)
          .sort((a: any, b: any) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))[0];
        const encoded = shortestRoute?.polyline?.encodedPolyline;
        const path = encoded ? decodePolyline(encoded) : [];
        if (path.length > 1) {
          const durationSeconds = Number.parseFloat(String(shortestRoute?.duration ?? '').replace(/s$/, ''));
          const durationMinutes = Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds / 60)) : null;
          return {
            path,
            durationText: durationMinutes == null
              ? undefined
              : `${durationMinutes} min${durationMinutes === 1 ? '' : 's'}`,
          };
        }
      } else {
        console.warn('[RoadRouting] Shortest route request failed:', data?.error?.status || response.status);
      }
    } catch (error) {
      console.warn('[RoadRouting] Shortest route request failed:', error);
    }
  }

  const maps = (window as any).google?.maps;
  if (!maps?.DirectionsService) return { path: [] };

  try {
    const { result, status } = await new Promise<{ result: any; status: string }>(resolve => {
      const service = new maps.DirectionsService();
      service.route({
        origin: new maps.LatLng(origin.lat, origin.lng),
        destination: new maps.LatLng(destination.lat, destination.lng),
        travelMode: maps.TravelMode.DRIVING,
        avoidHighways: true,
      }, (directionsResult: any, directionsStatus: string) => {
        resolve({ result: directionsResult, status: directionsStatus });
      });
    });
    const route = status === 'OK' ? result?.routes?.[0] : null;
    return route
      ? { path: pathFromDirectionsRoute(route), durationText: route.legs?.[0]?.duration?.text }
      : { path: [] };
  } catch (error) {
    console.warn('[RoadRouting] Directions fallback failed:', error);
    return { path: [] };
  }
}

export async function getShortestAvoidHighwaysRoadRoute(
  origin: RoadRouteCoordinate,
  destination: RoadRouteCoordinate,
  apiKey: string,
): Promise<RoadRouteCoordinate[]> {
  const route = await getShortestAvoidHighwaysRoadRouteDetails(origin, destination, apiKey);
  return route.path;
}
