import { useState, useEffect, useRef } from "react";
import { Store, Package, Clock, User, ChevronRight, CheckCircle, XCircle, AlertCircle, Menu, Navigation, MessageCircle } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import BusinessSidebar from "./BusinessSidebar";
    import { supabase } from "../../../lib/supabase";
    import { supabaseHelpers, logAudit } from "@/lib/supabase";
    import { useAuth } from "../../contexts/AuthContext";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { getOrderProgress, isRiderHeadingToRestaurant } from "@/lib/orderProgress";
import { OrderProgressStepper } from "../ui/OrderProgress";
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
  driverId?: string;
  driverName?: string;
  restaurantName?: string;
  restaurantAddress?: string;
  /**
   * The rider's live phase, from the ride request that carries this order.
   * `status` collapses the whole journey to the customer's address into one
   * value, so this is what lets the shop see which leg the rider is on.
   */
  driverStatus?: string | null;
  /** Whatever the rider app last wrote in `driver_status_message`. */
  driverMessage?: string | null;
  /** Why the order was cancelled, and which side cancelled it. */
  cancelReason?: string | null;
  cancelledBy?: string | null;
}


export default function BusinessOrders() {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<'active' | 'history'>('active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmAction, setConfirmAction] = useState<'accept' | null>(null);
  // Decline collects a reason before the order is cancelled.
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<'ready' | 'delivery' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way'>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  /*
   * Open a specific order when one arrives in the router state.
   *
   * The dashboard's notification panel sends here with `focusOrderId`, because the
   * order detail is a modal on this screen rather than a route of its own -- there is
   * no `/business/orders/:id`. Without consuming that state the tap landed on the
   * orders *list* and the customer had to hunt for the order themselves.
   *
   * Re-resolves on every `orders` change rather than only on mount, because the
   * list is still loading when the state first arrives; matching against an empty
   * array would silently do nothing.
   *
   * The state is cleared once consumed. Left in place, it would re-open the modal
   * every time the list refreshed -- and again on back, because router state
   * survives history.
   */
  useEffect(() => {
    const state = location.state as { focusOrderId?: string } | null;
    const id = state?.focusOrderId;
    if (!id) return;
    const match = orders.find((o) => o.id === id);
    if (!match) return;
    setSelectedOrder(match);
    navigate(".", { replace: true, state: null });
  }, [location.state, orders, navigate]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Prevent refresh during update
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToCustomer, setEtaToCustomer] = useState<string | null>(null);
  const [rideRequestInfo, setRideRequestInfo] = useState<any>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the realtime subscription can call the latest loadOrders without
  // re-subscribing on every render.
  const loadOrdersRef = useRef<(() => Promise<void>) | null>(null);
  const isUpdatingStatusRef = useRef(false);

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

  /*
   * Poll the rider for whichever order is open.
   *
   * Previously this ran only for `on-the-way` orders and only kept the driver's
   * GPS, so the shop's view of the rider froze as soon as the order left
   * `on-the-way` — exactly when the rider is collecting the food and the shop
   * most wants to know they actually turned up. It now follows `driver_status`
   * for the whole rider leg and keeps the last phase once the order is
   * delivered, so the modal does not blank out behind a completed delivery.
   *
   * `driver_status` is read from the ride request rather than the order status:
   * they were both written into this state, and `orders.status` is the coarse
   * "on-the-way" value that says nothing about which leg the rider is on.
   */
  useEffect(() => {
    const hasRider = !!selectedOrder && ['confirmed', 'on-the-way', 'delivered'].includes(selectedOrder.status);

    if (!hasRider) {
      if (trackingPollRef.current) clearInterval(trackingPollRef.current);
      setDriverLocation(null);
      setRoutePath([]);
      setRideRequestInfo(null);
      setDriverStatus(null);
      return;
    }

    const pollDriver = async () => {
      if (!selectedOrder) return;
      try {
        const { data: freshOrder } = await supabase
          .from('orders')
          .select('driver_lat, driver_lng, driver_name, status, address')
          .eq('id', selectedOrder.id)
          .single();

        if (freshOrder?.driver_lat && freshOrder?.driver_lng) {
          setDriverLocation({ lat: freshOrder.driver_lat, lng: freshOrder.driver_lng });
        }

        // The driver's live GPS *and* phase live on the ride request that carries
        // this order (`ride_requests.driver_*`); the orders table may not even
        // have driver_lat/lng columns.
        const { data: freshRide } = await supabase
          .from('ride_requests')
          .select('driver_lat, driver_lng, driver_status, driver_status_message')
          .eq('order_id', selectedOrder.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (freshRide?.driver_lat && freshRide?.driver_lng) {
          setDriverLocation({ lat: freshRide.driver_lat, lng: freshRide.driver_lng });
        }
        if (freshRide?.driver_status) setDriverStatus(freshRide.driver_status);
      } catch (err) {
        console.error('[BusinessOrders] Error polling driver location:', err);
      }
    };

    pollDriver();
    trackingPollRef.current = setInterval(pollDriver, 3000);
    return () => { if (trackingPollRef.current) clearInterval(trackingPollRef.current); };
  }, [selectedOrder?.id, selectedOrder?.status]);

  // Live tracking straight from the driver's active ride (the ride request for
  // this order), so the map and the phase move the moment the rider acts.
  useEffect(() => {
    if (!selectedOrder || !['confirmed', 'on-the-way'].includes(selectedOrder.status)) return;
    const unsubscribe = supabaseHelpers.subscribeToOrderDelivery(selectedOrder.id, (ride) => {
      if (ride.driver_lat && ride.driver_lng) {
        setDriverLocation({ lat: ride.driver_lat, lng: ride.driver_lng });
      }
      if (ride.driver_status) setDriverStatus(ride.driver_status);
    });
    return unsubscribe;
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
      if (status === 'OK' && result?.routes?.[0]) {
        const route = result.routes[0];
        if (route.overview_polyline?.points) {
          setRoutePath(decodePolyline(route.overview_polyline.points));
        }
        const leg = route.legs?.[0];
        if (leg?.duration?.text) {
          setEtaToCustomer(leg.duration.text);
        }
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
          cancelReason: dbOrder.cancel_reason || null,
          cancelledBy: dbOrder.cancelled_by || null,
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
            if (!rr.order_id) return;
            const order = transformedOrders.find((o: any) => o.id === rr.order_id);
            if (!order) return;

            // Store driver info for messaging
            if (rr.accepted_driver_id) {
              order.driverId = rr.accepted_driver_id;
            }
            if (rr.driver_name) {
              order.driverName = rr.driver_name;
            }

            if (!rr.driver_status) return;
            // Keep the raw rider phase on the order so the progress track can show
            // it. `status` alone flattens "heading to the shop", "waiting at the
            // shop", "driving over" and "at the door" into `on-the-way`.
            order.driverStatus = rr.driver_status;
            if (rr.driver_status_message) order.driverMessage = rr.driver_status_message;

            // The driver's ride_requests row may lag behind the orders table, or
            // an order may have been completed from this screen already. Driver
            // status may only *advance* an in-transit order — it must never
            // revert a terminal (delivered/cancelled) one.
            const statusMap: Record<string, Order['status']> = {
              'on-the-way': 'on-the-way', 'arrived': 'on-the-way',
              'picked-up': 'on-the-way', 'dropped-off': 'on-the-way',
              'awaiting-payment': 'on-the-way',
              'completed': 'delivered',
            };
            const mapped = statusMap[rr.driver_status];
            const isTerminal = order.status === 'delivered' || order.status === 'cancelled';
            if (mapped && !isTerminal) {
              order.status = mapped;
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

  loadOrdersRef.current = loadOrders;
  isUpdatingStatusRef.current = isUpdatingStatus;

  // Realtime updates: refresh the list as soon as one of this restaurant's
  // orders changes (e.g. a driver completes a delivery), or a driver's live
  // status on a ride request changes, instead of waiting for the 5s poll.
  // The existing interval stays as a fallback.
  useEffect(() => {
    if (!restaurantId) return;

    console.log('[BusinessOrders] Setting up realtime orders subscription for', restaurantId);

    // Coalesce bursts of row changes into a single refetch.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      // Don't clobber an in-flight optimistic status update.
      if (isUpdatingStatusRef.current) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        loadOrdersRef.current?.();
      }, 300);
    };

    const channel = supabase
      .channel(`business-orders-${restaurantId}`)
      // Order rows for this restaurant (created/updated/cancelled).
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_email=eq.${restaurantId}`,
        },
        scheduleRefresh
      )
      // Driver progress on the delivery requests behind those orders.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_requests' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      console.log('[BusinessOrders] Cleaning up realtime orders subscription');
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const activeOrders = orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'on-the-way'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  // Filter active orders by selected status
  const filteredActiveOrders = selectedStatusFilter === 'all' 
    ? activeOrders 
    : activeOrders.filter(o => o.status === selectedStatusFilter);

  /** Decline a pending order, recording the reason the business gave. */
  const declineOrder = async (orderId: string, reason: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    setIsUpdatingStatus(true);
    const previousStatus = order.status;

    try {
      const update = {
        status: 'cancelled' as const,
        cancel_reason: reason,
        cancelled_by: 'business',
        updated_at: new Date().toISOString(),
      };

      // Optimistic update so the list reflects the decline immediately.
      setOrders(prev => prev.map(o => (
        o.id === orderId
          ? { ...o, status: 'cancelled', cancelReason: reason, cancelledBy: 'business' }
          : o
      )));

      const { error } = await supabase.from('orders').update(update).eq('id', orderId);

      if (error) {
        // Same backup as the other status changes: match on the order number.
        const { error: backupError } = await supabase
          .from('orders')
          .update(update)
          .eq('order_number', order.orderNumber);

        if (backupError) {
          console.error('[BusinessOrders] Decline failed:', backupError);
          // Roll the optimistic update back.
          setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: previousStatus } : o)));
          alert(`Failed to decline order: ${backupError.message}`);
          return;
        }
      }

      console.log('[BusinessOrders] Order declined with reason:', reason);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

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

      logAudit({
        action: 'update_order_status',
        actorRole: 'business',
        entityType: 'order',
        entityId: order.id,
        summary: `Order ${order.orderNumber} → ${newStatus}`,
        details: { from: order.status, to: newStatus },
        actorEmail: user?.email,
        actorName: user?.name,
      });

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
        return 'bg-[var(--amber)]';
      case 'preparing':
        return 'bg-[var(--info)]';
      case 'confirmed':
        return 'bg-[var(--info)]';
      case 'ready':
        return 'bg-[var(--success)]';
      case 'on-the-way':
        return 'bg-[var(--amber)]';
      case 'delivered':
        return 'bg-[var(--success)]';
      case 'cancelled':
        return 'bg-[var(--primary)]';
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

  /*
   * The progress track for the open order, built from its status and the rider's
   * live phase.
   *
   * This used to be a private six-step table here with a matching one in the
   * customer's order screen, and the two disagreed. It also had no rider leg
   * beyond "Delivering", so a rider stuck at the shop and a rider already at the
   * customer's door looked identical to the shop owner. The step list and the
   * mapping now live in `@/lib/orderProgress` and both screens render it.
   */
  const progress = selectedOrder
    ? getOrderProgress({
        status: selectedOrder.status,
        driverStatus: driverStatus ?? selectedOrder.driverStatus,
        driverMessage: selectedOrder.driverMessage,
        deliveryMode: selectedOrder.deliveryMode,
      })
    : null;

  // Which leg of the trip the rider is on. The old inline check listed
  // `accepted`, `on-the-way` and `arrived` but not `picked-up`, so the route line
  // flipped colour at the wrong moment.
  const isRiderEnRouteToShop = isRiderHeadingToRestaurant(driverStatus ?? selectedOrder?.driverStatus);

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 w-full">
        {/* Header */}
        <div className="px-3 md:px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
            >
              <Menu className="w-6 h-6 text-[var(--ink)]" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)] mb-1 md:mb-2">Orders</h1>
              <p className="text-xs md:text-sm text-[var(--muted-foreground)]">{activeOrders.length} active orders</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {/* The horizontal scroll belongs to the status row alone. While it was on
            this shared wrapper, swiping the chips dragged Active/History off-screen
            with them. */}
        <div className="px-3 md:px-5 py-3 border-b border-[var(--border)] sticky top-0 bg-surface z-50 space-y-2 md:space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTab('active')}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
                selectedTab === 'active'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              onClick={() => setSelectedTab('history')}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
                selectedTab === 'history'
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
              }`}
            >
              History ({historyOrders.length})
            </button>
          </div>

           {/* Status Filter - Only for Active Tab */}
           {selectedTab === 'active' && (
             <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 md:flex-wrap md:gap-2">
               <button
                 onClick={() => setSelectedStatusFilter('all')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'all'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
               >
                 All ({activeOrders.length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('pending')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'pending'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
               >
                 New ({activeOrders.filter(o => o.status === 'pending').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('preparing')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'preparing'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
               >
                 Preparing ({activeOrders.filter(o => o.status === 'preparing').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('ready')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'ready'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
               >
                 Ready ({activeOrders.filter(o => o.status === 'ready').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('confirmed')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'confirmed'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
               >
                 Delivery ({activeOrders.filter(o => o.status === 'confirmed').length})
               </button>
               <button
                 onClick={() => setSelectedStatusFilter('on-the-way')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'on-the-way'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
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
                  className="p-3 md:p-4 border border-line active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-[var(--ink)] text-sm md:text-base">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-[var(--muted-foreground)] truncate">{order.customerName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base md:text-lg font-bold text-[var(--primary)]">₱{order.total.toFixed(2)}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1 mb-3 text-xs md:text-sm">
                    {order.items.slice(0, 2).map((item, idx) => (
                      <p key={idx} className="text-xs md:text-sm text-[var(--muted-foreground)] truncate">
                        {item.quantity}x {item.name}
                      </p>
                    ))}
                    {order.items.length > 2 && (
                      <p className="text-xs text-[var(--muted-foreground)]">+{order.items.length - 2} more items</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={order.paymentMethod === 'gcash' ? 'bg-[var(--success)] text-white text-xs' : 'bg-surface border border-[var(--border)] text-[var(--muted-foreground)] text-xs'}>
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
                <Clock className="w-12 md:w-16 h-12 md:h-16 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[var(--muted-foreground)]">No active orders</p>
              </div>
            )
          ) : (
            historyOrders.length > 0 ? (
              historyOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="p-3 md:p-4 border border-line opacity-75 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-[var(--ink)] text-sm md:text-base">#{order.orderNumber}</h3>
                        <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-[var(--muted-foreground)] truncate">{order.customerName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base md:text-lg font-bold text-[var(--ink)]">₱{order.total}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs md:text-sm">
                    {order.items.slice(0, 2).map((item, idx) => (
                      <p key={idx} className="text-xs md:text-sm text-[var(--muted-foreground)] truncate">
                        {item.quantity}x {item.name}
                      </p>
                    ))}
                    {order.items.length > 2 && (
                      <p className="text-xs text-[var(--muted-foreground)]">+{order.items.length - 2} more items</p>
                    )}
                  </div>

                  {/* Cancellation reason, readable straight from the history list */}
                  {order.status === 'cancelled' && order.cancelReason && (
                    <div className="mt-3 p-2.5 rounded-xl border border-[var(--error)] bg-[var(--error-soft)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--error)] mb-0.5">
                        {order.cancelledBy === 'customer' ? 'Cancelled by customer' : 'Declined'}
                      </p>
                      <p className="text-xs text-[var(--error)]">{order.cancelReason}</p>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <Package className="w-12 md:w-16 h-12 md:h-16 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[var(--muted-foreground)]">No order history</p>
              </div>
            )
          )}
        </div>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
            <div className="bg-surface w-full h-full md:h-auto md:rounded-t-3xl md:max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-surface border-b border-[var(--border)] px-4 md:px-5 py-3 md:py-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold text-[var(--ink)]">#{selectedOrder.orderNumber}</h2>
                  <button onClick={() => setSelectedOrder(null)} className="text-lg font-semibold text-[var(--info)]">
                    <span className="hidden md:inline">Close</span>
                    <span className="md:hidden">✕</span>
                  </button>
                </div>
                <Badge className={`${getStatusColor(selectedOrder.status)} text-white`}>
                  {progress?.currentStepIsRiderStep && progress.riderHasStarted
                    ? progress.currentTitle
                    : getStatusLabel(selectedOrder.status)}
                </Badge>

                {/* Status Progress Bar - same track as the customer's screen */}
                <div className="mt-3 md:mt-4">
                  <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">ORDER PROGRESS</p>
                  {progress && <OrderProgressStepper progress={progress} />}
                </div>
              </div>

              <div className="p-3 md:p-5 space-y-3 md:space-y-4">
                {/* Why the order was cancelled, so the reason is never buried */}
                {selectedOrder.status === 'cancelled' && selectedOrder.cancelReason && (
                  <div className="p-3 rounded-xl border border-[var(--error)] bg-[var(--error-soft)]">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--error)] mb-1">
                      {selectedOrder.cancelledBy === 'customer' ? 'Cancelled by customer' : 'Order declined'}
                    </p>
                    <p className="text-sm text-[var(--error)]">{selectedOrder.cancelReason}</p>
                  </div>
                )}

                {/* Customer Info */}
                <div>
                  <h3 className="font-bold text-[var(--ink)] mb-2 text-sm md:text-base">Customer</h3>
                  <p className="text-sm md:text-base text-[var(--muted-foreground)]">{selectedOrder.customerName}</p>
                  <p className="text-xs md:text-sm text-[var(--muted-foreground)] mt-1 break-words">{selectedOrder.address.split('|')[0].trim() || selectedOrder.address}</p>
                  {selectedOrder.customerPhone && (
                    <p className="text-xs md:text-sm text-[var(--muted-foreground)] mt-1">Phone: {selectedOrder.customerPhone}</p>
                  )}
                </div>

                {/* Order Items */}
                <div>
                  <h3 className="font-bold text-[var(--ink)] mb-2 text-sm md:text-base">Items</h3>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 md:p-3 bg-[var(--muted)] rounded-xl">
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--ink)] text-sm md:text-base truncate">{item.name}</p>
                          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Qty: {item.quantity}</p>
                        </div>
                        <p className="font-bold text-[var(--ink)] text-sm md:text-base flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="border-t border-[var(--border)] pt-3 md:pt-4">
                  <div className="flex items-center justify-between mb-2 text-sm md:text-base">
                    <span className="text-[var(--muted-foreground)]">Subtotal</span>
                    <span className="font-semibold text-[var(--ink)]">₱{(selectedOrder.total - selectedOrder.deliveryFee).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm md:text-base">
                    <span className="text-[var(--muted-foreground)]">Delivery Fee</span>
                    <span className="font-semibold text-[var(--ink)]">₱{selectedOrder.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 md:pt-3 border-t border-[var(--border)]">
                    <span className="font-bold text-[var(--ink)] md:text-base">Total</span>
                    <span className="text-lg md:text-xl font-bold text-[var(--primary)]">₱{selectedOrder.total.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 md:mt-3">
                    <Badge className={selectedOrder.paymentMethod === 'gcash' ? 'bg-[var(--success)] text-white text-xs md:text-sm' : 'border-[var(--amber)] text-[var(--amber)] text-xs md:text-sm'} variant={selectedOrder.paymentMethod === 'gcash' ? 'default' : 'outline'}>
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
                      className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      ✓ Accept Order
                    </Button>
                    <Button
                      onClick={() => setShowDeclinePrompt(true)}
                      variant="outline"
                      className="w-full border-[var(--primary)] text-[var(--primary)] py-4 md:py-6 text-sm md:text-base"
                    >
                      ✗ Decline Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'preparing' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setStatusConfirm('ready')}
                      className="w-full bg-[var(--amber)] hover:bg-[var(--amber)] py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      → Ready for Pickup
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'ready' && (
                  <div className="space-y-2">
                    {selectedOrder.deliveryMode === 'delivery' && (
                      <Button
                        onClick={() => setStatusConfirm('delivery')}
                        className="w-full bg-[var(--info)] hover:bg-[var(--info)] py-4 md:py-6 font-bold text-sm md:text-base"
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
                      <div className="rounded-xl overflow-hidden border-2 border-[var(--info)]">
                        <div className="bg-gradient-to-r from-[var(--info)] to-[var(--info)] px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
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
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                                scaledSize: new (window as any).google.maps.Size(32, 32),
                                anchor: new (window as any).google.maps.Point(16, 32),
                              }}
                            />
                            );
                          })()}
                          {routePath.length > 0 && (
                            <Polyline
                              path={routePath}
                              options={{
                                  /* Green while the rider is still on the way to the
                                     shop, a different colour once they are carrying
                                     the order, so the route line tells you which leg
                                     it is. */
                                  strokeColor: isRiderEnRouteToShop ? 'var(--success)' : 'var(--primary)',
                                  strokeOpacity: 0.9,
                                  strokeWeight: 4,
                                  geodesic: true,
                                }}
                            />
                          )}
                        </GoogleMap>
                        <div className="px-3 py-2 bg-surface border-t border-[var(--border)] flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--ink)]">
                            {/* Reuses the track's own wording so the map caption
                                cannot disagree with the stepper above it. */}
                            {isRiderEnRouteToShop ? '🟢 Heading to restaurant' : '🔴 Delivering to customer'}
                          </span>
                          <div className="flex items-center gap-2">
                            {etaToCustomer && (
                              <span className="text-[10px] font-bold text-[var(--info)] bg-[var(--info-soft)] px-2 py-0.5 rounded-full">🏁 {etaToCustomer}</span>
                            )}
                            {selectedOrder?.customerName && (
                              <span className="text-[10px] text-[var(--muted-foreground)]">{selectedOrder.customerName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {isMapsLoaded && !driverLocation && (
                      <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-4 text-center">
                        <p className="text-sm font-semibold text-[var(--ink)]">Waiting for the driver's location…</p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">Live tracking appears once the driver shares GPS.</p>
                      </div>
                    )}

                    /*
                      The rider's actual phase, not just "on the way".

                      `orders.status` is `on-the-way` for the whole trip to the
                      customer's address, so this used to claim the driver was
                      delivering while they were still parked outside the shop
                      waiting for the food. The rider writes a status for each leg
                      and a message to go with it.
                    */
                    <div className="bg-[var(--amber-soft)] border-l-4 border-[var(--amber)] p-2 md:p-3 rounded text-sm">
                      <p className="font-semibold text-[var(--amber-ink)]">
                        Rider: {progress?.currentTitle ?? getStatusLabel(selectedOrder.status)}
                      </p>
                      {progress?.riderMessage && (
                        <p className="text-xs text-[var(--amber-ink)] mt-1">"{progress.riderMessage}"</p>
                      )}
                      {!progress?.riderMessage && progress?.currentStep && (
                        <p className="text-xs text-[var(--amber-ink)] mt-1">{progress.currentStep.description}</p>
                      )}
                      {selectedOrder.driverName && (
                        <p className="text-xs text-[var(--amber-ink)] mt-1">Driver: {selectedOrder.driverName}</p>
                      )}
                    </div>

                    {/* Message Buttons */}
                    <div className="flex gap-2">
                      {selectedOrder.driverId && (
                        <Button
                          onClick={() => navigate(`/business/messages/driver/${selectedOrder.driverId}`)}
                          className="flex-1 bg-[var(--success)] hover:bg-[var(--success)] py-4 font-bold text-sm md:text-base"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message Driver
                        </Button>
                      )}
                      {selectedOrder.customerId && (
                        <Button
                          onClick={() => navigate(`/business/messages/customer/${selectedOrder.customerId}`)}
                          className="flex-1 bg-[var(--info)] hover:bg-[var(--info)] py-4 font-bold text-sm md:text-base"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message Customer
                        </Button>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'delivered');
                        setSelectedOrder(null);
                      }}
                      className="w-full bg-[var(--muted-foreground)] hover:bg-[var(--muted-foreground)] py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      ✓ Delivered - Complete Order
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'delivered' && (
                  <div className="bg-[var(--success-soft)] border-l-4 border-[var(--success)] p-2 md:p-3 rounded text-sm">
                    <p className="font-semibold text-[var(--success)]">✓ Order Completed</p>
                    <p className="text-xs text-[var(--success)] mt-1">Order has been successfully delivered</p>
                  </div>
                )}

                {selectedOrder.status === 'cancelled' && (
                  <div className="bg-[var(--error-soft)] border-l-4 border-[var(--primary)] p-2 md:p-3 rounded text-sm">
                    <p className="font-semibold text-[var(--error)]">✗ Order Cancelled</p>
                    <p className="text-xs text-[var(--error)] mt-1">This order has been cancelled</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accept Confirmation Popup */}
      {confirmAction === 'accept' && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-6 mx-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmAction === 'accept' ? 'bg-[var(--success-soft)]' : 'bg-[var(--error-soft)]'
            }`}>
              <span className="text-3xl">{confirmAction === 'accept' ? '✅' : '❌'}</span>
            </div>
            <h2 className="text-xl font-extrabold text-[var(--ink)] mb-1">
              {confirmAction === 'accept' ? 'Accept this order?' : 'Decline this order?'}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Order #{selectedOrder.orderNumber}</p>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">{selectedOrder.customerName}</p>
            <p className="text-lg font-bold text-[var(--primary)] mb-4">₱{selectedOrder.total.toFixed(2)}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setConfirmAction(null)}
                variant="outline"
                className="flex-1 border-[var(--border)] text-[var(--muted-foreground)] font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await updateOrderStatus(selectedOrder.id, 'preparing');
                  setConfirmAction(null);
                  // Stay on the order. This closed the detail modal entirely, so
                  // accepting dumped the shop owner back on the orders list and
                  // they had to find and reopen the order just accepted to do
                  // anything with it. The modal stays, showing the new status, and
                  // the refresh that follows picks up the rest of the order.
                  setSelectedOrder((o) => (o ? { ...o, status: 'preparing' as Order['status'] } : o));
                }}
                className={`flex-1 font-bold ${
                  confirmAction === 'accept'
                    ? 'bg-[var(--success)] hover:bg-[var(--success)]'
                    : 'bg-[var(--primary)] hover:bg-[var(--primary)]'
                }`}
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Popup — collects a reason before the order is cancelled */}
      <ReasonPromptModal
        isOpen={showDeclinePrompt}
        title="Decline this order?"
        description={
          selectedOrder
            ? `Order #${selectedOrder.orderNumber} · ${selectedOrder.customerName}`
            : undefined
        }
        confirmLabel="Decline Order"
        placeholder="e.g. Store is closing, items unavailable, address out of range…"
        variant="danger"
        zIndexClassName="z-[3500]"
        onCancel={() => setShowDeclinePrompt(false)}
        onSubmit={async (reason) => {
          const orderId = selectedOrder?.id;
          setShowDeclinePrompt(false);
          if (!orderId) return;
          await declineOrder(orderId, reason);
          setSelectedOrder(null);
        }}
      />

      {/* Status Change Confirmation Popup */}
      {statusConfirm && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-6 mx-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <h2 className="text-xl font-extrabold text-[var(--ink)] mb-1">
              {statusConfirm === 'ready' ? 'Ready for Pickup?' : 'Ready for Delivery?'}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Order #{selectedOrder.orderNumber}</p>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">{selectedOrder.customerName}</p>
            <p className="text-lg font-bold text-[var(--primary)] mb-4">₱{selectedOrder.total.toFixed(2)}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setStatusConfirm(null)}
                variant="outline"
                className="flex-1 border-[var(--border)] text-[var(--muted-foreground)] font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const nextStatus: Order['status'] =
                    statusConfirm === 'ready' ? 'ready' : 'confirmed';
                  if (statusConfirm === 'ready') {
                    await updateOrderStatus(selectedOrder.id, 'ready');
                  } else {
                    await handleReadyForDelivery(selectedOrder);
                  }
                  setStatusConfirm(null);
                  // Same as accepting: keep the detail open on this order and let it
                  // show the status it just moved to, rather than dropping the shop
                  // owner back on the orders list mid-flow.
                  setSelectedOrder((o) => (o ? { ...o, status: nextStatus } : o));
                }}
                className={`flex-1 font-bold ${
                  statusConfirm === 'ready'
                    ? 'bg-[var(--amber)] hover:bg-[var(--amber)]'
                    : 'bg-[var(--info)] hover:bg-[var(--info)]'
                }`}
              >
                {statusConfirm === 'ready' ? 'Confirm Pickup' : 'Confirm Delivery'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
