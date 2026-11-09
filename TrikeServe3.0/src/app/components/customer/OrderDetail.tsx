import { ArrowLeft, Package, Clock, MapPin, CreditCard, Star, Navigation, CheckCircle, Phone, MessageCircle, Flag, X, Check } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../ui/card";
import FullSizeImagePreview from "../ui/FullSizeImagePreview";
import FloatingChatHead from "../ui/FloatingChatHead";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { useChatHeadVisibility } from "../../contexts/ChatHeadVisibilityContext";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { cuisineLabels } from "@/lib/foodTaxonomy";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";
import { supabase } from "../../../lib/supabase";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { geocodeAddress, logAudit, supabaseHelpers } from "@/lib/supabase";
import { getOrderProgress, isRiderHeadingToRestaurant } from "@/lib/orderProgress";
import { OrderStatusUpdates } from "../ui/OrderStatusUpdates";
import { useState, useEffect, useRef, useMemo } from "react";
import { MarkerF, Polyline } from "@react-google-maps/api";
import GoogleMap from "@/app/components/ui/ThemedGoogleMap";
import MapTypeToggle from "../ui/MapTypeToggle";
import useMapLoader from "@/lib/mapLoader";
import { createDropoffMarkerIcon, createRestaurantMarkerIcon, createTricycleMarkerIcon } from "@/lib/mapIcons";
import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_PICKUP_COLOR } from "@/lib/rideMapColors";
import { getShortestAvoidHighwaysRoadRouteDetails } from "@/lib/roadRouting";

interface OrderData {
  id: string;
  orderNumber: string;
  restaurantName: string;
  restaurantId?: string | null;
  businessId?: string | null;
  restaurantImage: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  date: string;
  status: string;
  deliveryMode: string;
  address: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  estimatedTime: string;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentConfirmedAt?: string | null;
  needsCutlery: boolean;
  createdAt: string;
  driverName?: string;
  driverId?: string;
  deliveryRequestId?: string | null;
  deliveryRequestCreatedAt?: string | null;
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

interface OrderRestaurantProfile {
  name: string | null;
  subtitle: string | null;
  address: string | null;
  cuisine: unknown;
  deliveryTime: string | null;
  logoImage: string | null;
  rating: number | null;
  ratingCount: number;
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
    restaurantId: dbOrder.restaurant_id || dbOrder.restaurant_email || null,
    businessId: dbOrder.business_id || null,
    restaurantImage: '',
    customerName: dbOrder.customer_name || 'Customer',
    customerEmail: dbOrder.customer_email || '',
    customerPhone: dbOrder.customer_phone || '',
    date: new Date(dbOrder.created_at).toLocaleString(),
    status: dbOrder.status || 'pending',
    deliveryMode: dbOrder.delivery_mode || 'delivery',
    address: dbOrder.address || '',
    dropoffLat: dbOrder.dropoff_lat == null || !Number.isFinite(Number(dbOrder.dropoff_lat)) ? null : Number(dbOrder.dropoff_lat),
    dropoffLng: dbOrder.dropoff_lng == null || !Number.isFinite(Number(dbOrder.dropoff_lng)) ? null : Number(dbOrder.dropoff_lng),
    estimatedTime: dbOrder.estimated_time || '30 mins',
    items: parsedItems,
    subtotal: dbOrder.subtotal || 0,
    deliveryFee: dbOrder.delivery_fee || 0,
    total: dbOrder.total || 0,
    paymentMethod: dbOrder.payment_method || 'cash',
    paymentConfirmedAt: dbOrder.payment_confirmed_at ?? null,
    needsCutlery: dbOrder.needs_cutlery || false,
    createdAt: dbOrder.created_at,
    // Driver identity and progress come from the current live ride request.
    // The order row may still carry a name from an assignment the business removed.
    driverName: undefined,
    driverId: undefined,
    deliveryRequestId: null,
    deliveryRequestCreatedAt: null,
    driverStatus: null,
    driverMessage: null,
    cancelReason: dbOrder.cancel_reason || null,
    cancelledBy: dbOrder.cancelled_by || null,
  };
}

function parseAddressCoordinates(address?: string | null): { lat: number; lng: number } | null {
  if (!address) return null;
  const coordinatePart = address.includes('|') ? address.split('|').slice(1).join('|') : address;
  const match = coordinatePart.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
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
  'ready': 'bg-[var(--info)] text-white',
  'confirmed': 'bg-[var(--info)] text-white',
  'on-the-way': 'bg-[var(--info)] text-white',
  'picked_up': 'bg-[var(--info)] text-white',
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
  'payment-confirmed': 'Accepted',
  'preparing': 'Preparing',
  'ready': 'Preparing',
  'confirmed': 'Preparing',
  'on-the-way': 'Preparing',
  'picked_up': 'Out for Delivery',
  'picked-up': 'Out for Delivery',
  'dropped-off': 'Arrived',
  'dropped_off': 'Arrived',
  'awaiting-payment': 'Arrived',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
};

const ORDER_REPORT_CATEGORIES = [
  'Missing or incorrect items',
  'Food quality issue',
  'Delivery issue',
  'Driver behavior',
  'Payment issue',
  'Other',
];

