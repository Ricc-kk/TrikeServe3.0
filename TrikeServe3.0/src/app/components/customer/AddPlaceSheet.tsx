import { useCallback, useEffect, useState } from "react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import { Check, MapPin, Pencil, Search, X } from "lucide-react";

import useMapLoader from "@/lib/mapLoader";
import {
  autocompletePlacesNew,
  createPlacesSessionToken,
  fetchPlaceDetailsNew,
  searchPlacesText,
  type PlacesAutocompleteSuggestion,
} from "@/lib/placesApi";
import type { LatLng } from "@/lib/distance";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/** Valenzuela City, used when we have nothing better to centre on. */
const FALLBACK_CENTER: LatLng = { lat: 14.7294, lng: 120.9349 };

type Draft = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type AddPlaceSheetProps = {
  onClose: () => void;
  onSave: (input: {
    label: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  }) => Promise<void> | void;
  /**
   * Where the pin map should open. The caller passes the customer's current
   * delivery address, so the map starts on somewhere they already recognise
   * rather than on an arbitrary city centre.
   */
  initialCenter?: LatLng | null;
};

const EMPTY: Draft = { address: "", latitude: null, longitude: null };

/**
 * Add a named place, by searching or by dropping a pin.
 *
 * Both routes end the same way — a name the customer chose — because "Home" or
 * "Mama's place" is far easier to recognise later than a coordinate or a long
 * address string.
 *
 * The map is deliberately not conditional on a pin already existing. It used to
 * render only once `draft` held coordinates, which meant a fresh sheet showed a
 * dead grey panel reading "Tap the map to place your pin" over something that
 * was not a map — and since tapping the map was the only way to get those
 * coordinates, the pin could never be placed at all. The map now renders as
 * soon as the Maps script is ready; the marker is the conditional part.
 */
