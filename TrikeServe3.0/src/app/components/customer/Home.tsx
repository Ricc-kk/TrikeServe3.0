import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, MapPin, Users, User as UserIcon, ChevronDown, X, Clock, Utensils, Search as SearchIcon, User, Navigation, MessageCircle, Home as HomeIcon, ShoppingCart, ClipboardList, Star, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import BottomNav from "../ui/BottomNav";
import { isActiveRideStatus } from "../../../lib/rideLock";
import { useRideResume } from "../../../lib/rideResume";
import ChoiceCard from "../ui/ChoiceCard";
import SectionHeading from "../ui/SectionHeading";
import LocationBanner, { type LocationProblem } from "../ui/LocationBanner";
import FloatingChatHead from "../ui/FloatingChatHead";
import RideChatOverlay from "../rider/RideChatOverlay";
import { GoogleMap, MarkerF, InfoWindow, Polygon, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew, searchPlacesText, type PlaceResult, type PlacesAutocompleteSuggestion } from "@/lib/placesApi";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png';
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, isDropoffWithinAnyTerminalBoundary, isPointInPolygon, normalizeBoundaryPolygon, logAudit } from "@/lib/supabase";
import { computeRideFare, normalizeRates, terminalRates } from "@/lib/pricing";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { supabase } from "../../../utils/supabase";
import { isAwaitingApproval } from "../../../lib/roleAccess";
import SharedRides from "./SharedRides";
import ShareRideLobby from "./ShareRideLobby";
import BrowseAvailableLobbies from "./BrowseAvailableLobbies";
import CustomerHubHeader from "./CustomerHubHeader";
import RecommendedRestaurants from "./RecommendedRestaurants";
import CustomerServiceHub from "./CustomerServiceHub";

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
  { id: "tagalag-terminal", name: "Gen T Deleon Terminal", full: "Main Road, Gen T Deleon, Valenzuela City", lat: 14.7294, lng: 120.9349 },
  { id: "tagalag-market", name: "Gen T Deleon Market", full: "Gen T Deleon Market, Valenzuela City", lat: 14.7301, lng: 120.9356 },
  { id: "tagalag-eco-park", name: "Gen T Deleon Eco Park", full: "Gen T Deleon Eco Park, Valenzuela City", lat: 14.7287, lng: 120.9342 },
  { id: "tagalag-mini-park", name: "Gen T Deleon Mini Park", full: "Gen T Deleon Mini Park, Valenzuela City", lat: 14.7278, lng: 120.9361 },
  { id: "advance-st", name: "Advance Street", full: "Advance Street, Gen T Deleon, Valenzuela City", lat: 14.7285, lng: 120.9355 },
  { id: "balay-de-jesus", name: "Balay De Jesus", full: "Balay De Jesus, Gen T Deleon, Valenzuela City", lat: 14.7296, lng: 120.9344 },
  { id: "pablo-muni", name: "Pablo's Muni", full: "Pablo's Muni Restaurant, Gen T Deleon, Valenzuela City", lat: 14.7293, lng: 120.9359 },
  { id: "pares-overlord", name: "Pares Overlord", full: "Pares Overlord, Gen T Deleon, Valenzuela City", lat: 14.7281, lng: 120.9370 },
  { id: "kuya-oliver", name: "Kuya Oliver", full: "Kuya Oliver, Gen T Deleon, Valenzuela City", lat: 14.7289, lng: 120.9346 },
];

const getNearestRecommendedLocation = (location: { lat: number; lng: number }) => {
  return TAGALAG_BISIG_RECOMMENDATIONS.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.lat - location.lat) ** 2 + (nearest.lng - location.lng) ** 2;
    const candidateDistance = (candidate.lat - location.lat) ** 2 + (candidate.lng - location.lng) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, TAGALAG_BISIG_RECOMMENDATIONS[0]);
};

/**
 * Path points for a Directions result.
 *
 * `overview_polyline` is the obvious source and it is regularly useless here: the
 * object comes back present but with `points: null`, while every individual step
 * carries real geometry. Verified against a live trip -- 3 steps with polyline
 * data, `overview_polyline.points` null. Reading only the overview therefore
 * produced an empty array, the guard on the polyline never passed, and no road line
 * was ever drawn.
 *
 * Steps are decoded separately and concatenated, not joined as strings: each
 * polyline is independently encoded, so splicing the encoded text together
 * corrupts the deltas. Each step starts at the previous step's last point, so that
 * duplicate is dropped to keep the path free of a zero-length segment.
 */
