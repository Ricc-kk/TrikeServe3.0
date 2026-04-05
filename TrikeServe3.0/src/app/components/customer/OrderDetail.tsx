import { ArrowLeft, Package, Clock, MapPin, CreditCard, User as UserIcon, Phone, X } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { useOrders } from "../../contexts/OrderContext";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect } from "react";

interface OrderData {
  id: string;
  orderNumber: string;
  restaurantName: string;
  restaurantImage: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  date: string;
  status: string;
  deliveryMode: string;
  address: string;
  estimatedTime: string;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  needsCutlery: boolean;
  createdAt: string;
}

export default function OrderDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user } = useAuth();
  const { getOrderById } = useOrders();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Try to fetch order from Supabase first, then fall back to OrderContext
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setIsLoading(true);

        // First try Supabase
        if (orderId) {
          const { data: dbOrder, error: dbError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

          if (!dbError && dbOrder) {
            // Parse items safely
            let parsedItems = [];
            try {
              parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
            } catch (parseError) {
              console.error('[OrderDetail] Error parsing items:', parseError);
              parsedItems = [];
            }

            const transformedOrder: OrderData = {
              id: dbOrder.id,
              orderNumber: dbOrder.order_number || 'Unknown',
              restaurantName: dbOrder.restaurant_name || 'Restaurant',
              restaurantImage: '',
              customerName: dbOrder.customer_name || 'Customer',
              customerEmail: dbOrder.customer_email || '',
              customerPhone: dbOrder.customer_phone || '',
              date: new Date(dbOrder.created_at).toLocaleString(),
              status: dbOrder.status || 'pending',
              deliveryMode: dbOrder.delivery_mode || 'delivery',
              address: dbOrder.address || '',
              estimatedTime: dbOrder.estimated_time || '30 mins',
              items: parsedItems,
              subtotal: dbOrder.subtotal || 0,
              deliveryFee: dbOrder.delivery_fee || 0,
              total: dbOrder.total || 0,
              paymentMethod: dbOrder.payment_method || 'cash',
              needsCutlery: dbOrder.needs_cutlery || false,
              createdAt: dbOrder.created_at,
            };

            setOrder(transformedOrder);
            setIsLoading(false);
            return;
          }
        }

        // Fall back to OrderContext (for backward compatibility)
        const localOrder = getOrderById(orderId || "");
        if (localOrder) {
          setOrder(localOrder);
          setIsLoading(false);
          return;
        }

        // No order found
        setError('Order not found');
        setIsLoading(false);
      } catch (error) {
        console.error('[OrderDetail] Error loading order:', error);
        setError('Failed to load order');
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 text-[#0EA5E9] mx-auto mb-4 animate-bounce" />
          <p className="text-[#64748B]">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#121212] mb-2">Order Not Found</h2>
          <p className="text-[#64748B] mb-4">The order you're looking for doesn't exist.</p>
          <Button
            onClick={() => navigate("/customer/activity")}
            className="bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold uppercase"
          >
            Back to Activity
          </Button>
        </div>
      </div>
    );
  }

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
        return 'Preparing Your Order';
      case 'on-the-way':
        return 'On the Way';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-white pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b-2 border-[#E2E8F0] px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/customer/activity")}
            className="p-2 hover:bg-[#F1F5F9] rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-[#121212]" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-[#121212]">Order Details</h1>
            <p className="text-sm text-[#64748B]">#{order.orderNumber}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        {/* Status Card */}
        <Card className="p-5 border-2 border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#F1F5F9] rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-[#E11D48]" />
              </div>
              <div>
                <h3 className="font-bold text-[#121212]">{getStatusText(order.status)}</h3>
                <p className="text-sm text-[#64748B]">{order.date}</p>
              </div>
            </div>
            <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
              {getStatusText(order.status)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#64748B]">
            <Clock className="w-4 h-4" />
            <span>Estimated: {order.estimatedTime}</span>
          </div>
        </Card>

        {/* Restaurant Info */}
        <Card className="p-5 border-2 border-[#E2E8F0]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
              <ImageWithFallback
                src={order.restaurantImage}
                alt={order.restaurantName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#121212] mb-1">{order.restaurantName}</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${order.deliveryMode === 'delivery' ? 'bg-[#DBEAFE] text-[#3B82F6]' : 'bg-[#FEF3C7] text-[#F59E0B]'}`}>
                  {order.deliveryMode === 'delivery' ? 'Delivery' : 'Pickup'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Delivery Address */}
        {order.deliveryMode === 'delivery' && (
          <Card className="p-5 border-2 border-[#E2E8F0]">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#E11D48] mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#121212] mb-1">Delivery Address</h3>
                <p className="text-[#64748B]">{order.address}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="p-5 border-2 border-[#E2E8F0]">
          <h3 className="font-bold text-[#121212] mb-4">Order Items</h3>
          <div className="space-y-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-start gap-4 pb-4 border-b-2 border-[#F1F5F9] last:border-0 last:pb-0">
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  <ImageWithFallback
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-[#121212] mb-1">{item.name}</h4>
                  <p className="text-sm text-[#64748B] mb-2">Qty: {item.quantity}</p>
                  {item.customizations && item.customizations.length > 0 && (
                    <div className="space-y-1">
                      {item.customizations.map((customization: any, idx: number) => (
                        <div key={idx} className="text-xs text-[#64748B]">
                          <span className="font-semibold">{customization.groupName}:</span> {customization.optionName}
                          {customization.price > 0 && <span className="text-[#E11D48]"> +₱{customization.price}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#121212]">₱{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-5 border-2 border-[#E2E8F0]">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard className="w-5 h-5 text-[#E11D48]" />
            <h3 className="font-bold text-[#121212]">Payment Method</h3>
          </div>
          <div className="flex items-center justify-between mb-6">
            <span className="text-[#64748B]">{order.paymentMethod === 'cash' ? 'Cash on Delivery' : 'GCash (Prepaid)'}</span>
            <span className="font-semibold text-[#121212] uppercase">{order.paymentMethod}</span>
          </div>

          <div className="space-y-3 pt-4 border-t-2 border-[#F1F5F9]">
            <div className="flex justify-between text-[#64748B]">
              <span>Subtotal</span>
              <span>₱{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#64748B]">
              <span>Delivery Fee</span>
              <span>₱{order.deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-[#121212] pt-3 border-t-2 border-[#E2E8F0]">
              <span>Total</span>
              <span>₱{order.total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Additional Info */}
        {order.needsCutlery && (
          <Card className="p-4 border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="text-sm text-[#64748B] flex items-center gap-2">
              <span className="text-base">🍴</span>
              Cutlery requested
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
