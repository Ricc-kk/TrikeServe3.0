import { UtensilsCrossed } from "lucide-react";

import { Tricycle } from "../ui/Tricycle";
import { useCart } from "../../contexts/CartContext";

type CustomerServiceHubProps = {
  /** Enters the existing booking flow at its first step. */
  onBookRide: () => void;
  /** Opens the existing food experience. */
  onOrderFood: () => void;
  /** Service area named in the trust line. */
  serviceArea?: string;
};

/**
 * The customer landing hub: two equally-weighted ways into TrikeServe.
 *
 * The old landing card only ever offered "Book a Ride", while the bottom nav's
 * "Home" item silently pointed at the food screen — so food was effectively
 * invisible from the front door. Both services now get the same size, the same
 * weight and a labelled icon, so neither reads as the secondary option.
 *
 * This component deliberately contains no booking logic: tapping a service just
 * hands off to the screens that already do the work.
 */
export default function CustomerServiceHub({
  onBookRide,
  onOrderFood,
  serviceArea = "Gen. T. de Leon",
}: CustomerServiceHubProps) {
  const { getTotalItems } = useCart();
  const cartCount = getTotalItems();

  return (
    <section
      aria-label="Choose a service"
      className="rounded-3xl border border-line bg-surface p-4 shadow-2xl sm:p-5"
    >
      <h2 className="text-center text-lg font-bold text-[var(--ink)] sm:text-xl">
        What do you need today?
      </h2>
      <p className="mb-4 mt-0.5 text-center text-xs text-[var(--muted-foreground)] sm:text-sm">
        Ano ang kailangan mo ngayon?
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Sakay / Ride */}
        <button
          type="button"
          onClick={onBookRide}
          className="flex min-h-44 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-[var(--coral-soft)] bg-[var(--primary-soft)] px-3 py-5 text-center transition-transform hover:scale-[1.02] active:scale-[0.98] sm:min-h-52"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--primary)] sm:size-16">
            <Tricycle className="size-8 text-white sm:size-9" aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold leading-tight text-[var(--ink)] sm:text-lg">
            Book a Ride
          </span>
          <span className="text-xs font-bold text-[var(--primary)]">Sakay</span>
          <span className="text-xs leading-snug text-[var(--muted-foreground)]">
            Shared or private
          </span>
        </button>

        {/* Pagkain / Food */}
        <button
          type="button"
          onClick={onOrderFood}
          className="relative flex min-h-44 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-[var(--teal-soft)] bg-[var(--teal-soft)] px-3 py-5 text-center transition-transform hover:scale-[1.02] active:scale-[0.98] sm:min-h-52"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--teal)] sm:size-16">
            <UtensilsCrossed className="size-8 text-white sm:size-9" aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold leading-tight text-[var(--ink)] sm:text-lg">
            Order Food
          </span>
          <span className="text-xs font-bold text-[var(--teal)]">Pagkain</span>
          <span className="text-xs leading-snug text-[var(--muted-foreground)]">
            Nearby restaurants
          </span>

          {cartCount > 0 && (
            <span className="absolute -right-2 -top-2 rounded-full bg-[var(--teal)] px-2.5 py-1 text-[11px] font-bold text-white">
              {cartCount} in cart
            </span>
          )}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
        Fixed local fares · Serving {serviceArea}
      </p>
      <p className="text-center text-xs text-[var(--muted-foreground)]">
        Makatipid at malinis na biyahe
      </p>
    </section>
  );
}