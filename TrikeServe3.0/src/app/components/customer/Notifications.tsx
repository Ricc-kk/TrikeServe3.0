import { ArrowLeft, Bell, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Package, Truck, CheckCircle, XCircle, AlertCircle, Gift, Star, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { Card } from "../ui/card";
import BottomNav from "../ui/BottomNav";
import { useState, useEffect } from "react";
import { useCart } from "../../contexts/CartContext";
import { supabaseHelpers } from "@/lib/supabase";

interface Notification {
  id: string;
  type: 'order' | 'delivery' | 'ride' | 'system';
  title: string;
  message: string;
  time: string;
  timestamp: number;
  unread: boolean;
  icon: string;
  actionUrl?: string;
  orderId?: string;
}

export default function Notifications() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/customer");
  const { getTotalItems } = useCart();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Whether the first load has finished. Without it the screen rendered its
  // empty state immediately, and that empty state says "You're all caught up!"
  // -- which is a claim about the account, not about a request still in flight.
  // On a slow connection the list was there a second later, so the page read as
  // "notifications not displaying" rather than as loading.
  const [isLoading, setIsLoading] = useState(true);

  // Load notifications from orders, rides and delivery status updates.
  // Single loader (async) so it never fights with itself: the merged list is
  // saved back to localStorage and re-used on the next poll.
  useEffect(() => {
    loadNotifications();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(loadNotifications, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) {
      setIsLoading(false);
      return;
    }

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;

    // Load saved notifications from localStorage
    const savedNotifications = localStorage.getItem(`notifications_${userEmail}`);
    let notificationsList: Notification[] = savedNotifications ? JSON.parse(savedNotifications) : [];

    // Merge in database-driven delivery notifications (driver status updates)
    // so they persist in the saved list instead of being re-added every poll.
    if (currentUser?.id) {
      const { data } = await supabaseHelpers.getDeliveryNotifications(currentUser.id);
      const existingIds = new Set(notificationsList.map(n => n.id));
      const dbNotifications: Notification[] = (data || []).map((n: any) => ({
        id: `db-${n.id}`,
        type: 'delivery',
        title: n.title || 'Delivery update',
        message: n.message || '',
        time: formatTimeAgo(new Date(n.created_at).getTime()),
        timestamp: new Date(n.created_at).getTime(),
        unread: !n.read,
        icon: '📦',
        actionUrl: n.order_id ? `/customer/order-detail/${n.order_id}` : undefined,
        orderId: n.order_id,
      }));
      const fresh = dbNotifications.filter(d => !existingIds.has(d.id));
      if (fresh.length > 0) {
        notificationsList = [...fresh, ...notificationsList];
      } else {
        // Keep saved read state in sync with the database (e.g. marked read
        // from another tab), without re-adding or toggling anything.
        const dbReadMap = new Map((data || []).map((n: any) => [`db-${n.id}`, !!n.read]));
        notificationsList = notificationsList.map(n =>
          dbReadMap.has(n.id) ? { ...n, unread: !dbReadMap.get(n.id) } : n
        );
      }
      // Mark the database notifications as read (this page is the reader).
      supabaseHelpers.markDeliveryNotificationsRead(currentUser.id);
    }

    // Load orders
    const ordersData = localStorage.getItem(`orders_${userEmail}`);
    if (ordersData) {
      const orders = JSON.parse(ordersData);
      
      // Generate notifications for orders
      orders.forEach((order: any) => {
        const orderTime = new Date(order.createdAt).getTime();
        
        // Check if notification already exists for this order
        const existingNotification = notificationsList.find(n => 
          n.orderId === order.id && n.type === 'order'
        );

        if (!existingNotification) {
          // Create notification based on order status
          let notification: Notification | null = null;

          if (order.status === 'delivered') {
            notification = {
              id: `order-${order.id}-delivered`,
              orderId: order.id,
              type: 'order',
              title: 'Order Delivered!',
              message: `Your order from ${order.restaurantName} has been delivered successfully. Enjoy your meal! 🍔`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '✅',
              actionUrl: `/customer/order-detail/${order.id}`
            };
          } else if (order.status === 'on-the-way') {
            notification = {
              id: `order-${order.id}-on-the-way`,
              orderId: order.id,
              type: 'delivery',
              title: 'Driver on the Way',
              message: `Your driver is on the way with your order from ${order.restaurantName}. Order #${order.id.substring(0, 8)}`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '🛵',
              actionUrl: `/customer/order-detail/${order.id}`
            };
          } else if (order.status === 'confirmed') {
            notification = {
              id: `order-${order.id}-ready-for-delivery`,
              orderId: order.id,
              type: 'delivery',
              title: 'Order Ready for Delivery',
              message: `Your order from ${order.restaurantName} is ready and waiting for a driver. Order #${order.id.substring(0, 8)}`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '📦',
              actionUrl: `/customer/order-detail/${order.id}`
            };
          } else if (order.status === 'preparing') {
            notification = {
              id: `order-${order.id}-preparing`,
              orderId: order.id,
              type: 'order',
              title: 'Order Confirmed',
              message: `Your order from ${order.restaurantName} has been confirmed and is being prepared.`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '🍽️',
              actionUrl: `/customer/order-detail/${order.id}`
            };
          } else if (order.status === 'pending') {
            notification = {
              id: `order-${order.id}-pending`,
              orderId: order.id,
              type: 'order',
              title: 'Order Placed',
              message: `Your order from ${order.restaurantName} has been placed successfully. Total: ₱${order.total.toFixed(2)}`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '🛒',
              actionUrl: `/customer/order-detail/${order.id}`
            };
          }

          if (notification) {
            notificationsList.push(notification);
          }
        }
      });
    }

    // Add welcome notification if this is a new user (no notifications yet)
    if (notificationsList.length === 0) {
      const welcomeNotification: Notification = {
        id: 'welcome',
        type: 'system',
        title: 'Welcome to TrikeServe!',
        message: 'Thank you for joining TrikeServe. Start exploring restaurants and book rides in Gen T Deleon!',
        time: 'Just now',
        timestamp: Date.now(),
        unread: false,
        icon: '👋',
      };
      notificationsList.push(welcomeNotification);
    }

    // Sort by timestamp (newest first)
    notificationsList.sort((a, b) => b.timestamp - a.timestamp);

    // Update time strings
    notificationsList = notificationsList.map(n => ({
      ...n,
      time: formatTimeAgo(n.timestamp)
    }));

    // Save to localStorage and update the UI once.
    localStorage.setItem(`notifications_${userEmail}`, JSON.stringify(notificationsList));
    setNotifications(notificationsList);
    setIsLoading(false);
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <Package className="w-5 h-5 text-[var(--primary)]" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-[var(--teal)]" />;
      case 'ride':
        return <Truck className="w-5 h-5 text-[var(--teal)]" />;
      case 'system':
        return <AlertCircle className="w-5 h-5 text-[var(--muted-foreground)]" />;
      default:
        return <Bell className="w-5 h-5 text-[var(--muted-foreground)]" />;
    }
  };

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'order':
        return 'bg-[var(--error-soft)]';
      case 'delivery':
        return 'bg-[var(--success-soft)]';
      case 'ride':
        return 'bg-[var(--success-soft)]';
      case 'system':
        return 'bg-[var(--muted)]';
      default:
        return 'bg-[var(--muted)]';
    }
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, unread: false })));
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, unread: false } : n
    ));
  };

  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <div className="min-h-screen bg-[var(--muted)] pb-20">
      {/* Header */}
      <div className="bg-[var(--primary)] px-5 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <button 
            onClick={goBack}
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              unreadCount > 0
                ? 'bg-white/20 backdrop-blur-sm text-white active:scale-95'
                : 'bg-white/10 text-white/50 cursor-not-allowed'
            }`}
          >
            Mark All Read
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-white/90 text-sm">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
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
              className={`p-4 border-0 rounded-2xl shadow-md transition-all ${
                notification.actionUrl ? 'cursor-pointer active:scale-[0.98]' : ''
              } ${
                notification.unread 
                  ? 'bg-surface shadow-lg' 
                  : 'bg-white/60'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`w-12 h-12 ${getNotificationBgColor(notification.type)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <span className="text-2xl">{notification.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className={`text-base leading-tight ${
                      notification.unread ? 'font-bold text-[var(--ink)]' : 'font-semibold text-[var(--muted-foreground)]'
                    }`}>
                      {notification.title}
                    </h3>
                    <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                      {notification.time}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${
                    notification.unread ? 'text-[var(--muted-foreground)]' : 'text-[var(--muted-foreground)]'
                  }`}>
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

                {/* Unread Indicator */}
                {notification.unread && (
                  <div className="w-3 h-3 bg-[var(--primary)] rounded-full flex-shrink-0 mt-2"></div>
                )}
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