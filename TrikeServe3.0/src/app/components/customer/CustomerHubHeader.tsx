import { Link } from "react-router";
import { Bell, MapPin, Search, User, X } from "lucide-react";

type CustomerHubHeaderProps = {
  /** Unread notifications for the badge. */
  unreadCount?: number;
  /** Profile picture, when the account has one. */
  avatarUrl?: string | null;
  /** True once the customer has tapped into search. */
  searching?: boolean;
  /** Current location line shown above the search field while searching. */
  locationLabel?: string;
  /** Live value of the search field. */
  query?: string;
  onQueryChange?: (next: string) => void;
  onOpenSearch?: () => void;
  onCloseSearch?: () => void;
  onSubmitSearch?: () => void;
};

/**
 * The customer app bar.
 *
 * This used to lead with a tricycle badge, a "Hi, {name}!" greeting and the
 * service area. Three lines of chrome, none of which a customer acts on, and
 * they pushed the feed below the fold on a phone. Search is the thing people
 * actually come to a ride-and-food app for, so it takes that space.
 *
 * Tapping the field enters search mode, which swaps the badge for a back
 * control and adds the customer's location above the field — in a search box
 * "where am I" is the first thing you want to know, not something buried
 * behind the notifications icon.
 */
export default function CustomerHubHeader({
  unreadCount = 0,
  avatarUrl,
  searching = false,
  locationLabel,
  query = "",
  onQueryChange,
  onOpenSearch,
  onCloseSearch,
  onSubmitSearch,
}: CustomerHubHeaderProps) {
  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-surface pt-safe">
      <div className="mx-auto max-w-3xl px-4 py-2.5 sm:py-3">
        {searching && locationLabel ? (
          <p className="mb-1.5 flex items-center gap-1.5 truncate px-1 text-xs text-[var(--muted-foreground)]">
            <MapPin className="size-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </p>
        ) : null}

        <div className="flex items-center gap-2 sm:gap-3">
          {searching ? (
            <button
              type="button"
              onClick={onCloseSearch}
              aria-label="Close search"
              className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--muted)] transition-colors hover:bg-[var(--soft)] sm:size-11"
            >
              <X className="size-5 text-[var(--ink)]" aria-hidden="true" />
            </button>
          ) : null}

          <form
            className="min-w-0 flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitSearch?.();
            }}
          >
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d6d3ca] bg-white px-3 sm:min-h-12">
              <Search
                className="size-5 flex-shrink-0 text-[#5c6b68]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onFocus={onOpenSearch}
                onChange={(e) => onQueryChange?.(e.target.value)}
                placeholder="Search restaurants, terminals"
                aria-label="Search restaurants and terminals"
                className="min-w-0 flex-1 bg-transparent text-base text-[#122724] outline-none placeholder:text-[#5c6b68]"
              />
            </div>
          </form>

          <Link
            to="/customer/notifications"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            className="relative grid size-11 flex-shrink-0 place-items-center rounded-xl bg-[var(--muted)] transition-colors hover:bg-[var(--soft)] sm:size-12"
          >
            <Bell className="size-6 text-[var(--primary)]" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]">
                <span className="text-[10px] font-bold leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </span>
            )}
          </Link>

          <Link
            to="/customer/account"
            aria-label="Account"
            className="grid size-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--muted)] transition-colors hover:bg-[var(--soft)] sm:size-12"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
              <User className="size-6 text-[var(--ink)]" aria-hidden="true" />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}