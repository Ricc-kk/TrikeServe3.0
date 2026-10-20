import { ArrowLeft, Home as HomeIcon, Calendar, MessageCircle, User, UsersRound, Navigation, Search, ShoppingCart, ClipboardList, Package, MapPin, Flag, X, Check, Star } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import BottomNav from "../ui/BottomNav";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { supabase, supabaseHelpers, logAudit } from "../../../lib/supabase";
import { TerminalIconGlyph } from "../ui/TerminalIcon";
import { useState, useEffect, useRef } from "react";

const REPORT_CATEGORIES = [
  'Driver behavior',
  'Safety concern',
  'Overcharging / fare issue',
  'Route or navigation issue',
  'Vehicle condition',
  'Lost item',
  'Other',
];

interface OrderDisplay {
  id: string;
  orderNumber: string;
  restaurantName: string;
  restaurantImage: string;
  customerName: string;
  date: string;
  status: string;
  items: any[];
  total: number;
  createdAt: string;
}

interface RideDisplay {
  id: string;
  pickupLocation: string;
  pickupAddress: string;
  dropoffLocation: string;
  dropoffAddress: string;
  date: string;
  status: string;
  driverName?: string;
  driverRating?: string;
  amount: number;
  completedAt: string;
  rideType?: string;
  paymentMethod?: string;
  passengerCount?: number;
  driverId?: string;
  lobbyId?: string;
}

const ratedRidesStorageKey = (userId: string) => `trikeserve_rated_rides_${userId}`;

