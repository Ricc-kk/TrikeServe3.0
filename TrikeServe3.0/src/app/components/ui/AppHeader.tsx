import type { ReactNode } from "react";
import { Link } from "react-router";
import { BadgeCheck, Bell, MapPin } from "lucide-react";

import { useAuth, type UserRole } from "../../contexts/AuthContext";
import { cn } from "./utils";

/** Service area shown across every role header until terminals are per-user. */
export const SERVICE_AREA = "Gen. T. de Leon, Valenzuela";

const ROLE_META: Record<
  UserRole,
  { title: string; trust: string; areaLabel: string; notificationsHref: string }
> = {
  customer: {
    title: "TrikeServe",
    trust: "Local fares",
    areaLabel: "Serving your area",
    notificationsHref: "/customer/notifications",
  },
  rider: {
    title: "Rider Hub",
    trust: "Verified rider",
    areaLabel: "Dispatch area",
    notificationsHref: "/rider/messages",
  },
  business: {
    title: "Store Hub",
    trust: "Store account",
    areaLabel: "Your store",
    notificationsHref: "/business/dashboard",
  },
  admin: {
    title: "Admin Center",
    trust: "Secure access",
    areaLabel: "Service area",
    notificationsHref: "/admin/approvals",
  },
};

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
  /** Extra content rendered under the header (search bars, service switcher). */
  children?: ReactNode;
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
  children,
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
  const notificationLabel =
    notificationCount > 0
      ? `Notifications, ${notificationCount} unread`
      : "Notifications";

  return (
    <header
      className={cn(
        "relative overflow-hidden bg-ink px-5 pb-7 pt-safe text-white sm:px-7 sm:pt-6",
        className,
      )}
    >
      <div
        className="route-line absolute -right-24 -top-24 size-72 rounded-full"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-4 pt-4 sm:pt-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber shadow-soft">
            <span className="text-lg font-bold text-ink" aria-hidden="true">
              TS
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white/75">
              {resolvedGreeting}
            </p>
            <h1 className="truncate text-2xl font-bold leading-tight tracking-tight">
              {resolvedTitle}
            </h1>
          </div>
        </div>

        <Link
          to={resolvedHref}
          aria-label={notificationLabel}
          className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 transition-colors hover:bg-white/20"
        >
          <Bell className="size-6" aria-hidden="true" />
          {notificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          ) : null}
        </Link>
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
