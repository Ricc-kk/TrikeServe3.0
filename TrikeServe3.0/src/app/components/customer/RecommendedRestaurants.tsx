import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Star, Store } from "lucide-react";

import { supabaseHelpers } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurantQueries";
import { cuisineLabels } from "@/lib/foodTaxonomy";
import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import { ImageWithFallback } from "../figma/ImageWithFallback";
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
  const delivery = useDeliveryAddress();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * Ranked from the same place the "Deliver to" line names.
   *
   * This used to ask the device for a position itself and ignore any chosen
   * delivery address, so a customer who set delivery to their sister's place was
   * shown shops ranked around wherever they were standing — and this screen, the
   * header above it and checkout each asked the device separately, which is also
   * why opening search could raise two location prompts.
   *
   * `delivery.origin` is the chosen address when there is one and the device
   * position otherwise, so one fact now decides all three.
   */
  const origin = delivery.origin;

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
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
      <span className="sr-only">Loading restaurants near you…</span>
      {/* Shaped like the card it stands in for — photo on top, two lines
          under — so the grid does not reflow when the real rows land. */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="aspect-[4/3] w-full animate-pulse bg-[var(--muted)] sm:aspect-[16/10]" />
          <div className="space-y-2 p-2.5">
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--muted)]" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--muted)]" />
          </div>
        </div>
      ))}
    </div>
    );
  }

  if (!shown.length) {
    return (
      <div className="rounded-3xl border border-dashed border-line bg-card px-5 py-8 text-center">
        <Store className="mx-auto size-7 text-[var(--muted-foreground)]" aria-hidden="true" />
        <p className="mt-3 font-bold text-[var(--ink)]">No restaurants yet</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Verified restaurants near Gen. T. de Leon will appear here.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Recommended restaurants near you" className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-lg font-extrabold tracking-tight text-[var(--ink)] sm:text-xl">
          Recommended near you
          {/* On its own line: sitting beside the title it wrapped to two lines
              the moment "See all" became a pill, and this is the one heading
              on the screen that should never reflow. */}
          <span className="mt-0.5 block text-sm font-normal text-[var(--muted-foreground)]">
            {nothingNear ? "Mga pinakabuti" : "Lapit sa iyo"}
          </span>
        </h2>
        {/* Filled rather than plain text: on a cream page a bare coral word
            disappears, and this is the one route off the home feed. The
            foreground comes from --primary-foreground, which flips to ink in
            dark mode where --primary turns into a light coral. */}
        <Link
          to="/customer/food"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-colors hover:bg-[var(--coral-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          See all
        </Link>
      </div>

      {nothingNear && (
        <p className="mb-4 rounded-xl border border-line bg-soft px-3 py-2 text-xs text-[var(--muted-foreground)]">
          No shops have pinned a location yet, so these are the best rated.
        </p>
      )}

      {/* Photos lead, with readable names on a themed surface in both modes. */}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {shown.map((r) => {
          const distance =
            origin && hasCoords(r.coords)
              ? formatDistance(haversineMetres(origin, r.coords as LatLng))
              : null;

          return (
            <li key={r.id} className="flex">
              <Link
                to={`/customer/restaurant-detail?id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`}
                className="group flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm transition-colors hover:border-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"
              >
                <span className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--muted)] sm:aspect-[16/10]">
                  <ImageWithFallback
                    src={r.image}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />

                  <span className={`absolute left-2 top-2 rounded-full border border-line px-2 py-1 text-[10px] font-bold ${r.isOpen ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--error-soft)] text-[var(--error)]"}`}>
                    {r.isOpen ? "Open" : "Closed"}
                  </span>
                </span>

                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[var(--ink)] sm:text-base">{r.name}</h3>
                  <p className="mb-3 mt-1 truncate text-xs text-[var(--muted-foreground)]">
                    {cuisineLabels(r.cuisine).join(" · ") || r.address}
                  </p>

                  {/* `ml-auto` pins the distance to the right edge instead of
                      letting it trail the rating, which otherwise drifts a few
                      pixels between "4.8" and "New". */}
                  <span className="mt-auto flex items-center gap-1 border-t border-line pt-3 text-xs">
                    <Star
                      className="size-3.5 flex-shrink-0 fill-[var(--amber)] text-[var(--amber-ink)]"
                      aria-hidden="true"
                    />
                    <span className="font-bold text-[var(--ink)]">
                      {r.rating ? r.rating.toFixed(1) : "New"}
                    </span>
                    <span className="ml-auto truncate text-[var(--muted-foreground)]" title={distance ? "Distance from your delivery location" : "Distance unavailable"}>
                      {distance ?? "—"}
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
