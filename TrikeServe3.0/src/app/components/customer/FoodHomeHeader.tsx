import { Link } from "react-router";
import { Bell, ChevronRight, Heart, MapPin, User } from "lucide-react";

type FoodHomeHeaderProps = {
  /** Signed-in display name; falls back to a friendly default. */
  userName?: string | null;
  /** Profile picture, when the account has one. */
  avatarUrl?: string | null;
  /** Unread notifications. */
  unreadCount?: number;
  /** Saved restaurants count. */
  favoritesCount?: number;
  serviceArea?: string;
  /** Renders the back control when provided. */
  onBack?: () => void;
  /** Current delivery address; omit to hide the address row. */
  addressLabel?: string | null;
  /** Opens the address picker. */
  onOpenAddress?: () => void;
};

/**
 * Header for the food-ordering home.
 *
 * A sibling of CustomerHubHeader so the ride hub and the food home read as one
 * product: same mark, same greeting scale, same 44px controls. The three
 * destinations here are notifications, favourites and account — each with a
 * text label or accessible name, never icon-only.
 *
 * The address row is the food equivalent of the ride pickup field: it is the
 * single place that says where the order goes, and it is tappable so the
 * customer can change it without hunting.
 */
export default function FoodHomeHeader({
  userName,
  avatarUrl,
  unreadCount = 0,
  favoritesCount = 0,
  serviceArea = "Gen. T. de Leon",
  onBack,
  addressLabel,
  onOpenAddress,
}: FoodHomeHeaderProps) {
  const firstName = userName?.trim().split(" ")[0];

  return (
    <header className="bg-[var(--ink-solid)] px-4 pt-safe sm:px-5 sm:pt-5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="grid size-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            >
              <ChevronRight className="size-6 rotate-180 text-white" aria-hidden="true" />
            </button>
          )}

          {/* The mark is dropped below sm: it is decorative, and it competes for
              the width the title and the controls need at 320px. */}
          <div className="hidden size-11 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary)] sm:grid">
            <span
              className="text-base font-bold text-[var(--primary-foreground)] sm:text-lg"
              aria-hidden="true"
            >
              TS
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-white sm:text-lg">
              Order Food
            </h1>
            <p className="truncate text-xs leading-tight text-white/70">
              {serviceArea}
            </p>
          </div>

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
            aria-label={
              favoritesCount > 0 ? `Favorites, ${favoritesCount} saved` : "Favorites"
            }
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

        {/* Greeting and delivery address sit under the title row so the controls
            keep a full 44px column at 320px instead of the name being squeezed. */}
        {(firstName || addressLabel) && (
          <div className="mt-3 flex items-center gap-2">
            {firstName && (
              <p className="shrink-0 text-sm font-semibold text-white">
                Hi, {firstName}!
              </p>
            )}

            {onOpenAddress && (
              <button
                type="button"
                onClick={onOpenAddress}
                aria-label={`Deliver to ${addressLabel || "no address set"}. Change delivery address`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-left transition-colors hover:bg-white/20"
              >
                <MapPin className="size-4 flex-shrink-0 text-white" aria-hidden="true" />
                <span className="min-w-0 truncate text-xs text-white">
                  {addressLabel || "Add delivery address"}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}