import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, TrendingUp, Calendar } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { supabase } from "../../../utils/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { AnalyticsBarChart, AnalyticsDonutChart, type BarDatum, type DonutDatum } from "../ui/AnalyticsCharts";
import ActiveRideButton from "./ActiveRideButton";

interface TripHistoryItem {
  id: string;
  type: string;
  date: string;
  amount: number;
  status: 'completed' | 'cancelled';
  payment: 'Cash' | 'Prepaid';
  customerName?: string;
  pickup?: string;
  dropoff?: string;
  dropoffs?: string[];
}

export default function Earnings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [completedTrips, setCompletedTrips] = useState<TripHistoryItem[]>([]);
  const [recentTrips, setRecentTrips] = useState<TripHistoryItem[]>([]);
  const [tripsCompletedCount, setTripsCompletedCount] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [weekEarnings, setWeekEarnings] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [driverRating, setDriverRating] = useState<string>('—');
  const [driverRatingCount, setDriverRatingCount] = useState(0);
  const [filterTab, setFilterTab] = useState<'all' | 'rides' | 'deliveries'>('all');

  // Fetch completed and cancelled ride history; only completed trips count as earnings.
  useEffect(() => {
    const fetchCompletedTrips = async () => {
      setIsLoading(true);
      try {
        // Load both statuses for Recent Trips. The completed-only collection below
        // remains the source for earnings and trip-completion analytics.
        const [
          { data: dbRides, error: dbError },
          { data: dbCancelledRides, error: cancelledDbError },
        ] = await Promise.all([
          supabaseHelpers.getRideRequests({ driverId: user?.id, status: 'completed' }),
          supabaseHelpers.getRideRequests({ driverId: user?.id, status: 'cancelled' }),
        ]);

        if (dbError) {
          console.error('❌ Error fetching completed rides from database:', dbError);
        }
        if (cancelledDbError) {
          console.error('❌ Error fetching cancelled rides from database:', cancelledDbError);
        }

        // Shared ride cancellations live on the lobby row rather than a
        // ride_requests row, so load cancelled lobbies assigned to this driver.
        let dbCancelledLobbies: any[] = [];
        try {
          const { data: cancelledLobbies, error: lobbiesError } = await supabase
            .from('shared_ride_lobbies')
            .select('id, pickup_location, dropoff_location, payment_method, created_at, updated_at')
            .eq('driver_id', user?.id)
            .eq('status', 'cancelled');
          if (lobbiesError) console.error('❌ Error fetching cancelled shared rides:', lobbiesError);
          else dbCancelledLobbies = (cancelledLobbies || []).map((lobby: any) => ({
            ...lobby,
            ride_type: 'share',
            status: 'cancelled',
            amount: 0,
            cancelled_at: lobby.updated_at || lobby.created_at,
          }));
        } catch (error) {
          console.error('❌ Cancelled shared ride lookup failed:', error);
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
            const history = JSON.parse(historyData);
            localRides = (Array.isArray(history) ? history : []).filter((ride: any) =>
              ['completed', 'cancelled', 'canceled'].includes(String(ride.status || '').toLowerCase()),
            );
          } catch (error) {
            console.error('❌ Error parsing ride history:', error);
          }
        }

        // Local history is a fallback; prefer the current database status when
        // both sources contain the same ride so a stale cache can't undo a cancel.
        const ridesById = new Map<string, any>();
        [...localRides, ...(dbRides || []), ...(dbCancelledRides || []), ...dbCancelledLobbies].forEach((ride: any) => {
          if (ride?.id) ridesById.set(String(ride.id), ride);
        });
        const uniqueRides = Array.from(ridesById.values());

        // Shared rides now have one customer-facing ride_requests row per
        // account. Those rows share driver_id and created_at, so collapse the
        // set back into one trip for driver earnings and trip counts.
        const ridesForDriver: any[] = [];
        const sharedRideRows = new Map<string, any>();
        uniqueRides.forEach((ride: any) => {
          const rideType = String(ride.ride_type || ride.type || '').toLowerCase();
          const rideStatus = String(ride.status || '').toLowerCase();
          const driverId = String(ride.driver_id || ride.accepted_driver_id || '');
          const createdAt = String(ride.created_at || '');
          if (!['share', 'shared'].includes(rideType) || rideStatus !== 'completed' || !driverId || !createdAt) {
            ridesForDriver.push(ride);
            return;
          }

          const sharedRideKey = `${driverId}:${createdAt}`;
          const existingRide = sharedRideRows.get(sharedRideKey);
          if (existingRide) {
            existingRide.amount = Math.round(((Number(existingRide.amount) || 0) + (Number(ride.amount) || 0)) * 100) / 100;
            existingRide.passenger_count = (Number(existingRide.passenger_count) || 0) + (Number(ride.passenger_count) || 0);
            const dropoff = String(ride.dropoff_location || '').trim();
            const dropoffKey = dropoff.toLowerCase();
            const dropoffs: string[] = Array.isArray(existingRide.dropoff_locations)
              ? existingRide.dropoff_locations
              : [existingRide.dropoff_location].filter(Boolean);
            if (dropoff && !dropoffs.some((destination) => String(destination).trim().toLowerCase() === dropoffKey)) {
              dropoffs.push(dropoff);
            }
            existingRide.dropoff_locations = dropoffs;
            return;
          }

          const initialDropoff = String(ride.dropoff_location || '').trim();
          const combinedRide = { ...ride, dropoff_locations: initialDropoff ? [initialDropoff] : [] };
          sharedRideRows.set(sharedRideKey, combinedRide);
          ridesForDriver.push(combinedRide);
        });

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
        const allTrips = [...ridesForDriver, ...deliveryTrips];
        const dedupedTrips = Array.from(new Map(allTrips.map(t => [t.id, t])).values());

        // Format rides for display
        const formattedRides: TripHistoryItem[] = dedupedTrips
          .map((ride: any) => {
            const normalizedStatus = String(ride.status || 'completed').trim().toLowerCase();
            const status: TripHistoryItem['status'] =
              normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' ? 'cancelled' : 'completed';
            let type = 'Private Ride';
            const rt = (ride.ride_type || ride.type || '').toLowerCase();
            const isDelivery = rt === 'delivery' || String(ride.pickup_location || '').startsWith('DELIVERY|');
            if (isDelivery) type = 'Delivery';
            else if (rt === 'share' || rt === 'shared') type = 'Ride Share';

            // Prefer the completion timestamp. The DB sets updated_at on completion and
            // may not set a dedicated completed_at column, so include it in the fallback chain.
            const dateObj = status === 'cancelled'
              ? ride.cancelledAt || ride.cancelled_at || ride.updated_at || ride.created_at || ride.acceptedAt || ride.accepted_at || new Date()
              : ride.completedAt || ride.completed_at || ride.updated_at || ride.acceptedAt || ride.accepted_at || new Date();
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
            const dropoffs: string[] = Array.from(new Set<string>(
              (Array.isArray(ride.dropoff_locations) ? ride.dropoff_locations : [rawDropoff])
                .map((destination: unknown) => String(destination || '').trim())
                .filter(Boolean),
            ));
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
              status,
              // Delivery earnings are the delivery fee, which the rider receives
              // in cash even when the customer's food payment was prepaid by GCash.
              payment: (isDelivery || (ride.payment_method || ride.payment) === 'COD' ? 'Cash' : 'Prepaid') as 'Cash' | 'Prepaid',
              customerName: ride.customer_name || ride.customerName || 'Customer',
              pickup: pickup || 'Pickup',
              dropoff: dropoff || dropoffs[0] || 'Drop-off',
              dropoffs,
            };
          })
          .sort((a, b) => {
            try {
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            } catch {
              return 0;
            }
          });

        const earnedTrips = formattedRides.filter((trip) => trip.status === 'completed');
        setRecentTrips(formattedRides);
        setCompletedTrips(earnedTrips);
        setTripsCompletedCount(earnedTrips.length);

        // Calculate earnings by time period
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let todayTotal = 0;
        let weekTotal = 0;
        let monthTotal = 0;

        earnedTrips.forEach((trip) => {
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

  // Earnings per day for the last 7 days, for the analytics chart.
  const weeklyEarnings = useMemo<BarDatum[]>(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data: BarDatum[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const total = completedTrips
        .filter((trip) => {
          const tripDate = new Date(trip.date);
          return tripDate >= date && tripDate < nextDate;
        })
        .reduce((sum, trip) => sum + (trip.amount || 0), 0);
      data.push({ label: labels[date.getDay()], value: Math.round(total) });
    }
    return data;
  }, [completedTrips]);

  // Completed trips split by service type.
  const tripsByType = useMemo<DonutDatum[]>(() => {
    let privateCount = 0;
    let shareCount = 0;
    let deliveryCount = 0;
    completedTrips.forEach((trip) => {
      if (trip.type === 'Delivery') deliveryCount += 1;
      else if (trip.type === 'Ride Share') shareCount += 1;
      else privateCount += 1;
    });
    return [
      { label: 'Private Ride', value: privateCount, color: 'var(--success)' },
      { label: 'Share Ride', value: shareCount, color: 'var(--amber)' },
      { label: 'Delivery', value: deliveryCount, color: 'var(--info)' },
    ];
  }, [completedTrips]);

  /**
   * Recent Trips includes completed and cancelled items. Day totals only include
   * completed earnings. Grouping happens after the tab filter and 20-trip cap.
   */
  const tripGroups = useMemo(() => {
    const filtered = recentTrips
      .filter((trip) => {
        if (filterTab === 'rides') return trip.type !== 'Delivery';
        if (filterTab === 'deliveries') return trip.type === 'Delivery';
        return true;
      })
      .slice(0, 20);

    const startOfDay = (date: Date) =>
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayTitle = (date: Date) => {
      const today = startOfDay(new Date());
      const day = startOfDay(date);
      if (day === today) return 'Today';
      if (day === today - 24 * 60 * 60 * 1000) return 'Yesterday';
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const groups: { key: string; title: string; total: number; items: TripHistoryItem[] }[] = [];
    filtered.forEach((trip) => {
      const date = new Date(trip.date);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      let group = groups.find((entry) => entry.key === key);
      if (!group) {
        group = { key, title: dayTitle(date), total: 0, items: [] };
        groups.push(group);
      }
      if (trip.status === 'completed') group.total += trip.amount || 0;
      group.items.push(trip);
    });
    return groups;
  }, [recentTrips, filterTab]);

  return (
    <div className="min-h-dvh bg-[var(--muted)] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-card border-b border-line px-4 py-3 flex items-center gap-3 sm:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to Driver Home" className="size-11 shrink-0 rounded-xl bg-soft" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[var(--primary)]" style={{ letterSpacing: '-0.02em' }}>
            My Earnings
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">Track your income</p>
        </div>

      </div>

      <main className="@container mx-auto grid max-w-6xl grid-cols-1 items-start gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-6">
        {/* Period summaries stay visible without a fixed-width carousel. */}
        <section aria-busy={isLoading} aria-label="Earnings summaries" className="grid min-w-0 grid-cols-1 gap-3 @min-[30rem]:grid-cols-3 sm:col-span-2">
            {/* Today Card */}
            <div className="min-w-0">
              <Card className="h-full gap-2 rounded-3xl bg-[var(--ink-solid)] p-5 text-white border-0">
                <p className="text-sm opacity-90 mb-1">Today</p>
                <p className="break-all text-3xl font-extrabold tracking-tight tabular-nums">₱{todayEarnings.toFixed(2)}</p>
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
            <div className="min-w-0">
              <Card className="h-full gap-2 rounded-3xl border border-line bg-[var(--teal-soft)] p-5 text-[var(--teal)]">
                <p className="text-sm opacity-90 mb-1">This Week</p>
                <p className="break-all text-3xl font-extrabold tracking-tight tabular-nums">₱{weekEarnings.toFixed(2)}</p>
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
            <div className="min-w-0">
              <Card className="h-full gap-2 rounded-3xl border border-line bg-card p-5 text-[var(--ink)]">
                <p className="text-sm opacity-90 mb-1">This Month</p>
                <p className="break-all text-3xl font-extrabold tracking-tight tabular-nums">₱{monthEarnings.toFixed(2)}</p>
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
        </section>

        {/* Quick Stats */}
        <Card className="min-w-0 gap-3 rounded-3xl border border-line bg-card p-5 sm:p-6">
          <h3 className="font-extrabold text-[var(--ink)] mb-4" style={{ fontSize: '18px' }}>Overall Performance</h3>
          <div className="grid grid-cols-2 gap-4 [&>div]:min-w-0 [&_p]:break-words">
            <div>
              <p className="text-sm text-[var(--info)] mb-1">Trips Completed</p>
              <p className="text-2xl font-extrabold text-[var(--primary)]">{tripsCompletedCount}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--info)] mb-1">Total Earnings</p>
              <p className="text-2xl font-extrabold text-[var(--primary)]">₱{totalEarnings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--info)] mb-1">Avg. per Trip</p>
              <p className="text-2xl font-extrabold text-[var(--primary)]">
                {tripsCompletedCount > 0 ? `₱${(totalEarnings / tripsCompletedCount).toFixed(2)}` : '₱0'}
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--info)] mb-1">Today's Total</p>
              <p className="text-2xl font-extrabold text-[var(--primary)]">₱{todayEarnings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--info)] mb-1">Driver Rating</p>
              <p className="text-2xl font-extrabold text-[var(--primary)]">
                {driverRating === '—' ? '—' : `⭐ ${driverRating}`}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {driverRatingCount > 0 ? `${driverRatingCount} rating${driverRatingCount > 1 ? 's' : ''}` : 'No ratings yet'}
              </p>
            </div>
          </div>
        </Card>

        {/* Analytics */}
        <Card className="min-w-0 gap-3 rounded-3xl border border-line bg-card p-5 sm:p-6">
          <h3 className="font-extrabold text-[var(--ink)] mb-1" style={{ fontSize: '18px' }}>Weekly Earnings</h3>
          <p className="text-xs text-[var(--muted-foreground)] mb-4">Last 7 days</p>
          <AnalyticsBarChart
            data={weeklyEarnings}
            color="var(--primary)"
            valuePrefix="₱"
            height={160}
            emptyHint="Complete trips to see your weekly earnings"
          />
        </Card>

        <Card className="min-w-0 gap-3 rounded-3xl border border-line bg-card p-5 sm:p-6">
          <h3 className="font-extrabold text-[var(--ink)] mb-4" style={{ fontSize: '18px' }}>Trips by Type</h3>
          <AnalyticsDonutChart
            data={tripsByType}
            centerLabel="Trips"
            centerValue={String(tripsCompletedCount)}
            emptyHint="Complete trips to see your trip breakdown"
          />
        </Card>

        {/* Recent Trips */}
        <section className="min-w-0 sm:col-span-2" aria-label="Recent trips">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="font-extrabold text-[var(--ink)]" style={{ fontSize: '18px' }}>Recent Trips</h3>
          </div>

          {/* Filter Tabs */}
          <div role="group" aria-label="Filter trips" className="flex flex-wrap gap-2 mb-4">
            {(['all', 'rides', 'deliveries'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                aria-pressed={filterTab === tab}
                className={`min-h-11 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  filterTab === tab
                    ? 'bg-[var(--teal-soft)] text-[var(--teal)]'
                    : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                }`}
              >
                {tab === 'all' ? `All (${recentTrips.length})` : tab === 'rides' ? `Rides (${recentTrips.filter(t => t.type !== 'Delivery').length})` : `Deliveries (${recentTrips.filter(t => t.type === 'Delivery').length})`}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Card className="p-4 bg-surface border-0 shadow-sm">
              <p className="text-center text-[var(--muted-foreground)]">Loading recent trips...</p>
            </Card>
          ) : recentTrips.length === 0 ? (
            <Card className="p-4 bg-surface border-0 shadow-sm">
              <p className="text-center text-[var(--muted-foreground)]">No recent trips yet. Completed and cancelled rides will appear here.</p>
            </Card>
          ) : tripGroups.length === 0 ? (
            <Card className="rounded-3xl border border-line bg-card p-6 text-center text-sm text-[var(--muted-foreground)]">No trips in this category yet. Choose another filter to see your history.</Card>
          ) : (
            <div className="space-y-5">
              {tripGroups.map((group) => (
                <div key={group.key} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-[var(--ink)]">{group.title}</h4>
                    <span className="text-xs font-bold text-[var(--primary)]">
                      ₱{group.total.toFixed(2)} earned · {group.items.length} {group.items.length === 1 ? 'trip' : 'trips'}
                    </span>
                  </div>
                  {group.items.map((trip) => (
                <Card key={trip.id} className={`bg-surface border-0 shadow-sm overflow-hidden ${
                  trip.status === 'cancelled' ? 'border-l-4 border-l-[var(--error)]' :
                  trip.type === 'Delivery' ? 'border-l-4 border-l-[var(--info)]' :
                  trip.type === 'Ride Share' ? 'border-l-4 border-l-[var(--amber)]' :
                  'border-l-4 border-l-[var(--success)]'
                }`}>
                  <div className="p-4">
                    {/* Top row: type + amount */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                          trip.type === 'Delivery' ? 'bg-[var(--info-soft)]' :
                          trip.type === 'Ride Share' ? 'bg-[var(--amber-soft)]' :
                          'bg-[var(--success-soft)]'
                        }`}>
                          {trip.type === 'Delivery' ? '📦' : trip.type === 'Ride Share' ? '👥' : '👤'}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--ink)] text-sm">{trip.type}</p>
                          <p className="text-[10px] text-[var(--muted-foreground)]">{new Date(trip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {new Date(trip.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {trip.status === 'cancelled' ? (
                          <Badge variant="outline" className="rounded-full border-[var(--error)] text-[var(--error)]">
                            Cancelled
                          </Badge>
                        ) : (
                          <>
                            <p className="font-extrabold text-lg text-[var(--primary)]">₱{trip.amount.toFixed(2)}</p>
                            <Badge
                              variant="outline"
                              className={`text-[10px] rounded-full ${trip.payment === 'Cash' ? 'border-[var(--amber)] text-[var(--amber)]' : 'border-[var(--success)] text-[var(--success)]'}`}
                            >
                              {trip.payment === 'Cash' ? '💵 Cash' : '💳 GCash'}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Customer name */}
                    {trip.customerName && trip.customerName !== 'Customer' && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-[var(--muted)] rounded-lg">
                        <span className="text-sm">👤</span>
                        <p className="text-xs font-semibold text-[var(--ink)]">{trip.customerName}</p>
                      </div>
                    )}

                    {/* Pickup & Dropoff with vertical connector */}
                    {(trip.pickup || trip.dropoffs?.length || trip.dropoff) && (
                      <div className="flex items-stretch gap-2 mt-1">
                        <div className="flex flex-col items-center pt-1">
                          {trip.pickup && <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)] shrink-0" />}
                          {(trip.dropoffs?.length ? trip.dropoffs : trip.dropoff ? [trip.dropoff] : []).map((_, index) => (
                            <div key={`dropoff-marker-${index}`} className="flex flex-col items-center">
                              {(trip.pickup || index > 0) && <div className="w-0.5 h-3 bg-[var(--border)]" />}
                              <div className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] shrink-0" />
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          {trip.pickup && (
                            <div>
                              <p className="text-[10px] text-[var(--success)] font-bold">Pickup</p>
                              <p className="text-xs text-[var(--ink)] truncate">{trip.pickup}</p>
                            </div>
                          )}
                          {(trip.dropoffs?.length ? trip.dropoffs : trip.dropoff ? [trip.dropoff] : []).map((dropoff, index, dropoffs) => (
                            <div key={`dropoff-${index}`}>
                              <p className="text-[10px] text-[var(--primary)] font-bold">
                                {dropoffs.length > 1 ? `Drop-off ${index + 1}` : 'Drop-off'}
                              </p>
                              <p className="text-xs text-[var(--ink)] whitespace-normal break-words">{dropoff}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Active Ride Floating Button */}
      <ActiveRideButton />
    </div>
  );
}
