import { ArrowLeft, Package, Clock, MapPin, CreditCard, User as UserIcon, Phone, X, RefreshCw, Star, Navigation } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { useOrders } from "../../contexts/OrderContext";
import { useAuth } from "../../contexts/AuthContext";
import { ImageWithFallback } from "../figma/ImageWithFallback";
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
}

export default function OrderDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user } = useAuth();
  const { getOrderById } = useOrders();
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
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [rideRequestData, setRideRequestData] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshOrderFromSupabase = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      if (!orderId) {
        setIsLoading(false);
        setIsRefreshing(false);
        return false;
      }

      const { data: dbOrder, error: dbError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (dbError || !dbOrder) {
        setIsLoading(false);
        setIsRefreshing(false);
        return false;
      }

      let parsedItems = [];
      try {
        parsedItems = typeof dbOrder.items === 'string' ? JSON.parse(dbOrder.items) : (Array.isArray(dbOrder.items) ? dbOrder.items : []);
      } catch {
        parsedItems = [];
      }

      // Resolve the business user id: orders.business_id may be null, but
      // orders.restaurant_email actually stores the restaurant id, which maps
      // to the business user via restaurants.business_user_id.
      let resolvedBusinessId: string | null = dbOrder.business_id || null;
      if (!resolvedBusinessId && dbOrder.restaurant_email) {
        try {
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('business_user_id')
            .eq('id', dbOrder.restaurant_email)
            .maybeSingle();
          if (restaurant?.business_user_id) resolvedBusinessId = restaurant.business_user_id;
        } catch (err) {
          console.error('[OrderDetail] Error resolving restaurant business:', err);
        }
      }

      setOrder({
        id: dbOrder.id,
        orderNumber: dbOrder.order_number || 'Unknown',
        restaurantName: dbOrder.restaurant_name || 'Restaurant',
        businessId: resolvedBusinessId,
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
      });

      setIsLoading(false);
      setIsRefreshing(false);
      return true;
    } catch (e) {
      console.error('[OrderDetail] refreshOrderFromSupabase error:', e);
      setIsLoading(false);
      setIsRefreshing(false);
      return false;
    }
  };

  // Load order only once per session
  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }

    // Check if we've already loaded this order in this session
    const sessionKey = `orderdetail_loaded_${orderId}`;
    const hasLoaded = sessionStorage.getItem(sessionKey);

    if (!hasLoaded) {
      console.log('[OrderDetail] First load for order in this session:', orderId);
      sessionStorage.setItem(sessionKey, 'true');

      const fetchOrder = async () => {
        try {
          // First try Supabase
          if (await refreshOrderFromSupabase()) {
            return;
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
    } else {
      console.log('[OrderDetail] Already loaded in this session, skipping');
      setIsLoading(false);
    }
  }, [orderId]);

  // Poll for driver location when order is on-the-way
  useEffect(() => {
    if (!order || order.status !== 'on-the-way') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const pollDriverLocation = async () => {
      try {
        const { data: rideRequest } = await supabase
          .from('ride_requests')
          .select('driver_lat, driver_lng, driver_name, driver_plate, driver_status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address')
          .eq('order_id', order.id)
          .eq('type', 'delivery')
          .in('status', ['accepted', 'on-the-way', 'arrived', 'picked-up', 'drop-off'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (rideRequest) {
          setRideRequestData(rideRequest);
          setDriverStatus(rideRequest.driver_status);
          if (rideRequest.driver_lat && rideRequest.driver_lng) {
            setDriverLocation({ lat: rideRequest.driver_lat, lng: rideRequest.driver_lng });
          }
        }
      } catch (err) {
        console.error('Error polling driver location:', err);
      }
    };

    pollDriverLocation();
    pollRef.current = setInterval(pollDriverLocation, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order?.id, order?.status]);

  // Compute route from driver to restaurant or customer
  useEffect(() => {
    if (!driverLocation || !isMapsLoaded || !(window as any).google) {
      setRoutePath([]);
      return;
    }

    const isHeadingToPickup = driverStatus === 'on-the-way' || driverStatus === 'arrived' || driverStatus === 'accepted';
    let dest: { lat: number; lng: number } | null = null;

    if (isHeadingToPickup && rideRequestData?.pickup_lat && rideRequestData?.pickup_lng) {
      dest = { lat: rideRequestData.pickup_lat, lng: rideRequestData.pickup_lng };
    } else if (rideRequestData?.dropoff_lat && rideRequestData?.dropoff_lng) {
      dest = { lat: rideRequestData.dropoff_lat, lng: rideRequestData.dropoff_lng };
    }

    if (!dest) { setRoutePath([]); return; }

    const DirectionsService = new (window as any).google.maps.DirectionsService();
    DirectionsService.route({
      origin: new (window as any).google.maps.LatLng(driverLocation.lat, driverLocation.lng),
      destination: new (window as any).google.maps.LatLng(dest.lat, dest.lng),
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
        const decoded = decodePolyline(result.routes[0].overview_polyline.points);
        setRoutePath(decoded);
      }
    });
  }, [driverLocation, isMapsLoaded, driverStatus, rideRequestData]);

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
      case 'ready':
        return 'text-[#10B981] bg-[#D1FAE5]';
      case 'confirmed':
        return 'text-[#06B6D4] bg-[#CFFAFE]';
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
      case 'ready':
        return 'Ready for Pickup';
      case 'confirmed':
        return 'Ready for Delivery';
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
          <button
            onClick={() => refreshOrderFromSupabase(true)}
            disabled={isRefreshing}
            className="p-2 hover:bg-[#F1F5F9] rounded-full transition-colors disabled:opacity-50"
            title="Refresh order details"
          >
            <RefreshCw className={`w-6 h-6 text-[#64748B] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
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

        {/* Live Delivery Tracking Map */}
        {order.status === 'on-the-way' && isMapsLoaded && driverLocation && (
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
              options={{
                zoomControl: false,
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                gestureHandling: 'none',
              }}
            >
              <MarkerF
                position={driverLocation}
                title="Driver"
                icon={(() => {
                  const g = (window as any)?.google;
                  if (!g?.maps?.Size || !g?.maps?.Point) return undefined;
                  return { url: tricycleIcon, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) };
                })()}
              />
              {rideRequestData?.dropoff_lat && rideRequestData?.dropoff_lng && (
                <MarkerF
                  position={{ lat: rideRequestData.dropoff_lat, lng: rideRequestData.dropoff_lng }}
                  title="Your location"
                  icon={{
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                    scaledSize: new (window as any).google.maps.Size(32, 32),
                    anchor: new (window as any).google.maps.Point(16, 32),
                  }}
                />
              )}
              {rideRequestData?.pickup_lat && rideRequestData?.pickup_lng && (
                <MarkerF
                  position={{ lat: rideRequestData.pickup_lat, lng: rideRequestData.pickup_lng }}
                  title="Restaurant"
                  icon={{
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10B981" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'),
                    scaledSize: new (window as any).google.maps.Size(32, 32),
                    anchor: new (window as any).google.maps.Point(16, 32),
                  }}
                />
              )}
              {routePath.length > 0 && (
                <Polyline
                  path={routePath}
                  options={{ strokeColor: (driverStatus === 'on-the-way' || driverStatus === 'arrived' || driverStatus === 'accepted') ? '#10B981' : '#E11D48', strokeOpacity: 0.9, strokeWeight: 4, geodesic: true }}
                />
              )}
            </GoogleMap>
            <div className="px-4 py-2.5 bg-white border-t border-[#E2E8F0] flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#121212]">
                  {(driverStatus === 'on-the-way' || driverStatus === 'arrived' || driverStatus === 'accepted') ? '🟢 Driver heading to restaurant' : '🔴 Driver delivering to you'}
                </p>
                {rideRequestData?.driver_name && (
                  <p className="text-[10px] text-[#64748B]">{rideRequestData.driver_name} • {rideRequestData.driver_plate || ''}</p>
                )}
              </div>
              <div className="text-[10px] text-[#94A3B8]">● Live</div>
            </div>
          </Card>
        )}

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

        {/* Rate the restaurant after a delivered order */}
        {order.status === 'delivered' && (
          <Card className="p-5 border-2 border-[#E2E8F0]">
            {ratingSubmitted ? (
              <div className="text-center py-2">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-3xl">🙏</div>
                <h3 className="text-xl font-bold text-[#121212] mb-2">Thank you!</h3>
                <p className="text-sm text-[#64748B]">Your rating for {order.restaurantName} has been saved.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <Star className="w-5 h-5 text-[#FFC107] fill-[#FFC107]" />
                  <h3 className="font-bold text-[#121212]">Rate {order.restaurantName}</h3>
                </div>
                <p className="text-sm text-[#64748B] mb-4">How was your order and delivery?</p>
                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        className={`w-9 h-9 ${
                          star <= rating ? 'fill-[#FFC107] text-[#FFC107]' : 'fill-[#E2E8F0] text-[#E2E8F0]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {ratingError && <p className="text-xs text-red-600 text-center mb-2">{ratingError}</p>}
                <Button
                  onClick={async () => {
                    if (!rating || !user?.id || !order.businessId) return;
                    setRatingSubmitting(true);
                    setRatingError(null);
                    const { error } = await supabaseHelpers.rateBusiness({
                      businessId: order.businessId,
                      customerId: user.id,
                      rating,
                      orderId: order.id,
                    });
                    setRatingSubmitting(false);
                    if (error) {
                      setRatingError('Failed to submit rating. Please try again.');
                      return;
                    }
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
