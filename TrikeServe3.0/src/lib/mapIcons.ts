import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_PICKUP_COLOR } from './rideMapColors';
import tricycleIcon from '../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png';

/** Build the shared tricycle marker, anchored at the visible wheel baseline. */
export function createTricycleMarkerIcon(size = 44): google.maps.Icon | undefined {
  const maps = typeof window !== "undefined" ? (window as any)?.google?.maps : undefined;
  if (!maps?.Size || !maps?.Point) return undefined;

  return {
    url: tricycleIcon,
    scaledSize: new maps.Size(size, size),
    // Its ground line is near 91% of the transparent square asset; anchoring at
    // the center made the wheels hang below the driver's actual road position.
    anchor: new maps.Point(size / 2, Math.round(size * 0.91)),
  };
}

/** Build the shared restaurant pin used by every map that shows a shop. */
export function createRestaurantMarkerIcon(size = 40): google.maps.Icon | undefined {
  const maps = typeof window !== "undefined" ? (window as any)?.google?.maps : undefined;
  if (!maps?.Size || !maps?.Point) return undefined;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z" fill="${RIDE_MAP_PICKUP_COLOR}" stroke="white" stroke-width="1"/><path d="M9 5.8v3.8m-1.6-3.8v2.7c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6V5.8M9 10v5.2m5.2-9.4v9.4m0-9.4c-1.2.4-1.9 1.5-1.9 2.7v2.2h1.9" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
}

/** Build the shared location pin used for every ride or delivery drop-off. */
export function createDropoffMarkerIcon({
  size = 40,
  color = RIDE_MAP_DROPOFF_COLOR,
  stopNumber,
}: {
  size?: number;
  color?: string;
  stopNumber?: number;
} = {}): google.maps.Icon | undefined {
  const maps = typeof window !== "undefined" ? (window as any)?.google?.maps : undefined;
  if (!maps?.Size || !maps?.Point) return undefined;

  const centerMark = stopNumber == null
    ? '<circle cx="12" cy="9" r="2.3" fill="#FFFFFF" stroke="none"/>'
    : `<text x="12" y="9.2" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" stroke="none" font-size="8.5" font-family="Arial, sans-serif" font-weight="700">${stopNumber}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z" fill="${color}" stroke="#FFFFFF" stroke-width="1"/>${centerMark}</svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
}

/** Kept as a compatibility alias for existing delivery map callers. */
export function createCustomerMarkerIcon(size = 40): google.maps.Icon | undefined {
  return createDropoffMarkerIcon({ size });
}
