import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Package, Users, Car, Clock, Check, X } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, Polyline, DirectionsRenderer } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "../../../lib/supabase";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";

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
        const mappedRequests = (rideRequests || []).map((req: any) => ({
          id: req.id,
          type: mapRideType(req.ride_type, req.pickup_location),
          pickup: formatPickup(req.pickup_location),
          dropoff: req.dropoff_location || 'Drop-off',
          payment: req.payment_method === 'GCASH' ? 'PREPAID' : 'COD',
          amount: Number(req.amount || 0),
          foodCost: Number(req.food_cost || 0),
          customerName: req.customer_name || 'Customer',
          customerPhoto: '👤',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          passengers: req.passenger_count || 1,
          customerId: req.customer_id,
          ...parseDeliveryTag(req.pickup_location),
          pickupAddress: req.pickup_address || undefined,
          dropoffAddress: req.dropoff_address || undefined,
          // For deliveries, parse coordinates from address if lat/lng columns are empty
          // Supports both old format ("lat, lng") and new format ("name|lat,lng")
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
            // The host's payment choice is stored on the lobby (COD = Cash, GCASH = Prepaid).
            payment: lobby.payment_method === 'COD' ? 'COD' : 'PREPAID',
            // price_per_seat stores the total private-ride fare; each passenger
            // pays fare ÷ passengers, but the driver earns the full fare.
            amount: Number(lobby.price_per_seat || 15),
            passengers: passengers.length,
            maxPassengers: Number(lobby.max_seats || 3),
            customerName: passengers.length > 1 ? `${passengers.length} Passengers` : (passengers[0]?.name || 'Customer'),
            customerPhoto: '🚲',
            distance: '2.5 km',
            estimatedTime: '7 mins',
            customerId: lobby.customer_id,
            lobbyId: lobby.id,
            passengerDetails: passengers,
            created_at: lobby.created_at,
          } as PassengerRequest;
        });
        setRequests([...mappedRequests, ...mappedLobbies]);
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

    // Set pickup coords for marker
    if (!isNaN(pLat) && !isNaN(pLng)) {
      setResolvedPickupCoords({ lat: pLat, lng: pLng });
      setPreviewMapCenter({ lat: pLat, lng: pLng });
    }

    // If no pickup coords available, try geocoding the restaurant address
    const resolveAndRoute = (pickup: { lat: number; lng: number }) => {
      setResolvedPickupCoords(pickup);
      setPreviewMapCenter(pickup);

      // Route 1: Driver → Pickup
      DirectionsService.route({
        origin: new (window as any).google.maps.LatLng(currentLocation.lat, currentLocation.lng),
        destination: new (window as any).google.maps.LatLng(pickup.lat, pickup.lng),
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
      }, (result: any, status: string) => {
        if (status === 'OK') setDirectionsResult(result);
      });

      // Route 2 (delivery): Pickup → Dropoff
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
      // Fallback: geocode the restaurant address using REST API
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

    // Keep delivery order status in sync with the driver workflow.
    if ((request.type === 'delivery' || request.orderId || request.orderNumber) && (request.orderId || request.orderNumber)) {
      const { error: orderStatusError } = await supabaseHelpers.updateDeliveryOrderStatus(
        request.orderId,
        request.orderNumber,
        'on-the-way'
      );

      if (orderStatusError) {
        console.error('❌ Failed to sync delivery order status to on-the-way:', orderStatusError);
      } else {
        console.log('✅ Delivery order status updated to on-the-way');
      }
    }

    navigate('/rider/active-ride', { state: { acceptedRide } });
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = { delivery: 'DELIVERY', shared: 'RIDE SHARE', private: 'PRIVATE RIDE' };
    return labels[type] || type.toUpperCase();
  };

  const filteredRequests = requests.filter(r => selectedCategory === 'all' || r.type === selectedCategory);
  // Drivers can SEE every request, but can only ACCEPT the ones matching their service types.
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
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1"><h1 className="text-xl font-extrabold text-[#E11D48]">Passenger Requests</h1></div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
          {['all', 'shared', 'private', 'delivery'].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-[#E11D48] text-white' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
              {cat === 'all' ? 'All' : cat === 'shared' ? 'Share Ride' : cat === 'private' ? 'Private Ride' : 'Delivery'}
            </button>
          ))}
        </div>
        {sortedRequests.map((request) => {
          const canAccept = canAcceptRequest(request);
          return (
            <Card key={request.id} className={`p-4 border-2 transition-colors ${!canAccept ? 'bg-gray-50 opacity-80' : recommendedPickup && request.id === recommendedPickup.id ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-400' : 'bg-white border-[#CBD5E1]'}`}>
              <div className="flex items-start gap-3 mb-3">
                <div className="text-4xl">{request.customerPhoto}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold">{request.customerName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-[#E11D48]">{getServiceLabel(request.type)}</Badge>
                        {!canAccept && <Badge className="bg-gray-400 text-white">Not in your service types</Badge>}
                      </div>
                    </div>
                    <div className="text-right"><p className="font-bold text-xl text-[#E11D48]">₱{request.amount}</p></div>
                  </div>
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex gap-2"><Navigation className="w-4 h-4 text-[#E11D48]" /><div className="flex-1"><p className="font-semibold">{request.pickup}</p></div></div>
                    <div className="flex gap-2"><Navigation className="w-4 h-4 text-green-600" /><div className="flex-1"><p className="font-semibold">{request.dropoff}</p></div></div>
                  </div>
                  <Button
                    onClick={() => handleOpenPreview(request)}
                    disabled={!canAccept}
                    className={`w-full uppercase ${canAccept ? 'bg-[#E11D48] hover:bg-[#BE123C]' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                  >
                    {canAccept ? (request.lobbyId ? 'View Lobby' : 'View & Accept') : 'Not in Your Service Types'}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {sortedRequests.length === 0 && <div className="text-center py-12"><Users className="w-10 h-10 text-[#94A3B8] mx-auto mb-4" /><p>No passenger requests</p></div>}
      </div>
      {previewRequest && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end">
          <div className="bg-white w-full max-h-[90vh] rounded-t-3xl flex flex-col overflow-hidden">
            <div className="bg-[#E11D48] text-white p-4 flex items-center justify-between"><h2 className="text-xl font-bold">Route Preview</h2><button onClick={() => setPreviewRequest(null)}><X className="w-6 h-6" /></button></div>
            {isMapsLoaded ? (
              <div className="w-full h-80">
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={previewMapCenter}
                  zoom={14}
                  options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false }}
                >
                  <Marker position={currentLocation} icon={createDriverMarkerIcon()} title="Your Location" />

                  {resolvedPickupCoords && (
                    <Marker
                      position={resolvedPickupCoords}
                      icon={createCustomerMarkerIcon()}
                      title="Pickup (Restaurant)"
                    />
                  )}

                  {previewRequest.dropoffLat && previewRequest.dropoffLng && (
                    <Marker
                      position={{ lat: Number(previewRequest.dropoffLat), lng: Number(previewRequest.dropoffLng) }}
                      icon={createDropoffMarkerIcon()}
                      title="Drop-off"
                    />
                  )}

                  {directionsResult && (
                    <DirectionsRenderer
                      directions={directionsResult}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: "#10B981",
                          strokeWeight: 5,
                          strokeOpacity: 0.85
                        }
                      }}
                    />
                  )}
                  {deliveryRouteResult && (
                    <DirectionsRenderer
                      directions={deliveryRouteResult}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: "#E11D48",
                          strokeWeight: 5,
                          strokeOpacity: 0.85
                        }
                      }}
                    />
                  )}
                </GoogleMap>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center"><p>Loading map...</p></div>
            )}
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <div className="flex-1 text-sm">
                    <p className="text-[10px] text-green-600 uppercase font-bold">Pickup</p>
                    <p className="font-semibold">{previewRequest.pickup}</p>
                  </div>
                </div>
                {previewRequest.type === 'delivery' && (
                  <div className="flex items-center gap-3 p-2 bg-red-50 rounded-lg">
                    <div className="w-3 h-3 rounded-full bg-[#E11D48]" />
                    <div className="flex-1 text-sm">
                      <p className="text-[10px] text-[#E11D48] uppercase font-bold">Deliver to Customer</p>
                      <p className="font-semibold">{previewRequest.dropoff}</p>
                    </div>
                  </div>
                )}
                {previewRequest.type !== 'delivery' && (
                  <div className="flex items-center gap-3 p-2">
                    <Navigation className="w-4 h-4 text-[#E11D48]" />
                    <div className="flex-1 text-sm"><p className="font-semibold">{previewRequest.dropoff}</p></div>
                  </div>
                )}
              </div>
              <Button onClick={() => handleAcceptRequest(previewRequest)} className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase h-12">Accept & Navigate</Button>
              <Button onClick={() => setPreviewRequest(null)} variant="outline" className="w-full border-[#E11D48] text-[#E11D48] uppercase">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
