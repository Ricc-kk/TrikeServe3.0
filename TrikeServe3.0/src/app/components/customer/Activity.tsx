import { ArrowLeft, Home as HomeIcon, Calendar, MessageCircle, User, Navigation, Search, ShoppingCart, ClipboardList, Package } from "lucide-react";
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

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [displayOrders, setDisplayOrders] = useState<OrderDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch orders from Supabase on component mount
  useEffect(() => {
    loadOrdersFromSupabase();
  }, [user]);

  const loadOrdersFromSupabase = async () => {
    try {
      setIsLoading(true);

      if (!user?.id) {
        console.log('[Activity] No user logged in');
        setDisplayOrders([]);
        setIsLoading(false);
        return;
      }

      console.log('[Activity] Loading orders from Supabase for customer:', user.id);

      // Fetch orders for the current customer from Supabase
      const { data: supabaseOrders, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('[Activity] Error loading orders from Supabase:', fetchError);
        setDisplayOrders([]);
        setIsLoading(false);
        return;
      }

      if (!supabaseOrders || supabaseOrders.length === 0) {
        console.log('[Activity] No orders in Supabase');
        setDisplayOrders([]);
        setIsLoading(false);
        return;
      }

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
          restaurantImage: dbOrder.restaurant_image || '', // Use image from database
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
    } catch (error) {
      console.error('[Activity] Exception loading orders:', error);
      setDisplayOrders([]);
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
            <p className="text-[#64748B] mt-2">Loading orders...</p>
          </div>
        ) : (
          <div className="space-y-4">
          {/* Food Orders */}
          {displayOrders.length > 0 ? (
            displayOrders.map((order) => (
              <Card key={order.id} className="p-5 border-2 border-[#E2E8F0] shadow-sm">
                <div className="flex items-start gap-4">
                  {/* Restaurant Image */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                    <ImageWithFallback
                      src={order.restaurantImage}
                      alt={order.restaurantName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#121212] text-base mb-1">
                      {order.restaurantName}
                    </h3>
                    <p className="text-sm text-[#64748B] mb-2">{order.date}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                      <span className="text-xs text-[#64748B]">• {order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                    </div>
                    <button 
                      onClick={() => navigate(`/customer/order-detail/${order.id}`)}
                      className="text-[#0EA5E9] font-semibold text-sm flex items-center gap-1"
                    >
                      View Details →
                    </button>
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-[#121212]">₱{order.total}</p>
                    <p className="text-xs text-[#64748B] mt-1">#{order.orderNumber}</p>
                  </div>
                </div>
              </Card>
            ))
          ) : (
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