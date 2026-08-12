import { useState, useEffect } from "react";
import { ArrowLeft, DollarSign, TrendingUp, Calendar, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

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

        // Format rides for display
        const formattedRides = uniqueRides
          .map((ride: any) => {
            let type = 'Ride';
            if (ride.type === 'delivery') type = 'Delivery';
            else if (ride.type === 'shared') type = 'Ride Share';
            else if (ride.type === 'private') type = 'Private Ride';

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

            return {
              id: ride.id,
              type: type,
              date: dateISO,
              amount: Number(ride.amount) || 0,
              // DB stores payment_method as 'COD' or 'GCASH'; show Cash for cash, Prepaid for GCash.
              payment: ((ride.payment_method || ride.payment) === 'COD' ? 'Cash' : 'Prepaid') as 'Cash' | 'Prepaid',
              customerName: ride.customer_name || ride.customerName || 'Customer'
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
        <Button variant="ghost" size="icon">
          <Download className="w-5 h-5 text-[#64748B]" />
        </Button>
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
          </div>
        </Card>

        {/* Recent Trips */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#121212]" style={{ fontSize: '18px' }}>Recent Trips</h3>
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
              {completedTrips.slice(0, 10).map((trip) => (
                <Card key={trip.id} className="p-4 bg-white border-0 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-extrabold text-[#121212] mb-1">{trip.type}</p>
                      <p className="text-xs text-[#0891B2]">{new Date(trip.date).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-xl text-[#E11D48] mb-1">₱{trip.amount.toFixed(2)}</p>
                      <Badge
                        variant="outline"
                        className={trip.payment === 'Cash' ? 'border-[#F97316] text-[#F97316] rounded-full' : 'border-green-500 text-green-500 rounded-full'}
                      >
                        {trip.payment}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Badge className="bg-[#10B981] text-white border-0 rounded-md">
                      Completed
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}