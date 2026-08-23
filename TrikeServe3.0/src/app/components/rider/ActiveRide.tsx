import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Navigation, Phone, MapPin, CheckCircle, Minimize2, Maximize2, Users, X } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "../../../utils/supabase";
import useMapLoader from "@/lib/mapLoader";
import PassengerMessagingDB from "./PassengerMessagingDB";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";

type RideStatus = 'on-the-way' | 'arrived' | 'pickup' | 'drop-off' | 'payment';

interface ActiveRideData {
  id: string;
  type: 'delivery' | 'shared' | 'private';
  customerName: string;
  customerPhoto: string;
  pickup: string;
  dropoff: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  payment: 'COD' | 'PREPAID';
  amount: number;
  status: RideStatus;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  lobbyId?: string;
  passengerDetails?: any[];
}

export default function ActiveRide() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [rideData, setRideData] = useState<ActiveRideData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 });

  const isCompleting = useRef(false);
  const { isLoaded: isMapsLoaded } = useMapLoader();

  useEffect(() => {
    if (location.state?.acceptedRide) {
      const ride = { ...location.state.acceptedRide, status: 'on-the-way' as RideStatus };
      setRideData(ride);
      localStorage.setItem('trikeserve_active_ride', JSON.stringify(ride));
      // Shared-ride lobbies are accepted in PassengerRequests (acceptLobbyAsDriver),
      // so skip the ride_requests calls which only apply to private/delivery rides.
      if (ride.id && user?.id) {
        if (ride.lobbyId) {
          // Shared-ride lobbies are accepted in PassengerRequests (acceptLobbyAsDriver);
          // here we only need to track the driver's progress on the lobby so customers
          // see the status popups.
          supabaseHelpers.updateLobbyDriverStatus(ride.lobbyId, 'on-the-way', 'Driver is on the way!');
        } else {
          supabaseHelpers.acceptRideRequest(ride.id, user.id, user.name || 'Driver', user.user_metadata?.avatar_url, user.todaPlate || 'N/A', '4.8');
          supabaseHelpers.updateDriverRideStatus(ride.id, 'on-the-way', 'Driver is on the way!');
          notifyDeliveryStatus(ride, 'on-the-way', 'Driver is on the way!');
        }
      }
    } else {
      const saved = localStorage.getItem('trikeserve_active_ride');
      if (saved) try { setRideData(JSON.parse(saved)); } catch (e) {}
    }
  }, [location.state, user]);

  useEffect(() => { if (driverLocation) setMapCenter(driverLocation); }, [driverLocation]);



  // Request device GPS location
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[ActiveRide] Got device location:', pos.coords.latitude, pos.coords.longitude);
        setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.error('[ActiveRide] Geolocation error:', err.message);
        // Retry once after a short delay — sometimes the first request is rushed
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            (pos2) => setDriverLocation({ lat: pos2.coords.latitude, lng: pos2.coords.longitude }),
            () => console.error('[ActiveRide] Geolocation retry also failed'),
            { enableHighAccuracy: true, timeout: 15000 }
          );
        }, 2000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // Watch position for real-time updates
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        // Save to ride_requests (private rides), shared_ride_lobbies (share rides),
        // or orders table (deliveries)
        if (rideData?.lobbyId) {
          supabaseHelpers.updateLobbyDriverLocation(rideData.lobbyId, loc.lat, loc.lng);
        } else if (rideData?.orderId) {
          // Delivery: save GPS to BOTH orders table and ride_requests
          supabase.from('orders').update({ driver_lat: loc.lat, driver_lng: loc.lng, driver_name: rideData.driverName || 'Driver', updated_at: new Date().toISOString() }).eq('id', rideData.orderId).then(() => {}, () => {});
          if (rideData?.id) supabaseHelpers.updateRideRequest(rideData.id, { driver_lat: loc.lat, driver_lng: loc.lng, updated_at: new Date().toISOString() });
        } else if (rideData?.id) {
          supabaseHelpers.updateRideRequest(rideData.id, { driver_lat: loc.lat, driver_lng: loc.lng, updated_at: new Date().toISOString() });
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [rideData?.id, rideData?.lobbyId]);

  // Determine if we're heading to pickup or dropoff
  const isHeadingToPickup = rideData?.status === 'on-the-way' || rideData?.status === 'arrived';

  // For delivery rides: geocode the restaurant pickup address if lat/lng are missing
  useEffect(() => {
    if (!rideData) return;
    const isDelivery = Boolean(rideData.orderId || rideData.orderNumber) || String(rideData.pickup || '').startsWith('DELIVERY');
    if (!isDelivery) return;
    if (rideData.pickupLat && rideData.pickupLng) return; // Already has coordinates
    const address = rideData.pickupAddress || rideData.pickup;
    if (!address) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) return;
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'OK' && data.results?.[0]) {
          const loc = data.results[0].geometry.location;
          const updated = { ...rideData, pickupLat: loc.lat, pickupLng: loc.lng };
          setRideData(updated);
          localStorage.setItem('trikeserve_active_ride', JSON.stringify(updated));
        }
      })
      .catch(() => {});
  }, [rideData?.pickupAddress, rideData?.pickup, rideData?.pickupLat, rideData?.pickupLng]);

  useEffect(() => {
    if (!rideData || !isMapsLoaded || !(window as any).google) return;
    if (!driverLocation) return;

    let dest: { lat: number; lng: number } | null = null;
    if (isHeadingToPickup) {
      dest = rideData.pickupLat && rideData.pickupLng ? { lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) } : null;
    } else if (['pickup', 'drop-off'].includes(rideData.status)) {
      dest = rideData.dropoffLat && rideData.dropoffLng ? { lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) } : null;
    }

    if (!dest) { setDirections(null); return; }

    const DirectionsService = new (window as any).google.maps.DirectionsService();
    DirectionsService.route({
      origin: new (window as any).google.maps.LatLng(driverLocation.lat, driverLocation.lng),
      destination: new (window as any).google.maps.LatLng(dest.lat, dest.lng),
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === 'OK') {
        setDirections(result);
      } else {
        console.error('[ActiveRide] Directions failed:', status);
        setDirections(null);
      }
    });
  }, [driverLocation, rideData?.status, rideData?.pickupLat, rideData?.pickupLng, rideData?.dropoffLat, rideData?.dropoffLng, isMapsLoaded, isHeadingToPickup]);

  const isDeliveryRide = (ride: any) =>
    Boolean(ride?.orderId || ride?.orderNumber) ||
    String(ride?.pickup || '').startsWith('DELIVERY');

  // Notify the customer and business whenever the driver updates a delivery's
  // status (accepted/on-the-way -> arrived -> picked up -> dropped off).
  const notifyDeliveryStatus = (ride: any, dbStatus: string, message?: string) => {
    if (!isDeliveryRide(ride)) return;
    supabaseHelpers.notifyDeliveryStatusChange({
      pickupLocation: ride.pickup,
      customerId: ride.customerId || ride.passengerDetails?.[0]?.id,
      status: dbStatus,
      message,
    }).catch((err) => console.error('❌ Failed to send delivery notification:', err));
  };

  const updateStatus = (newStatus: RideStatus) => {
    if (!rideData) return;
    const updated = { ...rideData, status: newStatus };
    setRideData(updated);
    localStorage.setItem('trikeserve_active_ride', JSON.stringify(updated));
    const dbMap: Record<RideStatus, string> = { 'on-the-way': 'on-the-way', 'arrived': 'arrived', 'pickup': 'picked-up', 'drop-off': 'dropped-off', 'payment': 'awaiting-payment' };
    const messageMap: Record<RideStatus, string> = {
      'on-the-way': 'Driver is on the way!',
      'arrived': 'Driver has arrived!',
      'pickup': 'Passengers picked up!',
      'drop-off': 'Arrived at drop-off!',
      'payment': 'Please complete the payment.',
    };
    if (rideData.lobbyId) {
      // Lobby rides have no ride_requests row until completion, so track the
      // driver's progress on the lobby itself so customers see status popups.
      supabaseHelpers.updateLobbyDriverStatus(rideData.lobbyId, dbMap[newStatus], messageMap[newStatus]);
    } else {
      supabaseHelpers.updateDriverRideStatus(rideData.id, dbMap[newStatus], 'Status updated');
      // Deliveries: notify the customer and the business.
      notifyDeliveryStatus(rideData, dbMap[newStatus], messageMap[newStatus]);
    }
  };

  const completeRide = async () => {
    if (!rideData || isCompleting.current) return;
    isCompleting.current = true;
    try {

    if (isDeliveryRide(rideData)) {
      notifyDeliveryStatus(rideData, 'completed', 'Delivery completed!');
    }

    if (rideData.orderId || rideData.orderNumber) {
      const { error: orderStatusError } = await supabaseHelpers.updateDeliveryOrderStatus(
        rideData.orderId,
        rideData.orderNumber,
        'delivered'
      );

      if (orderStatusError) {
        console.error('❌ Failed to mark delivery order as delivered:', orderStatusError);
      } else {
        console.log('✅ Delivery order marked as delivered');

        // Notify the business that delivery is completed
        try {
          const orderData = await supabase
            .from('orders')
            .select('business_id, restaurant_name, order_number')
            .eq('id', rideData.orderId)
            .single();
          if (orderData?.data?.business_id) {
            await supabaseHelpers.notifyBusinessDeliveryCompleted({
              orderId: rideData.orderId,
              orderNumber: orderData.data.order_number || rideData.orderNumber || '',
              restaurantName: orderData.data.restaurant_name || '',
              businessUserId: orderData.data.business_id,
            });
            console.log('✅ Business notified: delivery completed');
          }
        } catch (notifError) {
          console.error('❌ Error notifying business:', notifError);
        }
      }
    }

    if (rideData.lobbyId) {
      // Shared ride: close the lobby and record the completed ride so it shows
      // in the driver's recent trips/earnings and the customer's activity log.
      const { lobby, ride } = await supabaseHelpers.completeSharedRide(rideData.lobbyId, {
        customerId: rideData.customerId || rideData.passengerDetails?.[0]?.id,
        driverId: user?.id,
        driverName: user?.name,
        driverRating: '4.8',
        pickup: rideData.pickup,
        dropoff: rideData.dropoff,
        pickupAddress: rideData.pickupAddress,
        dropoffAddress: rideData.dropoffAddress,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        dropoffLat: rideData.dropoffLat,
        dropoffLng: rideData.dropoffLng,
        amount: rideData.amount,
        passengerCount: rideData.passengerDetails?.length || 1,
        paymentMethod: rideData.payment === 'PREPAID' ? 'GCASH' : 'COD',
      });

      if (lobby?.error) console.error('❌ Failed to close shared ride lobby:', lobby.error);
      if (ride?.error) console.error('❌ Failed to record shared ride trip:', ride.error);
    } else {
      await supabaseHelpers.updateRideRequest(rideData.id, { status: 'completed' });
      await supabaseHelpers.updateDriverRideStatus(rideData.id, 'completed', 'Ride completed!');
    }

    localStorage.removeItem('trikeserve_active_ride');
    navigate('/rider');
    } finally {
      isCompleting.current = false;
    }
  };

  const markerIcon = (color: string) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.5" r="2.5" fill="white"/></svg>`)}`,
    scaledSize: new (window as any).google.maps.Size(40, 40),
    anchor: new (window as any).google.maps.Point(20, 40)
  });

  if (!rideData) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20 relative overflow-hidden">
      <div className="bg-[#E11D48] text-white p-4 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/rider')} className="text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-bold">Active Ride</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsMinimized(!isMinimized)} className="text-white hover:bg-white/20">{isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}</Button>
        </div>
      </div>

      <div className={`relative w-full transition-all duration-300 ${isMinimized ? 'h-[80vh]' : 'h-80'}`}>
        {isMapsLoaded ? (
          <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={driverLocation || mapCenter} zoom={15} options={{ disableDefaultUI: true }}>
            {driverLocation && (
              <Marker position={driverLocation} icon={{ url: tricycleIcon, scaledSize: new (window as any).google.maps.Size(44, 44), anchor: new (window as any).google.maps.Point(22, 22) }} zIndex={100} />
            )}
            {/* Pickup marker: only show when heading to pickup */}
            {isHeadingToPickup && rideData.pickupLat && (
              <Marker position={{ lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) }} icon={markerIcon('#10B981')} title="Pickup" />
            )}
            {/* Dropoff marker: only show when heading to dropoff */}
            {!isHeadingToPickup && rideData.dropoffLat && (
              <Marker position={{ lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) }} icon={markerIcon('#E11D48')} title="Drop-off" />
            )}

            {/* Google Directions route line */}
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: isHeadingToPickup ? '#10B981' : '#E11D48',
                    strokeWeight: 6,
                    strokeOpacity: 0.9,
                  },
                }}
              />
            )}

          </GoogleMap>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-gray-100 space-y-4 p-6">
            <Navigation className="w-12 h-12 text-[#E11D48] animate-pulse" />
            <p className="text-gray-500 font-bold text-center">Loading Map...</p>
            {!driverLocation && (
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-3">Waiting for your device location...</p>
                <Button onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => alert('Please enable Location Services in your device settings to use navigation.'),
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                }} className="bg-[#E11D48]">
                  <MapPin className="w-4 h-4 mr-2" />Enable Location
                </Button>
              </div>
            )}
          </div>
        )}
        <Button onClick={() => {
          const dest = isHeadingToPickup
            ? { lat: rideData.pickupLat, lng: rideData.pickupLng }
            : { lat: rideData.dropoffLat, lng: rideData.dropoffLng };
          if (dest && dest.lat) window.open(`https://www.google.com/maps/dir/?api=1&origin=${driverLocation?.lat},${driverLocation?.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`, '_blank');
        }} className="absolute top-3 right-3 bg-white text-black shadow-md hover:bg-gray-100"><Navigation className="w-4 h-4 mr-2" />Navigate</Button>
        {/* Route phase indicator banner */}
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-white text-xs font-bold shadow-md flex items-center gap-1.5 ${isHeadingToPickup ? 'bg-green-500' : 'bg-[#E11D48]'}`}>
          <div className={`w-2 h-2 rounded-full ${isHeadingToPickup ? 'bg-white animate-pulse' : 'bg-white animate-pulse'}`} />
          {isHeadingToPickup ? 'Heading to Pickup' : 'Heading to Drop-off'}
        </div>
      </div>

      <div className={isMinimized ? 'fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 h-[40vh] overflow-y-auto z-[1001]' : 'p-4 space-y-4'}>
        <Card className="p-4 border-2 border-gray-100 shadow-sm">
          <div className="flex gap-4 mb-3">
            <div className="text-4xl">{rideData.customerPhoto}</div>
            <div className="flex-1">
              <h2 className="font-bold text-lg">{rideData.customerName}</h2>
              <div className="flex gap-2 mt-1">
                <Badge className="bg-[#E11D48]">₱{rideData.amount}</Badge>
                <Badge variant="outline" className="text-gray-500">{rideData.payment === 'COD' ? 'Cash' : 'Prepaid'}</Badge>
              </div>
            </div>
          </div>
          <div className="space-y-3 mt-4">
            <div className={`flex gap-3 p-2 rounded-lg ${isHeadingToPickup ? 'bg-green-50 border border-green-200' : ''}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 ${isHeadingToPickup ? 'bg-green-500' : 'bg-gray-400'}`} />
              <div className="flex-1 text-sm">
                <p className="text-gray-500 text-xs">Pickup</p>
                <p className="font-semibold">{rideData.pickup}</p>
              </div>
              {isHeadingToPickup && <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold self-center">HERE</span>}
            </div>
            <div className={`flex gap-3 p-2 rounded-lg ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-red-50 border border-red-200' : ''}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-[#E11D48]' : 'bg-gray-400'}`} />
              <div className="flex-1 text-sm">
                <p className="text-gray-500 text-xs">Drop-off</p>
                <p className="font-semibold">{rideData.dropoff}</p>
              </div>
              {!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) && <span className="text-[10px] bg-[#E11D48] text-white px-2 py-0.5 rounded-full font-bold self-center">HERE</span>}
            </div>
          </div>
        </Card>
        <div className="grid gap-2">
          {rideData.status === 'on-the-way' && <Button onClick={() => updateStatus('arrived')} className="bg-[#E11D48] py-7 text-lg font-bold uppercase shadow-lg shadow-rose-200">I've Arrived</Button>}
          {rideData.status === 'arrived' && <Button onClick={() => updateStatus('pickup')} className="bg-[#E11D48] py-7 text-lg font-bold uppercase shadow-lg shadow-rose-200">Confirm Pickup</Button>}
          {rideData.status === 'pickup' && <Button onClick={() => updateStatus('drop-off')} className="bg-[#E11D48] py-7 text-lg font-bold uppercase shadow-lg shadow-rose-200">Arrived at Drop-off</Button>}
          {rideData.status === 'drop-off' && <Button onClick={() => updateStatus('payment')} className="bg-[#E11D48] py-7 text-lg font-bold uppercase shadow-lg shadow-rose-200">Confirm Drop-off</Button>}
          {rideData.status === 'payment' && <Button onClick={completeRide} className="bg-green-600 py-7 text-lg font-bold uppercase shadow-lg shadow-emerald-200">Complete Ride</Button>}
        </div>
      </div>
    </div>
  );
}
