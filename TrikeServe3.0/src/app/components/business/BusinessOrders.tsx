import { useState, useEffect, useRef } from "react";
import { Store, Package, Clock, User, CheckCircle, XCircle, AlertCircle, Menu, Navigation, MessageCircle, Loader2 } from "lucide-react";
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

/** A run of skipped pages, drawn as an ellipsis rather than a button. */
const PAGE_GAP = -1;

/**
 * Which page numbers to draw, and where the gaps go.
 *
 * First and last are always shown, plus the current page and two either side of
 * it. Two rather than one because being able to see page 50 in a window of 48-52
 * is what tells someone they are deep in the list; a window of 49-51 in a list of
 * 99 says the same thing with less to look at.
 *
 * A gap of exactly one page is drawn as that page instead of an ellipsis. "1 2 3 …
 * 5" is strictly worse than "1 2 3 4 5" -- it spends the same room hiding a single
 * number that was perfectly well able to fit.
 */
function pageWindow(current: number, pageCount: number): number[] {
  // Seven or fewer is small enough to just list.
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const kept = new Set<number>([1, pageCount]);
  for (let p = current - 2; p <= current + 2; p++) {
    if (p >= 1 && p <= pageCount) kept.add(p);
  }

  const sorted = [...kept].sort((a, b) => a - b);
  const out: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const jump = sorted[i] - sorted[i - 1];
      if (jump === 2) out.push(sorted[i] - 1);
      else if (jump > 2) out.push(PAGE_GAP);
    }
    out.push(sorted[i]);
  }

  return out;
}

/**
 * Page controls for a long order list.
 *
 * Renders nothing at all when there is a single page, so a shop with six orders is
 * never shown furniture for a problem it does not have.
 *
 * The four arrows are the ones a reader will actually reach for on a long list:
 * first, previous, next, last. Numbered pages cover the middle, because a shop with
 * ninety pages of orders is looking for one it has seen before rather than the one
 * after the current.
 *
 * The jump box is there for the same reason. When someone knows the order is on
 * page 60, walking there 60 times is not a reasonable thing to ask of them, and
 * they should not have to know it is on page 60 in order to ask.
 */
function OrderPagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  /*
   * The typed page. Kept as a string because an <input> mid-edit is allowed to be
   * nonsense -- "1" on the way to "19" -- and clamping on every keystroke would
   * fight the person typing. It is only interpreted when they commit it.
   */
  const [draft, setDraft] = useState(String(page));

  // Follow the page when it moves for a reason other than typing.
  useEffect(() => setDraft(String(page)), [page]);

  // Declared before the early return below; hooks cannot be conditional.
  const pages = pageWindow(page, pageCount);

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    // A jump past either end lands on the end rather than on nothing.
    onChange(Math.min(Math.max(next, 1), pageCount));
  };

  const commitDraft = () => {
    const wanted = Number.parseInt(draft, 10);
    if (Number.isFinite(wanted)) go(wanted);
  };

  const arrow =
    'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent';
  const numberButton =
    'grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold tabular-nums transition-colors';

  return (
    <nav
      aria-label="Order pages"
      className="flex flex-wrap items-center justify-center gap-1 pt-2 pb-1"
    >
      <button type="button" onClick={() => go(1)} disabled={page === 1}
        aria-label="First page" className={arrow}>
        <span aria-hidden="true">«</span>
      </button>

      <button type="button" onClick={() => go(page - 1)} disabled={page === 1}
        aria-label="Previous page" className={arrow}>
        <span aria-hidden="true">‹</span>
      </button>

      {pages.map((p, i) =>
        p === PAGE_GAP ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="grid h-8 w-6 shrink-0 place-items-center text-xs text-[var(--muted-foreground)]"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={`${numberButton} ${
              p === page
                ? 'bg-[var(--primary)] text-white'
                : 'border border-line text-[var(--ink)] hover:bg-[var(--muted)]'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button type="button" onClick={() => go(page + 1)} disabled={page === pageCount}
        aria-label="Next page" className={arrow}>
        <span aria-hidden="true">›</span>
      </button>

      <button type="button" onClick={() => go(pageCount)} disabled={page === pageCount}
        aria-label="Last page" className={arrow}>
        <span aria-hidden="true">»</span>
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          commitDraft();
        }}
        className="ml-1 flex shrink-0 items-center gap-1.5"
      >
        <label htmlFor="order-page-jump" className="text-xs text-[var(--muted-foreground)]">
          Go to
        </label>
        <input
          id="order-page-jump"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          className="h-8 w-12 rounded-lg border border-line bg-surface px-2 text-center text-xs font-bold tabular-nums text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none"
        />
      </form>
    </nav>
  );
}

interface Order {
  id: string;
  orderNumber: string;
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
   * is what the shop is checking when it taps Confirm Payment.
   */
  paymentProofUrl?: string | null;
  paymentProofUploadedAt?: string | null;
  /** Who verified the transfer, and when. */
  paymentConfirmedAt?: string | null;
  paymentConfirmedBy?: string | null;
  /** The rider's photo at handover. */
  deliveryProofUrl?: string | null;
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
  /** The one dialog left in this flow: confirming the GCash payment. */
  const [confirmAction, setConfirmAction] = useState<'payment' | null>(null);
  // Decline collects a reason before the order is cancelled.
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  // Confirming the GCash transfer. Its own flag and message because it is the
  // one action on this screen that can legitimately fail on a busy shop -- two
  // people, or a double tap -- and a silent no-op there looks like the button
  // is broken.
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
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
   * Only the rider fields are copied. Status is deliberately left alone, because
   * `updateOrderStatus` sets it optimistically and this runs on a five-second
   * cadence — re-syncing it would stamp out from under the button the shop is
   * holding, and re-show a step they already completed.
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
        o.driverMessage === fresh.driverMessage
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
      };
    });
  }, [orders, selectedOrder?.id]);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Prevent refresh during update
  /*
   * Posting the rider request after "Ready for Delivery".
   *
   * Separate from `isUpdatingStatus`, which only guards the polling loop and is
   * never shown. This one is what the button reads while it works, so the shop can
   * see the press was taken rather than pressing again.
   */
  const [isPostingDelivery, setIsPostingDelivery] = useState(false);
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
          restaurantName: dbOrder.restaurant_name || undefined,
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
         * an open request was invisible here, so between "Ready for Delivery" and a
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

  const filteredActiveOrders =
    selectedStatusFilter === 'all'
      ? [...activeOrders].sort(byNewestFirst)
      : activeOrders.filter((o) => o.status === selectedStatusFilter).sort(byNewestFirst);

  const sortedHistoryOrders = [...historyOrders].sort(byNewestFirst);

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
  const historyPageCount = Math.max(1, Math.ceil(historyOrders.length / PAGE_SIZE));
  const activePage = Math.min(rawActivePage, activePageCount);
  const historyPage = Math.min(rawHistoryPage, historyPageCount);

  const pagedActiveOrders = filteredActiveOrders.slice(
    (activePage - 1) * PAGE_SIZE,
    activePage * PAGE_SIZE,
  );
  const pagedHistoryOrders = sortedHistoryOrders.slice(
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
  }, [selectedTab, selectedStatusFilter]);

  /**
   * Shop: the GCash transfer has arrived and been checked.
   *
   * Moves the order to `payment-confirmed`, which is what releases the Accept
   * action -- the order cannot be cooked until the money for it is accounted
   * for. It then reloads rather than patching the local row, because the write
   * is guarded on `status = 'pending'` and a row this screen still believes is
   * pending is exactly the case where the guard rejected it.
   */
  /**
   * Confirm the GCash transfer. Its own step, with its own confirmation.
   *
   * This is the one place in the order flow where a popup is right. Everywhere
   * else -- Start Preparing, Ready for Pickup, Ready for Delivery -- the shop is
   * telling us something it already decided to do, and asking it to agree twice
   * only put a dialog between the shop and its own customer. Checking someone's
   * transfer is different: it is a statement about money that has not arrived, and
   * it is the only step whose wrong answer cannot be undone by cooking the food.
   *
   * Returns whether it worked, so the confirmation can stay open on a failure
   * rather than closing over a rejected write.
   */
  const handleConfirmPayment = async (order: Order) => {
    setIsConfirmingPayment(true);
    setPaymentError(null);

    const result = await supabaseHelpers.confirmOrderPayment(order.id, user?.email);

    if (!result.success) {
      setPaymentError(result.error || 'Could not confirm this payment.');
      setIsConfirmingPayment(false);
      return false;
    }

    // Tell the customer their money landed. Nothing else does this: the delivery
    // notifications only fire from the rider's screen, so without it the customer
    // is left watching a tracker that has not moved.
    try {
      await supabaseHelpers.notifyBusinessOrderStatusChange({
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantName: order.restaurantName,
        status: 'payment-confirmed',
      });
    } catch (notifyError) {
      console.error('[BusinessOrders] Failed to notify customer of payment:', notifyError);
    }

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

    // Reload rather than patch the row: the write is guarded on `status = 'pending'`
    // and a row this screen still believes is pending is exactly the case where the
    // guard rejected it.
    await loadOrders();
    setIsConfirmingPayment(false);

    setSelectedOrder((o) =>
      o
        ? {
            ...o,
            status: 'payment-confirmed' as Order['status'],
            paymentConfirmedAt: o.paymentConfirmedAt ?? new Date().toISOString(),
          }
        : o,
    );
    return true;
  };

  /**
   * Start preparing. No confirmation, and no payment check.
   *
   * The money was confirmed in its own step above, and re-deciding it here would
   * mean the shop agrees twice to the same thing. It also refuses to run on an
   * unpaid order: the button only exists for a paid one, so this is belt and
   * braces rather than a second gate.
   */
  const handleStartPreparing = async (order: Order) => {
    if (!order.paymentConfirmedAt) {
      setPaymentError('Confirm the GCash payment before starting this order.');
      return;
    }

    await updateOrderStatus(order.id, 'preparing');

    setSelectedOrder((o) =>
      o ? { ...o, status: 'preparing' as Order['status'] } : o,
    );
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

    // Same reason as loadOrders: the pickup label belongs to the account that owns
    // the order, and the context user is the one this screen was admitted for.
    const pickupLabel = order.restaurantName || user?.businessName || 'Restaurant Pickup';
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

  /**
   * "Ready for Delivery": post the ride request, then move the order on.
   *
   * The status used to change *after* everything the request needs, and one of
   * those things is a Google Geocoding HTTP call for the restaurant's address. That
   * left the order sitting on "Ready for Pickup" for a second or more with no
   * change and no indication anything had happened — which is indistinguishable
   * from the tap not registering, and is exactly how a button gets pressed three
   * times and posts three delivery requests.
   *
   * So the order moves first, optimistically, and the request is posted behind it.
   * The shop sees the order advance the instant they tap, and the posting runs on
   * with a spinner while it finishes. If the request genuinely fails the status is
   * put back, because an order marked "Ready for Delivery" with no rider request
   * behind it will never be collected.
   */
  const handleReadyForDelivery = async (order: Order) => {
    console.log('[BusinessOrders] Ready for Delivery clicked for order:', order.orderNumber);

    if (isPostingDelivery) return;
    setIsPostingDelivery(true);

    // Move the order now, not after the geocoder answers.
    await updateOrderStatus(order.id, 'confirmed');
    setSelectedOrder((o) => (o ? { ...o, status: 'confirmed' as Order['status'] } : o));

    const didCreateRequest = await createOpenDeliveryRequest(order);

    if (!didCreateRequest) {
      // Put it back so the shop can try again. The order is back on the button
      // that posts the request, with the reason shown by the failure path.
      await updateOrderStatus(order.id, 'ready');
      setSelectedOrder((o) => (o ? { ...o, status: 'ready' as Order['status'] } : o));
      setIsPostingDelivery(false);
      return;
    }

    setIsPostingDelivery(false);
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
    !!order && order.status === 'confirmed' && !order.driverName;

  const orderStatusLabel = (order: Order | null) => {
    if (!order) return '';
    if (isFindingRider(order)) return 'Finding Rider';
    if (order.status === 'confirmed' && order.driverName) return 'Rider Assigned';
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
                 Awaiting Payment ({activeOrders.filter(o => o.status === 'pending').length})
                </button>
               <button
                 onClick={() => setSelectedStatusFilter('payment-confirmed')}
                 className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                   selectedStatusFilter === 'payment-confirmed'
                     ? 'bg-[var(--primary)] text-white'
                     : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]'
                 }`}
                >
                 Paid ({activeOrders.filter(o => o.status === 'payment-confirmed').length})
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
        {/* Tighter list spacing.

            The rows were separated by a full card's worth of padding on every
            side, so six orders filled two screens and only the order number and
            the status were above the fold. Everything here is about the same
            information in less space: one gap between rows, one inside the row,
            and the meta line beside the price instead of under it. */}
        <div className="px-3 md:px-5 py-3 md:py-4 space-y-1.5 md:space-y-2 pb-6">
          {selectedTab === 'active' ? (
            filteredActiveOrders.length > 0 ? (
              <>
                {pagedActiveOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="p-2.5 md:p-3 border border-line active:scale-[0.98] transition-transform cursor-pointer"
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
                <OrderPagination
                  page={activePage}
                  pageCount={activePageCount}
                  onChange={setRawActivePage}
                />
              </>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-12 md:w-16 h-12 md:h-16 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm md:text-base text-[var(--muted-foreground)]">No active orders</p>
              </div>
            )
          ) : (
            historyOrders.length > 0 ? (
              <>
                {pagedHistoryOrders.map((order) => (
                <Card
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="p-3 md:p-4 border border-line opacity-75 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-3 mb-3">
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
                ))}
                <OrderPagination
                  page={historyPage}
                  pageCount={historyPageCount}
                  onChange={setRawHistoryPage}
                />
              </>
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
                <Badge className={`${orderStatusColor(selectedOrder)} text-white`}>
                  {progress?.currentStepIsRiderStep && progress.riderHasStarted
                    ? progress.currentTitle
                    : orderStatusLabel(selectedOrder)}
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
                        </div>
                        <p className="font-bold text-[var(--ink)] text-sm md:text-base flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/*
                 * The GCash screenshot, and the Confirm Payment action.
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
                    <a
                      href={selectedOrder.paymentProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-xl border border-line"
                    >
                      <img
                        src={selectedOrder.paymentProofUrl}
                        alt={`GCash payment proof for order ${selectedOrder.orderNumber}`}
                        className="max-h-64 w-full cursor-zoom-in object-cover"
                      />
                      <p className="bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
                        Tap to view full size
                      </p>
                    </a>
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

                {/* Action Buttons - Complete Workflow */}
                {/*
                 * Payment is a step of its own, and the only one that asks before
                 * it acts.
                 *
                 * Everything past it -- Start Preparing, Ready for Pickup, Ready for
                 * Delivery -- is the shop reporting what it has already decided to
                 * do: the food is cooking, it is packed, the rider is on the way.
                 * None of those ask, so the order moves on the tap it was given.
                 *
                 * Confirmable without a screenshot. The customer can order without
                 * attaching one, so gating this button on the proof left those orders
                 * stuck in `pending` with no way out except cancelling a customer who
                 * had already paid. The absence is surfaced in the confirmation
                 * dialog instead -- the shop is told it is vouching from the amount
                 * rather than from a receipt, which is a weaker claim and should feel
                 * like one.
                 *
                 * Decline stays available on an unpaid order: a customer who never
                 * transferred should not be able to hold a slot open.
                 */}
                {selectedOrder.status === 'pending' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setConfirmAction('payment')}
                      disabled={isConfirmingPayment}
                      title="Confirms the GCash payment for this order"
                      className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-4 md:py-6 font-bold text-sm md:text-base disabled:opacity-50"
                    >
                      ✓ Confirm Payment
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

                {selectedOrder.status === 'payment-confirmed' && (
                  <div className="space-y-2">
                    <Button
                      onClick={() => handleStartPreparing(selectedOrder)}
                      className="w-full bg-[var(--success)] hover:bg-[var(--success)] py-4 md:py-6 font-bold text-sm md:text-base"
                    >
                      ✓ Start Preparing
                    </Button>
                  </div>
                )}

                {selectedOrder.status === 'preparing' && (
                  <div className="space-y-2">
                    <Button
                      onClick={async () => {
                        await updateOrderStatus(selectedOrder.id, 'ready');
                        setSelectedOrder((o) =>
                          o ? { ...o, status: 'ready' as Order['status'] } : o,
                        );
                      }}
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
                        onClick={() => handleReadyForDelivery(selectedOrder)}
                        disabled={isPostingDelivery}
                        className="w-full bg-[var(--info)] hover:bg-[var(--info)] py-4 md:py-6 font-bold text-sm md:text-base"
                      >
                        {/* Says what is happening while the rider request posts. The
                            order has already moved on by this point, so without this
                            the button would simply vanish and leave no trace that it
                            had ever been pressed. */}
                        {isPostingDelivery ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Posting to riders…
                          </>
                        ) : (
                          "→ Ready for Delivery"
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {selectedOrder.status === 'confirmed' && (
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
                          <p className="font-bold text-[var(--amber-ink)]">Finding a rider…</p>
                          <p className="mt-1 text-xs text-[var(--amber-ink)]">
                            Sent to the riders nearby. This order updates by itself as
                            soon as one accepts it.
                          </p>
                        </div>
                      </div>
                    ) : selectedOrder.driverName ? (
                      <div className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-3 md:p-4">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--success-ink)]">
                          Rider assigned
                        </p>
                        <p className="mt-1 font-bold text-[var(--ink)]">{selectedOrder.driverName}</p>
                        {progress?.currentTitle && progress.currentStepIsRiderStep && (
                          <p className="mt-1 text-xs text-[var(--success-ink)]">{progress.currentTitle}</p>
                        )}
                        {selectedOrder.driverMessage && (
                          <p className="mt-1 text-xs text-[var(--success-ink)]">&ldquo;{selectedOrder.driverMessage}&rdquo;</p>
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
      {confirmAction === 'payment' && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[3000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-6 mx-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[var(--success-soft)]">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-extrabold text-[var(--ink)] mb-1">
              Confirm this GCash payment?
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">Order #{selectedOrder.orderNumber}</p>
            <p className="text-sm text-[var(--muted-foreground)] mb-1">{selectedOrder.customerName}</p>
            <p className="text-lg font-bold text-[var(--primary)] mb-4">₱{selectedOrder.total.toFixed(2)}</p>
            {/* Saying what is being confirmed, not just what is being clicked.
                With no screenshot attached the shop is vouching from the amount
                alone, which is a different claim from having checked a receipt. */}
            {!selectedOrder.paymentProofUrl && (
              <p className="mb-4 rounded-xl bg-[var(--amber-soft)] px-3 py-2 text-xs text-[var(--amber-ink)]">
                No payment proof attached. Check the transfer with the customer
                before you confirm.
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
                  const ok = await handleConfirmPayment(selectedOrder);
                  if (ok) setConfirmAction(null);
                }}
                className="flex-1 font-bold bg-[var(--success)] hover:bg-[var(--success)]"
              >
                Confirm
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
      </div>
  );
}
