import type { ReactNode } from "react";
import { Link } from "react-router";
import { BadgeCheck, Bell, MapPin, Menu } from "lucide-react";

import { useAuth, type UserRole } from "../../contexts/AuthContext";
import { cn } from "./utils";

/** Service area shown across every role header until terminals are per-user. */
export const SERVICE_AREA = "Gen. T. de Leon, Valenzuela";

const ROLE_META: Record<
  UserRole,
  {
    title: string;
    trust: string;
    areaLabel: string;
    notificationsHref: string;
    /** Where the avatar takes you when tapped. */
    settingsHref: string;
  }
> = {
  customer: {
    title: "TrikeServe",
    trust: "Local fares",
    areaLabel: "Serving your area",
    notificationsHref: "/customer/notifications",
    settingsHref: "/customer/account",
  },
  rider: {
    title: "Rider Hub",
    trust: "Verified rider",
    areaLabel: "Dispatch area",
    notificationsHref: "/rider/messages",
    settingsHref: "/rider/profile",
  },
  business: {
    title: "Store Hub",
    trust: "Store account",
    areaLabel: "Your store",
    notificationsHref: "/business/dashboard",
    settingsHref: "/business/account",
  },
  admin: {
    title: "Admin Center",
    trust: "Secure access",
    areaLabel: "Service area",
    notificationsHref: "/admin/approvals",
    settingsHref: "/admin/settings",
  },
};

