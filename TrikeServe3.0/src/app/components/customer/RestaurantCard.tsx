import { Link } from "react-router";
import { Clock, Heart, MapPin, Route, Shield, Star } from "lucide-react";

import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";

export type RestaurantView = {
  id: string;
  name: string;
  /** One-line address for the card. */
  address: string;
  image: string;
  logo: string;
  time: string;
  rating: number;
  ratingCount: number;
  isOpen: boolean;
  verified: boolean;
  hasMenu: boolean;
  /** Cuisine buckets this restaurant declares, as display labels. */
  cuisineLabels: string[];
  /**
   * "450 m" / "1.2 km" from the selected delivery address, or null when the
   * shop has not pinned itself -- rendered as "Distance unavailable" rather
   * than a fabricated number.
   */
  distanceLabel: string | null;
};

type RestaurantCardProps = {
  restaurant: RestaurantView;
  deliveryFee: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

/**
 * One restaurant in the browse list.
 *
 * Rebuilt around two things the old card got wrong: the name was clipped to a
 * single truncated line, and the "Order Na!" button sat where the floating ride
 * FAB and the Back-to-Top control could cover it. The CTA is now full-width and
 * the card reserves bottom padding so nothing floats over it.
 */
export default function RestaurantCard({
  restaurant,
  deliveryFee,
  isFavorite,
  onToggleFavorite,
}: RestaurantCardProps) {
  const closed = !restaurant.isOpen;

  return (
    <Link
      to={`/customer/restaurant-detail?id=${encodeURIComponent(restaurant.id)}&name=${encodeURIComponent(restaurant.name)}`}
      className="block rounded-3xl border border-line bg-[var(--surface)] shadow-lg transition-shadow hover:shadow-xl active:scale-[0.99]"
    >
      <div className="flex gap-3 p-3">
        <div className="relative size-24 flex-shrink-0 overflow-hidden rounded-2xl sm:size-28">
          <ImageWithFallback
            src={restaurant.image}
            alt={restaurant.name}
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />

          {restaurant.logo && restaurant.logo !== "🍽️" && (
            <div className="absolute left-2 top-2 grid size-8 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-md">
              <StoreLogo logo={restaurant.logo} emojiClass="text-base" />
            </div>
          )}

          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 shadow">
            <Star className="size-3 fill-[var(--amber)] text-[var(--amber)]" aria-hidden="true" />
            <span className="text-xs font-bold text-[var(--ink)]">
              {restaurant.rating ? Number(restaurant.rating).toFixed(1) : "New"}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-base font-bold leading-tight text-[var(--ink)] line-clamp-2">
              {restaurant.name}
            </h3>

            {/* Teal, not --ink-solid: the shield is fill-current, and
                --ink-solid is near-black in dark mode, which made the badge
                invisible against the dark card. Teal holds >=3:1 both ways. */}
            {restaurant.verified && (
              <span
                className="mt-0.5 flex-shrink-0 text-[var(--teal)]"
                title="Verified merchant"
              >
                <Shield className="size-4 fill-current" aria-hidden="true" />
                <span className="sr-only">Verified merchant</span>
              </span>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite();
              }}
              aria-label={
                isFavorite
                  ? `Remove ${restaurant.name} from favorites`
                  : `Save ${restaurant.name} to favorites`
              }
              aria-pressed={isFavorite}
              className={`grid size-11 flex-shrink-0 place-items-center rounded-full transition-colors ${
                isFavorite
                  ? "bg-[var(--primary)]"
                  : "bg-[var(--muted)] hover:bg-[var(--border)]"
              }`}
            >
              <Heart
                className={`size-5 ${
                  isFavorite
                    ? "fill-[var(--primary-foreground)] text-[var(--primary-foreground)]"
                    : "text-[var(--primary)]"
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-[var(--muted-foreground)]">
            <MapPin className="mt-px size-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{restaurant.address}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--muted)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
              <Clock className="size-3" aria-hidden="true" />
              {restaurant.time}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--muted)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
              <Route className="size-3" aria-hidden="true" />
              {restaurant.distanceLabel ?? "Distance unavailable"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--muted)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
              <span className="text-[10px]" aria-hidden="true">
                ₱
              </span>
              {deliveryFee} fee
            </span>
            <span
              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                closed
                  ? "bg-[var(--error-soft)] text-[var(--error)]"
                  : "bg-[var(--success-soft)] text-[var(--success-ink)]"
              }`}
            >
              {closed ? "Closed" : "Open now"}
            </span>
          </div>

          {restaurant.cuisineLabels.length > 0 && (
            <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-[var(--teal)]">
              {restaurant.cuisineLabels.join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="px-3 pb-3">
        <span
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold ${
            closed || !restaurant.hasMenu
              ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
              : "bg-[var(--primary)] text-[var(--primary-foreground)]"
          }`}
        >
          {!restaurant.hasMenu
            ? "Menu coming soon"
            : closed
              ? "Closed for now"
              : "Order Na! · Order now"}
        </span>
      </div>
    </Link>
  );
}