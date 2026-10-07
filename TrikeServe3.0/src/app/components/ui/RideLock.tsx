import type { ReactNode } from "react";
import { Lock, MessageCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useActiveRideLock } from "../../../lib/rideLock";
// Named, not default: Button.tsx only has `export { Button, buttonVariants }`.
// Importing it as a default gives undefined, and rendering it throws, which takes
// down the whole route rather than just this screen.
import { Button } from "./button";

/**
 * Blocks the food-ordering surfaces while the customer is mid-ride.
 *
 * Wraps a whole screen rather than hiding individual buttons, so the rule cannot be
 * bypassed by deep link. Hiding the cart link alone left `/customer/cart` reachable
 * by URL and by the browser's back button from a tab opened before the ride began.
 *
 * Ride-related actions are deliberately not blocked: the live tracking, the chat and
 * cancelling the ride all stay reachable, and the copy says why rather than implying
 * something is broken.
 */
export default function RideLock({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locked, checked } = useActiveRideLock(user?.id);

  // Hold the screen until the check answers. Rendering the real screen first and
  // swapping to the locked one a moment later would flash the cart and, worse, let
  // the customer tap "Checkout" inside that flash.
  if (!checked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted-foreground)]">Checking your ride...</p>
      </div>
    );
  }

  if (!locked) return <>{children}</>;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-[var(--muted)]">
        <Lock className="size-7 text-[var(--muted-foreground)]" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-[var(--ink)]">You're on a ride right now</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
          Food ordering is paused while your trip is in progress. Once it ends you can
          order as usual.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => (window.location.href = "/customer")}>
          <MessageCircle className="mr-2 size-4" aria-hidden="true" />
          Back to my ride
        </Button>
      </div>
    </div>
  );
}