/** First letters of a name, for the avatar fallback. */
function initialsOf(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type AppHeaderProps = {
  /** Overrides the role taken from the signed-in user. */
  role?: UserRole;
  /** Small line above the title — defaults to a time-aware greeting. */
  greeting?: string;
  /** Large title — defaults to the role's title. */
  title?: string;
  /** Service area / business location shown in the location row. */
  area?: string;
  /** Caption above the area value. */
  areaLabel?: string;
  /** Short trust chip shown on the right of the location row. */
  trust?: string;
  /** Optional short Filipino reassurance line under the title. */
  hint?: string;
  /** Unread count for the notification control. */
  notificationCount?: number;
  /** Route for the notification control; defaults per role. */
  notificationsHref?: string;
  /** When set, the notification control becomes a button running this action. */
  onNotificationsClick?: () => void;
  /** Extra content rendered under the header (search bars, service switcher). */
  children?: ReactNode;
  /**
   * Fallback image used when the signed-in user has no profile photo of their
   * own. A business passes its shop logo here. The user's `avatarUrl` takes
   * precedence, so tapping through to settings always leads to their profile.
   */
  avatarSrc?: string;
  /** Accessible name for the avatar image. */
  avatarAlt?: string;
  /** When set, a hamburger control appears at the head of the header row. */
  onMenuClick?: () => void;
  className?: string;
};

/**
 * Role-aware dark header used by every role's hub.
 *
 * Identity, greeting, service area and notification target are derived from the
 * signed-in user so no role has to hardcode them; each piece can be overridden.
 */
export default function AppHeader({
  role,
  greeting,
  title,
  area,
  areaLabel,
  trust,
  hint,
  notificationCount = 0,
  notificationsHref,
  onNotificationsClick,
  children,
  avatarSrc,
  avatarAlt,
  onMenuClick,
  className,
}: AppHeaderProps) {
  const { user } = useAuth();
  const activeRole: UserRole = role ?? user?.role ?? "customer";
  const meta = ROLE_META[activeRole];
  const firstName = user?.name?.trim().split(/\s+/)[0];

  const resolvedGreeting =
    greeting ?? `${timeOfDayGreeting()}${firstName ? `, ${firstName}` : ""}`;

  const resolvedTitle =
    title ??
    (activeRole === "business"
      ? user?.businessName || meta.title
      : activeRole === "admin" && user?.adminType === "rider"
        ? "Rider Admin Center"
        : meta.title);

  const resolvedArea =
    area ??
    (activeRole === "business"
      ? user?.businessAddress || SERVICE_AREA
      : activeRole === "rider"
        ? user?.terminalName || SERVICE_AREA
        : SERVICE_AREA);

  const resolvedHref = notificationsHref ?? meta.notificationsHref;

  // The signed-in user's own photo, which is what the header should lead with.
  // `avatarSrc` is only a fallback (a business passes its shop logo, so an owner
  // without a profile photo still gets their storefront). The initials replace
  // the old "TS" when neither exists — "TS" said "TrikeServe", not "you", so it
  // read as a watermark next to a personalised greeting.
  const resolvedAvatar = user?.avatarUrl ?? avatarSrc ?? null;
  const avatarInitials = initialsOf(user?.name, user?.email);
  const notificationLabel =
    notificationCount > 0
      ? `Notifications, ${notificationCount} unread`
      : "Notifications";

  const notificationClasses =
    "relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 transition-colors hover:bg-white/20";

  const notificationInner = (
    <>
      <Bell className="size-6" aria-hidden="true" />
      {notificationCount > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-white">
          {notificationCount > 9 ? "9+" : notificationCount}
        </span>
      ) : null}
    </>
  );

  return (
    <header
      className={cn(
        // --ink-solid, not --ink. This is a permanently dark panel carrying white
        // text, and --ink is a *text* token that flips to cream in dark mode --
        // which painted this header cream-on-cream with its own text and left the
        // greeting at roughly 1.1:1. The customer food header has always used
        // --ink-solid here for the same reason.
        "relative overflow-hidden bg-ink-solid px-5 pb-7 pt-safe text-white sm:px-7 sm:pt-6",
        className,
      )}
    >
      <div
        className="route-line absolute -right-24 -top-24 size-72 rounded-full"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-4 pt-4 sm:pt-0">
        <div className="flex min-w-0 items-center gap-3">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 transition-colors hover:bg-white/20"
            >
              <Menu className="size-6" aria-hidden="true" />
            </button>
          ) : null}
          {/*
            The greeting sits alone on the left now.

            The avatar used to sit here, between the menu button and the name, and
            it moved the identity control to the far side of the person it belongs
            to — a shop's logo pressed against its own greeting while the bell had
            the right edge to itself. It is on the right now, next to the bell,
            where the two controls are grouped as controls.
          */}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white/75">
              {resolvedGreeting}
            </p>
            <h1 className="truncate text-2xl font-bold leading-tight tracking-tight">
              {resolvedTitle}
            </h1>
          </div>
        </div>

        {/* Controls, right-aligned: bell first, then the profile. */}
        <div className="flex shrink-0 items-center gap-2">
          {onNotificationsClick ? (
            <button
              type="button"
              onClick={onNotificationsClick}
              aria-label={notificationLabel}
              className={notificationClasses}
            >
              {notificationInner}
            </button>
          ) : (
            <Link
              to={resolvedHref}
              aria-label={notificationLabel}
              className={notificationClasses}
            >
              {notificationInner}
            </Link>
          )}

          <Link
            to={meta.settingsHref}
            aria-label={`${avatarAlt ?? resolvedTitle} — open settings`}
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-amber shadow-soft transition-transform active:scale-95"
          >
            {resolvedAvatar ? (
              <img
                src={resolvedAvatar}
                alt={avatarAlt ?? ""}
                className="size-full object-cover"
              />
            ) : (
              // Same reason as the header background: --ink flips to cream in dark
              // mode, and the amber monogram plate is light there, so the initials
              // would sit cream on cream.
              <span className="text-base font-bold text-ink-solid" aria-hidden="true">
                {avatarInitials}
              </span>
            )}
          </Link>
        </div>
      </div>

      {hint ? (
        <p className="relative mt-3 text-sm text-white/70">{hint}</p>
      ) : null}

      <div className="relative mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
        <MapPin className="size-5 shrink-0 text-amber" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70">{areaLabel ?? meta.areaLabel}</p>
          <p className="truncate font-bold">{resolvedArea}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-mint">
          <BadgeCheck className="size-4" aria-hidden="true" />
          <span className="text-xs font-bold">{trust ?? meta.trust}</span>
        </div>
      </div>

      {children ? <div className="relative mt-5">{children}</div> : null}
    </header>
  );
}