export default function OrderDetail() {
  const navigate = useNavigate();
  const { toggleChatOverlay, recentChatHeads } = useChatHeadVisibility();
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
  const orderRef = useRef<OrderData | null>(null);
  orderRef.current = order;
  const [restaurantProfile, setRestaurantProfile] = useState<OrderRestaurantProfile | null>(null);
  const [incomingOrderChat, setIncomingOrderChat] = useState<{
    conversationId: string;
    peerId: string;
    peerName: string;
    peerAvatar: string | null;
    unread: number;
  } | null>(null);
  const [orderChatPulseKey, setOrderChatPulseKey] = useState(0);
  const orderChatStackItems = useMemo(
    () => recentChatHeads
      .filter((chatHead) => chatHead.conversationId !== incomingOrderChat?.conversationId)
      .map((chatHead) => ({
        id: chatHead.conversationId,
        peerAvatar: chatHead.peerAvatar,
        peerLabel: chatHead.peerName,
        peerIsGroup: chatHead.peerIsGroup,
        unread: chatHead.unread,
        onOpen: () => toggleChatOverlay(chatHead.conversationId),
      })),
    [incomingOrderChat?.conversationId, recentChatHeads, toggleChatOverlay],
  );
  const previousOrderChatSignalsRef = useRef<{
    scopeKey: string;
    signals: Map<string, string>;
  } | null>(null);
  const activatedOrderChatScopeRef = useRef<string | null>(null);
  const activatedOrderConversationIdsRef = useRef(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [showItemRatingPrompt, setShowItemRatingPrompt] = useState(false);
  // Cancelling an order asks for a reason first.
  const [showCancelOrderPrompt, setShowCancelOrderPrompt] = useState(false);
  const [showOrderReport, setShowOrderReport] = useState(false);
  const [orderReportCategory, setOrderReportCategory] = useState(ORDER_REPORT_CATEGORIES[0]);
  const [orderReportDescription, setOrderReportDescription] = useState('');
  const [isSubmittingOrderReport, setIsSubmittingOrderReport] = useState(false);
  const [orderReportError, setOrderReportError] = useState<string | null>(null);
  const [orderReportSubmitted, setOrderReportSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const driverLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  driverLocationRef.current = driverLocation;
  const [restaurantLocation, setRestaurantLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToActiveStop, setEtaToActiveStop] = useState<string | null>(null);
  const trackingMapRef = useRef<any>(null);
  const trackingMapWasManuallyMovedRef = useRef(false);
  const trackingMapIsProgrammaticallyFittingRef = useRef(false);
  const [trackingMapWasManuallyMoved, setTrackingMapWasManuallyMoved] = useState(false);
  const attemptedRestaurantGeocodeRef = useRef<string | null>(null);
  useEffect(() => {
    trackingMapWasManuallyMovedRef.current = false;
    trackingMapIsProgrammaticallyFittingRef.current = false;
    setTrackingMapWasManuallyMoved(false);
  }, [order?.id]);
  const customerLocation = useMemo(() => {
    if (order?.dropoffLat != null && order?.dropoffLng != null) {
      return { lat: order.dropoffLat, lng: order.dropoffLng };
    }
    return parseAddressCoordinates(order?.address);
  }, [order?.dropoffLat, order?.dropoffLng, order?.address]);
  const liveDriverStatus = order?.driverStatus ?? null;
  const normalizedDriverStatus = liveDriverStatus?.trim().toLowerCase().replace(/_/g, '-') ?? '';
  const normalizedOrderStatus = order?.status.trim().toLowerCase().replace(/_/g, '-') ?? '';
  const orderPickupHasStarted = ['picked-up', 'in-progress', 'dropped-off', 'awaiting-payment', 'delivered', 'completed'].includes(normalizedOrderStatus);
  const isRiderEnRouteToRestaurant = orderPickupHasStarted
    ? false
    : liveDriverStatus
      ? isRiderHeadingToRestaurant(liveDriverStatus)
      : Boolean(order?.driverId || order?.driverName || normalizedOrderStatus === 'on-the-way');
  const isDriverAtRestaurant = !orderPickupHasStarted && ['arrived', 'at-restaurant'].includes(normalizedDriverStatus);
  const activeTrackingDestination = isRiderEnRouteToRestaurant ? restaurantLocation : customerLocation;
  // ─── Load order once ───────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) { setIsLoading(false); return; }

    const fetchOrder = async () => {
      try {
        setRating(0);
        setRatingSubmitted(false);
        setShowItemRatingPrompt(false);
        setDriverLocation(null);
        setRestaurantLocation(null);
        setRestaurantProfile(null);
        attemptedRestaurantGeocodeRef.current = null;
        setRoutePath([]);
        setEtaToActiveStop(null);
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
            .select('id, status, created_at, accepted_driver_id, driver_name, driver_lat, driver_lng, driver_status, driver_status_message, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
            .eq('order_id', orderId)
            .in('status', ['pending', 'accepted', 'on-the-way', 'arrived', 'in-progress', 'in_progress', 'completed'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (rideReq) {
            data.deliveryRequestId = rideReq.id;
            data.deliveryRequestCreatedAt = rideReq.created_at;
            const pickupLat = Number(rideReq.pickup_lat);
            const pickupLng = Number(rideReq.pickup_lng);
            if (rideReq.pickup_lat != null && rideReq.pickup_lng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
              setRestaurantLocation({ lat: pickupLat, lng: pickupLng });
            }
            const dropoffLat = Number(rideReq.dropoff_lat);
            const dropoffLng = Number(rideReq.dropoff_lng);
            if (rideReq.dropoff_lat != null && rideReq.dropoff_lng != null && Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)) {
              data.dropoffLat = dropoffLat;
              data.dropoffLng = dropoffLng;
            }
            data.driverId = rideReq.accepted_driver_id || undefined;
            data.driverName = rideReq.accepted_driver_id ? rideReq.driver_name || undefined : undefined;
            // The rider's own progress is only on the ride request and advances
            // the role-specific order milestones.
            data.driverStatus = rideReq.driver_status || null;
            data.driverMessage = rideReq.driver_status_message || null;
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

        // Load the current restaurant profile so this section reflects the
        // shop's saved details instead of only the order's older name snapshot.
        let resolvedBusinessId = dbOrder.business_id || null;
        try {
          const restaurantId = dbOrder.restaurant_email || dbOrder.restaurant_id || null;
          let restaurantRecord: any = null;
          const profileFields = 'id, business_user_id, name, subtitle, address, cuisine, delivery_time, logo_image, latitude, longitude';

          if (restaurantId) {
            const { data } = await supabase
              .from('restaurants')
              .select(profileFields)
              .eq('id', restaurantId)
              .maybeSingle();
            restaurantRecord = data;
          }

          if (!restaurantRecord && resolvedBusinessId) {
            const { data } = await supabase
              .from('restaurants')
              .select(profileFields)
              .eq('business_user_id', resolvedBusinessId)
              .maybeSingle();
            restaurantRecord = data;
          }

          if (restaurantRecord) {
            resolvedBusinessId = restaurantRecord.business_user_id || resolvedBusinessId;
            let rating: number | null = null;
            let ratingCount = 0;
            if (resolvedBusinessId) {
              const ratingResult = await supabaseHelpers.getBusinessRating(resolvedBusinessId);
              rating = ratingResult.average;
              ratingCount = ratingResult.count;
            }

            setRestaurantProfile({
              name: restaurantRecord.name || null,
              subtitle: restaurantRecord.subtitle || null,
              address: restaurantRecord.address || null,
              cuisine: restaurantRecord.cuisine,
              deliveryTime: restaurantRecord.delivery_time || null,
              logoImage: restaurantRecord.logo_image || null,
              rating,
              ratingCount,
            });

            const restaurantLat = Number(restaurantRecord.latitude);
            const restaurantLng = Number(restaurantRecord.longitude);
            if (restaurantRecord.latitude != null && restaurantRecord.longitude != null && Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng)) {
              setRestaurantLocation(current => current ?? { lat: restaurantLat, lng: restaurantLng });
            }
          }

          if (resolvedBusinessId || restaurantRecord?.logo_image || restaurantRecord?.name) {
            setOrder(prev => prev ? {
              ...prev,
              restaurantId: restaurantRecord?.id || prev.restaurantId,
              businessId: resolvedBusinessId || prev.businessId,
              restaurantName: restaurantRecord?.name?.trim() || prev.restaurantName,
              restaurantImage: restaurantRecord?.logo_image || prev.restaurantImage,
            } : prev);
          }
        } catch (profileError) {
          // Keep the order detail available from its saved snapshot if profile
          // information or ratings cannot be reached.
          console.warn('[OrderDetail] Could not load restaurant profile:', profileError);
        }
      } catch (e) {
        console.error('[OrderDetail] Error:', e);
        setError('Failed to load order');
      }
      setIsLoading(false);
    };

    fetchOrder();
  }, [orderId]);

  // Restore the customer's restaurant rating when they reopen or reload an
  // order. This is separate from order loading so a ratings query cannot delay
  // the order details if the ratings table is slow or unavailable.
  useEffect(() => {
    if (!order?.id || !user?.id) return;

    let active = true;
    const loadSavedRestaurantRating = async () => {
      const { data: savedRating, error: savedRatingError } = await supabase
        .from('business_ratings')
        .select('rating')
        .eq('order_id', order.id)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (savedRatingError) {
        console.warn('[OrderDetail] Could not load saved restaurant rating:', savedRatingError);
        return;
      }
      if (savedRating) {
        const savedValue = Number(savedRating.rating);
        if (Number.isInteger(savedValue) && savedValue >= 1 && savedValue <= 5) {
          setRating(savedValue);
          setRatingSubmitted(true);
          setShowItemRatingPrompt(true);
        }
      }
    };

    void loadSavedRestaurantRating();
    return () => { active = false; };
  }, [order?.id, user?.id]);

  // Apply order status changes immediately when realtime is available. The
  // three-second poll below remains as a fallback for delayed or missed events.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`customer-order-status-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, payload => {
        const updated = payload.new as {
          status?: string;
          payment_confirmed_at?: string | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
        };
        setOrder(prev => prev ? {
          ...prev,
          status: updated.status || prev.status,
          paymentConfirmedAt: updated.payment_confirmed_at ?? prev.paymentConfirmedAt,
          cancelReason: updated.cancel_reason ?? prev.cancelReason,
          cancelledBy: updated.cancelled_by ?? prev.cancelledBy,
        } : prev);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
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
        const { data: rideReq, error: rideReqError } = await supabase
          .from('ride_requests')
          .select('id, status, created_at, accepted_driver_id, driver_name, driver_lat, driver_lng, driver_status, driver_status_message, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
          .eq('order_id', orderId)
          .in('status', ['pending', 'accepted', 'on-the-way', 'arrived', 'in-progress', 'in_progress', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const lat = rideReq?.driver_lat;
        const lng = rideReq?.driver_lng;
        if (!rideReqError) setDriverLocation(lat && lng ? { lat, lng } : null);
        const pickupLat = Number(rideReq?.pickup_lat);
        const pickupLng = Number(rideReq?.pickup_lng);
        if (rideReq?.pickup_lat != null && rideReq?.pickup_lng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
          setRestaurantLocation({ lat: pickupLat, lng: pickupLng });
        } else if (!rideReq && !rideReqError) {
          setRestaurantLocation(null);
        }

        // Build new order data and always set it
        const newData = buildOrderData(data);
        const dropoffLat = Number(rideReq?.dropoff_lat);
        const dropoffLng = Number(rideReq?.dropoff_lng);
        if (rideReq?.dropoff_lat != null && rideReq?.dropoff_lng != null && Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng)) {
          newData.dropoffLat = dropoffLat;
          newData.dropoffLng = dropoffLng;
        }
        newData.deliveryRequestId = rideReq?.id || null;
        newData.deliveryRequestCreatedAt = rideReq?.created_at || null;
        newData.driverId = rideReq?.accepted_driver_id || undefined;
        newData.driverName = rideReq?.accepted_driver_id ? rideReq.driver_name || undefined : undefined;
        newData.driverStatus = rideReq?.driver_status || null;
        newData.driverMessage = rideReq?.driver_status_message || null;
        setOrder(prev => {
          // A ride-request read error is not evidence that the driver was removed.
          if (prev) {
            newData.businessId = newData.businessId || prev.businessId;
            if (rideReqError) {
              newData.deliveryRequestId = prev.deliveryRequestId;
              newData.deliveryRequestCreatedAt = prev.deliveryRequestCreatedAt;
              newData.driverId = prev.driverId;
              newData.driverName = prev.driverName;
              newData.driverStatus = prev.driverStatus || null;
              newData.driverMessage = prev.driverMessage || null;
            }
          }
          // Only update if status or driver changed
          if (
            prev &&
            prev.status === newData.status &&
            prev.paymentConfirmedAt === newData.paymentConfirmedAt &&
            prev.deliveryRequestId === newData.deliveryRequestId &&
            prev.driverId === newData.driverId &&
            prev.driverName === newData.driverName &&
            prev.driverStatus === newData.driverStatus &&
            prev.driverMessage === newData.driverMessage &&
            prev.dropoffLat === newData.dropoffLat &&
            prev.dropoffLng === newData.dropoffLng
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
      const currentRequestCreatedAt = orderRef.current?.deliveryRequestCreatedAt;
      const eventCreatedAt = ride?.created_at;
      if (
        currentRequestCreatedAt &&
        eventCreatedAt &&
        new Date(eventCreatedAt).getTime() < new Date(currentRequestCreatedAt).getTime()
      ) return;

      const requestStatus = String(ride?.status || '').trim().toLowerCase().replace(/_/g, '-');
      if (requestStatus === 'cancelled') {
        setDriverLocation(null);
        setRestaurantLocation(null);
        setOrder((prev) => prev ? {
          ...prev,
          deliveryRequestId: null,
          deliveryRequestCreatedAt: eventCreatedAt || prev.deliveryRequestCreatedAt || null,
          driverId: undefined,
          driverName: undefined,
          driverStatus: null,
          driverMessage: null,
        } : prev);
        return;
      }

      if (ride.driver_lat && ride.driver_lng) {
        setDriverLocation({ lat: ride.driver_lat, lng: ride.driver_lng });
      } else {
        setDriverLocation(null);
      }
      const pickupLat = Number(ride.pickup_lat);
      const pickupLng = Number(ride.pickup_lng);
      if (ride.pickup_lat != null && ride.pickup_lng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
        setRestaurantLocation({ lat: pickupLat, lng: pickupLng });
      } else {
        setRestaurantLocation(null);
      }
      // The rider's status arrives here first, so the track advances on the
      // moment they tap a button rather than on the next 3s poll. A new pending
      // request also clears the previous driver's details immediately.
      setOrder((prev) => prev ? {
        ...prev,
        dropoffLat: ride.dropoff_lat != null && Number.isFinite(Number(ride.dropoff_lat)) ? Number(ride.dropoff_lat) : prev.dropoffLat,
        dropoffLng: ride.dropoff_lng != null && Number.isFinite(Number(ride.dropoff_lng)) ? Number(ride.dropoff_lng) : prev.dropoffLng,
        deliveryRequestId: ride.id || null,
        deliveryRequestCreatedAt: eventCreatedAt || prev.deliveryRequestCreatedAt || null,
        driverId: ride.accepted_driver_id || undefined,
        driverName: ride.accepted_driver_id ? ride.driver_name || undefined : undefined,
        driverStatus: ride.driver_status || null,
        driverMessage: ride.driver_status_message || null,
      } : prev);
    });
    return unsubscribe;
  }, [orderId]);

  // ─── Compute route from driver to customer ─────────────────────────
  // Surface unread messages from this order's restaurant or driver as a
  // floating head; the customer opens the existing conversation only on tap.
  useEffect(() => {
    const customerId = user?.id;
    const peerIds = new Set([order?.businessId, order?.driverId].filter((id): id is string => Boolean(id)));
    if (!customerId || peerIds.size === 0) {
      setIncomingOrderChat(null);
      if (!customerId) {
        previousOrderChatSignalsRef.current = null;
        activatedOrderChatScopeRef.current = null;
        activatedOrderConversationIdsRef.current.clear();
      }
      return;
    }

    let active = true;
    const refreshIncomingOrderChat = async () => {
      const { data, error } = await supabaseHelpers.getChatConversations(customerId);
      if (!active || error) return;

      const conversations = (data || [])
        .map((conversation: any) => {
          const isParticipantA = conversation.participant_a_id === customerId;
          const peerId = isParticipantA ? conversation.participant_b_id : conversation.participant_a_id;
          const unread = Number(isParticipantA ? conversation.unread_count_a : conversation.unread_count_b) || 0;
          return {
            conversation,
            peerId,
            peerName: isParticipantA ? conversation.participant_b_name : conversation.participant_a_name,
            peerAvatar: isParticipantA ? conversation.participant_b_avatar : conversation.participant_a_avatar,
            unread,
          };
        })
        .filter(({ peerId }) => peerIds.has(peerId));

      const scopeKey = `${customerId}:${[...peerIds].sort().join(',')}`;
      if (activatedOrderChatScopeRef.current !== scopeKey) {
        activatedOrderChatScopeRef.current = scopeKey;
        activatedOrderConversationIdsRef.current.clear();
      }
      const previousSignals = previousOrderChatSignalsRef.current?.scopeKey === scopeKey
        ? previousOrderChatSignalsRef.current.signals
        : null;
      const nextSignals = new Map<string, string>();
      const changedConversationIds: string[] = [];
      conversations.forEach(({ conversation }) => {
        const signal = `${conversation.last_message_at || ''}:${conversation.last_message_sender_id || ''}`;
        const previousSignal = previousSignals?.get(conversation.id);
        if (
          previousSignals &&
          conversation.last_message_at &&
          (previousSignal === undefined || previousSignal !== signal)
        ) {
          changedConversationIds.push(conversation.id);
        }
        nextSignals.set(conversation.id, signal);
      });
      previousOrderChatSignalsRef.current = { scopeKey, signals: nextSignals };
      if (changedConversationIds.length > 0) {
        changedConversationIds.forEach((id) => activatedOrderConversationIdsRef.current.add(id));
        setOrderChatPulseKey((key) => key + 1);
      }

      const incoming = conversations
        .filter(({ conversation, peerId, unread }) =>
          activatedOrderConversationIdsRef.current.has(conversation.id) &&
          unread > 0 && conversation.last_message_sender_id === peerId
        )
        .sort((a, b) =>
          new Date(b.conversation.last_message_at || b.conversation.updated_at || 0).getTime() -
          new Date(a.conversation.last_message_at || a.conversation.updated_at || 0).getTime()
        );

      const latest = incoming[0];
      if (!latest) {
        setIncomingOrderChat(null);
        return;
      }
      setIncomingOrderChat({
        conversationId: latest.conversation.id,
        peerId: latest.peerId,
        peerName: latest.peerName || 'Restaurant or driver',
        peerAvatar: latest.peerAvatar || null,
        unread: latest.unread,
      });
    };

    void refreshIncomingOrderChat();
    const unsubscribe = supabaseHelpers.subscribeToUserChatThreads(customerId, () => {
      void refreshIncomingOrderChat();
    });
    const interval = window.setInterval(() => void refreshIncomingOrderChat(), 5000);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [user?.id, order?.businessId, order?.driverId]);

  // Some older restaurant profiles have an address but no saved map pin, and
  // their ride request may also be missing pickup coordinates. Resolve that
  // address once so the pickup leg can still be tracked on the customer screen.
  useEffect(() => {
    const address = restaurantProfile?.address?.trim();
    if (!isRiderEnRouteToRestaurant || restaurantLocation || !address || !isMapsLoaded) return;
    if (attemptedRestaurantGeocodeRef.current === address) return;

    attemptedRestaurantGeocodeRef.current = address;
    let active = true;
    void geocodeAddress(address).then((location) => {
      if (active && location) setRestaurantLocation(location);
    });
    return () => { active = false; };
  }, [isRiderEnRouteToRestaurant, restaurantLocation, restaurantProfile?.address, isMapsLoaded]);

  // Use the same road route helper as /rider/active-ride. Keep retrying until
  // both GPS and route geometry are available, then refresh from the latest
  // driver position every 12 seconds without restarting on each GPS update.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let hasRoute = false;
    let routeTimer: number | undefined;
    setRoutePath([]);
    setEtaToActiveStop(null);

    const orderStatus = order?.status.trim().toLowerCase().replace(/_/g, '-') ?? '';
    const shouldTrackOrder = order?.deliveryMode === 'delivery'
      && Boolean(order.driverId || order.driverName)
      && !['delivered', 'completed', 'cancelled'].includes(orderStatus);
    if (
      !shouldTrackOrder ||
      (isDriverAtRestaurant && isRiderEnRouteToRestaurant) ||
      !activeTrackingDestination ||
      !isMapsLoaded ||
      !(window as any).google?.maps
    ) {
      return () => { cancelled = true; };
    }

    const destination = activeTrackingDestination;
    const scheduleNext = () => {
      if (cancelled) return;
      routeTimer = window.setTimeout(() => { void calculateRoute(); }, hasRoute ? 12000 : 1500);
    };

    const calculateRoute = async () => {
      if (cancelled || inFlight) return;
      const origin = driverLocationRef.current;
      if (!origin) {
        scheduleNext();
        return;
      }

      inFlight = true;
      try {
        const route = await getShortestAvoidHighwaysRoadRouteDetails(
          origin,
          destination,
          import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
        );
        if (cancelled) return;
        if (route.path.length > 1) {
          setRoutePath(route.path);
          setEtaToActiveStop(route.durationText || null);
          hasRoute = true;
        } else {
          setRoutePath([]);
          setEtaToActiveStop(null);
          hasRoute = false;
        }
      } catch (error) {
        if (!cancelled) console.warn('[OrderDetail] Could not calculate live delivery route:', error);
        hasRoute = false;
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };

    void calculateRoute();
    return () => {
      cancelled = true;
      window.clearTimeout(routeTimer);
    };
  }, [order?.id, order?.deliveryMode, order?.status, order?.driverId, order?.driverName, activeTrackingDestination?.lat, activeTrackingDestination?.lng, isMapsLoaded, isDriverAtRestaurant, isRiderEnRouteToRestaurant]);

  const fitTrackingMapToRoute = (map: any) => {
    const maps = (window as any).google?.maps;
    if (!map || !driverLocation) return;
    trackingMapIsProgrammaticallyFittingRef.current = true;
    if (!activeTrackingDestination || !maps?.LatLngBounds) {
      map.setCenter(driverLocation);
      window.setTimeout(() => {
        trackingMapIsProgrammaticallyFittingRef.current = false;
      }, 500);
      return;
    }

    const bounds = new maps.LatLngBounds();
    bounds.extend(driverLocation);
    bounds.extend(activeTrackingDestination);
    routePath.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 28);
    window.setTimeout(() => {
      trackingMapIsProgrammaticallyFittingRef.current = false;
    }, 500);
  };

  const recenterTrackingMap = () => {
    trackingMapWasManuallyMovedRef.current = false;
    setTrackingMapWasManuallyMoved(false);
    fitTrackingMapToRoute(trackingMapRef.current);
  };

  // Keep the live route in view until the customer deliberately moves the map.
  useEffect(() => {
    if (trackingMapWasManuallyMovedRef.current) return;
    fitTrackingMapToRoute(trackingMapRef.current);
  }, [driverLocation, activeTrackingDestination?.lat, activeTrackingDestination?.lng, routePath]);

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

    if (user?.id && order.businessId) {
      void supabaseHelpers.sendOrderProgressChatMessage({
        orderId: order.id,
        orderNumber: order.orderNumber,
        senderId: user.id,
        senderName: user.name || 'Customer',
        senderRole: 'customer',
        recipientId: order.businessId,
        recipientName: restaurantProfile?.name || order.restaurantName,
        recipientRole: 'business',
        message: `I cancelled this order. Reason: ${reason}`,
      }).then(({ error: chatError }) => {
        if (chatError) console.error('[OrderDetail] Could not message restaurant about cancellation:', chatError);
      });
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
    driverAssigned: Boolean(order.driverId || order.driverName),
    deliveryMode: order.deliveryMode,
    driverLabel: 'Driver',
    audience: 'customer',
  });

  const isFindingDriver = order.deliveryMode === 'delivery'
    && (Boolean(order.deliveryRequestId) || normalizedOrderStatus === 'confirmed')
    && !order.driverId
    && !order.driverName
    && !['delivered', 'completed', 'cancelled'].includes(normalizedOrderStatus);

  // Tracking the map is only useful once a rider exists, and only on delivery.
  const isActiveDelivery =
    order.deliveryMode === 'delivery' &&
    !['delivered', 'completed'].includes(order.status.trim().toLowerCase()) &&
    progress.hasRider &&
    Boolean(order.driverId || order.driverName);

  const handleChatWithBusiness = () => {
    if (order.businessId) {
      navigate(`/customer/messages/business/${order.businessId}`, {
        state: { peerName: order.restaurantName, peerAvatar: order.restaurantImage },
      });
    }
  };

  const handleChatWithDriver = () => {
    if (order.driverId) {
      navigate(`/customer/messages/driver/${order.driverId}`);
    }
  };

  const closeOrderReport = () => {
    setShowOrderReport(false);
    setOrderReportSubmitted(false);
    setOrderReportError(null);
  };

  const submitOrderReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!order) return;
    if (!orderReportDescription.trim()) {
      setOrderReportError('Please describe what happened.');
      return;
    }

    setIsSubmittingOrderReport(true);
    setOrderReportError(null);
    try {
      const { error: reportError } = await supabaseHelpers.createRideReport({
        rideId: order.id,
        reporterId: user?.id,
        reporterName: user?.name,
        reporterEmail: user?.email,
        driverId: order.driverId,
        driverName: order.driverName,
        category: 'Order report: ' + orderReportCategory,
        description: orderReportDescription.trim(),
        rideRoute: 'Order #' + order.orderNumber + ' · ' + order.restaurantName,
      });
      if (reportError) throw reportError;

      void logAudit({
        action: 'report_order',
        actorRole: 'customer',
        entityType: 'order',
        entityId: order.id,
        summary: 'Reported order #' + order.orderNumber + ': ' + orderReportCategory,
        details: { category: orderReportCategory, orderNumber: order.orderNumber, restaurantName: order.restaurantName },
        actorEmail: user?.email,
        actorName: user?.name,
      });
      setOrderReportSubmitted(true);
    } catch (reportSubmissionError) {
      console.error('[OrderDetail] Failed to submit order report:', reportSubmissionError);
      setOrderReportError('Could not submit your report. Please try again.');
    } finally {
      setIsSubmittingOrderReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b-2 border-[var(--border)] px-4 md:px-5 py-3 md:py-4 z-20">
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
            <button
              onClick={() => {
                setOrderReportCategory(ORDER_REPORT_CATEGORIES[0]);
                setOrderReportDescription('');
                setOrderReportError(null);
                setOrderReportSubmitted(false);
                setShowOrderReport(true);
              }}
              aria-label="Report this order"
              className="flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--error)]/25 px-2 py-1.5 transition-colors hover:bg-[var(--muted)]"
              title="Report this order"
            >
              <Flag className="size-5 text-[var(--error)]" />
              <span className="text-[10px] font-bold leading-none text-[var(--error)]">Report</span>
            </button>
            {isActiveDelivery && order.driverId && (
              <button onClick={handleChatWithDriver} className="flex flex-col items-center gap-0.5 p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors" title="Chat with Driver">
                <MessageCircle className="w-5 h-5 text-[var(--info)]" />
                <span className="text-[9px] font-semibold text-[var(--info)]">Driver</span>
              </button>
            )}
            {/* Available on every order status — the customer may need to reach the
                restaurant about an order that hasn't been accepted yet. */}
            {order.businessId && (
              <button onClick={handleChatWithBusiness} aria-label="Chat with restaurant" className="flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-2.5 py-1.5 shadow-sm transition-colors hover:brightness-95" title="Chat with Restaurant">
                <MessageCircle className="size-6 stroke-[2.5] text-[var(--primary)]" />
                <span className="text-[10px] font-bold leading-none text-[var(--primary)]">Restaurant</span>
              </button>
            )}
          </div>
        </div>
        <Badge className={`${isFindingDriver ? 'bg-[var(--amber)] text-white' : statusColors[order.status]} text-xs`}>
          {isFindingDriver
            ? 'Finding Driver'
            : progress.currentStepIsRiderStep && progress.riderHasStarted
            ? progress.currentTitle
              : statusLabels[order.status]}
        </Badge>
        {progress.currentStepIsRiderStep && progress.riderHasStarted && (
          <div className="mt-3 rounded-xl border border-[var(--info)]/20 bg-[var(--info-soft)] px-3 py-2.5">
            <p className="text-xs text-[var(--info)]">
              {progress.riderMessage || progress.currentStep.description}
            </p>
            {order.driverName && (
              <p className="mt-1 text-xs font-semibold text-[var(--info)]">Driver: {order.driverName}</p>
            )}
          </div>
        )}

      </div>

      <div className="px-4 md:px-5 pt-4 space-y-4 md:space-y-5">
        {/* Status Timeline — the same track as the stepper above, spelled out */}
        <Card className="p-4 md:p-5 border border-line">
          <h3 className="text-center font-bold text-[var(--ink)] text-sm md:text-base mb-3">Order Progress</h3>
          <OrderStatusUpdates
            status={order.status}
            driverStatus={order.driverStatus}
            deliveryMode={order.deliveryMode}
            audience="customer"
          />
        </Card>

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
            <div className="relative">
              <GoogleMap
              mapContainerStyle={{ width: '100%', height: '220px' }}
              defaultCenter={driverLocation}
              defaultZoom={13}
              options={{ zoomControl: false, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, draggable: true, gestureHandling: 'greedy' }}
              onLoad={(map) => {
                trackingMapRef.current = map;
                fitTrackingMapToRoute(map);
              }}
              onUnmount={() => { trackingMapRef.current = null; }}
              onDragStart={() => {
                trackingMapWasManuallyMovedRef.current = true;
                setTrackingMapWasManuallyMoved(true);
              }}
              onZoomChanged={() => {
                if (trackingMapIsProgrammaticallyFittingRef.current) return;
                trackingMapWasManuallyMovedRef.current = true;
                setTrackingMapWasManuallyMoved(true);
              }}
            >
              <MapTypeToggle />
              {restaurantLocation && (
                <MarkerF position={restaurantLocation} title={`${order.restaurantName} restaurant`} icon={createRestaurantMarkerIcon()} />
              )}
              <MarkerF position={driverLocation} title="Driver" icon={createTricycleMarkerIcon()} />
              {customerLocation && (
                <MarkerF
                  position={customerLocation}
                  title="Customer drop-off"
                  icon={createDropoffMarkerIcon({ size: 32 })}
                />
              )}
              {routePath.length > 1 && (
                <Polyline
                  path={routePath}
                  options={{
                    strokeColor: isRiderEnRouteToRestaurant ? RIDE_MAP_PICKUP_COLOR : RIDE_MAP_DROPOFF_COLOR,
                    strokeOpacity: 0.9,
                    strokeWeight: 6,
                    zIndex: 10,
                  }}
                />
              )}
              </GoogleMap>
              {trackingMapWasManuallyMoved && (
                <button
                  type="button"
                  onClick={recenterTrackingMap}
                  aria-label="Recenter live delivery map"
                  title="Recenter live delivery map"
                  className="absolute bottom-3 right-3 z-[500] flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface/95 px-3 text-xs font-semibold text-[var(--ink)] shadow-lg backdrop-blur-sm active:scale-95"
                >
                  <Navigation className="size-4 text-[var(--primary)]" />
                  Recenter
                </button>
              )}
            </div>
            <div className="px-4 py-2.5 bg-surface border-t border-[var(--border)] flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--ink)]">
                {order.driverName && <span className="text-[var(--muted-foreground)]">Driver: {order.driverName} • </span>}
                {!activeTrackingDestination
                  ? (isRiderEnRouteToRestaurant ? 'Restaurant location unavailable' : 'Customer location unavailable')
                  : isDriverAtRestaurant
                    ? 'Driver arrived at restaurant'
                    : isRiderEnRouteToRestaurant ? 'Heading to restaurant' : 'Delivering to customer'}
              </p>
              <div className="flex items-center gap-2">
                {etaToActiveStop && (
                  <span className="text-[10px] font-bold text-[var(--info)] bg-[var(--info-soft)] px-2 py-0.5 rounded-full">ETA {etaToActiveStop}</span>
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

        {/* Why the order was cancelled, so the customer sees the reason */}
        {order.status === 'cancelled' && order.cancelReason && (
          <Card className="p-4 md:p-5 border border-[var(--error)] bg-[var(--error-soft)]">
            <h3 className="font-bold text-[var(--error)] text-sm md:text-base mb-1">
              {order.cancelledBy === 'business'
                ? `${order.restaurantName} declined this order`
                : order.cancelledBy === 'driver'
                  ? 'The driver cancelled this delivery'
                : 'Cancellation reason'}
            </h3>
            <p className="text-sm text-[var(--error)]">{order.cancelReason}</p>
          </Card>
        )}

        {/* Restaurant Profile */}
        <Card className="gap-0 p-4 md:p-5 border border-line">
          <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-2">Restaurant</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden flex-shrink-0">
              <StoreLogo logo={restaurantProfile?.logoImage || order.restaurantImage} emojiClass="text-3xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-semibold text-[var(--ink)] text-sm md:text-base">
                  {restaurantProfile?.name || order.restaurantName}
                </p>
                {restaurantProfile?.rating != null && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink)]">
                    <Star className="size-3.5 fill-[var(--amber)] text-[var(--amber)]" aria-hidden="true" />
                    {restaurantProfile.rating.toFixed(1)}
                    {restaurantProfile.ratingCount > 0 && (
                      <span className="font-normal text-[var(--muted-foreground)]">
                        ({restaurantProfile.ratingCount})
                      </span>
                    )}
                  </span>
                )}
              </div>
              {restaurantProfile?.subtitle && (
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {restaurantProfile.subtitle}
                </p>
              )}
              <Badge className={`mt-1 text-[10px] md:text-xs ${order.deliveryMode === 'delivery' ? 'bg-[var(--info-soft)] text-[var(--info)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>
                {order.deliveryMode === 'delivery' ? 'Delivery' : 'Pickup'}
              </Badge>
            </div>
          </div>
          {cuisineLabels(restaurantProfile?.cuisine).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cuisineLabels(restaurantProfile?.cuisine).map((cuisine) => (
                <span key={cuisine} className="rounded-lg bg-[var(--teal-soft)] px-2 py-1 text-xs font-semibold text-[var(--teal)]">
                  {cuisine}
                </span>
              ))}
            </div>
          )}
          {(restaurantProfile?.address || restaurantProfile?.deliveryTime) && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              {restaurantProfile.address && (
                <div className="flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{restaurantProfile.address}</span>
                </div>
              )}
              {restaurantProfile.deliveryTime && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Delivery estimate: {restaurantProfile.deliveryTime}</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Delivery Address */}
        {order.deliveryMode === 'delivery' && (
          <Card className="gap-0 p-4 md:p-5 border border-line">
            <h3 className="font-bold text-[var(--ink)] text-sm md:text-base mb-2">Delivery Address</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[var(--muted-foreground)]">{order.address.split('|')[0].trim() || order.address}</p>
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="gap-0 p-4 md:p-5 border border-line">
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
                          {c.groupName}: {c.optionName}{(c.quantity ?? 1) > 1 && ` × ${c.quantity}`}{c.price > 0 && <span className="text-[var(--primary)]"> +₱{(c.price * (c.quantity ?? 1)).toFixed(2)}</span>}
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
                <p className="font-bold text-[var(--ink)] text-sm flex-shrink-0">₱{(item.price * item.quantity + Number(item.customizationTotal || 0)).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment */}
        <Card className="gap-0 p-4 md:p-5 border border-line">
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
            <FullSizeImagePreview
              src={order.paymentProofUrl}
              alt={`GCash payment proof for order ${order.orderNumber}`}
              className="mb-3 block overflow-hidden rounded-xl border border-line"
            >
              <img
                src={order.paymentProofUrl}
                alt=""
                className="max-h-48 w-full cursor-zoom-in object-cover"
              />
              <p className="bg-[var(--muted)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                Your payment proof · tap to view full size
              </p>
            </FullSizeImagePreview>
          )}

          {order.status === 'pending' && !order.paymentConfirmedAt && (
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">
              Waiting for the shop to confirm your GCash payment.
            </p>
          )}

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
            <FullSizeImagePreview
              src={order.deliveryProofUrl}
              alt={`Photo of this order being handed over${order.driverName ? ` by ${order.driverName}` : ''}`}
              className="block overflow-hidden rounded-xl border border-line"
            >
              <img
                src={order.deliveryProofUrl}
                alt=""
                className="max-h-64 w-full cursor-zoom-in object-cover"
              />
              <p className="bg-[var(--muted)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                {order.driverName ? `${order.driverName}'s handover photo` : 'Handover photo'}
                {' · '}tap to view full size
              </p>
            </FullSizeImagePreview>
          </Card>
        )}

        {/* Cancel Order — only while the restaurant hasn't accepted it yet.
            An order awaiting payment is still cancellable, but a payment-
            confirmed one is not: the money has moved and the kitchen may have
            started. */}
        {order.status === 'pending' && (
          <div>
            <Button
              onClick={() => setShowCancelOrderPrompt(true)}
              variant="outline"
              className="w-full border-[var(--error)] text-[var(--error)] font-bold py-3"
            >
              Cancel Order
            </Button>
          </div>
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
                <div className="mt-3 flex justify-center gap-1" role="img" aria-label={`You rated this restaurant ${rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`size-5 ${star <= rating ? 'fill-[var(--amber)] text-[var(--amber)]' : 'fill-[var(--border)] text-[var(--border)]'}`} aria-hidden="true" />
                  ))}
                </div>
                {showItemRatingPrompt && order.items.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-[var(--muted)] p-4 text-left">
                    <p className="text-sm font-semibold text-[var(--ink)]">Would you also like to rate the items you ordered?</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        onClick={() => navigate(`/customer/order-detail/${order.id}/rate-items`)}
                        className="flex-1 bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)]"
                      >
                        Rate ordered items
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowItemRatingPrompt(false)}
                        className="min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[var(--border)]"
                      >
                        Maybe later
                      </button>
                    </div>
                  </div>
                )}
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
                    const { error } = await supabaseHelpers.rateBusiness({ businessId: order.businessId, restaurantId: order.restaurantId || undefined, customerId: user.id, rating, orderId: order.id });
                    setRatingSubmitting(false);
                    if (error) { setRatingError('Failed to submit rating.'); return; }
                    setRatingSubmitted(true);
                    setShowItemRatingPrompt(true);
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

      {showOrderReport && order && (
        <div className="fixed inset-0 z-[3500] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-report-title"
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <h3 id="order-report-title" className="text-lg font-bold text-[var(--ink)]">Report this order</h3>
              <button
                type="button"
                aria-label="Close order report"
                onClick={closeOrderReport}
                className="grid size-11 place-items-center rounded-full transition-colors hover:bg-[var(--muted)]"
              >
                <X className="size-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            {orderReportSubmitted ? (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[var(--success-soft)]">
                  <Check className="size-7 text-[var(--success)]" />
                </div>
                <h4 className="text-base font-bold text-[var(--ink)]">Report submitted</h4>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Our admin team will review your order concern. Thank you for letting us know.
                </p>
                <button
                  type="button"
                  onClick={closeOrderReport}
                  className="mt-5 w-full rounded-2xl bg-[var(--primary)] py-3.5 font-bold text-white transition-transform active:scale-95"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submitOrderReport} className="space-y-4 p-5">
                <div className="rounded-xl bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">
                  <p className="truncate font-semibold text-[var(--ink)]">
                    Order #{order.orderNumber} · {order.restaurantName}
                  </p>
                </div>

                <div>
                  <label htmlFor="order-report-category" className="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]">
                    What is the issue?
                  </label>
                  <select
                    id="order-report-category"
                    value={orderReportCategory}
                    onChange={(event) => setOrderReportCategory(event.target.value)}
                    className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                  >
                    {ORDER_REPORT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="order-report-details" className="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]">
                    Details
                  </label>
                  <textarea
                    id="order-report-details"
                    value={orderReportDescription}
                    onChange={(event) => setOrderReportDescription(event.target.value)}
                    rows={4}
                    placeholder="Tell us what happened..."
                    className="w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                  />
                </div>

                {orderReportError && <p className="text-xs text-[var(--error)]">{orderReportError}</p>}

                <button
                  type="submit"
                  disabled={isSubmittingOrderReport}
                  className="w-full rounded-2xl bg-[var(--primary)] py-3.5 font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingOrderReport ? 'Submitting...' : 'Submit report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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
      {incomingOrderChat && (
        <FloatingChatHead
          headId={incomingOrderChat.conversationId}
          storageKey="trikeserve_chat_head_pos_customer"
          peerAvatar={incomingOrderChat.peerAvatar}
          peerLabel={incomingOrderChat.peerName}
          unread={incomingOrderChat.unread}
          pulseKey={orderChatPulseKey}
          stackItems={orderChatStackItems}
          onOpen={() => toggleChatOverlay(incomingOrderChat.conversationId)}
        />
      )}
    </div>
  );
}
