import { useState, useEffect } from "react";
import { Store, Package, Clock, User, ChevronRight, CheckCircle, XCircle, AlertCircle, Menu, Bike, MapPin } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import BusinessSidebar from "./BusinessSidebar";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  subtotal: number;
  status: 'pending' | 'preparing' | 'ready' | 'on-the-way' | 'delivered' | 'cancelled';
  paymentMethod: 'cash' | 'gcash';
  address: string;
  deliveryFee: number;
  estimatedTime?: string;
  date: string;
  createdAt: string;
  deliveryMode: 'delivery' | 'pickup';
  needsCutlery: boolean;
}

export default function BusinessOrders() {
  const [selectedTab, setSelectedTab] = useState<'active' | 'history'>('active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'on-the-way'>('all');
  const [selectedReadyOrders, setSelectedReadyOrders] = useState<string[]>([]);
  const [showBookRideModal, setShowBookRideModal] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);

  // Load orders from localStorage
  useEffect(() => {
    loadOrders();
    
    // Auto-refresh orders every 3 seconds
    const interval = setInterval(loadOrders, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadOrders = () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) return;

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;

    const businessOrdersKey = `business_orders_${userEmail}`;
    const savedOrders = localStorage.getItem(businessOrdersKey);
    
    if (savedOrders) {
      const parsedOrders = JSON.parse(savedOrders);
      setOrders(parsedOrders);
    }
  };

  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready', 'on-the-way'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  // Filter active orders by selected status
  const filteredActiveOrders = selectedStatusFilter === 'all' 
    ? activeOrders 
    : activeOrders.filter(o => o.status === selectedStatusFilter);

  // Get ready orders for delivery
  const readyOrders = orders.filter(o => o.status === 'ready');

  // Toggle order selection
  const toggleOrderSelection = (orderId: string) => {
    setSelectedReadyOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  // Handle Book Ride
  const handleBookRide = () => {
    if (selectedReadyOrders.length === 0) return;

    // Get selected orders details
    const selectedOrders = orders.filter(o => selectedReadyOrders.includes(o.id));
    
    // Create delivery request to localStorage for drivers
    const deliveryRequest = {
      id: `delivery_req_${Date.now()}`,
      type: 'delivery',
      businessName: 'Your Restaurant', // In production, get from current user
      orders: selectedOrders.map(order => ({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerAddress: order.address,
        customerPhone: order.customerPhone,
        total: order.total,
        paymentMethod: order.paymentMethod,
        items: order.items,
      })),
      pickup: 'Restaurant Location', // In production, get business address
      pickupAddress: 'Your restaurant address',
      totalOrders: selectedOrders.length,
      totalAmount: selectedOrders.reduce((sum, order) => sum + order.deliveryFee, 0),
      payment: 'COD',
      customerPhoto: '🍔',
      distance: '3.5 km',
      estimatedTime: '15 mins',
    };

    // Add to driver requests
    const existingRequests = localStorage.getItem('trikeserve_ride_requests');
    let requests = [];
    if (existingRequests) {
      try {
        requests = JSON.parse(existingRequests);
      } catch (error) {
        console.error('Error parsing existing requests:', error);
      }
    }
    requests.push(deliveryRequest);
    localStorage.setItem('trikeserve_ride_requests', JSON.stringify(requests));

    // Update order statuses to 'on-the-way'
    selectedReadyOrders.forEach(orderId => {
      updateOrderStatus(orderId, 'on-the-way');
    });

    // Clear selection and close modal
    setSelectedReadyOrders([]);
    setShowBookRideModal(false);
  };

  const updateOrderStatus = (orderId: string, newStatus: Order['status']) => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) return;

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;
    const businessOrdersKey = `business_orders_${userEmail}`;

    // Update business orders
    const updatedOrders = orders.map(order =>
      order.id === orderId ? { ...order, status: newStatus } : order
    );
    setOrders(updatedOrders);
    localStorage.setItem(businessOrdersKey, JSON.stringify(updatedOrders));

    // Also update customer's order
    const order = orders.find(o => o.id === orderId);
    if (order && order.customerEmail) {
      const customerOrdersKey = `orders_${order.customerEmail}`;
      const customerOrders = localStorage.getItem(customerOrdersKey);
      
      if (customerOrders) {
        const parsedCustomerOrders = JSON.parse(customerOrders);
        const updatedCustomerOrders = parsedCustomerOrders.map((o: any) =>
          o.id === orderId ? { ...o, status: newStatus } : o
        );
        localStorage.setItem(customerOrdersKey, JSON.stringify(updatedCustomerOrders));
        
        // Create notification for customer
        const customerNotificationsKey = `notifications_${order.customerEmail}`;
        const existingNotifications = localStorage.getItem(customerNotificationsKey);
        const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];
        
        let notificationMessage = '';
        let notificationIcon = '';
        
        switch (newStatus) {
          case 'preparing':
            notificationMessage = `Your order #${order.orderNumber} has been accepted and is being prepared.`;
            notificationIcon = '🍽️';
            break;
          case 'ready':
            notificationMessage = `Your order #${order.orderNumber} is ready for pickup.`;
            notificationIcon = '🚴‍♂️';
            break;
          case 'on-the-way':
            notificationMessage = `Your order #${order.orderNumber} is on the way!`;
            notificationIcon = '🛵';
            break;
          case 'delivered':
            notificationMessage = `Your order #${order.orderNumber} has been delivered. Enjoy your meal!`;
            notificationIcon = '✅';
            break;
          case 'cancelled':
            notificationMessage = `Your order #${order.orderNumber} has been cancelled.`;
            notificationIcon = '❌';
            break;
        }
        
        if (notificationMessage) {
          const notification = {
            id: `order-${order.id}-${newStatus}`,
            orderId: order.id,
            type: newStatus === 'on-the-way' ? 'delivery' : 'order',
            title: `Order ${newStatus === 'preparing' ? 'Confirmed' : newStatus === 'ready' ? 'Ready for Pickup' : newStatus === 'on-the-way' ? 'On The Way' : newStatus === 'delivered' ? 'Delivered' : 'Cancelled'}`,
            message: notificationMessage,
            time: 'Just now',
            timestamp: Date.now(),
            unread: true,
            icon: notificationIcon,
            actionUrl: `/customer/order-detail/${order.id}`
          };
          
          notifications.unshift(notification);
          localStorage.setItem(customerNotificationsKey, JSON.stringify(notifications));
        }
      }
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-[#F59E0B]';
      case 'preparing':
        return 'bg-[#3B82F6]';
      case 'ready':
        return 'bg-[#10B981]';
      case 'on-the-way':
        return 'bg-[#FFA500]';
      case 'delivered':
        return 'bg-[#64748B]';
      case 'cancelled':
        return 'bg-[#E11D48]';
    }
  };

  const getStatusLabel = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'New Order';
      case 'preparing':
        return 'Preparing';
      case 'ready':
        return 'Ready for Pickup';
      case 'on-the-way':
        return 'On The Way';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
            >
              <Menu className="w-6 h-6 text-[#121212]" />
            </button>
            <div>
              <h1 className="text-3xl font-extrabold text-[#121212] mb-2">Orders</h1>
              <p className="text-sm text-[#64748B]">{activeOrders.length} active orders</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 py-3 border-b border-[#E2E8F0] sticky top-0 bg-white z-50 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTab('active')}
              className={`flex-1 py-2.5 rounded-xl font-semibold transition-all ${
                selectedTab === 'active'
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#F8F9FA] text-[#64748B]'
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`flex-1 py-2.5 rounded-xl font-semibold transition-all ${
                selectedTab === 'history'
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#F8F9FA] text-[#64748B]'
              }`}
            >
              History ({historyOrders.length})
            </button>
          </div>

          {/* Status Filter - Only for Active Tab */}
          {selectedTab === 'active' && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setSelectedStatusFilter('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedStatusFilter === 'all'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                All ({activeOrders.length})
              </button>
              <button
                onClick={() => setSelectedStatusFilter('pending')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedStatusFilter === 'pending'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                New ({activeOrders.filter(o => o.status === 'pending').length})
              </button>
              <button
                onClick={() => setSelectedStatusFilter('preparing')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedStatusFilter === 'preparing'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                Preparing ({activeOrders.filter(o => o.status === 'preparing').length})
              </button>
              <button
                onClick={() => setSelectedStatusFilter('ready')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedStatusFilter === 'ready'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                Ready ({readyOrders.length})
              </button>
              <button
                onClick={() => setSelectedStatusFilter('on-the-way')}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedStatusFilter === 'on-the-way'
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                On The Way ({activeOrders.filter(o => o.status === 'on-the-way').length})
              </button>
            </div>
          )}

          {/* Book Ride Button - Only show when ready orders exist */}
          {selectedTab === 'active' && readyOrders.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowBookRideModal(true)}
                className="flex-1 bg-[#10B981] hover:bg-[#059669] uppercase flex items-center justify-center gap-2"
              >
                <Bike className="w-5 h-5" />
                Book Ride for Delivery ({readyOrders.length})
              </Button>
            </div>
          )}
        </div>

        {/* Orders List */}
        <div className="px-5 py-4 space-y-3">
          {selectedTab === 'active' ? (
            filteredActiveOrders.length > 0 ? (
              filteredActiveOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="p-4 border-2 border-[#E2E8F0] active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-[#121212]">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#64748B]">{order.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#E11D48]">₱{order.total.toFixed(2)}</p>
                      <p className="text-xs text-[#64748B]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1 mb-3">
                    {order.items.map((item, idx) => (
                      <p key={idx} className="text-sm text-[#64748B]">
                        {item.quantity}x {item.name}
                      </p>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={order.paymentMethod === 'gcash' ? 'bg-[#10B981] text-white text-xs' : 'bg-white border border-[#E2E8F0] text-[#64748B] text-xs'}>
                      {order.paymentMethod === 'gcash' ? 'Prepaid (GCash)' : 'Cash on Delivery'}
                    </Badge>
                    {order.estimatedTime && (
                      <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {order.estimatedTime}
                      </Badge>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-[#64748B]">No active orders</p>
              </div>
            )
          ) : (
            historyOrders.length > 0 ? (
              historyOrders.map((order) => (
                <Card
                  key={order.id}
                  className="p-4 border-2 border-[#E2E8F0] opacity-75"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-[#121212]">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#64748B]">{order.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#121212]">₱{order.total}</p>
                      <p className="text-xs text-[#64748B]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <p key={idx} className="text-sm text-[#64748B]">
                        {item.quantity}x {item.name}
                      </p>
                    ))}\n                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-[#64748B]">No order history</p>
              </div>
            )
          )}
        </div>

        {/* Book Ride Modal */}
        {showBookRideModal && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-[#121212]">Select Orders for Delivery</h2>
                  <button onClick={() => setShowBookRideModal(false)}>
                    <span className="text-lg font-semibold text-[#3B82F6]">Cancel</span>
                  </button>
                </div>
                <p className="text-sm text-[#64748B]">Select ready orders to book a ride</p>
              </div>

              <div className="p-5 space-y-3">
                {readyOrders.map((order) => (
                  <Card
                    key={order.id}
                    onClick={() => toggleOrderSelection(order.id)}
                    className={`p-4 border-2 transition-all cursor-pointer ${
                      selectedReadyOrders.includes(order.id)
                        ? 'border-[#10B981] bg-[#F0FDF4]'
                        : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedReadyOrders.includes(order.id)
                          ? 'bg-[#10B981] border-[#10B981]'
                          : 'border-[#CBD5E1]'
                      }`}>
                        {selectedReadyOrders.includes(order.id) && (
                          <CheckCircle className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-[#121212]">#{order.orderNumber}</h3>
                          <p className="text-lg font-bold text-[#E11D48]">₱{order.total.toFixed(2)}</p>
                        </div>
                        <p className="text-sm text-[#64748B] mb-1">{order.customerName}</p>
                        <div className="flex items-center gap-2 text-xs text-[#64748B]">
                          <MapPin className="w-3 h-3" />
                          <span>{order.address}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] p-5">
                <Button
                  onClick={handleBookRide}
                  disabled={selectedReadyOrders.length === 0}
                  className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Bike className="w-5 h-5 mr-2" />
                  Book Ride ({selectedReadyOrders.length} orders)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-[#121212]">#{selectedOrder.orderNumber}</h2>
                  <button onClick={() => setSelectedOrder(null)}>
                    <span className="text-lg font-semibold text-[#3B82F6]">Close</span>
                  </button>
                </div>
                <Badge className={`${getStatusColor(selectedOrder.status)} text-white`}>
                  {getStatusLabel(selectedOrder.status)}
                </Badge>
              </div>

              <div className="p-5 space-y-4">
                {/* Customer Info */}
                <div>
                  <h3 className="font-bold text-[#121212] mb-2">Customer</h3>
                  <p className="text-[#64748B]">{selectedOrder.customerName}</p>
                  <p className="text-sm text-[#64748B] mt-1">{selectedOrder.address}</p>
                  {selectedOrder.customerPhone && (
                    <p className="text-sm text-[#64748B] mt-1">Phone: {selectedOrder.customerPhone}</p>
                  )}
                </div>

                {/* Order Items */}
                <div>
                  <h3 className="font-bold text-[#121212] mb-2">Items</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-[#F8F9FA] rounded-xl">
                        <div>
                          <p className="font-semibold text-[#121212]">{item.name}</p>
                          <p className="text-sm text-[#64748B]">Qty: {item.quantity}</p>
                        </div>
                        <p className="font-bold text-[#121212]">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="border-t border-[#E2E8F0] pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#64748B]">Subtotal</span>
                    <span className="font-semibold text-[#121212]">₱{(selectedOrder.total - selectedOrder.deliveryFee).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#64748B]">Delivery Fee</span>
                    <span className="font-semibold text-[#121212]">₱{selectedOrder.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                    <span className="font-bold text-[#121212]">Total</span>
                    <span className="text-xl font-bold text-[#E11D48]">₱{selectedOrder.total.toFixed(2)}</span>
                  </div>
                  <div className="mt-3">
                    <Badge className={selectedOrder.paymentMethod === 'gcash' ? 'bg-[#10B981] text-white' : 'border-orange-500 text-orange-500'} variant={selectedOrder.paymentMethod === 'gcash' ? 'default' : 'outline'}>
                      {selectedOrder.paymentMethod === 'gcash' ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Prepaid (GCash)
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Cash on Delivery
                        </>
                      )}
                    </Badge>
                  </div>
                </div>

                {/* Action Buttons */}
                {selectedOrder.status === 'pending' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'preparing');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6"
                    >
                      Accept Order
                    </Button>
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'cancelled');
                        setSelectedOrder(null);
                      }}
                      variant="outline"
                      className="w-full border-[#E11D48] text-[#E11D48] uppercase py-6"
                    >
                      Decline Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'preparing' && (
                  <Button
                    onClick={() => {
                      updateOrderStatus(selectedOrder.id, 'ready');
                      setSelectedOrder(null);
                    }}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6"
                  >
                    Mark as Ready
                  </Button>
                )}

                {selectedOrder.status === 'ready' && (
                  <Button
                    onClick={() => {
                      updateOrderStatus(selectedOrder.id, 'delivered');
                      setSelectedOrder(null);
                    }}
                    className="w-full bg-[#64748B] hover:bg-[#475569] uppercase py-6"
                  >
                    Mark as Completed
                  </Button>
                )}

                {selectedOrder.status === 'on-the-way' && (
                  <Button
                    onClick={() => {
                      updateOrderStatus(selectedOrder.id, 'delivered');
                      setSelectedOrder(null);
                    }}
                    className="w-full bg-[#64748B] hover:bg-[#475569] uppercase py-6"
                  >
                    Mark as Delivered
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
