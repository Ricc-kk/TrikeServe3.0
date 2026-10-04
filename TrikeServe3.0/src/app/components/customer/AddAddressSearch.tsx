import { useEffect, useState } from "react";
import { ChevronLeft, MapPin, Search } from "lucide-react";
import { useNavigate } from "react-router";

import {
  createPlacesSessionToken,
  fetchPlaceDetailsNew,
  searchPlacesText,
} from "@/lib/placesApi";

import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import {
  restOfAddress,
  streetOf,
  writeAddressDraft,
} from "./addressFlowState";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

type Hit = { place_id: string; label: string; detail: string };

/**
 * Find the place, then hand off to the map.
 *
 * This screen answers one of two questions — "what is the place called" or
 * "let me point at it" — and nothing else. Text Search rather than Autocomplete,
 * because the customer is choosing a fixed address that will be given a pin,
 * and only a geocoded result carries coordinates we can actually save.
 */
export default function AddAddressSearch() {
  const navigate = useNavigate();
  const delivery = useDeliveryAddress();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sessionToken, setSessionToken] = useState(() => createPlacesSessionToken());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term || !GOOGLE_MAPS_API_KEY) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const results = await searchPlacesText({
          textQuery: term,
          apiKey: GOOGLE_MAPS_API_KEY,
          // Bias toward where they are already being delivered, so typing a
          // street name returns their street first rather than one in another
          // city with the same name.
          bias: delivery.origin ?? undefined,
          biasRadiusMeters: 5000,
        });
        if (cancelled) return;
        setHits(
          results.slice(0, 8).map((r) => ({
            place_id: r.place_id || "",
            label: r.name || r.formatted_address || "Place",
            detail: r.formatted_address || "",
          })),
        );
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, delivery.origin]);

  const choose = async (placeId: string) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    setBusy(true);
    setError(null);
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

      const draft = {
        address: place.formatted_address || place.name || "",
        latitude: place.lat,
        longitude: place.lng,
      };
      writeAddressDraft(draft);
      navigate("/customer/delivery-address/pin", { state: { draft } });
    } catch {
      setError("Could not load that place. Try searching again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="border-b border-line bg-[var(--surface)] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/customer/delivery-address")}
            aria-label="Back"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl hover:bg-[var(--muted)]"
          >
            <ChevronLeft className="size-5 text-[var(--ink)]" aria-hidden="true" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">
            Add a new address
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-4 pb-8">
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
            autoFocus
            className="min-h-13 w-full rounded-2xl border border-line bg-[var(--surface)] pl-11 pr-4 text-base text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-line bg-[var(--surface)]">
            {hits.map((hit) => (
              <li key={hit.place_id || hit.detail}>
                <button
                  type="button"
                  onClick={() => choose(hit.place_id)}
                  disabled={busy}
                  className="flex min-h-14 w-full items-start gap-2 px-4 py-3 text-left hover:bg-[var(--muted)] disabled:opacity-50"
                >
                  <MapPin
                    className="mt-0.5 size-4 flex-shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                      {hit.label}
                    </span>
                    {hit.detail ? (
                      /* Street first, then the rest: the street is the part a
                         person recognises in a list. */
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">
                        <span className="font-medium text-[var(--ink)]">
                          {streetOf(hit.detail)}
                        </span>
                        {restOfAddress(hit.detail) ? ` · ${restOfAddress(hit.detail)}` : ""}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim() && hits.length === 0 && !busy && (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            No places found. Try a different spelling, or point at it on the map.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--error)]">
            {error}
          </p>
        )}

        {/* Not a fallback: pointing at a landmark that does not have a typed
            address — a gate, an alley, a friend's building — is the common case
            on a tricycle delivery, so this is a first-class route in.

            `mt-auto` puts it at the bottom of the screen with no results, the
            way the reference does, and it is spacing rather than positioning:
            the page is a flex column, so the spare height collects above this
            button instead of it being pinned out of the flow. When results are
            long enough to fill the page, the auto margin collapses to nothing
            and the button simply follows the list. */}
        <button
          type="button"
          onClick={() => navigate("/customer/delivery-address/pin")}
          className="mt-auto flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--muted)] px-5 text-base font-bold text-[var(--ink)]"
        >
          <MapPin className="size-5 text-[var(--primary)]" aria-hidden="true" />
          Pin on map
        </button>
      </main>
    </div>
  );
}