const routePathFromResult = (route: any): LatLng[] => {
  const overview = route?.overview_polyline?.points;
  if (overview) return decodeGooglePolyline(overview);

  const steps = (route?.legs ?? []).flatMap((leg: any) => leg?.steps ?? []);
  const path: LatLng[] = [];
  for (const step of steps) {
    const encoded = step?.polyline?.points;
    if (!encoded) continue;
    const decoded = decodeGooglePolyline(encoded);
    // Drop the first point when it just repeats where the previous step ended.
    path.push(...(path.length ? decoded.slice(1) : decoded));
  }
  return path;
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
    return buildNavigationMarkerIcon('#1D4ED8');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1D4ED8" stroke="white" stroke-width="1">
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
    return buildNavigationMarkerIcon('#BC4B1F');
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC4B1F" stroke="white" stroke-width="1">
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

/**
 * Short labels for the live status shown beside the driver's name.
 *
 * The popup further down uses long sentences ("Your driver is on the way to pick you
 * up!") because it has the whole screen. Beside a name there is room for three or
 * four words at most, and a full sentence there would wrap the card and push the
 * fare off screen.
 */
const DRIVER_STATUS_LABELS: { [key: string]: string } = {
  'on-the-way': 'On the way',
  'arrived': 'Arrived at pickup',
  'pickup': 'Heading to your destination',
  'picked-up': 'Heading to your destination',
  'drop-off': 'Arrived at your destination',
  'dropped-off': 'Arrived at your destination',
  'in-progress': 'Ride in progress',
  'payment': 'Awaiting payment',
  'awaiting-payment': 'Awaiting payment',
  'completed': 'Completed',
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

// Radius, in meters, that comfortably covers a terminal's boundary polygon.
// Used only to bias the Places text search toward the terminal; results are
// still filtered against the polygon itself, so an over-generous radius costs
// a few discarded rows rather than letting an out-of-area place through.
const polygonBiasRadius = (polygon: { lat: number; lng: number }[]): number => {
  if (!polygon.length) return 2000;

  const meanLat = polygon.reduce((sum, p) => sum + p.lat, 0) / polygon.length;
  const meanLng = polygon.reduce((sum, p) => sum + p.lng, 0) / polygon.length;

  const furthest = polygon.reduce((max, p) => {
    // Equirectangular approximation is accurate well past a terminal's size.
    const dx = (p.lng - meanLng) * 111_320 * Math.cos((meanLat * Math.PI) / 180);
    const dy = (p.lat - meanLat) * 110_540;
    return Math.max(max, Math.sqrt(dx * dx + dy * dy));
  }, 0);

  // Extra headroom, and a floor so a tiny polygon still searches its vicinity.
  return Math.min(50_000, Math.max(500, Math.ceil(furthest * 2) + 250));
};

export default function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedVehicle, setSelectedVehicle] = useState<'share' | 'special' | null>(null);
  // Booking is a three-step flow on top of the full-screen map:
  // home (map + Book a Ride) → ride type → pickup / drop-off.
  const [bookingStep, setBookingStep] = useState<'home' | 'ride' | 'locations'>('home');
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
  // Drives the inline location banner; null while the device can give us a position.
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
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
  const [paymentMethod] = useState<'COD'>('COD');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<'searching' | 'driver-found' | 'picking-up' | 'in-transit' | null>(null);

  /*
   * Keeps a pointer to the active ride and restores it after a session drop.
   *
   * `sync` is called with the ride this screen is actually showing, so the marker
   * cannot drift out of step with reality -- it is written from the ride in hand
   * rather than inferred from route or status strings elsewhere.
   */
  const { sync: syncRideResume } = useRideResume();

  /*
   * Write or clear the resume marker whenever the ride on screen changes.
   *
   * `rideStatus` decides whether there is a ride at all: `searching` means a driver
   * has not been assigned, and a marker for that would drop the customer onto a
   * waiting screen after a re-login rather than their ride.
   *
   * This hook is declared after `currentRequestId` on purpose. Defining the effect
   * earlier put `currentRequestId` in its dependency array before it was initialised,
   * which throws "Cannot access before initialization" during render and blanks the
   * whole screen.
   */
  const [isSearchMinimized, setIsSearchMinimized] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  /*
   * Write or clear the resume marker, but only clear it after a ride has actually
   * been seen on this screen.
   *
   * `rideStatus` is `null` transiently on every mount -- the reconcile from the
   * database has not run yet. Clearing on that null wiped the marker before the
   * resume check could read it, which defeated the whole feature. A ride only has
   * "ended" once it has been observed as live and is now no longer live.
   */
  const hadRideRef = useRef(false);
  const isRideLive = rideStatus !== null && rideStatus !== 'searching';
  useEffect(() => {
    if (isRideLive && currentRequestId) {
      hadRideRef.current = true;
      syncRideResume(currentRequestId);
    } else if (hadRideRef.current) {
      // A ride existed and is now gone.
      hadRideRef.current = false;
      syncRideResume(null);
    }
  }, [isRideLive, currentRequestId, syncRideResume]);
   const [currentSharedRideId, setCurrentSharedRideId] = useState<string | null>(null);
   const [showPassengerCount, setShowPassengerCount] = useState(false);
   const [passengerCount, setPassengerCount] = useState(1);
   const [showLobbyList, setShowLobbyList] = useState(false);
   const [activeShareLobbyId, setActiveShareLobbyId] = useState<string | null>(null);
   const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
   const [driverAcceptedPopup, setDriverAcceptedPopup] = useState<any>(null);
   const [driverStatusPopup, setDriverStatusPopup] = useState<{ status: string; message: string } | null>(null);
  /**
   * The driver's latest status, kept permanently.
   *
   * `driverStatusPopup` is not a substitute: it deliberately clears itself after
   * four seconds, so it is a notification and not a state. The card needs the
   * current status to still be readable after that.
   */
  const [driverLiveStatus, setDriverLiveStatus] = useState<string>('');
   const [showValidationError, setShowValidationError] = useState(false);
   const [showSameLocationError, setShowSameLocationError] = useState(false);
   const [showOutOfBoundaryError, setShowOutOfBoundaryError] = useState(false);
   // Shown when the customer taps the map outside the selected terminal's area.
   const [pickerBoundaryWarning, setPickerBoundaryWarning] = useState<string | null>(null);
   const [showCancelConfirm, setShowCancelConfirm] = useState(false);
   const [rideCompletedPopup, setRideCompletedPopup] = useState(false);
   const [completionPopupType, setCompletionPopupType] = useState<'ride' | 'delivery'>('ride');
   const [showRatingModal, setShowRatingModal] = useState(false);
   const [rideDriverId, setRideDriverId] = useState<string | null>(null);
   /**
    * The assigned driver's profile photo.
    *
    * Resolved from `users.avatar_url` by id rather than carried on the ride row,
    * because the accept payload has no photo column -- which is why the card
    * fell back to a hardcoded pilot emoji. Kept as its own state so the
    * name/plate card still renders if the lookup fails.
    */
   const [rideDriverAvatar, setRideDriverAvatar] = useState<string | null>(null);

   /**
    * Floating chat head state.
    *
    * Mirrors the driver's: the head only appears once the ride has a
    * conversation, and the badge counts what the driver has said that has not
    * been read. Same shared component, so the two cannot drift apart.
    */
   const [driverUnread, setDriverUnread] = useState(0);
   const lastDriverCount = useRef(0);
   const [chatPulseKey, setChatPulseKey] = useState(0);
   /**
    * Whether chat has been opened on this ride.
    *
    * Persisted because the Messages tab unmounts this screen -- without it,
    * returning from a reply would drop the head back into the middle of the map.
    */
   const [chatOpened, setChatOpened] = useState(() => {
     try {
       return localStorage.getItem('trikeserve_chat_opened_customer') === '1';
     } catch {
       return false;
     }
   });
   const driverChatId = useRef<string | null>(null);
   /** Whether the ride chat overlay is showing. */
   const [customerChatPopup, setCustomerChatPopup] = useState(false);

   /** Opens (or reuses) the driver thread and jumps to it. */
   const openDriverChatThread = useCallback(async () => {
     if (!user?.id || !rideDriverId) return;
     const { data, error } = await supabaseHelpers.findOrCreateRideChat({
       currentUserId: user.id,
       currentUserName: user.name,
       currentUserRole: user.role,
       peerId: rideDriverId,
       peerName: activeRide?.driver || 'Driver',
       contextId: currentRequestId || undefined,
     });
     if (error || !data) return;
     driverChatId.current = data.id;
     setDriverUnread(0);
     // Read here, not left to the Messages tab: the badge would otherwise keep
     // counting the very message the passenger is on their way to read.
     await supabaseHelpers.markChatConversationRead(data.id, user.id);
     setChatOpened(true);
     try {
       localStorage.setItem('trikeserve_chat_opened_customer', '1');
     } catch {
       // Not fatal; the head still repositions for this mount.
     }
      // Opens the overlay in place, like the driver's. No navigation means this
      // screen stays mounted, so the map, the ride card and the floating head
      // are all still behind the chat, and there is no gap above the thread
      // header for the head to sit in.
      setCustomerChatPopup(true);
    }, [user?.id, rideDriverId, activeRide?.driver, currentRequestId, navigate, rideDriverAvatar]);

   /**
    * Load the driver's photo whenever the assigned driver changes.
    *
    * The ride row carries the driver's name and plate but no avatar, so the only
    * source is the users table. Resolved by id so it works for rides restored
    * from storage as well as ones accepted while the page is open.
    */
   useEffect(() => {
     if (!rideDriverId) {
       setRideDriverAvatar(null);
       return;
     }
     let active = true;
     supabase
       .from('users')
       .select('avatar_url')
       .eq('id', rideDriverId)
       .maybeSingle()
        .then(async ({ data }) => {
          if (!active) return;
          if (data?.avatar_url) {
            setRideDriverAvatar(data.avatar_url);
            return;
          }
          // RLS does not let a customer read another user's row in `users`, so this
          // lookup comes back empty even when the driver has a photo, and the chat
          // head falls back to a generic silhouette. The ride request carries its
          // own copy of the driver's photo, which this session can read.
          const { data: ride } = await supabase
            .from('ride_requests')
            .select('driver_photo')
            .eq('id', currentRequestId)
            .maybeSingle();
          if (active) setRideDriverAvatar(ride?.driver_photo || null);
        })
       .catch(() => {
         // No photo is not a failure; the card keeps its name and plate.
       });
     return () => {
       active = false;
     };
   }, [rideDriverId]);
   const [openingChat, setOpeningChat] = useState(false);
   const [selectedRating, setSelectedRating] = useState(0);
   const [ratingSubmitting, setRatingSubmitting] = useState(false);
   const [ratingSubmitted, setRatingSubmitted] = useState(false);
   // Business info captured when a delivery completes so the customer can rate the restaurant.
   const [deliveryBusiness, setDeliveryBusiness] = useState<{ businessId: string; restaurantName: string; orderId?: string } | null>(null);
   const [unreadDeliveryNotifications, setUnreadDeliveryNotifications] = useState(0);
   const [privateRidePrice, setPrivateRidePrice] = useState(50); // Legacy fixed private fare (fallback when distance is unknown)
   const [sharedRidePrice, setSharedRidePrice] = useState(15); // Legacy fixed share fare (fallback when distance is unknown)
   // The fare captured when the ride was booked — the terminal fare at that
   // moment. The active-ride card shows this instead of re-deriving the fare, so
   // it can't drift from the amount stored on the request when booking state is
   // recomputed or restored from storage.
   const [bookedFare, setBookedFare] = useState<number | null>(null);
   // Per-km pricing set by the admin: fare = baseFare + perKm × distance.
   const [baseFare, setBaseFare] = useState(20);
   const [perKm, setPerKm] = useState(10);
   const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
   const [driverRoutePath, setDriverRoutePath] = useState<LatLng[]>([]);
   const [destinationRoutePath, setDestinationRoutePath] = useState<LatLng[]>([]);
  /**
   * The customer's own map instance.
   *
   * Needed because `center` is a mount-time prop: React only applies it when the
   * value changes, and this map had no other way to move. The driver map got a ref
   * for exactly this reason; without the same here the passenger's map sat at a
   * fixed zoom on wherever they happened to be standing, and the pickup-to-drop-off
   * road line was frequently drawn off-screen or too small to read.
   */
  const customerMapRef = useRef<any>(null);

  /**
   * Frame the whole trip: where the passenger is, the pickup, the driver, the
   * drop-off. Two points is the minimum worth fitting to; with one there is no
   * direction to show and zooming to a single pin is just noise.
   */
  const fitTripBounds = useCallback(() => {
    const map = customerMapRef.current;
    const maps = (window as any).google?.maps;
    if (!map || !maps?.LatLngBounds) return;
    const points = [currentLocation, pickupCoords, dropoffCoords, driverLocation].filter(Boolean) as LatLng[];
    if (points.length < 2) return;
    const bounds = new maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
  }, [currentLocation, pickupCoords, dropoffCoords, driverLocation]);
   const [etaToDestination, setEtaToDestination] = useState<string | null>(null);
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
   const [terminals, setTerminals] = useState<{ id: string; name: string; boundary: string; center_lat: number; center_lng: number; base_fare?: number | null; per_km?: number | null; boundary_polygon?: any }[]>([]);
   const [showTerminalPicker, setShowTerminalPicker] = useState(false);
   const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  // Hub state: what they want (all / a ride / a meal) and whether they have
  // opened the header's search field.
   // The chosen pickup terminal and its plotted service area. Drives the search
   // filter, the picker's map view, and the pin guard, so all three agree on
   // where the customer is allowed to be dropped off.
   const selectedTerminalBoundary = useMemo(() => {
     const terminal = terminals.find(t => t.id === selectedTerminalId) || null;
     return {
       terminal,
       polygon: terminal ? normalizeBoundaryPolygon(terminal.boundary_polygon) : null,
     };
   }, [terminals, selectedTerminalId]);
   const mapRef = useRef<any>(null);
   const hasManualPickupSelectionRef = useRef(false);
   const unsubscribeRef = useRef<(() => void) | null>(null);
   const driverStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   const readValidCoords = (latValue: any, lngValue: any) => {
     const latNum = Number(latValue);
     const lngNum = Number(lngValue);
     if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
     return { lat: latNum, lng: lngNum };
   };

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

   // Get the device position. Reused on mount and when the app returns to the
   // foreground, so the location banner clears once the user fixes the problem.
  const locateUser = useCallback(() => {
    setIsLoadingLocation(true);
    setLocationError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          // default pickup coords to current location when available, without
          // clobbering a terminal the customer picked themselves
          if (!hasManualPickupSelectionRef.current) {
            setPickupCoords({ lat: latitude, lng: longitude });
          }
          setLocationProblem(null);
          setIsLoadingLocation(false);
          console.log('User location:', latitude, longitude);
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          setLocationError(error.message);
          // A denied permission and switched-off location services are fixed in
          // different Android screens, so the banner needs to tell them apart.
          setLocationProblem(error.code === error.PERMISSION_DENIED ? 'permission-denied' : 'services-off');
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

  useEffect(() => {
    locateUser();
  }, [locateUser]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') locateUser();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [locateUser]);

  // Keep pickup state synchronized with currentLocation unless user changes it
  useEffect(() => {
    if (!pickupCoords && currentLocation) {
      setPickupCoords(currentLocation);
      setPickup('Current Location');
    }
  }, [currentLocation]);

  // Load terminals from Supabase for pickup selection. `select('*')` keeps this
  // working before ADD_TERMINAL_FARES.sql adds the per-terminal fare columns.
  useEffect(() => {
    supabase.from('terminals').select('*')
      .then(({ data, error }) => {
        if (!error && data) {
          setTerminals(data.filter((t: any) => t.is_active !== false));
        }
      })
      .catch(() => {});
  }, []);

  // Reverse geocode pickup coords whenever Maps loads or coords change
  useEffect(() => {
    if (pickupCoords && isMapsLoaded && (window as any).google?.maps?.Geocoder) {
      const geocoder = new (window as any).google.maps.Geocoder();
      geocoder.geocode({ location: pickupCoords }, (results: any[], status: string) => {
        if (status === 'OK' && results?.[0]) {
          setPickupAddress(results[0].formatted_address);
        }
      });
    }
  }, [pickupCoords, isMapsLoaded]);

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

      const query = input.trim();

      // The pickup terminal decides where a customer is allowed to be dropped
      // off, so once one is chosen the search is limited to its plotted area.
      const { terminal, polygon: boundary } = selectedTerminalBoundary;

      if (boundary && terminal) {
        // Autocomplete suggestions carry no coordinates, so they cannot be
        // tested against the polygon. Text Search returns a location per hit,
        // which lets each result be checked before it is ever shown.
        const hits = await searchPlacesText({
          textQuery: query,
          apiKey,
          bias: { lat: terminal.center_lat, lng: terminal.center_lng },
          biasRadiusMeters: polygonBiasRadius(boundary),
        });

        setPredictions(
          hits
            .filter(hit => isPointInPolygon(hit.lat!, hit.lng!, boundary))
            .map(hit => ({
              place_id: hit.place_id || '',
              displayName: hit.display_name || hit.name || hit.formatted_address || 'Drop-off point',
              secondaryText: hit.formatted_address,
              fullText: hit.formatted_address,
            }))
        );
        return;
      }

      const suggestions = await autocompletePlacesNew({
        input: query,
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
        if (typeof rideData?.rideDriverId === 'string') {
          setRideDriverId(rideData.rideDriverId);
        }
        setPickup(rideData.pickup);
        setPickupAddress(rideData.pickupAddress);
        setPickupCoords(rideData.pickupCoords || null);
        setDropoff(rideData.dropoff);
        setDropoffAddress(rideData.dropoffAddress);
        setDropoffCoords(rideData.dropoffCoords || null);
        setSelectedVehicle(rideData.vehicleType);
        setCurrentRequestId(restoredRequestId);
        if (rideData.activeRide) {
          setActiveRide(rideData.activeRide);
        }
        if (rideData.bookedFare != null) {
          setBookedFare(Number(rideData.bookedFare));
        }

        /**
         * Reconcile with the database, because localStorage cannot know what
         * happened while this screen was unmounted.
         *
         * Changing tab unmounts this page, which tears down the realtime
         * subscription. A driver accepting during that window was never seen:
         * the stored status stays `searching` and `activeRide` stays null, so
         * the booking card renders nothing and the booking flow stays hidden
         * (`showBookingFlow` is false while searching) -- the booking appears to
         * have vanished. Re-reading the request on mount picks up an acceptance
         * that landed while away.
         */
        /**
         * Always reconcile when there is a stored request.
         *
         * This used to be skipped whenever `activeRide` was already cached, and
         * that is what broke Chat: the Chat button's handler bails out silently
         * when `rideDriverId` is null, and `rideDriverId` is only ever set from
         * the database or a live event -- never from the cached payload. So a
         * booking restored with a driver already assigned rendered a working
         * driver card whose Chat button did nothing at all.
         */
        if (restoredRequestId) {
          supabaseHelpers
            .getRideRequest(restoredRequestId)
            .then(({ data: fresh }) => {
              if (!fresh) return;

              // Restore the stored coordinates too. The pickup-to-destination
              // route line is computed from these, and they are often missing
              // from a cached booking, so without this the destination line had
              // nothing to draw and no error to explain it.
              if (fresh.pickup_lat != null && fresh.pickup_lng != null) {
                setPickupCoords({ lat: Number(fresh.pickup_lat), lng: Number(fresh.pickup_lng) });
              }
              if (fresh.dropoff_lat != null && fresh.dropoff_lng != null) {
                setDropoffCoords({ lat: Number(fresh.dropoff_lat), lng: Number(fresh.dropoff_lng) });
              }

              if (fresh.status === 'completed' || fresh.status === 'cancelled') {
                // The ride ended while away; drop the stale local copy so the
                // next booking starts clean.
                setRideStatus(null);
                setActiveRide(null);
                localStorage.removeItem('trikeserve_active_ride');
                return;
              }

              if (fresh.accepted_driver_id) {
                const rideState = {
                  driver: fresh.driver_name || 'Driver',
                  plateNumber: fresh.driver_plate || 'N/A',
                  rating: fresh.driver_rating || '4.8',
                  eta: fresh.eta || '5 mins',
                };
                setRideDriverId(fresh.accepted_driver_id);
                setRideStatus('driver-found');
                // Only rebuild the card when one is not already on screen.
                // Overwriting a cached card on every mount discarded live
                // progress such as the resolved ETA.
                if (!rideData.activeRide) {
                  setActiveRide(rideState);
                }
                if (fresh.amount != null) {
                  const amount = Number(fresh.amount);
                  if (Number.isFinite(amount) && amount > 0) setBookedFare(amount);
                }
              }
            })
            .catch(() => {
              // Offline or the request is gone. The cached state still renders,
              // which is better than clearing a live booking.
            });
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

    // Restore an active share ride lobby (the current mechanism) so that
    // returning to the rides page reopens the lobby during an active ride,
    // just like the private-ride active card is restored.
    const storedLobbyId = localStorage.getItem('trikeserve_active_share_lobby');
    if (storedLobbyId) {
      supabaseHelpers.getLobbyById(storedLobbyId).then(({ data: storedLobby, error }) => {
        if (error || !storedLobby) {
          localStorage.removeItem('trikeserve_active_share_lobby');
          return;
        }
        if (storedLobby.status === 'completed' || storedLobby.status === 'cancelled') {
          localStorage.removeItem('trikeserve_active_share_lobby');
          return;
        }
        // Ride still active - reopen the lobby automatically.
        setActiveShareLobbyId(storedLobbyId);
        setShowShareLobby(true);
      });
    }
  }, [user]);   // Poll unread delivery notifications for the bell badge.
   useEffect(() => {
     if (!user?.id) return;
     const loadUnread = async () => {
       const { data } = await supabaseHelpers.getDeliveryNotifications(user.id);
       setUnreadDeliveryNotifications((data || []).filter((n: any) => !n.read).length);
     };
     loadUnread();
     const interval = setInterval(loadUnread, 5000);
     return () => clearInterval(interval);
   }, [user?.id]);

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
          const settings = normalizeRates(JSON.parse(data.setting_value));
          setSharedRidePrice(settings.sharedRide);
          setPrivateRidePrice(settings.privateRide);
          setBaseFare(settings.baseFare);
          setPerKm(settings.perKm);
          console.log(`✅ Loaded admin pricing - ₱${settings.baseFare} base + ₱${settings.perKm}/km`);
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

        // For deliveries, remember which business the customer can rate.
        if (inferredCompletionType === 'delivery' && rideContext) {
          captureDeliveryBusiness(rideContext);
        }

        // Clear visible ride state so the driver card disappears
        // but delay clearing currentRequestId to avoid racing popup render.
        resetCustomerRideVisuals();
      }

        if (normalizedStatus && normalizedStatus !== 'pending' && normalizedStatus !== 'cancelled') {
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

        // The card's status persists, so it is set on every update rather than only
        // when the status changes -- a re-poll of the same status must still correct
        // the card if the page was mounted mid-ride.
        setDriverLiveStatus(normalizedStatus);

        if (normalizedStatus !== lastShownStatus) {
          // Normalize driver-side statuses to the display keys used by the popup UI.
          const displayStatus =
            normalizedStatus === 'picked-up' ? 'pickup' :
            normalizedStatus === 'dropped-off' ? 'drop-off' :
            normalizedStatus === 'awaiting-payment' ? 'payment' :
            normalizedStatus;

          setDriverStatusPopup({
              status: displayStatus,
              message: statusDisplayMap[normalizedStatus] || message || 'Ride status updated'
          });
          localStorage.setItem(lastShownStatusKey, normalizedStatus);

          if (normalizedStatus === 'payment' || normalizedStatus === 'awaiting-payment') {
            if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
            driverStatusTimerRef.current = setTimeout(() => setDriverStatusPopup(null), 4000);
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

          // Remember who the driver is so the customer can rate them later.
          setRideDriverId(rideRequest.accepted_driver_id);

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
            driverPhoto: '👨‍✈️', // replaced by rideDriverAvatar once it loads // replaced by rideDriverAvatar once it loads
          });

          // Use the driver's real average rating from driver_ratings when available.
          supabaseHelpers.getDriverRating(rideRequest.accepted_driver_id).then(({ average }: { average: number | null }) => {
            if (average != null) {
              setActiveRide(prev => prev ? { ...prev, rating: average.toFixed(1) } : prev);
              setDriverAcceptedPopup(prev => prev ? { ...prev, driverRating: average.toFixed(1) } : prev);
            }
          });
        }

        // Ensure pickup/dropoff coordinates are hydrated from DB once driver accepts.
        const dbPickupCoords = readValidCoords(rideRequest.pickup_lat, rideRequest.pickup_lng);
        if (dbPickupCoords) {
          setPickupCoords(prev => {
            if (prev && prev.lat === dbPickupCoords.lat && prev.lng === dbPickupCoords.lng) return prev;
            return dbPickupCoords;
          });
        }

        const dbDropoffCoords = readValidCoords(rideRequest.dropoff_lat, rideRequest.dropoff_lng);
        if (dbDropoffCoords) {
          setDropoffCoords(prev => {
            if (prev && prev.lat === dbDropoffCoords.lat && prev.lng === dbDropoffCoords.lng) return prev;
            return dbDropoffCoords;
          });
        }

        // Follow the amount stored on the request (the terminal fare captured
        // at booking) so the displayed fare survives a reload.
        const dbAmount = Number(rideRequest.amount);
        if (Number.isFinite(dbAmount) && dbAmount > 0) setBookedFare(dbAmount);

        // Update driver location from DB only if it actually changed
        if (rideRequest.driver_lat && rideRequest.driver_lng) {
          const lat = Number(rideRequest.driver_lat);
          const lng = Number(rideRequest.driver_lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            setDriverLocation(prev => {
              if (prev && prev.lat === lat && prev.lng === lng) return prev;
              return { lat, lng };
            });
          }
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

       // Follow the amount stored on the request (the terminal fare).
       const realtimeAmount = Number(updatedRide.amount);
       if (Number.isFinite(realtimeAmount) && realtimeAmount > 0) setBookedFare(realtimeAmount);

       // Check if driver was accepted - THIS IS THE KEY!
       // Don't show acceptance if the ride is already completed.
       if (updatedRide.accepted_driver_id && !activeRide && realtimeStatus !== 'completed') {
         console.log('✅ DRIVER ACCEPTED (Real-time):', updatedRide.accepted_driver_id);

         // Remember who the driver is so the customer can rate them later.
         setRideDriverId(updatedRide.accepted_driver_id);

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
           driverPhoto: '👨‍✈️', // replaced by rideDriverAvatar once it loads
         });

         // Use the driver's real average rating from driver_ratings when available.
         supabaseHelpers.getDriverRating(updatedRide.accepted_driver_id).then(({ average }: { average: number | null }) => {
           if (average != null) {
             setActiveRide(prev => prev ? { ...prev, rating: average.toFixed(1) } : prev);
             setDriverAcceptedPopup(prev => prev ? { ...prev, driverRating: average.toFixed(1) } : prev);
           }
         });
       }

       // Hydrate route coordinates from realtime payload — only update if changed
       const realtimePickupCoords = readValidCoords(updatedRide.pickup_lat, updatedRide.pickup_lng);
       if (realtimePickupCoords) {
         setPickupCoords(prev => {
           if (prev && prev.lat === realtimePickupCoords.lat && prev.lng === realtimePickupCoords.lng) return prev;
           return realtimePickupCoords;
         });
       }

       const realtimeDropoffCoords = readValidCoords(updatedRide.dropoff_lat, updatedRide.dropoff_lng);
       if (realtimeDropoffCoords) {
         setDropoffCoords(prev => {
           if (prev && prev.lat === realtimeDropoffCoords.lat && prev.lng === realtimeDropoffCoords.lng) return prev;
           return realtimeDropoffCoords;
         });
       }

       // Update driver location on map — only update if changed
       if (updatedRide.accepted_driver_id && updatedRide.driver_lat && updatedRide.driver_lng) {
         const newLat = Number(updatedRide.driver_lat);
         const newLng = Number(updatedRide.driver_lng);
         if (!isNaN(newLat) && !isNaN(newLng)) {
           setDriverLocation(prev => {
             if (prev && prev.lat === newLat && prev.lng === newLng) return prev;
             return { lat: newLat, lng: newLng };
           });
         }
         console.log('📍 Driver location updated');
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

           // For deliveries, remember which business the customer can rate.
           if (inferredCompletionType === 'delivery') {
             captureDeliveryBusiness(updatedRide);
           }

           // Immediately clear most ride UI so the driver card disappears while
           // the completion popup is shown, but keep currentRequestId briefly to
           // avoid racing the popup render.
           resetCustomerRideVisuals();
         }
       }

      // Check for other driver status updates (for popup messages)
       if (realtimeStatus && realtimeStatus !== 'pending' && realtimeStatus !== 'completed' && realtimeStatus !== 'cancelled') {
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

        // Only show each status once. Realtime also fires on driver location
        // pings (driver_lat/driver_lng), which would otherwise re-pop the
        // popup every few seconds during the ride.
        const rtLastShownStatusKey = `last_shown_status_${currentRequestId}`;
        const rtLastShownStatus = localStorage.getItem(rtLastShownStatusKey);

        if (realtimeStatus !== rtLastShownStatus) {
          // Normalize driver-side statuses to the display keys used by the popup UI.
          const displayStatus =
            realtimeStatus === 'picked-up' ? 'pickup' :
            realtimeStatus === 'dropped-off' ? 'drop-off' :
            realtimeStatus === 'awaiting-payment' ? 'payment' :
            realtimeStatus;

          setDriverStatusPopup({
            status: displayStatus,
            message: statusDisplayMap[realtimeStatus] || updatedRide.driver_status_message || 'Ride status updated'
          });
          localStorage.setItem(rtLastShownStatusKey, realtimeStatus);

          // Auto-dismiss after 4 seconds (payment stage only)
          if (realtimeStatus === 'payment' || realtimeStatus === 'awaiting-payment') {
            if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
            driverStatusTimerRef.current = setTimeout(() => {
              setDriverStatusPopup(null);
            }, 4000);
          }
        }
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
        // Persisted so a restored booking still knows who the driver is. Without
        // this, Chat has no peer id after a reload and its handler bails out
        // silently.
        rideDriverId,
        bookedFare,
      };
      localStorage.setItem('trikeserve_active_ride', JSON.stringify(rideData));
    } else {
      localStorage.removeItem('trikeserve_active_ride');
    }
   }, [rideStatus, pickup, pickupAddress, pickupCoords, dropoff, dropoffAddress, dropoffCoords, selectedVehicle, paymentMethod, activeRide, currentRequestId, rideDriverId, bookedFare]);

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
         if (status === 'OK' && result?.routes?.[0]) {
           const route = result.routes[0];
           if (route.overview_polyline?.points) {
             setDriverRoutePath(routePathFromResult(route));
           }
         }
       }
     );
   }, [driverLocation, pickupCoords, isMapsLoaded, rideStatus]);

   // Compute pickup-to-dropoff route during ride tracking (like driver preview)
   useEffect(() => {
     if (!pickupCoords || !dropoffCoords || !isMapsLoaded || !(window as any).google) return;
     if (!rideStatus || rideStatus === 'searching') return;

     const DirectionsService = new (window as any).google.maps.DirectionsService();
     DirectionsService.route(
       {
         origin: new (window as any).google.maps.LatLng(pickupCoords.lat, pickupCoords.lng),
         destination: new (window as any).google.maps.LatLng(dropoffCoords.lat, dropoffCoords.lng),
         travelMode: (window as any).google.maps.TravelMode.DRIVING,
       },
       (result: any, status: string) => {
         if (status === 'OK' && result?.routes?.[0]) {
           const route = result.routes[0];
           if (route.overview_polyline?.points) {
             setDestinationRoutePath(routePathFromResult(route));
           }
           // Extract ETA from legs
           const leg = route.legs?.[0];
           if (leg?.duration?.text) {
             setEtaToDestination(leg.duration.text);
           }
         }
       }
     );
   }, [pickupCoords, dropoffCoords, isMapsLoaded, rideStatus]);

    /*
     * Re-frame once the road line actually exists, and again if either endpoint
     * moves.
     *
     * Keyed on the route becoming non-empty rather than on `driverLocation`, so
     * this does not re-fit on every GPS tick and yank the map out from under
     * someone who has panned somewhere deliberately. The driver's live position is
     * still folded into the bounds, it just is not the trigger.
     */
    const tripRouteDrawn = destinationRoutePath.length > 0;
    useEffect(() => {
      if (!tripRouteDrawn) return;
      fitTripBounds();
    }, [
      tripRouteDrawn,
      pickupCoords?.lat,
      pickupCoords?.lng,
      dropoffCoords?.lat,
      dropoffCoords?.lng,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ]);

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
    { name: "Gen T Deleon Terminal", address: "Main Road, Gen T Deleon", icon: "🚏" },
    { name: "Barangay Hall", address: "Gen T Deleon Center", icon: "🏛️" },
    { name: "Gen T Deleon Market", address: "Market District", icon: "🏪" },
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

    // A tap outside the selected terminal's area is refused outright, so the
    // customer cannot pin a drop-off the search would never have offered.
    const { polygon, terminal } = selectedTerminalBoundary;
    if (polygon && !isPointInPolygon(lat, lng, polygon)) {
      setPickerBoundaryWarning(
        `That spot is outside ${terminal?.name || 'this terminal'}'s service area. Tap inside the highlighted border.`
      );
      return;
    }

    setPickerBoundaryWarning(null);

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

  // Rejects a booking whose drop-off falls outside every active terminal's
  // plotted coverage area. Terminals often overlap, so being inside any one of
  // them is enough; terminals with no plotted area are ignored.
  const checkDropoffBoundary = async (): Promise<boolean> => {
    // Nothing to validate without coordinates.
    if (!dropoffCoords) return true;

    const { allowed, checkedCount } = await isDropoffWithinAnyTerminalBoundary(
      dropoffCoords.lat,
      dropoffCoords.lng
    );

    if (!allowed) {
      console.log('🚫 Drop-off outside all terminal boundaries:', dropoffCoords, { checkedCount });
      setShowOutOfBoundaryError(true);
      return false;
    }

    return true;
  };

  // The booking UI lives on top of the map and stays out of the way while a
  // ride is active or a request is already being searched for.
  const showBookingFlow = !activeRide && rideStatus !== 'searching';

  /**
   * Watch the driver's messages so the floating head's badge is honest.
   *
   * Only the count is kept -- reading happens in the Messages tab, and holding a
   * second copy of the messages here would be a staler duplicate of what that
   * tab already renders. The ripple fires only when the count actually rises, so
   * a thread with existing unread history does not pulse forever on mount.
   */
  useEffect(() => {
    if (!rideDriverId || !user?.id) return;
    let cancelled = false;

    const check = async () => {
      // Find the thread rather than creating one: a passenger who has not messaged
      // yet should get no badge, not an empty conversation invented for them.
      const { data } = await supabase
        .from('chat_conversations')
        .select('id, participant_a_id, participant_b_id, updated_at')
        .or(`participant_a_id.eq.${user.id},participant_b_id.eq.${user.id}`);

      const mine = ((data || []) as any[]).filter((c) => {
        const other = c.participant_a_id === user.id ? c.participant_b_id : c.participant_a_id;
        return other === rideDriverId;
      });
      if (cancelled || mine.length === 0) return;
      mine.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      const cid = mine[0].id;
      driverChatId.current = cid;

      const { data: msgs } = await supabaseHelpers.getChatMessages(cid);
      if (cancelled) return;
      const fromDriver = ((msgs || []) as any[]).filter(
        (m: any) => m.sender_id !== user.id && m.read === false
      );
      const count = fromDriver.length;

      if (count > lastDriverCount.current) setChatPulseKey((k) => k + 1);
      lastDriverCount.current = count;
      setDriverUnread(count);
    };

    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rideDriverId, user?.id]);

  const handleBookRide = async () => {
    if (!selectedVehicle) return;
    
    // Validate pickup terminal is selected (for private rides)
    if (selectedVehicle === 'special' && !selectedTerminalId) {
      alert('Please select a pickup terminal first.');
      setShowTerminalPicker(true);
      return;
    }

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
      if (!(await checkDropoffBoundary())) return;

      setActiveShareLobbyId(null);
      setShowShareLobby(true);
    } else {
      if (!(await checkDropoffBoundary())) return;

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

        // Capture the terminal fare at booking time so the request, the
        // active-ride card, and any restored state all agree.
        const fareAmount = getPrice();
        setBookedFare(fareAmount);

         // Create ride request data in correct database format
         const rideRequest = {
           customer_id: user.id,
           pickup_location: pickup,
           dropoff_location: dropoff,
           pickup_address: pickupAddress || pickup || null,
           dropoff_address: dropoffAddress || dropoff || null,
           pickup_lat: pickupCoords?.lat || null,
           pickup_lng: pickupCoords?.lng || null,
           dropoff_lat: dropoffCoords?.lat || null,
           dropoff_lng: dropoffCoords?.lng || null,
           status: 'pending',
           ride_type: 'special',
           terminal_id: selectedTerminalId || null,
           payment_method: paymentMethod === 'GCASH' ? 'GCASH' : 'COD',
           amount: fareAmount,
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
          logAudit({
            action: 'create_ride',
            actorRole: 'customer',
            entityType: 'ride_request',
            entityId: savedRequest.id,
            summary: `Booked a private ride: ${pickup} → ${dropoff}`,
            details: { amount: fareAmount, terminal_id: selectedTerminalId },
            actorEmail: user?.email,
            actorName: user?.name,
          });
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

  const handleCancelRide = async (reason?: string) => {
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
      // A lobby id ("lobby_…") isn't a ride_requests row — a shared ride is left
      // from the lobby screen instead.
      if (storedRequestId && !storedRequestId.startsWith('lobby_')) {
        // Read the row first so a cancelled delivery can cancel its order too.
        const { data: rideRequest } = await supabaseHelpers.getRideRequest(storedRequestId);

        const { error } = await supabaseHelpers.updateRideRequest(storedRequestId, {
          status: 'cancelled',
          driver_status: 'cancelled',
          // Include the customer's reason so the rider can see why it was dropped.
          driver_status_message: reason
            ? `Customer cancelled the ride: ${reason}`
            : 'Customer cancelled the ride request.',
          cancel_reason: reason || null,
          cancelled_by: 'customer',
          updated_at: new Date().toISOString(),
        });

        if (error) {
          console.error('❌ Failed to cancel ride request:', error);
          alert(`❌ Failed to cancel ride: ${error.message || 'Please try again.'}`);
          return;
        }

        logAudit({
          action: 'cancel_ride',
          actorRole: 'customer',
          entityType: 'ride_request',
          entityId: storedRequestId,
          summary: `Cancelled a ride request${reason ? `: ${reason}` : ''}`,
          details: { reason: reason || null },
          actorEmail: user?.email,
          actorName: user?.name,
        });

        // A delivery ride is backed by an orders row — cancel that too so the
        // business sees the order as cancelled and can read the customer's reason.
        const linkedOrderId =
          rideRequest?.order_id ||
          supabaseHelpers.parseOrderIdFromDeliveryPickup(
            rideRequest?.pickup_location || rideRequest?.pickup || ''
          );

        if (linkedOrderId) {
          const { error: orderError } = await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              cancel_reason: reason || null,
              cancelled_by: 'customer',
              updated_at: new Date().toISOString(),
            })
            .eq('id', linkedOrderId)
            // Never walk back an order that was already delivered.
            .neq('status', 'delivered');

          if (orderError) {
            console.error('⚠️ Ride cancelled but the linked order was not:', orderError);
          } else {
            console.log('✅ Linked order cancelled with the customer\'s reason:', linkedOrderId);
          }
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

  const handleOpenDriverChat = async () => {
    if (!user?.id || !rideDriverId || openingChat) return;
    setOpeningChat(true);
    try {
      const { data, error } = await supabaseHelpers.findOrCreateRideChat({
        currentUserId: user.id,
        currentUserName: user.name,
        currentUserRole: user.role,
        peerId: rideDriverId,
        peerName: activeRide?.driver || 'Driver',
        contextId: currentRequestId || undefined,
      });
      if (error || !data) {
        console.error('❌ Failed to open driver chat:', error);
        alert('Failed to open chat. Please try again.');
        return;
      }
      navigate(`/customer/messages/thread/${data.id}`);
    } finally {
      setOpeningChat(false);
    }
  };

  // Each terminal sets the fare for its own rides. The admin-wide rate is only a
  // fallback for a terminal that hasn't set a fare (or before one is picked).
  const selectedTerminal = useMemo(
    () => terminals.find(t => t.id === selectedTerminalId) || null,
    [terminals, selectedTerminalId]
  );
  const terminalFare = useMemo(() => terminalRates(selectedTerminal), [selectedTerminal]);
  const activeRates = {
    baseFare: selectedTerminal?.base_fare != null ? terminalFare.baseFare : baseFare,
    perKm: selectedTerminal?.per_km != null ? terminalFare.perKm : perKm,
  };

  // Fare is per kilometer: base + (rate × straight-line km between pickup and drop-off).
  const fareInfo = useMemo(
    () => computeRideFare(activeRates, pickupCoords, dropoffCoords),
    [activeRates.baseFare, activeRates.perKm, pickupCoords, dropoffCoords]
  );
  // Falls back to the legacy fixed fare when the two points have no coordinates yet.
  const rideTotal = fareInfo.distanceKm != null ? fareInfo.total : privateRidePrice;
  const fareBreakdown = fareInfo.distanceKm != null
    ? `₱${activeRates.baseFare} base + ₱${activeRates.perKm}/km × ${fareInfo.distanceKm.toFixed(1)} km${selectedTerminal ? ` · ${selectedTerminal.name}` : ''}`
    : `Fixed rate${selectedTerminal ? ` · ${selectedTerminal.name}` : ''}`;

  const getPrice = () => {
    if (selectedVehicle === 'share') return passengerCount > 0 ? Math.round((rideTotal / passengerCount) * 100) / 100 : sharedRidePrice;
    if (selectedVehicle === 'special') return rideTotal;
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
    setSelectedTerminalId(null);
    setDriverRoutePath([]);
    setDestinationRoutePath([]);
    setEtaToDestination(null);
    setSelectedMarker(null);
    setLocationPreview(null);
    setPredictions([]);
    setSearchQuery('');
    setActiveRide(null);
    setBookedFare(null);
    setSelectedVehicle(null);
    setIsSearchMinimized(false);
    // A finished ride drops the customer back on the plain map + Book a Ride.
    setBookingStep('home');
  };

  // When a delivery completes, capture which business the customer can rate.
  const captureDeliveryBusiness = async (rideRequest: any) => {
    const orderId = supabaseHelpers.parseOrderIdFromDeliveryPickup(rideRequest?.pickup_location || rideRequest?.pickup);
    if (!orderId) return;
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('business_id, restaurant_name, order_number, restaurant_email')
        .eq('id', orderId)
        .single();
      let businessId: string | null = order?.business_id || null;
      // orders.restaurant_email actually stores the restaurant id; map it to the
      // business user when business_id isn't set on the order.
      if (!businessId && order?.restaurant_email) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('business_user_id')
          .eq('id', order.restaurant_email)
          .maybeSingle();
        if (restaurant?.business_user_id) businessId = restaurant.business_user_id;
      }
      if (businessId) {
        setDeliveryBusiness({
          businessId,
          restaurantName: order?.restaurant_name || 'Restaurant',
          orderId,
        });
      }
    } catch (err) {
      console.error('❌ Failed to capture delivery business:', err);
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedRating || !user) return;
    setRatingSubmitting(true);

    let error: any = null;
    if (completionPopupType === 'delivery' && deliveryBusiness) {
      const result = await supabaseHelpers.rateBusiness({
        businessId: deliveryBusiness.businessId,
        customerId: user.id,
        rating: selectedRating,
        orderId: deliveryBusiness.orderId,
      });
      error = result.error;
    } else if (rideDriverId) {
      const result = await supabaseHelpers.rateDriver({
        driverId: rideDriverId,
        customerId: user.id,
        rating: selectedRating,
      });
      error = result.error;
    }

    setRatingSubmitting(false);
    if (error) {
      console.error('❌ Failed to submit rating:', error);
      alert('Failed to submit rating. Please try again.');
      return;
    }
    setRatingSubmitted(true);
  };

  const closeRatingModal = () => {
    setShowRatingModal(false);
    setRatingSubmitted(false);
    setSelectedRating(0);
    setRideDriverId(null);
    setDeliveryBusiness(null);
    // Refresh the ride page after rating is submitted
    resetCustomerRideVisuals();
    setRideStatus(null);
    setCurrentRequestId(null);
    setCompletionPopupType('ride');
    localStorage.removeItem('trikeserve_active_ride');
    localStorage.removeItem('trikeserve_active_share_lobby');
    window.location.reload();
  };

  const filteredLocations = popularLocations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // The map is the substrate for pickup/drop pins, terminal boundary checks and
  // the route, so it is left exactly as it was -- it just no longer mounts on
  // the home step. That step is a scrolling feed now; the map appears the
  // moment a ride is actually being booked or is already under way.
  const showMap = !showBookingFlow || bookingStep !== 'home';

  /**
   * What the header shows above the search field once search is opened.
   *
   * The pickup the customer has already set is more useful than a raw
   * coordinate, so it wins; otherwise we say plainly that we do not know yet
   * rather than showing a stale default like "Manila".
   */
  const hubLocationLabel =
    (pickupAddress && pickupAddress.trim()) || (pickup && pickup !== 'Current Location' ? pickup : '') || 'Locating you…';

  /**
   * The page gets a mint wash that fades to the base colour over the first
   * 380px rather than a flat fill. `--surface` is defined as
   * `var(--background)`, so before this every card was the exact same colour as
   * the page behind it and the only thing separating them was a hairline. The
   * wash is built from tokens rather than literals so it inverts with the
   * theme: `--teal-soft` is a light mint in light mode and a deep pine in dark
   * mode. The fade is an absolute distance rather than a percentage, so it
   * covers the hub card at any viewport height instead of stretching down the
   * whole page.
   *
   * (It is a JSDoc comment on the return rather than a `{/* ... *\/}` one
   * because a JSX expression container is only legal as a child element — as
   * the root of `return (...)` the parser reads it as an object literal and
   * fails on the very next tag.)
   */
  return (
    <div className="relative flex min-h-screen flex-col bg-[linear-gradient(180deg,var(--teal-soft)_0%,var(--background)_380px)]">
      {/* Full Screen Map */}
      {showMap && (
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--border)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--error)] mb-4">⚠️ Google Maps API Key Missing</p>
              <p className="text-[var(--ink-soft)] mb-4">To use Google Maps, please add your API key to .env.local</p>
            </div>
          </div>
         ) : mapsBlocked || mapsLoadError ? (
            <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
              <div className="text-center max-w-md px-6">
                <p className="text-lg font-bold text-[var(--error)] mb-3">⚠️ Map resources blocked</p>
                <p className="text-sm text-[var(--ink-soft)] mb-4">Your browser or a network filter is blocking Google Maps resources (maps.googleapis.com). This commonly happens when an ad-blocker or privacy extension blocks Google domains.</p>
                {mapsBlocked && <p className="text-xs text-[var(--muted-foreground)] mb-3">Diagnostic: {mapsBlocked}</p>}
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-md"
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
            <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
              <p className="text-sm text-[var(--muted-foreground)]">Loading map...</p>
            </div>
          ) : (
           <GoogleMap
             mapContainerStyle={{ width: "100%", height: "100%" }}
             center={currentLocation}
             zoom={15}
             onLoad={(map: any) => {
               customerMapRef.current = map;
               // The route may already be drawn by the time the map finishes
               // loading, in which case the fit effect above ran with no instance
               // to call and did nothing.
               fitTripBounds();
             }}
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

              {/* Pickup and drop-off both, once a ride is live. The pickup pin
                  used to be omitted here and drawn only inside the (now removed)
                  embedded card map, so the destination route had no visible start
                  point. */}
              {rideStatus !== 'searching' && pickupCoords && (
                <MarkerF position={pickupCoords} title="Pickup location" icon={createCustomerMarkerIcon()} />
              )}

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
                <Polyline path={routePath} options={buildNavigationRouteOptions('#BC4B1F', 5)} />
              )}

              {/* Driver route polyline (real-time) */}
              {driverRoutePath.length > 0 && rideStatus === 'driver-found' && (
                <Polyline path={driverRoutePath} options={buildNavigationRouteOptions('#1D4ED8', 4)} />
              )}

              {/* Destination route polyline (pickup to dropoff) */}
              {destinationRoutePath.length > 0 && rideStatus !== 'searching' && (
                <Polyline path={destinationRoutePath} options={buildNavigationRouteOptions('#BC4B1F', 5)} />
              )}

              {/* No straight-line fallback here on purpose.
                  The passenger should always see the real road the driver will
                  take. A direct pickup-to-drop-off chord cuts across blocks and
                  rivers, which reads as "this is the route" and is wrong. If
                  DirectionsService has not answered yet the route is simply
                  absent for a moment, which is far better than a misleading
                  one. The driver-side fallback stays because a driver needs some
                  indication of heading even if routing fails. */}

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
           </GoogleMap>
         )}
      </div>
      )}

      {showMap && (
        <LocationBanner
          problem={locationProblem}
          className="absolute top-24 left-3 right-3 z-[1000] sm:top-28 sm:left-4 sm:right-4"
        />
      )}

      {/* Floating chat head, the same component the driver's ride screen uses.
          Opens the driver thread in the Messages tab, so both sides land in one
          conversation rather than two parallel ones. */}
      {/* Chat as an overlay rather than a page, so the map and the floating head
          stay behind it and no gap has to be reserved above the thread header. */}
      <RideChatOverlay
        open={customerChatPopup}
        conversationId={driverChatId.current}
        peerId={rideDriverId}
        peerAvatar={rideDriverAvatar}
        peerName={activeRide?.driver || 'Driver'}
        senderRole="customer"
        onClose={() => setCustomerChatPopup(false)}
      />

      {/* Hidden while the panel is open, so the two heads cannot stack in the
          same corner. */}
      {rideStatus === 'driver-found' && activeRide && rideDriverId && !customerChatPopup && (
        <FloatingChatHead
          storageKey="trikeserve_chat_head_pos_customer"
          peerAvatar={rideDriverAvatar}
          peerLabel={activeRide.driver || 'Driver'}
          unread={driverUnread}
          pulseKey={chatPulseKey}
          opened={chatOpened}
          onOpen={openDriverChatThread}
        />
      )}

      {/* A business or driver awaiting superadmin approval is routed here as a
          customer. Without this they land in the customer app with no idea why,
          since nothing about the customer UI hints that a shop or tricycle is
          registered against their email. */}
      {showBookingFlow && bookingStep === 'home' && isAwaitingApproval(user?.role, user?.isVerified) && (
        <div className="relative z-[999] px-4 pt-3">
          <div className="rounded-2xl border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)] p-4">
            <p className="text-sm font-bold text-[var(--amber-ink)]">
              {user?.role === 'business' ? 'Business' : 'Driver'} account pending approval
            </p>
            <p className="text-xs text-[var(--amber-ink)] mt-1">
              You&apos;re using TrikeServe as a customer for now. A superadmin needs to
              verify your account before you can open the{' '}
              {user?.role === 'business' ? 'business' : 'driver'} dashboard. You&apos;ll get access as soon as
              that&apos;s done — no need to register again.
            </p>
          </div>
        </div>
      )}

        {/* Hub — three layers in normal flow: the app bar, then "What do you
            need today?", then the recommended feed. None of them float over the
            content any more, which is what lets the feed scroll underneath the
            sticky bar. */}
        {showBookingFlow && bookingStep === 'home' && (
          <div className="relative z-[999] flex flex-1 flex-col pb-24">
            <CustomerHubHeader
              avatarUrl={user?.avatarUrl}
              unreadCount={unreadDeliveryNotifications}
              onOpenSearch={() => navigate('/customer/search')}
            />

            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 sm:px-5">
              {/* The original landing choice: a ride or a meal, one tap each.
                  The filter / search / terminal feed is what the app bar
                  search field opens now, so it lives on /customer/search. */}
              <CustomerServiceHub
                onBookRide={() => setBookingStep('ride')}
                onOrderFood={() => navigate('/customer/food')}
              />

              <RecommendedRestaurants />
            </div>
          </div>
        )}

        {/* Booking flow — Steps 2 & 3: ride type first, then pickup and drop-off */}
        {showBookingFlow && bookingStep !== 'home' && (
          <>
            <div
              className="pointer-events-none absolute inset-0 z-[998] bg-black/25"
              aria-hidden="true"
            />
            <div className="absolute bottom-20 left-0 right-0 z-[999] mx-auto max-w-3xl px-4">
            <Card className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl bg-surface shadow-2xl">
              {/* Step header — back control plus plain-language context */}
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
                <button
                  type="button"
                  onClick={() => setBookingStep(bookingStep === 'ride' ? 'home' : 'ride')}
                  aria-label={bookingStep === 'ride' ? 'Back to map' : 'Back to ride type'}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--muted)] transition-transform active:scale-90"
                >
                  <ArrowLeft className="h-5 w-5 text-[var(--ink)]" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight text-[var(--ink)]">
                    {bookingStep === 'ride' ? 'Book a Ride' : 'Pickup at drop-off'}
                  </h2>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {bookingStep === 'ride'
                      ? 'Shared (Sabay) o Private (Pribado)'
                      : 'Piliin ang sakayan at pupuntahan'}
                  </p>
                </div>
              </div>
              <div className="px-5 pb-6 pt-5">
                {/* Step 2 — ride type: Sabay / Pribado */}
                <div className={bookingStep === 'ride' ? '' : 'hidden'}>
                <SectionHeading
                  eyebrow="Easy booking"
                  title="Pumili ng sakay"
                  filipino="Piliin kung sasabay ka o mag-iisa."
                  as="h3"
                  className="mb-3"
                />
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    selected={selectedVehicle === 'share'}
                    onSelect={() => {
                      setSelectedVehicle('share');
                      // Picking a ride type is the only question on this step,
                      // so answering it moves straight on to pickup and drop-off.
                      setBookingStep('locations');
                    }}
                    label="Shared ride"
                    filipino="Sabay"
                    description="May kasabay kang pasahero. Mas mura ang bayad."
                    icon={Users}
                  />
                  <ChoiceCard
                    selected={selectedVehicle === 'special'}
                    onSelect={() => {
                      setSelectedVehicle('special');
                      setPassengerCount(1);
                      setBookingStep('locations');
                    }}
                    label="Private ride"
                    filipino="Pribado"
                    description="Para sa iyo lang ang biyahe."
                    icon={UserIcon}
                  />
                </div>
                </div>

                {/* Step 3 — pickup and drop-off, only after the ride type is chosen */}
                <div className={bookingStep === 'locations' ? '' : 'hidden'}>
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-[var(--muted)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                      Ride type
                    </p>
                    <p className="truncate text-sm font-bold text-[var(--ink)]">
                      {selectedVehicle === 'share' ? 'Shared ride · Sabay' : 'Private ride · Pribado'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBookingStep('ride')}
                    className="flex-shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-[var(--primary)] underline-offset-2 hover:underline"
                  >
                    Change
                  </button>
                </div>
                <SectionHeading
                  eyebrow="Booking"
                  title="Saan ka pupunta?"
                  filipino="Piliin ang sakayan at iyong pupuntahan."
                  as="h3"
                  className="mb-3"
                />

                {/* Location Inputs */}
                <div className="space-y-3 mb-4">
                  {/* Pick up Location Label */}
                  <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest block mb-2">
                    Pick up location
                  </label>
                  
                  {/* Terminal Pickup Selection */}
                  <Card
                    className="p-3 border border-line shadow-sm cursor-pointer hover:border-[var(--primary)] transition-colors"
                    onClick={() => {
                      setShowTerminalPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[var(--ink)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--ink)] mb-0.5">
                          {selectedTerminalId ? (terminals.find(t => t.id === selectedTerminalId)?.name || pickup || 'Pickup Location') : 'Select Terminal'}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {selectedTerminalId ? (terminals.find(t => t.id === selectedTerminalId)?.boundary || pickupAddress || 'Terminal location') : 'Choose a terminal as your pickup point'}
                        </p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </button>
                    </div>
                  </Card>

                  {/* Drop off Location Label */}
                  <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest block mb-2 mt-4">
                    Drop off location
                  </label>

                  {/* Destination */}
                  <Card 
                    className="p-3 border border-line shadow-sm cursor-pointer hover:border-[var(--primary)] transition-colors"
                    onClick={() => {
                      setActiveLocationInput('dropoff');
                      setPickerBoundaryWarning(null);
                      setLocationPreview(
                        dropoffCoords
                          ? {
                              lat: dropoffCoords.lat,
                              lng: dropoffCoords.lng,
                              name: dropoff || 'Drop-off Location',
                              fullAddress: dropoffAddress || dropoff || 'Select drop-off location',
                            }
                          : null
                      );
                      setShowLocationPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[var(--primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[var(--ink)] mb-0.5">{dropoff || 'Tap to set destination'}</p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{dropoffAddress || (dropoffCoords ? `${dropoffCoords.lat.toFixed(5)}, ${dropoffCoords.lng.toFixed(5)}` : 'Select drop-off location')}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </button>
                    </div>
                  </Card>
                </div>

                {/* Book Ride Button — stays visible but disabled until the ride is complete */}
                <Button
                  onClick={handleBookRide}
                  disabled={!selectedVehicle || !dropoff}
                  className="min-h-14 w-full flex-col rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white hover:bg-[var(--coral-dark)] disabled:bg-[var(--border)] disabled:text-[var(--muted-foreground)]"
                >
                  <span className="block">
                    {selectedVehicle
                      ? `Book this ride · ₱${getPrice()}`
                      : 'Choose a ride first'}
                  </span>
                  <span className="block text-xs font-semibold tracking-normal opacity-90">
                    I-book ang sakay
                  </span>
                </Button>
                {!selectedVehicle || !dropoff ? (
                  <p className="mt-2 text-center text-sm text-[var(--muted-foreground)]">
                    {!selectedVehicle
                      ? 'Pumili muna ng klase ng sakay para makapag-book.'
                      : 'Itakda muna ang pupuntahan para makapag-book.'}
                  </p>
                ) : null}
                </div>
              </div>
            </Card>
          </div>
          </>
        )}


        {/* Active Ride Card - Driver Info with embedded map */}
        {rideStatus === 'driver-found' && activeRide && (
          <>
            {/*
              "Live Tracking" badge.

              Sits outside the ride card rather than inside it. As a child it was
              absolutely positioned against the card's own box, so it scrolled and
              shifted with the card and read as part of the driver's details --
              when it describes the map behind them. As a sibling it is anchored to
              the viewport, on the left, above the map's zoom controls.
            */}
            <div className="pointer-events-none absolute left-3 top-24 z-[1101] sm:top-28 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
              <span className="text-xs font-bold text-[var(--ink)]">Live Tracking</span>
            </div>

            <div className="absolute bottom-16 left-0 right-0 z-[1100] p-3">
            <Card className="bg-surface shadow-2xl border-2 border-[var(--primary)] rounded-2xl overflow-hidden">
              {/*
                No second map here.

                There was a 220px map embedded in this card alongside the
                full-screen background map, so an accepted ride showed the same
                route twice and Google Maps charged two loads for one trip. The
                background map already draws the driver marker, both polylines
                and the pickup/drop-off markers, so this card is now just the
                driver and trip details laid over it.
              */}

              <div className="p-4">
                {/* Driver Info Row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center flex-shrink-0">
                    {rideDriverAvatar ? (
                      <img
                        src={rideDriverAvatar}
                        alt={`${activeRide.driver}'s profile`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl" aria-hidden="true">👨‍✈️</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Name and live status share one row.

                        It was stacked under the name, which pushed the plate and
                        "Driver Found" badge down and made the card taller than the
                        map region it sits over. Beside the name it costs one line. */}
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-bold text-base text-[var(--ink)] truncate">{activeRide.driver}</h3>
                      {/* `aria-live="polite"` so a screen reader announces the change
                          when it happens, without interrupting whatever is being read.
                          The rings are decorative and hidden from the reader. */}
                      {DRIVER_STATUS_LABELS[driverLiveStatus] && (
                        /*
                          The status is a rounded pill with a wave sweeping across it,
                          rather than an icon beside the words. The wave is clipped by
                          `overflow-hidden` and the pill's radius, so the crest is cut
                          to the rounded rectangle instead of showing square corners
                          over it.

                          The text sits above the wave (`relative` on its own span) so
                          the crest passes behind the label and never washes out the
                          words at the moment it crosses them. Both crests are
                          `aria-hidden`; the label carries the live region.
                        */
                        <p
                          aria-live="polite"
                          className="relative flex min-w-0 items-center overflow-hidden rounded-full border border-[var(--success)]/40 bg-[var(--success)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--success)]"
                        >
                          <span aria-hidden="true" className="driver-status-wave pointer-events-none absolute inset-y-0 left-0 w-1/2" />
                          <span aria-hidden="true" className="driver-status-wave driver-status-wave--second pointer-events-none absolute inset-y-0 left-0 w-1/2" />
                          <span className="relative truncate">{DRIVER_STATUS_LABELS[driverLiveStatus]}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[var(--success)] text-white text-[10px]">Driver Found</Badge>
                      <span className="text-xs text-[var(--muted-foreground)]">{activeRide.plateNumber}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-[var(--amber)]">
                      <span className="text-sm">⭐</span>
                      <span className="font-bold text-sm text-[var(--ink)]">{activeRide.rating}</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">ETA: {activeRide.eta}</p>
                  </div>
                </div>

                {/* Trip Info - compact */}
                <div className="bg-[var(--muted)] rounded-xl p-3 mb-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-[var(--ink-solid)] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-surface rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[var(--muted-foreground)] font-semibold">Pickup</p>
                      <p className="font-semibold text-xs text-[var(--ink)] truncate">{pickup}</p>
                    </div>

                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-[var(--primary)] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-surface rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-[var(--muted-foreground)] font-semibold">Drop-off</p>
                      <p className="font-semibold text-xs text-[var(--ink)] truncate">{dropoff}</p>
                    </div>
                    {etaToDestination && (
                      <div className="flex-shrink-0 bg-[var(--error-soft)] text-[var(--error)] px-2 py-1 rounded-lg">
                        <p className="text-[10px] font-bold">🏁 {etaToDestination}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment + Actions row */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] text-[var(--muted-foreground)] font-semibold">Fare</p>
                    <p className="text-xl font-bold text-[var(--primary)]">₱{bookedFare ?? getPrice()}</p>                     <p className="text-[10px] text-[var(--muted-foreground)]">💵 Cash</p>
                  </div>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 h-10"
                    onClick={handleOpenDriverChat}
                    disabled={openingChat}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {openingChat ? 'Opening...' : 'Chat'}
                  </Button>
                  {/* Cancel an in-progress ride/delivery (shared rides are left from the lobby) */}
                  {currentRequestId && !currentRequestId.startsWith('lobby_') && (
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex items-center gap-1.5 h-10 px-3 border-[var(--error)] text-[var(--error)] hover:bg-[var(--error-soft)]"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
          </>
        )}

        {/* Validation Error Popup */}
        {showValidationError && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center animate-infinite-bounce">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--error)] mb-2">Incomplete Information</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Please complete entering your <strong>pickup location</strong> and <strong>drop-off point</strong> to proceed with booking your ride.
              </p>

              <Button
                onClick={() => setShowValidationError(false)}
                className="w-full bg-[var(--error)] hover:bg-[var(--error)] text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}

        {/* Same Location Error Popup */}
        {showSameLocationError && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center animate-infinite-bounce">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--error)] mb-2">Invalid Route</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Your <strong>pickup location</strong> and <strong>drop-off point</strong> cannot be the same. Please select different locations.
              </p>

              <Button
                onClick={() => setShowSameLocationError(false)}
                className="w-full bg-[var(--error)] hover:bg-[var(--error)] text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}

        {/* Out of Boundary Area Popup */}
        {showOutOfBoundaryError && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center animate-infinite-bounce">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🚧</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--error)] mb-2">Out of boundary area</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Your <strong>drop-off point</strong> is outside the service area covered by our terminals,
                so this ride cannot be booked. Please choose a drop-off location inside the boundary area.
              </p>

              <Button
                onClick={() => setShowOutOfBoundaryError(false)}
                className="w-full bg-[var(--error)] hover:bg-[var(--error)] text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}


        {/* Ride Completed Popup */}
        {rideCompletedPopup && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-end">
            <div className="bg-surface w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
              <div className="max-w-sm mx-auto text-center">
                <div className="w-16 h-16 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">
                  {completionPopupType === 'delivery' ? 'Delivery Completed!' : 'Ride Completed!'}
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-6">
                  {completionPopupType === 'delivery'
                    ? 'Thank you for using TrikeServe. Your delivery has been completed!'
                    : 'Thank you for using TrikeServe. We hope you had a great ride!'}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-0">
                  <Button
                    onClick={() => {
                      setRideCompletedPopup(false);
                      setRatingSubmitted(false);
                      setSelectedRating(0);
                      setShowRatingModal(true);
                      setCurrentRequestId(null);
                    }}
                    className="w-full bg-surface border-2 border-[var(--info-soft)] text-[var(--info)] py-3 font-bold"
                  >
                    {completionPopupType === 'delivery' ? 'Rate Restaurant' : 'Leave a Rating'}
                  </Button>

                  <Button
                    onClick={() => {
                      setRideCompletedPopup(false);
                      // Reset ride state
                      setActiveRide(null);
                      setRideStatus(null);
                      setCurrentRequestId(null);
                      setCompletionPopupType('ride');
                      setRideDriverId(null);
                      setDeliveryBusiness(null);
                      resetCustomerRideVisuals();
                      localStorage.removeItem('trikeserve_active_ride');
                      localStorage.removeItem('trikeserve_active_share_lobby');
                      // Refresh the page to fully reset the ride page
                      window.location.reload();
                    }}
                    className="w-full bg-[var(--info)] hover:bg-[var(--info)] text-white py-3 font-bold"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Leave a Rating Modal (private rides) */}
        {showRatingModal && (
          <div className="fixed inset-0 bg-black/70 z-[2400] flex items-center justify-center p-4">
            <Card className="bg-surface p-6 max-w-sm w-full text-center">
              {ratingSubmitted ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--success-soft)] flex items-center justify-center text-3xl">
                    🙏
                  </div>
                  <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Thank you!</h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-6">Your rating has been submitted.</p>
                  <Button
                    onClick={closeRatingModal}
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold"
                  >
                    Done
                  </Button>
                </>
              ) : (
                <>
                  {completionPopupType === 'delivery' && deliveryBusiness ? (
                    <>
                      <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Rate {deliveryBusiness.restaurantName}</h3>
                      <p className="text-sm text-[var(--muted-foreground)] mb-6">How was your order and delivery?</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Rate Your Driver</h3>
                      <p className="text-sm text-[var(--muted-foreground)] mb-6">How was your ride?</p>
                    </>
                  )}
                  <div className="flex justify-center gap-2 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setSelectedRating(star)}
                        className="transition-transform hover:scale-110 focus:outline-none"
                      >
                        <Star
                          className={`w-10 h-10 ${
                            star <= selectedRating
                              ? 'fill-[var(--amber)] text-[var(--amber)]'
                              : 'fill-[var(--border)] text-[var(--border)]'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleSubmitRating}
                    disabled={!selectedRating || ratingSubmitting}
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold disabled:opacity-50"
                  >
                    {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                  </Button>
                </>
              )}
            </Card>
          </div>
        )}

        {/* Driver Status Update Popup */}
        {/* ❌ REMOVED: Driver status popup that appeared at top of screen */}
        {/* This was showing status updates like "On the Way", "Arrived", etc. */}

      {/* Bottom Navigation */}
      <BottomNav active="home" messagesBadge={unreadMessagesCount} />

      {/* Terminal Picker Modal */}
      {showTerminalPicker && (
        <div className="fixed inset-0 z-[2000] bg-surface flex flex-col">
          <div className="bg-surface border-b-2 border-[var(--border)] px-4 py-4 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--ink)]">Select Pickup Terminal</h2>
                <p className="text-xs text-[var(--muted-foreground)]">Choose a terminal as your pickup point</p>
              </div>
              <button
                onClick={() => setShowTerminalPicker(false)}
                className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[var(--muted-foreground)]" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {terminals.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--muted-foreground)]">No terminals available</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Please try again later</p>
              </div>
            ) : (
              terminals.map((terminal) => (
                <div
                  key={terminal.id}
                  onClick={() => {
                    setPickup(terminal.name);
                    setPickupAddress(terminal.boundary);
                    setPickupCoords({ lat: terminal.center_lat, lng: terminal.center_lng });
                    setPickupMarker({ lat: terminal.center_lat, lng: terminal.center_lng });
                    setSelectedTerminalId(terminal.id);
                    setShowTerminalPicker(false);
                    hasManualPickupSelectionRef.current = true;
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.98] ${
                    selectedTerminalId === terminal.id
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-[var(--border)] bg-surface hover:border-[var(--primary)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedTerminalId === terminal.id ? 'bg-[var(--primary)]' : 'bg-[var(--info-soft)]'
                    }`}>
                      <span className="text-lg">🚏</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-[var(--ink)]">{terminal.name}</p>
                        {selectedTerminalId === terminal.id && (
                          <span className="text-[10px] font-bold text-[var(--primary)] bg-[var(--primary-soft)] px-2 py-0.5 rounded-full">
                            SELECTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">📍 {terminal.boundary}</p>
                      <p className="text-xs font-semibold text-[var(--primary)] mt-0.5">
                        Fare: ₱{terminal.base_fare ?? activeRates.baseFare} base + ₱{terminal.per_km ?? activeRates.perKm}/km
                      </p>
                      {isMapsLoaded && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-[var(--border)]" style={{ height: 120 }}>
                          <GoogleMap
                            mapContainerStyle={{ width: '100%', height: '100%' }}
                            center={{ lat: terminal.center_lat, lng: terminal.center_lng }}
                            zoom={16}
                            options={{
                              zoomControl: false,
                              fullscreenControl: false,
                              streetViewControl: false,
                              mapTypeControl: false,
                              scrollwheel: false,
                              draggable: false,
                            }}
                          >
                            <MarkerF position={{ lat: terminal.center_lat, lng: terminal.center_lng }} />
                          </GoogleMap>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-[2000] bg-surface flex flex-col">
          <div className="absolute top-4 left-4 right-4 z-[2010]">
            <Card className="bg-white/95 backdrop-blur shadow-xl border-0 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] font-semibold">
                    {activeLocationInput === 'pickup' ? 'Pickup — search or tap map' : 'Drop-off — search or tap map'}
                  </p>
                  <h2 className="text-lg font-bold text-[var(--ink)]">Find a nearby place or tap the map</h2>
                </div>
                <button onClick={() => { setShowLocationPicker(false); setActiveLocationInput(null); setLocationPreview(null); setPredictions([]); setSearchQuery(""); setPickerBoundaryWarning(null); }}>
                  <X className="w-6 h-6 text-[var(--muted-foreground)]" />
                </button>
              </div>

               <div className="mt-3">
                 {pickerBoundaryWarning && (
                   <div
                     role="alert"
                     className="mb-2 flex items-start gap-2 rounded-xl border-2 border-[var(--error)] bg-[var(--error-soft)] px-3 py-2 text-sm font-semibold text-[var(--error)]"
                   >
                     <span aria-hidden="true">📍</span>
                     <span>{pickerBoundaryWarning}</span>
                   </div>
                 )}
                 <Input value={searchQuery} onChange={(e) => { fetchPredictions((e.target as HTMLInputElement).value); }} placeholder="Search restaurants, parks, hotels, terminals..." />
                 {predictions.length > 0 && (
                   <div className="mt-2 bg-surface border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto">
                     {predictions.map((p, i) => (
                       <button key={i} onClick={() => selectPrediction(p.place_id)} className="w-full text-left p-3 hover:bg-[var(--muted)] border-b last:border-b-0">
                         <div className="text-sm font-semibold text-[var(--ink)]">{p.displayName}</div>
                         {p.secondaryText && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{p.secondaryText}</div>}
                       </button>
                     ))}
                   </div>
                 )}
                </div>
             </Card>
           </div>

          <div className="flex-1 pt-40 relative">
            {!isMapsLoaded ? (
              <div className="h-full w-full flex items-center justify-center bg-[var(--muted)]">
                <p className="text-sm text-[var(--muted-foreground)]">Loading picker map...</p>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={
                  locationPreview
                    ? { lat: locationPreview.lat, lng: locationPreview.lng }
                    : selectedTerminalBoundary.terminal
                      ? { lat: selectedTerminalBoundary.terminal.center_lat, lng: selectedTerminalBoundary.terminal.center_lng }
                      : currentLocation
                }
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
                {/* The terminal's service area, so it is obvious where a drop-off is allowed */}
                {selectedTerminalBoundary.polygon && (
                  <Polygon
                    path={selectedTerminalBoundary.polygon}
                    options={{
                      fillColor: '#bc4b1f',
                      fillOpacity: 0.15,
                      strokeColor: '#bc4b1f',
                      strokeWeight: 3,
                      clickable: false,
                    }}
                  />
                )}
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
                  <p className="text-xs text-[var(--muted-foreground)] mb-1 uppercase tracking-widest">Selected location</p>
                  <p className="text-sm font-semibold text-[var(--ink)] truncate">{locationPreview.fullAddress}</p>
                  <Button onClick={applyLocationPreview} className="w-full mt-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white">
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
          <div className="bg-surface w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">How many passengers?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">Select the number of seats you need for this trip.</p>

            {/* Passenger Count Selection */}
            <div className={`grid gap-3 mb-6 ${selectedVehicle === 'special' ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {selectedVehicle === 'special'
                ? [1].map(count => (
                    <button
                      key={count}
                      onClick={() => setPassengerCount(count)}
                      className={`p-6 border-2 rounded-2xl transition-all ${
                        passengerCount === count
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                          : 'border-[var(--border)] bg-surface'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: count }).map((_, i) => (
                            <span key={i} className="text-2xl">👤</span>
                          ))}
                        </div>
                        <span className="font-bold text-lg text-[var(--ink)]">{count}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
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
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                          : 'border-[var(--border)] bg-surface'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: count }).map((_, i) => (
                            <span key={i} className="text-2xl">👤</span>
                          ))}
                        </div>
                        <span className="font-bold text-lg text-[var(--ink)]">{count}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {count === 1 ? 'passenger' : 'passengers'}
                        </span>
                      </div>
                    </button>
                  ))
              }
            </div>

            {/* Price Info */}
            <div className="bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[var(--amber-ink)] uppercase tracking-widest font-semibold">Your Total Fare</p>
                  {selectedVehicle === 'share' ? (
                    <>
                      <p className="text-sm text-[var(--amber-ink)] mt-0.5">
                        ₱{rideTotal} trip ÷ {passengerCount} {passengerCount === 1 ? 'passenger' : 'passengers'}
                      </p>
                      <p className="text-3xl font-bold text-[var(--amber)]">₱{(rideTotal / passengerCount).toFixed(2)}</p>
                      <p className="text-[10px] text-[var(--amber-ink)] mt-0.5">{fareBreakdown}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--amber-ink)] mt-0.5">{fareBreakdown}</p>
                      <p className="text-3xl font-bold text-[var(--amber)]">₱{rideTotal}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Info Card - Only show for Share Rides */}
            {selectedVehicle !== 'special' && (
              <div className="bg-[var(--info-soft)] border border-[var(--info-soft)] rounded-lg p-3 mb-6">
                <p className="text-xs text-[var(--info)]">
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
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-6 text-lg font-bold"
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
                  className="w-full py-6 text-lg font-semibold border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-soft)]"
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
          <div className="bg-surface w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[var(--ink)] mb-6">Confirm Booking</h2>

            {/* Trip Details */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-[var(--primary)] mt-1" />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Pickup</p>
                  <p className="font-semibold text-[var(--ink)]">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-[var(--success)] mt-1" />
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Drop-off</p>
                  <p className="font-semibold text-[var(--ink)]">{dropoff}</p>
                </div>
              </div>
            </div>

            {/* Ride Type */}
            <div className="bg-[var(--primary-soft)] border-2 border-[var(--primary)] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedVehicle === 'share' ? '👥' : '👤'}</span>
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {selectedVehicle === 'share' ? 'Share Ride' : 'Private Ride'}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {selectedVehicle === 'share' ? 'Shared with others' : 'Private ride'}
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[var(--primary)]">₱{getPrice()}</p>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-[var(--muted-foreground)] mb-3">Payment Method</p>
              <div className="grid grid-cols-1 gap-3">
                <div className="p-4 border-2 rounded-xl border-[var(--primary)] bg-[var(--primary-soft)]">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">💵</span>
                    <span className="font-semibold text-[var(--ink)]">Cash / Bayad cash</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleConfirmBooking}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-6 text-lg font-bold"
              >
                Confirm Booking / Kumpirmahin
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
          <Card className="bg-surface p-8 max-w-sm w-full text-center relative">
            {/* Minimize Button */}
            <button
              onClick={() => setIsSearchMinimized(true)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--muted)] hover:bg-[var(--border)] transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
            </button>

            <div className="w-20 h-20 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Finding a Driver...</h3>
            <p className="text-[var(--muted-foreground)] mb-6">Please wait while we find you a nearby driver</p>
            <Button
              onClick={() => setShowCancelConfirm(true)}
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
          className="fixed bottom-24 right-4 z-[2000] w-16 h-16 bg-[var(--primary)] rounded-full shadow-2xl flex items-center justify-center hover:bg-[var(--primary)] transition-all hover:scale-110"
        >
          <div className="relative">
            <span className="text-3xl animate-pulse">🔍</span>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--success)] rounded-full animate-ping"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--success)] rounded-full"></div>
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
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          passengerCount={passengerCount}
          pricePerSeat={rideTotal}
          paymentMethod={paymentMethod}
          selectedTerminalId={selectedTerminalId}
          onLobbyLoaded={(lobbyId) => {
            // Persist the active lobby as soon as it opens so the return-to-ride
            // button works even before a driver accepts.
            localStorage.setItem('trikeserve_active_share_lobby', lobbyId);
          }}
          onDriverFound={(lobbyId) => {
            // Don't close the lobby - let customers see driver info in the lobby itself
            // Just update the status for tracking
            setCurrentRequestId(`lobby_${lobbyId}`);
            setRideStatus('driver-found');
            // Remember the active lobby so the customer can return after leaving.
            localStorage.setItem('trikeserve_active_share_lobby', lobbyId);
            console.log('✅ Driver found for lobby:', lobbyId);
          }}
          onClose={(status) => {
            setShowShareLobby(false);
            setActiveShareLobbyId(null);
            setCurrentRequestId(null);
            // Ride finished - no longer offer to return. If the customer left
            // mid-ride (no terminal status), keep the return button.
            if (status === 'completed' || status === 'cancelled') {
              localStorage.removeItem('trikeserve_active_share_lobby');
            }
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
            // Remember the active lobby so the customer can return after leaving.
            localStorage.setItem('trikeserve_active_share_lobby', lobbyId);
          }}
          onClose={() => {
            setShowLobbyList(false);
          }}
        />
      )}


      {/* Driver Status Update Popup */}
      {driverStatusPopup && (
        <div className="fixed inset-0 bg-black/50 z-[3000] flex items-end">
          <div className="bg-surface w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
            <div className="max-w-sm mx-auto">
              {/* Status Icon — while a driver is assigned this is their actual
                  profile photo, not a car. "On the way" reads as *their*
                  progress, so the person is the more useful thing to show; the
                  later milestones (arrived, picked up, payment) stay symbolic
                  because they are about the trip rather than the driver. */}
              <div className="w-16 h-16 overflow-hidden bg-[var(--primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                {rideDriverAvatar && driverStatusPopup.status !== 'payment' && driverStatusPopup.status !== 'completed' ? (
                  <img
                    src={rideDriverAvatar}
                    alt={`${activeRide?.driver || 'Driver'}'s profile`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    {driverStatusPopup.status === 'on-the-way' && '🚗'}
                    {driverStatusPopup.status === 'arrived' && '📍'}
                    {driverStatusPopup.status === 'pickup' && '🚀'}
                    {driverStatusPopup.status === 'drop-off' && '🏁'}
                    {driverStatusPopup.status === 'payment' && '💰'}
                    {driverStatusPopup.status === 'completed' && '🎉'}
                  </>
                )}
              </div>

              {/* Status Message */}
              <h3 className="text-2xl font-bold text-[var(--ink)] text-center mb-2">
                {driverStatusPopup.status === 'on-the-way' && 'Driver On The Way'}
                {driverStatusPopup.status === 'arrived' && 'Driver Arrived'}
                {driverStatusPopup.status === 'pickup' && 'Picked Up!'}
                {driverStatusPopup.status === 'drop-off' && 'Arrived at Destination'}
                {driverStatusPopup.status === 'payment' && 'Complete Payment'}
                {driverStatusPopup.status === 'completed' && 'Ride Completed!'}
              </h3>

              <p className="text-[var(--muted-foreground)] text-center mb-6">{driverStatusPopup.message}</p>

              {/* Status Details */}
              <div className="bg-[var(--muted)] rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--muted-foreground)]">Status Update</span>
                  <span className="font-bold text-[var(--ink)]">
                    {driverStatusPopup.status === 'on-the-way' && 'On the way'}
                    {driverStatusPopup.status === 'arrived' && 'Arrived'}
                    {driverStatusPopup.status === 'pickup' && 'Picked up'}
                    {driverStatusPopup.status === 'drop-off' && 'At destination'}
                    {driverStatusPopup.status === 'payment' && 'Payment pending'}
                    {driverStatusPopup.status === 'completed' && 'Completed'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-[var(--muted-foreground)]">Time</span>
                  <span className="text-sm text-[var(--ink)]">Just now</span>
                </div>
              </div>

              <Button
                onClick={() => setDriverStatusPopup(null)}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 text-lg font-bold"
              >
                OK 👍
              </Button>
            </div>
           </div>
         </div>
       )}

      {/* Cancel Ride Popup — asks for a reason before dropping the ride */}
      <ReasonPromptModal
        isOpen={showCancelConfirm}
        title={rideStatus === 'driver-found' ? 'Cancel this ride? / Kanselahin ang biyahe?' : 'Cancel Request? / Kanselahin ang request?'}
        description={
          rideStatus === 'driver-found'
            ? 'A driver is already on the way. Let them know why you need to cancel so they are told to stop.'
            : 'Are you sure you want to cancel this ride request?'
        }
        confirmLabel={rideStatus === 'driver-found' ? 'Yes, Cancel Ride' : 'Yes, Cancel'}
        placeholder="e.g. Changed my mind, found another ride, wrong pickup point…"
        variant="danger"
        zIndexClassName="z-[3500]"
        onCancel={() => setShowCancelConfirm(false)}
        onSubmit={async (reason) => {
          setShowCancelConfirm(false);
          await handleCancelRide(reason);
        }}
      />
     </div>
   );
 }
