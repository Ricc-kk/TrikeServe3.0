import { ArrowLeft, Bell, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { Card } from "../ui/card";
import BottomNav from "../ui/BottomNav";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

interface Notification {
  id: string;
  type: 'order' | 'delivery' | 'ride' | 'system';
  title: string;
  message: string;
  time: string;
  timestamp: number;
  unread: boolean;
  actionUrl?: string;
  orderId?: string;
}

export default function Notifications() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/customer");
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const loadGenerationRef = useRef(0);
  const isClearingRef = useRef(false);
  // Whether the first load has finished. Without it the screen rendered its
  // empty state immediately, and that empty state says "You're all caught up!"
  // -- which is a claim about the account, not about a request still in flight.
  // On a slow connection the list was there a second later, so the page read as
  // "notifications not displaying" rather than as loading.
  const [isLoading, setIsLoading] = useState(true);

  /*
   * Who to load for.
   *
   * Read from the auth context, never from `trikeserve_current_user`. That key is
   * in localStorage, which every tab on this origin shares, so it names whoever
   * signed in *last anywhere* -- not who this screen belongs to. Signing in as the
   * business in one tab used to leave a customer tab's 5-second poll reading the
   * business's id, and it quietly listed the business's own notifications
   * ("New Order Received") under the customer's account.
   */
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  // Load notifications from orders, rides and delivery status updates.
  // Single loader (async) so it never fights with itself: the merged list is
  // saved back to localStorage and re-used on the next poll.
  //
  // Re-runs when the signed-in user changes, so the list follows the account
  // instead of keeping the previous one's rows.
  useEffect(() => {
    loadGenerationRef.current += 1;
    loadNotifications();

    // Poll for updates every 5 seconds
    const interval = setInterval(loadNotifications, 5000);

    return () => clearInterval(interval);
  }, [userId, userEmail]);

  const loadNotifications = async () => {
    if (!userId || !userEmail) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    if (isClearingRef.current) return;

    const loadGeneration = loadGenerationRef.current;
    const clearedAt = Number(localStorage.getItem("notifications_cleared_" + userId) || 0);
    const ordersData = localStorage.getItem("orders_" + userEmail);
    const orders: any[] = ordersData ? JSON.parse(ordersData) : [];
    const localOrderNumberById = new Map<string, string>();
    orders.forEach((order) => {
      if (order.id && order.orderNumber) {
        localOrderNumberById.set(String(order.id), String(order.orderNumber));
      }
    });
    const readLocalNotifications = (key: string): Notification[] => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };

    let notificationsList = [
      ...readLocalNotifications("notifications_" + userEmail),
      ...(userId !== userEmail ? readLocalNotifications("notifications_" + userId) : []),
    ].filter((notification) =>
      notification.id !== "welcome" && Number(notification.timestamp) > clearedAt
    );

    // Prefer the latest database status for each order, collapsing duplicate rows
    // left by older versions into the same visible notification.
    const { data } = await supabaseHelpers.getDeliveryNotifications(userId);
    if (loadGeneration !== loadGenerationRef.current) return;

    const latestDatabaseByOrder = new Map<string, Notification>();
    const databaseOrderNumbers = new Set<string>();
    const databaseWithoutOrder: Notification[] = [];
    (data || []).forEach((row: any) => {
      const timestamp = new Date(row.created_at).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= clearedAt) return;
      if (row.order_id && row.order_number) databaseOrderNumbers.add(String(row.order_number));

      const notification: Notification = {
        id: row.order_id ? "order-" + row.order_id : "db-" + row.id,
        type: row.type === "order" ? "order" : "delivery",
        title: row.title || "Delivery update",
        message: row.message || "",
        time: formatTimeAgo(timestamp),
        timestamp,
        unread: !row.read,
        actionUrl: row.order_id ? "/customer/order-detail/" + row.order_id : undefined,
        orderId: row.order_id || undefined,
      };

      if (!notification.orderId) {
        databaseWithoutOrder.push(notification);
        return;
      }
      const current = latestDatabaseByOrder.get(notification.orderId);
      if (!current || notification.timestamp > current.timestamp) {
        latestDatabaseByOrder.set(notification.orderId, notification);
      }
    });

    const databaseOrderIds = new Set(latestDatabaseByOrder.keys());
    notificationsList = notificationsList.filter(
      (notification) => {
        if (!notification.orderId) return true;
        const localOrderNumber = localOrderNumberById.get(notification.orderId);
        return !databaseOrderIds.has(notification.orderId) &&
          !(localOrderNumber && databaseOrderNumbers.has(localOrderNumber));
      }
    );
    notificationsList.push(...databaseWithoutOrder, ...latestDatabaseByOrder.values());

    // The database is authoritative for orders that have a server notification.
    // Local order data fills gaps and updates one stable notification per order.
    if (ordersData) {
      orders.forEach((order: any) => {
        if (!order.id || databaseOrderIds.has(order.id) ||
          (order.orderNumber && databaseOrderNumbers.has(String(order.orderNumber)))) return;

        const createdAt = new Date(order.createdAt).getTime();
        const updatedAt = new Date(order.updatedAt || order.statusUpdatedAt || order.createdAt).getTime();
        const statusTime = Number.isFinite(updatedAt) ? updatedAt : createdAt;
        if (!Number.isFinite(statusTime) || statusTime <= clearedAt) return;

        let title = "";
        let message = "";
        let type: Notification["type"] = "order";
        if (order.status === "delivered") {
          title = "Order Delivered";
          message = "Your order from " + order.restaurantName + " has been delivered successfully. Enjoy your meal!";
        } else if (order.status === "on-the-way") {
          type = "delivery";
          title = "Driver on the Way";
          message = "Your driver is on the way with your order from " + order.restaurantName + ". Order #" + String(order.id).substring(0, 8);
        } else if (order.status === "confirmed") {
          type = "delivery";
          title = "Order Ready for Delivery";
          message = "Your order from " + order.restaurantName + " is ready and waiting for a driver. Order #" + String(order.id).substring(0, 8);
        } else if (order.status === "preparing") {
          title = "Order Confirmed";
          message = "Your order from " + order.restaurantName + " has been confirmed and is being prepared.";
        } else if (order.status === "pending") {
          title = "Order Placed";
          message = "Your order from " + order.restaurantName + " has been placed successfully. Total: \u20B1" + Number(order.total || 0).toFixed(2);
        }

        if (!title) return;
        const existingIndex = notificationsList.findIndex((notification) => notification.orderId === order.id);
        const existing = existingIndex >= 0 ? notificationsList[existingIndex] : undefined;
        const statusChanged = !existing || existing.title !== title || existing.message !== message;
        const notification: Notification = {
          id: "order-" + order.id,
          orderId: order.id,
          type,
          title,
          message,
          time: formatTimeAgo(statusChanged ? Math.max(statusTime, Date.now()) : existing.timestamp),
          timestamp: statusChanged ? Math.max(statusTime, Date.now()) : existing.timestamp,
          unread: statusChanged ? true : existing.unread,
          actionUrl: "/customer/order-detail/" + order.id,
        };
        if (existingIndex >= 0) notificationsList[existingIndex] = notification;
        else notificationsList.push(notification);
      });
    }

    // Deduplicate order records saved by older builds and drop legacy emoji icons.
    const uniqueNotifications = new Map<string, Notification>();
    notificationsList.forEach((notification) => {
      const key = notification.orderId
        ? "order:" + notification.orderId
        : "notification:" + notification.id;
      const existing = uniqueNotifications.get(key);
      if (!existing || notification.timestamp >= existing.timestamp) {
        uniqueNotifications.set(key, notification);
      }
    });
    notificationsList = Array.from(uniqueNotifications.values())
      .map((notification) => ({
        ...notification,
        title: cleanNotificationText(notification.title),
        message: cleanNotificationText(notification.message),
        time: formatTimeAgo(notification.timestamp),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (loadGeneration !== loadGenerationRef.current) return;
    localStorage.setItem("notifications_" + userEmail, JSON.stringify(notificationsList));
    setNotifications(notificationsList);
    setIsLoading(false);

    // This screen is the reader for database-backed delivery notifications.
    supabaseHelpers.markDeliveryNotificationsRead(userId);
  };
  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  const cleanNotificationText = (value: string) => value
    .replace(/\u00E2\u201A\u00B1/g, "\u20B1")
    .replace(/(?:\u00F0\u0178|\u00E2\u0153|\u00E2\u009D|\u00E2\u2020|\u00EF\u00B8)[^\s]*/gu, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const clearNotifications = async () => {
    if (!userId || !userEmail || isClearingRef.current) return;
    loadGenerationRef.current += 1;
    isClearingRef.current = true;
    setIsClearing(true);
    setClearError("");

    const { error } = await supabaseHelpers.clearDeliveryNotifications(userId);
    if (error) {
      setClearError("Could not clear notifications. Please try again.");
      isClearingRef.current = false;
      setIsClearing(false);
      return;
    }

    const clearedAt = Date.now();
    localStorage.setItem("notifications_cleared_" + userId, String(clearedAt));
    localStorage.removeItem("notifications_" + userEmail);
    localStorage.removeItem("notifications_" + userId);
    setNotifications([]);
    isClearingRef.current = false;
    setIsClearing(false);
  };

  const persistNotifications = (updatedNotifications: Notification[]) => {
    setNotifications(updatedNotifications);
    if (userEmail) {
      localStorage.setItem("notifications_" + userEmail, JSON.stringify(updatedNotifications));
    }
    if (userId && userId !== userEmail) {
      localStorage.setItem("notifications_" + userId, JSON.stringify(updatedNotifications));
    }
  };

  const markAllAsRead = () => {
    persistNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  const markAsRead = (id: string) => {
    persistNotifications(notifications.map(n =>
      n.id === id ? { ...n, unread: false } : n
    ));
  };

  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <div className="min-h-screen bg-[var(--muted)] pb-20">
      {/* Header */}
      <div className="bg-[var(--primary)] px-5 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Go back"
              onClick={goBack}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-all active:scale-90"
            >
              <ArrowLeft className="size-6 text-white" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-white sm:text-2xl">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-white/90">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                unreadCount > 0
                  ? 'bg-white/20 text-white active:scale-95'
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              }`}
            >
              Mark All Read
            </button>
            <button
              type="button"
              onClick={clearNotifications}
              disabled={notifications.length === 0 || isClearing}
              aria-label="Clear all notifications"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                notifications.length > 0 && !isClearing
                  ? 'bg-white/20 text-white active:scale-95'
                  : 'bg-white/10 text-white/50 cursor-not-allowed'
              }`}
            >
              <Trash2 className="size-3.5" />
              {isClearing ? 'Clearing...' : 'Clear All'}
            </button>
          </div>
        </div>
        {clearError && <p role="alert" className="mt-2 text-right text-xs font-medium text-white">{clearError}</p>}
      </div>

      {/* Notifications List */}
      {isLoading && notifications.length === 0 ? (
        /*
         * A pending state rather than the empty state below.
         *
         * The empty state is a statement about the account -- "you're all caught
         * up" -- so showing it before the first load lands tells the reader they
         * have no notifications when the truth is that nobody has asked yet.
         */
        <div className="flex flex-col items-center justify-center py-20 px-5">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading notifications…</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-5">
          <div className="w-24 h-24 bg-[var(--muted)] rounded-full flex items-center justify-center mb-4">
            <Bell className="w-12 h-12 text-[var(--muted-foreground)]" />
          </div>
          <h3 className="text-xl font-bold text-[var(--ink)] mb-2">No Notifications</h3>
          <p className="text-sm text-[var(--muted-foreground)] text-center">
            You're all caught up! Check back later for updates.
          </p>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              onClick={() => {
                markAsRead(notification.id);
                if (notification.actionUrl) {
                  navigate(notification.actionUrl);
                }
              }}
              className={`rounded-2xl border border-l-4 p-4 transition-all duration-200 ${
                notification.actionUrl ? 'cursor-pointer active:scale-[0.98]' : ''
              } ${
                notification.unread
                  ? 'border-line border-l-[var(--primary)] bg-surface shadow-lg shadow-[var(--primary)]/10'
                  : 'border-line border-l-transparent bg-surface shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                    <h3 className={`line-clamp-1 text-base leading-tight text-black dark:text-white ${notification.unread ? 'font-bold' : 'font-semibold'}`}>
                      {notification.title}
                    </h3>
                    {notification.unread && <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--primary)]">New</span>}
                    </div>
                    <span className="text-xs text-black dark:text-white whitespace-nowrap">
                      {notification.time}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-black dark:text-white">
                    {notification.message}
                  </p>
                  {notification.actionUrl && (
                    /*
                     * A real control, not decoration.

                     * This was a bare <button> with no onClick at all -- it looked
                     * like the way in and did nothing on its own, relying entirely
                     * on the click bubbling to the card's handler. Anything that
                     * stops propagation, or any change to the card's markup, silently
                     * kills the one route to the order. So it carries the navigation
                     * itself.

                     * `stopPropagation` keeps the card's own handler from also firing,
                     * which would otherwise mark the row read a second time and push
                     * a second history entry via the card's navigate.
                     */
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                        navigate(notification.actionUrl!);
                      }}
                      aria-label={`View details${notification.title ? ` for ${notification.title}` : ""}`}
                      className="mt-2 text-xs font-bold text-[var(--primary)] hover:underline"
                    >
                      View Details →
                    </button>
                  )}
                </div>

              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
