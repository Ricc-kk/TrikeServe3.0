import { ArrowLeft, Home as HomeIcon, Calendar, MessageCircle, User, Users, Navigation, Search, ShoppingCart, ClipboardList, Package, MapPin, Flag, X, Check } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import BottomNav from "../ui/BottomNav";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { supabase, supabaseHelpers, logAudit } from "../../../lib/supabase";
import { useState, useEffect } from "react";

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
}

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayOrders, setDisplayOrders] = useState<OrderDisplay[]>([]);
  const [displayRides, setDisplayRides] = useState<RideDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rides' | 'deliveries'>('rides');
  // Report form state (rides only).
  const [reportRide, setReportRide] = useState<RideDisplay | null>(null);
  const [reportCategory, setReportCategory] = useState(REPORT_CATEGORIES[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const openReport = (ride: RideDisplay) => {
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
    loadActivityFromSupabase();
  }, [user]);

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
        const driverIds = [...new Set(ridesWithoutName.map((r: any) => r.driver_id).filter(Boolean))] as string[];
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
          const resolvedName = (dbRide.driver_name && dbRide.driver_name !== 'Driver')
            ? dbRide.driver_name
            : (dbRide.driver_id && driverNameMap[dbRide.driver_id]) || dbRide.driver_name || 'Driver';
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
            driverId: dbRide.driver_id || undefined,
          };
        });

        console.log('[Activity] Loaded', transformedRides.length, 'completed rides from Supabase');
        setDisplayRides(transformedRides);
      } else {
        console.log('[Activity] No completed rides in Supabase');
        setDisplayRides([]);
      }
    } catch (error) {
      console.error('[Activity] Exception loading activity:', error);
      setDisplayOrders([]);
      setDisplayRides([]);
    } finally {
      setIsLoading(false);
    }
  };

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
    <div className="min-h-screen bg-surface pb-24">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Activity</h1>
      </div>

      {/* Tab Buttons */}
      <div className="px-4 sm:px-5 mb-4 sm:mb-5">
        <div className="flex gap-2 sm:gap-3">
          <button
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
      <div className="px-4 sm:px-5">
        {isLoading ? (
          <div className="text-center py-8">
            <Package className="w-8 h-8 text-[var(--info)] mx-auto animate-bounce" />
            <p className="text-[var(--muted-foreground)] mt-2">Loading activity...</p>
          </div>
        ) : activeTab === 'rides' ? (
          <div>
            {displayRides.length > 0 ? (
              <div className="space-y-3">
                {displayRides.map((ride) => (
                  <Card key={ride.id} className="p-3.5 sm:p-4 border border-line shadow-sm">
                    <div className="flex items-start gap-3">
                      {/* Ride Icon */}
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${ride.rideType === 'share' ? 'bg-[var(--info-soft)]' : 'bg-[var(--primary-soft)]'}`}>
                        {ride.rideType === 'share' ? (
                          <Users className="w-6 h-6 text-[var(--info)]" />
                        ) : (
                          <Navigation className="w-6 h-6 text-[var(--primary)]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-[var(--ink)] text-xs sm:text-sm mb-1 line-clamp-2">
                              {ride.pickupLocation} → {ride.dropoffLocation}
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-xs text-[var(--muted-foreground)]">{ride.date}</p>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ride.rideType === 'share' ? 'text-[var(--info)] bg-[var(--info-soft)]' : 'text-[var(--primary)] bg-[var(--primary-soft)]'}`}>
                                {ride.rideType === 'share' ? 'Share Ride' : 'Private Ride'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-[var(--ink)]">₱{ride.amount}</p>
                            <p className="text-xs text-[var(--success)] font-semibold">Completed</p>
                          </div>
                        </div>

                        {/* Ride Details */}
                        <div className="flex items-center gap-3 mb-2 text-xs text-[var(--muted-foreground)]">
                          <span className="flex items-center gap-1">
                            {ride.paymentMethod === 'GCASH' ? '💳' : '💵'} {ride.paymentMethod === 'GCASH' ? 'Prepaid' : 'Cash'}
                          </span>
                          {ride.passengerCount && ride.passengerCount > 1 && (
                            <span className="flex items-center gap-1">
                              👤 {ride.passengerCount} passengers
                            </span>
                          )}
                        </div>

                        {/* Location Details */}
                        <div className="space-y-1 text-xs text-[var(--muted-foreground)] mb-2">
                          <p className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--ink)]" />
                            <span><span className="font-semibold text-[var(--ink)]">Pickup:</span> {ride.pickupAddress || ride.pickupLocation}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--primary)]" />
                            <span><span className="font-semibold text-[var(--ink)]">Drop-off:</span> {ride.dropoffAddress || ride.dropoffLocation}</span>
                          </p>
                        </div>

                        {/* Driver Info + Report */}
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-[var(--muted-foreground)] min-w-0">
                            👤 Driver: <span className="font-semibold text-[var(--ink)]">{ride.driverName || 'Driver'}</span>
                            {ride.driverRating && ride.driverRating !== 'Driver' && <span> • ⭐ {ride.driverRating}</span>}
                          </p>
                          <button
                            onClick={() => openReport(ride)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--error)] text-[var(--error)] text-[11px] font-bold hover:bg-[var(--error-soft)] active:scale-95 transition-all flex-shrink-0"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            Report
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
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
              <div className="space-y-3">
                {displayOrders.map((order) => (
                  <Card key={order.id} className="p-3.5 sm:p-4 border border-line shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
                    <div onClick={() => navigate(`/customer/order-detail/${order.id}`)} className="flex items-start gap-3">
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
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">                            <h3 className="font-semibold text-[var(--ink)] text-xs sm:text-sm mb-1 line-clamp-1">
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
                        {order.status === 'delivered' && (
                          <p className="text-xs font-bold text-[var(--primary)] mt-2">⭐ Tap to rate this restaurant</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
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

      {/* Report Ride Modal */}
      {reportRide && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--ink)]">Report this ride</h3>
              <button onClick={closeReport} className="p-1.5 hover:bg-[var(--muted)] rounded-full transition-colors">
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

      {/* Bottom Navigation */}
      <BottomNav active="activity" />
    </div>
  );
}
