import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Star, Store } from "lucide-react";

import { supabaseHelpers } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurantQueries";
import { cuisineLabels } from "@/lib/foodTaxonomy";
import {
  formatDistance,
  haversineMetres,
  hasCoords,
  isEmptyRadius,
  rankRestaurants,
  type LatLng,
} from "@/lib/distance";

type Row = {
  id: string;
  name: string;
  image: string;
  logo: string;
  address: string;
  rating: number;
  isOpen: boolean;
  cuisine: string[];
  latitude: number | null;
  longitude: number | null;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800";

/**
 * "Recommended near you" for the customer home.
 *
 * This is what sits where the map used to be at step 1. The map is still there
 * — it just only mounts once the customer actually starts booking a ride,
 * because pickup/drop pins, terminal boundaries and routes all depend on it.
 *
 * Ranking blends distance with rating rather than sorting by either alone:
 * nearest-first buries a 4.9★ shop two kilometres away, rating-first buries a
 * good shop behind a great one across town. Shops that have not pinned
 * themselves still appear, last, so a shop is never silently dropped for
 * missing a setting.
 */
export default function RecommendedRestaurants({ query = "" }: { query?: string } = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState<LatLng | null>(null);

  // Device position is the fallback origin; a saved delivery address overrides
  // it further down the stack when the customer has chosen one.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setOrigin(null),
      { timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Tolerates a database that has not run the cuisine/location migration,
      // so the feed degrades to "no distance" instead of "no restaurants".
      const { rows } = await fetchRestaurants(60);

      if (cancelled || !rows.length) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Real ratings, same source the food list uses, so a restaurant never
      // shows two different numbers on two screens.
      const withRatings = await Promise.all(
        rows.map(async (r) => {
          let rating = Number(r.rating) || 0;
          if (r.business_user_id) {
            const res = await supabaseHelpers.getBusinessRating(r.business_user_id);
            if (res && res.average != null) rating = Number(Number(res.average).toFixed(1));
          }
          return {
            id: r.id,
            name: r.name || "Restaurant",
            image: r.banner_image || FALLBACK_IMAGE,
            logo: r.logo_image || "🍽️",
            address: r.address || "",
            rating,
            isOpen: r.is_open !== false,
            cuisine: Array.isArray(r.cuisine) ? r.cuisine : [],
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
          } as Row;
        }),
      );
      if (!cancelled) {
        setRows(withRatings);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(
    () =>
      rankRestaurants(
        rows.map((r) => ({
          ...r,
          coords: hasCoords({ lat: r.latitude, lng: r.longitude })
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
        })),
        origin,
      ).slice(0, 6),
    [rows, origin],
  );

  /**
   * Narrow the already-fetched list to what the customer typed.
   *
   * Filtering here rather than re-querying keeps the search screen from
   * refetching on every keystroke, and the list it filters is the same ranked
   * feed the home screen shows, so results are ranked by distance and rating
   * the same way rather than by raw name order.
   */
  const term = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      term
        ? ranked.filter((r) =>
            (r.name || "").toLowerCase().includes(term) ||
            (r.address || "").toLowerCase().includes(term),
          )
        : ranked,
    [ranked, term],
  );

  const nothingNear = !loading && ranked.length > 0 && isEmptyRadius(rows, origin);

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading restaurants near you…</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ))}
      </div>
    );
  }

  if (!shown.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface px-5 py-8 text-center">
        <Store className="mx-auto size-7 text-[var(--muted-foreground)]" aria-hidden="true" />
        <p className="mt-3 font-bold text-[var(--ink)]">No restaurants yet</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Verified restaurants near Gen. T. de Leon will appear here.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Recommended restaurants near you">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--ink)]">
          Recommended near you
          <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
            {nothingNear ? "Mga pinakabuti" : "Lapit sa iyo"}
          </span>
        </h2>
        <Link
          to="/customer/food"
          className="min-h-11 shrink-0 text-sm font-semibold text-[var(--primary)]"
        >
          See all
        </Link>
      </div>

      {nothingNear && (
        <p className="mb-2 text-xs text-[var(--muted-foreground)]">
          No shops have pinned a location yet, so these are the best rated.
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((r) => {
          const distance =
            origin && hasCoords(r.coords)
              ? formatDistance(haversineMetres(origin, r.coords as LatLng))
              : null;

          return (
            <li key={r.id}>
              <Link
                to={`/customer/restaurant-detail?id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:bg-[var(--muted)]"
              >
                <img
                  src={r.image}
                  alt=""
                  className="size-14 flex-shrink-0 rounded-xl object-cover"
                  loading="lazy"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[var(--ink)]">
                    {r.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                    {cuisineLabels(r.cuisine).join(" · ") || r.address}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1">
                      <Star
                        className="size-3 fill-[var(--amber)] text-[var(--amber)]"
                        aria-hidden="true"
                      />
                      {r.rating ? r.rating.toFixed(1) : "New"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{distance ?? "Distance unavailable"}</span>
                    {!r.isOpen && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[var(--error)]">Closed</span>
                      </>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}