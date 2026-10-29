import { useState, useEffect, useRef } from "react";
import { Marker, InfoWindow, DirectionsRenderer } from "@react-google-maps/api";
import GoogleMap from "@/app/components/ui/ThemedGoogleMap";
import useMapLoader from "@/lib/mapLoader";
import MapFullscreenToggle from "../ui/MapFullscreenToggle";
import {
  Home as HomeIcon, 
  Users, 
  Camera, 
  Navigation,
  Calendar,
  UserCircle,
  MoreHorizontal,
  Power,
  Settings,
  Bell,
  Star,
  X,
  MessageCircle,
  Clock,
  TrendingDown,
  Check,
  Car,
  Package,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import BottomNav from "../ui/BottomNav";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import { consumeWelcomeGreeting } from "../../../lib/welcomeGreeting";
import { isPointWithinTerminalRoute, supabaseHelpers } from "@/lib/supabase";
import { writeRiderActiveRide, clearRiderActiveRide, checkRiderActiveRide } from "../../../lib/riderActiveRide";
import { useTerminalQueue } from "../../hooks/useTerminalQueue";
import TerminalQueueCard from "./TerminalQueueCard";
import { createTricycleMarkerIcon } from "@/lib/mapIcons";
import { supabase } from "../../../lib/supabase";
import ActiveRideButton from "./ActiveRideButton";

// Get Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

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

const SERVICE_TYPE_LABELS = {
  shared: 'Ride Share',
  private: 'Private Ride',
  delivery: 'Delivery',
} as const;

export default function RiderDashboard() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const updateProfileRef = useRef(updateProfile);
  updateProfileRef.current = updateProfile;
  const dashboardRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  // Watches for private/delivery requests and auto-accepts them when enabled and the service type matches.
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [mode, setMode] = useState<'shared' | 'delivery'>('shared');
  const [currentSeats, setCurrentSeats] = useState(user?.currentSeats || 0);
  const [activeTrip, setActiveTrip] = useState<IncomingRequest | null>(null);
  // Explains the offline tap instead of leaving a dead button.
  const [showOfflineNotice, setShowOfflineNotice] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const configuredServiceTypes = Array.isArray(user?.serviceTypes) ? user.serviceTypes : [];
  const activeServiceCategory = configuredServiceTypes.includes('delivery') ? 'delivery' : 'rides';
  const activeServiceTypes = activeServiceCategory === 'delivery'
    ? (['delivery'] as const)
    : (['shared', 'private'] as const).filter((serviceType) => configuredServiceTypes.includes(serviceType));
  const [totalPendingRequests, setTotalPendingRequests] = useState(0);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [activeRideData, setActiveRideData] = useState<any>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [tripsCompletedCount, setTripsCompletedCount] = useState(0);
   const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 }); // Default: Gen T Deleon, Valenzuela
   const [selectedMarker, setSelectedMarker] = useState<{ lat: number; lng: number } | null>(null);
    const [pendingRequestsList, setPendingRequestsList] = useState<any[]>([]);
    const [navRoutePath, setNavRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
    const [navTargetRequest, setNavTargetRequest] = useState<any | null>(null);
    const [directionsResult, setDirectionsResult] = useState<any>(null);
    const [prioritizedRouteStops, setPrioritizedRouteStops] = useState<any[]>([]);
    const [prioritizationReasons, setPrioritizationReasons] = useState<any>(null);
    const [geocodeCache, setGeocodeCache] = useState<Record<string, { lat: number; lng: number }>>(() => {
      try {
        const cached = localStorage.getItem('trikeserve_geocode_cache');
        return cached ? JSON.parse(cached) : {};
      } catch {
        return {};
      }
    });
    const [directionsThrottleTime, setDirectionsThrottleTime] = useState<number>(0);
    const [isLoadingLocation, setIsLoadingLocation] = useState(true);
     const [locationError, setLocationError] = useState<string | null>(null);
    const [showWelcomeBack, setShowWelcomeBack] = useState(false);
    const [welcomeUserName, setWelcomeUserName] = useState('');

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsMapFullscreen(document.fullscreenElement === dashboardRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const selectMapType = (next: 'roadmap' | 'satellite') => {
    setMapType(next);
    mapRef.current?.setMapTypeId(next);
  };

    // Terminal queue — FIFO per terminal. Only the first driver may accept
    // private and share rides.
    const terminalQueueApi = useTerminalQueue();
    const {
      terminalId: queueTerminalId,
      terminalBoundary,
      terminalRoadWidthM,
      myEntry: queueEntry,
      leave: leaveQueue,
      hasNoTerminal,
      isResolvingTerminal,
    } = terminalQueueApi;

    const handleToggleOnline = async () => {
      const next = !isOnline;
      setIsOnline(next);
      // Going offline removes the driver from the queue so they don't hold a
      // position while unavailable; coming back online means re-queueing.
      if (!next && queueEntry) await leaveQueue();
    };

    // Safety net: never hold a queue slot while already on a ride — e.g. if the app
    // was closed between accepting and the slot being released.
    useEffect(() => {
      if (hasActiveRide && queueEntry) leaveQueue();
    }, [hasActiveRide, queueEntry?.id]);

    // Show welcome back popup after login
    useEffect(() => {
      // In-memory, not sessionStorage: only a real sign-in arms this, and a reload
      // must not replay it. See welcomeGreeting.ts.
      const name = consumeWelcomeGreeting();
      if (name === null) return;
      setWelcomeUserName(name || 'there');
      const timer = setTimeout(() => setShowWelcomeBack(true), 500);
      const hideTimer = setTimeout(() => setShowWelcomeBack(false), 3000);
      return () => { clearTimeout(timer); clearTimeout(hideTimer); };
    }, []);

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

  // Persist online status and current seats. Service types are saved on their
  // dedicated page so this dashboard cannot overwrite a newer selection with
  // stale modal state.
  useEffect(() => {
    if (user) {
      void updateProfileRef.current({
        isOnline,
        currentSeats
      });
    }
  }, [isOnline, currentSeats, user?.id]);

  // Check the database for an active ride. A saved ride is only a cache and can
  // remain "on-the-way" after the passenger cancels, so it cannot hold the driver
  // out of the queue on its own.
  useEffect(() => {
    let active = true;

    const checkActiveRide = async () => {
      if (!user?.id) {
        if (active) {
          setHasActiveRide(false);
          setActiveRideData(null);
        }
        return;
      }

      // This also recovers rides accepted on another device or after storage was
      // cleared. Query failures leave the last known UI state alone; they must not
      // be treated as proof that a ride was cancelled.
      const { ride: dbRide, error } = await checkRiderActiveRide(user.id);
      if (!active || error) return;

      if (dbRide) {
        writeRiderActiveRide(dbRide);
        setHasActiveRide(true);
        setActiveRideData(dbRide);
        return;
      }

      clearRiderActiveRide();
      setHasActiveRide(false);
      setActiveRideData(null);
    };

    checkActiveRide();

    // Poll for active ride updates
    const interval = setInterval(checkActiveRide, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id]);

    // Load and monitor passenger requests from Supabase with real-time updates
    useEffect(() => {
      const loadRequests = async () => {
        try {
          // Fetch pending ride requests from Supabase (not localStorage)
          const { data: rideRequests, error: dbError } = await supabaseHelpers.getRideRequests({
            status: 'pending'
          });

          // Fetch waiting shared ride lobbies from Supabase
          const { data: waitingLobbies, error: lobbyError } = await supabaseHelpers.getWaitingLobbiesForDriver();

          if (dbError) {
            console.error('❌ Dashboard: Error loading ride requests from database:', dbError);
          }

          if (lobbyError) {
            console.error('❌ Dashboard: Error loading waiting lobbies from database:', lobbyError);
          }

          // Save all pending ride requests for routing and prioritization.
          setPendingRequestsList(rideRequests || []);

          // Passenger Requests checks delivery coverage using the restaurant's
          // saved pin, while a ride request's pickup coordinates can point at the
          // customer or be empty. Resolve the same restaurant coordinates here
          // so the dashboard count uses the same terminal coverage rule.
          const getDeliveryOrderId = (request: any) => {
            if (request.order_id) return String(request.order_id);
            return String(request.pickup_location || '')
              .split('|')
              .find((part: string) => part.startsWith('ORDER_ID:'))
              ?.slice('ORDER_ID:'.length);
          };
          const deliveryRequests = (rideRequests || []).filter((request: any) => {
            const rideType = String(request.ride_type || '').toLowerCase();
            return rideType === 'delivery' || String(request.pickup_location || '').startsWith('DELIVERY|');
          });
          const deliveryOrderIds = [...new Set(deliveryRequests.map(getDeliveryOrderId).filter(Boolean))] as string[];
          const deliveryBusinessByOrderId = new Map<string, string>();
          const restaurantCoordinatesByBusinessId = new Map<string, { lat: number; lng: number }>();

          if (deliveryOrderIds.length > 0) {
            const { data: orders, error: ordersError } = await supabase
              .from('orders')
              .select('id, business_id')
              .in('id', deliveryOrderIds);
            if (ordersError) {
              console.warn('Dashboard: Could not load delivery order locations:', ordersError);
            }

            (orders || []).forEach((order: any) => {
              if (order.business_id) deliveryBusinessByOrderId.set(order.id, order.business_id);
            });

            const businessIds = [...new Set([...deliveryBusinessByOrderId.values()])];
            if (businessIds.length > 0) {
              const { data: restaurants, error: restaurantsError } = await supabase
                .from('restaurants')
                .select('business_user_id, latitude, longitude')
                .in('business_user_id', businessIds);
              if (restaurantsError) {
                console.warn('Dashboard: Could not load restaurant map pins:', restaurantsError);
              }

              (restaurants || []).forEach((restaurant: any) => {
                const lat = Number(restaurant.latitude);
                const lng = Number(restaurant.longitude);
                if (restaurant.business_user_id && Number.isFinite(lat) && Number.isFinite(lng)) {
                  restaurantCoordinatesByBusinessId.set(restaurant.business_user_id, { lat, lng });
                }
              });
            }
          }

          const serviceTypes = user?.serviceTypes || [];
          const canAcceptRequest = (request: any) => {
            if (!user?.id || hasNoTerminal || isResolvingTerminal) return false;
            if (supabaseHelpers.isDeclinedByDriver(request, user.id)) return false;

            const pickupLocation = String(request.pickup_location || '');
            const rideType = String(request.ride_type || '').toLowerCase();
            const taggedDelivery = pickupLocation.startsWith('DELIVERY|');
            const type = rideType === 'delivery' || taggedDelivery
              ? 'delivery'
              : rideType === 'share' || rideType === 'shared'
                ? 'shared'
                : 'private';

            if (!serviceTypes.includes(type)) return false;

            if (type === 'delivery') {
              if (!queueTerminalId) return false;
              if (request.terminal_id === queueTerminalId) return true;
              const orderId = getDeliveryOrderId(request);
              const businessId = orderId ? deliveryBusinessByOrderId.get(orderId) : undefined;
              const restaurantCoordinates = businessId ? restaurantCoordinatesByBusinessId.get(businessId) : undefined;
              const pickupLatValue = restaurantCoordinates?.lat ?? request.pickup_lat;
              const pickupLngValue = restaurantCoordinates?.lng ?? request.pickup_lng;
              if (pickupLatValue == null || pickupLngValue == null) return false;
              const pickupLat = Number(pickupLatValue);
              const pickupLng = Number(pickupLngValue);
              return Number.isFinite(pickupLat) && Number.isFinite(pickupLng) &&
                isPointWithinTerminalRoute(pickupLat, pickupLng, {
                  road: terminalBoundary,
                  widthM: terminalRoadWidthM,
                });
            }

            if (request.terminal_id && queueTerminalId && request.terminal_id !== queueTerminalId) return false;
            return true;
          };

          // Count pending requests for this rider's terminal and service types
          // even before they join the queue. Queue position controls accepting,
          // not whether the dashboard reflects incoming passenger demand.
          const seenOrderIds = new Set<string>();
          let availableRideRequestCount = 0;
          (rideRequests || []).forEach((request: any) => {
            if (supabaseHelpers.isDeclinedByDriver(request, user?.id)) return;
            if (request.order_id) {
              if (seenOrderIds.has(request.order_id)) return;
              seenOrderIds.add(request.order_id);
            }
            if (canAcceptRequest(request)) availableRideRequestCount += 1;
          });

          // Shared lobbies contribute their waiting passengers for the assigned
          // terminal even while this driver is outside the queue.
          const availableLobbyPassengers = (waitingLobbies || []).reduce((total: number, lobby: any) => {
            if (!canAcceptRequest({ ...lobby, ride_type: 'shared', pickup_location: lobby.pickup_location })) return total;
            if (lobby.terminal_id && queueTerminalId && lobby.terminal_id !== queueTerminalId) return total;
            const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
            return total + passengers.length;
          }, 0);

          const totalCount = availableRideRequestCount + availableLobbyPassengers;

          setTotalPendingRequests(totalCount);

          if (totalCount > 0) {
            console.log('✅ Dashboard: Loaded passenger count:', {
              availableRideRequests: availableRideRequestCount,
              availableLobbyPassengers,
              total: totalCount
            });
          } else {
            console.log('📭 Dashboard: No pending passengers or lobby requests');
          }
        } catch (error) {
          console.error('❌ Dashboard: Error loading requests:', error);
          setTotalPendingRequests(0);
        }
      };

      // Load initially
      loadRequests();

      // Set up real-time subscriptions
      console.log('🔔 Dashboard: Setting up real-time subscriptions for ride requests and lobbies');

      // Subscribe to ride_requests table changes
      const rideRequestsSubscription = supabase
        .channel('dashboard-ride-requests')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'ride_requests'
          },
          (payload) => {
            console.log('📡 Dashboard: Ride request changed, reloading passenger count', payload.eventType);
            loadRequests();
          }
        )
        .subscribe();

      // Subscribe to shared_ride_lobbies table changes
      const lobbiesSubscription = supabase
        .channel('dashboard-shared-rides')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'shared_ride_lobbies'
          },
          (payload) => {
            console.log('📡 Dashboard: Shared ride lobby changed, reloading passenger count', payload.eventType);
            loadRequests();
          }
        )
        .subscribe();

      // Also poll for updates every 3 seconds as fallback
      const interval = setInterval(loadRequests, 3000);

      return () => {
        clearInterval(interval);
        supabase.removeChannel(rideRequestsSubscription);
        supabase.removeChannel(lobbiesSubscription);
        console.log('🔌 Dashboard: Cleaned up real-time subscriptions');
      };
   }, [
     user?.id,
     user?.serviceTypes?.join('|'),
     queueTerminalId,
     terminalBoundary,
     terminalRoadWidthM,
     hasNoTerminal,
     isResolvingTerminal,
   ]);

  // Helpers: Haversine distance in meters
  const haversineDistance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371e3; // metres
    const φ1 = toRad(a.lat);
    const φ2 = toRad(b.lat);
    const Δφ = toRad(b.lat - a.lat);
    const Δλ = toRad(b.lng - a.lng);

    const sa = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
    return R * c;
  };

  // Decode polyline (same algorithm used in ActiveRide)
  const decodeGooglePolyline = (encoded: string): Array<{ lat: number; lng: number }> => {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const points: Array<{ lat: number; lng: number }> = [];

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
  };

  // Helper: Create custom marker for driver (tricycle image)
  const createDriverMarkerIcon = (): google.maps.Icon | undefined => {
    return createTricycleMarkerIcon();
  };

  // Helper: Create custom SVG marker for customer/passenger (person icon)
  const createCustomerMarkerIcon = (): google.maps.Icon | undefined => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--info)" stroke="white" stroke-width="1">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/>
      <circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/>
      <path d="M8.7 15.9c.55-2.05 2.15-3.3 3.3-3.3s2.75 1.25 3.3 3.3" fill="#FFFFFF" stroke="none"/>
    </svg>`;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 40),
    };
  };

  // Helper: Compute route using new google.maps.routes API (replaces deprecated DirectionsService)
  const computeRouteWithNewAPI = async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }>
  ): Promise<any> => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('❌ Google Maps API Key missing');
      return null;
    }

    try {
      const intermediates = waypoints.map(
        (wp) => ({"location": {"latLng": {"latitude": wp.lat, "longitude": wp.lng}}})
      );

      const requestBody = {
        origin: { "location": { "latLng": { "latitude": origin.lat, "longitude": origin.lng } } },
        destination: { "location": { "latLng": { "latitude": destination.lat, "longitude": destination.lng } } },
        intermediates: intermediates,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
      };

      const response = await fetch(
        `https://routes.googleapis.com/directions/v2:computeRoutes?key=${GOOGLE_MAPS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        console.warn('⚠️ Routes API failed, falling back to legacy API:', response.statusText);
        return null;
      }

      const data = await response.json();

      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        const overviewPolyline = route.polyline.encodedPolyline;

        return {
          routes: [
            {
              overview_polyline: { points: overviewPolyline },
              legs: route.legs,
            }
          ]
        };
      }

      return null;
    } catch (error) {
      console.warn('⚠️ New Routes API error, falling back to legacy:', error);
      return null;
    }
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address) return null;

    // Check cache first
    if (geocodeCache[address]) {
      console.log('✅ Geocode cache hit:', address);
      return geocodeCache[address];
    }

    const google = (window as any)?.google;
    if (!google?.maps?.Geocoder) return null;

    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address }, (results: any, status: string) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const location = {
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng(),
          };
          // Update cache
          const newCache = { ...geocodeCache, [address]: location };
          setGeocodeCache(newCache);
          try {
            localStorage.setItem('trikeserve_geocode_cache', JSON.stringify(newCache));
          } catch (e) {
            console.warn('Could not save geocode cache:', e);
          }
          console.log('✅ Geocoded:', address, location);
          resolve(location);
        } else {
          resolve(null);
        }
      });
    });
  };

  // Calculate distance-based ETA in seconds (rough estimate: 40 km/h average speed)
  const estimateETA = (distanceMeters: number): number => {
    const averageSpeedMPS = 40000 / 3600; // 40 km/h in m/s
    return Math.ceil(distanceMeters / averageSpeedMPS);
  };

  // Compute optimized multi-stop route to prioritized pickups
  useEffect(() => {
    const computeOptimizedRoute = async () => {
      if (!mapCenter || !pendingRequestsList || pendingRequestsList.length === 0) return;
      const google = (window as any)?.google;
      if (!isMapsLoaded || !google || !google.maps?.DirectionsService) return;

      // Throttle DirectionsService calls: min 2 seconds between calls
      const now = Date.now();
      if (directionsThrottleTime && now - directionsThrottleTime < 2000) {
        console.log('⏱ DirectionsService throttled');
        return;
      }

      console.log('🚀 Computing optimized multi-stop route...');

      // Normalize and geocode request addresses
      let requestsWithCoords = await Promise.all(
        pendingRequestsList.map(async (r) => {
          let pickupLat = r.pickup_lat || r.pickupLat || r.pickupLatitude;
          let pickupLng = r.pickup_lng || r.pickupLng || r.pickupLongitude;

          // If no coords, try geocoding
          if (!pickupLat || !pickupLng) {
            const address = r.pickupAddress || r.pickup || r.address;
            if (address) {
              const geocoded = await geocodeAddress(address);
              if (geocoded) {
                pickupLat = geocoded.lat;
                pickupLng = geocoded.lng;
              }
            }
          }

          return {
            ...r,
            pickupLat: pickupLat || null,
            pickupLng: pickupLng || null,
          };
        })
      );

      // Filter: requests with valid coordinates
      requestsWithCoords = requestsWithCoords.filter((r) => r.pickupLat && r.pickupLng);

      if (requestsWithCoords.length === 0) {
        console.log('⚠️ No requests with coordinates after geocoding');
        setDirectionsResult(null);
        setPrioritizedRouteStops([]);
        setNavTargetRequest(null);
        return;
      }

      // Capacity check: driver seats
      const availableSeats = currentSeats || 0;
      console.log('🪑 Available seats:', availableSeats);

      // Prioritization: compute score for each request
      const MAX_DISTANCE_METERS = 10000; // 10 km max detour
      const TIME_WINDOW_HOURS = 1; // Assume 1 hour window

      const scored = requestsWithCoords
        .map((r) => {
          const dist = haversineDistance(mapCenter, {
            lat: Number(r.pickupLat),
            lng: Number(r.pickupLng),
          });

          // Filter by distance
          if (dist > MAX_DISTANCE_METERS) {
            return { ...r, __valid: false, __filter: 'too_far', __distance: dist };
          }

          // Filter by capacity (shared ride: passengers, delivery: 1)
          const requiredSeats = r.type === 'shared' ? Math.max(1, r.passengers || 1) : 1;
          if (requiredSeats > availableSeats) {
            return { ...r, __valid: false, __filter: 'no_capacity', __distance: dist, __seats: requiredSeats };
          }

          const eta = estimateETA(dist);
          const passengers = Math.max(1, r.passengers || 1);
          const isPrepaid = r.payment === 'PREPAID' ? 1 : 0;

          // Scoring: lower is better (distance weighted heavily)
          const score =
            dist +  // distance in meters
            (passengers * 100) * -1 +  // prefer more passengers (negative = boost)
            (isPrepaid * 500) * -1;  // prepaid preference (negative = boost)

          return {
            ...r,
            __valid: true,
            __distance: dist,
            __eta: eta,
            __score: score,
            __seats: requiredSeats,
            __passengers: passengers,
            __prepaid: isPrepaid === 1,
          };
        });

      // Separate valid and invalid
      const validRequests = scored.filter((r) => r.__valid);
      const filteredRequests = scored.filter((r) => !r.__valid);

      if (validRequests.length === 0) {
        console.log('⚠️ No valid requests after filtering');
        console.log('   Filtered out:', filteredRequests.map((r) => ({ id: r.id, reason: r.__filter })));
        setDirectionsResult(null);
        setPrioritizedRouteStops([]);
        setNavTargetRequest(null);
        return;
      }

      // Sort and pick top 4 stops (Google DirectionsService max waypoints ~23, but keep it small for UX)
      validRequests.sort((a: any, b: any) => a.__score - b.__score);
      const topStops = validRequests.slice(0, 4);

      console.log('✅ Top prioritized stops:', topStops.map((r: any) => ({ id: r.id, score: r.__score, distance: r.__distance })));

      setPrioritizedRouteStops(topStops);
      setNavTargetRequest(topStops[0] || null);

      // Store prioritization reasons
      setPrioritizationReasons({
        primary: topStops[0],
        distance: topStops[0]?.__distance || 0,
        eta: topStops[0]?.__eta || 0,
        passengers: topStops[0]?.__passengers || 0,
        prepaid: topStops[0]?.__prepaid || false,
        allStops: topStops,
        filteredOut: filteredRequests,
      });

      // Build waypoints (up to 23)
      const waypoints = topStops.slice(1).map((r: any) => ({
        lat: Number(r.pickupLat),
        lng: Number(r.pickupLng),
      }));

      // Try new Routes API first (preference over deprecated DirectionsService)
      setDirectionsThrottleTime(now);

      const newApiResult = await computeRouteWithNewAPI(
        mapCenter,
        {
          lat: Number(topStops[0].pickupLat),
          lng: Number(topStops[0].pickupLng),
        },
        waypoints
      );

      if (newApiResult) {
        setDirectionsResult(newApiResult);
        console.log('✅ Multi-stop directions rendered (New Routes API)');
        return;
      }

      // Fallback to legacy DirectionsService if new API unavailable
      if (!google?.maps?.DirectionsService) {
        console.warn('⚠️ DirectionsService not available, routes visualization unavailable');
        return;
      }

      const waypointsForLegacy = topStops.slice(1).map((r: any) => ({
        location: new google.maps.LatLng(r.pickupLat, r.pickupLng),
        stopover: true,
      }));

      const DirectionsService = new google.maps.DirectionsService();
      DirectionsService.route(
        {
          origin: new google.maps.LatLng(mapCenter.lat, mapCenter.lng),
          destination: new google.maps.LatLng(
            Number(topStops[0].pickupLat),
            Number(topStops[0].pickupLng)
          ),
          waypoints: waypointsForLegacy,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true,
        },
        (result: any, status: string) => {
          if (status === 'OK') {
            setDirectionsResult(result);
            console.log('✅ Multi-stop directions rendered (Legacy DirectionsService)');
          } else {
            console.error('❌ DirectionsService error:', status);
          }
        }
      );
    };

    computeOptimizedRoute();
  }, [mapCenter, pendingRequestsList, isMapsLoaded, currentSeats, geocodeCache]);

  // Count unread messages from passengers
  useEffect(() => {
    if (!user?.id) return;

    const countUnreadMessages = async () => {
      try {
        const { count, error } = await supabaseHelpers.getUnreadChatCount(user.id);
        if (error) {
          console.error('Error counting unread chat messages:', error);
          return;
        }

        setUnreadMessagesCount(count || 0);
      } catch (error) {
        console.error('Error counting unread chat messages:', error);
      }
    };

    countUnreadMessages();

    const interval = setInterval(countUnreadMessages, 3000);

    const subscription = supabase
      .channel(`rider-unread-chat-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${user.id}`
        },
        () => countUnreadMessages()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(subscription);
    };
  }, [user?.id]);

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
       setActiveTrip(null);
       setCurrentSeats(0);
     }
   };


  return (
    <div ref={dashboardRef} className="h-dvh min-h-[32rem] flex flex-col bg-[var(--muted)] relative overflow-hidden">
      {/* Full Screen Map */}
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--border)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--error)] mb-4">⚠️ Google Maps API Key Missing</p>
              <p className="text-[var(--ink-soft)] mb-4">To use Google Maps, please:</p>
              <ol className="text-left text-sm text-[var(--muted-foreground)] mb-4">
                <li>1. Get a Google Maps API Key from Google Cloud Console</li>
                <li>2. Create a .env.local file in the project root</li>
                <li>3. Add: VITE_GOOGLE_MAPS_API_KEY=your_api_key</li>
                <li>4. Restart the dev server</li>
              </ol>
              <p className="text-xs text-[var(--muted-foreground)]">Default location shown: Manila, Philippines</p>
            </div>
          </div>
                ) : isMapsLoaded && !blocked && apiKeyPresent ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={mapCenter}
            zoom={15}
            options={{
              gestureHandling: 'greedy',
              zoomControl: false,
              fullscreenControl: false,
              streetViewControl: false,
              mapTypeControl: false,
            }}
            onLoad={(map) => {
              mapRef.current = map;
              map.setMapTypeId(mapType);
            }}
            onUnmount={() => {
              mapRef.current = null;
            }}
          >
            <MapFullscreenToggle />
            {/* Current Location Marker - Driver (Red Car) */}
            <Marker
              position={mapCenter}
              onClick={() => setSelectedMarker(mapCenter)}
              title="🚗 Your location (Driver)"
              icon={createDriverMarkerIcon()}
            />

             {/* Info Window for selected marker */}
             {selectedMarker && (
               <InfoWindow
                 position={selectedMarker}
                 onCloseClick={() => setSelectedMarker(null)}
               >
                 <div className="text-sm">
                   <p className="font-bold">Your current location</p>
                   <p className="text-[var(--muted-foreground)]">
                     {selectedMarker.lat.toFixed(4)}, {selectedMarker.lng.toFixed(4)}
                   </p>
                 </div>
               </InfoWindow>
             )}

              {/* DirectionsRenderer for multi-stop route (replaces polyline) */}
              {/* HIDDEN: Recommended pickup route is not shown in home panel */}
              {/* {directionsResult && (
                <DirectionsRenderer
                  directions={directionsResult}
                  options={{
                    markerOptions: {
                      visible: false,
                    },
                    polylineOptions: {
                      strokeColor: 'var(--primary)',
                      strokeOpacity: 0.92,
                      strokeWeight: 5,
                    },
                  }}
                />
              )} */}

              {/* Marker for the prioritized pickup target - Customer (Blue Pin) */}
              {/* HIDDEN: Prioritized pickup target marker not shown in home panel */}
              {/* {navTargetRequest && navTargetRequest.pickupLat && navTargetRequest.pickupLng && (
                <Marker
                  position={{ lat: Number(navTargetRequest.pickupLat), lng: Number(navTargetRequest.pickupLng) }}
                  title={`📍 Prioritized Pickup: ${navTargetRequest.pickup || navTargetRequest.address || ''}`}
                  icon={createCustomerMarkerIcon()}
                />
              )} */}
          </GoogleMap>
        ) : isMapsLoaded && blocked ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--amber-soft)]">
            <div className="text-center max-w-md px-6">
              <p className="text-lg font-bold text-[var(--amber-ink)] mb-2">⚠️ Google Maps scripts loaded but unavailable</p>
              <p className="text-sm text-[var(--amber-ink)] mb-3">The Maps SDK appears to be blocked by a browser extension or network policy (window.google is missing). Try disabling ad-blockers or allow maps.googleapis.com.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[var(--primary)] text-white rounded-md">Retry</button>
                <button onClick={() => window.open('about:blank', '_blank')} className="px-4 py-2 border rounded-md">Open Incognito / Disable Extensions</button>
              </div>
            </div>
          </div>
        ) : mapsLoadError ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--error-soft)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--error)]">⚠️ Map Error</p>
              <p className="text-sm text-[var(--error)]">{String(mapsLoadError?.message || mapsLoadError)}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
            <p className="text-sm text-[var(--muted-foreground)]">Loading map...</p>
          </div>
        )
        }

        {/* Service types control */}
        <div className="absolute right-14 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[1000]">
          {!isMapFullscreen && !activeTrip && (
            <button
              onClick={() => navigate('/rider/service-types', { state: { returnTo: '/rider' } })}
              aria-label="Choose service types"
              className="flex size-10 items-center justify-center rounded-lg border-2 border-white bg-[var(--primary)] shadow-xl transition-all hover:shadow-2xl active:scale-95"
            >
              <Settings className="size-5 text-white" />
            </button>
          )}
        </div>

        {/* Explicit map type controls stay available when switching between map and satellite views. */}
        <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1000] inline-flex rounded-xl bg-surface p-0.5 shadow-lg border border-[var(--border)] sm:left-6 sm:top-[calc(env(safe-area-inset-top)+1.5rem)] sm:p-1">
            <button
              onClick={() => selectMapType('roadmap')}
              aria-pressed={mapType === 'roadmap'}
              className={`min-h-9 sm:min-h-10 rounded-lg px-2 sm:px-4 text-xs sm:text-sm font-bold transition-colors ${mapType === 'roadmap' ? 'bg-[var(--primary)] text-white' : 'text-[var(--ink)] hover:bg-[var(--muted)]'}`}
            >
              Map
            </button>
            <button
              onClick={() => selectMapType('satellite')}
              aria-pressed={mapType === 'satellite'}
              className={`min-h-9 sm:min-h-10 rounded-lg px-2 sm:px-4 text-xs sm:text-sm font-bold transition-colors ${mapType === 'satellite' ? 'bg-[var(--primary)] text-white' : 'text-[var(--ink)] hover:bg-[var(--muted)]'}`}
            >
              <span className="sm:hidden">Sat</span>
              <span className="hidden sm:inline">Satellite</span>
            </button>
        </div>

        {/* Toggle Online/Offline Button */}
        {!activeTrip && !isMapFullscreen && (
          <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[1000] -translate-x-1/2 sm:top-[calc(env(safe-area-inset-top)+1.5rem)]">
            <Button
                  onClick={handleToggleOnline}
                  className={`${
                isOnline 
                  ? 'bg-[var(--success)] hover:bg-[var(--success)] text-white'
                  : 'bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white'
              } min-h-10 px-2.5 sm:min-h-12 sm:px-5 py-2 sm:py-3 rounded-2xl font-bold shadow-xl flex items-center gap-1.5 sm:gap-2 text-xs sm:text-base`}
            >
              {isOnline ? (
                <>
                  {/* Blinking green status dot: a pinging halo over a solid dot, so
                      "online" reads as a live green signal rather than a flat mark. */}
                  <span className="relative flex h-3 w-3" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--mint)] opacity-75 animate-ping" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--mint)]" />
                  </span>
                  <span className="sm:hidden">Online</span>
                  <span className="hidden sm:inline">You're Online</span>
                </>
              ) : (
                <>
                  <Power className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="sm:hidden">Online</span>
                  <span className="hidden sm:inline">Go Online</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Active Trip Card */}
        {activeTrip && !isMapFullscreen && (
          <div className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[1000] mx-auto w-full max-w-2xl px-3 sm:px-5">
            <Card className="max-h-[calc(100dvh-8rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto p-4 sm:p-6 bg-surface shadow-2xl border-2 border-[var(--primary)]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge className="mb-2 bg-[var(--primary)]">
                    {activeTrip.type === 'delivery' ? 'DELIVERY' : activeTrip.type.toUpperCase()}
                  </Badge>
                  <h3 className="font-bold text-lg text-[var(--ink)]">Active Trip</h3>
                </div>
                <Badge variant="outline" className={activeTrip.payment === 'COD' ? 'border-[var(--amber)] text-[var(--amber)]' : 'border-[var(--success)] text-[var(--success)]'}>
                  {activeTrip.payment}
                </Badge>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <Navigation className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[var(--muted-foreground)]">Pickup</p>
                    <p className="font-semibold text-[var(--ink)] break-words">{activeTrip.pickup}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Navigation className="w-5 h-5 text-[var(--success)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[var(--muted-foreground)]">Drop-off</p>
                    <p className="font-semibold text-[var(--ink)] break-words">{activeTrip.dropoff}</p>
                  </div>
                </div>
              </div>

              {activeTrip.type === 'delivery' && activeTrip.payment === 'COD' && Number(activeTrip.foodCost || 0) > 0 && (
                <div className="bg-[var(--amber-soft)] border border-[var(--amber-soft)] rounded-lg p-3 mb-4">
                  <p className="text-sm font-semibold text-[var(--amber-ink)] mb-1">⚠️ Pay Restaurant First</p>
                  <p className="text-xs text-[var(--amber-ink)]">Food Cost: ₱{activeTrip.foodCost?.toFixed(2)}</p>
                  <p className="text-xs text-[var(--amber-ink)]">You'll be reimbursed by customer</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleCompleteTrip}
                  className="flex-1 bg-[var(--success)] hover:bg-[var(--success)] text-white"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  COMPLETE TRIP
                </Button>
              </div>

              <div className="mt-3 text-center">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Delivery Fee: <span className="font-bold text-[var(--primary)]">₱{activeTrip.amount.toFixed(2)}</span>
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Incoming Requests */}
        {/* Removed - requests only shown on Passenger Requests page */}

        {/* Bottom Sheet - Always visible (Passenger Requests, More Options) */}
        {!activeTrip && !isMapFullscreen && (
          <div className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[999] px-3">
            <Card className="w-full gap-0 rounded-3xl border border-line bg-card shadow-xl max-h-[calc(100dvh-10rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[min(76dvh,calc(100dvh-9rem))] overflow-y-auto overscroll-contain">

              <div className="border-b border-line px-4 py-3 sm:px-5">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Active service{activeServiceTypes.length === 1 ? '' : 's'}
                </p>
                {activeServiceTypes.length > 0 ? (
                  <div role="group" aria-label="Active service types" className="flex flex-wrap gap-2">
                    {activeServiceTypes.map((serviceType) => {
                      const ServiceIcon = serviceType === 'delivery'
                        ? Package
                        : serviceType === 'private'
                          ? Car
                          : Users;
                      return (
                        <span
                          key={serviceType}
                          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-1 text-sm font-bold text-[var(--primary)]"
                        >
                          <ServiceIcon className="size-4" aria-hidden="true" />
                          {SERVICE_TYPE_LABELS[serviceType]}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-[var(--muted-foreground)]">No service type selected</p>
                )}
              </div>

              {/* Terminal Queue - determines which driver may accept private/share rides.
                  Only shown on the Rides service type: delivery is never queue-gated, and
                  switching back to Rides brings the queue back. */}
              {activeServiceCategory === 'rides' && (
                <TerminalQueueCard queue={terminalQueueApi} canJoin={isOnline} />
              )}

              {/* View All Passenger Requests Card - Always visible, button disabled when offline */}
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <div className="flex flex-col items-center text-center">
                  {/* Header */}
                  <h3 className="font-extrabold text-base text-[var(--ink)] mb-4">Passenger Requests</h3>

                  {/* Icon and Text Section */}
                  <div className={`flex items-center justify-center gap-3 mb-4 ${!isOnline ? 'opacity-50' : ''}`}>
                    {/* Green Icon Circle */}
                    <div className="w-12 h-12 rounded-2xl bg-[var(--success-ink)] flex items-center justify-center flex-shrink-0">
                      <Users className="w-8 h-8 text-white" />
                    </div>

                    {/* Text Content */}
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[var(--ink)] mb-1">{totalPendingRequests} passengers waiting</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Looking for tricycle<br/>service nearby</p>
                    </div>
                  </div>

                  {/* View All Button - offline taps explain themselves */}
                  {isOnline ? (
                    <Link to="/rider/passenger-requests" className="w-full">
                      <Button className="min-h-12 w-full rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)] text-[var(--primary-foreground)] font-bold">
                        View All Passenger Requests
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      onClick={() => setShowOfflineNotice(true)}
                      aria-haspopup="dialog"
                      className="w-full bg-[var(--border)] text-[var(--muted-foreground)] font-bold"
                    >
                      View All Passenger Requests
                    </Button>
                  )}
                </div>
              </div>


              {/* More Options Section */}
              {showMore && (
                <div className="border-t border-[var(--border)] p-4 space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-[var(--ink)]">More Options</h3>
                    <button onClick={() => setShowMore(false)}>
                      <X className="w-5 h-5 text-[var(--muted-foreground)]" />
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
      <BottomNav variant="rider" active="home" messagesBadge={unreadMessagesCount} />

      {/* Active Ride Floating Button */}
      {!isMapFullscreen && <ActiveRideButton />}

        {/* Offline Notice */}
        {showOfflineNotice && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="offline-notice-title"
              className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full text-center"
            >
              <div className="w-14 h-14 bg-[var(--muted)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Power className="w-7 h-7 text-[var(--muted-foreground)]" aria-hidden="true" />
              </div>
              <h3 id="offline-notice-title" className="text-xl font-bold text-[var(--ink)] mb-2">
                You're offline
              </h3>
              <p className="text-[var(--muted-foreground)] text-sm mb-6">
                Go online first, then you can see the passenger requests waiting nearby.
              </p>
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    setShowOfflineNotice(false);
                    handleToggleOnline();
                  }}
                  className="min-h-12 w-full rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)] text-[var(--primary-foreground)] font-bold"
                >
                  Go Online
                </Button>
                <Button
                  onClick={() => setShowOfflineNotice(false)}
                  variant="outline"
                  className="w-full border border-line"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

      {/* Welcome Back Popup */}
      {showWelcomeBack && (
        // Tap anywhere to dismiss — a greeting shouldn't hold up the dispatch board.
        <div
          onClick={() => setShowWelcomeBack(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowWelcomeBack(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Welcome message. Tap to close."
          className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[var(--success)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Welcome Back!</h3>
            <p className="text-[var(--muted-foreground)] text-sm">Good to see you again, <span className="font-semibold text-[var(--ink)]">{welcomeUserName}</span></p>
            <div className="mt-6">
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div className="bg-[var(--success)] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 2.5s linear forwards' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
