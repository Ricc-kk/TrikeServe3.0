import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Users, User as UserIcon, ChevronDown, X, Clock, CreditCard, Utensils, Search as SearchIcon, User, Navigation, MessageCircle, Bike, Home as HomeIcon, ShoppingCart, ClipboardList } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { GoogleMap, MarkerF, InfoWindow, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew, type PlaceResult, type PlacesAutocompleteSuggestion } from "@/lib/placesApi";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png';
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "../../../utils/supabase";
import SharedRides from "./SharedRides";
import ShareRideLobby from "./ShareRideLobby";
import BrowseAvailableLobbies from "./BrowseAvailableLobbies";

// Get Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

type RecommendedLocation = {
  id: string;
  name: string;
  full: string;
  lat: number;
  lng: number;
};

type LatLng = { lat: number; lng: number };

type GeocodedLocation = {
   lat: number;
   lng: number;
   name: string;
   fullAddress: string;
 };

 type MapsDiagnostics = {
   keyPresent: boolean;
   mapsLoaded: boolean;
   geocoderAvailable: boolean;
   directionsAvailable: boolean;
   geocoderStatus: string;
   directionsStatus: string;
   backendRouteStatus: string;
 };

const TAGALAG_BISIG_RECOMMENDATIONS: RecommendedLocation[] = [
  { id: "tagalag-terminal", name: "Tagalag Terminal", full: "Main Road, Tagalag, Valenzuela City", lat: 14.7294, lng: 120.9349 },
  { id: "tagalag-market", name: "Tagalag Market", full: "Tagalag Market, Valenzuela City", lat: 14.7301, lng: 120.9356 },
  { id: "tagalag-eco-park", name: "Tagalag Eco Park", full: "Tagalag Eco Park, Valenzuela City", lat: 14.7287, lng: 120.9342 },
  { id: "tagalag-mini-park", name: "Tagalag Mini Park", full: "Tagalag Mini Park, Valenzuela City", lat: 14.7278, lng: 120.9361 },
  { id: "advance-st", name: "Advance Street", full: "Advance Street, Tagalag, Valenzuela City", lat: 14.7285, lng: 120.9355 },
  { id: "balay-de-jesus", name: "Balay De Jesus", full: "Balay De Jesus, Tagalag, Valenzuela City", lat: 14.7296, lng: 120.9344 },
  { id: "pablo-muni", name: "Pablo's Muni", full: "Pablo's Muni Restaurant, Tagalag, Valenzuela City", lat: 14.7293, lng: 120.9359 },
  { id: "pares-overlord", name: "Pares Overlord", full: "Pares Overlord, Tagalag, Valenzuela City", lat: 14.7281, lng: 120.9370 },
  { id: "kuya-oliver", name: "Kuya Oliver", full: "Kuya Oliver, Tagalag, Valenzuela City", lat: 14.7289, lng: 120.9346 },
];

const getNearestRecommendedLocation = (location: { lat: number; lng: number }) => {
  return TAGALAG_BISIG_RECOMMENDATIONS.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.lat - location.lat) ** 2 + (nearest.lng - location.lng) ** 2;
    const candidateDistance = (candidate.lat - location.lat) ** 2 + (candidate.lng - location.lng) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, TAGALAG_BISIG_RECOMMENDATIONS[0]);
};

const decodeGooglePolyline = (encoded: string): LatLng[] => {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: LatLng[] = [];

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

const buildNavigationMarkerIcon = (color: string) => {
  const google = (window as any)?.google;
  if (!google?.maps?.SymbolPath) return undefined;

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
    scale: 8,
  } as any;
};

const createDriverMarkerIcon = () => {
  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) {
    return buildNavigationMarkerIcon('#EF4444');
  }

  return {
    url: tricycleIcon,
    scaledSize: new google.maps.Size(44, 44),
    anchor: new google.maps.Point(22, 22),
  } as any;
};

const createCustomerMarkerIcon = () => {
  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) {
    return buildNavigationMarkerIcon('#2563EB');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2563EB" stroke="white" stroke-width="1">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/>
    <circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/>
    <path d="M8.7 15.9c.55-2.05 2.15-3.3 3.3-3.3s2.75 1.25 3.3 3.3" fill="#FFFFFF" stroke="none"/>
  </svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(40, 40),
    anchor: new google.maps.Point(20, 40),
  } as any;
};

const createDropoffMarkerIcon = () => {
  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) {
    return buildNavigationMarkerIcon('#E11D48');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/>
    <path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(40, 40),
    anchor: new google.maps.Point(20, 40),
  } as any;
};

const PASSENGER_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#6366F1'];

const getPassengerInitials = (name: string, index: number): { initials: string; color: string } => {
  const initials = name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';
  const color = PASSENGER_COLORS[index % PASSENGER_COLORS.length];
  return { initials, color };
};

