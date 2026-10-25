import { useState, useEffect, useRef } from "react";
import { Store, Package, ShoppingBag, Clock, User, CheckCircle, XCircle, AlertCircle, Navigation, MessageCircle, Loader2, Filter, ChevronDown, Search, X, Camera } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import ListPagination from "../ui/ListPagination";
import BusinessSidebar from "./BusinessSidebar";
import BusinessHamburgerButton from "./BusinessHamburgerButton";
import FullSizeImagePreview from "../ui/FullSizeImagePreview";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import FloatingChatHead from "../ui/FloatingChatHead";
import BusinessPageIntro from "./BusinessPageIntro";
    import { supabase } from "../../../lib/supabase";
    import { supabaseHelpers, findDeliveryTerminalForOrder, logAudit, geocodeAddress } from "@/lib/supabase";
    import { useAuth } from "../../contexts/AuthContext";
import { useChatHeadVisibility } from "../../contexts/ChatHeadVisibilityContext";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { getOrderProgress, isRiderHeadingToRestaurant } from "@/lib/orderProgress";
import { OrderStatusUpdates } from "../ui/OrderStatusUpdates";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import MapTypeToggle from "../ui/MapTypeToggle";
import useMapLoader from "@/lib/mapLoader";
import { createDropoffMarkerIcon, createRestaurantMarkerIcon, createTricycleMarkerIcon } from "@/lib/mapIcons";
import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_PICKUP_COLOR } from "@/lib/rideMapColors";
/**
 * "9:08PM" / "1:00AM" — 12-hour, no space before the meridiem.
 *
 * The card used to show `toLocaleString()`, which put a full date and seconds on
 * every row: "10/8/2026, 9:08:07 PM". On a list that gets scanned rather than read
 * that is three times the width of the time it is there to convey, and it pushed
 * the price onto a line of its own. The date is still on the detail screen, where
 * it is worth reading.
 */
function formatOrderTime(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const hours = at.getHours();
  const suffix = hours < 12 ? 'AM' : 'PM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(at.getMinutes()).padStart(2, '0')}${suffix}`;
}



interface Order {
  id: string;
  orderNumber: string;
  restaurantName: string;
  restaurantImage: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: { name: string; quantity: number; price: number; image?: string }[];
  total: number;
  subtotal: number;
  /**
   * `payment-confirmed` is the shop's own "I have the money" step, sitting
   * between `pending` and `preparing`. It is deliberately not folded into
   * `confirmed`, which already means something else in this app: "published, a
   * rider has been requested".
   */
  status: 'pending' | 'payment-confirmed' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way' | 'delivered' | 'cancelled';
  /** GCash only. The delivery fee is cash, collected by the rider at the door. */
  paymentMethod: 'gcash';
  address: string;
  deliveryFee: number;
  /**
   * The customer's screenshot of their GCash transfer, and when it arrived. This
   * is what the shop checks before tapping Accept Order.
   */
  paymentProofUrl?: string | null;
  paymentProofUploadedAt?: string | null;
  /** Who verified the transfer, and when. */
  paymentConfirmedAt?: string | null;
  paymentConfirmedBy?: string | null;
  /** The rider's photo at handover. */
  deliveryProofUrl?: string | null;
  /** The restaurant's photo of the food order, shown to drivers before pickup. */
  restaurantPackagePhotoUrl?: string | null;
  estimatedTime?: string;
  date: string;
  createdAt: string;
  deliveryMode: 'delivery' | 'pickup';
  needsCutlery: boolean;
  customerId?: string;
  driverId?: string;
  driverName?: string;
  /**
   * A rider request exists for this order, but nobody has taken it yet.
   *
   * The difference between "we asked for a rider" and "a rider is coming", which
   * this screen previously could not see: the request query filtered out every row
   * without an accepted driver, so a request posted a second ago looked exactly
   * like a filled one and the order announced a rider who did not exist yet.
   */
  driverRequested?: boolean;
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

type ActiveOrderStatusFilter = 'pending' | 'payment-confirmed' | 'confirmed' | 'preparing' | 'ready' | 'on-the-way';


export default function BusinessOrders() {
  const { user } = useAuth();
  const { toggleChatOverlay } = useChatHeadVisibility();
  const [selectedTab, setSelectedTab] = useState<'active' | 'history'>('active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [incomingDriverChat, setIncomingDriverChat] = useState<{
    conversationId: string;
    peerId: string;
    peerName: string;
    peerAvatar: string | null;
    unread: number;
  } | null>(null);
  const [driverChatPulseKey, setDriverChatPulseKey] = useState(0);
  const previousDriverChatSignalsRef = useRef<{
    scopeKey: string;
    signals: Map<string, string>;
  } | null>(null);
  const activatedDriverChatScopeRef = useRef<string | null>(null);
  const activatedDriverConversationIdsRef = useRef(new Set<string>());
  /** The one dialog left in this flow: confirming the GCash payment. */
  const [confirmAction, setConfirmAction] = useState<'accept' | null>(null);
  // Decline collects a reason before the order is cancelled.
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  // Confirming the GCash transfer. Its own flag and message because it is the
  // one action on this screen that can legitimately fail on a busy shop -- two
  // people, or a double tap -- and a silent no-op there looks like the button
  // is broken.
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<ActiveOrderStatusFilter[]>([]);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Show an incoming driver's message as a floating chat head without opening
  // the thread. The unread conversation remains in the Messages inbox as usual.
  useEffect(() => {
    const businessUserId = user?.id;
    if (!businessUserId) {
      setIncomingDriverChat(null);
      previousDriverChatSignalsRef.current = null;
      activatedDriverChatScopeRef.current = null;
      activatedDriverConversationIdsRef.current.clear();
      return;
    }

    let active = true;
    const refreshIncomingDriverChat = async () => {
      const { data, error } = await supabaseHelpers.getChatConversations(businessUserId);
      if (!active || error) return;

      const conversations = (data || [])
        .map((conversation: any) => {
          const isParticipantA = conversation.participant_a_id === businessUserId;
          const peerId = isParticipantA ? conversation.participant_b_id : conversation.participant_a_id;
          const peerRole = isParticipantA ? conversation.participant_b_role : conversation.participant_a_role;
          const unread = Number(isParticipantA ? conversation.unread_count_a : conversation.unread_count_b) || 0;
          const peerName = isParticipantA ? conversation.participant_b_name : conversation.participant_a_name;
          const peerAvatar = isParticipantA ? conversation.participant_b_avatar : conversation.participant_a_avatar;
          return { conversation, peerId, peerRole, peerName, peerAvatar, unread };
        })
        .filter(({ peerId, peerRole }) =>
          peerId && (peerRole === 'rider' || peerRole === 'driver' || peerRole === 'customer')
        );

      const scopeKey = `${businessUserId}:business-orders`;
      if (activatedDriverChatScopeRef.current !== scopeKey) {
        activatedDriverChatScopeRef.current = scopeKey;
        activatedDriverConversationIdsRef.current.clear();
      }
      const previousSignals = previousDriverChatSignalsRef.current?.scopeKey === scopeKey
        ? previousDriverChatSignalsRef.current.signals
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
      previousDriverChatSignalsRef.current = { scopeKey, signals: nextSignals };
      if (changedConversationIds.length > 0) {
        changedConversationIds.forEach((id) => activatedDriverConversationIdsRef.current.add(id));
        setDriverChatPulseKey((key) => key + 1);
      }

      const incoming = conversations
        .filter(({ conversation, peerId, unread }) =>
          activatedDriverConversationIdsRef.current.has(conversation.id) &&
          unread > 0 && conversation.last_message_sender_id === peerId
        )
        .sort((a, b) =>
          new Date(b.conversation.last_message_at || b.conversation.updated_at || 0).getTime() -
          new Date(a.conversation.last_message_at || a.conversation.updated_at || 0).getTime()
        );

      const latest = incoming[0];
      if (!latest) {
        setIncomingDriverChat(null);
        return;
      }
      setIncomingDriverChat({
        conversationId: latest.conversation.id,
        peerId: latest.peerId,
        peerName: latest.peerName || (latest.peerRole === 'customer' ? 'Customer' : 'Driver'),
        peerAvatar: latest.peerAvatar || null,
        unread: latest.unread,
      });
    };

    void refreshIncomingDriverChat();
    const unsubscribe = supabaseHelpers.subscribeToUserChatThreads(businessUserId, () => {
      void refreshIncomingDriverChat();
    });
    const interval = window.setInterval(() => void refreshIncomingDriverChat(), 5000);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [user?.id]);

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

  /*
   * Keep the open sheet's rider fields current while it is open.
   *
   * `selectedOrder` is a snapshot taken when the shop taps a card. `loadOrders`
   * refreshes the list every 5 seconds, but nothing wrote those fresh rows back
   * into the snapshot, so the sheet the shop was actually watching went stale the
   * moment it opened — it kept showing the rider state from the tap and nothing
   * else. That made "Finding Rider" terminal: a rider accepting would fill in the
   * card behind the sheet while the sheet sat there claiming nobody was coming.
   *
   * Rider details and the delivery proof are copied. Status is deliberately left
   * alone, because `updateOrderStatus` sets it optimistically and this runs on a
   * five-second cadence — re-syncing it would stamp out from under the button the
   * shop is holding, and re-show a step they already completed.
   */
  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = orders.find((o) => o.id === selectedOrder.id);
    if (!fresh) return;
    setSelectedOrder((o) => {
      if (!o) return o;
      if (
        o.driverId === fresh.driverId &&
        o.driverName === fresh.driverName &&
        o.driverRequested === fresh.driverRequested &&
        o.driverStatus === fresh.driverStatus &&
        o.driverMessage === fresh.driverMessage &&
        o.deliveryProofUrl === fresh.deliveryProofUrl
      ) {
        return o;
      }
      return {
        ...o,
        driverId: fresh.driverId,
        driverName: fresh.driverName,
        driverRequested: fresh.driverRequested,
        driverStatus: fresh.driverStatus,
        driverMessage: fresh.driverMessage,
        deliveryProofUrl: fresh.deliveryProofUrl,
      };
    });
  }, [orders, selectedOrder?.id]);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Prevent refresh during update
  /*
   * Posting the driver request after "Assign Driver".
   *
   * Separate from `isUpdatingStatus`, which only guards the polling loop and is
   * never shown. This one is what the button reads while it works, so the shop can
   * see the press was taken rather than pressing again.
   */
  const [isPostingDelivery, setIsPostingDelivery] = useState(false);
  const [packagePhotoFile, setPackagePhotoFile] = useState<File | null>(null);
  const [packagePhotoPreviewUrl, setPackagePhotoPreviewUrl] = useState<string | null>(null);
  const [packagePhotoError, setPackagePhotoError] = useState<string | null>(null);
  const [isUploadingPackagePhoto, setIsUploadingPackagePhoto] = useState(false);
  const packagePhotoInputRef = useRef<HTMLInputElement>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [restaurantLocation, setRestaurantLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToCustomer, setEtaToCustomer] = useState<string | null>(null);
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so the realtime subscription can call the latest loadOrders without
  // re-subscribing on every render.
  const loadOrdersRef = useRef<(() => Promise<void>) | null>(null);
  const isUpdatingStatusRef = useRef(false);

