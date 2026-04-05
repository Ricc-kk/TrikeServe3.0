import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface CustomizationSelection {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  price: number;
}

export interface OrderItem {
  id: number;
  name: string;
  description: string;
  price: number;
  quantity: number;
  image: string;
  category: string;
  customizations?: CustomizationSelection[];
}

export interface Order {
  id: string;
  orderNumber: string;
  restaurantName: string;
  restaurantImage: string;
  restaurantEmail?: string; // Business owner email
  customerEmail?: string; // Customer email
  customerName?: string; // Customer name
  customerPhone?: string; // Customer phone
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: "pending" | "preparing" | "on-the-way" | "delivered" | "cancelled";
  deliveryMode: "delivery" | "pickup";
  paymentMethod: "cash" | "gcash";
  address: string;
  date: string;
  createdAt: string; // ISO timestamp
  estimatedTime: string;
  needsCutlery: boolean;
}

interface OrderContextType {
  orders: Order[];
  addOrder: (order: Order) => void;
  getOrderById: (id: string) => Order | undefined;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Function to load orders from Supabase (called by child components)
  // No longer loading from localStorage - all orders come from Supabase
  const loadOrders = () => {
    // This function is kept for backward compatibility but no longer loads from localStorage
    // Child components (Activity, BusinessOrders) now handle fetching from Supabase
    setIsLoaded(true);
  };

  // Load orders on mount and set up polling for real-time updates
  useEffect(() => {
    loadOrders();
    
    // Poll for updates every 2 seconds
    const interval = setInterval(loadOrders, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const addOrder = (order: Order) => {
    console.log('[OrderContext] Adding order (stored in Supabase):', order.restaurantEmail);

    // Update local state for immediate UI update
    setOrders((prev) => [order, ...prev]);
    
    // Create notification for business owner
    if (order.restaurantEmail) {
      const businessNotificationsKey = `notifications_${order.restaurantEmail}`;
      const existingNotifications = localStorage.getItem(businessNotificationsKey);
      const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
      
      const notification = {
        id: `order-${order.id}`,
        type: 'order',
        title: 'New Order Received!',
        message: `New order #${order.orderNumber} from ${order.customerName || 'Customer'}. Total: ₱${order.total.toFixed(2)}`,
        time: 'Just now',
        timestamp: Date.now(),
        unread: true,
        icon: '🛒',
        orderId: order.id,
        actionUrl: '/business/orders'
      };
      
      notifications.unshift(notification);
      localStorage.setItem(businessNotificationsKey, JSON.stringify(notifications));
      console.log('[OrderContext] Notification created for restaurant:', businessNotificationsKey);
    } else {
      console.warn('[OrderContext] Order has no restaurantEmail! Order:', order);
    }
  };

  const getOrderById = (id: string) => {
    return orders.find((order) => order.id === id);
  };

  const updateOrderStatus = (id: string, status: Order["status"]) => {
    setOrders((prev) => {
      const updatedOrders = prev.map((order) =>
        order.id === id ? { ...order, status } : order
      );
      
      // Find the updated order
      const updatedOrder = updatedOrders.find(o => o.id === id);
      
      // Orders are updated in Supabase, no need to update localStorage

      return updatedOrders;
    });
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        addOrder,
        getOrderById,
        updateOrderStatus,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}