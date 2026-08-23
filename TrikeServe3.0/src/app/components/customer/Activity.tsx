import { ArrowLeft, Home as HomeIcon, Calendar, MessageCircle, User, Users, Navigation, Search, ShoppingCart, ClipboardList, Package, MapPin } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect } from "react";

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
}

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayOrders, setDisplayOrders] = useState<OrderDisplay[]>([]);
  const [displayRides, setDisplayRides] = useState<RideDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rides' | 'deliveries'>('rides');

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
        return 'text-[#F59E0B] bg-[#FEF3C7]';
      case 'on-the-way':
        return 'text-[#3B82F6] bg-[#DBEAFE]';
      case 'delivered':
        return 'text-[#10B981] bg-[#D1FAE5]';
      case 'cancelled':
        return 'text-[#EF4444] bg-[#FEE2E2]';
      default:
        return 'text-[#64748B] bg-[#F1F5F9]';
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
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#121212]">Activity</h1>
      </div>

      {/* Tab Buttons */}
      <div className="px-4 sm:px-5 mb-4 sm:mb-5">
        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={() => setActiveTab('rides')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
              activeTab === 'rides'
                ? 'bg-[#E11D48] text-white shadow-lg shadow-[#E11D48]/25'
                : 'bg-[#F8FAFC] text-[#64748B] border-2 border-[#E2E8F0]'
            }`}
          >
            <Navigation className={`w-5 h-5 ${activeTab === 'rides' ? 'text-white' : 'text-[#0EA5E9]'}`} />
            <span>Rides</span>
            {displayRides.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'rides' ? 'bg-white/20 text-white' : 'bg-[#E2E8F0] text-[#64748B]'
              }`}>
                {displayRides.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 active:scale-[0.97] ${
              activeTab === 'deliveries'
                ? 'bg-[#E11D48] text-white shadow-lg shadow-[#E11D48]/25'
                : 'bg-[#F8FAFC] text-[#64748B] border-2 border-[#E2E8F0]'
            }`}
          >
            <Package className={`w-5 h-5 ${activeTab === 'deliveries' ? 'text-white' : 'text-[#10B981]'}`} />
            <span>Deliveries</span>
            {displayOrders.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'deliveries' ? 'bg-white/20 text-white' : 'bg-[#E2E8F0] text-[#64748B]'
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
            <Package className="w-8 h-8 text-[#0EA5E9] mx-auto animate-bounce" />
            <p className="text-[#64748B] mt-2">Loading activity...</p>
          </div>
        ) : activeTab === 'rides' ? (
          <div>
            {displayRides.length > 0 ? (
              <div className="space-y-3">
                {displayRides.map((ride) => (
                  <Card key={ride.id} className="p-3.5 sm:p-4 border-2 border-[#E2E8F0] shadow-sm">
                    <div className="flex items-start gap-3">
                      {/* Ride Icon */}
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${ride.rideType === 'share' ? 'bg-[#F0F9FF]' : 'bg-[#FFF1F2]'}`}>
                        {ride.rideType === 'share' ? (
                          <Users className="w-6 h-6 text-[#0EA5E9]" />
                        ) : (
                          <Navigation className="w-6 h-6 text-[#E11D48]" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-[#121212] text-xs sm:text-sm mb-1 line-clamp-2">
                              {ride.pickupLocation} → {ride.dropoffLocation}
                            </h3>
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-xs text-[#64748B]">{ride.date}</p>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${ride.rideType === 'share' ? 'text-[#0EA5E9] bg-[#DBEAFE]' : 'text-[#E11D48] bg-[#FFF1F2]'}`}>
                                {ride.rideType === 'share' ? 'Share Ride' : 'Private Ride'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-[#121212]">₱{ride.amount}</p>
                            <p className="text-xs text-[#10B981] font-semibold">Completed</p>
                          </div>
                        </div>

                        {/* Ride Details */}
                        <div className="flex items-center gap-3 mb-2 text-xs text-[#64748B]">
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
                        <div className="space-y-1 text-xs text-[#64748B] mb-2">
                          <p className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#121212]" />
                            <span><span className="font-semibold text-[#121212]">Pickup:</span> {ride.pickupAddress || ride.pickupLocation}</span>
                          </p>
                          <p className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#E11D48]" />
                            <span><span className="font-semibold text-[#121212]">Drop-off:</span> {ride.dropoffAddress || ride.dropoffLocation}</span>
                          </p>
                        </div>

                        {/* Driver Info */}
                        <p className="text-xs text-[#64748B]">
                          👤 Driver: <span className="font-semibold text-[#121212]">{ride.driverName || 'Driver'}</span>
                          {ride.driverRating && ride.driverRating !== 'Driver' && <span> • ⭐ {ride.driverRating}</span>}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Navigation className="w-12 h-12 text-[#94A3B8]" />
                </div>
                <h3 className="text-lg font-bold text-[#121212] mb-2">No Rides Yet</h3>
                <p className="text-[#64748B] mb-6">Book a ride to see your ride history here.</p>
                <Link to="/customer">
                  <Button className="bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold py-3 px-6 rounded-2xl uppercase">
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
                  <Card key={order.id} className="p-3.5 sm:p-4 border-2 border-[#E2E8F0] shadow-sm cursor-pointer active:scale-[0.98] transition-transform">
                    <div onClick={() => navigate(order.status === 'delivered' ? `/customer/order-detail/${order.id}` : `/customer/delivery-tracker/${order.id}`)} className="flex items-start gap-3">
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
                          <div className="flex-1">                            <h3 className="font-semibold text-[#121212] text-xs sm:text-sm mb-1 line-clamp-1">
                                {order.restaurantName}
                              </h3>
                            <p className="text-xs text-[#64748B] mb-2">{order.date}</p>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                {getStatusText(order.status)}
                              </span>
                              <span className="text-xs text-[#64748B]">• {order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-[#121212]">₱{order.total}</p>
                            <p className="text-xs text-[#64748B]">#{order.orderNumber}</p>
                          </div>
                        </div>
                        {order.status === 'delivered' && (
                          <p className="text-xs font-bold text-[#E11D48] mt-2">⭐ Tap to rate this restaurant</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-12 h-12 text-[#94A3B8]" />
                </div>
                <h3 className="text-lg font-bold text-[#121212] mb-2">No Orders Yet</h3>
                <p className="text-[#64748B] mb-6">Order food to see your delivery history here.</p>
                <Link to="/customer/food">
                  <Button className="bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold py-3 px-6 rounded-2xl uppercase">
                    Browse Food
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-2 py-2.5 z-50" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-1">
          <Link to="/customer/food" className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl active:bg-gray-50 transition-colors">
            <HomeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#64748B]" />
            <span className="text-[10px] sm:text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl active:bg-gray-50 transition-colors">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-[#64748B]" />
            <span className="text-[10px] sm:text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl active:bg-gray-50 transition-colors">
            <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-[#64748B]" />
            <span className="text-[10px] sm:text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl active:bg-gray-50 transition-colors">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-[#E11D48]" />
            <span className="text-[10px] sm:text-xs font-semibold text-[#E11D48]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-0.5 py-1.5 rounded-xl active:bg-gray-50 transition-colors">
            <User className="w-5 h-5 sm:w-6 sm:h-6 text-[#64748B]" />
            <span className="text-[10px] sm:text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