const createPassengerMarkerIcon = (initials: string, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="2"/>
    <text x="20" y="24" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${initials}</text>
  </svg>`;

  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) {
    return undefined;
  }

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  } as any;
};

const buildNavigationRouteOptions = (color: string, weight: number) => {
  const google = (window as any)?.google;
  const arrowPath = google?.maps?.SymbolPath?.FORWARD_CLOSED_ARROW;

  return {
    strokeColor: color,
    strokeOpacity: 0.92,
    strokeWeight: weight,
    geodesic: true,
    icons: arrowPath
      ? [
          {
            icon: {
              path: arrowPath,
              scale: 3,
              strokeColor: color,
              strokeOpacity: 1,
            },
            offset: '100%',
          },
        ]
      : undefined,
  } as any;
};

export default function CustomerHome() {
  const { user } = useAuth();
  const [selectedVehicle, setSelectedVehicle] = useState<'share' | 'special' | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 }); // Default: Manila
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const [selectedMarker, setSelectedMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupMarker, setPickupMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffMarker, setDropoffMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [focusedMarker, setFocusedMarker] = useState<{ lat: number; lng: number; type: 'current' | 'pickup' | 'dropoff'; title: string } | null>(null);
  const [routeTarget, setRouteTarget] = useState<{ lat: number; lng: number; type: 'pickup' | 'dropoff'; title: string } | null>(null);
  const [routePath, setRoutePath] = useState<LatLng[]>([]);
  const [routeApiError, setRouteApiError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [activeLocationInput, setActiveLocationInput] = useState<'pickup' | 'dropoff' | null>(null);
  const [pickup, setPickup] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  // Coordinates for pickup (defaulted to currentLocation) and dropoff (user-selected)
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Places autocomplete state
  const [predictions, setPredictions] = useState<PlacesAutocompleteSuggestion[]>([]);
  const [placesSessionToken, setPlacesSessionToken] = useState<string>(() => createPlacesSessionToken());
  const [locationPreview, setLocationPreview] = useState<GeocodedLocation | null>(null);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [showSharedRides, setShowSharedRides] = useState(false);
  const [showShareLobby, setShowShareLobby] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'GCASH'>('GCASH');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<'searching' | 'driver-found' | 'picking-up' | 'in-transit' | null>(null);
   const [isSearchMinimized, setIsSearchMinimized] = useState(false);
   const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
   const [currentSharedRideId, setCurrentSharedRideId] = useState<string | null>(null);
   const [showPassengerCount, setShowPassengerCount] = useState(false);
   const [passengerCount, setPassengerCount] = useState(1);
   const [showLobbyList, setShowLobbyList] = useState(false);
   const [activeShareLobbyId, setActiveShareLobbyId] = useState<string | null>(null);
   const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
   const [driverAcceptedPopup, setDriverAcceptedPopup] = useState<any>(null);
   const [driverStatusPopup, setDriverStatusPopup] = useState<{ status: string; message: string } | null>(null);
   const [showValidationError, setShowValidationError] = useState(false);
   const [showSameLocationError, setShowSameLocationError] = useState(false);
   const [rideCompletedPopup, setRideCompletedPopup] = useState(false);
   const [completionPopupType, setCompletionPopupType] = useState<'ride' | 'delivery'>('ride');
   const [showRatingModal, setShowRatingModal] = useState(false);
   const [privateRidePrice, setPrivateRidePrice] = useState(50); // Default price for private rides
   const [sharedRidePrice, setSharedRidePrice] = useState(15); // Default price for share rides
   const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
   const [driverRoutePath, setDriverRoutePath] = useState<LatLng[]>([]);
   const [ridePassengers, setRidePassengers] = useState<any[]>([]);
   const [passengerLocations, setPassengerLocations] = useState<{ [key: string]: { lat: number; lng: number } }>({});
   const [mapsDiagnostics, setMapsDiagnostics] = useState<MapsDiagnostics>({
     keyPresent: Boolean(GOOGLE_MAPS_API_KEY),
     mapsLoaded: false,
     geocoderAvailable: false,
     directionsAvailable: false,
     geocoderStatus: 'idle',
     directionsStatus: 'idle',
     backendRouteStatus: 'idle',
   });
    const [mapsBlocked, setMapsBlocked] = useState<string | null>(null);
   const mapRef = useRef<any>(null);
   const hasManualPickupSelectionRef = useRef(false);
   const unsubscribeRef = useRef<(() => void) | null>(null);

    const { isLoaded: isMapsLoaded, loadError: mapsLoadError, blocked, apiKeyPresent } = useMapLoader();

    // Detect cases where the loader finished but google.* is blocked by client/adblockers or CSP.
    useEffect(() => {
      if (mapsLoadError) {
        console.warn('Google Maps loader error:', mapsLoadError);
        setMapsBlocked(String(mapsLoadError?.message || mapsLoadError));
        setMapsDiagnostics(prev => ({ ...prev, mapsLoaded: false, keyPresent: Boolean(apiKeyPresent) }));
        return;
      }

      if (blocked) {
        console.warn('Google Maps appears to be blocked or unavailable (google undefined)');
        setMapsBlocked('Google Maps scripts are blocked by a browser extension or network policy. Please disable adblock/privacy extensions or allow maps.googleapis.com');
        setMapsDiagnostics(prev => ({ ...prev, mapsLoaded: false, keyPresent: Boolean(apiKeyPresent) }));
        return;
      }

      if (isMapsLoaded) {
        setMapsBlocked(null);
        setMapsDiagnostics(prev => ({ ...prev, mapsLoaded: true, keyPresent: Boolean(apiKeyPresent) }));
      }
    }, [isMapsLoaded, mapsLoadError, blocked, apiKeyPresent]);

   // Get user's current location on component mount
  useEffect(() => {
    setIsLoadingLocation(true);
    setLocationError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          // default pickup coords to current location when available
          setPickupCoords({ lat: latitude, lng: longitude });
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

  // Keep pickup state synchronized with currentLocation unless user changes it
  useEffect(() => {
    if (!pickupCoords && currentLocation) {
      setPickupCoords(currentLocation);
      setPickup('Current Location');
      setPickupAddress(`${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`);
    }
  }, [currentLocation]);

  useEffect(() => {
    if (!isMapsLoaded || !(window as any).google) return;

    let cancelled = false;
    const geocoder = new (window as any).google.maps.Geocoder();

    const geocode = (address: string) =>
      new Promise<{ lat: number; lng: number } | null>((resolve) => {
        geocoder.geocode({ address }, (results: any, status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const location = results[0].geometry.location;
            resolve({ lat: location.lat(), lng: location.lng() });
          } else {
            resolve(null);
          }
        });
      });

    (async () => {
      if (!pickupCoords && pickupAddress && pickup !== 'Current Location') {
        const coords = await geocode(pickupAddress);
        if (!cancelled && coords) setPickupCoords(coords);
      }

      if (!dropoffCoords && dropoffAddress) {
        const coords = await geocode(dropoffAddress);
        if (!cancelled && coords) setDropoffCoords(coords);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMapsLoaded, pickup, pickupAddress, pickupCoords, dropoffAddress, dropoffCoords]);

  // Fetch autocomplete predictions (Places API) and set predictions state
  const fetchPredictions = async (input: string) => {
    setSearchQuery(input);
    if (!input || !input.trim()) {
      setPredictions([]);
      return;
    }

    try {
      const apiKey = GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.warn('No Google Maps API key configured for autocomplete');
        setPredictions([]);
        return;
      }

      const suggestions = await autocompletePlacesNew({
        input: input.trim(),
        apiKey,
        // bias around current map center for better local results
        locationBias: mapCenter || currentLocation,
        restrictToCountry: 'ph',
        sessionToken: placesSessionToken,
      });

      setPredictions(suggestions || []);
    } catch (err: any) {
      console.warn('autocompletePlacesNew failed:', err?.message || err);
      setPredictions([]);
    }
  };

  // When a prediction is selected, fetch Place Details (Place Details API) and set coordinates & address
  const selectPrediction = async (placeId: string) => {
    if (!placeId) return;

    try {
      const apiKey = GOOGLE_MAPS_API_KEY;
      if (!apiKey) return;

      const place = await fetchPlaceDetailsNew({ placeId, apiKey, sessionToken: placesSessionToken });
      // rotate session token after selection
      setPlacesSessionToken(createPlacesSessionToken());

      if (!place) {
        console.warn('Place details not found for', placeId);
        return;
      }

      const coords = place.lat && place.lng ? { lat: place.lat, lng: place.lng } : null;
      const displayName = place.name || place.formatted_address || place.formatted_address || place.place_id || 'Selected place';
      const fullAddress = place.formatted_address || displayName;

      // If we're in location picker mode, show the preview on the map
      if (showLocationPicker && activeLocationInput) {
        if (coords) {
          setLocationPreview({
            lat: coords.lat,
            lng: coords.lng,
            name: displayName,
            fullAddress: fullAddress,
          });
          setMapCenter(coords);
          setPredictions([]);
          setSearchQuery('');
          // Keep location picker open so user can confirm
          return;
        }
      }

      // Otherwise, directly apply the selection (for non-picker flows)
      if (activeLocationInput === 'pickup') {
        if (coords) {
          setPickupCoords(coords);
          setPickup(displayName);
          setPickupAddress(fullAddress);
          setMapCenter(coords);
        }
      } else if (activeLocationInput === 'dropoff') {
        if (coords) {
          setDropoffCoords(coords);
          setDropoff(displayName);
          setDropoffAddress(fullAddress);
          setMapCenter(coords);
        }
      }

      // Clear UI picker
      setShowLocationPicker(false);
      setActiveLocationInput(null);
      setPredictions([]);
      setSearchQuery('');

      // If we now have both pickup and dropoff coords, compute directions client-side
      const origin = pickupCoords || (activeLocationInput === 'pickup' ? coords : pickupCoords);
      const destination = dropoffCoords || (activeLocationInput === 'dropoff' ? coords : dropoffCoords);

      if (origin && destination && isMapsLoaded && (window as any).google) {
        const DirectionsService = new (window as any).google.maps.DirectionsService();
        DirectionsService.route(
          {
            origin: new (window as any).google.maps.LatLng(origin.lat, origin.lng),
            destination: new (window as any).google.maps.LatLng(destination.lat, destination.lng),
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          },
          (result: any, status: string) => {
            setMapsDiagnostics(prev => ({ ...prev, directionsAvailable: Boolean((window as any).google?.maps?.DirectionsService), directionsStatus: status || 'unknown' }));
            if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
              setRouteApiError(null);
              const poly = result.routes[0].overview_polyline.points;
              const decoded = decodeGooglePolyline(poly);
              setRoutePath(decoded);
            } else {
              setRouteApiError(`Directions status: ${status}`);
            }
          }
        );
      }
    } catch (error: any) {
      console.warn('selectPrediction failed:', error?.message || error);
    }
  };

  // DEBUG: Clear all ride data
  const clearAllRideData = () => {
    if (confirm('Clear all lobbies and requests? This will reset the testing environment.')) {
      localStorage.removeItem('trikeserve_share_lobbies');
      localStorage.removeItem('trikeserve_ride_requests');
      localStorage.removeItem('trikeserve_active_ride');
      localStorage.removeItem('trikeserve_accepted_rides');
      
      // Reset component state
      setShowShareLobby(false);
      setShowSharedRides(false);
      setRideStatus(null);
      setActiveRide(null);
      setPickup('');
      setDropoff('');
      setPickupAddress('');
      setDropoffAddress('');
      setSelectedVehicle(null);
      
      alert('✅ All ride data cleared! You can now create a new lobby.');
      window.location.reload();
    }
  };

  // Load persisted ride data on mount
  useEffect(() => {
    const savedRideData = localStorage.getItem('trikeserve_active_ride');
    if (savedRideData) {
      try {
        const rideData = JSON.parse(savedRideData);
        const restoredRequestId = typeof rideData?.requestId === 'string'
          ? rideData.requestId
          : typeof rideData?.id === 'string'
            ? rideData.id
            : null;

        setRideStatus(rideData.status);
        setPickup(rideData.pickup);
        setPickupAddress(rideData.pickupAddress);
        setPickupCoords(rideData.pickupCoords || null);
        setDropoff(rideData.dropoff);
        setDropoffAddress(rideData.dropoffAddress);
        setDropoffCoords(rideData.dropoffCoords || null);
        setSelectedVehicle(rideData.vehicleType);
        setPaymentMethod(rideData.paymentMethod);
        setCurrentRequestId(restoredRequestId);
        if (rideData.activeRide) {
          setActiveRide(rideData.activeRide);
        }
      } catch (error) {
        console.error('Error loading ride data:', error);
      }
    }

    // Check if user is in an active lobby
    const checkActiveLobby = () => {
      if (!user?.id) return;

      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (!lobbiesData) return;

      try {
        const lobbies = JSON.parse(lobbiesData);
        // Find lobby where user is a passenger (waiting OR driver-found status)
        const userLobby = lobbies.find((lobby: any) => 
          (lobby.status === 'waiting' || lobby.status === 'driver-found') &&
          lobby.passengers.some((p: any) => 
            p.id === user.id || p.id.startsWith(`${user.id}_companion_`)
          )
        );

        if (userLobby) {
          // User is already in a lobby, restore state
          setPickup(userLobby.pickup);
          setPickupAddress(userLobby.pickupAddress);
          setPickupCoords(userLobby.pickupCoords || null);
          setDropoff(userLobby.dropoff);
          setDropoffAddress(userLobby.dropoffAddress);
          setDropoffCoords(userLobby.dropoffCoords || null);
          setSelectedVehicle('share');
          
          // Count how many seats the user has (main + companions)
          const userSeats = userLobby.passengers.filter((p: any) => 
            p.id === user.id || p.id.startsWith(`${user.id}_companion_`)
          ).length;
          setPassengerCount(userSeats);
          
          // Show the lobby
          setShowShareLobby(true);
          console.log('✅ Restored active lobby:', userLobby.id, 'Status:', userLobby.status);
        }
      } catch (error) {
        console.error('Error checking active lobby:', error);
      }
    };

    checkActiveLobby();
  }, [user]);

  // Load admin pricing settings from Supabase
  useEffect(() => {
    const loadPricingSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('setting_value')
          .eq('setting_key', 'rates')
          .single();

        if (error) {
          console.warn('Error loading pricing from Supabase:', error);
          return;
        }

        if (data?.setting_value) {
          const settings = JSON.parse(data.setting_value);
          setSharedRidePrice(settings.sharedRide || 15);
          setPrivateRidePrice(settings.privateRide || 50);
          console.log('✅ Loaded admin pricing - Shared: ₱' + settings.sharedRide + ', Private: ₱' + settings.privateRide);
        }
      } catch (error) {
        console.error('Error parsing pricing settings:', error);
      }
    };

    loadPricingSettings();
  }, []);

  // Listen for accepted rides and status updates (polling + storage events)
  useEffect(() => {
    // Continue polling as long as there's an active ride or we're searching
    if (!currentRequestId) return;

      const processDriverStatusUpdate = (status: string, message?: string, source: string = 'unknown', rideContext?: any) => {
        const normalizedStatus = String(status || '').toLowerCase();
       const lastShownStatusKey = `last_shown_status_${currentRequestId}`;
       const lastShownStatus = localStorage.getItem(lastShownStatusKey);
       const rideType = String(rideContext?.ride_type || rideContext?.type || rideContext?.rideType || selectedVehicle || '').toLowerCase();
       const inferredCompletionType: 'ride' | 'delivery' =
         rideType === 'delivery' || message?.toLowerCase().includes('delivery') ? 'delivery' : 'ride';

        console.log('📣 PROCESS DRIVER STATUS UPDATE:', { status: normalizedStatus, message, source, currentRequestId, lastShownStatus, inferredCompletionType });

        if (normalizedStatus === 'completed' && !rideCompletedPopup) {
         console.log('✅✅✅ COMPLETION STATUS RECEIVED - showing completion popup now');
         console.log('   Source:', source);
         console.log('   Inferred Completion Type:', inferredCompletionType);
         console.log('   Setting rideCompletedPopup = TRUE');
         setCompletionPopupType(inferredCompletionType);
         setRideCompletedPopup(true);
        localStorage.setItem(lastShownStatusKey, status);

        // Clear visible ride state so the driver card disappears
        // but delay clearing currentRequestId to avoid racing popup render.
        resetCustomerRideVisuals();
      }

        if (normalizedStatus && normalizedStatus !== 'pending') {
        const statusDisplayMap: { [key: string]: string } = {
          'on-the-way': 'Your driver is on the way to pick you up! 🚗',
          'arrived': 'Your driver has arrived! 📍',
            'pickup': 'You have been picked up! On the way to your destination.',
            'picked-up': 'You have been picked up! On the way to your destination.',
            'drop-off': 'You have arrived at your destination! 🏁',
            'dropped-off': 'You have arrived at your destination! 🏁',
          'in-progress': 'Your ride is in progress!',
          'payment': message || 'Please complete the payment.',
            'awaiting-payment': message || 'Please complete the payment.',
            'completed': message || 'Your ride has been completed. Thank you for using TrikeServe!'
        };

        if (normalizedStatus !== lastShownStatus) {
          setDriverStatusPopup({
              status: normalizedStatus,
              message: statusDisplayMap[normalizedStatus] || message || 'Ride status updated',
            timestamp: Date.now()
          });
          localStorage.setItem(lastShownStatusKey, normalizedStatus);

          if (normalizedStatus === 'payment' || normalizedStatus === 'awaiting-payment') {
            setTimeout(() => setDriverStatusPopup(null), 4000);
          }
        }
      }
    };

    const checkForAcceptedRide = () => {
      const acceptedRidesData = localStorage.getItem('trikeserve_accepted_rides');
      if (acceptedRidesData) {
        try {
          const acceptedRides = JSON.parse(acceptedRidesData);
          const myRide = acceptedRides.find((ride: any) => ride.id === currentRequestId);
          
          if (myRide) {
            // Driver accepted the ride!
            setActiveRide({
              driver: myRide.driverName || 'Driver',
              plateNumber: myRide.driverPlate || 'N/A',
              rating: myRide.driverRating || '4.8',
              eta: myRide.eta || '5 mins',
            });

            // ❌ REMOVED: Popup will be shown from real-time subscription instead
            // This prevents duplicate popups from multiple triggers

            setRideStatus('driver-found');
            setIsSearchMinimized(false);
          }
        } catch (error) {
          console.error('Error checking accepted rides:', error);
        }
      }
    };

    // Check for driver status updates (all ride types)
    const checkForDriverStatusUpdate = async () => {
      if (!currentRequestId) {
        console.log('❌ No currentRequestId, skipping driver status check');
        return;
      }

      // Query database directly for driver status (Option 2 - Database-Driven)
      try {
        const { data: rideRequest, error } = await supabaseHelpers.getRideRequest(currentRequestId);

        console.log('🔍 CHECKING DATABASE for Ride Status Update:');
        console.log('   Request ID:', currentRequestId);
        console.log('   DB Driver Status:', rideRequest?.driver_status);
        console.log('   DB Accepted Driver ID:', rideRequest?.accepted_driver_id);
        console.log('   Status Message:', rideRequest?.driver_status_message);

        if (error) {
          console.error('❌ Database error:', error);
          return;
        }

        if (!rideRequest) {
          console.log('❌ Ride request not found in database');
          return;
        }

      // If the database says the ride is already completed, make sure we clear UI and
      // do NOT re-show the driver card. This prevents polling from setting
      // `rideStatus = 'driver-found'` again when an accepted_driver_id remains set
      // in the DB after the ride is completed.
        // Normalize status fields. If the ride is explicitly completed in any
        // column, prefer that over intermediate payment-stage values.
        console.log('🔍 POLLING: Raw DB fields:');
        console.log('   rideRequest.status:', rideRequest.status);
        console.log('   rideRequest.driver_status:', rideRequest.driver_status);
        console.log('   rideRequest.ride_status:', (rideRequest as any).ride_status);

        const dbStatus =
          rideRequest.status === 'completed' ||
          rideRequest.driver_status === 'completed' ||
          (rideRequest as any).ride_status === 'completed'
            ? 'completed'
            : rideRequest.driver_status || rideRequest.status || (rideRequest as any).ride_status;

         console.log('🔍 POLLING: Normalized dbStatus:', dbStatus);

       // CRITICAL: Check for completion FIRST before checking driver acceptance
        if (dbStatus === 'completed') {
          console.log('✅🎉 POLLING: DB HAS COMPLETED STATUS - calling processDriverStatusUpdate');
          processDriverStatusUpdate('completed', rideRequest.driver_status_message || rideRequest.status_message || 'Delivery completed!', 'polling-db-completed', rideRequest);
          return;
        }

       // CRITICAL: Check if driver has been accepted (this means driver info card should show)
        if (rideRequest.accepted_driver_id && !activeRide) {
          console.log('✅ DRIVER ACCEPTED (Polling detected):', rideRequest.accepted_driver_id);
          console.log('   Driver Name:', rideRequest.driver_name);
          console.log('   Driver Plate:', rideRequest.driver_plate);
          console.log('   Driver Rating:', rideRequest.driver_rating);
          console.log('   Setting activeRide and rideStatus = driver-found');

          const newActiveRide = {
            driver: rideRequest.driver_name || 'Driver',
            plateNumber: rideRequest.driver_plate || 'N/A',
            rating: rideRequest.driver_rating || '4.8',
            eta: rideRequest.eta || '5 mins',
          };

          console.log('🎯 Active Ride Object:', newActiveRide);

          setActiveRide(newActiveRide);
          setRideStatus('driver-found');  // ← CRITICAL! This makes the card appear!

          // Show acceptance popup
          setDriverAcceptedPopup({
            driverName: rideRequest.driver_name || 'Driver',
            driverPlate: rideRequest.driver_plate || 'N/A',
            driverRating: rideRequest.driver_rating || '4.8',
            driverPhoto: '👨‍✈️',
          });
        }

        // Only show status popup if driver_status has been updated AND we haven't shown it yet
        if (rideRequest.driver_status && rideRequest.driver_status !== 'pending') {
          processDriverStatusUpdate(rideRequest.driver_status, rideRequest.driver_status_message || rideRequest.status_message, 'polling-driver_status', rideRequest);
        }
      } catch (error) {
        console.error('❌ Error checking driver status from database:', error);
      }
    };

    // Check immediately
    checkForAcceptedRide();
    checkForDriverStatusUpdate();

    // Poll every 2 seconds
    const interval = setInterval(() => {
      checkForAcceptedRide();
      checkForDriverStatusUpdate();
    }, 2000);

    // Listen for storage events (cross-tab sync AND same-tab events)
    const handleStorageChange = (e: StorageEvent) => {
      console.log('📡 Storage Event Received:', e.key);
      if (e.key === 'trikeserve_accepted_rides') {
        console.log('🔄 Accepted rides changed, checking...');
        checkForAcceptedRide();
      }
      if (e.key?.startsWith('driver_status_')) {
        console.log('🔄 Driver status changed, checking...', e.key);
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : null;
          if (parsed?.status) {
            processDriverStatusUpdate(parsed.status, parsed.message, 'storage-event');
            return;
          }
        } catch (parseError) {
          console.warn('⚠️ Could not parse driver status storage payload:', parseError);
        }
        checkForDriverStatusUpdate();
      }
    };

    // Also listen for custom events dispatched by driver
    const handleCustomStorageEvent = (e: any) => {
      console.log('🎯 Custom Storage Event:', e.detail?.key);
      if (e.detail?.key?.startsWith('driver_status_')) {
        if (e.detail?.value?.status) {
          processDriverStatusUpdate(e.detail.value.status, e.detail.value.message, 'custom-storage-event');
          return;
        }
        checkForDriverStatusUpdate();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('custom-storage-change', handleCustomStorageEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('custom-storage-change', handleCustomStorageEvent);
    };
  }, [rideStatus, currentRequestId, selectedVehicle]);

  // Real-time database subscriptions for driver updates
  useEffect(() => {
    if (!currentRequestId || !user?.id) return;

    console.log('📡 Setting up real-time database subscriptions for ride:', currentRequestId);

    // Subscribe to ride updates (driver status, acceptance, completion)
    const unsubscribe = supabaseHelpers.subscribeToRideUpdates(currentRequestId, (updatedRide) => {
      console.log('🔄 Real-time ride update received:', updatedRide);

      // DEBUG: Log all driver-related fields
      console.log('📊 DRIVER INFO FROM DATABASE:');
      console.log('   accepted_driver_id:', updatedRide.accepted_driver_id);
      console.log('   driver_name:', updatedRide.driver_name);
      console.log('   driver_plate:', updatedRide.driver_plate);
      console.log('   driver_rating:', updatedRide.driver_rating);
      console.log('   driver_photo:', updatedRide.driver_photo);
      console.log('   status:', updatedRide.status);
      console.log('   driver_status:', updatedRide.driver_status);
      console.log('   ride_status:', (updatedRide as any).ride_status);
      console.log('   driver_status_message:', updatedRide.driver_status_message);
      console.log('   ride_type:', updatedRide.ride_type);

      // Normalize realtime status field (support driver_status, status, ride_status).
      // Prefer explicit completion over payment-stage values.
        const realtimeStatus = String(
          updatedRide.status === 'completed' ||
          updatedRide.driver_status === 'completed' ||
          (updatedRide as any).ride_status === 'completed'
            ? 'completed'
            : updatedRide.driver_status || updatedRide.status || (updatedRide as any).ride_status || ''
        ).toLowerCase();

      console.log('🔍 REALTIME STATUS NORMALIZATION:');
      console.log('   Normalized realtimeStatus:', realtimeStatus);

       // Check if driver was accepted - THIS IS THE KEY!
       // Don't show acceptance if the ride is already completed.
       if (updatedRide.accepted_driver_id && !activeRide && realtimeStatus !== 'completed') {
         console.log('✅ DRIVER ACCEPTED (Real-time):', updatedRide.accepted_driver_id);

         const rideState = {
           driver: updatedRide.driver_name || 'Driver',
           plateNumber: updatedRide.driver_plate || 'N/A',
           rating: updatedRide.driver_rating || '4.8',
           eta: updatedRide.eta || '5 mins',
         };

         console.log('🎯 Setting activeRide state with:', rideState);
         console.log('🎯 Setting rideStatus to: driver-found');

         setActiveRide(rideState);
         setRideStatus('driver-found');  // ← CRITICAL! This makes the card appear!

         // Show acceptance popup
         setDriverAcceptedPopup({
           driverName: updatedRide.driver_name || 'Driver',
           driverPlate: updatedRide.driver_plate || 'N/A',
           driverRating: updatedRide.driver_rating || '4.8',
           driverPhoto: '👨‍✈️',
         });
       }

       // Update driver location on map (real-time tracking)
       if (updatedRide.accepted_driver_id && updatedRide.driver_lat && updatedRide.driver_lng) {
         const newDriverLocation = {
           lat: updatedRide.driver_lat,
           lng: updatedRide.driver_lng,
         };
         setDriverLocation(newDriverLocation);
         console.log('📍 Driver location updated:', newDriverLocation);
       }

       // Handle completion status only.
       if (realtimeStatus === 'completed') {
         const lastShownStatusKey = `last_shown_status_${currentRequestId}`;
         const lastShownStatus = localStorage.getItem(lastShownStatusKey);
         const inferredCompletionType: 'ride' | 'delivery' =
           String(updatedRide.ride_type || updatedRide.type || updatedRide.rideType || '').toLowerCase() === 'delivery' ||
           updatedRide.driver_status_message?.toLowerCase().includes('delivery') ||
           updatedRide.status_message?.toLowerCase().includes('delivery')
             ? 'delivery'
             : 'ride';

         console.log('🔍 REALTIME COMPLETION CHECK:');
         console.log('   realtimeStatus:', realtimeStatus);
         console.log('   lastShownStatus:', lastShownStatus);
         console.log('   Inferred Type:', inferredCompletionType);
         console.log('   Will Show?', realtimeStatus !== lastShownStatus);

         if (!rideCompletedPopup) {
           console.log('✅ REALTIME HAS NEW COMPLETED - showing popup');
           console.log('🎉 RIDE COMPLETED (Real-time):', updatedRide);
           console.log('   Inferred Completion Type:', inferredCompletionType);
           console.log('   Setting rideCompletedPopup = true');
           setCompletionPopupType(inferredCompletionType);
           setRideCompletedPopup(true);
           localStorage.setItem(lastShownStatusKey, realtimeStatus);

           // Immediately clear most ride UI so the driver card disappears while
           // the completion popup is shown, but keep currentRequestId briefly to
           // avoid racing the popup render.
           resetCustomerRideVisuals();
         }
       }

      // Check for other driver status updates (for popup messages)
       if (realtimeStatus && realtimeStatus !== 'pending' && realtimeStatus !== 'completed') {
        const statusDisplayMap: { [key: string]: string } = {
          'on-the-way': 'Your driver is on the way to pick you up! 🚗',
          'arrived': 'Your driver has arrived! 📍',
          'pickup': 'You have been picked up! On the way to your destination.',
          'picked-up': 'You have been picked up! On the way to your destination.',
          'drop-off': 'You have arrived at your destination! 🏁',
          'dropped-off': 'You have arrived at your destination! 🏁',
          'in-progress': 'Your ride is in progress!',
          'payment': updatedRide.driver_status_message || 'Please complete the payment.',
          'awaiting-payment': updatedRide.driver_status_message || 'Please complete the payment.',
          'completed': updatedRide.driver_status_message || 'Your ride has been completed. Thank you for using TrikeServe!'
        };

        setDriverStatusPopup({
          status: realtimeStatus,
          message: statusDisplayMap[realtimeStatus] || updatedRide.driver_status_message || 'Ride status updated',
          timestamp: Date.now()
        });

        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          setDriverStatusPopup(null);
        }, 4000);
      }
    });

    // Save unsubscribe function
    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        console.log('🛑 Cleaning up real-time subscription');
        unsubscribeRef.current();
      }
    };
  }, [currentRequestId, user?.id]);

  // Persist ride data whenever it changes
  useEffect(() => {
    if (rideStatus) {
      const rideData = {
        status: rideStatus,
        pickup,
        pickupAddress,
        pickupCoords,
        dropoff,
        dropoffAddress,
        dropoffCoords,
        vehicleType: selectedVehicle,
        paymentMethod,
        activeRide,
        requestId: currentRequestId,
      };
      localStorage.setItem('trikeserve_active_ride', JSON.stringify(rideData));
    } else {
      localStorage.removeItem('trikeserve_active_ride');
    }
   }, [rideStatus, pickup, pickupAddress, dropoff, dropoffAddress, selectedVehicle, paymentMethod, activeRide, currentRequestId]);

   // Compute driver's route to pickup/dropoff location (real-time tracking)
   useEffect(() => {
     if (!driverLocation || !pickupCoords || !isMapsLoaded || !(window as any).google || rideStatus !== 'driver-found') return;

     const DirectionsService = new (window as any).google.maps.DirectionsService();

     // Determine if driver is going to pickup or dropoff
     const destination = pickupCoords;

     DirectionsService.route(
       {
         origin: new (window as any).google.maps.LatLng(driverLocation.lat, driverLocation.lng),
         destination: new (window as any).google.maps.LatLng(destination.lat, destination.lng),
         travelMode: (window as any).google.maps.TravelMode.DRIVING,
       },
       (result: any, status: string) => {
         if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
           const poly = result.routes[0].overview_polyline.points;
           const decoded = decodeGooglePolyline(poly);
           setDriverRoutePath(decoded);
         }
       }
     );
   }, [driverLocation, pickupCoords, isMapsLoaded, rideStatus]);

   // Count unread messages from drivers
   useEffect(() => {
     const countUnreadMessages = () => {
       if (!user?.id) return;

       let unreadCount = 0;

      // Scan localStorage for all chat keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chat_')) {
          try {
            const messages = JSON.parse(localStorage.getItem(key) || '[]');
            // Count unread messages from drivers (sent by riders)
            const unread = messages.filter((m: any) => 
              m.senderType === 'driver' && !m.read
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
  }, [user]);

  const popularLocations = [
    { name: "Adelfa Street", address: "Adelfa Street, Valenzuela", icon: "📍" },
    { name: "B.Garcia Street", address: "B.Garcia Street, Valenzuela", icon: "📍" },
    { name: "Cadena de Amor Street", address: "Cadena de Amor Street, Valenzuela", icon: "📍" },
    { name: "Carnation Street", address: "Carnation Street, Valenzuela", icon: "🌸" },
    { name: "Daffodil Street", address: "Daffodil Street, Valenzuela", icon: "🌼" },
    { name: "Dama de Noche Street", address: "Dama de Noche Street, Valenzuela", icon: "🌙" },
    { name: "Gladiola Street", address: "Gladiola Street, Valenzuela", icon: "🌹" },
    { name: "Ilang-Ilang Street", address: "Ilang-Ilang Street, Valenzuela", icon: "🌸" },
    { name: "Lilac Street", address: "Lilac Street, Valenzuela", icon: "💜" },
    { name: "Jasmin Street", address: "Jasmin Street, Valenzuela", icon: "🌸" },
    { name: "Morning Glory Street", address: "Morning Glory Street, Valenzuela", icon: "🌺" },
    { name: "Marigold Street", address: "Marigold Street, Valenzuela", icon: "🌼" },
    { name: "Orchid Street", address: "Orchid Street, Valenzuela", icon: "🌸" },
    { name: "Rosal Street", address: "Rosal Street, Valenzuela", icon: "🌹" },
    { name: "Balikatan Street", address: "Balikatan Street, Valenzuela", icon: "📍" },
    { name: "Rose Mary Street", address: "Rose Mary Street, Valenzuela", icon: "🌹" },
    { name: "Sampaguita Street", address: "Sampaguita Street, Valenzuela", icon: "🌼" },
    { name: "Everlasting Street", address: "Everlasting Street, Valenzuela", icon: "🌸" },
    { name: "Tagalag Terminal", address: "Main Road, Tagalag", icon: "🚏" },
    { name: "Barangay Hall", address: "Tagalag Center", icon: "🏛️" },
    { name: "Tagalag Market", address: "Market District", icon: "🏪" },
  ];

  const handleLocationSelect = (location: any) => {
    if (activeLocationInput === 'pickup') {
      setPickup(location.name);
      setPickupAddress(location.address);
    } else if (activeLocationInput === 'dropoff') {
      setDropoff(location.name);
      setDropoffAddress(location.address);
    }
    setShowLocationPicker(false);
    setActiveLocationInput(null);
    setSearchQuery("");
  };

  const handleLocationPickerMapClick = (event: any) => {
    const latLng = event?.latLng;
    if (!latLng) return;

    const lat = latLng.lat();
    const lng = latLng.lng();

    const fallbackLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setLocationPreview({
      lat,
      lng,
      name: fallbackLabel,
      fullAddress: fallbackLabel,
    });

    const geocoder = (window as any)?.google?.maps?.Geocoder
      ? new (window as any).google.maps.Geocoder()
      : null;

    if (!geocoder) return;

    geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
      if (status === 'OK' && results?.[0]) {
        const formatted = results[0].formatted_address || fallbackLabel;
        setLocationPreview({
          lat,
          lng,
          name: formatted,
          fullAddress: formatted,
        });
      }
    });
  };

  const applyLocationPreview = () => {
    if (!locationPreview || !activeLocationInput) return;

    const coords = { lat: locationPreview.lat, lng: locationPreview.lng };

    if (activeLocationInput === 'pickup') {
      setPickup(locationPreview.name);
      setPickupAddress(locationPreview.fullAddress);
      setPickupCoords(coords);
      setPickupMarker(coords);
    } else {
      setDropoff(locationPreview.name);
      setDropoffAddress(locationPreview.fullAddress);
      setDropoffCoords(coords);
      setDropoffMarker(coords);
    }

    setMapCenter(coords);
    setShowLocationPicker(false);
    setActiveLocationInput(null);
    setSearchQuery('');
    setPredictions([]);
    setLocationPreview(null);
  };

  const handleBookRide = async () => {
    if (!selectedVehicle) return;
    
    // Validate pickup and dropoff locations
    if (!pickup.trim() || !dropoff.trim()) {
      setShowValidationError(true);
      return;
    }

    // Validate that pickup and dropoff are not the same (for private rides)
    if (selectedVehicle === 'special') {
      if (pickup.trim().toLowerCase() === dropoff.trim().toLowerCase()) {
        setShowSameLocationError(true);
        return;
      }
    }

    if (selectedVehicle === 'share' && user?.id) {
      try {
        const { data: waitingLobbies, error } = await supabaseHelpers.getAvailableLobbies();
        if (!error && waitingLobbies) {
          const existingLobby = waitingLobbies.find((lobby: any) => {
            const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
            return passengers.some((p: any) => p.id === user.id || p.id.startsWith(`${user.id}_companion_`));
          });

          if (existingLobby) {
            alert('You are already in an active lobby. Please leave your current lobby before joining another.');
            setActiveShareLobbyId(existingLobby.id);
            setShowShareLobby(true);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking active lobbies:', error);
      }
    }
    
    // Ask for passenger count for both share and private rides
    setShowPassengerCount(true);
  };

  const handleConfirmBooking = async () => {
    setShowBookingConfirm(false);
    
    // For share rides, open the lobby system
    if (selectedVehicle === 'share') {
      setActiveShareLobbyId(null);
      setShowShareLobby(true);
    } else {
      // For private rides, save to Supabase database
      setRideStatus('searching');
      
      try {
        // Validate user is authenticated
        if (!user?.id) {
          console.error('❌ User ID not found');
          alert('❌ Error: User not authenticated. Please log in again.');
          setRideStatus(null);
          return;
        }

        console.log('📋 Booking ride for user:', user.id);

         // Create ride request data in correct database format
         const rideRequest = {
           customer_id: user.id,
           pickup_location: pickup,
           dropoff_location: dropoff,
           pickup_lat: pickupCoords?.lat || null,
           pickup_lng: pickupCoords?.lng || null,
           dropoff_lat: dropoffCoords?.lat || null,
           dropoff_lng: dropoffCoords?.lng || null,
           status: 'pending',
           ride_type: 'special',
           payment_method: paymentMethod === 'GCASH' ? 'GCASH' : 'COD',
           amount: getPrice(),
           passenger_count: passengerCount,
           created_at: new Date().toISOString(),
           updated_at: new Date().toISOString(),
         };

        console.log('📤 Sending request to Supabase:', rideRequest);

        // Save to Supabase database
        const { data: savedRequest, error: dbError } = await supabaseHelpers.createRideRequest(rideRequest);

        console.log('📥 Supabase response:', { data: savedRequest, error: dbError });

        if (dbError) {
          console.error('❌ Database error:', dbError);
          console.error('❌ Error code:', dbError.code);
          console.error('❌ Error message:', dbError.message);
          alert(`❌ Error booking ride: ${dbError.message || 'Please try again.'}`);
          setRideStatus(null);
          return;
        }

        if (savedRequest) {
          setCurrentRequestId(savedRequest.id);
          console.log('✅ Ride request saved to database:', savedRequest);
          console.log('📱 Request ID:', savedRequest.id);
          console.log('🗄️ Saved in Supabase ride_requests table');
        } else {
          console.error('❌ No data returned from database');
          alert('❌ Error: No response from database. Please try again.');
          setRideStatus(null);
        }
      } catch (error: any) {
        console.error('❌ Error creating ride request:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error message:', error.message);
        alert(`❌ Error booking ride: ${error.message || 'Please try again.'}`);
        setRideStatus(null);
      }
    }
  };

  const handleCancelRide = async () => {
    const storedRequestId = currentRequestId || (() => {
      try {
        const savedRideData = localStorage.getItem('trikeserve_active_ride');
        if (!savedRideData) return null;

        const parsedRide = JSON.parse(savedRideData);
        return typeof parsedRide?.requestId === 'string'
          ? parsedRide.requestId
          : typeof parsedRide?.id === 'string'
            ? parsedRide.id
            : null;
      } catch (error) {
        console.warn('⚠️ Unable to read stored ride request for cancellation:', error);
        return null;
      }
    })();

    try {
      if (storedRequestId) {
        const { error } = await supabaseHelpers.updateRideRequest(storedRequestId, {
          status: 'cancelled',
          driver_status: 'cancelled',
          driver_status_message: 'Customer cancelled the ride request.',
          updated_at: new Date().toISOString(),
        });

        if (error) {
          console.error('❌ Failed to cancel ride request:', error);
          alert(`❌ Failed to cancel ride: ${error.message || 'Please try again.'}`);
          return;
        }
      }

      localStorage.removeItem('trikeserve_active_ride');
      setRideCompletedPopup(false);
      setDriverAcceptedPopup(null);
      setDriverStatusPopup(null);
      resetCustomerRideVisuals();
      setRideStatus(null);
      setCurrentRequestId(null);
      setShowBookingConfirm(false);
    } catch (error: any) {
      console.error('❌ Error cancelling ride:', error);
      alert(`❌ Failed to cancel ride: ${error?.message || 'Please try again.'}`);
    }
  };

  const getPrice = () => {
    if (selectedVehicle === 'share') return sharedRidePrice;
    if (selectedVehicle === 'special') return privateRidePrice;
    return 0;
  };

  const resetCustomerRideVisuals = () => {
    setPickup('');
    setPickupAddress('');
    setDropoff('');
    setDropoffAddress('');
    setPickupCoords(null);
    setDropoffCoords(null);
    setRoutePath([]);
    setDriverLocation(null);
    setDriverRoutePath([]);
    setSelectedMarker(null);
    setLocationPreview(null);
    setPredictions([]);
    setSearchQuery('');
    setActiveRide(null);
    setSelectedVehicle(null);
    setIsSearchMinimized(false);
  };

  const filteredLocations = popularLocations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {/* Full Screen Map */}
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <div className="text-center">
              <p className="text-xl font-bold text-red-600 mb-4">⚠️ Google Maps API Key Missing</p>
              <p className="text-gray-700 mb-4">To use Google Maps, please add your API key to .env.local</p>
            </div>
          </div>
         ) : mapsBlocked || mapsLoadError ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-center max-w-md px-6">
                <p className="text-lg font-bold text-red-600 mb-3">⚠️ Map resources blocked</p>
                <p className="text-sm text-gray-700 mb-4">Your browser or a network filter is blocking Google Maps resources (maps.googleapis.com). This commonly happens when an ad-blocker or privacy extension blocks Google domains.</p>
                {mapsBlocked && <p className="text-xs text-gray-600 mb-3">Diagnostic: {mapsBlocked}</p>}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-[#E11D48] text-white rounded-md"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => {
                      setMapsBlocked(null);
                      window.open('about:blank', '_blank');
                    }}
                    className="px-4 py-2 border rounded-md"
                  >
                    Open Incognito / Disable Extensions
                  </button>
                </div>
              </div>
            </div>
          ) : !isMapsLoaded ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <p className="text-sm text-gray-600">Loading map...</p>
            </div>
          ) : (
           <GoogleMap
             mapContainerStyle={{ width: "100%", height: "100%" }}
             center={currentLocation}
             zoom={15}
             options={{
               zoomControl: false,
               fullscreenControl: true,
               streetViewControl: false,
               mapTypeControl: true,
             }}
           >
             {/* Current location marker (always visible, reference point) */}
             <MarkerF
               position={currentLocation}
               onClick={() => setSelectedMarker(currentLocation)}
               title="Your location (start)"
                icon={createCustomerMarkerIcon()}
             />

              {/* Drop-off marker only */}
              {dropoffCoords && (
                <MarkerF position={dropoffCoords} title="Drop-off location" icon={createDropoffMarkerIcon()} />
              )}

              {/* Driver location marker (real-time tracking) */}
              {driverLocation && rideStatus === 'driver-found' && (
                <MarkerF
                  position={driverLocation}
                  title="Driver Location"
                  icon={createDriverMarkerIcon()}
                />
              )}

              {routePath.length > 0 && (
                <Polyline path={routePath} options={buildNavigationRouteOptions('#E11D48', 5)} />
              )}

              {/* Driver route polyline (real-time) */}
              {driverRoutePath.length > 0 && rideStatus === 'driver-found' && (
                <Polyline path={driverRoutePath} options={buildNavigationRouteOptions('#3B82F6', 4)} />
              )}

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
           </GoogleMap>
         )}
        <div className="absolute top-4 left-4 right-4 z-[1000]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-12 pr-4 py-3.5 bg-white rounded-xl shadow-lg border-0 text-base"
                style={{ outline: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Sheet - Main Booking Interface */}
        {!activeRide && (
          <div className="absolute bottom-20 left-0 right-0 z-[999] px-4">
            <Card className="bg-white shadow-2xl rounded-t-3xl">
              <div className="px-5 pb-6 pt-6">
                {/* Vehicle Type Selection */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Share Ride */}
                  <button
                    onClick={() => setSelectedVehicle('share')}
                    className={`p-3 rounded-2xl border-2 transition-all ${
                      selectedVehicle === 'share'
                        ? 'border-[#E11D48] bg-[#FFF1F2]'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E2E8F0] flex items-center justify-center">
                        <Users className="w-10 h-10 text-[#121212]" />
                      </div>
                      <span className="font-bold text-sm text-[#121212]">Share Ride</span>
                    </div>
                  </button>

                  {/* Private Ride */}
                  <button
                    onClick={() => setSelectedVehicle('special')}
                    className={`p-3 rounded-2xl border-2 transition-all ${
                      selectedVehicle === 'special'
                        ? 'border-[#E11D48] bg-[#FFF1F2]'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E2E8F0] flex items-center justify-center">
                        <UserIcon className="w-10 h-10 text-[#121212]" />
                      </div>
                      <span className="font-bold text-sm text-[#121212]">Private Ride</span>
                    </div>
                  </button>
                </div>

                {/* Location Inputs */}
                <div className="space-y-3 mb-4">
                  {/* Pick up Location Label */}
                  <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide block mb-2">
                    Pick up location
                  </label>
                  
                  {/* Current Location */}
                  <Card
                    className="p-3 border-2 border-[#E2E8F0] shadow-sm cursor-pointer hover:border-[#E11D48] transition-colors"
                    onClick={() => {
                      setActiveLocationInput('pickup');
                      setLocationPreview(
                        pickupCoords
                          ? {
                              lat: pickupCoords.lat,
                              lng: pickupCoords.lng,
                              name: pickup || `${pickupCoords.lat.toFixed(5)}, ${pickupCoords.lng.toFixed(5)}`,
                              fullAddress: pickupAddress || pickup || `${pickupCoords.lat.toFixed(5)}, ${pickupCoords.lng.toFixed(5)}`,
                            }
                          : null
                      );
                      setShowLocationPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[#121212]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#121212] mb-0.5">{pickup}</p>
                        <p className="text-xs text-[#64748B] truncate">{pickupAddress}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[#64748B]" />
                      </button>
                    </div>
                  </Card>

                  {/* Drop off Location Label */}
                  <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide block mb-2 mt-4">
                    Drop off location
                  </label>

                  {/* Destination */}
                  <Card 
                    className="p-3 border-2 border-[#E2E8F0] shadow-sm cursor-pointer hover:border-[#E11D48] transition-colors"
                    onClick={() => {
                      setActiveLocationInput('dropoff');
                      setLocationPreview(
                        dropoffCoords
                          ? {
                              lat: dropoffCoords.lat,
                              lng: dropoffCoords.lng,
                              name: dropoff || `${dropoffCoords.lat.toFixed(5)}, ${dropoffCoords.lng.toFixed(5)}`,
                              fullAddress: dropoffAddress || dropoff || `${dropoffCoords.lat.toFixed(5)}, ${dropoffCoords.lng.toFixed(5)}`,
                            }
                          : null
                      );
                      setShowLocationPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[#E11D48]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#121212] mb-0.5">{dropoff}</p>
                        <p className="text-xs text-[#64748B] truncate">{dropoffAddress}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[#64748B]" />
                      </button>
                    </div>
                  </Card>
                </div>

                {/* Book Ride Button */}
                {selectedVehicle && (
                  <Button
                    onClick={handleBookRide}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase rounded-xl"
                  >
                    Book {selectedVehicle === 'share' ? 'Share' : 'Special'} Ride - ₱{getPrice()}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}


        {/* Active Ride Card - Driver Info - ONLY when rideStatus === 'driver-found' AND activeRide exists */}
        {rideStatus === 'driver-found' && activeRide && (
          <div className="absolute bottom-20 left-0 right-0 z-[1100] p-4">
            <Card className="bg-white shadow-2xl border-2 border-[#E11D48] p-6">
              {/* Driver Info */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center">
                  <span className="text-3xl">👨‍✈️</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-[#121212]">{activeRide.driver}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500 text-white">Driver Found</Badge>
                    <span className="text-sm text-[#64748B]">{activeRide.plateNumber}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-yellow-500 mb-1">
                    <span className="text-lg">⭐</span>
                    <span className="font-bold text-[#121212]">{activeRide.rating}</span>
                  </div>
                  <p className="text-sm text-[#64748B]">ETA: {activeRide.eta}</p>
                </div>
              </div>

              {/* Trip Info */}
              <div className="bg-[#F8F9FA] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#121212] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Pickup</p>
                    <p className="font-semibold text-sm text-[#121212]">{pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Drop-off</p>
                    <p className="font-semibold text-sm text-[#121212]">{dropoff}</p>
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#64748B]">Payment ({paymentMethod})</span>
                <span className="text-2xl font-bold text-[#E11D48]">₱{getPrice()}</span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </Button>
                <Button
                  onClick={handleCancelRide}
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  Cancel Ride
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Validation Error Popup */}
        {showValidationError && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4">
            <Card className="bg-white p-8 max-w-sm w-full text-center animate-infinite-bounce">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-red-600 mb-2">Incomplete Information</h3>
              <p className="text-sm text-[#64748B] mb-6">
                Please complete entering your <strong>pickup location</strong> and <strong>drop-off point</strong> to proceed with booking your ride.
              </p>

              <Button
                onClick={() => setShowValidationError(false)}
                className="w-full bg-red-500 hover:bg-red-600 text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}

        {/* Same Location Error Popup */}
        {showSameLocationError && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4">
            <Card className="bg-white p-8 max-w-sm w-full text-center animate-infinite-bounce">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-red-600 mb-2">Invalid Route</h3>
              <p className="text-sm text-[#64748B] mb-6">
                Your <strong>pickup location</strong> and <strong>drop-off point</strong> cannot be the same. Please select different locations.
              </p>

              <Button
                onClick={() => setShowSameLocationError(false)}
                className="w-full bg-red-500 hover:bg-red-600 text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}


        {/* Ride Completed Popup */}
        {rideCompletedPopup && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-end">
            <div className="bg-white w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
              <div className="max-w-sm mx-auto text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="text-2xl font-bold text-[#121212] mb-2">
                  {completionPopupType === 'delivery' ? 'Delivery Completed!' : 'Ride Completed!'}
                </h3>
                <p className="text-sm text-[#64748B] mb-6">
                  {completionPopupType === 'delivery'
                    ? 'Thank you for using TrikeServe. Your delivery has been completed!'
                    : 'Thank you for using TrikeServe. We hope you had a great ride!'}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-0">
                  <Button
                    onClick={() => {
                      // Open placeholder rating modal (implementation later)
                      setRideCompletedPopup(false);
                      setShowRatingModal(true);
                      setCurrentRequestId(null);
                    }}
                    className="w-full bg-white border-2 border-blue-200 text-blue-600 py-3 font-bold"
                  >
                    Leave a Rating
                  </Button>

                  <Button
                    onClick={() => {
                      setRideCompletedPopup(false);
                      // Reset ride state
                      setActiveRide(null);
                      setRideStatus(null);
                      setCurrentRequestId(null);
                      setCompletionPopupType('ride');
                    }}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 font-bold"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder Rating Modal - opened when user taps Leave a Rating (for future implementation) */}
        {showRatingModal && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-white p-6 max-w-sm w-full text-center">
              <h3 className="text-xl font-bold mb-4">Leave a Rating (Coming Soon)</h3>
              <p className="text-sm text-[#64748B] mb-6">This will let the customer rate the driver. Implementation coming next.</p>
              <Button
                onClick={() => setShowRatingModal(false)}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 font-bold"
              >
                Close
              </Button>
            </Card>
          </div>
        )}

        {/* Driver Status Update Popup */}
        {/* ❌ REMOVED: Driver status popup that appeared at top of screen */}
        {/* This was showing status updates like "On the Way", "Arrived", etc. */}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-[1500]">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1 relative">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
            {unreadMessagesCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full border-2 border-white flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{unreadMessagesCount}</span>
              </div>
            )}
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-[2000] bg-white flex flex-col">
          <div className="absolute top-4 left-4 right-4 z-[2010]">
            <Card className="bg-white/95 backdrop-blur shadow-xl border-0 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-[#64748B] font-semibold">
                    {activeLocationInput === 'pickup' ? 'Pickup — search or tap map' : 'Drop-off — search or tap map'}
                  </p>
                  <h2 className="text-lg font-bold text-[#121212]">Find a nearby place or tap the map</h2>
                </div>
                <button onClick={() => { setShowLocationPicker(false); setActiveLocationInput(null); setLocationPreview(null); setPredictions([]); setSearchQuery(""); }}>
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>

               <div className="mt-3">
                 <Input value={searchQuery} onChange={(e) => { fetchPredictions((e.target as HTMLInputElement).value); }} placeholder="Search restaurants, parks, hotels, terminals..." />
                 {predictions.length > 0 && (
                   <div className="mt-2 bg-white border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                     {predictions.map((p, i) => (
                       <button key={i} onClick={() => selectPrediction(p.place_id)} className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0">
                         <div className="text-sm font-semibold text-[#121212]">{p.displayName}</div>
                         {p.secondaryText && <div className="text-xs text-[#64748B] mt-0.5">{p.secondaryText}</div>}
                       </button>
                     ))}
                   </div>
                 )}
                </div>
             </Card>
           </div>

          <div className="flex-1 pt-40 relative">
            {!isMapsLoaded ? (
              <div className="h-full w-full flex items-center justify-center bg-gray-100">
                <p className="text-sm text-gray-600">Loading picker map...</p>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={locationPreview ? { lat: locationPreview.lat, lng: locationPreview.lng } : mapCenter}
                zoom={16}
                onClick={handleLocationPickerMapClick}
                options={{
                  zoomControl: true,
                  fullscreenControl: false,
                  streetViewControl: false,
                  mapTypeControl: false,
                }}
              >
                <MarkerF position={currentLocation} title="Current location" icon={createCustomerMarkerIcon()} />
                {locationPreview && (
                  <MarkerF
                    position={{ lat: locationPreview.lat, lng: locationPreview.lng }}
                    title={activeLocationInput === 'pickup' ? 'Pickup preview' : 'Drop-off preview'}
                  />
                )}
              </GoogleMap>
            )}

            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
              Tap map to pin {activeLocationInput === 'pickup' ? 'pickup' : 'drop-off'}
            </div>

            {locationPreview && (
              <div className="absolute bottom-4 left-4 right-4">
                <Card className="p-4 shadow-xl">
                  <p className="text-xs text-[#64748B] mb-1 uppercase tracking-wide">Selected location</p>
                  <p className="text-sm font-semibold text-[#121212] truncate">{locationPreview.fullAddress}</p>
                  <Button onClick={applyLocationPreview} className="w-full mt-3 bg-[#E11D48] hover:bg-[#BE123C] text-white">
                    Confirm {activeLocationInput === 'pickup' ? 'Pickup' : 'Drop-off'}
                  </Button>
                </Card>
              </div>
            )}
          </div>

         </div>
       )}

      {/* Passenger Count Modal (for Share Rides) */}
      {showPassengerCount && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[#121212] mb-2">How many passengers?</h2>
            <p className="text-sm text-[#64748B] mb-6">Select the number of seats you need for this trip.</p>

            {/* Passenger Count Selection */}
            <div className={`grid gap-3 mb-6 ${selectedVehicle === 'special' ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {selectedVehicle === 'special'
                ? [1].map(count => (
                    <button
                      key={count}
                      onClick={() => setPassengerCount(count)}
                      className={`p-6 border-2 rounded-2xl transition-all ${
                        passengerCount === count
                          ? 'border-[#E11D48] bg-[#FFF1F2]'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: count }).map((_, i) => (
                            <span key={i} className="text-2xl">👤</span>
                          ))}
                        </div>
                        <span className="font-bold text-lg text-[#121212]">{count}</span>
                        <span className="text-xs text-[#64748B]">
                          {count === 1 ? 'passenger' : 'passengers'}
                        </span>
                      </div>
                    </button>
                  ))
                : [1, 2, 3].map(count => (
                    <button
                      key={count}
                      onClick={() => setPassengerCount(count)}
                      className={`p-6 border-2 rounded-2xl transition-all ${
                        passengerCount === count
                          ? 'border-[#E11D48] bg-[#FFF1F2]'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: count }).map((_, i) => (
                            <span key={i} className="text-2xl">👤</span>
                          ))}
                        </div>
                        <span className="font-bold text-lg text-[#121212]">{count}</span>
                        <span className="text-xs text-[#64748B]">
                          {count === 1 ? 'passenger' : 'passengers'}
                        </span>
                      </div>
                    </button>
                  ))
              }
            </div>

            {/* Price Info */}
            <div className="bg-[#FFF7ED] border-2 border-[#FED7AA] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#92400E] uppercase tracking-wide font-semibold">Your Total Fare</p>
                  {selectedVehicle === 'share' ? (
                    <>
                      <p className="text-sm text-[#78350F] mt-0.5">
                        ₱{sharedRidePrice} × {passengerCount} {passengerCount === 1 ? 'seat' : 'seats'}
                      </p>
                      <p className="text-3xl font-bold text-[#EA580C]">₱{sharedRidePrice * passengerCount}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[#78350F] mt-0.5">
                        ₱{privateRidePrice} × {passengerCount} {passengerCount === 1 ? 'seat' : 'seats'}
                      </p>
                      <p className="text-3xl font-bold text-[#EA580C]">₱{privateRidePrice * passengerCount}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Info Card - Only show for Share Rides */}
            {selectedVehicle !== 'special' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                <p className="text-xs text-blue-900">
                  💡 <span className="font-semibold">Tip:</span> You'll join a shared lobby and wait for other passengers heading the same route. More passengers = faster match!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setShowPassengerCount(false);
                  setShowBookingConfirm(true);
                }}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase"
              >
                Continue with {passengerCount} {passengerCount === 1 ? 'Seat' : 'Seats'}
              </Button>
              {selectedVehicle !== 'special' && (
                <Button
                  onClick={() => {
                    setShowPassengerCount(false);
                    setShowLobbyList(true);
                  }}
                  variant="outline"
                  className="w-full py-6 text-lg font-semibold border-2 border-[#E11D48] text-[#E11D48] hover:bg-[#FFF1F2]"
                >
                  <Users className="w-5 h-5 mr-2" />
                  Browse Available Lobbies
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowPassengerCount(false);
                  setPassengerCount(1);
                }}
                variant="outline"
                className="w-full py-6 text-lg font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Confirmation Modal */}
      {showBookingConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[#121212] mb-6">Confirm Booking</h2>

            {/* Trip Details */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-[#E11D48] mt-1" />
                <div>
                  <p className="text-sm text-[#64748B]">Pickup</p>
                  <p className="font-semibold text-[#121212]">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-green-600 mt-1" />
                <div>
                  <p className="text-sm text-[#64748B]">Drop-off</p>
                  <p className="font-semibold text-[#121212]">{dropoff}</p>
                </div>
              </div>
            </div>

            {/* Ride Type */}
            <div className="bg-[#FFF1F2] border-2 border-[#E11D48] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedVehicle === 'share' ? '🛵' : '🚙'}</span>
                  <div>
                    <p className="font-bold text-[#121212]">
                      {selectedVehicle === 'share' ? 'Share Ride' : 'Private Ride'}
                    </p>
                    <p className="text-sm text-[#64748B]">
                      {selectedVehicle === 'share' ? 'Shared with others' : 'Private ride'}
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#E11D48]">₱{getPrice()}</p>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-[#64748B] mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod('GCASH')}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    paymentMethod === 'GCASH'
                      ? 'border-[#E11D48] bg-[#FFF1F2]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <CreditCard className="w-6 h-6 text-[#0066FF]" />
                    <span className="font-semibold text-[#121212]">GCash</span>
                  </div>
                </button>
                <button
                  onClick={() => setPaymentMethod('COD')}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    paymentMethod === 'COD'
                      ? 'border-[#E11D48] bg-[#FFF1F2]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">💵</span>
                    <span className="font-semibold text-[#121212]">Cash</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleConfirmBooking}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase"
              >
                Confirm Booking
              </Button>
              <Button
                onClick={() => setShowBookingConfirm(false)}
                variant="outline"
                className="w-full py-6 text-lg font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Searching for Driver Modal */}
      {rideStatus === 'searching' && !isSearchMinimized && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <Card className="bg-white p-8 max-w-sm w-full text-center relative">
            {/* Minimize Button */}
            <button
              onClick={() => setIsSearchMinimized(true)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-[#64748B]" />
            </button>

            <div className="w-20 h-20 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-xl font-bold text-[#121212] mb-2">Finding a Driver...</h3>
            <p className="text-[#64748B] mb-6">Please wait while we find you a nearby driver</p>
            <Button
              onClick={handleCancelRide}
              variant="outline"
              className="w-full"
            >
              Cancel Request
            </Button>
          </Card>
        </div>
      )}

      {/* Minimized Floating Icon */}
      {rideStatus === 'searching' && isSearchMinimized && (
        <button
          onClick={() => setIsSearchMinimized(false)}
          className="fixed bottom-24 right-4 z-[2000] w-16 h-16 bg-[#E11D48] rounded-full shadow-2xl flex items-center justify-center hover:bg-[#BE123C] transition-all hover:scale-110"
        >
          <div className="relative">
            <span className="text-3xl animate-pulse">🔍</span>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
        </button>
      )}

      {/* Share Ride Lobby */}
      {showShareLobby && (
        <ShareRideLobby
          lobbyId={activeShareLobbyId || undefined}
          pickup={pickup}
          pickupAddress={pickupAddress}
          dropoff={dropoff}
          dropoffAddress={dropoffAddress}
          passengerCount={passengerCount}
          pricePerSeat={sharedRidePrice}
          onDriverFound={(lobbyId) => {
            // Don't close the lobby - let customers see driver info in the lobby itself
            // Just update the status for tracking
            setCurrentRequestId(`lobby_${lobbyId}`);
            setRideStatus('driver-found');
            console.log('✅ Driver found for lobby:', lobbyId);
          }}
          onClose={() => {
            setShowShareLobby(false);
            setActiveShareLobbyId(null);
            setCurrentRequestId(null);
          }}
        />
      )}

      {/* Browse Available Lobbies Modal */}
      {showLobbyList && (
        <BrowseAvailableLobbies
          pickupAddress={pickupAddress || pickup}
          dropoffAddress={dropoffAddress || dropoff}
          onLobbyJoined={(lobbyId) => {
            setActiveShareLobbyId(lobbyId);
            setShowLobbyList(false);
            setShowShareLobby(true);
          }}
          onClose={() => {
            setShowLobbyList(false);
          }}
        />
      )}


      {/* Driver Status Update Popup */}
      {driverStatusPopup && (
        <div className="fixed inset-0 bg-black/50 z-[3000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
            <div className="max-w-sm mx-auto">
              {/* Status Icon */}
              <div className="w-16 h-16 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                {driverStatusPopup.status === 'on-the-way' && '🚗'}
                {driverStatusPopup.status === 'arrived' && '📍'}
                {driverStatusPopup.status === 'pickup' && '🚀'}
                {driverStatusPopup.status === 'drop-off' && '🏁'}
                {driverStatusPopup.status === 'payment' && '💰'}
                {driverStatusPopup.status === 'completed' && '🎉'}
              </div>

              {/* Status Message */}
              <h3 className="text-2xl font-bold text-[#121212] text-center mb-2">
                {driverStatusPopup.status === 'on-the-way' && 'Driver On The Way'}
                {driverStatusPopup.status === 'arrived' && 'Driver Arrived'}
                {driverStatusPopup.status === 'pickup' && 'Picked Up!'}
                {driverStatusPopup.status === 'drop-off' && 'Arrived at Destination'}
                {driverStatusPopup.status === 'payment' && 'Complete Payment'}
                {driverStatusPopup.status === 'completed' && 'Ride Completed!'}
              </h3>

              <p className="text-[#64748B] text-center mb-6">{driverStatusPopup.message}</p>

              {/* Status Details */}
              <div className="bg-[#F8F9FA] rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#64748B]">Status Update</span>
                  <span className="font-bold text-[#121212]">
                    {driverStatusPopup.status === 'on-the-way' && 'On the way'}
                    {driverStatusPopup.status === 'arrived' && 'Arrived'}
                    {driverStatusPopup.status === 'pickup' && 'Picked up'}
                    {driverStatusPopup.status === 'drop-off' && 'At destination'}
                    {driverStatusPopup.status === 'payment' && 'Payment pending'}
                    {driverStatusPopup.status === 'completed' && 'Completed'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-[#64748B]">Time</span>
                  <span className="text-sm text-[#121212]">Just now</span>
                </div>
              </div>

              <Button
                onClick={() => setDriverStatusPopup(null)}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 text-lg font-bold"
              >
                OK 👍
              </Button>
            </div>
           </div>
         </div>
       )}
     </div>
   );
 }
