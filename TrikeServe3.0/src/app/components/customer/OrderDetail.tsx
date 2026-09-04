import { ArrowLeft, Package, Clock, MapPin, CreditCard, RefreshCw, Star, Navigation, CheckCircle, AlertCircle, Phone } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";
import { supabase } from "../../../lib/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { useState, useEffect, useRef } from "react";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'

interface OrderData {
  id: string;
  orderNumber: string;
  restaurantName: string;
  businessId?: string | null;
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
  driverName?: string;
}

function buildOrderData(dbOrder: any): OrderData {
  let parsedItems = [];
  try {
    parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
  } catch { parsedItems = []; }
  return {
    id: dbOrder.id,
    orderNumber: dbOrder.order_number || 'Unknown',
    restaurantName: dbOrder.restaurant_name || 'Restaurant',
    businessId: dbOrder.business_id || null,
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
    driverName: dbOrder.driver_name || undefined,
  };
}

// Status workflow matching the business pattern
const statusWorkflow: Record<string, { steps: string[]; current: number }> = {
  'pending':    { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 0 },
  'preparing':  { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 1 },
  'ready':      { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 2 },
  'confirmed':  { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 3 },
  'on-the-way': { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 3 },
  'delivered':  { steps: ['Order Received', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'], current: 4 },
  'cancelled':  { steps: ['Cancelled'], current: 0 },
};

const statusColors: Record<string, string> = {
  'pending': 'bg-[#F59E0B] text-white',
  'preparing': 'bg-[#3B82F6] text-white',
  'ready': 'bg-[#10B981] text-white',
  'confirmed': 'bg-[#06B6D4] text-white',
  'on-the-way': 'bg-[#3B82F6] text-white',
  'delivered': 'bg-[#10B981] text-white',
  'cancelled': 'bg-[#EF4444] text-white',
};

const statusLabels: Record<string, string> = {
  'pending': 'New Order',
  'preparing': 'Preparing Your Order',
  'ready': 'Ready for Pickup',
  'confirmed': 'Driver Assigned',
  'on-the-way': 'On the Way',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
};

export default function OrderDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToCustomer, setEtaToCustomer] = useState<string | null>(null);

  // Status timeline with timestamps
  const [statusHistory, setStatusHistory] = useState<Array<{ status: string; label: string; time: string; done: boolean }>>([]);

  // ─── Load order once ───────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) { setIsLoading(false); return; }

    const fetchOrder = async () => {
      try {
        const { data: dbOrder, error: dbError } = await supabase
          .from('orders').select('*').eq('id', orderId).single();

        if (dbError || !dbOrder) {
          setError('Order not found');
          setIsLoading(false);
          return;
        }

        const data = buildOrderData(dbOrder);
        setOrder(data);

        // Resolve business id
        let resolvedBusinessId = dbOrder.business_id || null;
        let restaurantLogo = '';
        if (!resolvedBusinessId && dbOrder.restaurant_email) {
          try {
            const { data: restaurant } = await supabase
              .from('restaurants').select('business_user_id, logo_image').eq('id', dbOrder.restaurant_email).maybeSingle();
            if (restaurant?.business_user_id) resolvedBusinessId = restaurant.business_user_id;
            if (restaurant?.logo_image) restaurantLogo = restaurant.logo_image;
          } catch {}
        } else if (dbOrder.restaurant_email) {
          try {
            const { data: restaurant } = await supabase
              .from('restaurants').select('logo_image').eq('id', dbOrder.restaurant_email).maybeSingle();
            if (restaurant?.logo_image) restaurantLogo = restaurant.logo_image;
          } catch {}
        }
        if (resolvedBusinessId || restaurantLogo) setOrder(prev => prev ? { ...prev, businessId: resolvedBusinessId || prev.businessId, restaurantImage: restaurantLogo || prev.restaurantImage } : prev);
      } catch (e) {
        console.error('[OrderDetail] Error:', e);
        setError('Failed to load order');
      }
      setIsLoading(false);
    };

    fetchOrder();
  }, [orderId]);

  // ─── POLLING: Every 3 seconds ─────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (!data) return;

        // Update driver GPS
        if (data.driver_lat && data.driver_lng) {
          setDriverLocation({ lat: data.driver_lat, lng: data.driver_lng });
        }

        // Build new order data and always set it
        const newData = buildOrderData(data);
        setOrder(prev => {
          // Only update if status or driver changed
          if (prev && prev.status === newData.status && prev.driverName === newData.driverName) return prev;
          return newData;
        });
      } catch (err) {
        console.error('[OrderDetail] Poll error:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  // ─── Build status timeline when order changes ─────────────────────
  useEffect(() => {
    if (!order) return;
    const workflow = statusWorkflow[order.status] || statusWorkflow['pending'];
    const history = workflow.steps.map((step, idx) => ({
      status: step,
      label: step,
      time: idx <= workflow.current ? '✓' : '',
      done: idx <= workflow.current,
    }));
    setStatusHistory(history);
  }, [order?.status]);

  // ─── Compute route from driver to customer ─────────────────────────
  useEffect(() => {
    if (!driverLocation || !isMapsLoaded || !(window as any).google || !order?.address) {
      setRoutePath([]);
      return;
    }
    const parseCoords = (addr: string): { lat: number; lng: number } | null => {
      const coordPart = addr.includes('|') ? addr.split('|')[1] : addr;
      const m = coordPart.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
      return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
    };
    const dest = parseCoords(order.address);
    if (!dest) { setRoutePath([]); return; }

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
  }, [driverLocation, isMapsLoaded, order?.address]);

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

  // ─── Manual refresh ────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!orderId) return;
    setIsRefreshing(true);
    try {
      const { data } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (data) setOrder(buildOrderData(data));
    } catch {}
    setIsRefreshing(false);
  };

  // ─── Loading / Error states ────────────────────────────────────────
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
          <Button onClick={() => navigate("/customer/activity")} className="bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold uppercase">Back to Activity</Button>
        </div>
      </div>
    );
  }

  const workflow = statusWorkflow[order.status] || statusWorkflow['pending'];
  const isActiveDelivery = ['confirmed', 'on-the-way'].includes(order.status);

  return (
    <div className="min-h-screen bg-white pb-6">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b-2 border-[#E2E8F0] px-4 md:px-5 py-3 md:py-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/customer/activity")} className="p-2 hover:bg-[#F1F5F9] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-[#121212]" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-[#121212]">Order #{order.orderNumber}</h1>
              <p className="text-xs text-[#64748B]">{order.date}</p>
            </div>
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 hover:bg-[#F1F5F9] rounded-full transition-colors disabled:opacity-50">
            <RefreshCw className={`w-5 h-5 text-[#64748B] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <Badge className={`${statusColors[order.status]} text-xs`}>
          {statusLabels[order.status]}
        </Badge>

        {/* Business-style horizontal stepper */}
        <div className="mt-3 md:mt-4">
          <p className="text-xs font-semibold text-[#64748B] mb-2">ORDER PROGRESS</p>
          <div className="flex items-center gap-1 md:gap-2 overflow-x-auto pb-2">
            {workflow.steps.map((step, idx) => (
              <div key={idx} className="flex items-center flex-shrink-0">
                <div
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    idx <= workflow.current
                      ? 'bg-[#10B981] text-white'
                      : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}
                >
                  {idx <= workflow.current ? '✓' : idx + 1}
                </div>
                {idx < workflow.steps.length - 1 && (
                  <div
                    className={`h-0.5 w-3 md:w-5 ml-1 md:ml-2 transition-all ${
                      idx < workflow.current ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-0 overflow-x-auto pb-1">
            {workflow.steps.map((step, idx) => (
              <div key={idx} className="flex-shrink-0" style={{ width: `${100 / workflow.steps.length}%` }}>
                <p className={`text-[10px] md:text-xs font-semibold truncate ${idx <= workflow.current ? 'text-[#121212]' : 'text-[#64748B]'}`}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-5 pt-4 space-y-4 md:space-y-5">
        {/* Live Map */}
        {isActiveDelivery && isMapsLoaded && driverLocation && (
          <Card className="border-2 border-[#3B82F6] overflow-hidden">
            <div className="bg-gradient-to-r from-[#3B82F6] to-[#2563EB] px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-bold text-white">Live Delivery Tracking</span>
              </div>
              <Navigation className="w-4 h-4 text-white/80" />
            </div>
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '220px' }}
              center={driverLocation}
              zoom={15}
              options={{ zoomControl: false, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, gestureHandling: 'none' }}
            >
              <MarkerF position={driverLocation} title="Driver" icon={(() => {
                const g = (window as any)?.google;
                if (!g?.maps?.Size || !g?.maps?.Point) return undefined;
                return { url: tricycleIcon, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) };
              })()} />
              {(() => {
                const coords = (order?.address || '').includes('|') ? order.address.split('|')[1] : (order?.address || '');
                const m = coords.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
                if (!m) return null;
                return (
                  <MarkerF position={{ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }} title="Your location" icon={{
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                    scaledSize: new (window as any).google.maps.Size(32, 32),
                    anchor: new (window as any).google.maps.Point(16, 32),
                  }} />
                );
              })()}
              {routePath.length > 0 && (
                <Polyline path={routePath} options={{ strokeColor: '#10B981', strokeOpacity: 0.9, strokeWeight: 4, geodesic: true }} />
              )}
            </GoogleMap>
            <div className="px-4 py-2.5 bg-white border-t border-[#E2E8F0] flex items-center justify-between">
              <p className="text-xs font-semibold text-[#121212]">
                {order.driverName && <span className="text-[#64748B]">Driver: {order.driverName} • </span>}
                {order.status === 'confirmed' ? '🛵 Heading to restaurant' : '🟢 Delivering to you'}
              </p>
              <div className="flex items-center gap-2">
                {etaToCustomer && (
                  <span className="text-[10px] font-bold text-[#3B82F6] bg-blue-50 px-2 py-0.5 rounded-full">🏁 {etaToCustomer}</span>
                )}
                <div className="text-[10px] text-[#94A3B8]">● Live</div>
              </div>
            </div>
          </Card>
        )}

        {/* Status Timeline — business style */}
        <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
          <h3 className="font-bold text-[#121212] text-sm md:text-base mb-3">Status Updates</h3>
          <div className="space-y-0">
            {statusHistory.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                {/* Vertical line + circle */}
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold shrink-0 ${
                    item.done ? 'bg-[#10B981] text-white' : 'bg-[#E2E8F0] text-[#64748B]'
                  }`}>
                    {item.done ? '✓' : idx + 1}
                  </div>
                  {idx < statusHistory.length - 1 && (
                    <div className={`w-0.5 h-5 ${item.done ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'}`} />
                  )}
                </div>
                {/* Label */}
                <div className="pt-0.5 pb-2">
                  <p className={`text-sm font-semibold ${item.done ? 'text-[#121212]' : 'text-[#94A3B8]'}`}>
                    {item.label}
                  </p>
                  {idx === workflow.current && (
                    <p className="text-[10px] md:text-xs text-[#3B82F6] font-medium">Current</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Restaurant Info */}
        <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
          <h3 className="font-bold text-[#121212] text-sm md:text-base mb-2">Restaurant</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden flex-shrink-0">
              <StoreLogo logo={order.restaurantImage} emojiClass="text-3xl" />
            </div>
            <div>
              <p className="font-semibold text-[#121212] text-sm md:text-base">{order.restaurantName}</p>
              <Badge className={`mt-1 text-[10px] md:text-xs ${order.deliveryMode === 'delivery' ? 'bg-[#DBEAFE] text-[#3B82F6]' : 'bg-[#FEF3C7] text-[#F59E0B]'}`}>
                {order.deliveryMode === 'delivery' ? 'Delivery' : 'Pickup'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Delivery Address */}
        {order.deliveryMode === 'delivery' && (
          <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
            <h3 className="font-bold text-[#121212] text-sm md:text-base mb-2">Delivery Address</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-[#64748B]">{order.address.split('|')[0].trim() || order.address}</p>
            </div>
          </Card>
        )}

        {/* Order Items */}
        <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
          <h3 className="font-bold text-[#121212] text-sm md:text-base mb-3">Items</h3>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-2 md:p-3 bg-[#F8F9FA] rounded-xl">
                <div className="min-w-0">
                  <p className="font-semibold text-[#121212] text-sm truncate">{item.name}</p>
                  <p className="text-xs text-[#64748B]">Qty: {item.quantity}</p>
                  {item.customizations && item.customizations.length > 0 && (
                    <div className="space-y-0.5 mt-1">
                      {item.customizations.map((c: any, idx: number) => (
                        <p key={idx} className="text-[10px] text-[#64748B]">
                          {c.groupName}: {c.optionName}{c.price > 0 && <span className="text-[#E11D48]"> +₱{c.price}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <p className="font-bold text-[#121212] text-sm flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment */}
        <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-[#E11D48]" />
            <h3 className="font-bold text-[#121212] text-sm md:text-base">Payment</h3>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#64748B]">{order.paymentMethod === 'cash' ? 'Cash on Delivery' : 'GCash (Prepaid)'}</span>
            <Badge className={order.paymentMethod === 'gcash' ? 'bg-[#10B981] text-white text-xs' : 'bg-[#FEF3C7] text-[#F59E0B] text-xs'}>
              {order.paymentMethod === 'gcash' ? 'GCash' : 'COD'}
            </Badge>
          </div>
          <div className="space-y-2 pt-3 border-t-2 border-[#F1F5F9]">
            <div className="flex justify-between text-sm text-[#64748B]">
              <span>Subtotal</span>
              <span>₱{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#64748B]">
              <span>Delivery Fee</span>
              <span>₱{order.deliveryFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-[#121212] pt-2 border-t-2 border-[#E2E8F0]">
              <span>Total</span>
              <span className="text-[#E11D48]">₱{order.total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Cutlery */}
        {order.needsCutlery && (
          <Card className="p-3 border-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="text-sm text-[#64748B] flex items-center gap-2">🍴 Cutlery requested</p>
          </Card>
        )}

        {/* Rate */}
        {order.status === 'delivered' && (
          <Card className="p-4 md:p-5 border-2 border-[#E2E8F0]">
            {ratingSubmitted ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center text-2xl">🙏</div>
                <h3 className="text-lg font-bold text-[#121212] mb-1">Thank you!</h3>
                <p className="text-sm text-[#64748B]">Your rating for {order.restaurantName} has been saved.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-[#FFC107] fill-[#FFC107]" />
                  <h3 className="font-bold text-[#121212] text-sm md:text-base">Rate {order.restaurantName}</h3>
                </div>
                <p className="text-sm text-[#64748B] mb-3">How was your order and delivery?</p>
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110">
                      <Star className={`w-8 h-8 ${star <= rating ? 'fill-[#FFC107] text-[#FFC107]' : 'fill-[#E2E8F0] text-[#E2E8F0]'}`} />
                    </button>
                  ))}
                </div>
                {ratingError && <p className="text-xs text-red-600 text-center mb-2">{ratingError}</p>}
                <Button
                  onClick={async () => {
                    if (!rating || !user?.id || !order.businessId) return;
                    setRatingSubmitting(true);
                    setRatingError(null);
                    const { error } = await supabaseHelpers.rateBusiness({ businessId: order.businessId, customerId: user.id, rating, orderId: order.id });
                    setRatingSubmitting(false);
                    if (error) { setRatingError('Failed to submit rating.'); return; }
                    setRatingSubmitted(true);
                  }}
                  disabled={!rating || ratingSubmitting || !order.businessId}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 font-bold disabled:opacity-50"
                >
                  {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                </Button>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
