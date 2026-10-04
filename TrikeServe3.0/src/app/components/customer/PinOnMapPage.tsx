import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import { ChevronLeft, Loader2, MapPin, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import useMapLoader from "@/lib/mapLoader";
import {
  createPlacesSessionToken,
  fetchPlaceDetailsNew,
  searchPlacesText,
} from "@/lib/placesApi";
import type { LatLng } from "@/lib/distance";

import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import {
  EMPTY_ADDRESS_DRAFT,
  FALLBACK_CENTER,
  hasPin,
  readAddressDraft,
  streetOf,
  writeAddressDraft,
  type AddressDraft,
} from "./addressFlowState";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/**
 * Sheet heights.
 *
 * The minimum is measured, not guessed: the grabber (23px) plus the "Address near
 * you" block (64px) plus the gap, the 56px Select button and the bottom padding
 * comes to about 180px. At the 148px this started with, the address was the one
 * thing clipped — which defeated the point of a sheet whose resting state is
 * meant to show what address the pin is on.
 */
const MIN_PX = 184;
const MAX_VH = 0.88;

/**
 * Choose the pin, on a map that is the whole page.
 *
 * This replaces the old "Pin on map" mode inside a sheet, where the map was a
 * card between 58vh and the bottom of the screen with a scrollable form above
 * it. Placing a pin is a map task, so the map is now the page: the search field
 * floats over it and the only other thing on screen is a draggable sheet holding
 * the address and the confirm button.
 *
 * There is no Search/Pin mode switch any more. That toggle existed because the
 * map and the search field took turns being the whole job; with the map always
 * visible, searching is just "move the map", and picking a result drops the pin
 * there directly.
 */
export default function PinOnMapPage() {
  const navigate = useNavigate();
  const routeState = useLocation().state as { draft?: AddressDraft } | null;
  const delivery = useDeliveryAddress();

  const incoming = routeState?.draft ?? readAddressDraft();

  const [draft, setDraft] = useState<AddressDraft>(incoming);
  const [center, setCenter] = useState<LatLng>(() =>
    hasPin(incoming)
      ? { lat: incoming.latitude as number, lng: incoming.longitude as number }
      : delivery.origin ?? FALLBACK_CENTER,
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { place_id: string; label: string; detail: string }[]
  >([]);
  const [sessionToken, setSessionToken] = useState(() => createPlacesSessionToken());
  const [geocoding, setGeocoding] = useState(false);
  const [searching, setSearching] = useState(false);

  /** Sheet height in pixels; the drag itself lives in a ref, not state. */
  const [sheetHeight, setSheetHeight] = useState(MIN_PX);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const { isLoaded: isMapsLoaded, loadError, blocked, apiKeyPresent } = useMapLoader();
  const mapUnavailable = !apiKeyPresent || Boolean(loadError) || Boolean(blocked);

  const pin = hasPin(draft);
  const resolved = draft.address.trim();
  const canSelect = pin && !geocoding;

  // Mirror every change, so a refresh or Android back-then-forward lands on the
  // same pin rather than an empty map.
  useEffect(() => {
    writeAddressDraft(draft);
  }, [draft]);

  /**
   * Open on where the customer is standing.
   *
   * Their live location leads. A refused or unavailable geolocation is not worth
   * surfacing: the saved delivery address, then the city centre, both work.
   */
  useEffect(() => {
    if (hasPin(incoming)) return;
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const here = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCenter(here);
        // A pin they can already see beats an empty map waiting for a tap.
        setDraft({ ...EMPTY_ADDRESS_DRAFT, latitude: here.lat, longitude: here.lng });
      },
      () => {
        /* Keep the fallback centre. */
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
    return () => {
      cancelled = true;
    };
    // Mount only: re-requesting the location after a pin drop would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term || !GOOGLE_MAPS_API_KEY) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchPlacesText({
          textQuery: term,
          apiKey: GOOGLE_MAPS_API_KEY,
          bias: center,
          biasRadiusMeters: 5000,
        });
        if (cancelled) return;
        setSuggestions(
          hits.slice(0, 5).map((hit) => ({
            place_id: hit.place_id || "",
            label: hit.name || hit.formatted_address || "Place",
            detail: hit.formatted_address || "",
          })),
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, center]);

  /**
   * Turn a dropped pin into something a person can read.
   *
   * The lat/lng the customer chose are the source of truth; this only labels
   * them, so a failure leaves the coordinate readout rather than blocking.
   */
  const reverseGeocode = useCallback((coords: LatLng) => {
    const maps = (window as any)?.google?.maps;
    if (!maps?.Geocoder) return;

    setGeocoding(true);
    new maps.Geocoder().geocode({ location: coords }, (results: any, status: string) => {
      setGeocoding(false);
      const formatted = results?.[0]?.formatted_address;
      if (status !== "OK" || !formatted) return;
      setDraft((current) => ({ ...current, address: formatted }));
    });
  }, []);

  const dropPin = (coords: LatLng) => {
    // Cleared first: keeping the old street while a new one resolves would show
    // one address over a pin sitting somewhere else entirely.
    setDraft({ ...EMPTY_ADDRESS_DRAFT, latitude: coords.lat, longitude: coords.lng });
    setCenter(coords);
    reverseGeocode(coords);
  };

  const chooseSuggestion = async (placeId: string) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    try {
      const place = await fetchPlaceDetailsNew({
        placeId,
        apiKey: GOOGLE_MAPS_API_KEY,
        sessionToken,
      });
      // One autocomplete session per completed choice, as Google's billing
      // model requires.
      setSessionToken(createPlacesSessionToken());
      if (!place || place.lat == null || place.lng == null) return;

      const text = place.formatted_address || place.name || "";
      setDraft({
        address: text,
        latitude: place.lat,
        longitude: place.lng,
      });
      setCenter({ lat: place.lat, lng: place.lng });
      setQuery(text);
      setSuggestions([]);
    } catch {
      // Leave the field as it is; the map is still usable by tapping.
    }
  };

  /* ---- Sheet dragging ---- */

  const maxHeight = () => Math.round(window.innerHeight * MAX_VH);

  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = { startY: event.clientY, startHeight: sheetHeight };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - event.clientY;
    // Clamp rather than resist: at either end the sheet stops, so it can never
    // be dragged off screen or up over the search field.
    const next = Math.min(maxHeight(), Math.max(MIN_PX, drag.startHeight + delta));
    setSheetHeight(next);
  };

  /**
   * Snap to the nearer end, biased by how far the finger travelled.
   *
   * Position alone makes a quick flick feel ignored, so a decisive flick wins
   * over a position that is barely past the midpoint.
   */
  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const travelled = drag.startY - event.clientY;
    const midpoint = (MIN_PX + maxHeight()) / 2;

    if (travelled > 60) setSheetHeight(maxHeight());
    else if (travelled < -60) setSheetHeight(MIN_PX);
    else setSheetHeight(sheetHeight >= midpoint ? maxHeight() : MIN_PX);
  };

  const onSelect = () => {
    if (!canSelect) return;
    const address =
      resolved || `${draft.latitude!.toFixed(5)}, ${draft.longitude!.toFixed(5)}`;
    // Selecting is what makes this the live delivery address; the next screen
    // only adds it to the saved list.
    delivery.selectAddress({
      label: streetOf(address) || "Pinned location",
      address,
      latitude: draft.latitude,
      longitude: draft.longitude,
      source: "recent",
    });
    navigate("/customer/delivery-address/save", { state: { draft } });
  };

  return (
    <div
      className="fixed inset-0 z-[2200] bg-[var(--muted)]"
      role="dialog"
      aria-label="Pin on map"
    >
      {/* The map is the page, not a panel inside one. */}
      <div className="absolute inset-0">
        {mapUnavailable ? (
          <div className="grid size-full place-items-center bg-[var(--muted)] px-8 text-center text-sm text-[var(--muted-foreground)]">
            The map is unavailable right now. Search for your address above instead.
          </div>
        ) : isMapsLoaded ? (
          <GoogleMap
            mapContainerClassName="size-full"
            center={center}
            zoom={16}
            onClick={(e: any) => {
              const lat = e.latLng?.lat();
              const lng = e.latLng?.lng();
              if (typeof lat !== "number" || typeof lng !== "number") return;
              dropPin({ lat, lng });
            }}
            options={{ disableDefaultUI: true, zoomControl: true }}
          >
            {pin && <MarkerF position={{ lat: draft.latitude!, lng: draft.longitude! }} />}
          </GoogleMap>
        ) : (
          <div className="grid size-full place-items-center bg-[var(--muted)] text-[var(--muted-foreground)]">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Search floats over the map: finding a landmark by name and then nudging
          the pin is one task, so both controls stay on screen together. */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/45 to-transparent px-3 pb-8 pt-safe sm:px-5">
        {/* Back and search are siblings in a row, not a button floating on top
            of the field. The old markup positioned the button absolutely inside
            the input's box and padded the field 102px to clear it, so the two
            only avoided each other by a hardcoded number: at a narrower width,
            or with a longer placeholder, the chevron sat on the text. Laying
            them out as flex siblings makes the gap structural instead. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/customer/delivery-address/new")}
            aria-label="Back"
            className="grid size-11 flex-shrink-0 place-items-center rounded-full bg-white shadow-md"
          >
            {/* Literal colour, not --ink: the overlay floats on a map, so its
                white background does not follow the theme, and in dark mode
                --ink flips to cream — which put this chevron at 1.15:1 against
                its own background and made it invisible. */}
            <ChevronLeft className="size-5 text-[#122724]" aria-hidden="true" />
          </button>

          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#5c6b68]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search to jump to a place"
              aria-label="Search to jump to a place"
              className="min-h-13 w-full rounded-full border border-[#d6d3ca] bg-white pl-12 pr-4 text-base text-[#122724] shadow-md outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {suggestions.length > 0 && (
          <ul className="mt-2 divide-y divide-[#e6e3da] overflow-hidden rounded-2xl border border-[#d6d3ca] bg-white">
            {suggestions.map((s) => (
              <li key={s.place_id || s.detail}>
                <button
                  type="button"
                  onClick={() => chooseSuggestion(s.place_id)}
                  className="flex min-h-13 w-full items-start gap-2 px-4 py-3 text-left hover:bg-[var(--muted)]"
                >
                  <MapPin
                    className="mt-0.5 size-4 flex-shrink-0 text-[#5c6b68]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#122724]">
                      {s.label}
                    </span>
                    {s.detail ? (
                      <span className="block truncate text-xs text-[#5c6b68]">
                        {s.detail}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Draggable sheet. Snap points come from the viewport rather than fixed
          pixel values, so it still behaves in landscape and the Android web
          view, where the viewport is not the screen height. */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-[var(--surface)] shadow-[0_-8px_32px_rgba(0,0,0,0.28)]"
        style={{ height: sheetHeight }}
      >
        {/* `touch-action: none` on the handle only, so a drag starting there moves
            the sheet instead of panning the map underneath. Dragging the map
            itself still pans the map. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-3 active:cursor-grabbing"
        >
          <div
            className="mx-auto h-1.5 w-10 rounded-full bg-[var(--border)]"
            aria-hidden="true"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Address near you
            </p>
            {searching ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">Searching…</p>
            ) : geocoding ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Finding this address…
              </p>
            ) : resolved ? (
              <p className="mt-1 text-base font-semibold leading-snug text-[var(--ink)]">
                {streetOf(resolved)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                {pin
                  ? "No address found for this pin yet."
                  : "Tap the map or search above to place your pin."}
              </p>
            )}
            {pin && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {draft.latitude!.toFixed(5)}, {draft.longitude!.toFixed(5)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onSelect}
            disabled={!canSelect}
            className="mt-3 flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 text-base font-bold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}