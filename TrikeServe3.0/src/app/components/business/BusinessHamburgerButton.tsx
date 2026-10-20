import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "../../../lib/supabase";

interface BusinessHamburgerButtonProps {
  onClick: () => void;
  className: string;
  iconClassName: string;
  label?: string;
}

/** Mobile navigation control with the business user's unread notification count. */
export default function BusinessHamburgerButton({
  onClick,
  className,
  iconClassName,
  label = "Open navigation",
}: BusinessHamburgerButtonProps) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const recipientId = user?.id;
    if (!recipientId) {
      setUnreadCount(0);
      return;
    }

    setUnreadCount(0);
    let active = true;
    const loadUnreadCount = async () => {
      const { data, error } = await supabaseHelpers.getDeliveryNotifications(recipientId);
      if (!active) return;
      if (error) {
        console.error("[BusinessHamburgerButton] Could not load notifications:", error.message);
        return;
      }

      // Match the dashboard list: one latest notification per order, plus each
      // independent system notification without an order id.
      const seenOrders = new Set<string>();
      let count = 0;
      for (const notification of data ?? []) {
        if (notification.order_id) {
          const orderId = String(notification.order_id);
          if (seenOrders.has(orderId)) continue;
          seenOrders.add(orderId);
        }
        if (!notification.read) count += 1;
      }
      setUnreadCount(count);
    };

    void loadUnreadCount();
    const interval = window.setInterval(() => void loadUnreadCount(), 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const accessibleLabel = unreadCount > 0
    ? `${label}, ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
    : label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleLabel}
      className={`${className} relative`}
    >
      <Menu className={iconClassName} aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
