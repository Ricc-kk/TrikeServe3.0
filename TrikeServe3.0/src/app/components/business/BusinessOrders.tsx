import { useState, useEffect } from "react";
import { Store, Package, Clock, User, ChevronRight, CheckCircle, XCircle, AlertCircle, Menu } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import BusinessSidebar from "./BusinessSidebar";
    import { supabase } from "../../../lib/supabase";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  subtotal: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way' | 'delivered' | 'cancelled';
  paymentMethod: 'cash' | 'gcash';
  address: string;
  deliveryFee: number;
  estimatedTime?: string;
  date: string;
  createdAt: string;
  deliveryMode: 'delivery' | 'pickup';
  needsCutlery: boolean;
  customerId?: string;
  restaurantName?: string;
  restaurantAddress?: string;
}


export default function BusinessOrders() {
  const [selectedTab, setSelectedTab] = useState<'active' | 'history'>('active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Prevent refresh during update

  // Load orders from Supabase (secure - uses RLS policies)
  useEffect(() => {
    loadOrders();
    
    // Auto-refresh orders every 5 seconds (increased from 3), but NOT while updating status
    const interval = setInterval(() => {
      if (!isUpdatingStatus) {
        loadOrders();
      } else {
        console.log('[BusinessOrders] ⏸️ Skipping refresh - status update in progress');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isUpdatingStatus]);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      const currentUserData = localStorage.getItem('trikeserve_current_user');

      if (!currentUserData) {
        console.log('[BusinessOrders] No current user data found');
        setIsLoading(false);
        return;
      }

      const currentUser = JSON.parse(currentUserData);
      console.log('[BusinessOrders] Current user:', {
        email: currentUser.email,
        id: currentUser.id,
        restaurantId: currentUser.restaurantId,
        role: currentUser.role,
      });

      // SECURITY: Get the restaurant ID for this business user
      let businessRestaurantId = currentUser.restaurantId;

      // If no restaurantId in user data, fetch it from Supabase
      if (!businessRestaurantId && currentUser.id) {
        console.log('[BusinessOrders] Fetching restaurant ID from Supabase for user:', currentUser.id);
        try {
          const { data: restaurant, error } = await supabase
            .from('restaurants')
            .select('id')
            .eq('business_user_id', currentUser.id)
            .single();

          if (error) {
            console.error('[BusinessOrders] Error fetching restaurant:', error);
            setIsLoading(false);
            setOrders([]);
            return;
          }

          if (restaurant) {
            businessRestaurantId = restaurant.id;
            setRestaurantId(businessRestaurantId);
            console.log('[BusinessOrders] Got restaurant ID from database:', businessRestaurantId);
          } else {
            console.warn('[BusinessOrders] No restaurant found for business user');
            setIsLoading(false);
            setOrders([]);
            return;
          }
        } catch (error) {
          console.error('[BusinessOrders] Exception fetching restaurant:', error);
          setIsLoading(false);
          setOrders([]);
          return;
        }
      } else if (businessRestaurantId) {
        setRestaurantId(businessRestaurantId);
      }

      if (!businessRestaurantId) {
        console.warn('[BusinessOrders] Could not determine restaurant ID');
        setIsLoading(false);
        setOrders([]);
        return;
      }

      // SECURITY: Fetch orders from Supabase using RLS
      // The RLS policy ensures this business user can only see orders for their restaurant
      console.log('[BusinessOrders] ========== ORDER LOAD DEBUG ==========');
      console.log('[BusinessOrders] Current user ID:', currentUser.id);
      console.log('[BusinessOrders] Current user email:', currentUser.email);
      console.log('[BusinessOrders] Business restaurant ID:', businessRestaurantId);
      console.log('[BusinessOrders] ======================================');

      // Query by restaurant_email which is set to checkoutRestaurant.id in Cart.tsx
      // This matches how orders are saved (restaurant_email = checkoutRestaurant.id)
      console.log('[BusinessOrders] Query: SELECT * FROM orders WHERE restaurant_email =', businessRestaurantId || currentUser.id);

      const { data: supabaseOrders, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_email', businessRestaurantId || currentUser.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('[BusinessOrders] ❌ Error fetching orders:', fetchError.message);
        console.error('[BusinessOrders] Error code:', fetchError.code);
        console.error('[BusinessOrders] Error details:', fetchError.details);
        console.error('[BusinessOrders] ');
        console.error('[BusinessOrders] DEBUGGING: Check if:');
        console.error('  1. RLS policy allows this user to query orders');
        console.error('  2. restaurant_email value exists:', businessRestaurantId || currentUser.id);
        console.error('  3. Any orders were actually saved with this restaurant_email');
        console.error('  4. Database is accessible');
        setIsLoading(false);
        setOrders([]);
        return;
      }

      if (!supabaseOrders) {
        console.warn('[BusinessOrders] Query returned null (no data)');
        setOrders([]);
        setIsLoading(false);
        return;
      }

      if (supabaseOrders.length === 0) {
        console.log('[BusinessOrders] ℹ️  No orders found');
        console.log('[BusinessOrders] This restaurant (ID: ' + (businessRestaurantId || currentUser.id) + ') has not received any orders yet');
        console.log('[BusinessOrders] Waiting for customers to place orders...');
        setOrders([]);
        setIsLoading(false);
        return;
      }

      console.log('[BusinessOrders] ✅ Found ' + supabaseOrders.length + ' order(s)');

      // SECURITY: Transform Supabase order format to app format
      const transformedOrders: Order[] = supabaseOrders.map((dbOrder: any) => {
        // Safely parse items JSON
        let parsedItems = [];
        try {
          parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
        } catch (parseError) {
          console.error('[BusinessOrders] Error parsing items JSON for order', dbOrder.order_number, parseError);
          parsedItems = [];
        }

        return {
          id: dbOrder.id,
          orderNumber: dbOrder.order_number || 'Unknown',
          customerName: dbOrder.customer_name || 'Customer',
          customerEmail: dbOrder.customer_email || '',
          customerPhone: dbOrder.customer_phone || '',
          items: parsedItems,
          total: dbOrder.total || 0,
          subtotal: dbOrder.subtotal || 0,
          status: dbOrder.status || 'pending',
          paymentMethod: dbOrder.payment_method || 'cash',
          address: dbOrder.address || '',
          deliveryFee: dbOrder.delivery_fee || 0,
          estimatedTime: dbOrder.estimated_time || '30 mins',
          date: new Date(dbOrder.created_at).toLocaleString(),
          createdAt: dbOrder.created_at,
          deliveryMode: dbOrder.delivery_mode || 'delivery',
          needsCutlery: dbOrder.needs_cutlery || false,
          customerId: dbOrder.customer_id || undefined,
          restaurantName: dbOrder.restaurant_name || undefined,
          restaurantAddress: dbOrder.restaurant_address || undefined,
        };
      });

      console.log(`[BusinessOrders] Loaded ${transformedOrders.length} orders from Supabase`);
      console.log('[BusinessOrders] SECURITY: These orders are protected by RLS policies');
      setOrders(transformedOrders);
    } catch (error) {
      console.error('[BusinessOrders] Unexpected error loading orders:', error);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const activeOrders = orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'on-the-way'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  // Filter active orders by selected status
  const filteredActiveOrders = selectedStatusFilter === 'all' 
    ? activeOrders 
    : activeOrders.filter(o => o.status === selectedStatusFilter);

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    console.log('[BusinessOrders] ========== STATUS UPDATE START ==========');
    console.log('[BusinessOrders] Order ID:', orderId);
    console.log('[BusinessOrders] New Status:', newStatus);

    setIsUpdatingStatus(true);

    try {
      // Find the order
      const order = orders.find(o => o.id === orderId);
      console.log('[BusinessOrders] Order found:', order ? 'YES' : 'NO');

      if (!order) {
        console.error('[BusinessOrders] ERROR: Order not found in list');
        setIsUpdatingStatus(false);
        alert('Order not found');
        return;
      }

      console.log('[BusinessOrders] Order details:', {
        id: order.id,
        orderNumber: order.orderNumber,
        currentStatus: order.status,
        newStatus: newStatus
      });

      // Update UI
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      console.log('[BusinessOrders] UI Updated');

      // Simple direct update - try ID first
      console.log('[BusinessOrders] Sending Supabase update request...');
      console.log('[BusinessOrders] Query: UPDATE orders SET status = "' + newStatus + '" WHERE id = "' + orderId + '"');

      const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      console.log('[BusinessOrders] Supabase response received');
      console.log('[BusinessOrders] Data:', data);
      console.log('[BusinessOrders] Error:', error);

      if (error) {
        console.error('[BusinessOrders] ❌ ID-based update FAILED, trying by order_number...');
        console.error('[BusinessOrders] First Error Code:', error.code);
        console.error('[BusinessOrders] First Error Message:', error.message);

        // Try backup: query by order_number instead
        console.log('[BusinessOrders] Backup Query: UPDATE orders SET status = "' + newStatus + '" WHERE order_number = "' + order.orderNumber + '"');

        const { data: data2, error: error2 } = await supabase
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('order_number', order.orderNumber);

        console.log('[BusinessOrders] Backup attempt response:', { data: data2, error: error2 });

        if (error2) {
          console.error('[BusinessOrders] ❌ BOTH attempts FAILED');
          console.error('[BusinessOrders] Backup Error Code:', error2.code);
          console.error('[BusinessOrders] Backup Error Message:', error2.message);

          const errorMsg = `Update Failed!\n\nError Code: ${error2.code}\nMessage: ${error2.message}\n\nCheck console for details.`;
          alert(errorMsg);

          setOrders(orders);
          setIsUpdatingStatus(false);
          return;
        }
      }

      console.log('[BusinessOrders] ✅ Update successful - waiting 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[BusinessOrders] ========== STATUS UPDATE COMPLETE ==========');
      setIsUpdatingStatus(false);

    } catch (error) {
      console.error('[BusinessOrders] ❌ EXCEPTION:', error);
      console.error('[BusinessOrders] Error String:', String(error));
      alert('Error: ' + String(error).substring(0, 150));
      setIsUpdatingStatus(false);
    }
  };

  // Create an OPEN delivery request (not assigned to specific driver)
  const createOpenDeliveryRequest = async (order: Order) => {
    if (!order.customerId) {
      alert('Cannot create delivery request: missing customer ID in this order.');
      return false;
    }

    const currentUserData = localStorage.getItem('trikeserve_current_user');
    const currentUser = currentUserData ? JSON.parse(currentUserData) : null;

    const pickupLabel = order.restaurantName || currentUser?.businessName || 'Restaurant Pickup';
    const taggedPickup = `DELIVERY|ORDER_ID:${order.id}|ORDER_NO:${order.orderNumber}|${pickupLabel}`;

    console.log('[BusinessOrders] Creating OPEN delivery request for order:', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      deliveryFee: order.deliveryFee,
    });

    // Create delivery request WITHOUT driver_id - open for any driver with delivery service type
    const { error } = await supabase
      .from('ride_requests')
      .insert([{
        customer_id: order.customerId,
        driver_id: null,  // Open request - any driver can accept
        pickup_location: taggedPickup,
        dropoff_location: order.address,
        status: 'pending',
        ride_type: 'special',  // Use 'special' type (database constraint only allows specific values)
        payment_method: order.paymentMethod === 'gcash' ? 'GCASH' : 'COD',
        amount: Number(order.deliveryFee || 0),
        passenger_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

    if (error) {
      console.error('[BusinessOrders] Failed to create delivery request:', error);
      alert(`Failed to post delivery request. ${error.code ? `Code: ${error.code}. ` : ''}${error.message || 'Please try again.'}`);
      return false;
    }

    console.log('[BusinessOrders] ✅ Open delivery request created - visible to all drivers with delivery service');
    return true;
  };

  // Handle "Ready for Delivery" button click
  const handleReadyForDelivery = async (order: Order) => {
    console.log('[BusinessOrders] Ready for Delivery clicked for order:', order.orderNumber);

    const didCreateRequest = await createOpenDeliveryRequest(order);
    if (!didCreateRequest) {
      return;
    }

    await updateOrderStatus(order.id, 'confirmed');
    setSelectedOrder(null);
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-[#F59E0B]';
      case 'preparing':
        return 'bg-[#3B82F6]';
      case 'confirmed':
        return 'bg-[#06B6D4]';
      case 'ready':
        return 'bg-[#10B981]';
      case 'on-the-way':
        return 'bg-[#FFA500]';
      case 'delivered':
        return 'bg-[#10B981]';
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
      case 'confirmed':
        return 'Ready for Delivery';
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

  // Get the workflow status for display
  const getStatusWorkflow = (status: Order['status']) => {
    const workflows: Record<Order['status'], { steps: string[]; current: number }> = {
      'pending': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivered'], current: 0 },
      'preparing': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivered'], current: 1 },
      'ready': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivered'], current: 2 },
      'confirmed': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivered'], current: 3 },
      'on-the-way': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivering', 'Delivered'], current: 4 },
      'delivered': { steps: ['Pending', 'Preparing', 'Ready', 'Ready for Delivery', 'Delivered'], current: 4 },
      'cancelled': { steps: ['Cancelled'], current: 0 }
    };
    return workflows[status];
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
                 Ready ({activeOrders.filter(o => o.status === 'ready').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('confirmed')}
                 className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'confirmed'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 Delivery ({activeOrders.filter(o => o.status === 'confirmed').length})
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
                    ))}
                  </div>
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

                {/* Status Progress Bar */}
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#64748B] mb-2">ORDER PROGRESS</p>
                  <div className="flex items-center gap-2">
                    {getStatusWorkflow(selectedOrder.status).steps.map((step, idx) => (
                      <div key={idx} className="flex items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            idx <= getStatusWorkflow(selectedOrder.status).current
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#E2E8F0] text-[#64748B]'
                          }`}
                        >
                          {idx <= getStatusWorkflow(selectedOrder.status).current ? '✓' : idx + 1}
                        </div>
                        {idx < getStatusWorkflow(selectedOrder.status).steps.length - 1 && (
                          <div
                            className={`h-0.5 flex-1 ml-2 transition-all ${
                              idx < getStatusWorkflow(selectedOrder.status).current
                                ? 'bg-[#10B981]'
                                : 'bg-[#E2E8F0]'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex text-xs text-[#64748B] mt-2 gap-1">
                    {getStatusWorkflow(selectedOrder.status).steps.map((step, idx) => (
                      <div key={idx} className="flex-1">
                        <p className="font-semibold">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
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

                {/* Action Buttons - Complete Workflow */}
                {selectedOrder.status === 'pending' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'preparing');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6 font-bold"
                    >
                      ✓ Accept Order
                    </Button>
                    <Button
                      onClick={async () => {
                        await updateOrderStatus(selectedOrder.id, 'cancelled');
                        setSelectedOrder(null);
                      }}
                      variant="outline"
                      className="w-full border-[#E11D48] text-[#E11D48] uppercase py-6"
                    >
                      ✗ Decline Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'preparing' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'ready');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[#F59E0B] hover:bg-[#D97706] uppercase py-6 font-bold"
                    >
                      → Ready for Pickup
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'ready' && (
                  <div className="space-y-2">
                    {selectedOrder.deliveryMode === 'delivery' ? (
                      <Button
                        onClick={() => handleReadyForDelivery(selectedOrder)}
                        className="w-full bg-[#06B6D4] hover:bg-[#0891B2] uppercase py-6 font-bold"
                      >
                        → Ready for Delivery
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          updateOrderStatus(selectedOrder.id, 'delivered');
                          setSelectedOrder(null);
                        }}
                        className="w-full bg-[#64748B] hover:bg-[#475569] uppercase py-6 font-bold"
                      >
                        ✓ Completed
                      </Button>
                    )}
                  </div>
                )}

                {selectedOrder.status === 'confirmed' && (
                  <div className="space-y-2">
                  </div>
                )}

                {selectedOrder.status === 'on-the-way' && (
                  <div className="space-y-2">
                    <div className="bg-[#FEF3C7] border-l-4 border-[#FFA500] p-3 rounded">
                      <p className="text-sm font-semibold text-[#92400E]">Status: On The Way</p>
                      <p className="text-xs text-[#92400E] mt-1">Rider is delivering the order</p>
                    </div>
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'delivered');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[#64748B] hover:bg-[#475569] uppercase py-6 font-bold"
                    >
                      ✓ Delivered - Complete Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'delivered' && (
                  <div className="bg-[#D1FAE5] border-l-4 border-[#10B981] p-3 rounded">
                    <p className="text-sm font-semibold text-[#065F46]">✓ Order Completed</p>
                    <p className="text-xs text-[#065F46] mt-1">Order has been successfully delivered</p>
                  </div>
                )}

                {selectedOrder.status === 'cancelled' && (
                  <div className="bg-[#FEE2E2] border-l-4 border-[#E11D48] p-3 rounded">
                    <p className="text-sm font-semibold text-[#991B1B]">✗ Order Cancelled</p>
                    <p className="text-xs text-[#991B1B] mt-1">This order has been cancelled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
