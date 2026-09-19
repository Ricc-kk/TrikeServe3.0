import { Link } from "react-router";
import {
  Home as HomeIcon,
  ShoppingCart,
  MessageCircle,
  ClipboardList,
  User,
  DollarSign,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import { useCart } from "../../contexts/CartContext";

type CustomerKey = "food" | "cart" | "messages" | "activity" | "account";
type RiderKey = "home" | "earnings" | "messages" | "profile";

type BottomNavProps = {
  /** Which role's navigation to render. */
  variant?: "customer" | "rider";
  /** Key of the currently selected tab, so it can be highlighted. */
  active?: CustomerKey | RiderKey | string;
  /** Unread message count to show as a badge on the Messages tab. */
  messagesBadge?: number;
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

/**
 * Shared bottom navigation bar.
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
  className = "",
}: BottomNavProps) {
  const { getTotalItems } = useCart();
  const isRider = variant === "rider";
  const accent = isRider ? "#00A854" : "#E11D48";
  const inactive = "#64748B";
  const cartCount = isRider ? 0 : getTotalItems();

  const items: NavItem[] = isRider
    ? [
        { key: "home", to: "/rider", label: "Home", icon: HomeIcon },
        { key: "earnings", to: "/rider/earnings", label: "Earnings", icon: DollarSign },
        {
          key: "messages",
          to: "/rider/messages",
          label: "Messages",
          icon: MessageCircle,
          badge: messagesBadge,
        },
        { key: "profile", to: "/rider/profile", label: "Profile", icon: UserCircle },
      ]
    : [
        { key: "food", to: "/customer/food", label: "Home", icon: HomeIcon },
        { key: "cart", to: "/customer/cart", label: "Cart", icon: ShoppingCart, badge: cartCount },
        {
          key: "messages",
          to: "/customer/messages",
          label: "Messages",
          icon: MessageCircle,
          badge: messagesBadge,
        },
        { key: "activity", to: "/customer/activity", label: "Activity", icon: ClipboardList },
        { key: "account", to: "/customer/account", label: "Account", icon: User },
      ];

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] z-[1500] ${className}`}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={`mx-auto grid w-full max-w-6xl gap-1 px-2 pt-2 sm:px-4 sm:pt-2.5 ${
          isRider ? "grid-cols-4" : "grid-cols-5"
        }`}
      >
        {items.map((item) => {
          const isActive = active === item.key;
          const color = isActive ? accent : inactive;
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={isActive ? "page" : undefined}
              className="relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-center transition-colors active:bg-gray-50"
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

              {item.badge && item.badge > 0 ? (
                <div className="absolute right-[22%] top-0 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#E11D48] px-1">
                  <span className="text-[10px] font-bold leading-none text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
