import { useState, useEffect, useRef } from "react";
import { Store, Package, Clock, User, ChevronRight, CheckCircle, XCircle, AlertCircle, Menu, Navigation } from "lucide-react";
import { Link } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import BusinessSidebar from "./BusinessSidebar";
    import { supabase } from "../../../lib/supabase";
    import { supabaseHelpers } from "@/lib/supabase";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'

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
  const [confirmAction, setConfirmAction] = useState<'accept' | 'decline' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Prevent refresh during update
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [rideRequestInfo, setRideRequestInfo] = useState<any>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll for driver location when an on-the-way order is selected
  useEffect(() => {
    if (!selectedOrder || selectedOrder.status !== 'on-the-way') {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
      setDriverLocation(null);
      setRoutePath([]);
      setRideRequestInfo(null);
      return;
    }

    const pollDriver = async () => {
      try {
        const { data: freshOrder } = await supabase
          .from('orders')
          .select('driver_lat, driver_lng, driver_name, status, address')
          .eq('id', selectedOrder.id)
          .single();

        if (freshOrder) {
          if (freshOrder.driver_lat && freshOrder.driver_lng) {
            setDriverLocation({ lat: freshOrder.driver_lat, lng: freshOrder.driver_lng });
            setDriverStatus(freshOrder.status);
          }
        }
      } catch (err) {
        console.error('[BusinessOrders] Error polling driver location:', err);
      }
    };

    pollDriver();
    trackingPollRef.current = setInterval(pollDriver, 3000);
    return () => { if (trackingPollRef.current) clearInterval(trackingPollRef.current); };
  }, [selectedOrder?.id, selectedOrder?.status]);

  // Compute route from driver to restaurant or customer
  useEffect(() => {
    if (!driverLocation || !isMapsLoaded || !(window as any).google) {
      setRoutePath([]);
      return;
    }

    // Parse customer delivery coordinates from order address (format: "name|lat,lng")
    const addr = selectedOrder?.address || '';
    const coordPart = addr.includes('|') ? addr.split('|')[1] : addr;
    const m = coordPart.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
    if (!m) { setRoutePath([]); return; }
    const dest = { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    const DirectionsService = new (window as any).google.maps.DirectionsService();
    DirectionsService.route({
      origin: new (window as any).google.maps.LatLng(driverLocation.lat, driverLocation.lng),
      destination: new (window as any).google.maps.LatLng(dest.lat, dest.lng),
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
        const decoded = decodePolyline(result.routes[0].overview_polyline.points);
        setRoutePath(decoded);
      }
    });
  }, [driverLocation, isMapsLoaded, driverStatus, selectedOrder?.address]);

  const decodePolyline = (encoded: string): Array<{ lat: number; lng: number }> => {
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b: number, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  };

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
      // Check ride_requests for driver status on each order
      const orderIds = transformedOrders.map((o: any) => o.id);
      if (orderIds.length > 0) {
        const { data: rideReqs } = await supabase
          .from('ride_requests')
          .select('order_id, driver_status, driver_name, accepted_driver_id')
          .in('order_id', orderIds)
          .not('accepted_driver_id', 'is', null);

        if (rideReqs) {
          rideReqs.forEach((rr: any) => {
            if (!rr.order_id || !rr.driver_status) return;
            const statusMap: Record<string, string> = {
              'on-the-way': 'on-the-way', 'arrived': 'on-the-way',
              'picked-up': 'on-the-way', 'drop-off': 'on-the-way',
              'completed': 'delivered',
            };
            const mapped = statusMap[rr.driver_status];
            if (mapped) {
              const order = transformedOrders.find((o: any) => o.id === rr.order_id);
              if (order) order.status = mapped;
            }
          });
        }
      }

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

      // Notify the customer about the new order status.
      supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurantName,
        status: newStatus,
      }).catch(err => console.error('[BusinessOrders] Failed to notify customer:', err));

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

    // Parse dropoff coordinates from address (e.g. "14.72415, 120.96287")
    const parseCoords = (addr: string) => {
      const match = addr.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
      if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      return null;
    };
    // Extract display name (before '|') and coordinates from address
    const addressParts = (order.address || '').split('|');
    const addressDisplayName = addressParts[0].trim();
    const addressForCoords = addressParts.length > 1 ? addressParts[1] : order.address;
    const dropoffCoords = parseCoords(addressForCoords);

    // Look up restaurant address for pickup geocoding
    let pickupLat = null;
    let pickupLng = null;
    let pickupAddress = pickupLabel;
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('address')
        .eq('business_user_id', currentUser?.id)
        .single();
      if (restaurant?.address) {
        pickupAddress = restaurant.address;
      }
    } catch (e) {}

    // Geocode the restaurant address using Google Geocoding REST API
    const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (GOOGLE_API_KEY && pickupAddress && pickupAddress !== pickupLabel) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(pickupAddress)}&key=${GOOGLE_API_KEY}`
        );
        const geoData = await geoRes.json();
        if (geoData.status === 'OK' && geoData.results?.[0]) {
          pickupLat = geoData.results[0].geometry.location.lat;
          pickupLng = geoData.results[0].geometry.location.lng;
          console.log('[BusinessOrders] ✅ Geocoded restaurant address:', pickupLat, pickupLng);
        }
      } catch (geoErr) {
        console.error('[BusinessOrders] Geocoding failed:', geoErr);
      }
    }

    const { error } = await supabase
      .from('ride_requests')
      .insert([{
        customer_id: order.customerId,
        driver_id: null,  // Open request - any driver can accept
        pickup_location: taggedPickup,
        pickup_address: pickupAddress,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        dropoff_location: addressDisplayName || order.address,
        dropoff_address: addressDisplayName || order.address,
        dropoff_lat: dropoffCoords?.lat || null,
        dropoff_lng: dropoffCoords?.lng || null,
        order_id: order.id,
        order_number: order.orderNumber || null,
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
      <div className="flex-1 lg:ml-64 w-full">
        {/* Header */}
        <div className="px-3 md:px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
            >
              <Menu className="w-6 h-6 text-[#121212]" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#121212] mb-1 md:mb-2">Orders</h1>
              <p className="text-xs md:text-sm text-[#64748B]">{activeOrders.length} active orders</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-3 md:px-5 py-3 border-b border-[#E2E8F0] sticky top-0 bg-white z-50 space-y-2 md:space-y-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max md:min-w-0">
            <button
              onClick={() => setSelectedTab('active')}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
                selectedTab === 'active'
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#F8F9FA] text-[#64748B]'
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
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
             <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 min-w-max md:flex-wrap md:gap-2">
               <button
                 onClick={() => setSelectedStatusFilter('all')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'all'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 All ({activeOrders.length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('pending')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'pending'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 New ({activeOrders.filter(o => o.status === 'pending').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('preparing')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'preparing'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 Preparing ({activeOrders.filter(o => o.status === 'preparing').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('ready')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'ready'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 Ready ({activeOrders.filter(o => o.status === 'ready').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('confirmed')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'confirmed'
                     ? 'bg-[#E11D48] text-white'
                     : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                 }`}
               >
                 Delivery ({activeOrders.filter(o => o.status === 'confirmed').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('on-the-way')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
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
        <div className="px-3 md:px-5 py-3 md:py-4 space-y-2 md:space-y-3 pb-6">
          {selectedTab === 'active' ? (
            filteredActiveOrders.length > 0 ? (
              filteredActiveOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="p-3 md:p-4 border-2 border-[#E2E8F0] active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-[#121212] text-sm md:text-base">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-[#64748B] truncate">{order.customerName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base md:text-lg font-bold text-[#E11D48]">₱{order.total.toFixed(2)}</p>
                      <p className="text-xs text-[#64748B]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1 mb-3 text-xs md:text-sm">
                    {order.items.slice(0, 2).map((item, idx) => (
                      <p key={idx} className="text-xs md:text-sm text-[#64748B] truncate">
                        {item.quantity}x {item.name}
                      </p>
                    ))}
                    {order.items.length > 2 && (
                      <p className="text-xs text-[#64748B]">+{order.items.length - 2} more items</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={order.paymentMethod === 'gcash' ? 'bg-[#10B981] text-white text-xs' : 'bg-white border border-[#E2E8F0] text-[#64748B] text-xs'}>
                      {order.paymentMethod === 'gcash' ? 'GCash' : 'COD'}
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
                <Clock className="w-12 md:w-16 h-12 md:h-16 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[#64748B]">No active orders</p>
              </div>
            )
          ) : (
            historyOrders.length > 0 ? (
              historyOrders.map((order) => (
                <Card
                  key={order.id}
                  className="p-3 md:p-4 border-2 border-[#E2E8F0] opacity-75"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-[#121212] text-sm md:text-base">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-[#64748B] truncate">{order.customerName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base md:text-lg font-bold text-[#121212]">₱{order.total}</p>
                      <p className="text-xs text-[#64748B]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs md:text-sm">
                    {order.items.slice(0, 2).map((item, idx) => (
                      <p key={idx} className="text-xs md:text-sm text-[#64748B] truncate">
                        {item.quantity}x {item.name}
                      </p>
                    ))}
                    {order.items.length > 2 && (
                      <p className="text-xs text-[#64748B]">+{order.items.length - 2} more items</p>
                    )}
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Package className="w-12 md:w-16 h-12 md:h-16 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[#64748B]">No order history</p>
              </div>
            )
          )}
        </div>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-white w-full h-full md:h-auto md:rounded-t-3xl md:max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-4 md:px-5 py-3 md:py-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold text-[#121212]">#{selectedOrder.orderNumber}</h2>
                  <button onClick={() => setSelectedOrder(null)} className="text-lg font-semibold text-[#3B82F6]">
                    <span className="hidden md:inline">Close</span>
                    <span className="md:hidden">✕</span>
                  </button>
                </div>
                <Badge className={`${getStatusColor(selectedOrder.status)} text-white`}>
                  {getStatusLabel(selectedOrder.status)}
                </Badge>

                {/* Status Progress Bar - Responsive */}
                <div className="mt-3 md:mt-4">
                  <p className="text-xs font-semibold text-[#64748B] mb-2">ORDER PROGRESS</p>
                  <div className="flex items-center gap-1 md:gap-2 overflow-x-auto pb-2">
                    {getStatusWorkflow(selectedOrder.status).steps.map((step, idx) => (
                      <div key={idx} className="flex items-center flex-shrink-0">
                        <div
                          className={`w-6 md:w-8 h-6 md:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            idx <= getStatusWorkflow(selectedOrder.status).current
                              ? 'bg-[#10B981] text-white'
                              : 'bg-[#E2E8F0] text-[#64748B]'
                          }`}
                        >
                          {idx <= getStatusWorkflow(selectedOrder.status).current ? '✓' : idx + 1}
                        </div>
                        {idx < getStatusWorkflow(selectedOrder.status).steps.length - 1 && (
                          <div
                            className={`h-0.5 w-2 md:w-4 ml-1 md:ml-2 transition-all ${
                              idx < getStatusWorkflow(selectedOrder.status).current
                                ? 'bg-[#10B981]'
                                : 'bg-[#E2E8F0]'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 text-xs text-[#64748B] mt-2 gap-1">
                    {getStatusWorkflow(selectedOrder.status).steps.map((step, idx) => (
                      <div key={idx} className="min-w-0">
                        <p className="font-semibold truncate text-[10px] md:text-xs">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-5 space-y-3 md:space-y-4">
                {/* Customer Info */}
                <div>
                  <h3 className="font-bold text-[#121212] mb-2 text-sm md:text-base">Customer</h3>
                  <p className="text-sm md:text-base text-[#64748B]">{selectedOrder.customerName}</p>
                  <p className="text-xs md:text-sm text-[#64748B] mt-1 break-words">{selectedOrder.address.split('|')[0].trim() || selectedOrder.address}</p>
                  {selectedOrder.customerPhone && (
                    <p className="text-xs md:text-sm text-[#64748B] mt-1">Phone: {selectedOrder.customerPhone}</p>
                  )}
                </div>

                {/* Order Items */}
                <div>
                  <h3 className="font-bold text-[#121212] mb-2 text-sm md:text-base">Items</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 md:p-3 bg-[#F8F9FA] rounded-xl">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#121212] text-sm md:text-base truncate">{item.name}</p>
                          <p className="text-xs md:text-sm text-[#64748B]">Qty: {item.quantity}</p>
                        </div>
                        <p className="font-bold text-[#121212] text-sm md:text-base flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="border-t border-[#E2E8F0] pt-3 md:pt-4">
                  <div className="flex items-center justify-between mb-2 text-sm md:text-base">
                    <span className="text-[#64748B]">Subtotal</span>
                    <span className="font-semibold text-[#121212]">₱{(selectedOrder.total - selectedOrder.deliveryFee).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm md:text-base">
                    <span className="text-[#64748B]">Delivery Fee</span>
                    <span className="font-semibold text-[#121212]">₱{selectedOrder.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 md:pt-3 border-t border-[#E2E8F0]">
                    <span className="font-bold text-[#121212] md:text-base">Total</span>
                    <span className="text-lg md:text-xl font-bold text-[#E11D48]">₱{selectedOrder.total.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 md:mt-3">
                    <Badge className={selectedOrder.paymentMethod === 'gcash' ? 'bg-[#10B981] text-white text-xs md:text-sm' : 'border-orange-500 text-orange-500 text-xs md:text-sm'} variant={selectedOrder.paymentMethod === 'gcash' ? 'default' : 'outline'}>
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
                      onClick={() => setConfirmAction('accept')}
                      className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      ✓ Accept Order
                    </Button>
                    <Button
                      onClick={() => setConfirmAction('decline')}
                      variant="outline"
                      className="w-full border-[#E11D48] text-[#E11D48] uppercase py-4 md:py-6 text-sm md:text-base"
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
                      className="w-full bg-[#F59E0B] hover:bg-[#D97706] uppercase py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      → Ready for Pickup
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'ready' && (
                  <div className="space-y-2">
                    {selectedOrder.deliveryMode === 'delivery' && (
                      <Button
                        onClick={() => handleReadyForDelivery(selectedOrder)}
                        className="w-full bg-[#06B6D4] hover:bg-[#0891B2] uppercase py-4 md:py-6 font-bold text-sm md:text-base"
                      >
                        → Ready for Delivery
                      </Button>
                    )}
                  </div>
                )}

                {selectedOrder.status === 'confirmed' && (
                  <div className="space-y-2">
                  </div>
                )}

                {selectedOrder.status === 'on-the-way' && (
                  <div className="space-y-3">
                    {/* Live Tracking Map */}
                    {isMapsLoaded && driverLocation && (
                      <div className="rounded-xl overflow-hidden border-2 border-[#3B82F6]">
                        <div className="bg-gradient-to-r from-[#3B82F6] to-[#2563EB] px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                            <span className="text-xs font-bold text-white">Live Tracking</span>
                          </div>
                          <Navigation className="w-3.5 h-3.5 text-white/80" />
                        </div>
                        <GoogleMap
                          mapContainerStyle={{ width: '100%', height: '200px' }}
                          center={driverLocation}
                          zoom={15}
                          options={{ zoomControl: false, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, gestureHandling: 'none' }}
                        >
                          <MarkerF
                            position={driverLocation}
                            title="Driver"
                            icon={(() => {
                              const g = (window as any)?.google;
                              if (!g?.maps?.Size || !g?.maps?.Point) return undefined;
                              return { url: tricycleIcon, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) };
                            })()}
                          />
                          {(() => {
                            const addr = selectedOrder?.address || '';
                            const cp = addr.includes('|') ? addr.split('|')[1] : addr;
                            const cm = cp.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
                            if (!cm) return null;
                            return (
                            <MarkerF
                              position={{ lat: parseFloat(cm[1]), lng: parseFloat(cm[2]) }}
                              title="Customer"
                              icon={{
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                                scaledSize: new (window as any).google.maps.Size(32, 32),
                                anchor: new (window as any).google.maps.Point(16, 32),
                              }}
                            />
                            );
                          })()}
                          {routePath.length > 0 && (
                            <Polyline
                              path={routePath}
                              options={{ strokeColor: (driverStatus === 'on-the-way' || driverStatus === 'arrived' || driverStatus === 'accepted') ? '#10B981' : '#E11D48', strokeOpacity: 0.9, strokeWeight: 4, geodesic: true }}
                            />
                          )}
                        </GoogleMap>
                        <div className="px-3 py-2 bg-white border-t border-[#E2E8F0] flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#121212]">
                            {(driverStatus === 'on-the-way' || driverStatus === 'arrived' || driverStatus === 'accepted') ? '🟢 Heading to restaurant' : '🔴 Delivering to customer'}
                          </span>
                          {selectedOrder?.customerName && (
                            <span className="text-[10px] text-[#64748B]">{selectedOrder.customerName}</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="bg-[#FEF3C7] border-l-4 border-[#FFA500] p-2 md:p-3 rounded text-sm">
                      <p className="font-semibold text-[#92400E]">Status: On The Way</p>
                      <p className="text-xs text-[#92400E] mt-1">Driver is delivering the order</p>
                    </div>
                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'delivered');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[#64748B] hover:bg-[#475569] uppercase py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      ✓ Delivered - Complete Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'delivered' && (
                  <div className="bg-[#D1FAE5] border-l-4 border-[#10B981] p-2 md:p-3 rounded text-sm">
                    <p className="font-semibold text-[#065F46]">✓ Order Completed</p>
                    <p className="text-xs text-[#065F46] mt-1">Order has been successfully delivered</p>
                  </div>
                )}

                {selectedOrder.status === 'cancelled' && (
                  <div className="bg-[#FEE2E2] border-l-4 border-[#E11D48] p-2 md:p-3 rounded text-sm">
                    <p className="font-semibold text-[#991B1B]">✗ Order Cancelled</p>
                    <p className="text-xs text-[#991B1B] mt-1">This order has been cancelled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Popup */}
      {confirmAction && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center">
          <div className="bg-white rounded-3xl p-6 mx-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmAction === 'accept' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <span className="text-3xl">{confirmAction === 'accept' ? '✅' : '❌'}</span>
            </div>
            <h2 className="text-xl font-extrabold text-[#121212] mb-1">
              {confirmAction === 'accept' ? 'Accept this order?' : 'Decline this order?'}
            </h2>
            <p className="text-sm text-[#64748B] mb-1">Order #{selectedOrder.orderNumber}</p>
            <p className="text-sm text-[#64748B] mb-1">{selectedOrder.customerName}</p>
            <p className="text-lg font-bold text-[#E11D48] mb-4">₱{selectedOrder.total.toFixed(2)}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setConfirmAction(null)}
                variant="outline"
                className="flex-1 border-gray-300 text-gray-600 uppercase font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (confirmAction === 'accept') {
                    await updateOrderStatus(selectedOrder.id, 'preparing');
                  } else {
                    await updateOrderStatus(selectedOrder.id, 'cancelled');
                  }
                  setConfirmAction(null);
                  setSelectedOrder(null);
                }}
                className={`flex-1 uppercase font-bold ${
                  confirmAction === 'accept'
                    ? 'bg-[#10B981] hover:bg-[#059669]'
                    : 'bg-[#E11D48] hover:bg-[#BE123C]'
                }`}
              >
                {confirmAction === 'accept' ? 'Accept' : 'Decline'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
