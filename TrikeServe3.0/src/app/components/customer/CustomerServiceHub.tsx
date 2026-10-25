import { UtensilsCrossed } from "lucide-react";

import { TerminalIconGlyph } from "../ui/TerminalIcon";
import { useCartOptional } from "../../contexts/CartContext";

type CustomerServiceHubProps = {
  /** Enters the existing booking flow at its first step. */
  onBookRide: () => void;
  /** A customer can still browse Home during a ride, but cannot book another. */
  rideDisabled?: boolean;
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
  rideDisabled = false,
  onOrderFood,
  serviceArea = "Gen. T. de Leon",
}: CustomerServiceHubProps) {
  const cart = useCartOptional();
  const cartCount = cart?.getTotalItems() ?? 0;

  return (
    <section
      aria-label="Choose a service"
      className="flex flex-col rounded-3xl border border-line bg-card p-4 shadow-card sm:p-6"
    >
      <h1 className="text-center text-xl font-extrabold tracking-tight text-[var(--ink)] sm:text-2xl">
        What do you need today?
      </h1>
      <p className="mb-5 mt-1 text-center text-xs text-[var(--muted-foreground)] sm:text-sm">
        Ano ang kailangan mo ngayon?
      </p>

      <div className="grid flex-1 grid-cols-2 gap-3 sm:gap-4">
        {/* Sakay / Ride */}
        <button
          type="button"
          onClick={onBookRide}
          disabled={rideDisabled}
          className={`flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:min-h-48 ${
            rideDisabled ? "cursor-not-allowed opacity-60" : "transition-colors hover:border-[var(--primary)] active:scale-[0.98]"
          }`}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--primary)] sm:size-16">
            <TerminalIconGlyph className="size-8 text-[var(--primary-foreground)] sm:size-9" aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold leading-tight text-[var(--ink)] sm:text-lg">
            {rideDisabled ? 'Ride in progress' : 'Book a Ride'}
          </span>
          <span className="text-xs font-bold text-[var(--coral-dark)]">Sakay</span>
          <span className="text-xs leading-snug text-[var(--muted-foreground)]">
            {rideDisabled ? 'Finish your current ride first' : 'Shared or private'}
          </span>
        </button>

        {/* Pagkain / Food */}
        <button
          type="button"
          onClick={onOrderFood}
          className="relative flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[var(--teal)]/20 bg-[var(--teal-soft)] px-3 py-5 text-center transition-colors hover:border-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] active:scale-[0.98] sm:min-h-48"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--teal)] sm:size-16">
            <UtensilsCrossed className="size-8 text-[var(--background)] sm:size-9" aria-hidden="true" />
          </span>
          <span className="text-base font-extrabold leading-tight text-[var(--ink)] sm:text-lg">
            Order Food
          </span>
          <span className="text-xs font-bold text-[var(--teal)]">Pagkain</span>
          <span className="text-xs leading-snug text-[var(--muted-foreground)]">
            Nearby restaurants
          </span>

          {cartCount > 0 && (
            <span className="absolute -top-3 right-2 rounded-full bg-[var(--teal)] px-2.5 py-1 text-[11px] font-bold text-[var(--background)]">
              {cartCount} in cart
            </span>
          )}
        </button>
      </div>

      <p className="mt-4 border-t border-line pt-4 text-center text-xs text-[var(--muted-foreground)]">
        Fixed local fares · Serving {serviceArea}
      </p>
      <p className="text-center text-xs text-[var(--muted-foreground)]">
        Makatipid at malinis na biyahe
      </p>
    </section>
  );
}
