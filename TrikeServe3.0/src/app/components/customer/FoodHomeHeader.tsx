import { Link } from "react-router";
import { Bell, Heart, MapPin, User } from "lucide-react";

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
};

/**
 * Header for the food-ordering home.
 *
 * A sibling of CustomerHubHeader so the ride hub and the food home read as one
 * product: same mark, same greeting scale, same 44px controls. The three
 * destinations here are notifications, favourites and account — each with a
 * text label or accessible name, never icon-only.
 */
export default function FoodHomeHeader({
  userName,
  avatarUrl,
  unreadCount = 0,
  favoritesCount = 0,
  serviceArea = "Gen. T. de Leon",
}: FoodHomeHeaderProps) {
  const firstName = userName?.trim().split(" ")[0];

  return (
    <header className="bg-[var(--ink-solid)] px-4 pt-safe sm:px-5 sm:pt-5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* The mark is dropped below sm: it is decorative, and its 43px is
              exactly what squeezes the title down to 52px against a 90px need
              when three 44px controls share a 320px row. */}
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
            <p className="flex items-center gap-1 truncate text-xs leading-tight text-white/70">
              <MapPin className="hidden size-3.5 flex-shrink-0 sm:block" aria-hidden="true" />
              <span className="truncate">{serviceArea}</span>
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

        {/* Greeting sits under the title row so the controls keep a full 44px
            column on a 320px screen instead of the name being squeezed. */}
        {firstName && (
          <p className="mt-3 truncate text-sm font-semibold text-white">
            Hi, {firstName}! Kumusta?
          </p>
        )}
      </div>
    </header>
  );
}