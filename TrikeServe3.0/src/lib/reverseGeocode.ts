/**
 * Turning a position into an address a person can recognise.
 *
 * Three screens needed this — the customer's map picker, the business map
 * picker, and the "Deliver to" line, which has to name somewhere rather than
 * print coordinates — and each had its own copy of the same fetch and the same
 * street-number-plus-road name building. They drifted, and a fourth copy was
 * about to be written.
 *
 * Returns null rather than throwing when the lookup fails. A missing API key, a
 * quota error and a position in the middle of a field all mean the same thing to
 * every caller: show the coordinates and let the customer refine it.
 */

export type ResolvedPlace = {
  /** Short form for a one-line label, e.g. "123 Mabini St". */
  name: string;
  /** Full formatted address. */
  full: string;
};

const GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

function componentValue(components: any, type: string): string | null {
  const match = components?.find((c: any) => Array.isArray(c?.types) && c.types.includes(type));
  return match?.long_name ?? null;
}

/**
 * Shortens a formatted address to something that fits on one line.
 *
 * Street number and road is what people use to say "that one", so it wins.
 * Otherwise the neighbourhood, then the locality, then the first comma-separated
 * chunk — never the empty string, since an empty name renders as a blank header.
 */
function shortNameFor(full: string, components: any): string {
  const street = [componentValue(components, "street_number"), componentValue(components, "route")]
    .filter(Boolean)
    .join(" ");
  const fallback =
    componentValue(components, "neighborhood") ||
    componentValue(components, "locality") ||
    full.split(",")[0];
  return street || fallback || full;
}

export async function reverseGeocodePosition(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  // No key is a configuration state, not a failure worth a console warning on
  // every screen that asks where the customer is.
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${GOOGLE_GEOCODE_ENDPOINT}?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data?.status !== "OK") return null;

    const result = data?.results?.[0];
    const full = result?.formatted_address;
    if (!full) return null;

    return {
      name: shortNameFor(full, result.address_components),
      full,
    };
  } catch (error) {
    console.warn("[reverseGeocode] Could not resolve position:", error);
    return null;
  }
}

/** Coordinates, rounded, for when there is no address to show. */
export function describeCoordinates(lat: number, lng: number): string {
  return `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}