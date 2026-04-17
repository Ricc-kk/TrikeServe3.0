import { ArrowLeft, Home as HomeIcon, Calendar, MessageCircle, User, Navigation, Search, ShoppingCart, ClipboardList, Package, MapPin } from "lucide-react";
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
}

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayOrders, setDisplayOrders] = useState<OrderDisplay[]>([]);
  const [displayRides, setDisplayRides] = useState<RideDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        // Transform Supabase rides to display format
        const transformedRides: RideDisplay[] = completedRides.map((dbRide: any) => {
          return {
            id: dbRide.id,
            pickupLocation: dbRide.pickup_location || 'Pickup',
            pickupAddress: dbRide.pickup_address || '',
            dropoffLocation: dbRide.dropoff_location || 'Dropoff',
            dropoffAddress: dbRide.dropoff_address || '',
            date: new Date(dbRide.created_at).toLocaleString(),
            status: 'completed',
            driverName: dbRide.driver_name || 'Driver',
            driverRating: dbRide.driver_rating || '4.8',
            amount: dbRide.amount || 0,
            completedAt: dbRide.updated_at || dbRide.created_at,
            rideType: dbRide.ride_type || 'ride',
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
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="px-5 py-4">
        <h1 className="text-3xl font-extrabold text-[#121212] mb-2">Activity</h1>
      </div>

      {/* Recent Section */}
      <div className="px-5">
        <h2 className="text-lg font-semibold text-[#64748B] mb-4">Recent</h2>

        {isLoading ? (
          <div className="text-center py-8">
            <Package className="w-8 h-8 text-[#0EA5E9] mx-auto animate-bounce" />
            <p className="text-[#64748B] mt-2">Loading activity...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Completed Rides Section */}
            {displayRides.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#64748B] mb-3 uppercase tracking-wide">Rides</h3>
                <div className="space-y-3 mb-6">
                  {displayRides.map((ride) => (
                    <Card key={ride.id} className="p-4 border-2 border-[#E2E8F0] shadow-sm">
                      <div className="flex items-start gap-3">
                        {/* Ride Icon */}
                        <div className="w-12 h-12 rounded-lg bg-[#F0F9FF] flex items-center justify-center flex-shrink-0">
                          <Navigation className="w-6 h-6 text-[#0EA5E9]" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold text-[#121212] text-sm mb-1">
                                {ride.pickupLocation} → {ride.dropoffLocation}
                              </h3>
                              <p className="text-xs text-[#64748B] mb-2">{ride.date}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-lg font-bold text-[#121212]">₱{ride.amount}</p>
                              <p className="text-xs text-[#10B981] font-semibold">Completed</p>
                            </div>
                          </div>

                          {/* Location Details */}
                          <div className="space-y-1 text-xs text-[#64748B] mb-2">
                            {ride.pickupAddress && (
                              <p className="flex items-start gap-2">
                                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>{ride.pickupAddress}</span>
                              </p>
                            )}
                            {ride.dropoffAddress && (
                              <p className="flex items-start gap-2">
                                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>{ride.dropoffAddress}</span>
                              </p>
                            )}
                          </div>

                          {/* Driver Info */}
                          {ride.driverName && (
                            <p className="text-xs text-[#64748B]">
                              Driver: <span className="font-semibold text-[#121212]">{ride.driverName}</span>
                              {ride.driverRating && <span> • ⭐ {ride.driverRating}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Food Orders Section */}
            {displayOrders.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#64748B] mb-3 uppercase tracking-wide">Orders</h3>
                <div className="space-y-3">
                  {displayOrders.map((order) => (
                    <Card key={order.id} className="p-4 border-2 border-[#E2E8F0] shadow-sm">
                      <div className="flex items-start gap-3">
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
                            <div className="flex-1">
                              <h3 className="font-semibold text-[#121212] text-sm mb-1">
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
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {displayOrders.length === 0 && displayRides.length === 0 && (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="w-12 h-12 text-[#94A3B8]" />
                </div>
                <h3 className="text-lg font-bold text-[#121212] mb-2">No Activity Yet</h3>
                <p className="text-[#64748B] mb-6">Start ordering food or booking rides to see your activity here.</p>
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#E11D48]" />
            <span className="text-xs font-semibold text-[#E11D48]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
