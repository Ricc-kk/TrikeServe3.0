import { useState, useEffect, useRef } from "react";
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import PlaceSearch from "../ui/PlaceSearch";
import { GOOGLE_MAPS_LIBRARIES, VALENZUELA_BIAS } from "@/lib/googleMaps";
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
  MessageCircle,
  Clock,
  Maximize,
  TrendingDown
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import { useAutoAccept } from "../../hooks/useAutoAccept";
import { supabaseHelpers } from "@/lib/supabase";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import { supabase } from "../../../lib/supabase";

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

const SERVICE_OPTIONS: Record<'rides' | 'delivery', { key: string; name: string; description: string }[]> = {
  rides: [
    { key: 'shared', name: 'Ride Share', description: 'Shared rides with other passengers' },
    { key: 'private', name: 'Private Ride', description: 'Exclusive rides, no sharing' },
  ],
  delivery: [
    { key: 'delivery', name: 'Delivery', description: 'Food & package delivery' },
  ],
};

export default function RiderDashboard() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  // Watches for private/delivery requests and auto-accepts them when enabled and the service type matches.
  useAutoAccept();
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [mode, setMode] = useState<'shared' | 'delivery'>('shared');
  const [currentSeats, setCurrentSeats] = useState(user?.currentSeats || 0);
  const [activeTrip, setActiveTrip] = useState<IncomingRequest | null>(null);
  const [showServiceTypes, setShowServiceTypes] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // Rides can include Ride Share and/or Private Ride; Delivery is exclusive with a single option
  const normalizeServiceSelection = (existing: string[] = []): { category: 'rides' | 'delivery'; rides: string[] } => {
    const valid = existing.filter((s) => ['private', 'shared', 'delivery'].includes(s));
    const rides = valid.filter((s) => s === 'shared' || s === 'private');
    return {
      category: valid.includes('delivery') ? 'delivery' : 'rides',
      rides: rides.length > 0 ? rides : ['shared'],
    };
  };
  const initialServiceSelection = normalizeServiceSelection(user?.serviceTypes);
  const [selectedServices, setSelectedServices] = useState<string[]>(initialServiceSelection.category === 'delivery' ? ['delivery'] : initialServiceSelection.rides);
  const [serviceCategory, setServiceCategory] = useState<'rides' | 'delivery'>(initialServiceSelection.category);
  const [ridesSelection, setRidesSelection] = useState<string[]>(initialServiceSelection.rides);
  const [destination, setDestination] = useState('');
  const [totalPendingRequests, setTotalPendingRequests] = useState(0);
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [activeRideData, setActiveRideData] = useState<any>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [tripsCompletedCount, setTripsCompletedCount] = useState(0);
   const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 }); // Default: Tagalag, Valenzuela
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

          // Save ride requests for routing and prioritization
          const rideRequestCount = rideRequests?.length || 0;
          setPendingRequestsList(rideRequests || []);

          // Count total passengers in all waiting lobbies
          let totalLobbyPassengers = 0;
          if (waitingLobbies && waitingLobbies.length > 0) {
            totalLobbyPassengers = waitingLobbies.reduce((total: number, lobby: any) => {
              const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
              return total + passengers.length;
            }, 0);
          }

          // Total = ride requests + passengers waiting in lobbies
          const totalCount = rideRequestCount + totalLobbyPassengers;

          setTotalPendingRequests(totalCount);

          if (totalCount > 0) {
            console.log('✅ Dashboard: Loaded passenger count:', {
              rideRequests: rideRequestCount,
              lobbyPassengers: totalLobbyPassengers,
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
   }, []);

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
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;

    return {
      url: tricycleIcon,
      scaledSize: new google.maps.Size(44, 44),
      anchor: new google.maps.Point(22, 22),
    } as any;
  };

  // Helper: Create custom SVG marker for customer/passenger (person icon)
  const createCustomerMarkerIcon = (): google.maps.Icon | undefined => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2563EB" stroke="white" stroke-width="1">
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

    const handlePlaceSelected = (place: any) => {
      if (!place) return;
      setDestination(place.formatted_address || place.name || "");

      if (place.lat && place.lng) {
        const location = { lat: place.lat, lng: place.lng };
        setMapCenter(location);
        setSelectedMarker(location);
        console.log('✅ Location selected:', place.formatted_address || place.name, location);
      }
    };

    const selectServiceCategory = (next: 'rides' | 'delivery') => {
      setServiceCategory(next);
      if (next === 'delivery') {
        setSelectedServices(['delivery']);
      } else {
        setSelectedServices(ridesSelection);
      }
    };

    const toggleServiceType = (key: string) => {
      if (serviceCategory !== 'rides') return;
      const next = ridesSelection.includes(key)
        ? (ridesSelection.length > 1 ? ridesSelection.filter((s) => s !== key) : ridesSelection)
        : [...ridesSelection, key];
      setRidesSelection(next);
      setSelectedServices(next);
    };

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
          <GoogleMap
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
                   <p className="text-gray-600">
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
                      strokeColor: '#E11D48',
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
        }

        {/* Toggle Online/Offline Button */}
        {!activeTrip && (
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
        {activeTrip && (
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
        {!activeTrip && (
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
                <div className="border-t border-gray-200 p-4 space-y-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-[#121212]">Service Types</h3>
                    <button onClick={() => setShowServiceTypes(false)}>
                      <X className="w-5 h-5 text-[#64748B]" />
                    </button>
                  </div>
                  <p className="text-sm text-[#64748B]">
                    Choose a category, then select the service types you want to accept.
                    {serviceCategory === 'rides' && ' You can select both Ride Share and Private Ride.'}
                  </p>

                  {/* Category */}
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => selectServiceCategory('rides')}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        serviceCategory === 'rides'
                          ? 'border-[#E11D48] bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        serviceCategory === 'rides' ? 'bg-[#E11D48] text-white' : 'bg-gray-100 text-[#64748B]'
                      }`}>
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-[#121212]">Rides</p>
                        <p className="text-xs text-[#64748B]">Transport passengers</p>
                      </div>
                    </div>
                    <div
                      onClick={() => selectServiceCategory('delivery')}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        serviceCategory === 'delivery'
                          ? 'border-[#E11D48] bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        serviceCategory === 'delivery' ? 'bg-[#E11D48] text-white' : 'bg-gray-100 text-[#64748B]'
                      }`}>
                        <Package className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-[#121212]">Delivery</p>
                        <p className="text-xs text-[#64748B]">Food & package delivery</p>
                      </div>
                    </div>
                  </div>

                  {/* Service type within category */}
                  <div className="space-y-2">
                    {SERVICE_OPTIONS[serviceCategory].map((option) => {
                      const active = selectedServices.includes(option.key);
                      const isMulti = serviceCategory === 'rides';
                      return (
                        <div
                          key={option.key}
                          onClick={() => (isMulti ? toggleServiceType(option.key) : undefined)}
                          className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            active
                              ? 'border-[#E11D48] bg-red-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              active ? 'bg-[#E11D48] text-white' : 'bg-gray-100 text-[#64748B]'
                            }`}>
                              {option.key === 'delivery' ? <Package className="w-5 h-5" /> : option.key === 'private' ? <Car className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="font-semibold text-[#121212]">{option.name}</p>
                              <p className="text-xs text-[#64748B]">{option.description}</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            active ? 'bg-[#E11D48] border-[#E11D48]' : 'border-gray-300'
                          }`}>
                            {active && <div className="w-2 h-2 bg-white rounded-sm" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    onClick={() => setShowServiceTypes(false)}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                  >
                    Save Service Types
                  </Button>
                </div>
              )}

                {/* My Destination Section */}
                {showDestination && GOOGLE_MAPS_API_KEY && (
                  <div className="border-t border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-[#121212]">My Destination</h3>
                      <button onClick={() => setShowDestination(false)}>
                        <X className="w-5 h-5 text-[#64748B]" />
                      </button>
                    </div>
                    <PlaceSearch
                      value={destination}
                      onChange={setDestination}
                      onSelect={handlePlaceSelected}
                      placeholder="Search location... (e.g., Tagalag Valenzuela City)"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded focus:border-[#E11D48] focus:outline-none"
                      locationBias={VALENZUELA_BIAS}
                      restrictToCity="Valenzuela"
                    />
                    <div className="text-xs text-gray-500 p-2 bg-blue-50 rounded">
                      💡 Type a location and select from the dropdown to search and populate the map
                    </div>
                    <Button
                      onClick={() => {
                        setShowDestination(false);
                        console.log('Destination set to:', destination);
                      }}
                      className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                    >
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