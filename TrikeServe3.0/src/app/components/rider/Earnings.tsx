import { useState, useEffect } from "react";
import { ArrowLeft, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import ActiveRideButton from "./ActiveRideButton";

interface CompletedTrip {
  id: string;
  type: string;
  date: string;
  amount: number;
  payment: 'Cash' | 'Prepaid';
  customerName?: string;
}

export default function Earnings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [completedTrips, setCompletedTrips] = useState<CompletedTrip[]>([]);
  const [tripsCompletedCount, setTripsCompletedCount] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [driverRating, setDriverRating] = useState<string>('—');
  const [driverRatingCount, setDriverRatingCount] = useState(0);
  const [filterTab, setFilterTab] = useState<'all' | 'rides' | 'deliveries'>('all');

  // Fetch completed rides from database and localStorage
  useEffect(() => {
    const fetchCompletedTrips = async () => {
      setIsLoading(true);
      try {
        // Get completed rides from database for this driver
        const { data: dbRides, error: dbError } = await supabaseHelpers.getRideRequests({
          driverId: user?.id,
          status: 'completed'
        });

        if (dbError) {
          console.error('❌ Error fetching completed rides from database:', dbError);
        }

        // Also fetch completed delivery orders assigned to this driver
        let dbOrders: any[] = [];
        try {
          const { data: orders, error: ordersErr } = await supabase
            .from('orders')
            .select('*')
            .eq('driver_name', user?.name || 'Driver')
            .eq('status', 'delivered');
          if (!ordersErr && orders) dbOrders = orders;
          else if (ordersErr) console.warn('[Earnings] Orders query error:', ordersErr.message);
        } catch (e) {
          console.warn('[Earnings] Orders query failed:', e);
        }

        // Also check localStorage for recently completed rides
        const historyKey = `ride_history_${user?.id}`;
        const historyData = localStorage.getItem(historyKey);
        let localRides: any[] = [];
        if (historyData) {
          try {
            localRides = JSON.parse(historyData).filter((r: any) => r.status === 'completed');
          } catch (error) {
            console.error('❌ Error parsing ride history:', error);
          }
        }

        // Combine database rides and local rides, remove duplicates
        const allRides = [...(dbRides || []), ...localRides];
        const uniqueRides = Array.from(new Map(allRides.map(ride => [ride.id, ride])).values());

        // Convert delivery orders to trip format
        const deliveryTrips = dbOrders.map((order: any) => ({
          id: order.id,
          ride_type: 'delivery',
          type: 'delivery',
          amount: Number(order.delivery_fee || 0),
          payment_method: order.payment_method,
          customer_name: order.customer_name,
          pickup_location: order.restaurant_name || 'Restaurant',
          dropoff_location: (order.address || '').split('|')[0].trim() || order.address || 'Customer Address',
          status: 'completed',
          updated_at: order.updated_at,
          completed_at: order.updated_at,
        }));

        // Merge and deduplicate
        const allTrips = [...uniqueRides, ...deliveryTrips];
        const dedupedTrips = Array.from(new Map(allTrips.map(t => [t.id, t])).values());

        // Format rides for display
        const formattedRides = dedupedTrips
          .map((ride: any) => {
            let type = 'Private Ride';
            const rt = (ride.ride_type || ride.type || '').toLowerCase();
            const isDelivery = rt === 'delivery' || String(ride.pickup_location || '').startsWith('DELIVERY|');
            if (isDelivery) type = 'Delivery';
            else if (rt === 'share' || rt === 'shared') type = 'Ride Share';

            // Prefer the completion timestamp. The DB sets updated_at on completion and
            // may not set a dedicated completed_at column, so include it in the fallback chain.
            const dateObj = ride.completedAt || ride.completed_at || ride.updated_at || ride.acceptedAt || ride.accepted_at || new Date();
            // Keep an ISO timestamp for reliable period math (avoid locale-sensitive parsing).
            // Use a safe parse: toISOString() throws on malformed dates, so fall back to now.
            let dateISO = new Date().toISOString();
            try {
              dateISO = typeof dateObj === 'string' ? new Date(dateObj).toISOString() : dateObj.toISOString();
            } catch (e) {
              console.warn('[Earnings] Invalid trip date, using current time:', dateObj);
            }

            // Parse pickup/dropoff locations
            const rawPickup = ride.pickup_location || '';
            const rawDropoff = ride.dropoff_location || '';
            let pickup = rawPickup.startsWith('DELIVERY|') ? rawPickup.split('|').pop() || 'Restaurant' : rawPickup;
            let dropoff = rawDropoff;
            // For delivery orders, try to get restaurant name from the tag
            if (rawPickup.startsWith('DELIVERY|')) {
              const parts = rawPickup.split('|');
              const restaurantName = parts.filter((p: string) => !p.startsWith('ORDER_ID:') && !p.startsWith('ORDER_NO:') && p !== 'DELIVERY').join('');
              if (restaurantName) pickup = restaurantName;
            }

            return {
              id: ride.id,
              type: type,
              date: dateISO,
              amount: Number(ride.amount) || 0,
              payment: ((ride.payment_method || ride.payment) === 'COD' ? 'Cash' : 'Prepaid') as 'Cash' | 'Prepaid',
              customerName: ride.customer_name || ride.customerName || 'Customer',
              pickup: pickup || 'Pickup',
              dropoff: dropoff || 'Drop-off',
            };
          })
          .sort((a, b) => {
            try {
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            } catch {
              return 0;
            }
          });

        setCompletedTrips(formattedRides);
        setTripsCompletedCount(formattedRides.length);

        // Calculate earnings by time period
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let todayTotal = 0;
        let weekTotal = 0;
        let monthTotal = 0;

        formattedRides.forEach((trip) => {
          try {
            const tripDate = new Date(trip.date);
            const tripAmount = trip.amount || 0;

            if (tripDate >= today) {
              todayTotal += tripAmount;
            }
            if (tripDate >= weekStart) {
              weekTotal += tripAmount;
            }
            if (tripDate >= monthStart) {
              monthTotal += tripAmount;
            }
          } catch (error) {
            console.error('Error calculating earnings:', error);
          }
        });

        setTodayEarnings(todayTotal);
        setWeekEarnings(weekTotal);
        setMonthEarnings(monthTotal);

        console.log('✅ Fetched completed trips:', {
          count: formattedRides.length,
          todayEarnings: todayTotal,
          weekEarnings: weekTotal,
          monthEarnings: monthTotal
        });
      } catch (error) {
        console.error('❌ Error fetching completed trips:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchCompletedTrips();
    }
  }, [user?.id]);

  // Fetch the driver's own average rating from driver_ratings
  useEffect(() => {
    if (!user?.id) return;
    supabaseHelpers.getDriverRating(user.id).then(({ average, count }: { average: number | null; count: number }) => {
      setDriverRating(average != null ? average.toFixed(1) : '—');
      setDriverRatingCount(count);
    });
  }, [user?.id]);

  // Total earnings = sum of ALL completed trips (today/week/month overlap, so adding
  // those buckets together would triple-count trips). Used for Total Earnings and Avg per Trip.
  const totalEarnings = completedTrips.reduce((sum, trip) => sum + (trip.amount || 0), 0);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
            My Earnings
          </h1>
          <p className="text-xs text-[#64748B]">Track your income</p>
        </div>

      </div>

      <div className="p-4 space-y-4">
        {/* Summary Cards Carousel */}
        <div className="earnings-carousel -mx-4 -mt-2">
          <Slider
            dots={true}
            infinite={true}
            speed={500}
            slidesToShow={1}
            slidesToScroll={1}
            arrows={false}
            swipeToSlide={true}
            touchThreshold={10}
            centerMode={false}
            variableWidth={true}
          >
            {/* Today Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">Today</p>
                <p className="text-4xl font-extrabold mb-2">₱{todayEarnings.toFixed(2)}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>{completedTrips.filter(t => {
                    const tripDate = new Date(t.date);
                    const today = new Date();
                    return tripDate.toDateString() === today.toDateString();
                  }).length} trips today</span>
                </div>
              </Card>
            </div>

            {/* This Week Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">This Week</p>
                <p className="text-4xl font-extrabold mb-2">₱{weekEarnings.toFixed(2)}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>{completedTrips.filter(t => {
                    const tripDate = new Date(t.date);
                    const weekStart = new Date();
                    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                    return tripDate >= weekStart;
                  }).length} trips this week</span>
                </div>
              </Card>
            </div>

            {/* This Month Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">This Month</p>
                <p className="text-4xl font-extrabold mb-2">₱{monthEarnings.toFixed(2)}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>{completedTrips.filter(t => {
                    const tripDate = new Date(t.date);
                    const monthStart = new Date();
                    monthStart.setDate(1);
                    return tripDate >= monthStart;
                  }).length} trips this month</span>
                </div>
              </Card>
            </div>
          </Slider>
        </div>

        {/* Quick Stats */}
        <Card className="p-5 bg-white border-0 shadow-sm">
          <h3 className="font-extrabold text-[#121212] mb-4" style={{ fontSize: '18px' }}>Overall Performance</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Trips Completed</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">{tripsCompletedCount}</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Total Earnings</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">₱{totalEarnings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Avg. per Trip</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">
                {tripsCompletedCount > 0 ? `₱${(totalEarnings / tripsCompletedCount).toFixed(2)}` : '₱0'}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Today's Total</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">₱{todayEarnings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Driver Rating</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">
                {driverRating === '—' ? '—' : `⭐ ${driverRating}`}
              </p>
              <p className="text-xs text-[#64748B]">
                {driverRatingCount > 0 ? `${driverRatingCount} rating${driverRatingCount > 1 ? 's' : ''}` : 'No ratings yet'}
              </p>
            </div>
          </div>
        </Card>

        {/* Recent Trips */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#121212]" style={{ fontSize: '18px' }}>Recent Trips</h3>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {(['all', 'rides', 'deliveries'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  filterTab === tab
                    ? 'bg-[#E11D48] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B]'
                }`}
              >
                {tab === 'all' ? `All (${completedTrips.length})` : tab === 'rides' ? `Rides (${completedTrips.filter(t => t.type !== 'Delivery').length})` : `Deliveries (${completedTrips.filter(t => t.type === 'Delivery').length})`}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Card className="p-4 bg-white border-0 shadow-sm">
              <p className="text-center text-[#64748B]">Loading completed trips...</p>
            </Card>
          ) : completedTrips.length === 0 ? (
            <Card className="p-4 bg-white border-0 shadow-sm">
              <p className="text-center text-[#64748B]">No completed trips yet. Start accepting rides to see your recent trips here!</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedTrips
                .filter(trip => {
                  if (filterTab === 'rides') return trip.type !== 'Delivery';
                  if (filterTab === 'deliveries') return trip.type === 'Delivery';
                  return true;
                })
                .slice(0, 20)
                .map((trip) => (
                <Card key={trip.id} className={`bg-white border-0 shadow-sm overflow-hidden ${
                  trip.type === 'Delivery' ? 'border-l-4 border-l-[#3B82F6]' :
                  trip.type === 'Ride Share' ? 'border-l-4 border-l-[#F59E0B]' :
                  'border-l-4 border-l-[#10B981]'
                }`}>
                  <div className="p-4">
                    {/* Top row: type + amount */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                          trip.type === 'Delivery' ? 'bg-[#DBEAFE]' :
                          trip.type === 'Ride Share' ? 'bg-[#FEF3C7]' :
                          'bg-[#F0FDF4]'
                        }`}>
                          {trip.type === 'Delivery' ? '📦' : trip.type === 'Ride Share' ? '👥' : '👤'}
                        </div>
                        <div>
                          <p className="font-bold text-[#121212] text-sm">{trip.type}</p>
                          <p className="text-[10px] text-[#94A3B8]">{new Date(trip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(trip.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold text-lg text-[#E11D48]">₱{trip.amount.toFixed(2)}</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] rounded-full ${trip.payment === 'Cash' ? 'border-[#F97316] text-[#F97316]' : 'border-green-500 text-green-500'}`}
                        >
                          {trip.payment === 'Cash' ? '💵 Cash' : '💳 GCash'}
                        </Badge>
                      </div>
                    </div>

                    {/* Customer name */}
                    {trip.customerName && trip.customerName !== 'Customer' && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[#F8FAFC] rounded-lg">
                        <span className="text-sm">👤</span>
                        <p className="text-xs font-semibold text-[#121212]">{trip.customerName}</p>
                      </div>
                    )}

                    {/* Pickup & Dropoff with vertical connector */}
                    {(trip.pickup || trip.dropoff) && (
                      <div className="flex items-stretch gap-2 mt-1">
                        <div className="flex flex-col items-center pt-1">
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                          <div className="w-0.5 flex-1 bg-gray-200 my-0.5" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#E11D48] shrink-0" />
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          {trip.pickup && (
                            <div>
                              <p className="text-[10px] text-green-600 font-bold uppercase">Pickup</p>
                              <p className="text-xs text-[#121212] truncate">{trip.pickup}</p>
                            </div>
                          )}
                          {trip.dropoff && (
                            <div>
                              <p className="text-[10px] text-[#E11D48] font-bold uppercase">Drop-off</p>
                              <p className="text-xs text-[#121212] truncate">{trip.dropoff}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Active Ride Floating Button */}
      <ActiveRideButton />
    </div>
  );
}