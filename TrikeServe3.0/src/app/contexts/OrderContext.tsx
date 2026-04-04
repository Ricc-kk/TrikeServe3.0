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

  // Function to load orders from localStorage
  const loadOrders = () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (currentUserData) {
      const currentUser = JSON.parse(currentUserData);
      const userEmail = currentUser.email;
      const userRole = currentUser.role;
      
      // Load from appropriate key based on user role
      let ordersKey: string;
      if (userRole === 'business') {
        ordersKey = `business_orders_${userEmail}`;
      } else {
        ordersKey = `orders_${userEmail}`;
      }
      
      const savedOrders = localStorage.getItem(ordersKey);
      if (savedOrders) {
        const parsedOrders = JSON.parse(savedOrders);
        // Only update if orders have changed to prevent unnecessary re-renders
        setOrders(prevOrders => {
          if (JSON.stringify(prevOrders) !== JSON.stringify(parsedOrders)) {
            return parsedOrders;
          }
          return prevOrders;
        });
      }
      setIsLoaded(true);
    }
  };

  // Load orders on mount and set up polling for real-time updates
  useEffect(() => {
    loadOrders();
    
    // Poll for updates every 2 seconds
    const interval = setInterval(loadOrders, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Save orders to localStorage whenever they change (but only after initial load)
  useEffect(() => {
    if (!isLoaded) return; // Don't save on initial load
    
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (currentUserData) {
      const currentUser = JSON.parse(currentUserData);
      const userEmail = currentUser.email;
      const userRole = currentUser.role;
      
      // Save to appropriate key based on user role
      let ordersKey: string;
      if (userRole === 'business') {
        ordersKey = `business_orders_${userEmail}`;
      } else {
        ordersKey = `orders_${userEmail}`;
      }
      
      localStorage.setItem(ordersKey, JSON.stringify(orders));
    }
  }, [orders, isLoaded]);

  const addOrder = (order: Order) => {
    // Save to customer's orders
    setOrders((prev) => [order, ...prev]);
    
    // Also save to business owner's orders if restaurantEmail exists
    if (order.restaurantEmail) {
      const businessOrdersKey = `business_orders_${order.restaurantEmail}`;
      const existingBusinessOrders = localStorage.getItem(businessOrdersKey);
      const businessOrders = existingBusinessOrders ? JSON.parse(existingBusinessOrders) : [];
      businessOrders.unshift(order);
      localStorage.setItem(businessOrdersKey, JSON.stringify(businessOrders));
      
      // Create notification for business owner
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
      
      // If order has restaurantEmail, update business orders too
      if (updatedOrder?.restaurantEmail) {
        const businessOrdersKey = `business_orders_${updatedOrder.restaurantEmail}`;
        const existingBusinessOrders = localStorage.getItem(businessOrdersKey);
        if (existingBusinessOrders) {
          const businessOrders = JSON.parse(existingBusinessOrders);
          const updatedBusinessOrders = businessOrders.map((order: Order) =>
            order.id === id ? { ...order, status } : order
          );
          localStorage.setItem(businessOrdersKey, JSON.stringify(updatedBusinessOrders));
        }
      }
      
      // If order has customerEmail, update customer orders too
      if (updatedOrder?.customerEmail) {
        const customerOrdersKey = `orders_${updatedOrder.customerEmail}`;
        const existingCustomerOrders = localStorage.getItem(customerOrdersKey);
        if (existingCustomerOrders) {
          const customerOrders = JSON.parse(existingCustomerOrders);
          const updatedCustomerOrders = customerOrders.map((order: Order) =>
            order.id === id ? { ...order, status } : order
          );
          localStorage.setItem(customerOrdersKey, JSON.stringify(updatedCustomerOrders));
        }
      }
      
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