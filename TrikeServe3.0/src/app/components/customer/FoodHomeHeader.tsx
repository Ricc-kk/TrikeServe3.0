import { Link } from "react-router";
import { Bell, ChevronRight, Heart, MapPin, User } from "lucide-react";

type FoodHomeHeaderProps = {
  /** Profile picture, when the account has one. */
  avatarUrl?: string | null;
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
 * service-area name and a "Hi, {name}!" greeting stacked above the controls.
 * On a food screen reached from Home that was four things restating context the
 * customer already had, and it pushed the search bar below the fold on a phone.
 *
 * It is now one slim row: back, the delivery address, and the three icons. The
 * address leads because it is the only thing here the customer cannot reach from
 * anywhere else, and it stays a 44px target down to 320px.
 */
export default function FoodHomeHeader({
  avatarUrl,
  unreadCount = 0,
  favoritesCount = 0,
  onBack,
  addressLabel,
  onOpenAddress,
}: FoodHomeHeaderProps) {
  return (
    <header className="bg-[var(--ink-solid)] px-3 pt-safe sm:px-5 sm:pt-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="grid size-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <ChevronRight className="size-6 rotate-180 text-white" aria-hidden="true" />
          </button>
        )}

        {onOpenAddress && (
          <button
            type="button"
            onClick={onOpenAddress}
            aria-label={`Deliver to ${addressLabel || "no address set"}. Change delivery address`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-left transition-colors hover:bg-white/20"
          >
            <MapPin className="size-4 flex-shrink-0 text-white" aria-hidden="true" />
            <span className="min-w-0 truncate text-sm text-white">
              {addressLabel || "Add delivery address"}
            </span>
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

        <Link
          to="/customer/account"
          aria-label="Account"
          className="grid size-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 transition-colors hover:bg-white/20"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <User className="size-5 text-white sm:size-6" aria-hidden="true" />
          )}
        </Link>
      </div>
    </header>
  );
}