  useEffect(() => {
    if (!packagePhotoFile) {
      setPackagePhotoPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(packagePhotoFile);
    setPackagePhotoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [packagePhotoFile]);

  useEffect(() => {
    setPackagePhotoFile(null);
    setPackagePhotoError(null);
    if (packagePhotoInputRef.current) packagePhotoInputRef.current.value = '';
  }, [selectedOrder?.id]);

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
    // Re-reads when the signed-in user changes, so the list never keeps showing
    // the previous account's orders after another tab signs in.
  }, [isUpdatingStatus, user?.id]);

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
      setRestaurantLocation(null);
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

        /*
         * The rider accepting is the single fact this sheet most needs, and it is
         * written here — to `orders`, by the rider's accept handler — while the
         * row was fetched and thrown away. The three-second poll is the fastest
         * signal available (the list refresh is on five), so a rider accepting left
         * "Finding Rider" sitting on screen for up to five seconds after they were
         * already assigned, which is the exact gap the shop was watching.
         */
        if (freshOrder?.driver_name) {
          setSelectedOrder((o) =>
            o && o.id === selectedOrder.id && o.driverName !== freshOrder.driver_name
              ? { ...o, driverName: freshOrder.driver_name, driverRequested: true }
              : o,
          );
        }

        // The driver's live GPS *and* phase live on the ride request that carries
        // this order (`ride_requests.driver_*`); the orders table may not even
        // have driver_lat/lng columns.
        const { data: freshRide } = await supabase
          .from('ride_requests')
          .select('driver_lat, driver_lng, driver_status, driver_status_message, pickup_lat, pickup_lng')
          .eq('order_id', selectedOrder.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (freshRide?.driver_lat && freshRide?.driver_lng) {
          setDriverLocation({ lat: freshRide.driver_lat, lng: freshRide.driver_lng });
        }
        if (freshRide?.driver_status) setDriverStatus(freshRide.driver_status);
        const pickupLat = Number(freshRide?.pickup_lat);
        const pickupLng = Number(freshRide?.pickup_lng);
        setRestaurantLocation(
          freshRide?.pickup_lat != null && freshRide?.pickup_lng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)
            ? { lat: pickupLat, lng: pickupLng }
            : null,
        );
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
      const pickupLat = Number(ride.pickup_lat);
      const pickupLng = Number(ride.pickup_lng);
      setRestaurantLocation(
        ride.pickup_lat != null && ride.pickup_lng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)
          ? { lat: pickupLat, lng: pickupLng }
          : null,
      );
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
      /*
       * Identity from the auth context, not from `trikeserve_current_user`.
       *
       * That key is in localStorage, which every tab on this origin shares, so it
       * names whoever signed in last anywhere. Re-reading it here let another
       * tab's sign-in swap the restaurant this list was scoped to, so the shop
       * saw a different account's orders under its own name -- or none at all,
       * when that account had no restaurant.
       */
      const currentUser = user;

      if (!currentUser?.id) {
        console.log('[BusinessOrders] No signed-in user');
        setOrders([]);
        setIsLoading(false);
        return;
      }

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
          restaurantName: dbOrder.restaurant_name || 'Restaurant',
          restaurantImage: dbOrder.restaurant_image || '',
          customerName: dbOrder.customer_name || 'Customer',
          customerEmail: dbOrder.customer_email || '',
          customerPhone: dbOrder.customer_phone || '',
          items: parsedItems,
          total: dbOrder.total || 0,
          subtotal: dbOrder.subtotal || 0,
          status: dbOrder.status || 'pending',
          paymentMethod: 'gcash',
          paymentProofUrl: dbOrder.payment_proof_url ?? null,
          paymentProofUploadedAt: dbOrder.payment_proof_uploaded_at ?? null,
          paymentConfirmedAt: dbOrder.payment_confirmed_at ?? null,
          paymentConfirmedBy: dbOrder.payment_confirmed_by ?? null,
          deliveryProofUrl: dbOrder.delivery_proof_url ?? null,
          restaurantPackagePhotoUrl: dbOrder.restaurant_package_photo_url ?? null,
          address: dbOrder.address || '',
          deliveryFee: dbOrder.delivery_fee || 0,
          estimatedTime: dbOrder.estimated_time || '30 mins',
          // Time only, on the compact format the cards use: "9:08PM". The full
    // timestamp is still available via `createdAt` for the detail screen.
    date: formatOrderTime(dbOrder.created_at),
          createdAt: dbOrder.created_at,
          deliveryMode: dbOrder.delivery_mode || 'delivery',
          needsCutlery: dbOrder.needs_cutlery || false,
          customerId: dbOrder.customer_id || undefined,
          restaurantAddress: dbOrder.restaurant_address || undefined,
          cancelReason: dbOrder.cancel_reason || null,
          cancelledBy: dbOrder.cancelled_by || null,
          /*
           * The rider the order row itself names.
           *
           * This column was selected but never read, so the only rider name reaching
           * the screen came from the ride request. The rider app writes the name to
           * both tables, but those are separate writes and the ride request can be
           * missing or stale while the order row is current -- which is exactly when
           * the shop most needs to be told a rider is assigned, and it would say
           * nobody was. The ride-request pass below overwrites this when it has a
           * name of its own, so the fresher of the two wins.
           */
          driverName: dbOrder.driver_name || undefined,
        };
      });

      console.log(`[BusinessOrders] Loaded ${transformedOrders.length} orders from Supabase`);
      console.log('[BusinessOrders] SECURITY: These orders are protected by RLS policies');
      // Check ride_requests for driver status on each order
      const orderIds = transformedOrders.map((o: any) => o.id);
      if (orderIds.length > 0) {
        /*
         * Every request for these orders, not only the filled ones.
         *
         * The `.not('accepted_driver_id', 'is', null)` filter this replaces meant
         * an open request was invisible here, so between assigning a driver and a
         * rider accepting, the order looked the same as one that already had a
         * rider and read as assigned. Reading the open rows too is what lets the
         * screen say "finding a rider" and only say "assigned" once it is true.
         */
        const { data: rideReqs } = await supabase
          .from('ride_requests')
          .select('order_id, driver_status, driver_name, accepted_driver_id')
          .in('order_id', orderIds);

        if (rideReqs) {
          rideReqs.forEach((rr: any) => {
            if (!rr.order_id) return;
            const order = transformedOrders.find((o: any) => o.id === rr.order_id);
            if (!order) return;

            // Asked, at least. Whether anyone took it is the next question.
            order.driverRequested = true;

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

  // `payment-confirmed` is an active state, not history: the shop still has to
  // cook the food and hand it to a rider. Leaving it out put a paid order into
  // neither list, which is where "my order vanished" came from.
  //
  /** Orders shown per page. Ten is roughly one screen on a phone. */
  const PAGE_SIZE = 10;

  /*
   * Held as the raw number the reader chose, clamped when read.
   *
   * Storing the clamped value instead would mean writing back to state during
   * render, and the list can shrink between renders -- on a timer, from a poll --
   * so the clamp has to be re-derivable every time rather than latched once.
   */
  const [rawActivePage, setRawActivePage] = useState(1);
  const [rawHistoryPage, setRawHistoryPage] = useState(1);

  const activeOrders = orders.filter(o => ['pending', 'payment-confirmed', 'confirmed', 'preparing', 'ready', 'on-the-way'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  /*
   * Newest first, applied to every list on this screen.
   *
   * The All view used to float whatever the shop had just accepted to the top, on
   * the reasoning that the order you are working is the one you need to see. It
   * did the opposite: accepting an order pushed it *up* the list and sent
   * everything above it down, so the order being worked on moved while the shop
   * was tapping through it, and the order accepted longest ago ended up lowest of
   * all the accepted ones. A queue that reorders itself in response to being
   * worked on is not a queue anyone can point at.
   *
   * Sorted by time, always, on every filter and both tabs. A row only moves when
   * time passes or a new order arrives, both of which are facts about the order
   * rather than about this session — so the list behaves the same on a second
   * device and the same after a reload.
   *
   * Sorting rather than trusting the query's order is deliberate: history used to
   * rely on the fetch coming back newest-first, which was an accident of the
   * request rather than a guarantee of this screen.
   *
   * Not memoised: `activeOrders` is rebuilt on every render, so a `useMemo` keyed
   * on it would invalidate every render anyway and only add a dependency list to
   * keep honest. The lists are a few dozen rows at most, and the 5-second poll is
   * what actually costs anything.
   */
  const byNewestFirst = (a: Order, b: Order) =>
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();

  const normalizedOrderSearchQuery = orderSearchQuery.trim().toLocaleLowerCase();
  const matchesOrderSearch = (order: Order) =>
    !normalizedOrderSearchQuery ||
    order.orderNumber?.toLocaleLowerCase().includes(normalizedOrderSearchQuery) ||
    order.customerName?.toLocaleLowerCase().includes(normalizedOrderSearchQuery);

  const filteredActiveOrders = activeOrders
    .filter((order) => (selectedStatusFilters.length === 0 || selectedStatusFilters.includes(order.status as ActiveOrderStatusFilter)) && matchesOrderSearch(order))
    .sort(byNewestFirst);

  const filteredHistoryOrders = historyOrders.filter(matchesOrderSearch).sort(byNewestFirst);

  /*
   * Paging, ten at a time.
   *
   * The two lists page independently: a shop with three active orders and forty in
   * history should not have to scroll past three rows of nothing to reach the ones
   * it is looking for.
   *
   * The page is clamped rather than corrected in an effect. This list shrinks under
   * the reader's feet -- accepting an order moves it out of Active into History --
   * and an effect would correct it one render later, which is a frame of an empty
   * list before the clamp lands. Deriving the safe page means the list is never
   * wrong, only ever out of date.
   */
  const activePageCount = Math.max(1, Math.ceil(filteredActiveOrders.length / PAGE_SIZE));
  const historyPageCount = Math.max(1, Math.ceil(filteredHistoryOrders.length / PAGE_SIZE));
  const activePage = Math.min(rawActivePage, activePageCount);
  const historyPage = Math.min(rawHistoryPage, historyPageCount);

  const pagedActiveOrders = filteredActiveOrders.slice(
    (activePage - 1) * PAGE_SIZE,
    activePage * PAGE_SIZE,
  );
  const pagedHistoryOrders = filteredHistoryOrders.slice(
    (historyPage - 1) * PAGE_SIZE,
    historyPage * PAGE_SIZE,
  );

  /*
   * A filter change throws away the reader's place, so it takes them back to the
   * first page. Without this, someone on page 4 of All who taps Pending lands on
   * page 4 of two rows and is told there is nothing there.
   */
  useEffect(() => {
    setRawActivePage(1);
    setRawHistoryPage(1);
  }, [selectedTab, selectedStatusFilters, orderSearchQuery]);

  /** Accept the order, verify payment if needed, and begin preparation. */
  const handleAcceptOrder = async (order: Order) => {
    setIsAcceptingOrder(true);
    setPaymentError(null);

    let paymentConfirmedAt = order.paymentConfirmedAt;
    if (order.status === 'pending') {
      const result = await supabaseHelpers.confirmOrderPayment(order.id, user?.email);

      if (!result.success) {
        setPaymentError(result.error || 'Could not accept this order.');
        setIsAcceptingOrder(false);
        return false;
      }

      paymentConfirmedAt = new Date().toISOString();
      void supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'payment-confirmed',
      }).catch(err => console.error('[BusinessOrders] Failed to message payment confirmation:', err));
      logAudit({
        action: 'confirm_payment',
        actorRole: 'business',
        entityType: 'order',
        entityId: order.id,
        summary: `Confirmed GCash payment for order ${order.orderNumber}`,
        details: { order_number: order.orderNumber, total: order.total },
        actorEmail: user?.email,
        actorName: user?.name,
      });
    } else if (order.status !== 'payment-confirmed') {
      setIsAcceptingOrder(false);
      return false;
    }

    if (!paymentConfirmedAt) {
      setPaymentError('Confirm the GCash payment before accepting this order.');
      setIsAcceptingOrder(false);
      return false;
    }

    const didStartPreparing = await updateOrderStatus(order.id, 'preparing');
    if (!didStartPreparing) {
      // A payment may have been confirmed successfully even if the following
      // order-status update failed. Leave it ready to retry as an accepted order.
      const acceptedOrder = { ...order, status: 'payment-confirmed' as const, paymentConfirmedAt };
      setOrders((current) => current.map((item) => item.id === order.id ? acceptedOrder : item));
      setSelectedOrder((current) => current?.id === order.id ? acceptedOrder : current);
      setIsAcceptingOrder(false);
      return false;
    }

    const preparingOrder = { ...order, status: 'preparing' as const, paymentConfirmedAt };
    setOrders((current) => current.map((item) => item.id === order.id ? preparingOrder : item));
    setSelectedOrder((current) => current?.id === order.id ? preparingOrder : current);
    setIsAcceptingOrder(false);
    return true;
  };

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
      void supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'cancelled',
      }).catch(err => console.error('[BusinessOrders] Failed to message order cancellation:', err));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']): Promise<boolean> => {
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
        return false;
      }

      console.log('[BusinessOrders] Order details:', {
        id: order.id,
        orderNumber: order.orderNumber,
        currentStatus: order.status,
        newStatus: newStatus
      });

      // Update UI
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      /*
       * The open order sheet, too.
       *
       * Only the list was being updated optimistically, so the sheet the shop was
       * actually looking at kept showing the old status — and the button they had
       * just pressed — until the write came back. On a slow connection that is a
       * second or more of the screen looking broken, and the natural reaction is to
       * press the same button again.
       */
      setSelectedOrder((o) => (o && o.id === orderId ? { ...o, status: newStatus } : o));
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
          setSelectedOrder((o) => (o && o.id === orderId ? { ...o, status: order.status } : o));
          setIsUpdatingStatus(false);
          return false;
        }
      }

      console.log('[BusinessOrders] ✅ Update successful - waiting 2 seconds...');

      // Notify the customer about the new order status.
      supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
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
      return true;

    } catch (error) {
      console.error('[BusinessOrders] ❌ EXCEPTION:', error);
      console.error('[BusinessOrders] Error String:', String(error));
      alert('Error: ' + String(error).substring(0, 150));
      setOrders(orders);
      setSelectedOrder((o) => (o && o.id === orderId ? { ...o, status: orders.find((item) => item.id === orderId)?.status ?? o.status } : o));
      setIsUpdatingStatus(false);
      return false;
    }
  };

  // Create an OPEN delivery request (not assigned to specific driver)
  const createOpenDeliveryRequest = async (order: Order) => {
    if (!order.customerId) {
      alert('Cannot create delivery request: missing customer ID in this order.');
      return false;
    }

    // Use the live restaurant profile for a new rider request. The order and user
    // rows can retain an older shop name after the business renames itself.
    let pickupLabel = 'Restaurant Pickup';
    let pickupLat: number | null = null;
    let pickupLng: number | null = null;
    let pickupAddress = '';
    try {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name, address, latitude, longitude')
        .eq('business_user_id', user?.id)
        .maybeSingle();
      if (restaurant?.name?.trim()) pickupLabel = restaurant.name.trim();
      if (restaurant?.address?.trim()) pickupAddress = restaurant.address.trim();
      const savedLat = Number(restaurant?.latitude);
      const savedLng = Number(restaurant?.longitude);
      if (restaurant?.latitude != null && restaurant?.longitude != null && Number.isFinite(savedLat) && Number.isFinite(savedLng)) {
        pickupLat = savedLat;
        pickupLng = savedLng;
      }
    } catch (e) {}

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

    // If the business has not pinned its location, geocode only a real address,
    // never the storefront name.
    if (pickupLat == null && pickupLng == null && pickupAddress && pickupAddress.trim() !== pickupLabel.trim()) {
      try {
        const location = await geocodeAddress(pickupAddress);
        if (location) {
          pickupLat = location.lat;
          pickupLng = location.lng;
          console.log('[BusinessOrders] ✅ Geocoded restaurant address:', pickupLat, pickupLng);
        }
      } catch (geoErr) {
        console.error('[BusinessOrders] Geocoding failed:', geoErr);
      }
    }

    // Restaurant coordinates improve driver assignment and navigation, but a
    // business may post an order before adding a map pin or street address.

    /*
     * Pick the nearest terminal whose plotted route reaches the restaurant.
     *
     * If no terminal route reaches the restaurant, use the nearest active
     * terminal as the fallback. Riders in other terminals can still see this
     * request when their route also reaches the restaurant.
     */
    let assignedTerminalId: string | null = null;
    if (dropoffCoords) {
      const assignment = await findDeliveryTerminalForOrder({
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        pickupLat,
        pickupLng,
        requireRoute: true,
        routeToPickup: true,
      });

      assignedTerminalId = assignment.terminal?.id || null;

      // Recorded on the order so the decision is auditable after the fact, and so
      // it survives a boundary being redrawn later.
      if (assignedTerminalId) {
        const { error: assignError } = await supabase
          .from('orders')
          .update({
            terminal_id: assignedTerminalId,
            dropoff_lat: dropoffCoords.lat,
            dropoff_lng: dropoffCoords.lng,
          })
          .eq('id', order.id);

        if (assignError) {
          // Not fatal: the request below still carries the terminal, so the rider
          // is routed correctly even if the order row could not be annotated.
          console.warn('[BusinessOrders] Could not record terminal on order:', assignError);
        }
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
        terminal_id: assignedTerminalId,
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

    console.log('[BusinessOrders] ✅ Open delivery request created for its restaurant terminal');
    return true;
  };

  const handlePackagePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPackagePhotoError('Choose an image of the food order.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPackagePhotoError('The photo must be 10 MB or smaller.');
      return;
    }
    setPackagePhotoFile(file);
    setPackagePhotoError(null);
  };

  /** Save the restaurant photo before publishing the order to nearby drivers. */
  const handleAssignDriver = async (order: Order) => {
    if (isPostingDelivery || order.driverRequested || order.driverName) return;
    if (!packagePhotoFile && !order.restaurantPackagePhotoUrl) {
      setPackagePhotoError('Take a food photo before assigning a driver.');
      return;
    }

    setIsPostingDelivery(true);
    let packagePhotoUrl = order.restaurantPackagePhotoUrl || null;

    try {
      if (packagePhotoFile) {
        setIsUploadingPackagePhoto(true);
        const uploaded = await supabaseHelpers.uploadRestaurantPackagePhoto(order.id, packagePhotoFile);
        if (uploaded.error || !uploaded.data?.publicUrl) {
          setPackagePhotoError(uploaded.error || 'Could not upload the food photo. Please try again.');
          return;
        }

        packagePhotoUrl = uploaded.data.publicUrl;
        const { data: savedPhoto, error: savePhotoError } = await supabase
          .from('orders')
          .update({ restaurant_package_photo_url: packagePhotoUrl, updated_at: new Date().toISOString() })
          .eq('id', order.id)
          .select('id')
          .maybeSingle();

        if (savePhotoError || !savedPhoto) {
          console.error('[BusinessOrders] Could not save restaurant package photo:', savePhotoError);
          setPackagePhotoError('Could not save the photo to this order. Apply ADD_RESTAURANT_PACKAGE_PHOTO.sql, then try again.');
          return;
        }

        setOrders((current) => current.map((item) => item.id === order.id
          ? { ...item, restaurantPackagePhotoUrl: packagePhotoUrl }
          : item));
        setSelectedOrder((current) => current?.id === order.id
          ? { ...current, restaurantPackagePhotoUrl: packagePhotoUrl }
          : current);
        setPackagePhotoFile(null);
        setPackagePhotoError(null);
      }

      if (!packagePhotoUrl) {
          setPackagePhotoError('Take a food photo before assigning a driver.');
        return;
      }

      const didCreateRequest = await createOpenDeliveryRequest({ ...order, restaurantPackagePhotoUrl: packagePhotoUrl });
      if (!didCreateRequest) return;

      void supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'driver-requested',
      }).catch(err => console.error('[BusinessOrders] Failed to message driver request:', err));

      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, restaurantPackagePhotoUrl: packagePhotoUrl, driverRequested: true }
        : item));
      setSelectedOrder((current) => current?.id === order.id
        ? { ...current, restaurantPackagePhotoUrl: packagePhotoUrl, driverRequested: true }
        : current);
    } catch (error) {
      console.error('[BusinessOrders] Could not prepare restaurant package photo:', error);
      setPackagePhotoError('Could not save the food photo. Please try again.');
    } finally {
      setIsUploadingPackagePhoto(false);
      setIsPostingDelivery(false);
    }
  };

  /*
   * One colour per status.
   *
   * These used to be four colours spread across eight statuses -- preparing and
   * confirmed were both blue, ready and delivered were both green, pending and
   * on-the-way were both amber -- which made the badge decorative. A shop scanning
   * for the one order waiting on them could not tell it apart from one that had
   * already moved on, which is the only thing the badge is for.
   *
   * The hues are ordered so no two statuses adjacent in the workflow share a
   * colour. Three of the eight are greens because the theme has three greens to
   * spend (--teal, --rider, --success); they are spread apart rather than used
   * side by side.
   *
   * --error for cancelled, not the coral brand colour: a cancelled order used to
   * carry the same tint as a live one, on the row a shop looks at first.
   */
  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        // Waiting on the shop, and the only status where the money is unaccounted for.
        return 'bg-[var(--amber)]';
      case 'payment-confirmed':
        // Money checked, kitchen not started. This status had no case here at all,
        // so it rendered with no colour and no label.
        return 'bg-[var(--info)]';
      case 'preparing':
        return 'bg-[var(--violet)]';
      case 'ready':
        return 'bg-[var(--teal)]';
      case 'confirmed':
        return 'bg-[var(--primary)]';
      case 'on-the-way':
        return 'bg-[var(--rider)]';
      case 'delivered':
        return 'bg-[var(--success)]';
      case 'cancelled':
        return 'bg-[var(--error)]';
      default:
        return 'bg-[var(--muted)]';
    }
  };

  const getStatusLabel = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'New Order';
      case 'payment-confirmed':
        // Matches the tracker's own wording for this step -- see orderProgress.ts.
        return 'Paid';
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
      default:
        return 'Unknown';
    }
  };

  /**
   * What this order is actually doing, which is not always what its status says.
   *
   * `confirmed` means "the shop handed this to the rider network". That is not the
   * same as a rider existing: between posting the request and someone accepting it
   * there is nobody on the way, and the label used to claim one anyway — the order
   * read "Rider Assigned" while the request had not been opened by a single rider.
   *
   * The state is split in two at the one place the distinction exists, so a shop
   * watching for a rider sees "finding one" and then sees the name, in that order.
   */
  const isFindingRider = (order: Order | null) =>
    !!order && order.deliveryMode === 'delivery' &&
    (Boolean(order.driverRequested) || order.status === 'confirmed') &&
    !order.driverName;

  const orderStatusLabel = (order: Order | null) => {
    if (!order) return '';
    if (isFindingRider(order)) return 'Finding Driver';
    if (order.driverName) return 'Driver Assigned';
    return getStatusLabel(order.status);
  };

  /**
   * Colour for that split.
   *
   * Amber rather than the coral that `confirmed` carries, because amber is already
   * this screen's "waiting on something outside the shop" — and a rider who has not
   * arrived yet is not the same news as one who has.
   */
  const orderStatusColor = (order: Order | null) => {
    if (isFindingRider(order)) return 'bg-[var(--amber)]';
    return getStatusColor(order ? order.status : 'pending');
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
        /*
         * While the request is still open, this order is not past "Ready" — there is
         * no rider. `confirmed` maps to the "Rider Assigned" step, so passing it
         * through here ticked the rider step off on the strength of the shop pressing
         * a button, and the shop's own tracker agreed with the badge that a rider was
         * already on the way. Read it as `ready` until somebody accepts, and the
         * track moves to "Rider Assigned" when it is actually true.
         */
        status: isFindingRider(selectedOrder) ? 'ready' : selectedOrder.status,
        driverStatus: driverStatus ?? selectedOrder.driverStatus,
        driverMessage: selectedOrder.driverMessage,
        deliveryMode: selectedOrder.deliveryMode,
        driverLabel: 'Driver',
      })
    : null;

  // Which leg of the trip the rider is on. The old inline check listed
  // `accepted`, `on-the-way` and `arrived` but not `picked-up`, so the route line
  // flipped colour at the wrong moment.
  const isRiderEnRouteToShop = isRiderHeadingToRestaurant(driverStatus ?? selectedOrder?.driverStatus);

  const statusFilterOptions: Array<{ value: 'all' | ActiveOrderStatusFilter; label: string }> = [
    { value: 'all', label: `All (${activeOrders.length})` },
    { value: 'pending', label: `Awaiting Payment (${activeOrders.filter(order => order.status === 'pending').length})` },
    { value: 'payment-confirmed', label: `Paid (${activeOrders.filter(order => order.status === 'payment-confirmed').length})` },
    { value: 'preparing', label: `Preparing (${activeOrders.filter(order => order.status === 'preparing').length})` },
    { value: 'ready', label: `Ready (${activeOrders.filter(order => order.status === 'ready').length})` },
    { value: 'confirmed', label: `Delivery (${activeOrders.filter(order => order.status === 'confirmed').length})` },
    { value: 'on-the-way', label: `On The Way (${activeOrders.filter(order => order.status === 'on-the-way').length})` },
  ];

  return (
    <div className="min-h-dvh bg-[var(--muted)] flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="@container flex-1 lg:ml-64 w-full min-w-0">
        {/* Header */}
        <div className="px-3 md:px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <BusinessHamburgerButton
              onClick={() => setIsMobileMenuOpen(true)}
              label="Open navigation"
              className="lg:hidden grid size-11 shrink-0 place-items-center hover:bg-[var(--muted)] rounded-xl transition-all"
              iconClassName="w-6 h-6 text-[var(--ink)]"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)] mb-1 md:mb-2">Orders</h1>
              <p className="text-xs md:text-sm text-[var(--muted-foreground)]">{activeOrders.length} active orders</p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[100rem] p-4 sm:p-6"><BusinessPageIntro section="Orders" title="Every order, handled with care." description="Follow payments, preparation, and delivery from one clear workspace. Open an order to review details before taking action." metrics={[
          { label: 'Active orders', value: activeOrders.length, Icon: Package },
          { label: 'Preparing', value: activeOrders.filter(order => order.status === 'preparing').length, Icon: Clock },
          { label: 'Order history', value: historyOrders.length, Icon: ShoppingBag },
        ]} /></div>
        {/* Tabs */}
        {/* The horizontal scroll belongs to the status row alone. While it was on
            this shared wrapper, swiping the chips dragged Active/History off-screen
            with them. */}
        <div className="relative mx-4 space-y-3 rounded-3xl border border-line bg-card p-4 sm:mx-6">
          <div className="flex gap-2">
            <button
              onClick={() => { setSelectedTab('active'); setIsStatusFilterOpen(false); }}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
                selectedTab === 'active'
                  ? 'bg-[var(--teal-soft)] text-[var(--teal)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
              }`}
            >
              Active ({activeOrders.length})
            </button>
            <button
              onClick={() => { setSelectedTab('history'); setIsStatusFilterOpen(false); }}
              className={`flex-1 md:flex-1 py-2.5 px-3 md:px-4 rounded-xl font-semibold transition-all text-sm md:text-base whitespace-nowrap ${
                selectedTab === 'history'
                  ? 'bg-[var(--teal-soft)] text-[var(--teal)]'
                  : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
              }`}
            >
              History ({historyOrders.length})
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                type="search"
                value={orderSearchQuery}
                onChange={event => setOrderSearchQuery(event.target.value)}
                placeholder="Search by order number or customer"
                aria-label="Search orders by order number or customer"
                className="min-h-11 w-full rounded-xl border border-line bg-[var(--muted)] pl-10 pr-4 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--teal)]/20 placeholder:text-[var(--muted-foreground)]"
              />
            </label>
          {selectedTab === 'active' && (
            <div className="relative flex justify-end sm:shrink-0">
              <button
                type="button"
                aria-expanded={isStatusFilterOpen}
                aria-label={`Filter active orders${selectedStatusFilters.length ? `, ${selectedStatusFilters.length} selected` : ''}`}
                onClick={() => setIsStatusFilterOpen(open => !open)}
                onKeyDown={event => { if (event.key === 'Escape') setIsStatusFilterOpen(false); }}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${selectedStatusFilters.length ? 'border-[var(--teal)] bg-[var(--teal-soft)] text-[var(--teal)]' : 'border-line bg-[var(--muted)] text-[var(--ink)] hover:bg-[var(--border)]'}`}
              >
                <Filter className="size-4" />
                <span>Filter</span>
                {selectedStatusFilters.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--teal)] text-[10px] text-white">{selectedStatusFilters.length}</span>}
                <ChevronDown className={`size-4 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} />
              </button>
              {isStatusFilterOpen && (
                <div role="group" aria-label="Filter active orders by status" className="absolute right-0 top-full z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-xl">
                  {statusFilterOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={option.value === 'all' ? selectedStatusFilters.length === 0 : selectedStatusFilters.includes(option.value)}
                      onClick={() => {
                        if (option.value === 'all') {
                          setSelectedStatusFilters([]);
                        } else {
                          setSelectedStatusFilters(current => current.includes(option.value as ActiveOrderStatusFilter)
                            ? current.filter(status => status !== option.value)
                            : [...current, option.value as ActiveOrderStatusFilter]);
                        }
                      }}
                      className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold transition-colors ${(option.value === 'all' ? selectedStatusFilters.length === 0 : selectedStatusFilters.includes(option.value)) ? 'bg-[var(--teal-soft)] text-[var(--teal)]' : 'text-[var(--ink)] hover:bg-[var(--muted)]'}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        {option.label}
                        {(option.value === 'all' ? selectedStatusFilters.length === 0 : selectedStatusFilters.includes(option.value)) && <CheckCircle aria-hidden="true" className="size-4 shrink-0" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
          {selectedTab === 'active' && selectedStatusFilters.length > 0 && (
            <div aria-label="Selected status filters" className="flex flex-wrap gap-2">
              {selectedStatusFilters.map(status => {
                const option = statusFilterOptions.find(item => item.value === status);
                return (
                  <span key={status} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--teal)]/30 bg-[var(--teal-soft)] py-1 pl-3 pr-1.5 text-xs font-semibold text-[var(--teal)]">
                    {option?.label.split(' (')[0] ?? status}
                    <button
                      type="button"
                      aria-label={`Remove ${option?.label.split(' (')[0] ?? status} filter`}
                      onClick={() => setSelectedStatusFilters(current => current.filter(item => item !== status))}
                      className="grid size-6 place-items-center rounded-full transition-colors hover:bg-[var(--teal)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Book Ride Button - Only show when ready orders exist */}
        </div>

        {/* Orders List */}
        {/* Tighter list spacing.

            The rows were separated by a full card's worth of padding on every
            side, so six orders filled two screens and only the order number and
            the status were above the fold. Everything here is about the same
            information in less space: one gap between rows, one inside the row,
            and the meta line beside the price instead of under it. */}
        <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 items-start gap-4 p-4 sm:p-6 @min-[60rem]:grid-cols-2 [&>nav]:col-span-full">
          {selectedTab === 'active' ? (
            filteredActiveOrders.length > 0 ? (
              <>
                {pagedActiveOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  role="button" tabIndex={0} aria-label={`View order ${order.orderNumber}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOrder(order); } }}
                  className="min-w-0 gap-3 rounded-3xl bg-card p-4 sm:p-5 border border-line active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 md:gap-3 mb-1.5">
                    <div className="min-w-0">
                      {/* No margin under the order number. The customer name
                          belongs to it, not to the items further down, and a gap
                          there split one thing into two lines that read as
                          separate rows. */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-[var(--ink)] text-sm md:text-base">#{order.orderNumber}</h3>
                        <Badge className={`${orderStatusColor(order)} text-white text-xs`}>
                          {orderStatusLabel(order)}
                        </Badge>
                      </div>
                      <p className="text-xs md:text-sm text-[var(--muted-foreground)] truncate">{order.customerName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base md:text-lg font-bold text-[var(--primary)]">₱{order.total.toFixed(2)}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{order.date}</p>
                    </div>
                  </div>

                  <div className="space-y-0.5 mb-1.5 text-xs md:text-sm">
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
                ))}
                <ListPagination
                  label="Active orders"
                  page={activePage}
                  pageCount={activePageCount}
                  onChange={setRawActivePage}
                />
              </>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-12 md:w-16 h-12 md:h-16 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[var(--muted-foreground)]">{orderSearchQuery.trim() ? 'No active orders match your search' : 'No active orders'}</p>
              </div>
            )
          ) : (
            filteredHistoryOrders.length > 0 ? (
              <>
                {pagedHistoryOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  role="button" tabIndex={0} aria-label={`View order ${order.orderNumber}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOrder(order); } }}
                  className="col-span-full min-w-0 gap-0 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-transform active:scale-[0.98] cursor-pointer sm:p-6"
                >
                  <div className="flex w-full items-start gap-3 text-left">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                      {order.restaurantImage ? (
                        <ImageWithFallback
                          src={order.restaurantImage}
                          alt={order.restaurantName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center" aria-hidden="true">
                          <Store className="size-6 text-[var(--muted-foreground)]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="mb-1 line-clamp-1 text-sm font-semibold text-[var(--ink)] sm:text-base">
                            {order.customerName}
                          </h3>
                          <p className="mb-2 text-xs text-[var(--muted-foreground)]">{order.date}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${order.status === 'delivered' ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--error-soft)] text-[var(--error)]'}`}>
                              {getStatusLabel(order.status)}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)]">· {order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-bold text-[var(--ink)]">₱{order.total}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">#{order.orderNumber}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[var(--primary)]">Tap to view details</span>
                    </div>
                  </div>

                  {/* Cancellation reason, readable straight from the history list */}
                  {order.status === 'cancelled' && order.cancelReason && (
                    <div className="mt-3 p-2.5 rounded-xl border border-[var(--error)] bg-[var(--error-soft)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--error)] mb-0.5">
                        {order.cancelledBy === 'customer'
                          ? 'Cancelled by customer'
                          : order.cancelledBy === 'driver'
                            ? 'Cancelled by driver'
                            : order.cancelledBy === 'business'
                              ? 'Cancelled by you'
                              : 'Declined'}
                      </p>
                      <p className="text-xs text-[var(--error)]">{order.cancelReason}</p>
                    </div>
                  )}
                </Card>
                ))}
                <ListPagination
                  label="Order history"
                  page={historyPage}
                  pageCount={historyPageCount}
                  onChange={setRawHistoryPage}
                />
              </>
            ) : (
              <div className="text-center py-12">
                <Package className="w-12 md:w-16 h-12 md:h-16 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[var(--muted-foreground)]">{orderSearchQuery.trim() ? 'No order history matches your search' : 'No order history'}</p>
              </div>
            )
          )}
        </div>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end justify-center sm:items-center sm:p-5">
            <div role="dialog" aria-modal="true" aria-label="Order details" className="bg-card flex w-full max-w-3xl flex-col overflow-hidden h-full sm:h-auto sm:rounded-3xl sm:max-h-[90dvh]">
              <div className="relative z-10 shrink-0 bg-surface border-b border-[var(--border)] px-4 md:px-5 py-3 md:py-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold text-[var(--ink)]">#{selectedOrder.orderNumber}</h2>
                  <button aria-label="Close order details" onClick={() => setSelectedOrder(null)} className="min-h-11 min-w-11 rounded-xl text-lg font-semibold text-[var(--info)]">
                    <span className="hidden md:inline">Close</span>
                    <span className="md:hidden">✕</span>
                  </button>
                </div>
                <Badge className={`${orderStatusColor(selectedOrder)} text-white`}>
                  {progress?.currentStepIsRiderStep && progress.riderHasStarted
                    ? progress.currentTitle
                    : orderStatusLabel(selectedOrder)}
                </Badge>

              </div>

              <div
                role="region"
                aria-label="Order details content"
                tabIndex={0}
                className="scrollbar-hide min-h-0 flex-1 touch-pan-y cursor-grab overflow-y-auto p-3 md:p-5 space-y-3 md:space-y-4 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--info)]"
              >
                {/* Why the order was cancelled, so the reason is never buried */}
                {selectedOrder.status === 'cancelled' && selectedOrder.cancelReason && (
                  <div className="p-3 rounded-xl border border-[var(--error)] bg-[var(--error-soft)]">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--error)] mb-1">
                      {selectedOrder.cancelledBy === 'customer'
                        ? 'Cancelled by customer'
                        : selectedOrder.cancelledBy === 'driver'
                          ? 'Cancelled by driver'
                          : selectedOrder.cancelledBy === 'business'
                            ? 'Cancelled by you'
                            : 'Order declined'}
                    </p>
                    <p className="text-sm text-[var(--error)]">{selectedOrder.cancelReason}</p>
                  </div>
                )}

                <Card className="p-4 border-2 border-[var(--muted)] shadow-sm">
                  <h3 className="text-center font-bold text-[var(--ink)] text-sm md:text-base mb-3">Order Progress</h3>
                  <OrderStatusUpdates
                    status={selectedOrder.status}
                    driverStatus={driverStatus ?? selectedOrder.driverStatus}
                    deliveryMode={selectedOrder.deliveryMode}
                  />
                </Card>

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
                      <div key={idx} className="flex items-center gap-3 p-2 md:p-3 bg-[var(--muted)] rounded-xl">
                        {/*
                          The dish photo, which the line item already carries.

                          This is the screen someone packing the bag works from, and
                          a list of names is how the wrong thing goes in the bag.
                          The image column is `image_url` everywhere else in this
                          app, and a line item written before the shop had photos
                          simply has none -- hence the fallback rather than a
                          broken image.
                        */}
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="size-12 md:size-14 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="size-12 md:size-14 shrink-0 rounded-lg bg-[var(--border)]/40"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--ink)] text-sm md:text-base truncate">{item.name}</p>
                          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Qty: {item.quantity}</p>
                          {/*
                            The choices and the note, on the shop's own copy of the
                            order.

                            This list showed the dish name, the quantity and the price,
                            and nothing else -- so a customer who asked for the rice
                            done differently, or picked one drink over another, gave
                            the kitchen no way of knowing. The customer is shown both
                            on their side, but a note the shop cannot read is a note
                            that was never said.
                          */}
                          {Array.isArray(item.customizations) && item.customizations.length > 0 && (
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {item.customizations
                                .map((c: any) => c.optionName)
                                .join(" · ")}
                            </p>
                          )}
                          {item.note && (
                            <p className="text-xs text-[var(--amber-ink)]">
                              Note: {item.note}
                            </p>
                          )}
                        </div>
                        <p className="font-bold text-[var(--ink)] text-sm md:text-base flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/*
                 * The GCash screenshot and the Accept Order action.
                 *
                 * Placed above the money breakdown on purpose: confirming is
                 * the shop's next action on a pending order, and it cannot be
                 * done from a number. They have to see the transfer first.
                 *
                 * Confirmation is gated on the screenshot being present. The
                 * write is itself guarded on the order still being `pending`
                 * (see confirmOrderPayment), so two people tapping at once
                 * cannot both record a confirmation -- but blocking it here
                 * too means the shop is never offered a button that cannot
                 * work.
                 */}
                <div className="rounded-2xl border-2 border-line p-4">
                  <h3 className="font-bold text-[var(--ink)] mb-1 text-sm md:text-base">
                    Payment
                  </h3>
                  <p className="text-xs md:text-sm text-[var(--muted-foreground)] mb-3">
                    ₱{(selectedOrder.total - selectedOrder.deliveryFee).toFixed(2)} by GCash, ₱{selectedOrder.deliveryFee.toFixed(2)} delivery fee in cash to the rider.
                  </p>

                  {selectedOrder.paymentProofUrl ? (
                    <FullSizeImagePreview
                      src={selectedOrder.paymentProofUrl}
                      alt={`GCash payment proof for order ${selectedOrder.orderNumber}`}
                      className="block overflow-hidden rounded-xl border border-line"
                    >
                      <img src={selectedOrder.paymentProofUrl} alt="" className="max-h-64 w-full cursor-zoom-in object-cover" />
                      <p className="bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                        Tap to view full size
                      </p>
                    </FullSizeImagePreview>
                  ) : (
                    <p className="rounded-xl bg-[var(--amber-soft)] px-3 py-2.5 text-xs text-[var(--amber-ink)]">
                      No payment proof was attached. Check with the customer before accepting.
                    </p>
                  )}

                  {selectedOrder.paymentConfirmedAt ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--success-ink)]">
                      <CheckCircle className="size-4" aria-hidden="true" />
                      Payment confirmed
                      {selectedOrder.paymentConfirmedBy
                        ? ` by ${selectedOrder.paymentConfirmedBy}`
                        : ''}
                    </p>
                  ) : (
                    /*
                     * The confirm button that used to live here has moved into
                     * "Start preparing" below. What is left is the reason that
                     * button cannot be pressed yet -- no proof was attached -- and
                     * the shop still needs to be told it before it reaches for the
                     * one that will not work.
                     */
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Not confirmed yet. Checking the transfer is part of tapping{" "}
                      <span className="font-semibold text-[var(--ink)]">Start preparing</span>.
                    </p>
                  )}

                  {paymentError && (
                    <p role="alert" className="mt-2 text-xs text-[var(--error)]">
                      {paymentError}
                    </p>
                  )}
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
                  <div className="mt-2 md:mt-3 flex flex-wrap gap-2">
                    <Badge className="bg-[var(--success)] text-white text-xs md:text-sm">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Paid by GCash
                    </Badge>
                    {/* The rider collects this part in cash. It was folded
                        into the COD badge before, which read as though the
                        whole order was unpaid -- the food had already been
                        transferred. */}
                    <Badge className="border-[var(--amber)] text-[var(--amber)] text-xs md:text-sm" variant="outline">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Delivery fee: cash to rider
                    </Badge>
                  </div>
                </div>

                {/* Accept starts preparation. Delivery orders can then request a driver. */}
                {(selectedOrder.status === 'pending' || selectedOrder.status === 'payment-confirmed') && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        if (selectedOrder.status === 'pending') setConfirmAction('accept');
                        else void handleAcceptOrder(selectedOrder);
                      }}
                      disabled={isAcceptingOrder || isUpdatingStatus}
                      title="Accept this order and start preparation"
                      className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-4 md:py-6 font-bold text-sm md:text-base disabled:opacity-50"
                    >
                      Accept Order
                    </Button>
                    {selectedOrder.status === 'pending' && (
                      <Button
                        onClick={() => setShowDeclinePrompt(true)}
                        variant="outline"
                        className="w-full border-[var(--primary)] text-[var(--primary)] py-4 md:py-6 text-sm md:text-base"
                      >
                        Decline Order
                      </Button>
                    )}
                  </div>
                )}

                {(selectedOrder.status === 'preparing' || selectedOrder.status === 'ready') &&
                  selectedOrder.deliveryMode === 'delivery' &&
                  !selectedOrder.driverRequested && !selectedOrder.driverName && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-3 md:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--ink)]">Food Ordered <span className="text-[var(--error)]">Required</span></p>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Take a clear photo of the food order. Drivers will see it in the route preview.</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => packagePhotoInputRef.current?.click()}
                            disabled={isPostingDelivery || isUpdatingStatus}
                            className="min-h-10 shrink-0 border-[var(--border)] px-3 text-xs font-bold text-[var(--ink)]"
                          >
                            <Camera className="mr-1.5 size-4" aria-hidden="true" />
                            {packagePhotoFile || selectedOrder.restaurantPackagePhotoUrl ? 'Retake photo' : 'Take photo'}
                          </Button>
                        </div>
                        <input
                          ref={packagePhotoInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePackagePhotoChange}
                          className="sr-only"
                          aria-label="Take a photo of the food order"
                        />
                        {packagePhotoPreviewUrl || selectedOrder.restaurantPackagePhotoUrl ? (
                          <img
                            src={packagePhotoPreviewUrl || selectedOrder.restaurantPackagePhotoUrl || undefined}
                            alt={`Food order ${selectedOrder.orderNumber}`}
                            className="mt-3 max-h-64 w-full rounded-xl border border-[var(--border)] object-contain"
                          />
                        ) : (
                          <div className="mt-3 flex min-h-24 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-center text-xs text-[var(--muted-foreground)]">
                            <Camera className="size-4 shrink-0" aria-hidden="true" />
                            No food photo yet
                          </div>
                        )}
                        {packagePhotoError && (
                          <p role="alert" className="mt-2 text-xs font-semibold text-[var(--error)]">{packagePhotoError}</p>
                        )}
                      </div>
                      <Button
                        onClick={() => void handleAssignDriver(selectedOrder)}
                        disabled={isPostingDelivery || isUpdatingStatus || (!packagePhotoFile && !selectedOrder.restaurantPackagePhotoUrl)}
                        className="w-full bg-[var(--info)] hover:bg-[var(--info)] py-4 md:py-6 font-bold text-sm md:text-base disabled:opacity-50"
                      >
                        {isUploadingPackagePhoto ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Saving food photo...
                          </>
                        ) : isPostingDelivery ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Assigning driver...
                          </>
                        ) : (
                          'Assign Driver'
                        )}
                      </Button>
                    </div>
                )}
                {selectedOrder.deliveryMode === 'delivery' &&
                  (selectedOrder.status === 'confirmed' || selectedOrder.driverRequested || selectedOrder.driverName) && (
                  <div className="space-y-2">
                    {/*
                     * The gap between "we asked" and "someone is coming".
                     *
                     * This branch was empty, so the shop handed the order over and
                     * the sheet went blank — no word on whether a rider was being
                     * looked for, and none on who had answered, because nothing on
                     * this screen could tell. It now says which of the two it is, and
                     * names the rider the moment there is one, so waiting for
                     * someone and seeing who arrive are separate pieces of news
                     * rather than one silent pause.
                     */}
                    {isFindingRider(selectedOrder) ? (
                      <div className="flex items-start gap-3 rounded-xl border border-[var(--amber)] bg-[var(--amber-soft)] p-3 md:p-4">
                        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-[var(--amber)]" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="font-bold text-[var(--amber-ink)]">Finding a driver…</p>
                          <p className="mt-1 text-xs text-[var(--amber-ink)]">
                            Sent to nearby drivers. This order updates by itself as
                            soon as one accepts it.
                          </p>
                        </div>
                      </div>
                    ) : selectedOrder.driverName ? (
                      <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-3 md:p-4">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--success-ink)]">
                          Driver assigned
                        </p>
                        <p className="mt-1 font-bold text-[var(--ink)]">{selectedOrder.driverName}</p>
                        {progress?.currentTitle && progress.currentStepIsRiderStep && (
                          <p className="mt-1 text-xs text-[var(--success-ink)]">{progress.currentTitle}</p>
                        )}
                        {progress?.riderMessage && (
                          <p className="mt-1 text-xs text-[var(--success-ink)]">&ldquo;{progress.riderMessage}&rdquo;</p>
                        )}
                      </div>
                    ) : null}
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
                          <MapTypeToggle />
                          {restaurantLocation && (
                            <MarkerF position={restaurantLocation} title="Restaurant" icon={createRestaurantMarkerIcon()} />
                          )}
                          <MarkerF
                            position={driverLocation}
                            title="Driver"
                            icon={createTricycleMarkerIcon()}
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
                              icon={createDropoffMarkerIcon({ size: 32 })}
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
                                  strokeColor: isRiderEnRouteToShop ? RIDE_MAP_PICKUP_COLOR : RIDE_MAP_DROPOFF_COLOR,
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

                    <div className="bg-[var(--amber-soft)] border-l-4 border-[var(--amber)] p-2 md:p-3 rounded text-sm">
                      <p className="font-semibold text-[var(--amber-ink)]">
                        {progress?.currentTitle ?? getStatusLabel(selectedOrder.status)}
                      </p>
                      {progress?.riderMessage && (
                        <p className="text-xs text-[var(--amber-ink)] mt-1">"{progress.riderMessage}"</p>
                      )}
                      {!progress?.riderMessage && progress?.currentStep && (
                        <p className="text-xs text-[var(--amber-ink)] mt-1">
                          {progress.currentStep.key === 'picked-up'
                            ? 'The driver has collected the order and is on the way to the customer.'
                            : progress.currentStep.description}
                        </p>
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

                {selectedOrder.deliveryProofUrl && (
                  <div className="rounded-2xl border-2 border-line p-4">
                    <h3 className="font-bold text-[var(--ink)] mb-3 text-sm md:text-base">
                      Proof of delivery
                    </h3>
                    <FullSizeImagePreview
                      src={selectedOrder.deliveryProofUrl}
                      alt={`Photo of order ${selectedOrder.orderNumber} being handed over${selectedOrder.driverName ? ` by ${selectedOrder.driverName}` : ''}`}
                      className="block overflow-hidden rounded-xl border border-line"
                    >
                      <img
                        src={selectedOrder.deliveryProofUrl}
                        alt=""
                        className="max-h-64 w-full cursor-zoom-in object-cover"
                      />
                      <p className="bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                        {selectedOrder.driverName ? `${selectedOrder.driverName}'s handover photo` : 'Handover photo'}
                        {' · '}Tap to view full size
                      </p>
                    </FullSizeImagePreview>
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

      {/*
       * The only confirmation left in the order flow.
       *
       * It used to stand in for three different things — accepting, packing,
       * handing to a rider — and was asked at every step of the workflow. Each of
       * those is the shop telling us what it has already decided, and a dialog that
       * only ever says "yes?" trains people to tap through it, which is the worst
       * possible habit to build around the one dialog that matters.
       *
       * This one stays because it is the exception: a statement about money that
       * has not arrived.
       */}
      {confirmAction === 'accept' && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-6 mx-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[var(--success-soft)]">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-extrabold text-[var(--ink)] mb-1">
              Accept this order and start preparing?
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-3">
              This confirms the GCash payment and moves the order to Preparing.
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Order #{selectedOrder.orderNumber}</p>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">{selectedOrder.customerName}</p>
            <p className="text-lg font-bold text-[var(--primary)] mb-4">₱{selectedOrder.total.toFixed(2)}</p>
            {/* Saying what is being confirmed, not just what is being clicked.
                With no screenshot attached the shop is vouching from the amount
                alone, which is a different claim from having checked a receipt. */}
            {!selectedOrder.paymentProofUrl && (
              <p className="mb-4 rounded-xl bg-[var(--amber-soft)] px-3 py-2 text-xs text-[var(--amber-ink)]">
                No payment proof attached. Check the transfer with the customer
                before accepting.
              </p>
            )}
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
                  // Closes only on success. A rejected write leaves the dialog up
                  // with the reason, rather than dismissing as though it landed.
                  const ok = await handleAcceptOrder(selectedOrder);
                  if (ok) setConfirmAction(null);
                }}
                disabled={isAcceptingOrder || isUpdatingStatus}
                className="flex-1 font-bold bg-[var(--success)] hover:bg-[var(--success)] disabled:opacity-50"
              >
                Accept Order
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
      {incomingDriverChat && (
        <FloatingChatHead
          headId={incomingDriverChat.conversationId}
          storageKey="trikeserve_chat_head_pos_business"
          peerAvatar={incomingDriverChat.peerAvatar}
          peerLabel={incomingDriverChat.peerName}
          unread={incomingDriverChat.unread}
          pulseKey={driverChatPulseKey}
          onOpen={() => toggleChatOverlay(incomingDriverChat.conversationId)}
        />
      )}
      </div>
  );
}
