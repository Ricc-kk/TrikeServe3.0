import { Link } from "react-router";
import {
  Bike,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  Home as HomeIcon,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  ReceiptText,
  Settings,
  ShoppingCart,
  User,
  UserCircle,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { useCart } from "../../contexts/CartContext";

type BottomNavVariant = "customer" | "rider" | "business" | "admin";

type BottomNavProps = {
  /** Which role's navigation to render. */
  variant?: BottomNavVariant;
  /** Key of the currently selected tab, so it can be highlighted. */
  active?: string;
  /** Unread message count to show as a badge on the Messages tab. */
  messagesBadge?: number;
  /** Extra count badges keyed by tab key, e.g. `{ approvals: 3 }`. */
  badges?: Partial<Record<string, number>>;
  /** Admin layout: super admin sees the full set, rider admin a reduced one. */
  adminVariant?: "super" | "rider";
  /** Extra classes for the outer bar (e.g. to adjust the stacking order). */
  className?: string;
};

type NavItem = {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

const ACCENTS: Record<BottomNavVariant, string> = {
  customer: "var(--primary)",
  rider: "var(--rider)",
  business: "var(--primary)",
  admin: "var(--teal)",
};

/**
 * Shared bottom navigation bar for every role.
 *
 * Responsive behaviour:
 * - Scales icons/labels down on small phone widths and up from the `sm` breakpoint.
 * - Uses a grid with equal-width, shrinkable columns so nothing overflows on
 *   narrow screens or in landscape.
 * - Keeps a max-width on tablets/desktop and centres itself.
 * - Adds safe-area padding so the bar is never hidden behind the phone's own
 *   system navigation bar / gesture area.
 */
export default function BottomNav({
  variant = "customer",
  active,
  messagesBadge = 0,
  badges,
  adminVariant = "super",
  className = "",
}: BottomNavProps) {
  const { getTotalItems } = useCart();
  const accent = ACCENTS[variant];
  const inactive = "var(--muted-foreground)";
  const cartCount = variant === "customer" ? getTotalItems() : 0;

  const items: NavItem[] =
    variant === "rider"
      ? [
          { key: "home", to: "/rider", label: "Home", icon: HomeIcon },
          {
            key: "earnings",
            to: "/rider/earnings",
            label: "Earnings",
            icon: DollarSign,
          },
          {
            key: "messages",
            to: "/rider/messages",
            label: "Messages",
            icon: MessageCircle,
            badge: messagesBadge,
          },
          {
            key: "profile",
            to: "/rider/profile",
            label: "Profile",
            icon: UserCircle,
          },
        ]
      : variant === "business"
        ? [
            {
              key: "home",
              to: "/business/dashboard",
              label: "Home",
              icon: HomeIcon,
            },
            {
              key: "orders",
              to: "/business/orders",
              label: "Orders",
              icon: ReceiptText,
            },
            {
              key: "menu",
              to: "/business/menu",
              label: "Menu",
              icon: UtensilsCrossed,
            },
            {
              key: "messages",
              to: "/business/messages",
              label: "Messages",
              icon: MessageCircle,
              badge: messagesBadge,
            },
            {
              key: "account",
              to: "/business/account",
              label: "Account",
              icon: Settings,
            },
          ]
        : variant === "admin"
          ? adminVariant === "rider"
            ? [
                {
                  key: "overview",
                  to: "/admin/dashboard",
                  label: "Overview",
                  icon: LayoutDashboard,
                },
                {
                  key: "terminals",
                  to: "/admin/terminals",
                  label: "Terminals",
                  icon: MapPin,
                },
                {
                  key: "drivers",
                  to: "/admin/users",
                  label: "Drivers",
                  icon: Bike,
                },
                {
                  key: "settings",
                  to: "/admin/settings",
                  label: "Settings",
                  icon: Settings,
                },
              ]
            : [
                {
                  key: "overview",
                  to: "/admin/dashboard",
                  label: "Overview",
                  icon: LayoutDashboard,
                },
                {
                  key: "users",
                  to: "/admin/users",
                  label: "Users",
                  icon: Users,
                },
                {
                  key: "terminals",
                  to: "/admin/terminals",
                  label: "Terminals",
                  icon: MapPin,
                },
                {
                  key: "approvals",
                  to: "/admin/approvals",
                  label: "Approvals",
                  icon: ClipboardCheck,
                },
                {
                  key: "settings",
                  to: "/admin/settings",
                  label: "Settings",
                  icon: Settings,
                },
              ]
          : [
              {
                key: "food",
                to: "/customer/food",
                label: "Home",
                icon: HomeIcon,
              },
              {
                key: "cart",
                to: "/customer/cart",
                label: "Cart",
                icon: ShoppingCart,
                badge: cartCount,
              },
              {
                key: "messages",
                to: "/customer/messages",
                label: "Messages",
                icon: MessageCircle,
                badge: messagesBadge,
              },
              {
                key: "activity",
                to: "/customer/activity",
                label: "Activity",
                icon: ClipboardList,
              },
              {
                key: "account",
                to: "/customer/account",
                label: "Account",
                icon: User,
              },
            ];

  return (
    <nav
      aria-label="Main navigation"
      className={`fixed bottom-0 left-0 right-0 z-[1500] border-t border-line bg-surface/95 backdrop-blur-xl ${className}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={`mx-auto grid w-full max-w-3xl gap-1 px-2 pt-2 sm:px-4 ${
          items.length === 4 ? "grid-cols-4" : "grid-cols-5"
        }`}
      >
        {items.map((item) => {
          const isActive = active === item.key;
          const color = isActive ? accent : inactive;
          const Icon = item.icon;
          const count = item.badge ?? badges?.[item.key] ?? 0;

          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={isActive ? "page" : undefined}
              className="relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-center transition-colors hover:bg-soft"
            >
              <Icon className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" color={color} />
              <span
                className={`w-full truncate text-[10px] leading-tight sm:text-xs ${
                  isActive ? "font-semibold" : ""
                }`}
                style={{ color }}
              >
                {item.label}
              </span>

              {count > 0 ? (
                <span className="absolute right-[22%] top-0 grid min-w-5 place-items-center rounded-full border-2 border-surface bg-primary px-1 text-[10px] font-bold leading-none text-white">
                  <span className="py-1">
                    {count > 99 ? "99+" : count}
                  </span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
