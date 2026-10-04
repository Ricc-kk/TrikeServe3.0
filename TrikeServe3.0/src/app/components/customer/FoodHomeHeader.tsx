import { Link } from "react-router";
import { Bell, ChevronDown, ChevronRight, Heart } from "lucide-react";

type FoodHomeHeaderProps = {
  /** Unread notifications. */
  unreadCount?: number;
  /** Saved restaurants count. */
  favoritesCount?: number;
  /** Renders the back control when provided. */
  onBack?: () => void;
  /** Current delivery address; omit to hide the address row. */
  addressLabel?: string | null;
  /** Opens the address picker. */
  onOpenAddress?: () => void;
};

/**
 * The food screen's top bar.
 *
 * This used to be a full brand header — a "TS" mark, an "Order Food" title, the
 * service-area name and a "Hi, {name}!" greeting stacked above the controls. On
 * a food screen reached from Home that was four things restating context the
 * customer already had, and it pushed the search bar below the fold on a phone.
 *
 * It is now one slim row: back, the delivery address, and two icons.
 *
 * The vertical padding is load-bearing on both sides. The food screen's search
 * field straddles this header's bottom edge, so the bottom padding has to keep
 * the back button, the address and the icons clear of the field *and* still
 * leave air between them.
 *
 * The numbers here are rem-resolved, and this app sets `html { font-size: 17px }`,
 * so they are not Tailwind's nominal values: -mt-6 hangs the field 25.5px below
 * the edge, pb-7 left a 4px gap under the icons (green bar and white field read
 * as two welded blocks) and pb-10 gives 17px.
 *
 * The top padding is written as an explicit calc rather than layered alongside
 * `pt-safe`: that helper is unlayered CSS, so it outranks every Tailwind padding
 * utility and a `sm:pt-*` beside it could never apply. Adding to the safe-area
 * inset directly keeps the notched phone and the browser telling the same story.
 *
 * The address row used to open with a MapPin glyph in front of the text and an
 * avatar button at the end of the bar. The glyph said nothing the address itself
 * does not, and the avatar duplicated the Profile tab in the bottom nav — two
 * routes to one screen, one of them costing a whole row of the bar. So the
 * address text leads, a chevron sits on its right edge as the affordance that
 * it opens a list, and the bar ends after the favourites icon.
 */
export default function FoodHomeHeader({
  unreadCount = 0,
  favoritesCount = 0,
  onBack,
  addressLabel,
  onOpenAddress,
}: FoodHomeHeaderProps) {
  return (
    <header className="bg-[var(--ink-solid)] px-3 pb-10 pt-[calc(max(0.25rem,env(safe-area-inset-top))+0.75rem)] sm:px-5 sm:pb-12">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <ChevronRight
              className="size-6 rotate-180 text-white"
              aria-hidden="true"
            />
          </button>
        )}

        {onOpenAddress && (
          <button
            type="button"
            onClick={onOpenAddress}
            aria-label={`Deliver to ${addressLabel || "no address set"}. Change delivery address`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/10 px-3 text-left transition-colors hover:bg-white/20"
          >
            {/* The address is the widest thing on the bar and the first thing
                that changes, so it takes the space. `ml-auto` pins the chevron
                to the far edge of the button rather than letting it sit against
                the truncated text. */}
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              {addressLabel || "Add delivery address"}
            </span>
            <ChevronDown
              className="size-4 flex-shrink-0 text-white/70"
              aria-hidden="true"
            />
          </button>
        )}

        <Link
          to="/customer/notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative grid size-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
        >
          <Bell className="size-5 text-white sm:size-6" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[var(--ink-solid)] bg-[var(--amber)]">
              <span className="text-[10px] font-bold leading-none text-[var(--ink-solid)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </Link>

        <Link
          to="/customer/favorites"
          aria-label={favoritesCount > 0 ? `Favorites, ${favoritesCount} saved` : "Favorites"}
          className="relative grid size-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
        >
          <Heart className="size-5 text-white sm:size-6" aria-hidden="true" />
          {favoritesCount > 0 && (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[var(--ink-solid)] bg-[var(--amber)]">
              <span className="text-[10px] font-bold leading-none text-[var(--ink-solid)]">
                {favoritesCount > 9 ? "9+" : favoritesCount}
              </span>
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}