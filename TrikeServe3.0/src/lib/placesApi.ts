export type PlaceResult = {
  name?: string;
  formatted_address?: string;
  place_id?: string;
  lat?: number;
  lng?: number;
  /** Text Search reports the place name and its street address separately;
   * autocomplete suggestions show the name as the primary line. */
  display_name?: string;
};

export type PlacesAutocompleteSuggestion = {
  place_id: string;
  displayName: string;
  secondaryText?: string;
  fullText?: string;
};

const PLACES_API_BASE_URL = "https://places.googleapis.com/v1";

export const createPlacesSessionToken = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const extractText = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.text === "string") return value.text;
  if (typeof value.longText === "string") return value.longText;
  if (typeof value.shortText === "string") return value.shortText;
  return "";
};

const extractLat = (location: any): number | undefined => {
  if (!location) return undefined;
  return location.latitude ?? location.lat ?? location.latLng?.latitude ?? location.latLng?.lat;
};

const extractLng = (location: any): number | undefined => {
  if (!location) return undefined;
  return location.longitude ?? location.lng ?? location.latLng?.longitude ?? location.latLng?.lng;
};

export async function autocompletePlacesNew(params: {
  input: string;
  apiKey: string;
  locationBias?: { lat: number; lng: number; radius?: number };
  restrictToCountry?: string;
  sessionToken?: string;
}): Promise<PlacesAutocompleteSuggestion[]> {
  const { input, apiKey, locationBias, restrictToCountry, sessionToken } = params;

  if (!input.trim()) return [];

  const requestBody: any = {
    input,
    languageCode: "en-US",
    includedPrimaryTypes: [],
  };

  if (locationBias) {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: locationBias.lat,
          longitude: locationBias.lng,
        },
        radius: locationBias.radius || 10000,
      },
    };
  }

  if (restrictToCountry) {
    requestBody.includedRegionCodes = [restrictToCountry.toLowerCase()];
  }

  if (sessionToken) {
    requestBody.sessionToken = sessionToken;
  }

  const response = await fetch(`${PLACES_API_BASE_URL}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Autocomplete request failed";
    throw new Error(message);
  }

  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

  return suggestions
    .map((suggestion: any) => {
      const prediction = suggestion?.placePrediction;
      if (!prediction) return null;

      const placeId = prediction.placeId || prediction.place_id || prediction.place;
      if (!placeId) return null;

      const displayName =
        extractText(prediction.text) ||
        extractText(prediction.structuredFormat?.mainText) ||
        extractText(prediction.structured_formatting?.main_text) ||
        prediction.description ||
        "";

      const secondaryText =
        extractText(prediction.structuredFormat?.secondaryText) ||
        extractText(prediction.structured_formatting?.secondary_text) ||
        prediction.description ||
        "";

      return {
        place_id: placeId,
        displayName,
        secondaryText,
        fullText: prediction.description || secondaryText || displayName,
      } satisfies PlacesAutocompleteSuggestion;
    })
    .filter(Boolean) as PlacesAutocompleteSuggestion[];
}

export async function fetchPlaceDetailsNew(params: {
  placeId: string;
  apiKey: string;
  sessionToken?: string;
}): Promise<PlaceResult | null> {
  const { placeId, apiKey } = params;
  if (!placeId) return null;

  const response = await fetch(
    `${PLACES_API_BASE_URL}/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Place details request failed";
    throw new Error(message);
  }

  if (!data) return null;

  return {
    name: extractText(data.displayName) || data.name || undefined,
    formatted_address: data.formattedAddress || data.formatted_address || undefined,
    place_id: data.id || data.placeId || placeId,
    lat: extractLat(data.location),
    lng: extractLng(data.location),
  };
}

/**
 * Text Search (New) — like autocomplete, but every hit comes back with
 * coordinates. Autocomplete suggestions carry no location, so they cannot be
 * tested against a boundary polygon; this is what lets results be limited to a
 * terminal's plotted area.
 */
export async function searchPlacesText(params: {
  textQuery: string;
  apiKey: string;
  /** Bias results toward this point without excluding anything else. */
  bias?: { lat: number; lng: number };
  biasRadiusMeters?: number;
}): Promise<PlaceResult[]> {
  const { textQuery, apiKey, bias, biasRadiusMeters = 2000 } = params;

  if (!textQuery.trim()) return [];

  const body: any = {
    textQuery: textQuery.trim(),
    languageCode: "en-US",
    regionCode: "ph",
    pageSize: 10,
  };

  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: biasRadiusMeters,
      },
    };
  }

  // No session token here: Text Search rejects the autocomplete session token,
  // which is why this is a separate call from autocompletePlacesNew.

  const response = await fetch(`${PLACES_API_BASE_URL}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Text search request failed";
    throw new Error(message);
  }

  const places: any[] = Array.isArray(data?.places) ? data.places : [];

  return places
    .map((place) => {
      const lat = extractLat(place?.location);
      const lng = extractLng(place?.location);
      if (lat == null || lng == null) return null;

      const displayName = extractText(place.displayName);
      const formattedAddress = place.formattedAddress;

      return {
        name: displayName || undefined,
        formatted_address: formattedAddress || undefined,
        place_id: place.id || place.name,
        lat,
        lng,
        // Filled in by the caller when a suggestion row is rendered.
        display_name: displayName || formattedAddress || undefined,
      } as PlaceResult;
    })
    .filter(Boolean) as PlaceResult[];
}

export function isWithinCityOrArea(place: any, city: string) {
  const target = city.toLowerCase();
  const formatted = String(place?.formattedAddress || place?.formatted_address || place?.formatted_address || "").toLowerCase();
  const display = String(place?.displayName?.text || place?.displayName || place?.name || "").toLowerCase();
  const addressComponents = Array.isArray(place?.addressComponents)
    ? place.addressComponents
    : Array.isArray(place?.address_components)
      ? place.address_components
      : [];

  return (
    formatted.includes(target) ||
    display.includes(target) ||
    addressComponents.some((component: any) => {
      const longText = String(component?.longText || component?.long_name || "").toLowerCase();
      const shortText = String(component?.shortText || component?.short_name || "").toLowerCase();
      return longText === target || shortText === target || longText.includes(target) || shortText.includes(target);
    })
  );
}