export default function AddPlaceSheet({ onClose, onSave, initialCenter }: AddPlaceSheetProps) {
  const [mode, setMode] = useState<"search" | "pin">("search");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlacesAutocompleteSuggestion[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [label, setLabel] = useState("");
  const [labelFocused, setLabelFocused] = useState(false);
  const [center, setCenter] = useState<LatLng>(initialCenter ?? FALLBACK_CENTER);
  const [sessionToken, setSessionToken] = useState(() => createPlacesSessionToken());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isLoaded: isMapsLoaded, loadError, blocked, apiKeyPresent } = useMapLoader();

  /**
   * A map we can never draw is worse than an honest message, so the three ways
   * it can fail get folded into one reason not to render the canvas.
   */
  const mapUnavailable = !apiKeyPresent || Boolean(loadError) || Boolean(blocked);

  useEffect(() => {
    const term = query.trim();
    if (!term || !GOOGLE_MAPS_API_KEY) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    // Text Search rather than Autocomplete here: the customer is choosing a
    // fixed address they will be given a pin for, and only a geocoded result
    // carries coordinates we can actually save.
    const timer = setTimeout(async () => {
      try {
        const hits = await searchPlacesText({
          textQuery: term,
          apiKey: GOOGLE_MAPS_API_KEY,
          bias: center,
          biasRadiusMeters: 5000,
        });
        if (cancelled) return;
        setSuggestions(
          hits.slice(0, 6).map((hit) => ({
            place_id: hit.place_id || '',
            displayName: hit.name || hit.formatted_address || 'Place',
            secondaryText: hit.formatted_address,
            fullText: hit.formatted_address,
          })),
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, center]);

  /**
   * Open on where the customer is standing right now.
   *
   * Their own location leads; the saved delivery address is only the fallback,
   * because a saved address is where they *were* — dropping a pin for a new
   * place nearly always means somewhere other than last time's address. A
   * refused or unavailable geolocation is not an error worth surfacing: the
   * saved address, then the city centre, are both usable places to start.
   */
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      if (initialCenter) setCenter(initialCenter);
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        if (!cancelled && initialCenter) setCenter(initialCenter);
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
    return () => {
      cancelled = true;
    };
  }, [initialCenter]);

  /**
   * Pull the street out of a formatted address.
   *
   * "4397 L. Bernardino Street, Gen T Deleon, Valenzuela City" is unreadable in
   * a list; the street on its own is what a person recognises. Falls back to
   * the first comma-separated segment when the address has no house number.
   */
  const streetOf = useCallback((formatted: string): string => {
    const first = formatted.split(",")[0]?.trim() ?? "";
    if (!first) return formatted;
    // "4397 L. Bernardino Street" -> "L. Bernardino Street": keep the number
    // out of the label so long addresses stay scannable.
    const withoutNumber = first.replace(/^\d+[A-Za-z]?\s*/, "").trim();
    return withoutNumber || first;
  }, []);

  /** The street line for the current pin, or null when there is no pin yet. */
  const pinStreet = draft.address ? streetOf(draft.address) : null;

  /** Everything after the street segment, for the second line of a result. */
  const restOfAddress = useCallback((formatted: string): string => {
    return formatted.split(",").slice(1).join(",").trim();
  }, []);

  /**
   * Turn a dropped pin into something readable in the saved-places list.
   *
   * Coordinates alone are enough to save, so a failure here degrades to the
   * coordinate readout rather than blocking the customer.
   */
  const reverseGeocode = useCallback((coords: LatLng) => {
    const maps = (window as any)?.google?.maps;
    if (!maps?.Geocoder) return;

    try {
      new maps.Geocoder().geocode({ location: coords }, (results: any, status: string) => {
        const formatted = results?.[0]?.formatted_address;
        if (status !== "OK" || !formatted) return;
        // Merged, never overwritten: the lat/lng the customer just chose are
        // the source of truth, the address is only a label for them.
        setDraft((current) => ({ ...current, address: formatted }));
      });
    } catch {
      /* Address text is a nicety here; the pin still saves. */
    }
  }, []);

  const chooseSuggestion = async (placeId: string) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    try {
      const place = await fetchPlaceDetailsNew({
        placeId,
        apiKey: GOOGLE_MAPS_API_KEY,
        sessionToken,
      });
      // Rotate the session token after a selection, as Google's billing model
      // expects: one autocomplete session per completed choice.
      setSessionToken(createPlacesSessionToken());
      if (!place) return;

      const coords =
        place.lat != null && place.lng != null
          ? { lat: place.lat, lng: place.lng }
          : null;
      const text = place.formatted_address || place.name || '';

      setDraft({
        address: text,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      if (coords) setCenter(coords);
      setQuery(text);
      setSuggestions([]);
      // The name is the thing a customer recognises later, so go straight to it.
      setLabelFocused(true);
    } catch {
      setError('Could not load that place. Try searching again.');
    }
  };

  const dropPin = (coords: LatLng) => {
    setDraft({ address: "", latitude: coords.lat, longitude: coords.lng });
    setCenter(coords);
    reverseGeocode(coords);
  };

  const hasPoint = draft.latitude != null && draft.longitude != null;

  /**
   * Search needs an address to save; a pin supplies its own location, so it only
   * needs coordinates. Requiring an address in both modes is what kept the Save
   * button permanently disabled while dropping pins.
   */
  const canSave =
    Boolean(label.trim() && (mode === "pin" ? hasPoint : draft.address.trim())) && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        label: label.trim(),
        address: draft.address.trim() || `${draft.latitude?.toFixed(5)}, ${draft.longitude?.toFixed(5)}`,
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      onClose();
    } catch {
      setError('Could not save this address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2100] flex flex-col bg-[var(--surface)]"
      role="dialog"
      aria-modal="true"
      aria-label="Add a new place"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
        >
          <X className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
          Add new place
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {mode === "search" ? (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--muted-foreground)]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a place"
                aria-label="Search for a place"
                className="min-h-12 w-full rounded-2xl border border-line bg-[var(--surface)] pl-11 pr-4 text-base outline-none focus:border-[var(--primary)]"
              />
            </div>

            {suggestions.length > 0 && (
              <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line">
                {suggestions.map((s) => (
                  <li key={s.place_id || s.fullText}>
                    <button
                      type="button"
                      onClick={() => chooseSuggestion(s.place_id)}
                      className="flex min-h-14 w-full items-start gap-2 px-4 py-3 text-left hover:bg-[var(--muted)]"
                    >
                      <MapPin
                        className="mt-0.5 size-4 flex-shrink-0 text-[var(--muted-foreground)]"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                          {s.displayName}
                        </span>
                        {/* Street first, then the rest of the address. The
                            street is the part a person actually recognises. */}
                        {s.secondaryText || s.fullText ? (
                          <span className="block truncate text-xs text-[var(--muted-foreground)]">
                            <span className="font-medium text-[var(--ink)]">
                              {streetOf(s.secondaryText || s.fullText)}
                            </span>
                            {" · "}
                            {restOfAddress(s.secondaryText || s.fullText)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Tap the map to drop a pin on your shop or landmark.
            </p>
            <div className="h-64 overflow-hidden rounded-2xl border border-line">
              {mapUnavailable ? (
                <div className="grid size-full place-items-center bg-[var(--muted)] px-6 text-center text-sm text-[var(--muted-foreground)]">
                  The map is unavailable right now. Search for your address instead.
                </div>
              ) : isMapsLoaded ? (
                <GoogleMap
                  mapContainerClassName="size-full"
                  center={center}
                  zoom={16}
                  onClick={(e: any) => {
                    const lat = e.latLng?.lat();
                    const lng = e.latLng?.lng();
                    if (typeof lat !== 'number' || typeof lng !== 'number') return;
                    dropPin({ lat, lng });
                  }}
                  options={{ disableDefaultUI: true, zoomControl: true }}
                >
                  {hasPoint && (
                    <MarkerF position={{ lat: draft.latitude, lng: draft.longitude }} />
                  )}
                </GoogleMap>
              ) : (
                <div className="grid size-full place-items-center bg-[var(--muted)] px-6 text-center text-sm text-[var(--muted-foreground)]">
                  Loading the map…
                </div>
              )}
            </div>
            {hasPoint && (
              <div className="space-y-0.5">
                {pinStreet && (
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">
                    {pinStreet}
                  </p>
                )}
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {draft.latitude.toFixed(5)}, {draft.longitude?.toFixed(5)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Naming the place is the last step in both routes: a label the
            customer chose is what they recognise later in the list. */}
        {(draft.address || mode === "pin") && (
          <div className="mt-5 border-t border-line pt-5">
            <label
              htmlFor="place-label"
              className="mb-2 block text-sm font-bold text-[var(--ink)]"
            >
              Name this place
            </label>
            <input
              id="place-label"
              value={label}
              autoFocus={labelFocused}
              onFocus={() => setLabelFocused(true)}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Home, Mama's place"
              className="min-h-12 w-full rounded-2xl border border-line bg-[var(--surface)] px-4 text-base outline-none focus:border-[var(--primary)]"
            />
            {draft.address && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
                <Check className="mt-px size-3.5 flex-shrink-0 text-[var(--success)]" aria-hidden="true" />
                <span className="min-w-0 break-words">{draft.address}</span>
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--error)]">
            {error}
          </p>
        )}
      </div>

      {/* The mode switch lives with the action it changes the meaning of, just
          above Save: the sheet is a search box or a map, and the button under it
          is the one that commits whichever is on screen. */}
      <div className="border-t border-line px-4 py-4">
        <div className="mb-3 flex gap-2">
          {(["search", "pin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-11 flex-1 rounded-xl font-semibold text-sm transition-colors ${
                mode === m
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
              }`}
            >
              {m === "search" ? "Search" : "Pin on map"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 font-bold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          <Pencil className="size-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save address'}
        </button>
      </div>
    </div>
  );
}