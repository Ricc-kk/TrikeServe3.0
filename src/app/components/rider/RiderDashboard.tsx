import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import {
  Home as HomeIcon, 
  Package, 
  Users, 
  DollarSign, 
  Camera, 
  Navigation,
  Calendar,
  UserCircle,
  MapPin,
  MoreHorizontal,
  Power,
  Car,
  Settings,
  Bell,
  Star,
  X,
  Zap,
  MessageCircle
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

// Get Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Debug: print runtime API key (helps confirm import.meta.env is available at runtime)
// Remove this log once you've verified the environment value
console.log('DEBUG: VITE_GOOGLE_MAPS_API_KEY =', GOOGLE_MAPS_API_KEY);
const GOOGLE_MAPS_LIBRARIES = ["places"] as const;

interface IncomingRequest {
  id: string;
  type: 'delivery' | 'shared' | 'private';
  pickup: string;
  dropoff: string;
  payment: 'COD' | 'PREPAID';
  amount: number;
  foodCost?: number;
  passengers?: number;
  waitingPassengers?: number;
}

export default function RiderDashboard() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [mode, setMode] = useState<'shared' | 'delivery'>('shared');
  const [currentSeats, setCurrentSeats] = useState(user?.currentSeats || 0);
  const [earnings, setEarnings] = useState(450);
  const [activeTrip, setActiveTrip] = useState<IncomingRequest | null>(null);
  const [showServiceTypes, setShowServiceTypes] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [selectedServices, setSelectedServices] = useState<string[]>(user?.serviceTypes || ['shared', 'delivery']);
  const [destination, setDestination] = useState('');
  const [totalPendingRequests, setTotalPendingRequests] = useState(0);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [activeRideData, setActiveRideData] = useState<any>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [tripsCompletedCount, setTripsCompletedCount] = useState(0);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 }); // Default: Manila
  const [selectedMarker, setSelectedMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Additional UI state for showing passenger/accepted markers and fullscreen behavior
  const [passengerRequests, setPassengerRequests] = useState<any[]>([]);
  const [acceptedRides, setAcceptedRides] = useState<any[]>([]);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  // Refs for GoogleMap instance and container DOM node
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Load passenger requests & accepted rides from localStorage so driver can see customer icons
  useEffect(() => {
    const loadStoredRequests = () => {
      try {
        const raw = localStorage.getItem('trikeserve_ride_requests');
        const rawAccepted = localStorage.getItem('trikeserve_accepted_rides');
        const reqs = raw ? JSON.parse(raw) : [];
        const accepted = rawAccepted ? JSON.parse(rawAccepted) : [];
        setPassengerRequests(Array.isArray(reqs) ? reqs : []);
        setAcceptedRides(Array.isArray(accepted) ? accepted : []);
      } catch (e) {
        console.error('Error loading stored requests:', e);
        setPassengerRequests([]);
        setAcceptedRides([]);
      }
    };

    loadStoredRequests();
    const interval = setInterval(loadStoredRequests, 3000);
    window.addEventListener('storage', loadStoredRequests);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', loadStoredRequests);
    };
  }, []);

  // Helper: try to extract lat/lng from a stored request object
  const coordsFromRequest = useCallback((r: any) => {
    if (!r) return null;
    if (typeof r.pickupLat === 'number' && typeof r.pickupLng === 'number') return { lat: r.pickupLat, lng: r.pickupLng };
    if (r.pickup_coords && typeof r.pickup_coords.lat === 'number' && typeof r.pickup_coords.lng === 'number') return { lat: r.pickup_coords.lat, lng: r.pickup_coords.lng };
    if (typeof r.pickup === 'string') {
      const parts = r.pickup.split(',').map((p: string) => p.trim());
      if (parts.length === 2) {
        const la = Number(parts[0]);
        const lo = Number(parts[1]);
        if (!Number.isNaN(la) && !Number.isNaN(lo)) return { lat: la, lng: lo };
      }
    }
    return null;
  }, []);

  // When an active ride status changes to in-progress (picked up), fullscreen the map to focus on navigation
  useEffect(() => {
    if (activeRideData && activeRideData.status === 'in-progress') {
      if (!isMapFullscreen) {
        try {
          if (mapContainerRef.current && (mapContainerRef.current as any).requestFullscreen) {
            (mapContainerRef.current as any).requestFullscreen();
          } else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
          }
        } catch (e) {
          console.warn('Failed to enter fullscreen:', e);
        }
        // Always update state so we still apply the CSS-based fullscreen fallback (hide UI, expand map)
        setIsMapFullscreen(true);
      }

      // If active ride includes a dropoff or route center, try to center map
      if (mapRef.current) {
        const dest = coordsFromRequest(activeRideData) || coordsFromRequest({ pickup: activeRideData.dropoff }) || null;
        try {
          if (dest && mapRef.current.panTo) {
            mapRef.current.panTo(dest);
            mapRef.current.setZoom?.(16);
          }
        } catch (e) {}
      }
    }
  }, [activeRideData, isMapFullscreen, coordsFromRequest]);

  // Toggle fullscreen manually
  const toggleFullscreen = async () => {
    try {
      if (!isMapFullscreen) {
        if (mapContainerRef.current && (mapContainerRef.current as any).requestFullscreen) {
          await (mapContainerRef.current as any).requestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setIsMapFullscreen(true);
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setIsMapFullscreen(false);
      }
    } catch (e) {
      console.warn('Fullscreen toggle failed', e);
      // Apply CSS fallback
      setIsMapFullscreen(prev => !prev);
    }
  };

  // Load Google Maps SDK via shared loader
  const { isLoaded: isMapsLoaded, loadError: mapsLoadError, blocked, apiKeyPresent } = useMapLoader();

  // Get user's current location on component mount
  useEffect(() => {
    setIsLoadingLocation(true);
    setLocationError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setMapCenter({ lat: latitude, lng: longitude });
          setIsLoadingLocation(false);
          console.log('User location:', latitude, longitude);
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          setLocationError(error.message);
          setIsLoadingLocation(false);
          // Keep default location (Manila) if geolocation fails
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.warn('Geolocation not supported by browser');
      setLocationError('Geolocation not supported');
      setIsLoadingLocation(false);
    }
  }, []);

  // Persist online status and service types to auth context
  useEffect(() => {
    if (user && updateProfile) {
      updateProfile({
        isOnline,
        serviceTypes: selectedServices,
        currentSeats
      });
    }
  }, [isOnline, selectedServices, currentSeats, user, updateProfile]);

  // Check for active ride in localStorage
  useEffect(() => {
    const checkActiveRide = () => {
      const savedRide = localStorage.getItem('trikeserve_active_ride');
      if (savedRide) {
        try {
          const ride = JSON.parse(savedRide);

          // Only consider it an active ride if status is truly active
          const activeStatuses = ['accepted', 'on-the-way', 'arrived', 'in-progress'];
          if (ride.status && activeStatuses.includes(ride.status)) {
            setHasActiveRide(true);
            setActiveRideData(ride);
          } else {
            // Clear completed or invalid rides
            localStorage.removeItem('trikeserve_active_ride');
            setHasActiveRide(false);
            setActiveRideData(null);
          }
        } catch (error) {
          console.error('Error loading active ride:', error);
          // Clear invalid data
          localStorage.removeItem('trikeserve_active_ride');
          setHasActiveRide(false);
          setActiveRideData(null);
        }
      } else {
        setHasActiveRide(false);
        setActiveRideData(null);
      }
    };

    checkActiveRide();

    // Poll for active ride updates
    const interval = setInterval(checkActiveRide, 2000);

    return () => clearInterval(interval);
  }, []);

  // Load and monitor passenger requests from Supabase (for real-time accuracy)
  useEffect(() => {
    const loadRequests = async () => {
      try {
        // Fetch pending ride requests from Supabase (not localStorage)
        const { data: rideRequests, error: dbError } = await supabaseHelpers.getRideRequests({
          status: 'pending'
        });

        if (dbError) {
          console.error('❌ Error loading requests from database:', dbError);
          setTotalPendingRequests(0);
          return;
        }

        if (rideRequests && rideRequests.length > 0) {
          setTotalPendingRequests(rideRequests.length);
          console.log('✅ Loaded passenger count from Supabase:', rideRequests.length);
        } else {
          setTotalPendingRequests(0);
          console.log('📭 No pending passenger requests in database');
        }
      } catch (error) {
        console.error('❌ Error loading requests:', error);
        setTotalPendingRequests(0);
      }
    };

    // Load initially
    loadRequests();

    // Poll for updates every 3 seconds (matches PassengerRequests polling interval)
    const interval = setInterval(loadRequests, 3000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Count unread messages from passengers
  useEffect(() => {
    const countUnreadMessages = () => {
      let unreadCount = 0;
      
      // Scan localStorage for all chat keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chat_')) {
          try {
            const messages = JSON.parse(localStorage.getItem(key) || '[]');
            // Count unread messages from passengers (sent by customers)
            const unread = messages.filter((m: any) => 
              m.senderType === 'passenger' && !m.read
            ).length;
            unreadCount += unread;
          } catch (error) {
            console.error('Error counting unread messages:', error);
          }
        }
      }
      
      setUnreadMessagesCount(unreadCount);
    };

    // Count initially
    countUnreadMessages();

    // Poll for updates every 2 seconds
    const interval = setInterval(countUnreadMessages, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('chat_')) {
        countUnreadMessages();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Fetch completed trips count
  useEffect(() => {
    const fetchCompletedTripsCount = async () => {
      try {
        // Get completed rides from database for this driver
        const { data: completedRides, error } = await supabaseHelpers.getRideRequests({
          driverId: user?.id,
          status: 'completed'
        });

        if (error) {
          console.error('❌ Error fetching completed rides:', error);
          return;
        }

        // Also check localStorage for ride history
        const historyKey = `ride_history_${user?.id}`;
        const historyData = localStorage.getItem(historyKey);
        let localCount = 0;
        if (historyData) {
          try {
            localCount = JSON.parse(historyData).filter((r: any) => r.status === 'completed').length;
          } catch (error) {
            console.error('❌ Error parsing ride history:', error);
          }
        }

        // Combine counts (avoid double counting)
        const totalCount = (completedRides?.length || 0) + localCount;
        setTripsCompletedCount(totalCount);

        console.log('✅ Completed trips count:', totalCount);
      } catch (error) {
        console.error('❌ Error fetching completed trips count:', error);
      }
    };

    if (user?.id) {
      fetchCompletedTripsCount();

      // Poll for updates every 10 seconds
      const interval = setInterval(fetchCompletedTripsCount, 10000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  const handleCompleteTrip = () => {
    if (activeTrip) {
      // Update earnings and UI state
      setEarnings(prev => prev + activeTrip.amount);
      setActiveTrip(null);
      setCurrentSeats(0);

      // Mark active ride as completed in localStorage so customer side will update
      try {
        const raw = localStorage.getItem('trikeserve_active_ride');
        if (raw) {
          const ar = JSON.parse(raw);
          if (!ar.completedAt) ar.completedAt = new Date().toISOString();
          ar.status = 'completed';
          localStorage.setItem('trikeserve_active_ride', JSON.stringify(ar));
          window.dispatchEvent(new StorageEvent('storage', { key: 'trikeserve_active_ride', newValue: JSON.stringify(ar) }));
        }

        // Also update accepted rides list if present
        const rawAccepted = localStorage.getItem('trikeserve_accepted_rides');
        if (rawAccepted) {
          try {
            const accepted = JSON.parse(rawAccepted);
            const idx = accepted.findIndex((r: any) => r.id === activeTrip.id);
            if (idx >= 0) {
              accepted[idx].status = 'completed';
              accepted[idx].completedAt = new Date().toISOString();
              localStorage.setItem('trikeserve_accepted_rides', JSON.stringify(accepted));
              window.dispatchEvent(new StorageEvent('storage', { key: 'trikeserve_accepted_rides', newValue: JSON.stringify(accepted) }));
            }
          } catch (e) {
            console.warn('Error updating accepted rides on complete:', e);
          }
        }
      } catch (e) {
        console.warn('Error marking active ride complete:', e);
      }
      // Clear active ride UI
      setHasActiveRide(false);
      setActiveRideData(null);
    }
  };

  // When driver has an active ride, periodically update their current coordinates into localStorage
  useEffect(() => {
    if (!hasActiveRide) return;
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('trikeserve_active_ride');
        if (!raw) return;
        const ar = JSON.parse(raw);
        // Update driver location from mapCenter
        ar.driverLat = mapCenter.lat;
        ar.driverLng = mapCenter.lng;
        ar.lastUpdated = new Date().toISOString();
        localStorage.setItem('trikeserve_active_ride', JSON.stringify(ar));
        window.dispatchEvent(new StorageEvent('storage', { key: 'trikeserve_active_ride', newValue: JSON.stringify(ar) }));
      } catch (e) {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [hasActiveRide, mapCenter]);

  return (
    <div className="h-screen flex flex-col bg-[#F8F9FA] relative">
      {/* Full Screen Map */}
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <div className="text-center">
              <p className="text-xl font-bold text-red-600 mb-4">⚠️ Google Maps API Key Missing</p>
              <p className="text-gray-700 mb-4">To use Google Maps, please:</p>
              <ol className="text-left text-sm text-gray-600 mb-4">
                <li>1. Get a Google Maps API Key from Google Cloud Console</li>
                <li>2. Create a .env.local file in the project root</li>
                <li>3. Add: VITE_GOOGLE_MAPS_API_KEY=your_api_key</li>
                <li>4. Restart the dev server</li>
              </ol>
              <p className="text-xs text-gray-500">Default location shown: Manila, Philippines</p>
            </div>
          </div>
        ) : isMapsLoaded && !blocked && apiKeyPresent ? (
          <div ref={mapContainerRef} className={isMapFullscreen ? 'fixed inset-0 z-[2000] bg-white' : 'w-full h-full relative'}>
            <GoogleMap
              onLoad={(map) => { mapRef.current = map; }}
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={mapCenter}
              zoom={15}
              options={{
                zoomControl: false,
                fullscreenControl: true,
                streetViewControl: false,
                mapTypeControl: true,
              }}
            >
              {/* Current Location Marker (driver) */}
              <Marker
                position={mapCenter}
                onClick={() => setSelectedMarker(mapCenter)}
                title="Your location"
              />

              {/* Passenger request markers (pending) */}
              {passengerRequests.map((r, idx) => {
                const c = coordsFromRequest(r);
                if (!c) return null;
                return (
                  <Marker
                    key={`pass_${r.id || idx}`}
                    position={c}
                    title={r.customerName || 'Passenger'}
                    onClick={() => setSelectedMarker(c)}
                    icon={{
                      // Simple colored circle marker for passenger
                      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                      fillColor: '#10B981',
                      fillOpacity: 1,
                      strokeWeight: 0,
                      scale: 1.2,
                    }}
                  />
                );
              })}

              {/* Accepted rides / active passengers */}
              {acceptedRides.map((r, idx) => {
                const c = coordsFromRequest(r) || coordsFromRequest({ pickup: r.pickup });
                if (!c) return null;
                return (
                  <Marker
                    key={`acc_${r.id || idx}`}
                    position={c}
                    title={r.customerName || 'Accepted Passenger'}
                    onClick={() => setSelectedMarker(c)}
                    icon={{
                      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                      fillColor: '#E11D48',
                      fillOpacity: 1,
                      strokeWeight: 0,
                      scale: 1.2,
                    }}
                  />
                );
              })}

              {/* Info Window for selected marker */}
              {selectedMarker && (
                <InfoWindow
                  position={selectedMarker}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-sm">
                    <p className="font-bold">Location</p>
                    <p className="text-gray-600">
                      {selectedMarker.lat.toFixed(4)}, {selectedMarker.lng.toFixed(4)}
                    </p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {/* Fullscreen toggle button */}
            <div className="absolute top-4 right-4 z-[1500]">
              <Button onClick={toggleFullscreen} className="bg-white shadow-md px-3 py-2 rounded-md">
                {isMapFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
              </Button>
            </div>
          </div>
        ) : isMapsLoaded && blocked ? (
          <div className="w-full h-full flex items-center justify-center bg-yellow-50">
            <div className="text-center max-w-md px-6">
              <p className="text-lg font-bold text-yellow-700 mb-2">⚠️ Google Maps scripts loaded but unavailable</p>
              <p className="text-sm text-yellow-800 mb-3">The Maps SDK appears to be blocked by a browser extension or network policy (window.google is missing). Try disabling ad-blockers or allow maps.googleapis.com.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#E11D48] text-white rounded-md">Retry</button>
                <button onClick={() => window.open('about:blank', '_blank')} className="px-4 py-2 border rounded-md">Open Incognito / Disable Extensions</button>
              </div>
            </div>
          </div>
        ) : mapsLoadError ? (
          <div className="w-full h-full flex items-center justify-center bg-red-50">
            <div className="text-center">
              <p className="text-xl font-bold text-red-600">⚠️ Map Error</p>
              <p className="text-sm text-red-700">{String(mapsLoadError?.message || mapsLoadError)}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        )
        )}

        {/* Toggle Online/Offline Button */}
        {!activeTrip && !isMapFullscreen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
            <Button
              onClick={() => setIsOnline(!isOnline)}
              className={`${
                isOnline 
                  ? 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
                  : 'bg-[#121212] hover:bg-[#2a2a2a] text-white'
              } px-8 py-3 rounded-full font-bold shadow-xl flex items-center gap-2`}
            >
              {isOnline ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  <span>You're Online</span>
                </>
              ) : (
                <>
                  <Power className="w-5 h-5" />
                  <span>Go Online</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Active Trip Card */}
        {activeTrip && !isMapFullscreen && (
          <div className="absolute bottom-20 left-0 right-0 z-[1000] p-4">
            <Card className="p-6 bg-white shadow-2xl border-2 border-[#E11D48]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge className="mb-2 bg-[#E11D48]">
                    {activeTrip.type === 'delivery' ? 'DELIVERY' : activeTrip.type.toUpperCase()}
                  </Badge>
                  <h3 className="font-bold text-lg text-[#121212]">Active Trip</h3>
                </div>
                <Badge variant="outline" className={activeTrip.payment === 'COD' ? 'border-orange-500 text-orange-500' : 'border-green-500 text-green-500'}>
                  {activeTrip.payment}
                </Badge>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <Navigation className="w-5 h-5 text-[#E11D48] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Pickup</p>
                    <p className="font-semibold text-[#121212]">{activeTrip.pickup}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Navigation className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Drop-off</p>
                    <p className="font-semibold text-[#121212]">{activeTrip.dropoff}</p>
                  </div>
                </div>
              </div>

              {activeTrip.type === 'delivery' && activeTrip.payment === 'COD' && Number(activeTrip.foodCost || 0) > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-semibold text-orange-800 mb-1">⚠️ Pay Restaurant First</p>
                  <p className="text-xs text-orange-700">Food Cost: ₱{activeTrip.foodCost?.toFixed(2)}</p>
                  <p className="text-xs text-orange-700">You'll be reimbursed by customer</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleCompleteTrip}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white uppercase"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  COMPLETE TRIP
                </Button>
              </div>

              <div className="mt-3 text-center">
                <p className="text-sm text-[#64748B]">
                  Delivery Fee: <span className="font-bold text-[#E11D48]">₱{activeTrip.amount.toFixed(2)}</span>
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Incoming Requests */}
        {/* Removed - requests only shown on Passenger Requests page */}

        {/* Bottom Sheet - Always visible (Quick Actions, Service Types, Destination, Auto Accept, Passenger Requests) */}
        {!activeTrip && !isMapFullscreen && (
          <div className="absolute bottom-20 left-0 right-0 z-[999] px-4">
            <Card className="bg-white shadow-xl rounded-t-3xl max-h-[70vh] overflow-y-auto">
              {/* Quick Actions */}
              <div className={`p-6 grid grid-cols-3 gap-4 ${!isOnline ? 'opacity-50 pointer-events-none' : ''}`}>
                <Link to="/rider/service-types" className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <Car className="w-7 h-7 text-[#64748B]" />
                  </div>
                  <span className="text-xs font-medium text-[#121212] text-center">Service<br/>Types</span>
                </Link>
                <Link to="/rider/my-destination" className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <MapPin className="w-7 h-7 text-[#64748B]" />
                  </div>
                  <span className="text-xs font-medium text-[#121212] text-center">My<br/>Destination</span>
                </Link>
                <Link to="/rider/auto-accept" className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                    <Zap className="w-7 h-7 text-[#64748B]" />
                  </div>
                  <span className="text-xs font-medium text-[#121212] text-center">Auto<br/>Accept</span>
                </Link>
              </div>

              {/* View All Passenger Requests Card - Always visible, button disabled when offline */}
              <div className="border-t border-gray-200 px-6 py-6">
                <div className="flex flex-col items-center text-center">
                  {/* Header */}
                  <h3 className="font-bold text-lg text-[#121212] mb-6">PASSENGER REQUESTS</h3>

                  {/* Icon and Text Section */}
                  <div className={`flex items-center justify-center gap-4 mb-6 ${!isOnline ? 'opacity-50' : ''}`}>
                    {/* Green Icon Circle */}
                    <div className="w-16 h-16 rounded-full bg-[#10B981] flex items-center justify-center flex-shrink-0">
                      <Users className="w-8 h-8 text-white" />
                    </div>

                    {/* Text Content */}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[#121212] mb-1">{totalPendingRequests} passengers waiting</p>
                      <p className="text-xs text-[#64748B]">Looking for tricycle<br/>service nearby</p>
                    </div>
                  </div>

                  {/* View All Button - Disabled when offline */}
                  {isOnline ? (
                    <Link to="/rider/passenger-requests" className="w-full">
                      <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold">
                        View All Passenger Requests
                      </Button>
                    </Link>
                  ) : (
                    <Button disabled className="w-full bg-gray-300 text-gray-500 font-bold cursor-not-allowed">
                      View All Passenger Requests
                    </Button>
                  )}
                </div>
              </div>


              {showServiceTypes && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[#121212]">Service Types</h3>
                    <button onClick={() => setShowServiceTypes(false)}>
                      <X className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </div>
                  <p className="text-sm text-[#64748B] mb-3">
                    Select which service types you want to accept
                  </p>
                  <div className="space-y-2">
                    {/* Delivery */}
                    <div
                      onClick={() => {
                        if (selectedServices.includes('delivery')) {
                          setSelectedServices(selectedServices.filter(s => s !== 'delivery'));
                        } else {
                          setSelectedServices([...selectedServices, 'delivery']);
                        }
                      }}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedServices.includes('delivery')
                          ? 'border-[#E11D48] bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-[#E11D48]" />
                        <div>
                          <p className="font-semibold text-[#121212]">Delivery</p>
                          <p className="text-xs text-[#64748B]">Food & package delivery</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedServices.includes('delivery')
                          ? 'bg-[#E11D48] border-[#E11D48]'
                          : 'border-gray-300'
                      }`}>
                        {selectedServices.includes('delivery') && (
                          <div className="w-2 h-2 bg-white rounded-sm" />
                        )}
                      </div>
                    </div>

                    {/* Ride Share (Sasabay) */}
                    <div
                      onClick={() => {
                        if (selectedServices.includes('shared')) {
                          setSelectedServices(selectedServices.filter(s => s !== 'shared'));
                        } else {
                          setSelectedServices([...selectedServices, 'shared']);
                        }
                      }}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedServices.includes('shared')
                          ? 'border-[#E11D48] bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-[#E11D48]" />
                        <div>
                          <p className="font-semibold text-[#121212]">Ride Share</p>
                          <p className="text-xs text-[#64748B]">Shared rides with other passengers</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedServices.includes('shared')
                          ? 'bg-[#E11D48] border-[#E11D48]'
                          : 'border-gray-300'
                      }`}>
                        {selectedServices.includes('shared') && (
                          <div className="w-2 h-2 bg-white rounded-sm" />
                        )}
                      </div>
                    </div>

                    {/* Private Ride (Pakyaw) */}
                    <div
                      onClick={() => {
                        if (selectedServices.includes('private')) {
                          setSelectedServices(selectedServices.filter(s => s !== 'private'));
                        } else {
                          setSelectedServices([...selectedServices, 'private']);
                        }
                      }}
                      className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedServices.includes('private')
                          ? 'border-[#E11D48] bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Car className="w-5 h-5 text-[#E11D48]" />
                        <div>
                          <p className="font-semibold text-[#121212]">Private Ride</p>
                          <p className="text-xs text-[#64748B]">Exclusive rides, no sharing</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedServices.includes('private')
                          ? 'bg-[#E11D48] border-[#E11D48]'
                          : 'border-gray-300'
                      }`}>
                        {selectedServices.includes('private') && (
                          <div className="w-2 h-2 bg-white rounded-sm" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Seat management removed from quick actions */}

                  <Button
                    onClick={() => setShowServiceTypes(false)}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                  >
                    Save Service Types
                  </Button>
                </div>
              )}

              {/* My Destination Section */}
              {showDestination && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[#121212]">My Destination</h3>
                    <button onClick={() => setShowDestination(false)}>
                      <X className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </div>
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Enter your destination"
                    className="w-full"
                  />
                  <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                    Set Destination
                  </Button>
                </div>
              )}

              {/* More Options Section */}
              {showMore && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[#121212]">More Options</h3>
                    <button onClick={() => setShowMore(false)}>
                      <X className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-center">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                    <Button variant="outline" className="w-full justify-center">
                      <Bell className="w-4 h-4 mr-2" />
                      Notifications
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Bottom Navigation - Fixed */}
      {!isMapFullscreen && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-[#CBD5E1] z-[1000]">
        <div className="px-4 py-3 flex justify-around items-center">
          <Button variant="ghost" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-5 h-5 text-[#00A854]" />
            <span className="text-xs font-semibold text-[#00A854]">Home</span>
          </Button>
          <Link to="/rider/earnings">
            <Button variant="ghost" className="flex flex-col items-center gap-1">
              <DollarSign className="w-5 h-5 text-[#64748B]" />
              <span className="text-xs text-[#64748B]">Earnings</span>
            </Button>
          </Link>
          <Link to="/rider/messages">
            <Button variant="ghost" className="flex flex-col items-center gap-1 relative">
              <MessageCircle className="w-5 h-5 text-[#64748B]" />
              <span className="text-xs text-[#64748B]">Messages</span>
              {unreadMessagesCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                </div>
              )}
            </Button>
          </Link>
          <Link to="/rider/profile">
            <Button variant="ghost" className="flex flex-col items-center gap-1">
              <UserCircle className="w-5 h-5 text-[#64748B]" />
              <span className="text-xs text-[#64748B]">Profile</span>
            </Button>
          </Link>
        </div>
        </div>
      )}

      {/* Active Ride Floating Icon */}
      {hasActiveRide && activeRideData && (
        <div 
          onClick={() => navigate('/rider/active-ride')}
          className="fixed bottom-24 right-4 z-[1500] cursor-pointer animate-bounce hover:animate-none"
        >
          <div className="bg-[#E11D48] text-white rounded-full w-16 h-16 flex items-center justify-center shadow-2xl border-4 border-white hover:scale-110 transition-transform">
            <div className="text-center">
              <p className="text-2xl">{activeRideData.customerPhoto || '🚗'}</p>
            </div>
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#10B981] rounded-full border-2 border-white flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}