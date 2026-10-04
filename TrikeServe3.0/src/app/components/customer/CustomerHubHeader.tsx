import { Link } from "react-router";
import { Bell, MapPin, User } from "lucide-react";

import { Tricycle } from "../ui/Tricycle";

type CustomerHubHeaderProps = {
  /** Signed-in display name; falls back to a friendly default. */
  userName?: string | null;
  /** Unread notifications for the badge. */
  unreadCount?: number;
  /** Profile picture, when the account has one. */
  avatarUrl?: string | null;
  /** Service area served, e.g. "Gen. T. de Leon". */
  serviceArea?: string;
};

/**
 * The customer app bar.
 *
 * This used to be a floating rounded card pinned over the map. That only worked
 * because the map beneath it never moved — as soon as the home screen became a
 * scrolling feed of restaurants, a floating card clipped the content passing
 * under it. It is now a solid, full-bleed bar with a hairline border and
 * `sticky top-0`, so the greeting, notifications and avatar stay reachable while
 * the customer scrolls, which is the whole point of a top bar.
 *
 * Account lives here rather than in the bottom nav; that is what freed a nav
 * slot for the Food tab. See BottomNav's customer variant.
 */
export default function CustomerHubHeader({
  userName,
  unreadCount = 0,
  avatarUrl,
  serviceArea = "Gen. T. de Leon",
}: CustomerHubHeaderProps) {
  // First name only: at 320px this line has about 120px to work with, and a
  // truncated "Hi, Preview C..." reads far worse than a short clean greeting.
  const firstName = userName?.trim().split(" ")[0];

  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-surface pt-safe">
      {/* max-w + px-4 mirrors the content wrapper below, so the bar and the
          content share one left edge at desktop widths instead of sitting 16px
          apart. */}
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:gap-3 sm:py-3">
        <div className="grid size-10 flex-shrink-0 place-items-center rounded-xl bg-[var(--primary)] sm:size-11">
          <Tricycle className="size-5 text-white sm:size-6" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-[var(--ink)] sm:text-base">
            {firstName ? `Hi, ${firstName}!` : "Kumusta!"}
          </p>
          <p className="flex items-center gap-1 truncate text-xs leading-tight text-[var(--muted-foreground)]">
            {/* The pin is dropped below sm: it costs 18px of a ~106px column,
                which is exactly enough to make the area name ellipsize. */}
            <MapPin className="hidden size-3.5 flex-shrink-0 sm:block" aria-hidden="true" />
            <span className="truncate">{serviceArea}</span>
          </p>
        </div>

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
            <img
              src={avatarUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <User className="size-6 text-[var(--ink)]" aria-hidden="true" />
          )}
        </Link>
      </div>
    </header>
  );
}