function loadRatedRideIds(userId?: string): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(ratedRidesStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function persistRatedRideId(userId: string, rideId: string) {
  const next = Array.from(new Set([...loadRatedRideIds(userId), rideId]));
  localStorage.setItem(ratedRidesStorageKey(userId), JSON.stringify(next));
}

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayOrders, setDisplayOrders] = useState<OrderDisplay[]>([]);
  const [displayRides, setDisplayRides] = useState<RideDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rides' | 'deliveries'>('rides');
  const [selectedActivityDetails, setSelectedActivityDetails] = useState<
    { type: 'ride'; item: RideDisplay } | { type: 'order'; item: OrderDisplay } | null
  >(null);
  // Report form state (rides only).
  const [reportRide, setReportRide] = useState<RideDisplay | null>(null);
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [rateRide, setRateRide] = useState<RideDisplay | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratedRideIds, setRatedRideIds] = useState<string[]>([]);
  const hasInitialActivityTab = useRef(false);

  const openReport = (ride: RideDisplay) => {
    setSelectedActivityDetails(null);
    setReportRide(ride);
    setReportCategory(REPORT_CATEGORIES[0]);
    setReportDescription('');
    setReportError(null);
    setReportSubmitted(false);
  };

  const closeReport = () => {
    setReportRide(null);
    setReportSubmitted(false);
    setReportError(null);
  };

  const openRate = (ride: RideDisplay) => {
    if (!ride.driverId) return;
    if (ratedRideIds.includes(ride.id)) return;
    setSelectedActivityDetails(null);
    setRateRide(ride);
    setSelectedRating(0);
    setRatingSubmitted(false);
    setRatingError(null);
  };

  const closeRate = () => {
    setRateRide(null);
    setRatingSubmitted(false);
    setSelectedRating(0);
    setRatingError(null);
  };

  const submitRideRating = async () => {
    if (!rateRide || !selectedRating || !user?.id || !rateRide.driverId) return;
    setRatingSubmitting(true);
    setRatingError(null);
    try {
      const { error } = await supabaseHelpers.rateDriver({
        driverId: rateRide.driverId,
        customerId: user.id,
        rating: selectedRating,
        lobbyId: rateRide.lobbyId,
      });
      if (error) throw error;
      persistRatedRideId(user.id, rateRide.id);
      setRatedRideIds((prev) => (prev.includes(rateRide.id) ? prev : [...prev, rateRide.id]));
      setRatingSubmitted(true);
    } catch (err) {
      console.error('[Activity] Failed to submit ride rating:', err);
      setRatingError('Could not submit your rating. Please try again.');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportRide) return;
    if (!reportDescription.trim()) {
      setReportError('Please describe what happened.');
      return;
    }
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      const { error } = await supabaseHelpers.createRideReport({
        rideId: reportRide.id,
        reporterId: user?.id,
        reporterName: user?.name,
        reporterEmail: user?.email,
        driverId: reportRide.driverId,
        driverName: reportRide.driverName,
        category: reportCategory,
        description: reportDescription.trim(),
        rideRoute: `${reportRide.pickupLocation} → ${reportRide.dropoffLocation}`,
      });
      if (error) throw error;
      logAudit({
        action: 'report_ride',
        actorRole: 'customer',
        entityType: 'ride_request',
        entityId: reportRide.id,
        summary: `Reported a ride: ${reportCategory}`,
        details: { category: reportCategory },
        actorEmail: user?.email,
        actorName: user?.name,
      });
      setReportSubmitted(true);
    } catch (err) {
      console.error('[Activity] Failed to submit ride report:', err);
      setReportError('Could not submit your report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const isDeliveryRide = (dbRide: any) => {
    const pickupLocation = (dbRide?.pickup_location || '').toString();
    return pickupLocation.startsWith('DELIVERY|');
  };

  // Fetch orders and rides from Supabase on component mount
  useEffect(() => {
    hasInitialActivityTab.current = false;
    setRatedRideIds(loadRatedRideIds(user?.id));
    loadActivityFromSupabase();
  }, [user?.id]);

  const loadActivityFromSupabase = async () => {
    try {
      setIsLoading(true);

      if (!user?.id) {
        console.log('[Activity] No user logged in');
        setDisplayOrders([]);
        setDisplayRides([]);
        setIsLoading(false);
        return;
      }

      console.log('[Activity] Loading activity from Supabase for customer:', user.id);

      // 1. LOAD FOOD ORDERS
      const { data: supabaseOrders, error: fetchOrderError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchOrderError) {
        console.error('[Activity] Error loading orders from Supabase:', fetchOrderError);
        setDisplayOrders([]);
      } else if (supabaseOrders && supabaseOrders.length > 0) {
        // Transform Supabase orders to display format
        const transformedOrders: OrderDisplay[] = supabaseOrders.map((dbOrder: any) => {
          // Safely parse items JSON
          let parsedItems = [];
          try {
            parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
          } catch (parseError) {
            console.error('[Activity] Error parsing items JSON for order', dbOrder.order_number, parseError);
            parsedItems = [];
          }

          return {
            id: dbOrder.id,
            orderNumber: dbOrder.order_number || 'Unknown',
            restaurantName: dbOrder.restaurant_name || 'Restaurant',
            restaurantImage: dbOrder.restaurant_image || '',
            customerName: dbOrder.customer_name || 'Customer',
            date: new Date(dbOrder.created_at).toLocaleString(),
            status: dbOrder.status || 'pending',
            items: parsedItems,
            total: dbOrder.total || 0,
            createdAt: dbOrder.created_at,
          };
        });

        console.log('[Activity] Loaded', transformedOrders.length, 'orders from Supabase');
        setDisplayOrders(transformedOrders);
      } else {
        console.log('[Activity] No orders in Supabase');
        setDisplayOrders([]);
      }

      // 2. LOAD COMPLETED RIDES FROM DATABASE
      const { data: completedRides, error: fetchRideError } = await supabase
        .from('ride_requests')
        .select('*')
        .eq('customer_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (fetchRideError) {
        console.error('[Activity] Error loading completed rides from Supabase:', fetchRideError);
        setDisplayRides([]);
      } else if (completedRides && completedRides.length > 0) {
        // Resolve driver names: collect unique driver_ids where driver_name is missing/generic
        const ridesWithoutName = completedRides.filter((r: any) => !r.driver_name || r.driver_name === 'Driver');
        const driverIds = [...new Set(ridesWithoutName.map((r: any) => r.driver_id || r.accepted_driver_id).filter(Boolean))] as string[];
        let driverNameMap: Record<string, string> = {};
        if (driverIds.length > 0) {
          const { data: drivers } = await supabase
            .from('users')
            .select('id, name')
            .in('id', driverIds);
          if (drivers) {
            drivers.forEach((d: any) => { driverNameMap[d.id] = d.name; });
          }
        }

        // Transform Supabase rides to display format
        const transformedRides: RideDisplay[] = completedRides
          .filter((dbRide: any) => !isDeliveryRide(dbRide))
          .map((dbRide: any) => {
          const resolvedDriverId = dbRide.driver_id || dbRide.accepted_driver_id || undefined;
          const resolvedName = (dbRide.driver_name && dbRide.driver_name !== 'Driver')
            ? dbRide.driver_name
            : (resolvedDriverId && driverNameMap[resolvedDriverId]) || dbRide.driver_name || 'Driver';
          return {
            id: dbRide.id,
            pickupLocation: dbRide.pickup_location || 'Pickup',
            pickupAddress: dbRide.pickup_address || '',
            dropoffLocation: dbRide.dropoff_location || 'Dropoff',
            dropoffAddress: dbRide.dropoff_address || '',
            date: new Date(dbRide.created_at).toLocaleString(),
            status: 'completed',
            driverName: resolvedName,
            driverRating: dbRide.driver_rating || '4.8',
            amount: dbRide.amount || 0,
            completedAt: dbRide.updated_at || dbRide.created_at,
            rideType: dbRide.ride_type || 'ride',
            paymentMethod: dbRide.payment_method || 'COD',
            passengerCount: dbRide.passenger_count || 1,
            driverId: resolvedDriverId,
            lobbyId: dbRide.lobby_id || undefined,
          };
        });

        console.log('[Activity] Loaded', transformedRides.length, 'completed rides from Supabase');
        setDisplayRides(transformedRides);
      } else {
        console.log('[Activity] No completed rides in Supabase');
        setDisplayRides([]);
      }

      // Open on whichever category has the newest activity, so a freshly
      // placed food order is visible instead of leaving the customer on Rides.
      if (!hasInitialActivityTab.current) {
        const latestOrderAt = supabaseOrders?.[0]?.created_at
          ? new Date(supabaseOrders[0].created_at).getTime()
          : -Infinity;
        const latestRide = completedRides?.find((ride: any) => !isDeliveryRide(ride));
        const latestRideAt = latestRide?.created_at ? new Date(latestRide.created_at).getTime() : -Infinity;
        setActiveTab((supabaseOrders?.length || 0) > 0 && latestOrderAt >= latestRideAt ? 'deliveries' : 'rides');
        hasInitialActivityTab.current = true;
      }
    } catch (error) {
      console.error('[Activity] Exception loading activity:', error);
      setDisplayOrders([]);
      setDisplayRides([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Keep Activity current if an order is placed while this screen is open, or
  // when the customer switches back to the app after checkout.
  useEffect(() => {
    if (!user?.id) return;
    const refreshActivity = (payload?: { eventType?: string }) => {
      if (payload?.eventType === 'INSERT') setActiveTab('deliveries');
      void loadActivityFromSupabase();
    };
    const channel = supabase
      .channel(`customer-activity-orders-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `customer_id=eq.${user.id}`,
      }, refreshActivity)
      .subscribe();
    window.addEventListener('focus', refreshActivity);
    return () => {
      window.removeEventListener('focus', refreshActivity);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'text-[var(--amber)] bg-[var(--amber-soft)]';
      case 'on-the-way':
        return 'text-[var(--info)] bg-[var(--info-soft)]';
      case 'delivered':
        return 'text-[var(--success)] bg-[var(--success-soft)]';
      case 'cancelled':
        return 'text-[var(--error)] bg-[var(--error-soft)]';
      default:
        return 'text-[var(--muted-foreground)] bg-[var(--muted)]';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'Preparing';
      case 'on-the-way':
        return 'On the way';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-[calc(6rem+env(safe-area-inset-bottom))] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-4xl px-4 pt-5 sm:px-8 sm:pt-8">
      {/* Tab Buttons */}
      <div className="mb-5">
        <div className="flex gap-2 rounded-2xl border border-line bg-surface p-1.5 sm:gap-3">
          <button
            aria-pressed={activeTab === 'rides'}
            onClick={() => setActiveTab('rides')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
              activeTab === 'rides'
                ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/25'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-line'
            }`}
          >
            <Navigation className={`w-5 h-5 ${activeTab === 'rides' ? 'text-white' : 'text-[var(--info)]'}`} />
            <span>Rides</span>
            {displayRides.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'rides' ? 'bg-white/20 text-white' : 'bg-[var(--border)] text-[var(--muted-foreground)]'
              }`}>
                {displayRides.length}
              </span>
            )}
          </button>
          <button
            aria-pressed={activeTab === 'deliveries'}
            onClick={() => setActiveTab('deliveries')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
              activeTab === 'deliveries'
                ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/25'
                : 'bg-[var(--muted)] text-[var(--muted-foreground)] border border-line'
            }`}
          >
            <Package className={`w-5 h-5 ${activeTab === 'deliveries' ? 'text-white' : 'text-[var(--success)]'}`} />
            <span>Deliveries</span>
            {displayOrders.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'deliveries' ? 'bg-white/20 text-white' : 'bg-[var(--border)] text-[var(--muted-foreground)]'
              }`}>
                {displayOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content Section */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-[var(--ink)]">{activeTab === 'rides' ? 'Your ride history' : 'Your delivery history'}</h2>
        {isLoading ? (
          <div className="text-center py-8">
            <Package className="w-8 h-8 text-[var(--info)] mx-auto animate-bounce" />
            <p className="text-[var(--muted-foreground)] mt-2">Loading activity...</p>
          </div>
        ) : activeTab === 'rides' ? (
          <div>
            {displayRides.length > 0 ? (
              <div className="space-y-4">
                {displayRides.map((ride) => {
                  const alreadyRated = ratedRideIds.includes(ride.id);
                  const canRate = Boolean(ride.driverId) && !alreadyRated;
                  return (
                  <Card
                    key={ride.id}
                    className="gap-0 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6"
                  >
                    <button type="button" onClick={() => setSelectedActivityDetails({ type: 'ride', item: ride })} className="flex w-full items-start gap-3 text-left">
                      {/* Ride Icon */}
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${ride.rideType === 'share' ? 'bg-[var(--info-soft)]' : 'bg-[var(--primary-soft)]'}`}>
                        {ride.rideType === 'share' ? (
                          <UsersRound className="w-6 h-6 text-[var(--info)]" />
                        ) : (
                          <TerminalIconGlyph className="w-6 h-6 text-[var(--primary)]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-nowrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="mb-1 truncate whitespace-nowrap text-sm font-semibold text-[var(--ink)] sm:text-base">
                              {ride.pickupLocation} → {ride.dropoffLocation}
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-xs text-[var(--muted-foreground)]">{ride.date}</p>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ride.rideType === 'share' ? 'text-[var(--info)] bg-[var(--info-soft)]' : 'text-[var(--primary)] bg-[var(--primary-soft)]'}`}>
                                {ride.rideType === 'share' ? 'Share Ride' : 'Private Ride'}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 whitespace-nowrap text-right">
                            <p className="text-lg font-bold text-[var(--ink)]">₱{ride.amount}</p>
                            <p className="text-xs text-[var(--success)] font-semibold">Completed</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[var(--primary)]">Tap to view details</span>
                      </div>
                    </button>

                  </Card>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-line bg-surface px-5 py-12 text-center sm:py-16">
                <div className="w-24 h-24 bg-[var(--muted)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Navigation className="w-12 h-12 text-[var(--muted-foreground)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--ink)] mb-2">No Rides Yet</h3>
                <p className="text-[var(--muted-foreground)] mb-6">Book a ride to see your ride history here.</p>
                <Link to="/customer">
                  <Button className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold py-3 px-6 rounded-2xl">
                    Book a Ride
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div>
            {displayOrders.length > 0 ? (
              <div className="space-y-4">
                {displayOrders.map((order) => {
                  return (
                  <Card key={order.id} className="gap-0 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6">
                    <Link to={`/customer/order-detail/${order.id}`} className="flex w-full items-start gap-3 text-left">
                      {/* Restaurant Image */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <ImageWithFallback
                          src={order.restaurantImage}
                          alt={order.restaurantName}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1">                            <h3 className="font-semibold text-[var(--ink)] text-sm sm:text-base mb-1 line-clamp-1">
                                {order.restaurantName}
                              </h3>
                            <p className="text-xs text-[var(--muted-foreground)] mb-2">{order.date}</p>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                {getStatusText(order.status)}
                              </span>
                              <span className="text-xs text-[var(--muted-foreground)]">• {order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-[var(--ink)]">₱{order.total}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">#{order.orderNumber}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[var(--primary)]">Tap to view details</span>
                      </div>
                    </Link>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-line bg-surface px-5 py-12 text-center sm:py-16">
                <div className="w-24 h-24 bg-[var(--muted)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-12 h-12 text-[var(--muted-foreground)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--ink)] mb-2">No Orders Yet</h3>
                <p className="text-[var(--muted-foreground)] mb-6">Order food to see your delivery history here.</p>
                <Link to="/customer/food">
                  <Button className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold py-3 px-6 rounded-2xl">
                    Browse Food
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      </div>
      {selectedActivityDetails && (
        <div
          className="fixed inset-0 z-[1900] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelectedActivityDetails(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="activity-details-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-line p-5">
              <h2 id="activity-details-title" className="text-lg font-bold text-[var(--ink)]">
                {selectedActivityDetails.type === 'ride' ? 'Ride details' : 'Delivery details'}
              </h2>
              <button type="button" aria-label="Close activity details" onClick={() => setSelectedActivityDetails(null)} className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]">
                <X className="size-5 text-[var(--muted-foreground)]" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {selectedActivityDetails.type === 'ride' ? (() => {
                const ride = selectedActivityDetails.item;
                const alreadyRated = ratedRideIds.includes(ride.id);
                return (
                  <>
                    <div className="rounded-2xl bg-[var(--muted)] p-4">
                      <p className="break-words font-bold text-[var(--ink)]">{ride.pickupLocation} → {ride.dropoffLocation}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{ride.date}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--success)]">Completed</span>
                        <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--primary)]">{ride.rideType === 'share' ? 'Share Ride' : 'Private Ride'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-line p-3"><p className="text-xs text-[var(--muted-foreground)]">Fare</p><p className="mt-1 font-bold text-[var(--ink)]">₱{ride.amount}</p></div>
                      <div className="rounded-xl border border-line p-3"><p className="text-xs text-[var(--muted-foreground)]">Payment</p><p className="mt-1 font-bold text-[var(--ink)]">{ride.paymentMethod === 'GCASH' ? 'GCash prepaid' : 'Cash'}</p></div>
                      {ride.passengerCount && <div className="rounded-xl border border-line p-3"><p className="text-xs text-[var(--muted-foreground)]">Passengers</p><p className="mt-1 font-bold text-[var(--ink)]">{ride.passengerCount}</p></div>}
                    </div>
                    <div className="space-y-3 rounded-2xl border border-line p-4 text-sm">
                      <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" /><span className="min-w-0"><span className="font-semibold text-[var(--ink)]">Pickup</span><br />{ride.pickupAddress || ride.pickupLocation}</span></p>
                      <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-[var(--error)]" /><span className="min-w-0"><span className="font-semibold text-[var(--ink)]">Drop-off</span><br />{ride.dropoffAddress || ride.dropoffLocation}</span></p>
                    </div>
                    <div className="rounded-2xl border border-line p-4 text-sm">
                      <p className="text-xs text-[var(--muted-foreground)]">Driver</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-[var(--ink)]">
                        <span>{ride.driverName || 'Driver'}</span>
                        {ride.driverRating && ride.driverRating !== 'Driver' && (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold">
                            <Star className="size-3.5 fill-[var(--amber)] text-[var(--amber)]" aria-hidden="true" />
                            {ride.driverRating}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {!alreadyRated && ride.driverId && <Button type="button" onClick={() => openRate(ride)} className="min-h-11 rounded-xl bg-[var(--primary)] px-4 font-bold text-white">Rate driver</Button>}
                      {alreadyRated && <span className="self-center text-xs font-bold text-[var(--success)]">Thanks for rating this driver</span>}
                      <Button type="button" variant="ghost" onClick={() => openReport(ride)} className="min-h-11 rounded-xl px-4 text-[var(--error)]">Report ride</Button>
                    </div>
                  </>
                );
              })() : (() => {
                const order = selectedActivityDetails.item;
                return (
                  <>
                    <div className="rounded-2xl bg-[var(--muted)] p-4">
                      <p className="break-words font-bold text-[var(--ink)]">{order.restaurantName}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{order.date}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusColor(order.status)}`}>{getStatusText(order.status)}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">Order #{order.orderNumber}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-line p-4">
                      <p className="mb-3 text-sm font-bold text-[var(--ink)]">Items in this order</p>
                      {order.items.length > 0 ? (
                        <ul className="space-y-3">
                          {order.items.map((item, index) => (
                            <li key={`${order.id}-modal-item-${index}`} className="flex justify-between gap-3 text-sm">
                              <span className="min-w-0 break-words text-[var(--ink)]">{item?.name || item?.product_name || item?.title || 'Item'}<span className="block text-xs text-[var(--muted-foreground)]">Qty: {item?.quantity || item?.qty || 1}</span></span>
                              {item?.price != null && <span className="shrink-0 font-semibold text-[var(--ink)]">₱{(Number(item.price) * Number(item.quantity || item.qty || 1)).toFixed(2)}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-[var(--muted-foreground)]">No item details available.</p>}
                      <div className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-bold text-[var(--ink)]"><span>Total</span><span>₱{order.total}</span></div>
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => { setSelectedActivityDetails(null); navigate(`/customer/order-detail/${order.id}`); }} className="min-h-11 rounded-xl bg-[var(--primary)] px-4 font-bold text-white">Open order details</Button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Report Ride Modal */}
      {reportRide && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--ink)]">Report this ride</h3>
              <button aria-label="Close ride report" onClick={closeReport} className="grid size-11 place-items-center hover:bg-[var(--muted)] rounded-full transition-colors">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            {reportSubmitted ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7 text-[var(--success)]" />
                </div>
                <h4 className="text-base font-bold text-[var(--ink)]">Report submitted</h4>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  Our admin team will review it. Thank you for helping keep TrikeServe safe.
                </p>
                <button
                  onClick={closeReport}
                  className="mt-5 w-full py-3.5 bg-[var(--primary)] text-white font-bold rounded-2xl active:scale-95 transition-transform"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submitReport} className="p-5 space-y-4">
                <div className="p-3 rounded-xl bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
                  <p className="font-semibold text-[var(--ink)] truncate">
                    {reportRide.pickupLocation} → {reportRide.dropoffLocation}
                  </p>
                  <p className="mt-0.5">Driver: {reportRide.driverName || 'Driver'} · {reportRide.date}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--muted-foreground)] mb-1.5">What went wrong?</label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line bg-surface text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                  >
                    {REPORT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--muted-foreground)] mb-1.5">Details</label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={4}
                    placeholder="Tell us what happened..."
                    className="w-full p-3 rounded-xl border border-line bg-surface text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)] resize-none"
                  />
                </div>

                {reportError && <p className="text-xs text-[var(--error)]">{reportError}</p>}

                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="w-full py-3.5 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isSubmittingReport ? 'Submitting...' : 'Submit report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Rate Driver Modal — same star picker as delivered orders */}
      {rateRide && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--ink)]">Rate this ride</h3>
              <button aria-label="Close ride rating" onClick={closeRate} className="grid size-11 place-items-center hover:bg-[var(--muted)] rounded-full transition-colors">
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>

            {ratingSubmitted ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="size-7 text-[var(--success)]" aria-hidden="true" />
                </div>
                <h4 className="text-base font-bold text-[var(--ink)]">Thank you!</h4>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  Your rating for {rateRide.driverName || 'your driver'} has been saved.
                </p>
                <button
                  onClick={closeRate}
                  className="mt-5 w-full py-3.5 bg-[var(--primary)] text-white font-bold rounded-2xl active:scale-95 transition-transform"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-5">
                <div className="p-3 rounded-xl bg-[var(--muted)] text-xs text-[var(--muted-foreground)] mb-4">
                  <p className="font-semibold text-[var(--ink)] truncate">
                    {rateRide.pickupLocation} → {rateRide.dropoffLocation}
                  </p>
                  <p className="mt-0.5">Driver: {rateRide.driverName || 'Driver'} · {rateRide.date}</p>
                </div>
                <div className="flex items-center gap-2 mb-2 justify-center">
                  <Star className="w-5 h-5 text-[var(--amber)] fill-[var(--amber)]" />
                  <h4 className="font-bold text-[var(--ink)]">Rate {rateRide.driverName || 'your driver'}</h4>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mb-3 text-center">How was your ride?</p>
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSelectedRating(star)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star className={`w-8 h-8 ${star <= selectedRating ? 'fill-[var(--amber)] text-[var(--amber)]' : 'fill-[var(--border)] text-[var(--border)]'}`} />
                    </button>
                  ))}
                </div>
                {ratingError && <p className="text-xs text-[var(--error)] text-center mb-2">{ratingError}</p>}
                <button
                  type="button"
                  onClick={submitRideRating}
                  disabled={!selectedRating || ratingSubmitting || !rateRide.driverId}
                  className="w-full py-3.5 bg-[var(--primary)] text-white font-bold rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
                >
                  {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav active="activity" />
    </div>
  );
}
