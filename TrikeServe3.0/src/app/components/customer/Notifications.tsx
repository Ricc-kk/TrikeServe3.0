import { ArrowLeft, Bell, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Package, Truck, CheckCircle, XCircle, AlertCircle, Gift, Star, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { useState, useEffect } from "react";
import { useCart } from "../../contexts/CartContext";

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
  const { getTotalItems } = useCart();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load notifications from orders and rides
  useEffect(() => {
    loadNotifications();
    
    // Poll for updates every 2 seconds for real-time notifications
    const interval = setInterval(loadNotifications, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) return;

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;

    // Load saved notifications from localStorage
    const savedNotifications = localStorage.getItem(`notifications_${userEmail}`);
    let notificationsList: Notification[] = savedNotifications ? JSON.parse(savedNotifications) : [];

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
              title: 'Rider on the Way',
              message: `Your rider is on the way with your order from ${order.restaurantName}. Order #${order.id.substring(0, 8)}`,
              time: formatTimeAgo(orderTime),
              timestamp: orderTime,
              unread: true,
              icon: '🛵',
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
        message: 'Thank you for joining TrikeServe. Start exploring restaurants and book rides in Tagalag!',
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

    setNotifications(notificationsList);
    
    // Save to localStorage
    localStorage.setItem(`notifications_${userEmail}`, JSON.stringify(notificationsList));
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
        return <Package className="w-5 h-5 text-[#E11D48]" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-[#18B5A4]" />;
      case 'ride':
        return <Truck className="w-5 h-5 text-[#18B5A4]" />;
      case 'system':
        return <AlertCircle className="w-5 h-5 text-[#64748B]" />;
      default:
        return <Bell className="w-5 h-5 text-[#64748B]" />;
    }
  };

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'order':
        return 'bg-[#FEF2F2]';
      case 'delivery':
        return 'bg-[#ECFDF5]';
      case 'ride':
        return 'bg-[#ECFDF5]';
      case 'system':
        return 'bg-[#F8F9FA]';
      default:
        return 'bg-[#F8F9FA]';
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
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] px-5 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <button 
            onClick={() => navigate(-1)}
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
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-5">
          <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mb-4">
            <Bell className="w-12 h-12 text-[#94A3B8]" />
          </div>
          <h3 className="text-xl font-bold text-[#121212] mb-2">No Notifications</h3>
          <p className="text-sm text-[#64748B] text-center">
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
                  ? 'bg-white shadow-lg' 
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
                      notification.unread ? 'font-bold text-[#121212]' : 'font-semibold text-[#64748B]'
                    }`}>
                      {notification.title}
                    </h3>
                    <span className="text-xs text-[#94A3B8] whitespace-nowrap">
                      {notification.time}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${
                    notification.unread ? 'text-[#64748B]' : 'text-[#94A3B8]'
                  }`}>
                    {notification.message}
                  </p>
                  {notification.actionUrl && (
                    <button className="mt-2 text-xs font-bold text-[#E11D48] hover:underline">
                      View Details →
                    </button>
                  )}
                </div>

                {/* Unread Indicator */}
                {notification.unread && (
                  <div className="w-3 h-3 bg-[#E11D48] rounded-full flex-shrink-0 mt-2"></div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1 relative">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            {getTotalItems() > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{getTotalItems()}</span>
              </div>
            )}
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}