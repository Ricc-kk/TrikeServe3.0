import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Package, Users, Car, Clock, Check, X, CheckCircle } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, Polyline, DirectionsRenderer } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "../../../lib/supabase";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import ActiveRideButton from "./ActiveRideButton";

interface PassengerRequest {
  id: string;
  type: 'delivery' | 'shared' | 'private';
  pickup: string;
  dropoff: string;
  payment: 'COD' | 'PREPAID';
  amount: number;
  foodCost?: number;
  passengers?: number;
  waitingPassengers?: number;
  customerName: string;
  customerPhoto: string;
  distance: string;
  estimatedTime: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  customerId?: string;
  orderId?: string;
  orderNumber?: string;
  lobbyId?: string;
  passengerDetails?: Array<{
    id: string;
    name: string;
    emoji: string;
    joinedAt: string;
  }>;
  maxPassengers?: number;
}

export default function PassengerRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'shared' | 'private' | 'delivery'>('all');
  const [requests, setRequests] = useState<PassengerRequest[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const [previewRequest, setPreviewRequest] = useState<PassengerRequest | null>(null);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [deliveryRouteResult, setDeliveryRouteResult] = useState<google.maps.DirectionsResult | null>(null);
  const [resolvedPickupCoords, setResolvedPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [previewMapCenter, setPreviewMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [showAccepted, setShowAccepted] = useState(false);
  const [showConfirmAccept, setShowConfirmAccept] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<PassengerRequest | null>(null);

  const mapRideType = (rideType: string, pickupLocation?: string): PassengerRequest['type'] => {
    const normalized = (rideType || '').toLowerCase();
    const taggedDelivery = (pickupLocation || '').startsWith('DELIVERY|');
    if (normalized === 'delivery' || taggedDelivery) return 'delivery';
    if (normalized === 'share' || normalized === 'shared') return 'shared';
    return 'private';
  };

  const formatPickup = (value?: string) => {
    const pickup = value || 'Pickup';
    if (!pickup.startsWith('DELIVERY|')) return pickup;
    const parts = pickup.split('|');
    return parts[parts.length - 1] || pickup;
  };

  const parseDeliveryTag = (pickupLocation?: string) => {
    if (!pickupLocation?.startsWith('DELIVERY|')) return { orderId: undefined, orderNumber: undefined };
    const parts = pickupLocation.split('|');
    const orderIdPart = parts.find((part) => part.startsWith('ORDER_ID:'));
    const orderNumberPart = parts.find((part) => part.startsWith('ORDER_NO:'));
    return {
      orderId: orderIdPart ? orderIdPart.replace('ORDER_ID:', '') : undefined,
      orderNumber: orderNumberPart ? orderNumberPart.replace('ORDER_NO:', '') : undefined,
    };
  };

  const haversineDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371e3;
    const φ1 = toRad(a.lat);
    const φ2 = toRad(b.lat);
    const Δφ = toRad(b.lat - a.lat);
    const Δλ = toRad(b.lng - a.lng);
    const sa = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
    return R * c;
  };

  const estimateETA = (distanceMeters: number): number => {
    const averageSpeedMPS = 40000 / 3600;
    return Math.ceil(distanceMeters / averageSpeedMPS);
  };

  const createDriverMarkerIcon = (): google.maps.Icon | undefined => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    return {
      url: tricycleIcon,
      scaledSize: new google.maps.Size(44, 44),
      anchor: new google.maps.Point(22, 22),
    } as any;
  };

  const createCustomerMarkerIcon = () => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2563EB" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/><path d="M8.7 15.9c.55-2.05 2.15-3.3 3.3-3.3s2.75 1.25 3.3 3.3" fill="#FFFFFF" stroke="none"/></svg>`;
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 40) } as any;
  };

  const createDropoffMarkerIcon = () => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 40) } as any;
  };

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const { data: rideRequests } = await supabaseHelpers.getRideRequests({ status: 'pending' });
        const { data: waitingLobbies } = await supabaseHelpers.getWaitingLobbiesForDriver();
        const missingNameIds = [...new Set(
          (rideRequests || [])
            .filter((req: any) => !req.customer_name && req.customer_id)
            .map((req: any) => req.customer_id)
        )];
        const nameMap: Record<string, string> = {};
        if (missingNameIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name')
            .in('id', missingNameIds);
          (usersData || []).forEach((u: any) => { if (u.name) nameMap[u.id] = u.name; });
        }
        const mappedRequests = (rideRequests || []).map((req: any) => ({
          id: req.id,
          type: mapRideType(req.ride_type, req.pickup_location),
          pickup: formatPickup(req.pickup_location),
          dropoff: req.dropoff_location || 'Drop-off',
          payment: req.payment_method === 'GCASH' ? 'PREPAID' : 'COD',
          amount: Number(req.amount || 0),
          foodCost: Number(req.food_cost || 0),
          customerName: req.customer_name || nameMap[req.customer_id] || 'Customer',
          customerPhoto: '👤',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          passengers: req.passenger_count || 1,
          customerId: req.customer_id,
          ...parseDeliveryTag(req.pickup_location),
          pickupAddress: req.pickup_address || undefined,
          dropoffAddress: req.dropoff_address || undefined,
          pickupLat: req.pickup_lat || undefined,
          pickupLng: req.pickup_lng || undefined,
          dropoffLat: req.dropoff_lat || (() => {
            const addr = req.dropoff_address || req.dropoff_location || '';
            const coordPart = addr.includes('|') ? addr.split('|')[1] : addr;
            const m = coordPart.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
            return m ? parseFloat(m[1]) : undefined;
          })(),
          dropoffLng: req.dropoff_lng || (() => {
            const addr = req.dropoff_address || req.dropoff_location || '';
            const coordPart = addr.includes('|') ? addr.split('|')[1] : addr;
            const m = coordPart.match(/(\d+\.\d+)\s*,\s*(\d+\.\d+)/);
            return m ? parseFloat(m[2]) : undefined;
          })(),
          created_at: req.created_at,
        }));
        const mappedLobbies = (waitingLobbies || []).map((lobby: any) => {
          const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
          return {
            id: `lobby_${lobby.id}`,
            type: 'shared',
            pickup: lobby.pickup_location,
            dropoff: lobby.dropoff_location,
            pickupAddress: lobby.pickup_address,
            dropoffAddress: lobby.dropoff_address,
            pickupLat: lobby.pickup_lat || undefined,
            pickupLng: lobby.pickup_lng || undefined,
            dropoffLat: lobby.dropoff_lat || undefined,
            dropoffLng: lobby.dropoff_lng || undefined,
            payment: lobby.payment_method === 'COD' ? 'COD' : 'PREPAID',
            amount: Number(lobby.price_per_seat || 15),
            passengers: passengers.length,
            maxPassengers: Number(lobby.max_seats || 3),
            customerName: passengers.length > 1 ? passengers.map((p: any) => p.name || 'Passenger').join(', ') : (passengers[0]?.name || 'Customer'),
            customerPhoto: 'shared',
            distance: '2.5 km',
            estimatedTime: '7 mins',
            customerId: lobby.customer_id,
            lobbyId: lobby.id,
            passengerDetails: passengers,
            created_at: lobby.created_at,
          } as PassengerRequest;
        });
        const seenOrderIds = new Set<string>();
        const dedupedRequests = mappedRequests.filter((req: any) => {
          if (req.orderId) {
            if (seenOrderIds.has(req.orderId)) return false;
            seenOrderIds.add(req.orderId);
          }
          return true;
        });
        setRequests([...dedupedRequests, ...mappedLobbies]);
      } catch (error) { console.error('❌ Error loading requests:', error); }
    };
    loadRequests();
    const rideSub = supabase.channel('rides').on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests' }, () => loadRequests()).subscribe();
    const lobbySub = supabase.channel('lobbies').on('postgres_changes', { event: '*', schema: 'public', table: 'shared_ride_lobbies' }, () => loadRequests()).subscribe();
    const interval = setInterval(loadRequests, 3000);
    return () => { clearInterval(interval); supabase.removeChannel(rideSub); supabase.removeChannel(lobbySub); };
  }, [user?.id]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => { setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }, null, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }, []);

  useEffect(() => {
    if (!previewRequest || !isMapsLoaded || !(window as any).google) return;

    const pLat = Number(previewRequest.pickupLat);
    const pLng = Number(previewRequest.pickupLng);
    const dLat = Number(previewRequest.dropoffLat);
    const dLng = Number(previewRequest.dropoffLng);
    const isDelivery = previewRequest.type === 'delivery';
    const DirectionsService = new (window as any).google.maps.DirectionsService();

    if (!isNaN(pLat) && !isNaN(pLng)) {
      setResolvedPickupCoords({ lat: pLat, lng: pLng });
      setPreviewMapCenter({ lat: pLat, lng: pLng });
    }

    const resolveAndRoute = (pickup: { lat: number; lng: number }) => {
      setResolvedPickupCoords(pickup);
      setPreviewMapCenter(pickup);

      DirectionsService.route({
        origin: new (window as any).google.maps.LatLng(currentLocation.lat, currentLocation.lng),
        destination: new (window as any).google.maps.LatLng(pickup.lat, pickup.lng),
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
      }, (result: any, status: string) => {
        if (status === 'OK') setDirectionsResult(result);
      });

      if (isDelivery && !isNaN(dLat) && !isNaN(dLng)) {
        DirectionsService.route({
          origin: new (window as any).google.maps.LatLng(pickup.lat, pickup.lng),
          destination: new (window as any).google.maps.LatLng(dLat, dLng),
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
        }, (result: any, status: string) => {
          if (status === 'OK') setDeliveryRouteResult(result);
        });
      }
    };

    if (!isNaN(pLat) && !isNaN(pLng)) {
      resolveAndRoute({ lat: pLat, lng: pLng });
    } else if (isDelivery) {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
      const address = previewRequest.pickupAddress || previewRequest.pickup;
      if (apiKey && address) {
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
          .then(res => res.json())
          .then(data => {
            if (data.status === 'OK' && data.results?.[0]) {
              const loc = data.results[0].geometry.location;
              resolveAndRoute({ lat: loc.lat, lng: loc.lng });
            }
          })
          .catch(() => {});
      }
    }
  }, [previewRequest, isMapsLoaded, currentLocation]);

  const handleOpenPreview = (request: PassengerRequest) => { setDirectionsResult(null); setDeliveryRouteResult(null); setResolvedPickupCoords(null); setPreviewRequest(request); };

  const handleAcceptRequest = async (request: PassengerRequest) => {
    if (!user?.id) return alert('You must be logged in as a driver.');
    if (!(user?.serviceTypes || []).includes(request.type)) {
      return alert('You can only accept requests that match your service types.');
    }
    const activeStatuses = ['accepted', 'on-the-way', 'arrived', 'in-progress'];
    const { data: allLobbies } = await supabaseHelpers.getLobbies();
    if (allLobbies?.some((l: any) => l.driver_id === user.id && activeStatuses.includes(l.status))) return alert('You already have an active ride.');
    let passengerDetails = request.passengerDetails || [];
    if (request.lobbyId) {
      const { data: updatedLobby, error: acceptError } = await supabaseHelpers.acceptLobbyAsDriver(request.lobbyId, user.id, user.name, user.todaPlate, '4.8');
      if (acceptError) return alert('Failed to accept shared ride lobby.');
      passengerDetails = Array.isArray(updatedLobby?.passengers_json) ? updatedLobby.passengers_json : passengerDetails;
    }
    const acceptedRide = { ...request, passengerDetails, driverId: user.id, driverName: user.name, driverPlate: user.todaPlate, driverRating: '4.8', status: 'accepted', acceptedAt: new Date().toISOString(), eta: '5 mins' };

    if (request.type === 'delivery' && (request.orderId || request.orderNumber)) {
      if (request.orderId) {
        const { error: directErr } = await supabase
          .from('orders')
          .update({ status: 'on-the-way', driver_name: user.name || 'Driver', updated_at: new Date().toISOString() })
          .eq('id', request.orderId);
        if (directErr) console.error('❌ Direct orders update failed:', directErr);
        else console.log('✅ Orders table updated to on-the-way (direct)');
      }
      await supabaseHelpers.updateDeliveryOrderStatus(request.orderId, request.orderNumber, 'on-the-way');
      if (request.id && !request.id.startsWith('lobby_')) {
        await supabaseHelpers.updateRideRequest(request.id, { status: 'accepted', driver_id: user.id });
      }
    }

    setPreviewRequest(null);
    setShowAccepted(true);
    setTimeout(() => {
      navigate('/rider/active-ride', { state: { acceptedRide } });
    }, 2000);
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = { delivery: 'DELIVERY', shared: 'RIDE SHARE', private: 'PRIVATE RIDE' };
    return labels[type] || type.toUpperCase();
  };

  const filteredRequests = requests.filter(r => selectedCategory === 'all' || r.type === selectedCategory);
  const canAcceptRequest = (request: PassengerRequest) => (user?.serviceTypes || []).includes(request.type);
  const requestsMatchingServiceTypes = filteredRequests.filter(r => canAcceptRequest(r));

  const recommendedPickup = requestsMatchingServiceTypes.filter(r => r.type === 'private' && r.pickupLat && r.pickupLng).reduce<null | (PassengerRequest & { __distance: number; __eta: number })>((best, r) => {
    const dist = haversineDistance(currentLocation, { lat: Number(r.pickupLat), lng: Number(r.pickupLng) });
    return (!best || dist < best.__distance) ? { ...r, __distance: dist, __eta: estimateETA(dist) } : best;
  }, null);

  const sortedRequests = recommendedPickup
    ? [recommendedPickup as PassengerRequest, ...filteredRequests.filter(r => r.id !== recommendedPickup.id)]
    : filteredRequests;

  return (
    <div className="min-h-screen bg-[#F8F9FA] relative">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1"><h1 className="text-lg md:text-xl font-extrabold text-[#E11D48]">Passenger Requests</h1></div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
          {['all', 'shared', 'private', 'delivery'].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-[#E11D48] text-white shadow-md' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
              {cat === 'all' ? 'All' : cat === 'shared' ? '👥 Share' : cat === 'private' ? '👤 Private' : '📦 Delivery'}
            </button>
          ))}
        </div>

        {/* Request Count */}
        {sortedRequests.length > 0 && (
          <p className="text-xs text-[#94A3B8] font-medium">{sortedRequests.length} request{sortedRequests.length !== 1 ? 's' : ''} available</p>
        )}

        {/* Request Cards */}
        {sortedRequests.map((request) => {
          const canAccept = canAcceptRequest(request);
          return (
            <Card key={request.id} className={`border-2 transition-all overflow-hidden ${
              !canAccept ? 'bg-gray-50 opacity-70 border-gray-200' :
              recommendedPickup && request.id === recommendedPickup.id ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-400 shadow-md' :
              'bg-white border-[#E2E8F0] shadow-sm'
            }`}>
              {/* Top: Type icon + Name + Amount */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    request.type === 'delivery' ? 'bg-[#DBEAFE]' :
                    request.type === 'shared' ? 'bg-[#FEF3C7]' : 'bg-[#F0FDF4]'
                  }`}>
                    {request.customerPhoto === 'shared' ? (
                      <Users className="w-5 h-5 text-[#E11D48]" />
                    ) : request.type === 'delivery' ? (
                      <Package className="w-5 h-5 text-[#3B82F6]" />
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[#121212] text-sm truncate">{request.customerName}</p>
                    {request.type === 'shared' && request.passengerDetails && request.passengerDetails.length > 1 && (
                      <p className="text-[10px] text-[#94A3B8] truncate">
                        {request.passengerDetails.map((p: any) => p.name || 'Passenger').join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-extrabold text-lg text-[#E11D48]">₱{request.amount}</p>
                  <Badge className={`text-[9px] border-0 ${
                    request.type === 'delivery' ? 'bg-[#DBEAFE] text-[#3B82F6]' :
                    request.type === 'shared' ? 'bg-[#FEF3C7] text-[#F59E0B]' : 'bg-[#F0FDF4] text-[#10B981]'
                  }`}>
                    {request.type === 'delivery' ? '📦 Delivery' : request.type === 'shared' ? '👥 Share' : '👤 Private'}
                  </Badge>
                </div>
              </div>

              {/* Pickup & Dropoff with connector */}
              <div className="px-4 py-2">
                <div className="flex items-stretch gap-2">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <div className="w-0.5 flex-1 bg-gray-200 my-0.5" />
                    <div className="w-2 h-2 rounded-full bg-[#E11D48] shrink-0" />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div>
                      <p className="text-[10px] text-green-600 font-bold uppercase">Pickup</p>
                      <p className="text-xs font-semibold text-[#121212] truncate">{request.pickup}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#E11D48] font-bold uppercase">Drop-off</p>
                      <p className="text-xs font-semibold text-[#121212] truncate">{request.dropoff}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="px-4 pb-3 pt-1">
                {!canAccept && (
                  <Badge className="bg-gray-200 text-gray-500 text-[10px] mb-2">Not in your service types</Badge>
                )}
                <Button
                  onClick={() => handleOpenPreview(request)}
                  disabled={!canAccept}
                  className={`w-full uppercase text-xs md:text-sm py-5 md:py-6 font-bold rounded-xl ${
                    canAccept ? 'bg-[#E11D48] hover:bg-[#BE123C] shadow-lg shadow-rose-200' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {canAccept ? (request.lobbyId ? '👥 View Lobby' : '🛵 View & Accept') : 'Not Available'}
                </Button>
              </div>
            </Card>
          );
        })}

        {sortedRequests.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
            <p className="text-sm text-[#94A3B8] font-medium">No passenger requests</p>
            <p className="text-xs text-[#CBD5E1] mt-1">New requests will appear here</p>
          </div>
        )}
      </div>

      {/* Confirm Accept Popup */}
      {showConfirmAccept && confirmRequest && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
          <div className="bg-white rounded-3xl p-6 mx-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-[#E11D48]" />
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">Accept this request?</h2>
            <p className="text-gray-500 text-sm mb-1">
              {confirmRequest.type === 'shared' ? 'Shared Ride' : confirmRequest.type === 'delivery' ? 'Delivery' : 'Private Ride'}
            </p>
            <p className="text-sm font-semibold text-gray-700 mb-1">{confirmRequest.pickup} → {confirmRequest.dropoff}</p>
            <p className="text-lg font-bold text-[#E11D48] mb-4">₱{confirmRequest.amount}</p>
            <div className="flex gap-3">
              <Button onClick={() => { setShowConfirmAccept(false); setConfirmRequest(null); }} variant="outline" className="flex-1 border-gray-300 text-gray-600 uppercase">Cancel</Button>
              <Button onClick={async () => { setShowConfirmAccept(false); setConfirmRequest(null); await handleAcceptRequest(confirmRequest); }} className="flex-1 bg-[#E11D48] hover:bg-[#BE123C] uppercase">Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Accepted Popup */}
      {showAccepted && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 mx-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Request Accepted!</h2>
            <p className="text-gray-500 text-sm">Opening your active ride...</p>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewRequest && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end">
          <div className="bg-white w-full max-h-[90vh] rounded-t-3xl flex flex-col overflow-hidden">
            <div className="bg-[#E11D48] text-white px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Route Preview</h2>
              <button onClick={() => setPreviewRequest(null)} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {isMapsLoaded ? (
              <div className="w-full h-64 md:h-80">
                <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={previewMapCenter} zoom={14} options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false }}>
                  <Marker position={currentLocation} icon={createDriverMarkerIcon()} title="Your Location" />
                  {resolvedPickupCoords && <Marker position={resolvedPickupCoords} icon={createCustomerMarkerIcon()} title="Pickup" />}
                  {previewRequest.dropoffLat && previewRequest.dropoffLng && (
                    <Marker position={{ lat: Number(previewRequest.dropoffLat), lng: Number(previewRequest.dropoffLng) }} icon={createDropoffMarkerIcon()} title="Drop-off" />
                  )}
                  {directionsResult && <DirectionsRenderer directions={directionsResult} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#10B981", strokeWeight: 5, strokeOpacity: 0.85 } }} />}
                  {deliveryRouteResult && <DirectionsRenderer directions={deliveryRouteResult} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#E11D48", strokeWeight: 5, strokeOpacity: 0.85 } }} />}
                </GoogleMap>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center"><p className="text-[#64748B]">Loading map...</p></div>
            )}
            <div className="p-4 space-y-3">
              <div className="flex items-stretch gap-2">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <div className="w-0.5 flex-1 bg-gray-200 my-0.5" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E11D48] shrink-0" />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <p className="text-[10px] text-green-600 uppercase font-bold">Pickup</p>
                    <p className="text-sm font-semibold">{previewRequest.pickup}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${previewRequest.type === 'delivery' ? 'bg-red-50' : ''}`}>
                    <p className={`text-[10px] uppercase font-bold ${previewRequest.type === 'delivery' ? 'text-[#E11D48]' : 'text-[#64748B]'}`}>
                      {previewRequest.type === 'delivery' ? 'Deliver to Customer' : 'Drop-off'}
                    </p>
                    <p className="text-sm font-semibold">{previewRequest.dropoff}</p>
                  </div>
                </div>
              </div>
              <Button onClick={() => { setConfirmRequest(previewRequest); setShowConfirmAccept(true); }} className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6 font-bold">Accept & Navigate</Button>
              <Button onClick={() => setPreviewRequest(null)} variant="outline" className="w-full border-[#E11D48] text-[#E11D48] uppercase">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Ride Floating Button */}
      <ActiveRideButton />
    </div>
  );
}
