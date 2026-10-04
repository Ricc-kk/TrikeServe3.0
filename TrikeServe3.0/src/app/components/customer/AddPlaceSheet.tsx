import { useEffect, useState } from "react";
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
};

const EMPTY: Draft = { address: "", latitude: null, longitude: null };

/**
 * Add a named place, by searching or by dropping a pin.
 *
 * Both routes end the same way — a name the customer chose — because "Home" or
 * "Mama's place" is far easier to recognise later than a coordinate or a long
 * address string.
 */
export default function AddPlaceSheet({ onClose, onSave }: AddPlaceSheetProps) {
  const [mode, setMode] = useState<"search" | "pin">("search");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlacesAutocompleteSuggestion[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [label, setLabel] = useState("");
  const [labelFocused, setLabelFocused] = useState(false);
  const [center, setCenter] = useState<LatLng>({ lat: 14.7294, lng: 120.9349 });
  const [sessionToken, setSessionToken] = useState(() => createPlacesSessionToken());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isLoaded: isMapsLoaded } = useMapLoader();

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

  const canSave = Boolean(draft.address.trim() && label.trim()) && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        label: label.trim(),
        address: draft.address.trim(),
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

      <div className="flex gap-2 border-b border-line px-3 py-2">
        {(["search", "pin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 flex-1 rounded-xl font-semibold text-sm capitalize transition-colors ${
              mode === m
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
            }`}
          >
            {m === "search" ? "Search" : "Pin on map"}
          </button>
        ))}
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
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">
                          {s.secondaryText || s.fullText}
                        </span>
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
              {isMapsLoaded && draft.latitude != null && draft.longitude != null ? (
                <GoogleMap
                  mapContainerClassName="size-full"
                  center={center}
                  zoom={16}
                  onClick={(e: any) => {
                    const lat = e.latLng?.lat();
                    const lng = e.latLng?.lng();
                    if (typeof lat !== 'number' || typeof lng !== 'number') return;
                    setDraft({ address: '', latitude: lat, longitude: lng });
                    setCenter({ lat, lng });
                  }}
                  options={{ disableDefaultUI: true, zoomControl: true }}
                >
                  <MarkerF position={{ lat: draft.latitude, lng: draft.longitude }} />
                </GoogleMap>
              ) : (
                <div className="grid size-full place-items-center bg-[var(--muted)] px-6 text-center text-sm text-[var(--muted-foreground)]">
                  {isMapsLoaded
                    ? 'Tap the map to place your pin.'
                    : 'Loading the map…'}
                </div>
              )}
            </div>
            {draft.latitude != null && (
              <p className="truncate text-xs text-[var(--muted-foreground)]">
                {draft.latitude.toFixed(5)}, {draft.longitude?.toFixed(5)}
              </p>
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

      <div className="border-t border-line px-4 py-4">
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