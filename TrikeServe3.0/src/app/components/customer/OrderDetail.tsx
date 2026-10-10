import { ArrowLeft, Package, Clock, MapPin, CreditCard, Star, Navigation, CheckCircle, AlertCircle, Phone, MessageCircle, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";
import { supabase } from "../../../lib/supabase";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { supabaseHelpers } from "@/lib/supabase";
import { getOrderProgress } from "@/lib/orderProgress";
import { OrderProgressStepper, OrderProgressTimeline } from "../ui/OrderProgress";
import { useState, useEffect, useRef } from "react";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'

interface OrderData {
  id: string;
  orderNumber: string;
  restaurantName: string;
  businessId?: string | null;
  restaurantImage: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  date: string;
  status: string;
  deliveryMode: string;
  address: string;
  estimatedTime: string;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  needsCutlery: boolean;
  createdAt: string;
  driverName?: string;
  driverId?: string;
  /**
   * Live rider progress for this order, from the ride request that carries it.
   * `orders.status` only says "a rider is involved"; this says what they are
   * doing, which is what the progress track needs for its later steps.
   */
  driverStatus?: string | null;
  /** Whatever the rider app last wrote in `driver_status_message`. */
  driverMessage?: string | null;
  /** Why the order was cancelled, and which side cancelled it. */
  cancelReason?: string | null;
  cancelledBy?: string | null;
}

function buildOrderData(dbOrder: any): OrderData {
  let parsedItems = [];
  try {
    parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
  } catch { parsedItems = []; }
  return {
    id: dbOrder.id,
    orderNumber: dbOrder.order_number || 'Unknown',
    restaurantName: dbOrder.restaurant_name || 'Restaurant',
    businessId: dbOrder.business_id || null,
    restaurantImage: '',
    customerName: dbOrder.customer_name || 'Customer',
    customerEmail: dbOrder.customer_email || '',
    customerPhone: dbOrder.customer_phone || '',
    date: new Date(dbOrder.created_at).toLocaleString(),
    status: dbOrder.status || 'pending',
    deliveryMode: dbOrder.delivery_mode || 'delivery',
    address: dbOrder.address || '',
    estimatedTime: dbOrder.estimated_time || '30 mins',
    items: parsedItems,
    subtotal: dbOrder.subtotal || 0,
    deliveryFee: dbOrder.delivery_fee || 0,
    total: dbOrder.total || 0,
    paymentMethod: dbOrder.payment_method || 'cash',
    needsCutlery: dbOrder.needs_cutlery || false,
    createdAt: dbOrder.created_at,
    driverName: dbOrder.driver_name || undefined,
    driverId: undefined,
    driverStatus: dbOrder.driver_status || null,
    driverMessage: dbOrder.driver_status_message || null,
    cancelReason: dbOrder.cancel_reason || null,
    cancelledBy: dbOrder.cancelled_by || null,
  };
}

/*
 * The step list itself lives in `@/lib/orderProgress`, shared with the business
 * screen. It used to be a private five-step table here, which could not show the
 * rider's leg at all: `confirmed` and `on-the-way` both landed on "Out for
 * Delivery", so the customer watching a rider sit at the restaurant, collect the
 * food and drive over saw a tracker that did not move.
 */

const statusColors: Record<string, string> = {
  'pending': 'bg-[var(--amber)] text-white',
  'preparing': 'bg-[var(--info)] text-white',
  'ready': 'bg-[var(--success)] text-white',
  'confirmed': 'bg-[var(--info)] text-white',
  'on-the-way': 'bg-[var(--info)] text-white',
  'delivered': 'bg-[var(--success)] text-white',
  'cancelled': 'bg-[var(--error)] text-white',
};

/*
 * The badge headline, per order status.
 *
 * Once a rider is involved this is overridden by the progress track, which knows
 * the finer-grained rider phase — "On the Way" meant anything from the rider
 * leaving the shop to arriving at the door.
 */
const statusLabels: Record<string, string> = {
  'pending': 'New Order',
  'payment-confirmed': 'Payment confirmed',
  'preparing': 'Preparing Your Order',
  'ready': 'Ready for Pickup',
  'confirmed': 'Driver Assigned',
  'on-the-way': 'On the Way',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
};

export default function OrderDetail() {
  const navigate = useNavigate();
  /*
   * Back means "pop", not "go to Activity".
   *
   * Both back affordances here — the header chevron and the empty-state button —
   * pushed `/customer/activity` as a new history entry. That breaks reversing a
   * flow: the customer arrived from somewhere specific, and pressing back sent them
   * to a fixed screen instead, leaving the real previous page stranded further back
   * in the stack. Pressing back again from Activity repeated the push rather than
   * unwinding anything.
   *
   * `usePreviousPage` pops the entry that is genuinely behind, and falls back to
   * Activity only on a cold deep link where there is no history to pop.
   */
  const goBack = usePreviousPage("/customer/activity");
  const { orderId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  // Cancelling an order asks for a reason first.
  const [showCancelOrderPrompt, setShowCancelOrderPrompt] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToCustomer, setEtaToCustomer] = useState<string | null>(null);
  // Lets the refresh button call the loader defined in the mount effect.
  const fetchOrderRef = useRef<(() => Promise<void>) | null>(null);

  // ─── Load order once ───────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) { setIsLoading(false); return; }

    const fetchOrder = async () => {
      try {
        const { data: dbOrder, error: dbError } = await supabase
          .from('orders').select('*').eq('id', orderId).single();

        if (dbError || !dbOrder) {
          setError('Order not found');
          setIsLoading(false);
          return;
        }

        const data = buildOrderData(dbOrder);

        // Fetch driver info from ride_requests
        try {
          const { data: rideReq } = await supabase
            .from('ride_requests')
            .select('accepted_driver_id, driver_name, driver_lat, driver_lng, driver_status, driver_status_message')
            .eq('order_id', orderId)
            .not('accepted_driver_id', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (rideReq) {
            if (rideReq.accepted_driver_id) data.driverId = rideReq.accepted_driver_id;
            if (rideReq.driver_name) data.driverName = rideReq.driver_name;
            // The rider's own progress is only on the ride request, and it is what
            // moves the track past "Rider Assigned".
            if (rideReq.driver_status) data.driverStatus = rideReq.driver_status;
            if (rideReq.driver_status_message) data.driverMessage = rideReq.driver_status_message;
            // The live driver GPS lives on the ride request (the orders table may
            // not have driver_lat/lng columns).
            if (rideReq.driver_lat && rideReq.driver_lng) {
              setDriverLocation({ lat: rideReq.driver_lat, lng: rideReq.driver_lng });
            }
          }
        } catch (err) {
          console.error('[OrderDetail] Error fetching driver info:', err);
        }

        setOrder(data);

        // Resolve business id
        let resolvedBusinessId = dbOrder.business_id || null;
        let restaurantLogo = '';
        if (!resolvedBusinessId && dbOrder.restaurant_email) {
          try {
            const { data: restaurant } = await supabase
              .from('restaurants').select('business_user_id, logo_image').eq('id', dbOrder.restaurant_email).maybeSingle();
            if (restaurant?.business_user_id) resolvedBusinessId = restaurant.business_user_id;
            if (restaurant?.logo_image) restaurantLogo = restaurant.logo_image;
          } catch {}
        } else if (dbOrder.restaurant_email) {
          try {
            const { data: restaurant } = await supabase
              .from('restaurants').select('logo_image').eq('id', dbOrder.restaurant_email).maybeSingle();
            if (restaurant?.logo_image) restaurantLogo = restaurant.logo_image;
          } catch {}
        }
        if (resolvedBusinessId || restaurantLogo) setOrder(prev => prev ? { ...prev, businessId: resolvedBusinessId || prev.businessId, restaurantImage: restaurantLogo || prev.restaurantImage } : prev);
      } catch (e) {
        console.error('[OrderDetail] Error:', e);
        setError('Failed to load order');
      }
      setIsLoading(false);
    };

    fetchOrderRef.current = fetchOrder;
    fetchOrder();
  }, [orderId]);

  // ─── POLLING: Every 3 seconds ─────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (!data) return;

        /*
         * The rider's live GPS *and* phase both live on the ride request that
         * carries this order — the orders table may not have driver_lat/lng
         * columns at all, and the phase is only ever recorded on the ride
         * request. One read covers both, and it is not gated on the rider having
         * shared GPS: a rider who has arrived at the shop but not moved yet still
         * has a status that moves the track.
         */
        const { data: rideReq } = await supabase
          .from('ride_requests')
          .select('driver_lat, driver_lng, driver_status, driver_status_message')
          .eq('order_id', orderId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lat = data.driver_lat ?? rideReq?.driver_lat;
        const lng = data.driver_lng ?? rideReq?.driver_lng;
        if (lat && lng) {
          setDriverLocation({ lat, lng });
        }

        // Build new order data and always set it
        const newData = buildOrderData(data);
        newData.driverStatus = rideReq?.driver_status ?? null;
        newData.driverMessage = rideReq?.driver_status_message ?? null;
        setOrder(prev => {
          // Preserve driverId and businessId from previous state (not in DB order row)
          if (prev) {
            newData.driverId = newData.driverId || prev.driverId;
            newData.businessId = newData.businessId || prev.businessId;
            // Keep the last known rider status when this poll saw no ride request
            // (no rider yet, or the read failed) — the track must not fall back.
            newData.driverStatus = newData.driverStatus || prev.driverStatus || null;
            newData.driverMessage = newData.driverMessage || prev.driverMessage || null;
          }
          // Only update if status or driver changed
          if (
            prev &&
            prev.status === newData.status &&
            prev.driverName === newData.driverName &&
            prev.driverStatus === newData.driverStatus &&
            prev.driverMessage === newData.driverMessage
          ) return prev;
          return newData;
        });
      } catch (err) {
        console.error('[OrderDetail] Poll error:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  // ─── Live driver tracking via the driver's active ride ────────────
  // Follows the ride request the driver accepted for this order, so the map
  // updates the moment the driver's GPS is written (no waiting on a poll).
  useEffect(() => {
    if (!orderId) return;
    const unsubscribe = supabaseHelpers.subscribeToOrderDelivery(orderId, (ride) => {
      if (ride.driver_lat && ride.driver_lng) {
        setDriverLocation({ lat: ride.driver_lat, lng: ride.driver_lng });
      }
      // The rider's status arrives here first, so the track advances on the
      // moment they tap a button rather than on the next 3s poll.
      if (ride.driver_status) {
        setOrder(prev => (prev ? {
          ...prev,
          driverName: prev.driverName || ride.driver_name || undefined,
          driverStatus: ride.driver_status,
          driverMessage: ride.driver_status_message || prev.driverMessage || null,
        } : prev));
      } else if (ride.driver_name) {
        setOrder(prev => (prev && !prev.driverName ? { ...prev, driverName: ride.driver_name } : prev));
      }
    });
    return unsubscribe;
  }, [orderId]);

  // ─── Compute route from driver to customer ─────────────────────────
  useEffect(() => {
    if (!driverLocation || !isMapsLoaded || !(window as any).google || !order?.address) {
      setRoutePath([]);
      return;
    }
    const parseCoords = (addr: string): { lat: number; lng: number } | null => {
      const coordPart = addr.includes('|') ? addr.split('|')[1] : addr;
      const m = coordPart.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
      return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
    };
    const dest = parseCoords(order.address);
    if (!dest) { setRoutePath([]); return; }

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
  }, [driverLocation, isMapsLoaded, order?.address]);

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

  /**
   * Cancel a pending order, recording the customer's reason.
   *
   * Only allowed while the restaurant hasn't accepted, so the button is only
   * rendered for `pending` orders.
   */
  const handleCancelOrder = async (reason: string) => {
    if (!order) return;

    const { error: cancelError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: reason,
        cancelled_by: 'customer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (cancelError) {
      console.error('[OrderDetail] Failed to cancel order:', cancelError);
      // Not setError() — that would swap the page for the "Order not found" screen.
      alert(`Failed to cancel the order: ${cancelError.message || 'Please try again.'}`);
      return;
    }

    setOrder(prev => (
      prev ? { ...prev, status: 'cancelled', cancelReason: reason, cancelledBy: 'customer' } : prev
    ));
  };

  // ─── Loading / Error states ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 text-[var(--info)] mx-auto mb-4 animate-bounce" />
          <p className="text-[var(--muted-foreground)]">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[var(--ink)] mb-2">Order Not Found</h2>
          <p className="text-[var(--muted-foreground)] mb-4">The order you're looking for doesn't exist.</p>
          <Button onClick={goBack} className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold">Back to Activity</Button>
        </div>
      </div>
    );
  }

  /*
   * One track, built from the order status plus the rider's live status.
   *
   * Both are needed: `orders.status` only reaches "on-the-way" for the whole
   * journey to the customer's address, while the rider's own status separates
   * heading to the shop, waiting at the shop, driving over and arriving. Feeding
   * only the order status left the customer staring at a stuck step for most of
   * the delivery.
   */
  const progress = getOrderProgress({
    status: order.status,
    driverStatus: order.driverStatus,
    driverMessage: order.driverMessage,
    deliveryMode: order.deliveryMode,
  });

  // Tracking the map is only useful once a rider exists, and only on delivery.
  const isActiveDelivery =
    order.deliveryMode === 'delivery' && progress.hasRider && progress.currentStepIsRiderStep;

  const handleChatWithBusiness = () => {
    if (order.businessId) {
      navigate(`/customer/messages/business/${order.businessId}`);
    }
  };

  const handleChatWithDriver = () => {
    if (order.driverId) {
      navigate(`/customer/messages/driver/${order.driverId}`);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchOrderRef.current?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b-2 border-[var(--border)] px-4 md:px-5 py-3 md:py-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button onClick={goBack} aria-label="Back" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-[var(--ink)]" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-[var(--ink)]">Order #{order.orderNumber}</h1>
              <p className="text-xs text-[var(--muted-foreground)]">{order.date}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isActiveDelivery && order.driverId && (
              <button onClick={handleChatWithDriver} className="flex flex-col items-center gap-0.5 p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors" title="Chat with Driver">
                <MessageCircle className="w-5 h-5 text-[var(--info)]" />
                <span className="text-[9px] font-semibold text-[var(--info)]">Driver</span>
              </button>
            )}
            {/* Available on every order status — the customer may need to reach the
                restaurant about an order that hasn't been accepted yet. */}
            {order.businessId && (
              <button onClick={handleChatWithBusiness} className="flex flex-col items-center gap-0.5 p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors" title="Chat with Restaurant">
                <MessageCircle className="w-5 h-5 text-[var(--primary)]" />
                <span className="text-[9px] font-semibold text-[var(--primary)]">Restaurant</span>
              </button>
            )}
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors disabled:opacity-50">
              <RefreshCw className={`w-5 h-5 text-[var(--muted-foreground)] ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <Badge className={`${statusColors[order.status]} text-xs`}>
          {progress.currentStepIsRiderStep && progress.riderHasStarted
            ? progress.currentTitle
            : statusLabels[order.status]}
        </Badge>

        {/* Horizontal stepper — shared with the business screen so both sides
            read the same nine steps, rider's leg included. */}
        <div className="mt-3 md:mt-4">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">ORDER PROGRESS</p>
          <OrderProgressStepper progress={progress} />
        </div>
      </div>

      <div className="px-4 md:px-5 pt-4 space-y-4 md:space-y-5">
        {/* Live Map */}
        {isActiveDelivery && isMapsLoaded && driverLocation && (
          <Card className="border-2 border-[var(--info)] overflow-hidden">
            <div className="bg-gradient-to-r from-[var(--info)] to-[var(--info)] px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
                <span className="text-sm font-bold text-white">Live Delivery Tracking</span>
              </div>
              <div className="flex items-center gap-1">
                {order.driverId && (
                  <button onClick={handleChatWithDriver} className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Chat with Driver">
                    <MessageCircle className="w-4 h-4 text-white" />
                    <span className="text-[9px] font-semibold text-white">Driver</span>
                  </button>
                )}
                {order.businessId && (
                  <button onClick={handleChatWithBusiness} className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Chat with Restaurant">
                    <MessageCircle className="w-4 h-4 text-white" />
                    <span className="text-[9px] font-semibold text-white">Restaurant</span>
                  </button>
                )}
                <Navigation className="w-4 h-4 text-white/80" />
              </div>
            </div>
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '220px' }}
              center={driverLocation}
              zoom={15}
              options={{ zoomControl: false, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, gestureHandling: 'none' }}
            >
              <MarkerF position={driverLocation} title="Driver" icon={(() => {
                const g = (window as any)?.google;
                if (!g?.maps?.Size || !g?.maps?.Point) return undefined;
                return { url: tricycleIcon, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) };
              })()} />
              {(() => {
                const coords = (order?.address || '').includes('|') ? order.address.split('|')[1] : (order?.address || '');
                const m = coords.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
                if (!m) return null;
                return (
                  <MarkerF position={{ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }} title="Your location" icon={{
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                    scaledSize: new (window as any).google.maps.Size(32, 32),
                    anchor: new (window as any).google.maps.Point(16, 32),
                  }} />
                );
              })()}
              {routePath.length > 0 && (
                <Polyline path={routePath} options={{ strokeColor: 'var(--success)', strokeOpacity: 0.9, strokeWeight: 4, geodesic: true }} />
              )}
            </GoogleMap>
            <div className="px-4 py-2.5 bg-surface border-t border-[var(--border)] flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--ink)]">
                {order.driverName && <span className="text-[var(--muted-foreground)]">Driver: {order.driverName} • </span>}
                {/* The track already knows which leg of the trip the rider is on,
                    so reuse it here rather than guessing from the order status. */}
                {progress.currentTitle}
              </p>
              <div className="flex items-center gap-2">
                {etaToCustomer && (
                  <span className="text-[10px] font-bold text-[var(--info)] bg-[var(--info-soft)] px-2 py-0.5 rounded-full">🏁 {etaToCustomer}</span>
                )}
                <div className="text-[10px] text-[var(--muted-foreground)]">● Live</div>
              </div>
            </div>
          </Card>
        )}

        {/* Wired up but the driver hasn't shared GPS yet */}
        {isActiveDelivery && isMapsLoaded && !driverLocation && (
          <Card className="border-2 border-dashed border-[var(--border)] p-4 text-center">
            <MapPin className="w-6 h-6 text-[var(--muted-foreground)] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[var(--ink)]">Waiting for the driver's location…</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">Live tracking appears once the driver shares GPS.</p>
          </Card>
        )}

        {/* Status Timeline — the same track as the stepper above, spelled out */}
        <Card className="p-4 md:p-5 border border-line">
          <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-3">Status Updates</h3>
          <OrderProgressTimeline progress={progress} />
        </Card>

        {/* Why the order was cancelled, so the customer sees the reason */}
        {order.status === 'cancelled' && order.cancelReason && (
          <Card className="p-4 md:p-5 border border-[var(--error)] bg-[var(--error-soft)]">
            <h3 className="font-bold text-[var(--error)] text-sm md:text-base mb-1">
              {order.cancelledBy === 'business'
                ? `${order.restaurantName} declined this order`
                : 'Cancellation reason'}
            </h3>
            <p className="text-sm text-[var(--error)]">{order.cancelReason}</p>
          </Card>
        )}

        {/* Restaurant Info */}
        <Card className="p-4 md:p-5 border border-line">
          <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-2">Restaurant</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden flex-shrink-0">
              <StoreLogo logo={order.restaurantImage} emojiClass="text-3xl" />
            </div>
            <div>
              <p className="font-semibold text-[var(--ink)] text-sm md:text-base">{order.restaurantName}</p>
              <Badge className={`mt-1 text-[10px] md:text-xs ${order.deliveryMode === 'delivery' ? 'bg-[var(--info-soft)] text-[var(--info)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>
                {order.deliveryMode === 'delivery' ? 'Delivery' : 'Pickup'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Delivery Address */}
        {order.deliveryMode === 'delivery' && (
          <Card className="p-4 md:p-5 border border-line">
            <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-2">Delivery Address</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[var(--muted-foreground)]">{order.address.split('|')[0].trim() || order.address}</p>
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="p-4 md:p-5 border border-line">
          <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-3">Items</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2 md:p-3 bg-[var(--muted)] rounded-xl">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)] text-sm truncate">{item.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Qty: {item.quantity}</p>
                  {item.customizations && item.customizations.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      {item.customizations.map((c: any, idx: number) => (
                        <p key={idx} className="text-[10px] text-[var(--muted-foreground)]">
                          {c.groupName}: {c.optionName}{c.price > 0 && <span className="text-[var(--primary)]"> +₱{c.price}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                  {/* Kept visible after the fact, so a customer looking back at an
                      order can see what they actually asked for. */}
                  {item.note && (
                    <p className="mt-1 text-[10px] italic text-[var(--amber-ink)]">
                      Note: {item.note}
                    </p>
                  )}
                </div>
                <p className="font-bold text-[var(--ink)] text-sm flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment */}
        <Card className="p-4 md:p-5 border border-line">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-[var(--primary)]" />
            <h3 className="font-bold text-[var(--ink)] text-sm md:text-base">Payment</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge className="bg-[var(--success)] text-white text-xs">
              Food: GCash
            </Badge>
            {/* The rider collects this part at the door, so it stays unpaid for
                most of the order's life. Showing one badge for the whole order
                made a fully paid order look identical to an unpaid one. */}
            <Badge
              variant="outline"
              className={
                order.status === 'delivered'
                  ? 'border-[var(--success)] text-[var(--success)] text-xs'
                  : 'border-[var(--amber)] text-[var(--amber)] text-xs'
              }
            >
              {order.status === 'delivered' ? 'Delivery fee: paid' : 'Delivery fee: cash to rider'}
            </Badge>
          </div>

          {/* The customer's own screenshot, so the record is on their side too
              and not only in the shop's. Tappable, because the thumbnail is
              small and a GCash receipt is not legible at that size. */}
          {order.paymentProofUrl && (
            <a
              href={order.paymentProofUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-3 block overflow-hidden rounded-xl border border-line"
            >
              <img
                src={order.paymentProofUrl}
                alt={`GCash payment proof for order ${order.orderNumber}`}
                className="max-h-48 w-full cursor-zoom-in object-cover"
              />
              <p className="bg-[var(--muted)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                Your payment proof · tap to view full size
              </p>
            </a>
          )}

          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            {order.paymentConfirmedAt
              ? 'The shop has confirmed your GCash payment.'
              : 'Waiting for the shop to confirm your GCash payment.'}
          </p>

          <div className="space-y-2 pt-3 border-t-2 border-[var(--muted)]">
            <div className="flex justify-between text-sm text-[var(--muted-foreground)]">
              <span>Food subtotal (GCash)</span>
              <span>₱{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-[var(--muted-foreground)]">
              <span>Delivery fee (cash to rider)</span>
              <span>₱{order.deliveryFee.toFixed(2)}</span>
            </div>
            {/* The split restated on the total, because the total is one number
                and the payment is not: this is where the two are made explicit
                on the order the customer keeps. */}
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] pt-1">
              <span>Transferred by GCash</span>
              <span>₱{(order.gcashAmount ?? order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-[var(--ink)] pt-2 border-t-2 border-[var(--border)]">
              <span>Total</span>
              <span className="text-[var(--primary)]">₱{order.total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* The rider's handover photo, once there is one.
            Placed before the cancel block because a delivered order can no longer
            be cancelled and this is what a customer looks for at that point: not
            "delivered" as a word, but the picture of it. */}
        {order.deliveryProofUrl && (
          <Card className="p-4 md:p-5 border border-line">
            <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-3">
              Proof of delivery
            </h3>
            <a
              href={order.deliveryProofUrl}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-line"
            >
              <img
                src={order.deliveryProofUrl}
                alt={`Photo of this order being handed over${order.driverName ? ` by ${order.driverName}` : ''}`}
                className="max-h-64 w-full cursor-zoom-in object-cover"
              />
              <p className="bg-[var(--muted)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                {order.driverName ? `${order.driverName}'s handover photo` : 'Handover photo'}
                {' · '}tap to view full size
              </p>
            </a>
          </Card>
        )}

        {/* Cancel Order — only while the restaurant hasn't accepted it yet.
            An order awaiting payment is still cancellable, but a payment-
            confirmed one is not: the money has moved and the kitchen may have
            started. */}
        {order.status === 'pending' && (
          <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
            <h3 className="font-bold text-[#121212] text-sm md:text-base mb-1">Need to cancel?</h3>
            <p className="text-sm text-[#64748B] mb-3">
              You can cancel this order until the shop confirms your payment.
            </p>
            <Button
              onClick={() => setShowCancelOrderPrompt(true)}
              variant="outline"
              className="w-full border-[var(--error)] text-[var(--error)] font-bold py-3"
            >
              Cancel Order
            </Button>
          </Card>
        )}

        {/* Cutlery */}
        {order.needsCutlery && (
          <Card className="p-3 border border-line bg-[var(--muted)]">
            <p className="text-sm text-[var(--muted-foreground)] flex items-center gap-2">🍴 Cutlery requested</p>
          </Card>
        )}

        {/* Rate */}
        {order.status === 'delivered' && (
          <Card className="p-4 md:p-5 border border-line">
            {ratingSubmitted ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[var(--success-soft)] flex items-center justify-center text-2xl">🙏</div>
                <h3 className="text-lg font-bold text-[var(--ink)] mb-1">Thank you!</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Your rating for {order.restaurantName} has been saved.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-[var(--amber)] fill-[var(--amber)]" />
                  <h3 className="font-bold text-[var(--ink)] text-sm md:text-base">Rate {order.restaurantName}</h3>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mb-3">How was your order and delivery?</p>
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110">
                      <Star className={`w-8 h-8 ${star <= rating ? 'fill-[var(--amber)] text-[var(--amber)]' : 'fill-[var(--border)] text-[var(--border)]'}`} />
                    </button>
                  ))}
                </div>
                {ratingError && <p className="text-xs text-[var(--error)] text-center mb-2">{ratingError}</p>}
                <Button
                  onClick={async () => {
                    if (!rating || !user?.id || !order.businessId) return;
                    setRatingSubmitting(true);
                    setRatingError(null);
                    const { error } = await supabaseHelpers.rateBusiness({ businessId: order.businessId, customerId: user.id, rating, orderId: order.id });
                    setRatingSubmitting(false);
                    if (error) { setRatingError('Failed to submit rating.'); return; }
                    setRatingSubmitted(true);
                  }}
                  disabled={!rating || ratingSubmitting || !order.businessId}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold disabled:opacity-50"
                >
                  {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                </Button>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Cancel Order Popup — collects a reason before cancelling */}
      <ReasonPromptModal
        isOpen={showCancelOrderPrompt}
        title="Cancel this order?"
        description={order ? `Order #${order.orderNumber} · ${order.restaurantName}` : undefined}
        confirmLabel="Yes, Cancel Order"
        placeholder="e.g. Ordered by mistake, wrong address, found another store…"
        variant="danger"
        zIndexClassName="z-[3500]"
        onCancel={() => setShowCancelOrderPrompt(false)}
        onSubmit={async (reason) => {
          setShowCancelOrderPrompt(false);
          await handleCancelOrder(reason);
        }}
      />
    </div>
  );
}
