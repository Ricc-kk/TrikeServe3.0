import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, MapPin, Users, UsersRound, ChevronDown, X, Clock, Utensils, User, Navigation, Home as HomeIcon, ShoppingCart, ClipboardList, Star, ArrowLeft, Flag, CreditCard, Check, Route as RouteIcon, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { ActiveRideDriverCard, RideModal, RideStatusModal, RideSurfaceCard } from "../ui/RideUI";
import { Input } from "../ui/input";
import BottomNav from "../ui/BottomNav";
import {
  isActiveRideStatus,
  customerActiveRideStorageKey,
  customerActiveShareLobbyStorageKey,
  getActiveRideContext,
  isCustomerLobbyPassenger,
  isDeliveryRideRequest,
  useActiveRideContext,
} from "../../../lib/rideLock";
import { forgetActiveRide, useRideResume } from "../../../lib/rideResume";
import ChoiceCard from "../ui/ChoiceCard";
import SectionHeading from "../ui/SectionHeading";
import LocationBanner, { type LocationProblem } from "../ui/LocationBanner";
import RideMapStatusBanner from "../ui/RideMapStatusBanner";
import FloatingChatHead from "../ui/FloatingChatHead";
import RideChatOverlay from "../rider/RideChatOverlay";
import { GoogleMap, MarkerF, InfoWindow, Polygon, Polyline } from "@react-google-maps/api";
import MapTypeToggle from "../ui/MapTypeToggle";
import useMapLoader from "@/lib/mapLoader";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";
import { createDropoffMarkerIcon, createRestaurantMarkerIcon, createTricycleMarkerIcon } from "@/lib/mapIcons";
import { RIDE_MAP_DROPOFF_COLOR, RIDE_MAP_DRIVER_COLOR } from "@/lib/rideMapColors";
import { autocompletePlacesNew, createPlacesSessionToken, fetchPlaceDetailsNew, searchPlacesText, type PlaceResult, type PlacesAutocompleteSuggestion } from "@/lib/placesApi";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, isPointWithinAnyTerminalBorder, isPointInPolygon, isPointOnRoadCorridor, normalizeBoundaryRoad, normalizeBoundaryArea, normalizeRoadWidth, geocodeAddress, logAudit, haversineDistanceMeters, type LatLngPoint } from "@/lib/supabase";
import { legacyRouteFromBoundary, normalizeTerminalRoutes } from "@/lib/terminalRoutes";
import { TerminalIconGlyph, terminalMarkerIcon, normalizeTerminalColor, normalizeRouteColor, normalizeBorderColor } from "../ui/TerminalIcon";
import { Tricycle } from "../ui/Tricycle";
import { computeRideFare, computeSharedRideFarePerPassenger, normalizeRates, terminalRates, privateRideRates, DEFAULT_MAX_PASSENGERS } from "@/lib/pricing";
import { useElapsedTime } from "@/app/hooks/useElapsedTime";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { supabase } from "../../../utils/supabase";
import { isAwaitingApproval } from "../../../lib/roleAccess";
import SharedRides from "./SharedRides";
import BrowseAvailableLobbies from "./BrowseAvailableLobbies";
import ShareRideLobby from "./ShareRideLobby";
import CustomerHubHeader from "./CustomerHubHeader";
import RecommendedRestaurants from "./RecommendedRestaurants";
import CustomerServiceHub from "./CustomerServiceHub";
import CustomerCartPreview from "./CustomerCartPreview";
import { useDevModeOverride } from "../../hooks/useDevModeSettings";

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

type TerminalPickerFilter = "all" | "closest" | "frequent" | "selected";

const TERMINAL_PICKER_USAGE_KEY = "trikeserve_terminal_picker_usage";

function readTerminalPickerUsage(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(TERMINAL_PICKER_USAGE_KEY) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};

    const counts: Record<string, number> = {};
    for (const [terminalId, count] of Object.entries(saved)) {
      if (terminalId && typeof count === "number" && Number.isFinite(count) && count > 0) {
        counts[terminalId] = count;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

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

type TerminalRouteProjection = {
  point: LatLng;
  distanceAlong: number;
  distanceFromRoute: number;
  segmentIndex: number;
};

/** Snap a coordinate to the closest segment of a terminal route. */
const projectOntoTerminalRoute = (point: LatLng, path: LatLng[]): TerminalRouteProjection | null => {
  if (path.length < 2) return null;

  const cumulativeDistances = [0];
  for (let index = 1; index < path.length; index++) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + haversineDistanceMeters(path[index - 1], path[index]),
    );
  }

  const longitudeScale = Math.cos((point.lat * Math.PI) / 180);
  let closest: TerminalRouteProjection | null = null;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    const dx = (end.lng - start.lng) * longitudeScale;
    const dy = end.lat - start.lat;
    const px = (point.lng - start.lng) * longitudeScale;
    const py = point.lat - start.lat;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
      : 0;
    const projected = {
      lat: start.lat + (end.lat - start.lat) * fraction,
      lng: start.lng + (end.lng - start.lng) * fraction,
    };
    const distanceFromRoute = haversineDistanceMeters(point, projected);
    if (closest && distanceFromRoute >= closest.distanceFromRoute) continue;

    closest = {
      point: projected,
      distanceAlong: cumulativeDistances[index - 1] + haversineDistanceMeters(start, projected),
      distanceFromRoute,
      segmentIndex: index - 1,
    };
  }
  return closest;
};

/** Build only the terminal-road segment between a private ride's pickup and drop-off. */
const buildTerminalRouteSegment = (path: LatLng[], pickup: LatLng, dropoff: LatLng): LatLng[] => {
  if (path.length < 2) return [];
  const pickupProjection = projectOntoTerminalRoute(pickup, path);
  const dropoffProjection = projectOntoTerminalRoute(dropoff, path);
  if (!pickupProjection || !dropoffProjection) return [];

  const forward = pickupProjection.distanceAlong <= dropoffProjection.distanceAlong;
  const intermediatePoints = forward
    ? path.slice(pickupProjection.segmentIndex + 1, dropoffProjection.segmentIndex + 1)
    : path.slice(dropoffProjection.segmentIndex + 1, pickupProjection.segmentIndex + 1).reverse();
  const segmentPoints = [pickupProjection.point, ...intermediatePoints, dropoffProjection.point];
  const result: LatLng[] = [];
  const append = (point: LatLng) => {
    if (!result.length || haversineDistanceMeters(result[result.length - 1], point) > 1) {
      result.push(point);
    }
  };

  append(pickup);
  segmentPoints.forEach(append);
  append(dropoff);
  return result;
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
  return createTricycleMarkerIcon() ?? buildNavigationMarkerIcon('#EF4444');
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

/**
 * "You are here" marker for the customer's own device position.
 *
 * A circle rather than a pin, for two reasons. It is the conventional shape for a
 * live GPS fix, so it reads as "the device is here" instead of "a place you chose";
 * and it stays visually distinct from the pickup pin, which shares the customer's
 * blue and is a chosen location. A pin also anchors at its tip, while a dot has to
 * anchor at its centre or the circle sits beside the real fix rather than on it.
 */
const createCurrentLocationIcon = () => {
  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) {
    return buildNavigationMarkerIcon('#1D4ED8');
  }

  // 34x34 with the dot centred, plus a soft halo standing in for the accuracy
  // radius that geolocation reports but this marker does not carry.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="15" fill="#1D4ED8" fill-opacity="0.15"/>
    <circle cx="17" cy="17" r="8" fill="#1D4ED8" stroke="#FFFFFF" stroke-width="2.5"/>
  </svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(34, 34),
    anchor: new google.maps.Point(17, 17),
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

const DELIVERY_DRIVER_STATUS_LABELS: { [key: string]: string } = {
  'on-the-way': 'Heading to restaurant',
  'arrived': 'At the restaurant',
  'pickup': 'Heading to you',
  'picked-up': 'Heading to you',
  'drop-off': 'At your address',
  'dropped-off': 'At your address',
  'in-progress': 'Heading to you',
  'payment': 'Awaiting payment',
  'awaiting-payment': 'Awaiting payment',
  'completed': 'Delivered',
};

const DRIVER_STATUS_ICONS: Record<string, typeof MapPin> = {
  cancelled: X,
  'on-the-way': Tricycle,
  arrived: MapPin,
  pickup: Navigation,
  'drop-off': Flag,
  payment: CreditCard,
  completed: Check,
};

const getDriverInitials = (name?: string | null) =>
  (name || 'Driver')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'D';

const DriverStatusIcon = ({ status, className }: { status: string; className: string }) => {
  const Icon = DRIVER_STATUS_ICONS[status] || MapPin;
  return <Icon className={className} aria-hidden="true" />;
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
  const activeRideStorageKey = user?.id ? customerActiveRideStorageKey(user.id) : null;
  const activeShareLobbyStorageKey = user?.id ? customerActiveShareLobbyStorageKey(user.id) : null;
  const rideStateIdentity = user?.id ? `${user.id}:${user.role}` : null;
  const [enforceBoundary] = useDevModeOverride("enforceBoundary");
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.replace(/\/+$/, '');
  const isBookingPage = currentPath === '/customer/book-ride';
  const isActivePrivateRidePage = currentPath === '/customer/active-private-ride';
  const navigationState = location.state as { selectedPickupTerminalId?: string; customerHomeTab?: boolean } | null;
  const searchSelectedTerminalId = navigationState?.selectedPickupTerminalId;
  const cameFromCustomerHomeTab = navigationState?.customerHomeTab === true;
  const [selectedVehicle, setSelectedVehicle] = useState<'share' | 'special' | null>(null);
  const [driverApprovalModalDismissed, setDriverApprovalModalDismissed] = useState(false);
  // Booking is a three-step flow on top of the full-screen map:
  // home (map + Book a Ride) â†’ ride type â†’ pickup / drop-off.
  const [bookingStep, setBookingStep] = useState<'home' | 'ride' | 'locations'>(isBookingPage ? 'ride' : 'home');
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
  const [shareLobbyInitialId, setShareLobbyInitialId] = useState<string | undefined>();
  const [paymentMethod] = useState<'COD'>('COD');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<'searching' | 'driver-found' | 'picking-up' | 'in-transit' | null>(null);
   // When the current driver search began, so the "Finding a Driver" screen can show
   // a running wait. Persisted with the rest of the ride data, otherwise a reload
   // mid-search restarted the count at zero and understated how long the customer
   // had already been waiting.
   const [requestedAt, setRequestedAt] = useState<number | null>(null);

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
  const [rideStateOwnerId, setRideStateOwnerId] = useState<string | null>(rideStateIdentity);
  const previousRideStateOwnerIdRef = useRef<string | null>(rideStateIdentity);
  const rideStateBelongsToCurrentUser = Boolean(user?.id && rideStateOwnerId === rideStateIdentity);

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
  const isRideLive = rideStateBelongsToCurrentUser && rideStatus !== null && rideStatus !== 'searching';
  const visibleRideStatus = rideStateBelongsToCurrentUser ? rideStatus : null;
  const visibleActiveRide = rideStateBelongsToCurrentUser ? activeRide : null;

   // Running wait on the current driver search. Driven by its own 1s timer rather
   // than by the ride polling, so it counts in real seconds while the request is
   // still being polled for a driver.
   //
   // Gated on `searching` rather than on the timestamp being non-null: `rideStatus`
   // moves to 'driver-found' or null from a dozen different places, and clearing
   // `requestedAt` in each of them would be a dozen chances to miss one. Passing
   // null here is the single point that stops the clock, and it also means the
   // 1s interval is not left running in the background for the rest of the ride.
   const searchingTime = useElapsedTime(
     rideStateBelongsToCurrentUser && rideStatus === 'searching' ? requestedAt : null,
   );
  useEffect(() => {
    const currentOwnerId = rideStateIdentity;
    if (previousRideStateOwnerIdRef.current !== currentOwnerId) {
      previousRideStateOwnerIdRef.current = currentOwnerId;
      hadRideRef.current = false;
      return;
    }
    if (isRideLive && currentRequestId) {
      hadRideRef.current = true;
      syncRideResume(currentRequestId);
    } else if (hadRideRef.current) {
      // A ride existed and is now gone.
      hadRideRef.current = false;
      syncRideResume(null);
    }
  }, [rideStateIdentity, user?.id, isRideLive, currentRequestId, syncRideResume]);
   const [currentSharedRideId, setCurrentSharedRideId] = useState<string | null>(null);
   /*
    * The live ride this customer is already in, straight from the database.
    *
    * `activeRide`/`rideStatus` only know about a booking made in this tab. The
    * booking screen can also be reached by deep link, by Back, or after the tab
    * that started the ride was closed -- and booking a second ride in any of
    * those cases is what this tracks. `lobby` covers a shared ride that has not
    * been given a driver yet.
    */
   const { privateRide: activeRideRequest, lobby: activeRideLobby, checked: rideContextChecked } = useActiveRideContext(user?.id);
   const isActiveShareRideMap = Boolean(
     activeRideLobby?.id ||
     (showShareLobby && selectedVehicle === 'share'),
   );
   const activeShareRideMapDetails = useMemo(() => {
     const toPoint = (latValue: unknown, lngValue: unknown) => {
       if (latValue == null || lngValue == null) return null;
       const lat = Number(latValue);
       const lng = Number(lngValue);
       return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
     };

     let passengers: any[] = [];
     const rawPassengers = activeRideLobby?.passengers_json;
     if (Array.isArray(rawPassengers)) {
       passengers = rawPassengers;
     } else if (typeof rawPassengers === 'string') {
       try {
         const parsed = JSON.parse(rawPassengers);
         if (Array.isArray(parsed)) passengers = parsed;
       } catch {
         // Older or malformed lobby data falls back to the lobby's saved stop.
       }
     }

     const ownPassengers = user?.id
       ? passengers.filter(passenger =>
           passenger?.id === user.id || String(passenger?.id || '').startsWith(`${user.id}_companion_`)
         )
       : [];
     const pickup =
       toPoint(activeRideLobby?.pickup_lat, activeRideLobby?.pickup_lng) || pickupCoords;
     const dropoffs = ownPassengers
       .map(passenger => toPoint(
         passenger?.dropoffLat ?? passenger?.dropoff_lat,
         passenger?.dropoffLng ?? passenger?.dropoff_lng,
       ))
       .filter((point): point is { lat: number; lng: number } => Boolean(point));

     if (dropoffs.length === 0) {
       const lobbyDropoff = toPoint(activeRideLobby?.dropoff_lat, activeRideLobby?.dropoff_lng);
       const fallbackDropoff = activeRideLobby?.id
         ? activeRideLobby.customer_id === user?.id
           ? lobbyDropoff || dropoffCoords
           : null
         : lobbyDropoff || dropoffCoords;
       if (fallbackDropoff) dropoffs.push(fallbackDropoff);
     }

     const uniqueDropoffs = dropoffs.filter((point, index) =>
       dropoffs.findIndex(candidate =>
         Math.abs(candidate.lat - point.lat) < 0.00001 && Math.abs(candidate.lng - point.lng) < 0.00001
       ) === index
     );
     if (pickup) {
       uniqueDropoffs.sort((left, right) =>
         haversineDistanceMeters(pickup, left) - haversineDistanceMeters(pickup, right)
       );
     }

     return { isActive: isActiveShareRideMap, pickup, dropoffs: uniqueDropoffs };
   }, [
     activeRideLobby?.pickup_lat,
     activeRideLobby?.pickup_lng,
     activeRideLobby?.dropoff_lat,
     activeRideLobby?.dropoff_lng,
     activeRideLobby?.passengers_json,
     dropoffCoords,
     isActiveShareRideMap,
     pickupCoords,
     user?.id,
   ]);
   const activeShareRideMapDropoff = activeShareRideMapDetails.isActive
     ? activeShareRideMapDetails.dropoffs[activeShareRideMapDetails.dropoffs.length - 1] || null
     : dropoffCoords;
   const isDeliveryRide = Boolean(
     activeRideRequest?.order_id ||
     String(activeRideRequest?.ride_type || activeRideRequest?.type || '').toLowerCase() === 'delivery' ||
     String(pickup || '').startsWith('DELIVERY'),
   );
  const isPrivateRide =
    !isDeliveryRide &&
    !activeShareRideMapDetails.isActive &&
    !String(currentRequestId || '').startsWith('lobby_');
   const [showPassengerCount, setShowPassengerCount] = useState(false);
   const [passengerCount, setPassengerCount] = useState(1);
   const [showLobbyList, setShowLobbyList] = useState(false);
   const [activeShareLobbyId, setActiveShareLobbyId] = useState<string | null>(null);
   const [activeShareLobbyPromptId, setActiveShareLobbyPromptId] = useState<string | null>(null);
   const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
   const [driverAcceptedPopup, setDriverAcceptedPopup] = useState<any>(null);
   const [driverStatusPopup, setDriverStatusPopup] = useState<{ status: string; message: string } | null>(null);
   const [privateRideAssignmentPopup, setPrivateRideAssignmentPopup] = useState<{ requestId: string; message: string } | null>(null);
   const [showCustomerPaymentModal, setShowCustomerPaymentModal] = useState(false);
  /**
    * The driver's latest status, kept permanently.
   *
    * Brief status notices and the private ride assignment modal are separate
    * from this value, so the card remains readable after either is dismissed.
   */
  const [driverLiveStatus, setDriverLiveStatus] = useState<string>('');
   const [showValidationError, setShowValidationError] = useState(false);
   const [showSameLocationError, setShowSameLocationError] = useState(false);
   // The customer is not standing inside any terminal's border area. The border
   // is the "who we serve" gate -- it decides whether they may book at all.
   const [showOutOfBoundaryError, setShowOutOfBoundaryError] = useState(false);
  // The drop-off is not on any terminal's route corridor. The route is the
  // "where a tricycle can go" gate, and it is a separate refusal from the above.
  const [showOutsideRouteError, setShowOutsideRouteError] = useState(false);
  // The drop-off could not be turned into coordinates, so it cannot be checked
  // against any terminal. Distinct from "outside every terminal" and kept
  // separate so the message can say which one happened.
  const [unresolvedDropoffError, setUnresolvedDropoffError] = useState(false);
  const [terminalBoundaryCheckUnavailable, setTerminalBoundaryCheckUnavailable] = useState(false);
   // Shown when the customer taps the map outside the selected terminal's area.
   const [pickerBoundaryWarning, setPickerBoundaryWarning] = useState<string | null>(null);
   const [terminalPickerWarning, setTerminalPickerWarning] = useState<string | null>(null);
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
   const lastDriverMessage = useRef<{ conversationId: string; messageId: string | null } | null>(null);
   const [chatPulseKey, setChatPulseKey] = useState(0);
   const [chatHeadActivated, setChatHeadActivated] = useState(false);
   const chatHeadScopeRef = useRef<string | null>(null);
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
     setChatHeadActivated(true);
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

   useEffect(() => {
     const scope = currentRequestId && rideDriverId && user?.id
       ? `${user.id}:${currentRequestId}:${rideDriverId}`
       : null;
     if (chatHeadScopeRef.current === scope) return;
     chatHeadScopeRef.current = scope;
     lastDriverMessage.current = null;
     setChatHeadActivated(false);
   }, [currentRequestId, rideDriverId, user?.id]);

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
   // The fare captured when the ride was booked â€” the terminal fare at that
   // moment. The active-ride card shows this instead of re-deriving the fare, so
   // it can't drift from the amount stored on the request when booking state is
   // recomputed or restored from storage.
   const [bookedFare, setBookedFare] = useState<number | null>(null);
   // Per-km pricing set by the admin after the distance included in the base fare.
   const [baseFare, setBaseFare] = useState(20);
   const [baseFareIncludedKm, setBaseFareIncludedKm] = useState(1);
   const [perKm, setPerKm] = useState(10);
   const [deliveryBaseFee, setDeliveryBaseFee] = useState(0);
   const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
   const [driverRoutePath, setDriverRoutePath] = useState<LatLng[]>([]);
   const [destinationRoutePath, setDestinationRoutePath] = useState<LatLng[]>([]);
   const hasPassengerBeenPickedUp =
     rideStatus === 'in-transit' ||
     ['pickup', 'picked-up', 'in-progress', 'drop-off', 'dropped-off', 'payment', 'awaiting-payment']
       .includes(String(driverLiveStatus || '').toLowerCase());
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
  const pendingTerminalFocusRef = useRef<{ lat: number; lng: number } | null>(null);
  const bookingMapOverviewFittedRef = useRef<string | null>(null);
  const [customerMapReady, setCustomerMapReady] = useState(false);
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
   const [terminals, setTerminals] = useState<{ id: string; name: string; boundary: string; center_lat: number; center_lng: number; base_fare?: number | null; base_fare_included_km?: number | null; per_km?: number | null; delivery_fee?: number | null; delivery_fee_included_km?: number | null; delivery_fee_per_km?: number | null; max_passengers?: number | null; private_ride_fee?: number | null; private_ride_fee_included_km?: number | null; private_ride_fee_per_km?: number | null; boundary_polygon?: any; routes?: unknown; boundary_area?: any; road_width_m?: number | null; boundary_enabled?: boolean; route_color?: string | null; border_color?: string | null; marker_color?: string | null }[]>([]);
   const mapTerminalRoutes = useMemo(
     () => terminals.flatMap(terminal => {
       const storedRoutes = normalizeTerminalRoutes(terminal.routes);
       const routes = storedRoutes.length > 0
         ? storedRoutes
         : legacyRouteFromBoundary(terminal.boundary_polygon, terminal.road_width_m);
       return routes
         .filter(route => route.points.length >= 2)
         .map((route, index) => ({
           id: `${terminal.id}::${route.id}`,
           routeId: route.id,
           terminalId: terminal.id,
           terminalName: terminal.name,
           name: route.name,
           points: route.points,
           bufferM: route.buffer_m,
           color: normalizeRouteColor(terminal.route_color),
           isPrimary: index === 0,
           enabled: route.enabled,
         }));
     }),
     [terminals]
   );
   const [showAllBookingTerminals, setShowAllBookingTerminals] = useState(true);
   const [showTerminalPicker, setShowTerminalPicker] = useState(false);
   const [routePreviewTerminalId, setRoutePreviewTerminalId] = useState<string | null>(null);
   const [routePreviewFocusRouteId, setRoutePreviewFocusRouteId] = useState<string | null>(null);
   const [routePreviewVisibleRouteIds, setRoutePreviewVisibleRouteIds] = useState<string[]>([]);
   const [showRoutePreviewList, setShowRoutePreviewList] = useState(false);
   const routePreviewMapRef = useRef<any>(null);
   const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
   const [selectedTerminalRouteId, setSelectedTerminalRouteId] = useState<string | null>(null);
   const terminalPickerUsageRef = useRef<Record<string, number>>({});
   const [terminalPickerUsage, setTerminalPickerUsage] = useState(() => {
     const savedUsage = readTerminalPickerUsage();
     terminalPickerUsageRef.current = savedUsage;
     return savedUsage;
   });
   const [terminalPickerFilter, setTerminalPickerFilter] = useState<TerminalPickerFilter>("all");
   const recordTerminalPickerUse = useCallback((terminalId: string) => {
     const nextUsage = {
       ...terminalPickerUsageRef.current,
       [terminalId]: (terminalPickerUsageRef.current[terminalId] || 0) + 1,
     };
     terminalPickerUsageRef.current = nextUsage;
     setTerminalPickerUsage(nextUsage);
     try {
       window.localStorage.setItem(TERMINAL_PICKER_USAGE_KEY, JSON.stringify(nextUsage));
     } catch {
       // The frequent filter remains available for this session if storage is blocked.
     }
   }, []);
  // Hub state: what they want (all / a ride / a meal) and whether they have
  // opened the header's search field.
    // The chosen pickup terminal and its plotted service road. Drop-off search,
    // map pins, and the booking gate all use this same route. The pickup area is
    // still subject to the terminal's boundary-enabled setting.
    const selectedTerminalBoundary = useMemo(() => {
      const terminal = terminals.find(t => t.id === selectedTerminalId) || null;
      // Keep the route available for display even when the boundary gate is off;
      // only the validation fields are disabled in that case.
      const terminalRoutes = terminal ? mapTerminalRoutes.filter(route => route.terminalId === terminal.id) : [];
      const selectedRoute = terminalRoutes.find(route => route.id === selectedTerminalRouteId)
        || terminalRoutes.find(route => route.isPrimary)
        || terminalRoutes[0]
        || null;
      const road = selectedRoute?.points || null;
      const area = terminal ? normalizeBoundaryArea(terminal.boundary_area) : null;
      const enforced = terminal && terminal.boundary_enabled !== false;
      return {
        terminal,
        selectedRoute,
        displayRoad: road,
        area: enforced ? area : null,
        widthM: enforced && terminal ? normalizeRoadWidth(terminal.road_width_m) : undefined,
        routeWidthM: terminal ? normalizeRoadWidth(selectedRoute?.bufferM ?? terminal.road_width_m) : undefined,
      };
    }, [terminals, mapTerminalRoutes, selectedTerminalId, selectedTerminalRouteId]);
    const activeShareRideRoute = useMemo(() => {
      const terminalId = activeRideLobby?.terminal_id;
      if (!terminalId) return null;

      const terminalRoutes = mapTerminalRoutes.filter(route => route.terminalId === terminalId);
      if (terminalRoutes.length === 0) return null;

      const dropoffPoint = activeShareRideMapDetails.dropoffs[0];
      const selectedRoute = selectedTerminalId === terminalId
        ? terminalRoutes.find(route => route.id === selectedTerminalRouteId) || null
        : null;
      const routeMatchesDropoff = (route: typeof terminalRoutes[number]) => Boolean(
        dropoffPoint && isPointOnRoadCorridor(
          dropoffPoint.lat,
          dropoffPoint.lng,
          route.points,
          normalizeRoadWidth(route.bufferM),
        )
      );
      const matchingRoutes = terminalRoutes.filter(route => route.enabled && routeMatchesDropoff(route));

      return matchingRoutes.find(route => route.id === selectedRoute?.id)
        || matchingRoutes[0]
        || selectedRoute
        || terminalRoutes.find(route => route.enabled)
        || terminalRoutes[0];
    }, [
      activeRideLobby?.terminal_id,
      activeShareRideMapDetails.dropoffs,
      mapTerminalRoutes,
      selectedTerminalId,
      selectedTerminalRouteId,
    ]);
    const selectedRouteDropoffGuide = !enforceBoundary
      ? 'Choose a drop-off location.'
      : selectedTerminalBoundary.terminal && selectedTerminalBoundary.displayRoad
      ? 'Choose a drop-off along the highlighted route.'
      : 'Select a pickup route first to choose a drop-off along it.';
    const missingSelectedRouteMessage = selectedTerminalBoundary.terminal
      ? `${selectedTerminalBoundary.terminal.name} has no mapped route yet. Drop-off selection is unavailable until its route is set.`
      : 'Select a pickup route first. Drop-offs are restricted to the selected route.';
    const isPointOnSelectedRoute = useCallback((point: LatLngPoint) => {
      if (!enforceBoundary) return true;
      const { terminal, displayRoad, routeWidthM } = selectedTerminalBoundary;
      return Boolean(
        terminal &&
        displayRoad?.length &&
        isPointOnRoadCorridor(point.lat, point.lng, displayRoad, normalizeRoadWidth(routeWidthM)),
      );
    }, [enforceBoundary, selectedTerminalBoundary]);

  /*
   * The picker map draws the selected terminal's shapes in that terminal's own
   * colours.
   *
   * The admin sets a colour per terminal so neighbouring TODAs are tellable
   * apart; showing every one of them in the same orange threw that away and made
   * the border on screen ambiguous about whose it was. The defaults are the same
   * ones the admin panel falls back to, and they apply unchanged until
   * ADD_TERMINAL_SHAPE_COLORS.sql has been run.
   */
  const pickerTerminal = selectedTerminalBoundary.terminal;
  const pickerMarkerColor = normalizeTerminalColor(pickerTerminal?.marker_color);
  const pickerRouteColor = normalizeRouteColor(pickerTerminal?.route_color);
  const selectedTerminalRouteColor = pickerRouteColor;
  const pickerBorderColor = normalizeBorderColor(pickerTerminal?.border_color);

  useEffect(() => {
    const activeTerminalId = activeRideLobby?.terminal_id || activeRideRequest?.terminal_id;
    if (activeTerminalId) setSelectedTerminalId(activeTerminalId);
  }, [activeRideLobby?.terminal_id, activeRideRequest?.terminal_id]);
   const mapRef = useRef<any>(null);
   const hasManualPickupSelectionRef = useRef(false);
   const unsubscribeRef = useRef<(() => void) | null>(null);
   const driverStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const acknowledgedPrivateRideAssignmentsRef = useRef<Set<string>>(new Set());

   const privateRideAssignmentAcknowledgementKey = (requestId: string) =>
     `customer_private_ride_assignment_acknowledged_${requestId}`;

   const showPrivateRideAssignmentUnlessAcknowledged = (requestId: string, message: string) => {
     if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
     driverStatusTimerRef.current = null;
     setDriverStatusPopup(current => current?.status === 'on-the-way' ? null : current);

     let acknowledged = acknowledgedPrivateRideAssignmentsRef.current.has(requestId);
     try {
       acknowledged = acknowledged || localStorage.getItem(privateRideAssignmentAcknowledgementKey(requestId)) === '1';
     } catch {
       // The in-memory acknowledgement still works if browser storage is unavailable.
     }
     if (acknowledged) return;

     setPrivateRideAssignmentPopup({ requestId, message });
   };

   useEffect(() => {
     const requestId = privateRideAssignmentPopup?.requestId;
     if (!requestId) return;

     const timeout = setTimeout(() => {
       acknowledgedPrivateRideAssignmentsRef.current.add(requestId);
       try {
         localStorage.setItem(`customer_private_ride_assignment_acknowledged_${requestId}`, '1');
       } catch {
         // In-memory acknowledgement still prevents polling from reopening this notice.
       }
       setPrivateRideAssignmentPopup(current => current?.requestId === requestId ? null : current);
     }, 3000);

     return () => clearTimeout(timeout);
   }, [privateRideAssignmentPopup?.requestId]);

   // Clear any pending status-popup timer on unmount, so it cannot fire a
   // setState on a component that is no longer mounted.
   useEffect(() => () => {
     if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
   }, []);

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
    let cancelled = false;
    const refreshTerminals = () => {
      void supabase.from('terminals').select('*')
        .then(({ data, error }) => {
          if (!cancelled && !error && data) {
            setTerminals(data.filter((t: any) => t.is_active !== false));
          }
        })
        .catch(() => {});
    };

    refreshTerminals();
    const channel = supabase
      .channel('customer-home-terminal-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminals' }, refreshTerminals)
      .subscribe();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshTerminals();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  // A terminal selected from /customer/search returns here as a pickup and
  // opens the ride flow with the map focused on that terminal.
  useEffect(() => {
    if (!searchSelectedTerminalId || terminals.length === 0) return;
    const terminal = terminals.find(item => item.id === searchSelectedTerminalId);
    if (!terminal) return;

    const coords = { lat: terminal.center_lat, lng: terminal.center_lng };
    setPickup(terminal.name);
    setPickupAddress(terminal.boundary);
    setPickupCoords(coords);
    setPickupMarker(coords);
    setSelectedTerminalId(terminal.id);
    setBookingStep('ride');
    setMapCenter(coords);
    hasManualPickupSelectionRef.current = true;

    const map = customerMapRef.current;
    if (map) {
      map.panTo(coords);
      map.setZoom(16);
      pendingTerminalFocusRef.current = null;
    } else {
      pendingTerminalFocusRef.current = coords;
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [searchSelectedTerminalId, terminals, navigate, location.pathname]);

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

    (async () => {
      if (!pickupCoords && pickupAddress && pickup !== 'Current Location') {
        const coords = await geocodeAddress(pickupAddress);
        if (!cancelled && coords) setPickupCoords(coords);
      }

      if (!dropoffCoords && dropoffAddress) {
        const coords = await geocodeAddress(dropoffAddress);
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
    setPickerBoundaryWarning(null);
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

      // Search is biased to the selected terminal. Pickup suggestions are kept
      // inside its service area; drop-off suggestions are checked against the
      // selected route after the customer chooses one.
      const { terminal, area, widthM, displayRoad } = selectedTerminalBoundary;
      const searchingForPickup = activeLocationInput === 'pickup';
      const gateShape = searchingForPickup ? area : displayRoad;

      if (enforceBoundary && gateShape && terminal) {
        // Text Search returns coordinates. Keep pickup suggestions inside the
        // terminal area, but leave drop-off suggestions visible so selection
        // can show the route validation only after the customer chooses one.
        const hits = await searchPlacesText({
          textQuery: query,
          apiKey,
          bias: { lat: terminal.center_lat, lng: terminal.center_lng },
          biasRadiusMeters: polygonBiasRadius(gateShape as { lat: number; lng: number }[]),
        });

        const matchingHits = hits.filter(hit => {
          if (typeof hit.lat !== 'number' || typeof hit.lng !== 'number') return false;
          return !searchingForPickup || isPointInPolygon(hit.lat, hit.lng, gateShape as LatLngPoint[]);
        });
        setPredictions(
          matchingHits
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
        if (enforceBoundary && activeLocationInput === 'dropoff' && (!coords || !isPointOnSelectedRoute(coords))) {
          setPickerBoundaryWarning(
            coords
              ? selectedTerminalBoundary.displayRoad
                ? `Choose a drop-off within ${Math.round(normalizeRoadWidth(selectedTerminalBoundary.routeWidthM) / 2)} m of the highlighted ${selectedTerminalBoundary.terminal?.name || 'selected'} route.`
                : missingSelectedRouteMessage
              : 'We could not locate that place. Choose a result on the highlighted route or tap the route on the map.'
          );
          return;
        }
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

      // Delivery legs use road directions. Passenger rides use the selected
      // terminal route geometry for pickup-to-drop-off instead.
      const origin = pickupCoords || (activeLocationInput === 'pickup' ? coords : pickupCoords);
      const destination = dropoffCoords || (activeLocationInput === 'dropoff' ? coords : dropoffCoords);

      if (!isDeliveryRide) {
        setRoutePath([]);
        setRouteApiError(null);
      }

      if (isDeliveryRide && origin && destination && isMapsLoaded && (window as any).google) {
        const DirectionsService = new (window as any).google.maps.DirectionsService();
        DirectionsService.route(
          {
            origin: new (window as any).google.maps.LatLng(origin.lat, origin.lng),
            destination: new (window as any).google.maps.LatLng(destination.lat, destination.lng),
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          },
          (result: any, status: string) => {
            setMapsDiagnostics(prev => ({ ...prev, directionsAvailable: Boolean((window as any).google?.maps?.DirectionsService), directionsStatus: status || 'unknown' }));
            if (status === 'OK' && result?.routes?.[0]) {
              // Resolve the path before deciding whether routing worked. Deciding
              // on `overview_polyline.points` reported a failure -- and blanked the
              // map -- for routes that were perfectly routable and only lacked an
              // overview, which `routePathFromResult` recovers from the steps.
              const path = routePathFromResult(result.routes[0]);
              if (path.length > 0) {
                setRouteApiError(null);
                setRoutePath(path);
              } else {
                setRouteApiError(`Directions status: ${status}`);
              }
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
      
      alert('âœ… All ride data cleared! You can now create a new lobby.');
      window.location.reload();
    }
  };

  // Ride UI state is account-bound. Clear it before this mounted screen restores
  // anything belonging to the newly signed-in customer.
  useEffect(() => {
    const nextOwnerId = rideStateIdentity;
    if (rideStateOwnerId === nextOwnerId) return;

    setRideStateOwnerId(nextOwnerId);
    setShowShareLobby(false);
    setActiveShareLobbyId(null);
    setShareLobbyInitialId(undefined);
    setActiveShareLobbyPromptId(null);
    setShowLobbyList(false);
    setShowSharedRides(false);
    setShowBookingConfirm(false);
    setShowPassengerCount(false);
    setShowLocationPicker(false);
    setActiveLocationInput(null);
    setRideStatus(null);
    setRequestedAt(null);
    setCurrentRequestId(null);
    setActiveRide(null);
    setRideDriverId(null);
    setDriverLiveStatus('');
    setDriverUnread(0);
    setCustomerChatPopup(false);
    setPrivateRideAssignmentPopup(null);
    setDriverStatusPopup(null);
    setDriverAcceptedPopup(null);
    setShowCancelConfirm(false);
    setRideCompletedPopup(false);
    setShowRatingModal(false);
    setCurrentSharedRideId(null);
    setPassengerCount(1);
    driverChatId.current = null;
    resetCustomerRideVisuals();
  }, [rideStateIdentity, rideStateOwnerId]);

  // Load persisted ride data on mount
  useEffect(() => {
    let active = true;
    if (!user?.id || !activeRideStorageKey || !activeShareLobbyStorageKey) {
      return () => {
        active = false;
      };
    }

    const customerId = user.id;
    const savedRideData = localStorage.getItem(activeRideStorageKey);
    if (savedRideData) {
      try {
        const rideData = JSON.parse(savedRideData);
        if (rideData?.customerId !== customerId) {
          localStorage.removeItem(activeRideStorageKey);
          return () => {
            active = false;
          };
        }
        if (isDeliveryRideRequest({
          order_id: rideData?.order_id || rideData?.orderId,
          ride_type: rideData?.ride_type || rideData?.rideType || rideData?.vehicleType,
          pickup_location: rideData?.pickup_location || rideData?.pickup,
        })) {
          // Older builds persisted order deliveries in the customer's ride slot.
          // Keep order tracking on OrderDetail instead of restoring a food order
          // as a passenger ride on /customer.
          localStorage.removeItem(activeRideStorageKey);
          forgetActiveRide();
          setRideStatus(null);
          setCurrentRequestId(null);
          setRideDriverId(null);
          setDriverLiveStatus('');
          setDriverUnread(0);
          driverChatId.current = null;
          setCustomerChatPopup(false);
          resetCustomerRideVisuals();
        } else {
        const restoredRequestId = typeof rideData?.requestId === 'string'
          ? rideData.requestId
          : typeof rideData?.id === 'string'
            ? rideData.id
            : null;

        setRideStatus(rideData.status);
        // Restore the search start time so the waiting counter picks up where it
        // left off instead of restarting. Older saved rides have no such field.
        if (typeof rideData?.requestedAt === 'number') {
          setRequestedAt(rideData.requestedAt);
        }
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
              if (!active || !fresh) return;
              if (fresh.customer_id !== customerId) {
                localStorage.removeItem(activeRideStorageKey);
                setRideStatus(null);
                setActiveRide(null);
                setCurrentRequestId(null);
                return;
              }

              if (isDeliveryRideRequest(fresh)) {
                setRideStatus(null);
                setActiveRide(null);
                setCurrentRequestId(null);
                localStorage.removeItem(activeRideStorageKey);
                forgetActiveRide();
                setRideDriverId(null);
                setDriverLiveStatus('');
                setDriverUnread(0);
                driverChatId.current = null;
                setCustomerChatPopup(false);
                resetCustomerRideVisuals();
                return;
              }

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
                setCurrentRequestId(null);
                resetCustomerRideVisuals();
                localStorage.removeItem(activeRideStorageKey);
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
        }
      } catch (error) {
        console.error('Error loading ride data:', error);
      }
    }

    // Check if user is in an active lobby
    const checkActiveLobby = () => {
      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (!lobbiesData) return;

      try {
        const parsedLobbies = JSON.parse(lobbiesData);
        const lobbies = Array.isArray(parsedLobbies) ? parsedLobbies : [];
        // Find lobby where user is a passenger (waiting OR driver-found status)
        const userLobby = lobbies.find((lobby: any) =>
          (lobby.status === 'waiting' || lobby.status === 'driver-found' || lobby.status === 'driver_found') &&
          isCustomerLobbyPassenger(lobby, customerId)
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
          const passengers = Array.isArray(userLobby.passengers) ? userLobby.passengers : [];
          const userSeats = passengers.filter((p: any) =>
            p?.id === customerId || String(p?.id || '').startsWith(`${customerId}_companion_`)
          ).length;
          setPassengerCount(userSeats);
          setActiveShareLobbyId(userLobby.id);
          setShareLobbyInitialId(userLobby.id);
          
          // Show the lobby
          setBookingStep('home');
          setShowShareLobby(true);
          console.log('âœ… Restored active lobby:', userLobby.id, 'Status:', userLobby.status);
        }
      } catch (error) {
        console.error('Error checking active lobby:', error);
      }
    };

    // The Home tab is an explicit request to see the home screen. Keep the
    // active lobby resumable, but don't put its full-screen panel back over Home.
    if (!cameFromCustomerHomeTab) checkActiveLobby();

    // Restore an active share ride lobby (the current mechanism) so that
    // returning to the rides page reopens the lobby during an active ride,
    // just like the private-ride active card is restored.
    const storedLobbyId = localStorage.getItem(activeShareLobbyStorageKey);
    if (storedLobbyId) {
      supabaseHelpers.getLobbyById(storedLobbyId).then(({ data: storedLobby, error }) => {
        if (!active) return;
        if (error || !storedLobby || !isCustomerLobbyPassenger(storedLobby, customerId)) {
          localStorage.removeItem(activeShareLobbyStorageKey);
          return;
        }
        if (!['waiting', 'driver_found', 'in_progress'].includes(storedLobby.status)) {
          localStorage.removeItem(activeShareLobbyStorageKey);
          return;
        }
        // Ride still active - reopen the lobby automatically.
        setActiveShareLobbyId(storedLobbyId);
        if (!cameFromCustomerHomeTab) {
          setShareLobbyInitialId(storedLobbyId);
          setBookingStep('home');
          setShowShareLobby(true);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [user?.id, rideStateIdentity, activeRideStorageKey, activeShareLobbyStorageKey, cameFromCustomerHomeTab]);

  /*
   * Restore a shared ride when the customer returns to the ride screen.
   * Choosing the Home tab is the one intentional exception: keep the ride
   * available from its return card without covering the home hub with the lobby.
   */
  useEffect(() => {
    if (!activeRideLobby?.id) return;
    setActiveShareLobbyId(activeRideLobby.id);
    try {
      if (activeShareLobbyStorageKey) {
        localStorage.setItem(activeShareLobbyStorageKey, activeRideLobby.id);
      }
    } catch {
      // Storage unavailable; the active lobby remains available in memory.
    }
    if (!cameFromCustomerHomeTab && !showShareLobby) {
      setShareLobbyInitialId(activeRideLobby.id);
      setBookingStep('home');
      setShowShareLobby(true);
    }
  }, [activeRideLobby?.id, activeShareLobbyStorageKey, cameFromCustomerHomeTab, showShareLobby]);

  // The Home tab must be able to uncover the home hub even when this same
  // screen is currently showing the full-screen shared-ride lobby.
  useEffect(() => {
    if (!cameFromCustomerHomeTab) return;
    setShowShareLobby(false);
    setBookingStep('home');
  }, [cameFromCustomerHomeTab, location.key]);

  /*
   * Rebuild the active private ride state when this tab holds no copy of it.
   *
   * Without this, arriving on the booking screen with a ride that was accepted
   * in another tab showed the booking options and no ride, inviting a second
   * booking while the first was under way. The dedicated active-ride route also
   * restores a pending request so its searching state survives a refresh.
   */
  useEffect(() => {
    if (!activeRideRequest?.id) return;
    if (activeRideLobby) return;
    if (activeRide || rideStatus) return;
    let hasStoredRide = true;
    try {
      hasStoredRide = !!activeRideStorageKey && !!localStorage.getItem(activeRideStorageKey);
    } catch {
      // Storage unavailable; prefer the database copy.
    }
    if (hasStoredRide) return;

    const r = activeRideRequest;
    setPickup(r.pickup_location || '');
    setPickupAddress(r.pickup_address || '');
    setDropoff(r.dropoff_location || '');
    setDropoffAddress(r.dropoff_address || '');
    if (r.pickup_lat != null && r.pickup_lng != null) {
      setPickupCoords({ lat: Number(r.pickup_lat), lng: Number(r.pickup_lng) });
    }
    if (r.dropoff_lat != null && r.dropoff_lng != null) {
      setDropoffCoords({ lat: Number(r.dropoff_lat), lng: Number(r.dropoff_lng) });
    }
    setSelectedVehicle('special');
    setCurrentRequestId(r.id);
    if (r.amount != null && Number.isFinite(Number(r.amount))) setBookedFare(Number(r.amount));
    if (r.accepted_driver_id) {
      setRideDriverId(r.accepted_driver_id);
      setActiveRide({
        driver: r.driver_name || 'Driver',
        plateNumber: r.driver_plate || 'N/A',
        rating: r.driver_rating || '4.8',
        eta: r.eta || '5 mins',
      });
      setRideStatus('driver-found');
    } else if (isActivePrivateRidePage) {
      setRideStatus('searching');
      const createdAt = r.created_at ? Date.parse(r.created_at) : NaN;
      if (Number.isFinite(createdAt)) setRequestedAt(createdAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRideRequest?.id, rideStateOwnerId, isActivePrivateRidePage]);

   // Poll unread delivery notifications for the bell badge.
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
          setPrivateRidePrice(settings.privateRide);
          setBaseFare(settings.baseFare);
          setBaseFareIncludedKm(settings.baseFareIncludedKm);
          setPerKm(settings.perKm);
          setDeliveryBaseFee(settings.deliveryBaseFee);
          console.log(`âœ… Loaded admin pricing - â‚±${settings.baseFare} base + â‚±${settings.perKm}/km`);
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
       const isPrivateRideCompletion = normalizedStatus === 'completed' && inferredCompletionType === 'ride' && isPrivateRide;

        console.log('ðŸ“£ PROCESS DRIVER STATUS UPDATE:', { status: normalizedStatus, message, source, currentRequestId, lastShownStatus, inferredCompletionType });

        if (normalizedStatus === 'completed' && !rideCompletedPopup) {
         console.log('âœ…âœ…âœ… COMPLETION STATUS RECEIVED - showing completion popup now');
         console.log('   Source:', source);
         console.log('   Inferred Completion Type:', inferredCompletionType);
         console.log('   Setting rideCompletedPopup = TRUE');
         setCompletionPopupType(inferredCompletionType);
         setRideCompletedPopup(true);
         setShowCustomerPaymentModal(false);
         if (isPrivateRideCompletion) {
           if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
           driverStatusTimerRef.current = null;
           setDriverStatusPopup(null);
         }
        localStorage.setItem(lastShownStatusKey, status);

        // For deliveries, remember which business the customer can rate.
        if (inferredCompletionType === 'delivery' && rideContext) {
          captureDeliveryBusiness(rideContext);
        }

        // Clear the finished route and stop polling the completed request.
        resetCustomerRideVisuals();
        setRideStatus(null);
        setCurrentRequestId(null);
        if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
      }

        if (normalizedStatus && normalizedStatus !== 'pending' && normalizedStatus !== 'cancelled') {
        const statusDisplayMap: { [key: string]: string } = {
          'on-the-way': 'Your driver is on the way to pick you up.',
          'arrived': 'Your driver has arrived.',
            'pickup': 'You have been picked up! On the way to your destination.',
            'picked-up': 'You have been picked up! On the way to your destination.',
            'drop-off': 'You have arrived at your destination.',
            'dropped-off': 'You have arrived at your destination.',
          'in-progress': 'Your ride is in progress!',
          'payment': message || 'Please complete the payment.',
            'awaiting-payment': message || 'Please complete the payment.',
            'completed': message || 'Your ride has been completed. Thank you for using TrikeServe!'
        };

        // The card's status persists, so it is set on every update rather than only
        // when the status changes -- a re-poll of the same status must still correct
        // the card if the page was mounted mid-ride.
        setDriverLiveStatus(normalizedStatus);

        if (['dropped-off', 'payment', 'awaiting-payment'].includes(normalizedStatus)) {
          const dismissedKey = `customer_payment_modal_dismissed_${currentRequestId}`;
          if (!String(currentRequestId || '').startsWith('lobby_') && localStorage.getItem(dismissedKey) !== '1') {
            setShowCustomerPaymentModal(true);
          }
          if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
          setDriverStatusPopup(null);
          return;
        }

        // Keep a private ride assignment outside the short-lived status notice.
        // This runs even when the status was already seen, so polling can restore
        // an unacknowledged assignment after the ride type finishes loading.
        if (normalizedStatus === 'on-the-way' && isPrivateRide && currentRequestId) {
          showPrivateRideAssignmentUnlessAcknowledged(
            currentRequestId,
            statusDisplayMap[normalizedStatus] || message || 'Your driver is on the way to pick you up.',
          );
          localStorage.setItem(lastShownStatusKey, normalizedStatus);
          return;
        }

        if (normalizedStatus !== lastShownStatus && !isPrivateRideCompletion) {
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

          if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
          driverStatusTimerRef.current = setTimeout(() => setDriverStatusPopup(null), 2000);
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

            // âŒ REMOVED: Popup will be shown from real-time subscription instead
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
        console.log('âŒ No currentRequestId, skipping driver status check');
        return;
      }

      // Query database directly for driver status (Option 2 - Database-Driven)
      try {
        const { data: rideRequest, error } = await supabaseHelpers.getRideRequest(currentRequestId);

        console.log('ðŸ” CHECKING DATABASE for Ride Status Update:');
        console.log('   Request ID:', currentRequestId);
        console.log('   DB Driver Status:', rideRequest?.driver_status);
        console.log('   DB Accepted Driver ID:', rideRequest?.accepted_driver_id);
        console.log('   Status Message:', rideRequest?.driver_status_message);

        if (error) {
          console.error('âŒ Database error:', error);
          return;
        }

        if (!rideRequest) {
          console.log('âŒ Ride request not found in database');
          return;
        }

      // If the database says the ride is already completed, make sure we clear UI and
      // do NOT re-show the driver card. This prevents polling from setting
      // `rideStatus = 'driver-found'` again when an accepted_driver_id remains set
      // in the DB after the ride is completed.
        // Normalize status fields. If the ride is explicitly completed in any
        // column, prefer that over intermediate payment-stage values.
        console.log('ðŸ” POLLING: Raw DB fields:');
        console.log('   rideRequest.status:', rideRequest.status);
        console.log('   rideRequest.driver_status:', rideRequest.driver_status);
        console.log('   rideRequest.ride_status:', (rideRequest as any).ride_status);

        const dbStatus =
          rideRequest.status === 'completed' ||
          rideRequest.driver_status === 'completed' ||
          (rideRequest as any).ride_status === 'completed'
            ? 'completed'
            : rideRequest.driver_status || rideRequest.status || (rideRequest as any).ride_status;

         console.log('ðŸ” POLLING: Normalized dbStatus:', dbStatus);

       // CRITICAL: Check for completion FIRST before checking driver acceptance
        if (dbStatus === 'completed') {
          console.log('âœ…ðŸŽ‰ POLLING: DB HAS COMPLETED STATUS - calling processDriverStatusUpdate');
          processDriverStatusUpdate('completed', rideRequest.driver_status_message || rideRequest.status_message || 'Delivery completed!', 'polling-db-completed', rideRequest);
          return;
        }

       // CRITICAL: Check if driver has been accepted (this means driver info card should show)
        if (rideRequest.accepted_driver_id && !activeRide) {
          console.log('âœ… DRIVER ACCEPTED (Polling detected):', rideRequest.accepted_driver_id);
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

          console.log('ðŸŽ¯ Active Ride Object:', newActiveRide);

          setActiveRide(newActiveRide);
          setRideStatus('driver-found');  // â† CRITICAL! This makes the card appear!

          // Show acceptance popup
          setDriverAcceptedPopup({
            driverName: rideRequest.driver_name || 'Driver',
            driverPlate: rideRequest.driver_plate || 'N/A',
            driverRating: rideRequest.driver_rating || '4.8',
            driverPhoto: 'ðŸ‘¨â€âœˆï¸', // replaced by rideDriverAvatar once it loads // replaced by rideDriverAvatar once it loads
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
        console.error('âŒ Error checking driver status from database:', error);
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
      console.log('ðŸ“¡ Storage Event Received:', e.key);
      if (e.key === 'trikeserve_accepted_rides') {
        console.log('ðŸ”„ Accepted rides changed, checking...');
        checkForAcceptedRide();
      }
      if (e.key?.startsWith('driver_status_')) {
        console.log('ðŸ”„ Driver status changed, checking...', e.key);
        try {
          const parsed = e.newValue ? JSON.parse(e.newValue) : null;
          if (parsed?.status) {
            processDriverStatusUpdate(parsed.status, parsed.message, 'storage-event');
            return;
          }
        } catch (parseError) {
          console.warn('âš ï¸ Could not parse driver status storage payload:', parseError);
        }
        checkForDriverStatusUpdate();
      }
    };

    // Also listen for custom events dispatched by driver
    const handleCustomStorageEvent = (e: any) => {
      console.log('ðŸŽ¯ Custom Storage Event:', e.detail?.key);
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
  }, [rideStatus, currentRequestId, selectedVehicle, isPrivateRide]);

  // Real-time database subscriptions for driver updates
  useEffect(() => {
    if (!currentRequestId || !user?.id) return;

    console.log('ðŸ“¡ Setting up real-time database subscriptions for ride:', currentRequestId);

    // Subscribe to ride updates (driver status, acceptance, completion)
    const unsubscribe = supabaseHelpers.subscribeToRideUpdates(currentRequestId, (updatedRide) => {
      console.log('ðŸ”„ Real-time ride update received:', updatedRide);

      // DEBUG: Log all driver-related fields
      console.log('ðŸ“Š DRIVER INFO FROM DATABASE:');
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

      console.log('ðŸ” REALTIME STATUS NORMALIZATION:');
      console.log('   Normalized realtimeStatus:', realtimeStatus);

       // Follow the amount stored on the request (the terminal fare).
       const realtimeAmount = Number(updatedRide.amount);
       if (Number.isFinite(realtimeAmount) && realtimeAmount > 0) setBookedFare(realtimeAmount);

       // Check if driver was accepted - THIS IS THE KEY!
       // Don't show acceptance if the ride is already completed.
       if (updatedRide.accepted_driver_id && !activeRide && realtimeStatus !== 'completed') {
         console.log('âœ… DRIVER ACCEPTED (Real-time):', updatedRide.accepted_driver_id);

         // Remember who the driver is so the customer can rate them later.
         setRideDriverId(updatedRide.accepted_driver_id);

         const rideState = {
           driver: updatedRide.driver_name || 'Driver',
           plateNumber: updatedRide.driver_plate || 'N/A',
           rating: updatedRide.driver_rating || '4.8',
           eta: updatedRide.eta || '5 mins',
         };

         console.log('ðŸŽ¯ Setting activeRide state with:', rideState);
         console.log('ðŸŽ¯ Setting rideStatus to: driver-found');

         setActiveRide(rideState);
         setRideStatus('driver-found');  // â† CRITICAL! This makes the card appear!

         // Show acceptance popup
         setDriverAcceptedPopup({
           driverName: updatedRide.driver_name || 'Driver',
           driverPlate: updatedRide.driver_plate || 'N/A',
           driverRating: updatedRide.driver_rating || '4.8',
           driverPhoto: 'ðŸ‘¨â€âœˆï¸', // replaced by rideDriverAvatar once it loads
         });

         // Use the driver's real average rating from driver_ratings when available.
         supabaseHelpers.getDriverRating(updatedRide.accepted_driver_id).then(({ average }: { average: number | null }) => {
           if (average != null) {
             setActiveRide(prev => prev ? { ...prev, rating: average.toFixed(1) } : prev);
             setDriverAcceptedPopup(prev => prev ? { ...prev, driverRating: average.toFixed(1) } : prev);
           }
         });
       }

       // Hydrate route coordinates from realtime payload â€” only update if changed
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

       // Update driver location on map â€” only update if changed
       if (updatedRide.accepted_driver_id && updatedRide.driver_lat && updatedRide.driver_lng) {
         const newLat = Number(updatedRide.driver_lat);
         const newLng = Number(updatedRide.driver_lng);
         if (!isNaN(newLat) && !isNaN(newLng)) {
           setDriverLocation(prev => {
             if (prev && prev.lat === newLat && prev.lng === newLng) return prev;
             return { lat: newLat, lng: newLng };
           });
         }
         console.log('ðŸ“ Driver location updated');
       }

       // Handle completion status only.
       if (realtimeStatus === 'completed') {
         setShowCustomerPaymentModal(false);
         const lastShownStatusKey = `last_shown_status_${currentRequestId}`;
         const lastShownStatus = localStorage.getItem(lastShownStatusKey);
         const inferredCompletionType: 'ride' | 'delivery' =
           String(updatedRide.ride_type || updatedRide.type || updatedRide.rideType || '').toLowerCase() === 'delivery' ||
           updatedRide.driver_status_message?.toLowerCase().includes('delivery') ||
           updatedRide.status_message?.toLowerCase().includes('delivery')
             ? 'delivery'
             : 'ride';

         console.log('ðŸ” REALTIME COMPLETION CHECK:');
         console.log('   realtimeStatus:', realtimeStatus);
         console.log('   lastShownStatus:', lastShownStatus);
         console.log('   Inferred Type:', inferredCompletionType);
         console.log('   Will Show?', realtimeStatus !== lastShownStatus);

         if (!rideCompletedPopup) {
           console.log('âœ… REALTIME HAS NEW COMPLETED - showing popup');
           console.log('ðŸŽ‰ RIDE COMPLETED (Real-time):', updatedRide);
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
           // the completion popup is shown and stop polling the finished request.
           resetCustomerRideVisuals();
           setRideStatus(null);
           setCurrentRequestId(null);
           if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
         }
       }

      if (realtimeStatus === 'cancelled') {
        if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
        setDriverStatusPopup({
          status: 'cancelled',
          message: updatedRide.driver_status_message || 'Your driver had to cancel this ride.',
        });
        setRideStatus(null);
        setCurrentRequestId(null);
        if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
        resetCustomerRideVisuals();
        return;
      }

       // Payment stays open until the customer acknowledges it; the brief status
       // sheet remains reserved for the other ride milestones.
       if (['dropped-off', 'payment', 'awaiting-payment'].includes(realtimeStatus)) {
         setDriverLiveStatus(realtimeStatus);
         const dismissedKey = `customer_payment_modal_dismissed_${currentRequestId}`;
         if (!String(currentRequestId || '').startsWith('lobby_') && localStorage.getItem(dismissedKey) !== '1') {
           setShowCustomerPaymentModal(true);
         }
         if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
         setDriverStatusPopup(null);
       // Check for other driver status updates (for popup messages)
       } else if (realtimeStatus && realtimeStatus !== 'pending' && realtimeStatus !== 'completed' && realtimeStatus !== 'cancelled') {
        const statusDisplayMap: { [key: string]: string } = {
          'on-the-way': 'Your driver is on the way to pick you up.',
          'arrived': 'Your driver has arrived.',
          'pickup': 'You have been picked up! On the way to your destination.',
          'picked-up': 'You have been picked up! On the way to your destination.',
          'drop-off': 'You have arrived at your destination.',
          'dropped-off': 'You have arrived at your destination.',
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

        if (realtimeStatus === 'on-the-way' && isPrivateRide && currentRequestId) {
          showPrivateRideAssignmentUnlessAcknowledged(
            currentRequestId,
            statusDisplayMap[realtimeStatus] || updatedRide.driver_status_message || 'Your driver is on the way to pick you up.',
          );
          localStorage.setItem(rtLastShownStatusKey, realtimeStatus);
          return;
        }

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

          if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
          driverStatusTimerRef.current = setTimeout(() => {
            setDriverStatusPopup(null);
          }, 2000);
        }
      }
    });

    // Save unsubscribe function
    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        console.log('ðŸ›‘ Cleaning up real-time subscription');
        unsubscribeRef.current();
      }
    };
  }, [currentRequestId, user?.id, isPrivateRide]);

  // Persist ride data whenever it changes
  useEffect(() => {
    if (!rideStateBelongsToCurrentUser || !activeRideStorageKey) return;
    if (rideStatus) {
      const rideData = {
        customerId: user?.id,
        status: rideStatus,
        requestedAt,
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
      localStorage.setItem(activeRideStorageKey, JSON.stringify(rideData));
    } else {
      localStorage.removeItem(activeRideStorageKey);
    }
   }, [user?.id, rideStateBelongsToCurrentUser, activeRideStorageKey, rideStatus, requestedAt, pickup, pickupAddress, pickupCoords, dropoff, dropoffAddress, dropoffCoords, selectedVehicle, paymentMethod, activeRide, currentRequestId, rideDriverId, bookedFare]);

   // Once a private ride has a request row, move the booking flow to its own
   // active-ride page. The persistence effect above writes the resumable ride
   // first, so refreshing the new route restores the same search or driver card.
   useEffect(() => {
     if (
       currentPath !== '/customer/book-ride' ||
       !rideStateBelongsToCurrentUser ||
       selectedVehicle !== 'special' ||
       isDeliveryRide ||
       !currentRequestId ||
       !['searching', 'driver-found', 'picking-up', 'in-transit'].includes(visibleRideStatus || '')
     ) return;

     navigate('/customer/active-private-ride', { replace: true });
   }, [
     currentPath,
     rideStateBelongsToCurrentUser,
     selectedVehicle,
     isDeliveryRide,
     currentRequestId,
     visibleRideStatus,
     navigate,
   ]);

   // Compute driver's route to pickup/dropoff location (real-time tracking)
   useEffect(() => {
     if (activeShareRideMapDetails.isActive) {
       setDriverRoutePath([]);
       return;
     }
     if (hasPassengerBeenPickedUp) {
       setDriverRoutePath([]);
       return;
     }
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
           // Guard on the resolved path, not on `overview_polyline.points`.
            // `routePathFromResult` exists precisely to recover geometry from the
            // per-step polylines when the overview comes back null, so testing the
            // overview first discarded every route that needed that fallback and
            // left the map with no line at all during the ride.
            const path = routePathFromResult(route);
            if (path.length > 0) setDriverRoutePath(path);
         }
       }
     );
   }, [activeShareRideMapDetails.isActive, hasPassengerBeenPickedUp, driverLocation, pickupCoords, isMapsLoaded, rideStatus]);

   // Passenger drop-off legs always use the selected terminal route. Google
   // Directions remains for delivery requests, while share rides render their
   // own selected terminal route geometry.
   useEffect(() => {
     if (activeShareRideMapDetails.isActive) {
       setDestinationRoutePath([]);
       return;
     }
     if (!isDeliveryRide) {
       setDestinationRoutePath([]);
       return;
     }
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
           // Same guard fix as the driver-to-pickup leg: resolve first, then test.
           // The pickup-to-drop-off line is the one the customer watches for the
           // whole ride, and it was the one most often left undrawn.
           const path = routePathFromResult(route);
           if (path.length > 0) setDestinationRoutePath(path);
           // Extract ETA from legs
           const leg = route.legs?.[0];
           if (leg?.duration?.text) {
             setEtaToDestination(leg.duration.text);
           }
         }
       }
     );
   }, [activeShareRideMapDetails.isActive, isDeliveryRide, pickupCoords, dropoffCoords, isMapsLoaded, rideStatus]);

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
    { name: "Adelfa Street", address: "Adelfa Street, Valenzuela", icon: "ðŸ“" },
    { name: "B.Garcia Street", address: "B.Garcia Street, Valenzuela", icon: "ðŸ“" },
    { name: "Cadena de Amor Street", address: "Cadena de Amor Street, Valenzuela", icon: "ðŸ“" },
    { name: "Carnation Street", address: "Carnation Street, Valenzuela", icon: "ðŸŒ¸" },
    { name: "Daffodil Street", address: "Daffodil Street, Valenzuela", icon: "ðŸŒ¼" },
    { name: "Dama de Noche Street", address: "Dama de Noche Street, Valenzuela", icon: "ðŸŒ™" },
    { name: "Gladiola Street", address: "Gladiola Street, Valenzuela", icon: "ðŸŒ¹" },
    { name: "Ilang-Ilang Street", address: "Ilang-Ilang Street, Valenzuela", icon: "ðŸŒ¸" },
    { name: "Lilac Street", address: "Lilac Street, Valenzuela", icon: "ðŸ’œ" },
    { name: "Jasmin Street", address: "Jasmin Street, Valenzuela", icon: "ðŸŒ¸" },
    { name: "Morning Glory Street", address: "Morning Glory Street, Valenzuela", icon: "ðŸŒº" },
    { name: "Marigold Street", address: "Marigold Street, Valenzuela", icon: "ðŸŒ¼" },
    { name: "Orchid Street", address: "Orchid Street, Valenzuela", icon: "ðŸŒ¸" },
    { name: "Rosal Street", address: "Rosal Street, Valenzuela", icon: "ðŸŒ¹" },
    { name: "Balikatan Street", address: "Balikatan Street, Valenzuela", icon: "ðŸ“" },
    { name: "Rose Mary Street", address: "Rose Mary Street, Valenzuela", icon: "ðŸŒ¹" },
    { name: "Sampaguita Street", address: "Sampaguita Street, Valenzuela", icon: "ðŸŒ¼" },
    { name: "Everlasting Street", address: "Everlasting Street, Valenzuela", icon: "ðŸŒ¸" },
    { name: "Gen T Deleon Terminal", address: "Main Road, Gen T Deleon", icon: "ðŸš" },
    { name: "Barangay Hall", address: "Gen T Deleon Center", icon: "ðŸ›ï¸" },
    { name: "Gen T Deleon Market", address: "Market District", icon: "ðŸª" },
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

    // A tap that fails the relevant gate is refused outright, so the customer
    // cannot pin somewhere the booking would refuse a moment later.
    //
    // Which gate depends on what is being placed: the customer has to stand in
    // the border to book, but the drop-off only has to be on the route.
    const { area, widthM, routeWidthM, displayRoad, terminal } = selectedTerminalBoundary;
    const pickingPickup = activeLocationInput === 'pickup';
    if (enforceBoundary && !pickingPickup && (!terminal || !displayRoad?.length)) {
      setPickerBoundaryWarning(missingSelectedRouteMessage);
      return;
    }

    const gateShape = enforceBoundary ? (pickingPickup ? area : displayRoad) : null;
    const gateWidth = pickingPickup ? widthM : routeWidthM;
    if (gateShape) {
      const inside = pickingPickup
        ? isPointInPolygon(lat, lng, gateShape)
        : isPointOnRoadCorridor(lat, lng, gateShape, normalizeRoadWidth(gateWidth));

      if (!inside) {
        const half = Math.round(normalizeRoadWidth(gateWidth) / 2);
        setPickerBoundaryWarning(
          pickingPickup
            ? `That spot is outside ${terminal?.name || 'this terminal'}. Tap inside the shaded area.`
            : `That spot is not on ${terminal?.name || 'this terminal'}'s selected route. Tap within ${half} m of the highlighted road.`
        );
        return;
      }
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
    if (enforceBoundary && activeLocationInput === 'dropoff' && !isPointOnSelectedRoute(coords)) {
      setPickerBoundaryWarning(
        selectedTerminalBoundary.displayRoad
          ? `Choose a drop-off within ${Math.round(normalizeRoadWidth(selectedTerminalBoundary.routeWidthM) / 2)} m of the highlighted ${selectedTerminalBoundary.terminal?.name || 'selected'} route.`
          : missingSelectedRouteMessage
      );
      return;
    }

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

  /**
   * The two gates a share/private ride has to clear before it can be booked.
   *
   * They answer different questions and are checked separately:
   *
   *   1. The BORDER â€” the customer has to be standing inside a terminal's area.
   *      This is "who does the terminal serve"; without it a customer standing
   *      a kilometre away could book, because the road corridor is wide.
   *   2. The ROUTE â€” the drop-off has to sit on a terminal's road corridor.
   *      This is "where can a tricycle actually go".
   *
   * Every ride must use the route selected by the customer. Private rides also
   * check the selected terminal's pickup area; shared rides keep their existing
   * any-terminal pickup-area check.
   *
   * Food deliveries are deliberately NOT checked here. They are placed from the
   * restaurant's own screen and never reach this function; they are gated by the
   * route alone, in `findDeliveryTerminalForOrder`.
   */
  const checkRideGates = async (): Promise<boolean> => {
    const selectedTerminalRoad = selectedTerminalBoundary.displayRoad;
    if (!selectedTerminalBoundary.terminal || (enforceBoundary && !selectedTerminalRoad?.length)) {
      setTerminalPickerWarning(missingSelectedRouteMessage);
      setShowTerminalPicker(true);
      return false;
    }

    const privateTerminal = selectedVehicle === 'special'
      ? selectedTerminalBoundary.terminal
      : null;

    if (selectedVehicle === 'special' && !privateTerminal) {
      setShowTerminalPicker(true);
      return false;
    }

    // A booking only requires the location *text*. If it was typed rather than
    // dropped on the map, the coordinates come from a background geocode that
    // fails freely on a typo or an address Google has not indexed â€” and a null
    // here used to mean "allowed", which is how bookings were getting through
    // unchecked. Resolve both on demand before deciding anything.
    let pickup = pickupCoords;
    if (!pickup && pickupAddress.trim() && pickup !== 'Current Location') {
      pickup = (await geocodeAddress(pickupAddress)) ?? null;
      if (pickup) setPickupCoords(pickup);
    }

    let dropoff = dropoffCoords;
    if (!dropoff && dropoffAddress.trim()) {
      dropoff = (await geocodeAddress(dropoffAddress)) ?? null;
      if (dropoff) setDropoffCoords(dropoff);
    }

    // Still nothing to check. Fail closed: refuse rather than wave it through,
    // because the alternative is a boundary that everyone believes is enforced
    // and which silently isn't.
    if (!pickup || !dropoff) {
      setUnresolvedDropoffError(true);
      return false;
    }

    if (!enforceBoundary) return true;

    const selectedTerminalArea = selectedTerminalBoundary.area;

    // Gate 1: the customer must be at a terminal.
    const border = privateTerminal
      ? {
          allowed: !selectedTerminalArea || isPointInPolygon(
            pickup.lat,
            pickup.lng,
            selectedTerminalArea,
          ),
          checkedCount: selectedTerminalArea ? 1 : 0,
          lookupFailed: false,
        }
      : await isPointWithinAnyTerminalBorder(pickup.lat, pickup.lng);
    if (border.lookupFailed) {
      setTerminalBoundaryCheckUnavailable(true);
      return false;
    }
    if (!border.allowed) {
      console.log('ðŸš« Pickup outside every terminal border:', pickup, {
        checkedCount: border.checkedCount,
      });
      setShowOutOfBoundaryError(true);
      return false;
    }

    // Gate 2: the drop-off must stay on the route the customer selected.
    const route = {
      allowed: isPointOnSelectedRoute(dropoff),
      checkedCount: 1,
      lookupFailed: false,
    };
    if (!route.allowed) {
      console.log('ðŸš« Drop-off outside every terminal route:', dropoff, {
        checkedCount: route.checkedCount,
      });
      setShowOutsideRouteError(true);
      return false;
    }

    return true;
  };

  /*
   * True while the customer is already in a ride, however it was started.
   *
   * Gated on `checked` so the booking options are not shown for a moment and
   * then yanked away once the database answers -- that flash is long enough to
   * tap Book a Ride.
   */
  const rideBlocked = rideContextChecked && (!!activeRideRequest || !!activeRideLobby);
  const resumableShareLobbyId = activeRideLobby?.id
    || (rideStateBelongsToCurrentUser ? activeShareLobbyId : null);
  const activeShareRidePassengerCount = useMemo(() => {
    const rawPassengers = activeRideLobby?.passengers_json;
    if (Array.isArray(rawPassengers)) return rawPassengers.length;
    if (typeof rawPassengers !== 'string') return 0;
    try {
      const parsed = JSON.parse(rawPassengers);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, [activeRideLobby?.passengers_json]);

  // The booking UI lives on top of the map and stays out of the way while a
  // ride is active, already being searched for, or already running elsewhere.
  const showBookingFlow = !visibleActiveRide && visibleRideStatus !== 'searching' && !rideBlocked;
  // Keep the home hub underneath lobby creation so its translucent loader has
  // the actual customer home screen to reveal.
  const showCustomerHomeHub = !isBookingPage && !isActivePrivateRidePage && bookingStep === 'home' && (showBookingFlow || cameFromCustomerHomeTab || showShareLobby);

  // A direct visit to the private ride route resumes a stored private ride or
  // its authoritative database request. Send stale/invalid links back to booking.
  useEffect(() => {
    if (!isActivePrivateRidePage || !user?.id || !rideContextChecked) return;

    let hasStoredPrivateRide = false;
    try {
      const saved = activeRideStorageKey ? localStorage.getItem(activeRideStorageKey) : null;
      if (saved) {
        const parsed = JSON.parse(saved);
        hasStoredPrivateRide =
          parsed?.customerId === user.id &&
          parsed?.vehicleType === 'special' &&
          Boolean(parsed?.requestId || parsed?.id);
      }
    } catch {
      // Fall through to the database-backed active ride check.
    }

    const hasActivePrivateRequest = Boolean(
      activeRideRequest?.id && !isDeliveryRideRequest(activeRideRequest),
    );
    if (!hasStoredPrivateRide && !hasActivePrivateRequest) {
      navigate('/customer/book-ride', { replace: true });
    }
  }, [isActivePrivateRidePage, user?.id, rideContextChecked, activeRideStorageKey, activeRideRequest, rideStatus, currentRequestId, navigate]);

  useEffect(() => {
    // A live private ride belongs on this map and driver-tracking screen. Only
    // return to the customer hub when the booking route is blocked by a share
    // lobby, which has its own resume flow.
    if (isBookingPage && rideContextChecked && rideBlocked && !activeRideRequest) {
      navigate('/customer', { replace: true, state: { customerHomeTab: true } });
    }
  }, [isBookingPage, rideContextChecked, rideBlocked, activeRideRequest, navigate]);

  useEffect(() => {
    if (isBookingPage && bookingStep === 'home' && !showShareLobby) {
      navigate('/customer', { replace: true, state: { customerHomeTab: true } });
    }
  }, [isBookingPage, bookingStep, showShareLobby, navigate]);

  /**
   * Watch the driver's messages so the floating head's badge is honest.
   *
   * Reading happens in the Messages tab, and holding a second copy of the
   * messages here would be a staler duplicate. The latest message id is tracked
   * only to distinguish new chat activity from badge refreshes.
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
      const chatMessages = (msgs || []) as any[];
      const latestMessage = chatMessages[chatMessages.length - 1];
      const previousMessage = lastDriverMessage.current;
      if (
        previousMessage?.conversationId === cid &&
        latestMessage?.id &&
        latestMessage.id !== previousMessage.messageId
      ) {
        setChatPulseKey((k) => k + 1);
        setChatHeadActivated(true);
      }
      lastDriverMessage.current = { conversationId: cid, messageId: latestMessage?.id || null };

      const fromDriver = chatMessages.filter(
        (m: any) => m.sender_id !== user.id && m.read === false
      );
      const count = fromDriver.length;
      setDriverUnread(count);
    };

    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rideDriverId, user?.id]);

  /*
   * How many seats this customer may choose.
   *
   * A tricycle that seats two should not be offered a party of three. The admin
   * sets a limit per terminal; when the chosen terminal has one, the seat list
   * stops there instead of always offering the same fixed set and failing later at
   * the point of no driver being found.
   *
   * Falls back to the same default the admin screen uses, rather than a number
   * typed in here: two screens disagreeing about the default is how a terminal
   * ends up advertising four seats and capping them at three.
   */
  const terminalSeatLimit = (() => {
    const terminal = terminals.find((t) => t.id === selectedTerminalId);
    const limit = terminal?.max_passengers;
    return typeof limit === "number" && limit >= 1 ? limit : DEFAULT_MAX_PASSENGERS;
  })();

  const seatChoices = Array.from({ length: Math.max(1, terminalSeatLimit) }, (_, i) => i + 1);

  /*
   * Bring the chosen seat count back inside the new limit.
   *
   * A customer can pick three seats and then switch to a terminal that only takes
   * two. Without this the seat list shrinks to 1 and 2, nothing is highlighted,
   * and the button still says "Continue with 3 Seats" -- booking a party the
   * vehicle cannot carry.
   */
  useEffect(() => {
    if (passengerCount > terminalSeatLimit) setPassengerCount(terminalSeatLimit);
  }, [passengerCount, terminalSeatLimit]);

  const handleBookRide = async () => {
    if (!selectedVehicle) return;

    /*
     * Refuse a second ride while one is under way.
     *
     * Checked against the database, not local state, so a booking made in
     * another tab (or restored onto a device that never saw it) is caught too.
     * A shared lobby that is still running reopens instead of erroring, and a
     * private ride leaves the customer on the ride card already on screen.
     */
    if (user?.id) {
      try {
        const { privateRide, lobby } = await getActiveRideContext(user.id);
        if (lobby) {
          setActiveShareLobbyPromptId(lobby.id);
          return;
        }
        if (privateRide) {
          return;
        }
      } catch (error) {
        console.error('Error checking active ride before booking:', error);
      }
    }

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
            setActiveShareLobbyPromptId(existingLobby.id);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking active lobbies:', error);
      }
    }
    
    /*
     * Share rides ask how many seats they need; private rides do not.
     *
     * A private ride books the whole vehicle, so this step had exactly one answer:
     * the modal rendered a single "1 passenger" tile and a "Continue with 1 Seat"
     * button. A screen whose only choice is "carry on" is not a decision, it is a
     * toll gate -- one more tap and one more screen between the customer and a
     * booking, on the one vehicle type where nothing is actually being decided.
     *
     * Straight to the confirmation, which still shows the trip and the fare.
     */
    if (selectedVehicle === 'special') {
      setShowBookingConfirm(true);
      return;
    }

    // Ask for passenger count for share rides
    setShowPassengerCount(true);
  };

  const handleConfirmBooking = async () => {
    setShowBookingConfirm(false);
    
    // For share rides, open the lobby system
    if (selectedVehicle === 'share') {
      if (!(await checkRideGates())) return;

      setActiveShareLobbyId(null);
      setShareLobbyInitialId(undefined);
      try {
        if (activeShareLobbyStorageKey) {
          localStorage.removeItem(activeShareLobbyStorageKey);
        }
      } catch {
        // The new booking details still open the lobby if storage is unavailable.
      }
      navigate('/customer/active-share-ride', {
        state: {
          booking: {
            pickup,
            pickupAddress,
            dropoff,
            dropoffAddress,
            pickupCoords,
            dropoffCoords,
            passengerCount,
            maxPassengersAllowed: terminalSeatLimit,
            pricePerSeat: shareFarePerSeat,
            paymentMethod,
            selectedTerminalId,
            selectedRouteId: selectedTerminalBoundary.selectedRoute?.id || null,
            routePoints: selectedTerminalBoundary.displayRoad,
            routeWidthM: selectedTerminalBoundary.routeWidthM ?? null,
          },
        },
      });
    } else {
      if (!(await checkRideGates())) return;

      // For private rides, save to Supabase database
      setRideStatus('searching');
      setRequestedAt(Date.now());
      
      try {
        // Validate user is authenticated
        if (!user?.id) {
          console.error('âŒ User ID not found');
          alert('âŒ Error: User not authenticated. Please log in again.');
          setRideStatus(null);
          return;
        }

        console.log('ðŸ“‹ Booking ride for user:', user.id);

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
           route_id: selectedTerminalBoundary.selectedRoute?.id || null,
           payment_method: paymentMethod === 'GCASH' ? 'GCASH' : 'COD',
           amount: fareAmount,
           passenger_count: passengerCount,
           created_at: new Date().toISOString(),
           updated_at: new Date().toISOString(),
         };

        console.log('ðŸ“¤ Sending request to Supabase:', rideRequest);

        // Save to Supabase database
        const { data: savedRequest, error: dbError } = await supabaseHelpers.createRideRequest(rideRequest);

        console.log('ðŸ“¥ Supabase response:', { data: savedRequest, error: dbError });

        if (dbError) {
          console.error('âŒ Database error:', dbError);
          console.error('âŒ Error code:', dbError.code);
          console.error('âŒ Error message:', dbError.message);
          alert(`âŒ Error booking ride: ${dbError.message || 'Please try again.'}`);
          setRideStatus(null);
          return;
        }

        if (savedRequest) {
          setCurrentRequestId(savedRequest.id);
          console.log('âœ… Ride request saved to database:', savedRequest);
          console.log('ðŸ“± Request ID:', savedRequest.id);
          console.log('ðŸ—„ï¸ Saved in Supabase ride_requests table');
          logAudit({
            action: 'create_ride',
            actorRole: 'customer',
            entityType: 'ride_request',
            entityId: savedRequest.id,
            summary: `Booked a private ride: ${pickup} â†’ ${dropoff}`,
            details: { amount: fareAmount, terminal_id: selectedTerminalId },
            actorEmail: user?.email,
            actorName: user?.name,
          });
        } else {
          console.error('âŒ No data returned from database');
          alert('âŒ Error: No response from database. Please try again.');
          setRideStatus(null);
        }
      } catch (error: any) {
        console.error('âŒ Error creating ride request:', error);
        console.error('âŒ Error stack:', error.stack);
        console.error('âŒ Error message:', error.message);
        alert(`âŒ Error booking ride: ${error.message || 'Please try again.'}`);
        setRideStatus(null);
      }
    }
  };

  const handleCancelRide = async (reason?: string) => {
    const storedRequestId = currentRequestId || (() => {
      try {
        const savedRideData = activeRideStorageKey ? localStorage.getItem(activeRideStorageKey) : null;
        if (!savedRideData) return null;

        const parsedRide = JSON.parse(savedRideData);
        return typeof parsedRide?.requestId === 'string'
          ? parsedRide.requestId
          : typeof parsedRide?.id === 'string'
            ? parsedRide.id
            : null;
      } catch (error) {
        console.warn('âš ï¸ Unable to read stored ride request for cancellation:', error);
        return null;
      }
    })();

    try {
      // A lobby id ("lobby_â€¦") isn't a ride_requests row â€” a shared ride is left
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
          console.error('âŒ Failed to cancel ride request:', error);
          alert(`âŒ Failed to cancel ride: ${error.message || 'Please try again.'}`);
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

        // A delivery ride is backed by an orders row â€” cancel that too so the
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
            console.error('âš ï¸ Ride cancelled but the linked order was not:', orderError);
          } else {
            console.log('âœ… Linked order cancelled with the customer\'s reason:', linkedOrderId);
          }
        }
      }

      if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
      setRideCompletedPopup(false);
      setDriverAcceptedPopup(null);
      setDriverStatusPopup(null);
      resetCustomerRideVisuals();
      setRideStatus(null);
      setCurrentRequestId(null);
      setShowBookingConfirm(false);
      if (isActivePrivateRidePage) {
        navigate('/customer', { replace: true, state: { customerHomeTab: true } });
      }
    } catch (error: any) {
      console.error('âŒ Error cancelling ride:', error);
      alert(`âŒ Failed to cancel ride: ${error?.message || 'Please try again.'}`);
    }
  };

  const cancelRequiresReason = Boolean(
    rideDriverId ||
    activeRide?.driver ||
    (visibleRideStatus !== null && visibleRideStatus !== 'searching')
  );

  const handleCancelRideClick = () => {
    if (!cancelRequiresReason) {
      setShowCancelConfirm(false);
      void handleCancelRide();
      return;
    }

    setShowCancelConfirm(true);
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
        console.error('âŒ Failed to open driver chat:', error);
        alert('Failed to open chat. Please try again.');
        return;
      }
      // Pass the ride context so the thread renders the floating chat-head icon
      // (tap it to come back here) and its back arrow returns to the ride instead
      // of the messages list.
      navigate(`/customer/messages/thread/${data.id}`, {
        state: {
          fromActiveRide: true,
          rideBackTo: selectedVehicle === 'special' && !isDeliveryRide
            ? '/customer/active-private-ride'
            : '/customer',
          peerAvatar: rideDriverAvatar || undefined,
          peerLabel: activeRide?.driver || 'Driver',
        },
      });
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
  const nearestTerminal = useMemo(() => {
    const candidates = terminals.filter(terminal =>
      Number.isFinite(terminal.center_lat) && Number.isFinite(terminal.center_lng)
    );
    if (candidates.length === 0) return null;

    return candidates.reduce((nearest, terminal) => {
      const terminalDistance = haversineDistanceMeters(currentLocation, {
        lat: terminal.center_lat,
        lng: terminal.center_lng,
      });
      const nearestDistance = haversineDistanceMeters(currentLocation, {
        lat: nearest.center_lat,
        lng: nearest.center_lng,
      });
      return terminalDistance < nearestDistance ? terminal : nearest;
    });
  }, [terminals, currentLocation]);
  const terminalPickerOptions = useMemo(() => {
    const distanceFromCurrentLocation = (terminal: typeof terminals[number]) =>
      haversineDistanceMeters(currentLocation, {
        lat: terminal.center_lat,
        lng: terminal.center_lng,
      });
    const nearestFirst = (left: typeof terminals[number], right: typeof terminals[number]) =>
      distanceFromCurrentLocation(left) - distanceFromCurrentLocation(right);

    if (terminalPickerFilter === "closest") return nearestTerminal ? [nearestTerminal] : [];
    if (terminalPickerFilter === "selected") return selectedTerminal ? [selectedTerminal] : [];
    if (terminalPickerFilter === "frequent") {
      return terminals
        .filter(terminal => (terminalPickerUsage[terminal.id] || 0) > 0)
        .sort((left, right) =>
          (terminalPickerUsage[right.id] || 0) - (terminalPickerUsage[left.id] || 0)
          || nearestFirst(left, right)
        );
    }
    return [...terminals].sort(nearestFirst);
  }, [currentLocation, nearestTerminal, selectedTerminal, terminalPickerFilter, terminalPickerUsage, terminals]);
  const frequentlyUsedTerminalCount = useMemo(
    () => terminals.filter(terminal => (terminalPickerUsage[terminal.id] || 0) > 0).length,
    [terminalPickerUsage, terminals]
  );
  const terminalPickerDescription = enforceBoundary
    ? 'Choose a pickup route. Drop-offs must stay on the selected route.'
    : 'Choose a terminal for pickup.';
  const terminalPickerEmptyMessage = terminalPickerFilter === "closest"
    ? 'The closest terminal could not be determined from your current location.'
    : terminalPickerFilter === "frequent"
      ? 'Terminals you select will appear here as your frequently used routes.'
      : 'Choose a pickup route first to see the selected terminal here.';
  const selectTerminalRoute = useCallback((terminalId: string, requestedRouteId?: string | null) => {
    const terminal = terminals.find(item => item.id === terminalId);
    if (!terminal) return;

    const terminalRoutes = mapTerminalRoutes.filter(route => route.terminalId === terminal.id);
    const route = requestedRouteId
      ? terminalRoutes.find(item => item.id === requestedRouteId) || null
      : terminalRoutes.find(item => item.enabled) || terminalRoutes[0] || null;
    const road = route?.points || null;
    const routeWidthM = route?.bufferM ?? terminal.road_width_m;
    if (enforceBoundary && (!route || !route.enabled || !road?.length)) {
      const message = route && !route.enabled
        ? `${route.name} is disabled. Choose an enabled route to set your pickup.`
        : `${terminal.name} has no enabled mapped route yet. Drop-off selection is unavailable until one is set.`;
      setTerminalPickerWarning(message);
      return;
    }

    const nextSelectedRouteId = route?.id ?? null;
    const routeChanged = selectedTerminalId !== terminal.id || selectedTerminalRouteId !== nextSelectedRouteId;
    const coords = { lat: terminal.center_lat, lng: terminal.center_lng };
    const existingDropoffOutsideRoute = Boolean(
      enforceBoundary &&
      dropoffCoords && !isPointOnRoadCorridor(
        dropoffCoords.lat,
        dropoffCoords.lng,
        road || [],
        normalizeRoadWidth(routeWidthM),
      )
    );
    if (routeChanged || existingDropoffOutsideRoute) {
      setDropoff('');
      setDropoffAddress('');
      setDropoffCoords(null);
      setDropoffMarker(null);
      setDestinationRoutePath([]);
      setRoutePath([]);
      setLocationPreview(null);
      setEtaToDestination(null);
    }

    setPickup(terminal.name);
    setPickupAddress(terminal.boundary);
    setPickupCoords(coords);
    setPickupMarker(coords);
    setSelectedTerminalId(terminal.id);
    setSelectedTerminalRouteId(nextSelectedRouteId);
    recordTerminalPickerUse(terminal.id);
    setMapCenter(coords);
    setTerminalPickerWarning(null);
    setPickerBoundaryWarning(null);
    setShowTerminalPicker(false);
    setRoutePreviewTerminalId(null);
    setShowRoutePreviewList(false);
    setSearchQuery("");
    setPredictions([]);
    setLocationPreview(
      !routeChanged && !existingDropoffOutsideRoute && dropoffCoords
        ? {
            lat: dropoffCoords.lat,
            lng: dropoffCoords.lng,
            name: dropoff || 'Drop-off Location',
            fullAddress: dropoffAddress || dropoff || 'Select drop-off location',
          }
        : null
    );
    setPickerBoundaryWarning(null);
    setActiveLocationInput('dropoff');
    setShowLocationPicker(true);
    hasManualPickupSelectionRef.current = true;
    customerMapRef.current?.panTo(coords);
  }, [terminals, mapTerminalRoutes, selectedTerminalId, selectedTerminalRouteId, dropoffCoords, dropoff, dropoffAddress, enforceBoundary, recordTerminalPickerUse]);
  const routePreviewTerminal = useMemo(
    () => terminals.find(t => t.id === routePreviewTerminalId) || null,
    [terminals, routePreviewTerminalId]
  );
  const activeMapTerminalId = routePreviewTerminalId
    ?? (isActiveShareRideMap ? activeRideLobby?.terminal_id || selectedTerminalId : activeRideRequest?.terminal_id || selectedTerminalId)
    ?? nearestTerminal?.id
    ?? null;
  const activeRideTerminalId = activeRideLobby?.terminal_id || activeRideRequest?.terminal_id || selectedTerminalId;
  const activeRideTerminalMarkerColor = normalizeTerminalColor(
    terminals.find(terminal => terminal.id === activeRideTerminalId)?.marker_color,
  );
  const shareRideTerminal = useMemo(
    () => terminals.find(terminal => terminal.id === (activeRideLobby?.terminal_id || selectedTerminalId)) || null,
    [terminals, activeRideLobby?.terminal_id, selectedTerminalId],
  );
  const shareRideTerminalPickup = useMemo(() => {
    if (!shareRideTerminal) return null;
    return {
      lat: Number(shareRideTerminal.center_lat),
      lng: Number(shareRideTerminal.center_lng),
    };
  }, [shareRideTerminal]);
  const activeShareRideMapPickup = activeShareRideMapDetails.isActive
    ? activeShareRideMapDetails.pickup || pickupCoords
    : pickupCoords;
  const activeShareRideTerminalMarker = activeShareRideMapDetails.isActive
    ? shareRideTerminalPickup && Number.isFinite(shareRideTerminalPickup.lat) && Number.isFinite(shareRideTerminalPickup.lng)
      ? shareRideTerminalPickup
      : null
    : pickupCoords;
  const mapRoutesInView = useMemo(() => {
    // The dedicated booking map is an overview: customers need to compare all
    // available terminals and their mapped routes before choosing a pickup.
    if (isBookingPage) {
      if (showAllBookingTerminals) return mapTerminalRoutes;
      return activeMapTerminalId
        ? mapTerminalRoutes.filter(route => route.terminalId === activeMapTerminalId)
        : [];
    }
    if (!activeMapTerminalId) return [];
    const terminalRoutes = mapTerminalRoutes.filter(route => route.terminalId === activeMapTerminalId);

    // Keep the terminal's route network visible during a private ride. The
    // active route is highlighted separately and the other routes are dimmed.
    if ((isActivePrivateRidePage || isPrivateRide) && !isActiveShareRideMap) {
      return terminalRoutes;
    }

    // The minimized lobby leaves the Home map behind. Keep that map on the
    // lobby's actual route instead of drawing every route for the terminal.
    if (isActiveShareRideMap && !routePreviewTerminalId) {
      const selectedRoute = activeShareRideRoute?.terminalId === activeMapTerminalId
        ? activeShareRideRoute
        : terminalRoutes.find(route => route.id === selectedTerminalRouteId)
          || terminalRoutes.find(route => route.isPrimary)
          || terminalRoutes[0]
          || null;
      return selectedRoute ? [selectedRoute] : [];
    }

    return terminalRoutes;
  }, [
    activeMapTerminalId,
    activeShareRideRoute,
    isActiveShareRideMap,
    isActivePrivateRidePage,
    isPrivateRide,
    isBookingPage,
    mapTerminalRoutes,
    routePreviewTerminalId,
    showAllBookingTerminals,
    selectedTerminalRouteId,
  ]);
  const isPrivateRideMap = (isActivePrivateRidePage || isPrivateRide) && !isActiveShareRideMap;
  const activePrivateRideRoute = useMemo(() => {
    if (!isPrivateRideMap) return null;

    const requestRouteId = String(
      activeRideRequest?.route_id || activeRideRequest?.selected_route_id || '',
    );
    const requestRoute = requestRouteId
      ? mapRoutesInView.find(route => route.id === requestRouteId || route.routeId === requestRouteId) || null
      : null;
    const requestDropoffLat = activeRideRequest?.dropoff_lat == null
      ? Number.NaN
      : Number(activeRideRequest.dropoff_lat);
    const requestDropoffLng = activeRideRequest?.dropoff_lng == null
      ? Number.NaN
      : Number(activeRideRequest.dropoff_lng);
    const privateRideDropoff = Number.isFinite(requestDropoffLat) && Number.isFinite(requestDropoffLng)
      ? { lat: requestDropoffLat, lng: requestDropoffLng }
      : dropoffCoords;
    const isRouteForDropoff = (route: typeof mapRoutesInView[number]) => Boolean(
      privateRideDropoff && isPointOnRoadCorridor(
        privateRideDropoff.lat,
        privateRideDropoff.lng,
        route.points,
        normalizeRoadWidth(route.bufferM),
      )
    );
    const inMemorySelectedRoute = selectedTerminalId === activeMapTerminalId
      ? mapRoutesInView.find(route => route.id === selectedTerminalRouteId) || null
      : null;
    const selectedRouteMatchesDropoff = inMemorySelectedRoute && (
      !privateRideDropoff || isRouteForDropoff(inMemorySelectedRoute)
    )
      ? inMemorySelectedRoute
      : null;
    const routesMatchingDropoff = privateRideDropoff
      ? mapRoutesInView.filter(isRouteForDropoff)
      : [];
    const routeForDropoff = routesMatchingDropoff.find(route => route.enabled && route.isPrimary)
      || routesMatchingDropoff.find(route => route.enabled)
      || routesMatchingDropoff.find(route => route.isPrimary)
      || routesMatchingDropoff[0]
      || null;

    return requestRoute
      || selectedRouteMatchesDropoff
      || routeForDropoff
      || (!privateRideDropoff
        ? inMemorySelectedRoute || mapRoutesInView.find(route => route.isPrimary) || mapRoutesInView[0] || null
        : null);
  }, [
    activeMapTerminalId,
    activeRideRequest?.dropoff_lat,
    activeRideRequest?.dropoff_lng,
    activeRideRequest?.route_id,
    activeRideRequest?.selected_route_id,
    dropoffCoords,
    isPrivateRideMap,
    mapRoutesInView,
    selectedTerminalId,
    selectedTerminalRouteId,
  ]);
  const privateRideTerminalRoutePath = useMemo(() => {
    if (!isPrivateRideMap || !activePrivateRideRoute || !pickupCoords || !dropoffCoords) {
      return [];
    }
    return buildTerminalRouteSegment(activePrivateRideRoute.points, pickupCoords, dropoffCoords);
  }, [isPrivateRideMap, activePrivateRideRoute, pickupCoords, dropoffCoords]);
  const activeDestinationRoutePath = isPrivateRideMap
    ? privateRideTerminalRoutePath
    : destinationRoutePath;
  useEffect(() => {
    if (!isBookingPage) {
      bookingMapOverviewFittedRef.current = null;
      return;
    }
    if (!isMapsLoaded || !customerMapReady) return;

    const fitKey = showAllBookingTerminals ? 'all' : `terminal:${activeMapTerminalId || 'none'}`;
    if (bookingMapOverviewFittedRef.current === fitKey) return;

    const map = customerMapRef.current;
    const maps = (window as any).google?.maps;
    if (!map || !maps?.LatLngBounds) return;

    const bounds = new maps.LatLngBounds();
    let pointCount = 0;
    const visibleTerminalIds = showAllBookingTerminals
      ? null
      : new Set(activeMapTerminalId ? [activeMapTerminalId] : []);
    const extendBounds = (point: { lat: number; lng: number }) => {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
      bounds.extend(point);
      pointCount += 1;
    };

    terminals
      .filter(terminal => !visibleTerminalIds || visibleTerminalIds.has(terminal.id))
      .forEach(terminal => extendBounds({
        lat: Number(terminal.center_lat),
        lng: Number(terminal.center_lng),
      }));
    mapTerminalRoutes
      .filter(route => !visibleTerminalIds || visibleTerminalIds.has(route.terminalId))
      .forEach(route => route.points.forEach(extendBounds));

    if (!pointCount) return;
    if (pointCount === 1) {
      map.panTo(bounds.getCenter());
      map.setZoom(15);
    } else {
      map.fitBounds(bounds, 48);
    }
    bookingMapOverviewFittedRef.current = fitKey;
  }, [activeMapTerminalId, customerMapReady, isBookingPage, isMapsLoaded, mapTerminalRoutes, showAllBookingTerminals, terminals]);
  const routePreviewFocusedRoute = useMemo(
    () => mapTerminalRoutes.find(route => route.id === routePreviewFocusRouteId) || null,
    [mapTerminalRoutes, routePreviewFocusRouteId]
  );
  const routePreviewTerminalRoutes = useMemo(
    () => mapTerminalRoutes.filter(route => route.terminalId === routePreviewTerminalId),
    [mapTerminalRoutes, routePreviewTerminalId]
  );
  const routePreviewSelectionRoute = routePreviewTerminalRoutes.find(route => route.id === routePreviewFocusRouteId) || null;
  const routePreviewVisibleTerminalIds = useMemo(
    () => {
      const visibleTerminalIds = mapTerminalRoutes
        .filter(route => routePreviewVisibleRouteIds.includes(route.id))
        .map(route => route.terminalId);
      if (
        routePreviewTerminal &&
        !mapTerminalRoutes.some(route => route.terminalId === routePreviewTerminal.id)
      ) {
        visibleTerminalIds.push(routePreviewTerminal.id);
      }
      return new Set(visibleTerminalIds);
    },
    [mapTerminalRoutes, routePreviewTerminal, routePreviewVisibleRouteIds]
  );
  const routePreviewArea = normalizeBoundaryArea(routePreviewTerminal?.boundary_area);
  const routePreviewBorderColor = normalizeBorderColor(routePreviewTerminal?.border_color);
  const routePreviewMarkerColor = normalizeTerminalColor(routePreviewTerminal?.marker_color);
  const routePreviewMapCenter = useMemo(
    () => ({
      lat: routePreviewTerminal?.center_lat ?? 0,
      lng: routePreviewTerminal?.center_lng ?? 0,
    }),
    [routePreviewTerminal?.center_lat, routePreviewTerminal?.center_lng]
  );
  const openRoutePreview = useCallback((terminalId: string) => {
    setRoutePreviewTerminalId(terminalId);
    const terminalRoutes = mapTerminalRoutes.filter(route => route.terminalId === terminalId);
    const firstRoute = terminalRoutes.find(route => route.enabled) || terminalRoutes[0];
    setRoutePreviewFocusRouteId(firstRoute?.id ?? null);
    setRoutePreviewVisibleRouteIds(terminalRoutes.map(route => route.id));
    setShowRoutePreviewList(true);
  }, [mapTerminalRoutes]);
  const focusRoutePreview = useCallback((routeId: string | null, terminalId: string, mapOverride?: any) => {
    const map = mapOverride || routePreviewMapRef.current;
    const maps = (window as any).google?.maps;
    const terminal = terminals.find(item => item.id === terminalId);
    if (!map || !terminal) return;

    const route = mapTerminalRoutes.find(item => item.id === routeId)?.points || [];
    const area = normalizeBoundaryArea(terminal.boundary_area) || [];
    const points = route.length > 0 ? route : area;
    if (!maps?.LatLngBounds || points.length < 2) {
      map.panTo({ lat: terminal.center_lat, lng: terminal.center_lng });
      map.setZoom(15);
      return;
    }

    const bounds = new maps.LatLngBounds();
    points.forEach(point => bounds.extend(point));
    map.fitBounds(bounds, 48);
  }, [mapTerminalRoutes, terminals]);
  const focusAllRoutePreview = useCallback(() => {
    const map = routePreviewMapRef.current;
    const maps = (window as any).google?.maps;
    if (!map || !maps?.LatLngBounds) return;

    const points = routePreviewTerminalRoutes.flatMap(route => route.points);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
      return;
    }

    const bounds = new maps.LatLngBounds();
    points.forEach(point => bounds.extend(point));
    map.fitBounds(bounds, 48);
  }, [routePreviewTerminalRoutes]);
  const selectRoutePreview = useCallback((routeId: string) => {
    const route = mapTerminalRoutes.find(item => item.id === routeId);
    if (!route) return;
    setRoutePreviewTerminalId(route.terminalId);
    setRoutePreviewFocusRouteId(route.id);
    setRoutePreviewVisibleRouteIds([route.id]);
  }, [mapTerminalRoutes]);
  useEffect(() => {
    if (routePreviewTerminalId) {
      focusRoutePreview(routePreviewFocusRouteId, routePreviewTerminalId);
    }
  }, [focusRoutePreview, routePreviewFocusRouteId, routePreviewTerminalId]);
  const terminalFare = useMemo(() => terminalRates(selectedTerminal), [selectedTerminal]);
  const activeRates = {
    baseFare: selectedTerminal?.base_fare != null ? terminalFare.baseFare : baseFare,
    baseFareIncludedKm: selectedTerminal?.base_fare_included_km != null
      ? terminalFare.baseFareIncludedKm
      : baseFareIncludedKm,
    perKm: selectedTerminal?.per_km != null ? terminalFare.perKm : perKm,
  };

  const formatKm = (km: number) => Number(km.toFixed(2)).toString();
  const fareDescription = (
    rates: { baseFare: number; baseFareIncludedKm: number; perKm: number },
    distanceKm: number,
    terminalName?: string,
  ) => {
    const includedKm = Math.max(0, rates.baseFareIncludedKm);
    const extraKm = Math.max(0, distanceKm - includedKm);
    const distanceText = extraKm > 0
      ? ` + \u20B1${rates.perKm}/km for ${formatKm(extraKm)} km after`
      : '';
    return `\u20B1${rates.baseFare} covers first ${formatKm(includedKm)} km${distanceText}${terminalName ? ` \u00B7 ${terminalName}` : ''}`;
  };

  // The base covers its configured initial distance; charge per-km only beyond it.
  const fareInfo = useMemo(
    () => computeRideFare(activeRates, pickupCoords, dropoffCoords),
    [activeRates.baseFare, activeRates.baseFareIncludedKm, activeRates.perKm, pickupCoords, dropoffCoords]
  );
  /*
   * A private ride books the whole vehicle, so the terminal can price it on its
   * own terms rather than as a share of the seat fare. Both halves fall back to
   * the terminal's share rate, which is what a private ride cost before the
   * separate private columns existed -- so a terminal that has never set them
   * quotes the customer exactly the same number as it used to.
   *
   * Computed unconditionally rather than inside getPrice, because the terminal
   * picker below lists terminals the customer has not chosen yet and needs the
   * same answer for each of them.
   */
  const privateActiveRates = useMemo(
    () => privateRideRates(selectedTerminal, activeRates),
    [selectedTerminal, activeRates.baseFare, activeRates.baseFareIncludedKm, activeRates.perKm]
  );
  const privateFareInfo = useMemo(
    () => computeRideFare(privateActiveRates, pickupCoords, dropoffCoords),
    [privateActiveRates.baseFare, privateActiveRates.baseFareIncludedKm, privateActiveRates.perKm, pickupCoords, dropoffCoords]
  );
  const privateTotal = privateFareInfo.distanceKm != null ? privateFareInfo.total : privateRidePrice;
  const privateBreakdown = privateFareInfo.distanceKm != null
    ? fareDescription(privateActiveRates, privateFareInfo.distanceKm, selectedTerminal?.name)
    : `Fixed rate${selectedTerminal ? ` \u00B7 ${selectedTerminal.name}` : ''}`;

  /* Every shared passenger pays the full base fare and their own distance charge. */
const shareFarePerSeat = useMemo(
  () => computeSharedRideFarePerPassenger(activeRates, fareInfo.distanceKm),
  [activeRates.baseFare, activeRates.baseFareIncludedKm, activeRates.perKm, fareInfo.distanceKm]
);
const shareFareForParty = shareFarePerSeat * Math.max(1, passengerCount);
const shareExtraKm = fareInfo.distanceKm == null
  ? null
  : Math.max(0, fareInfo.distanceKm - Math.max(0, activeRates.baseFareIncludedKm));
const shareFareBreakdown = [
  `\u20B1${activeRates.baseFare} base fare per passenger`,
  `\u20B1${activeRates.perKm}/km per passenger after ${formatKm(Math.max(0, activeRates.baseFareIncludedKm))} km${shareExtraKm == null ? "" : ` (${formatKm(shareExtraKm)} extra km)`}`,
].join(" \u00B7 ");

const getPrice = () => {
  if (selectedVehicle === 'share') return shareFareForParty;
  // A private ride is not shared, so there is nothing to divide: `privateTotal` is
  // the trip fare itself, already rounded up to a whole peso by `computeRideFare`.
  if (selectedVehicle === 'special') return privateTotal;
  return 0;
};

  const resetCustomerRideVisuals = () => {
    hasManualPickupSelectionRef.current = false;
    setPickup(currentLocation ? 'Current Location' : '');
    setPickupAddress('');
    setDropoff('');
    setDropoffAddress('');
    setPickupCoords(currentLocation || null);
    setDropoffCoords(null);
    setPickupMarker(null);
    setDropoffMarker(null);
    setMapCenter(currentLocation);
    setSelectedMarker(null);
    setFocusedMarker(null);
    setRouteTarget(null);
    setRoutePath([]);
    setDriverLocation(null);
    setSelectedTerminalId(null);
    setSelectedTerminalRouteId(null);
    setDriverRoutePath([]);
    setDestinationRoutePath([]);
    setEtaToDestination(null);
    setLocationPreview(null);
    setPredictions([]);
    setSearchQuery('');
    setActiveLocationInput(null);
    setShowLocationPicker(false);
    setRoutePreviewTerminalId(null);
    setRoutePreviewFocusRouteId(null);
    setRoutePreviewVisibleRouteIds([]);
    setShowRoutePreviewList(false);
    setActiveRide(null);
    setPrivateRideAssignmentPopup(null);
    setBookedFare(null);
    setShowCustomerPaymentModal(false);
    setSelectedVehicle(null);
    setIsSearchMinimized(false);
    // A finished ride drops the customer back on the plain map + Book a Ride.
    setBookingStep('home');
  };

  const dismissCustomerPaymentModal = () => {
    if (currentRequestId) {
      localStorage.setItem(`customer_payment_modal_dismissed_${currentRequestId}`, '1');
    }
    setShowCustomerPaymentModal(false);
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
      console.error('âŒ Failed to capture delivery business:', err);
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
      console.error('âŒ Failed to submit rating:', error);
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
    if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
    if (activeShareLobbyStorageKey) localStorage.removeItem(activeShareLobbyStorageKey);
    if (isActivePrivateRidePage) {
      navigate('/customer', { replace: true, state: { customerHomeTab: true } });
      return;
    }
    window.location.reload();
  };

  const finishRideCompletion = () => {
    setRideCompletedPopup(false);
    setRatingSubmitted(false);
    setSelectedRating(0);
    setActiveRide(null);
    setRideStatus(null);
    setCurrentRequestId(null);
    setCompletionPopupType('ride');
    setRideDriverId(null);
    setDeliveryBusiness(null);
    resetCustomerRideVisuals();
    if (activeRideStorageKey) localStorage.removeItem(activeRideStorageKey);
    if (activeShareLobbyStorageKey) localStorage.removeItem(activeShareLobbyStorageKey);
    if (isActivePrivateRidePage) {
      navigate('/customer', { replace: true, state: { customerHomeTab: true } });
      return;
    }
    window.location.reload();
  };

  const filteredLocations = popularLocations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Home stays a scrolling service feed while the customer is riding. Keep the
  // map visible throughout booking and ride tracking, hiding it only when Home
  // is explicitly selected or serves as the share lobby loading backdrop.
  const showMap = !showCustomerHomeHub;
  const isRideOptionsBookingPage = isBookingPage && bookingStep === 'ride';

  /**
   * What the header shows above the search field once search is opened.
   *
   * The pickup the customer has already set is more useful than a raw
   * coordinate, so it wins; otherwise we say plainly that we do not know yet
   * rather than showing a stale default like "Manila".
   */
  const hubLocationLabel =
    (pickupAddress && pickupAddress.trim()) || (pickup && pickup !== 'Current Location' ? pickup : '') || 'Locating youâ€¦';

  const rememberActiveShareLobby = (lobbyId: string) => {
    setActiveShareLobbyId(lobbyId);
    try {
      if (activeShareLobbyStorageKey) {
        localStorage.setItem(activeShareLobbyStorageKey, lobbyId);
      }
    } catch {
      // Storage is a resume hint; the lobby remains open in this view.
    }
  };

  const closeShareLobby = (status?: string) => {
    setShowShareLobby(false);
    setShareLobbyInitialId(undefined);
    resetCustomerRideVisuals();
    navigate('/customer', { replace: true, state: { customerHomeTab: true } });
    if (!status) return;

    setActiveShareLobbyId(null);
    try {
      if (activeShareLobbyStorageKey) {
        localStorage.removeItem(activeShareLobbyStorageKey);
      }
    } catch {
      // The database membership remains authoritative when storage is unavailable.
    }
  };

  /**
   * The page gets a mint wash that fades to the base colour over the first
   * 420px rather than a flat fill. `--surface` is defined as
   * `var(--background)`, so before this every card was the exact same colour as
   * the page behind it and the only thing separating them was a hairline. The
   * wash fades into the canvas, using tokens rather than literals so it inverts with the
   * theme: `--teal-soft` is a light mint in light mode and a deep pine in dark
   * mode. The fade is an absolute distance rather than a percentage, so it
   * covers the hub card at any viewport height instead of stretching down the
   * whole page.
   *
   * (It is a JSDoc comment on the return rather than a `{/* ... *\/}` one
   * because a JSX expression container is only legal as a child element â€” as
   * the root of `return (...)` the parser reads it as an object literal and
   * fails on the very next tag.)
   */
  return (
    <div className={isRideOptionsBookingPage || isActivePrivateRidePage
      ? "relative flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-[linear-gradient(180deg,var(--teal-soft)_0%,var(--canvas)_420px)]"
      : "relative flex min-h-screen flex-col bg-[linear-gradient(180deg,var(--teal-soft)_0%,var(--canvas)_420px)]"}>
      {/* Full-screen map, matching the driver dashboard layout. */}
      {showMap && (
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-[var(--border)]">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--error)] mb-4">âš ï¸ Google Maps API Key Missing</p>
              <p className="text-[var(--ink-soft)] mb-4">To use Google Maps, please add your API key to .env.local</p>
            </div>
          </div>
         ) : mapsBlocked || mapsLoadError ? (
            <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
              <div className="text-center max-w-md px-6">
                <p className="text-lg font-bold text-[var(--error)] mb-3">âš ï¸ Map resources blocked</p>
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
             center={mapCenter}
             zoom={15}
             onLoad={(map: any) => {
               customerMapRef.current = map;
               setCustomerMapReady(true);
               const pendingTerminalFocus = pendingTerminalFocusRef.current;
               if (pendingTerminalFocus) {
                 map.panTo(pendingTerminalFocus);
                 map.setZoom(16);
                 pendingTerminalFocusRef.current = null;
               }
             }}
             onUnmount={() => {
               customerMapRef.current = null;
               setCustomerMapReady(false);
             }}
             options={{
               gestureHandling: 'greedy',
               zoomControl: false,
               fullscreenControl: false,
               streetViewControl: false,
               mapTypeControl: false,
             }}
           >
             <MapTypeToggle />
             {/* Current location marker (always visible, reference point) */}
             <MarkerF
               position={currentLocation}
               onClick={() => setSelectedMarker(currentLocation)}
               title="Your location (start)"
                icon={createCurrentLocationIcon()}
             />

              {/* Booking starts with an overview of every active terminal. */}
              {isBookingPage && terminals.map(terminal => {
                const position = {
                  lat: Number(terminal.center_lat),
                  lng: Number(terminal.center_lng),
                };
                if (
                  !Number.isFinite(position.lat) ||
                  !Number.isFinite(position.lng) ||
                  (!showAllBookingTerminals && terminal.id !== activeMapTerminalId) ||
                  // Keep a terminal glyph from covering the customer's own location dot.
                  haversineDistanceMeters(currentLocation, position) < 40
                ) return null;
                return (
                  <MarkerF
                    key={`booking-terminal-${terminal.id}`}
                    position={position}
                    title={terminal.name}
                    icon={terminalMarkerIcon(normalizeTerminalColor(terminal.marker_color))}
                  />
                );
              })}

              {/* Pickup and drop-off both, once a ride is live. The pickup pin
                  used to be omitted here and drawn only inside the (now removed)
                  embedded card map, so the destination route had no visible start
                  point. */}
              {rideStateBelongsToCurrentUser && (isActiveShareRideMap || isPrivateRideMap || visibleRideStatus !== 'searching') && activeShareRideTerminalMarker && (
                <MarkerF
                  position={activeShareRideTerminalMarker}
                  title={isDeliveryRide ? 'Restaurant pickup' : activeShareRideMapDetails.isActive ? 'Terminal' : 'Pickup location'}
                  icon={isDeliveryRide ? createRestaurantMarkerIcon() : terminalMarkerIcon(activeRideTerminalMarkerColor)}
                />
              )}

              {/* Share rides can have multiple stops for this customer's group. */}
              {rideStateBelongsToCurrentUser && isActiveShareRideMap
                ? activeShareRideMapDetails.dropoffs.map((point, index) => (
                    <MarkerF
                      key={`share-dropoff-${index}-${point.lat}-${point.lng}`}
                      position={point}
                      title={`Your drop-off ${index + 1}`}
                      icon={createDropoffMarkerIcon()}
                    />
                  ))
                : rideStateBelongsToCurrentUser && activeShareRideMapDropoff && (
                    <MarkerF
                      position={activeShareRideMapDropoff}
                      title={isDeliveryRide ? 'Customer drop-off' : 'Drop-off location'}
                      icon={createDropoffMarkerIcon()}
                    />
                  )}

              {/* Show only routes for the active terminal. */}
              {mapRoutesInView.map(route => {
                const isSelectedRoute = isActiveShareRideMap
                  ? route.id === (activeShareRideRoute?.id || selectedTerminalBoundary.selectedRoute?.id)
                  : isPrivateRideMap
                    ? route.id === activePrivateRideRoute?.id
                    : route.terminalId === activeMapTerminalId && (
                        selectedTerminalId === activeMapTerminalId
                          ? route.id === selectedTerminalBoundary.selectedRoute?.id
                          : route.isPrimary
                      );
                const routeColor = route.terminalId === selectedTerminalId ? selectedTerminalRouteColor : route.color;
                const routeOpacity = isPrivateRideMap && !isSelectedRoute
                  ? route.enabled ? 0.12 : 0.06
                  : isSelectedRoute ? 0.95 : route.enabled ? 0.82 : 0.38;
                return (
                  <Fragment key={route.id}>
                    {isSelectedRoute && (
                      <Polyline
                        path={route.points}
                        options={{
                          strokeColor: routeColor,
                          strokeWeight: 10,
                          strokeOpacity: 0.22,
                          zIndex: isPrivateRideMap ? 19 : 1,
                          clickable: false,
                          geodesic: true,
                        }}
                      />
                    )}
                    <Polyline
                      path={route.points}
                      options={{
                        strokeColor: routeColor,
                        strokeWeight: isSelectedRoute ? 4 : isPrivateRideMap ? 3 : 5,
                        strokeOpacity: routeOpacity,
                        zIndex: isPrivateRideMap ? (isSelectedRoute ? 20 : 1) : undefined,
                        clickable: false,
                        geodesic: true,
                      }}
                    />
                  </Fragment>
                );
              })}

              {/* Driver location marker (real-time tracking) */}
              {rideStateBelongsToCurrentUser && !isActiveShareRideMap && driverLocation && visibleRideStatus === 'driver-found' && (
                <MarkerF
                  position={driverLocation}
                  title="Driver Location"
                  icon={createDriverMarkerIcon()}
                />
              )}

              {rideStateBelongsToCurrentUser && !isActiveShareRideMap && isDeliveryRide && routePath.length > 0 && (
                <Polyline path={routePath} options={buildNavigationRouteOptions(RIDE_MAP_DROPOFF_COLOR, 5)} />
              )}

              {/* Driver route polyline (real-time) */}
              {rideStateBelongsToCurrentUser && !isActiveShareRideMap && !hasPassengerBeenPickedUp && driverRoutePath.length > 0 && visibleRideStatus === 'driver-found' && (
                <Polyline
                  path={driverRoutePath}
                  options={{
                    ...buildNavigationRouteOptions(RIDE_MAP_DRIVER_COLOR, 4),
                    zIndex: 1000,
                  }}
                />
              )}

              {/* Passenger drop-off path follows the terminal route geometry. */}
              {!isActiveShareRideMap && isPrivateRideMap && privateRideTerminalRoutePath.length > 0 && (
                <Polyline path={privateRideTerminalRoutePath} options={buildNavigationRouteOptions(RIDE_MAP_DROPOFF_COLOR, 5)} />
              )}

              {/* Delivery drop-off path follows road directions. */}
              {rideStateBelongsToCurrentUser && !isActiveShareRideMap && isDeliveryRide && activeDestinationRoutePath.length > 0 && visibleRideStatus !== 'searching' && (
                <Polyline path={activeDestinationRoutePath} options={buildNavigationRouteOptions(RIDE_MAP_DROPOFF_COLOR, 5)} />
              )}

              {/* No straight-line fallback here on purpose. Passenger ride paths
                  follow the selected terminal geometry; delivery and driver
                  paths use DirectionsService. If source geometry is unavailable,
                  leave the route absent instead of drawing a misleading chord. */}

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

      {showMap && isMapsLoaded && isBookingPage && terminals.length > 1 && (
        <button
          type="button"
          onClick={() => setShowAllBookingTerminals(showAll => !showAll)}
          aria-pressed={!showAllBookingTerminals}
          aria-label={showAllBookingTerminals ? 'Hide other terminals' : 'Show all terminals'}
          title={showAllBookingTerminals ? 'Hide other terminals' : 'Show all terminals'}
          className="absolute right-4 z-[1200] flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-[var(--ink)] shadow-xl transition-transform active:scale-95"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8rem)' }}
        >
          {showAllBookingTerminals
            ? <EyeOff className="size-4 shrink-0" aria-hidden="true" />
            : <Eye className="size-4 shrink-0" aria-hidden="true" />}
          <span>{showAllBookingTerminals ? 'Hide other terminals' : 'Show all terminals'}</span>
        </button>
      )}

      {showMap && isMapsLoaded && !isBookingPage && (
        <button
          type="button"
          onClick={() => {
            const map = customerMapRef.current;
            if (!map || isLoadingLocation || locationProblem) return;
            const target = isActivePrivateRidePage
              ? driverLocation || pickupCoords || currentLocation
              : currentLocation;
            map.panTo(target);
            map.setZoom(15);
            setMapCenter(target);
          }}
          aria-label={isActivePrivateRidePage ? 'Re-center map on your ride' : 'Re-center map on my location'}
          title={isActivePrivateRidePage ? 'Re-center map on your ride' : 'Re-center map on my location'}
          disabled={isLoadingLocation || Boolean(locationProblem)}
          className={`absolute z-[1200] rounded-full shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${isActivePrivateRidePage
            ? 'left-1/2 -translate-x-1/2 inline-flex h-12 items-center gap-2 border border-[var(--primary)] bg-[var(--primary)] py-3 pl-3 pr-5 text-[var(--primary-foreground)] shadow-xl'
            : 'right-4 grid size-12 place-items-center border border-line bg-surface/95 text-[var(--primary)] backdrop-blur-sm'}`}
          style={isActivePrivateRidePage
            ? { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem + 15rem + 0.75rem)' }
            : { top: 'calc(env(safe-area-inset-top, 0px) + 11rem)' }}
        >
          <Navigation
            className={isActivePrivateRidePage ? 'size-5 text-[var(--primary-foreground)]' : 'size-5'}
            aria-hidden="true"
          />
          {isActivePrivateRidePage && (
            <span className="text-sm font-bold text-[var(--primary-foreground)]">Re-center</span>
          )}
        </button>
      )}

      {showMap && isActivePrivateRidePage && (
        <button
          type="button"
          onClick={() => navigate('/customer', { replace: true, state: { customerHomeTab: true } })}
          aria-label="Back to customer home"
          title="Back to customer home"
          className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-[1200] grid size-11 place-items-center rounded-full border border-line bg-surface/95 text-[var(--ink)] shadow-lg backdrop-blur-sm"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
      )}

      {/* Floating chat head, the same component the driver's ride screen uses.
          Opens the driver thread in the Messages tab, so both sides land in one
          conversation rather than two parallel ones. */}
      {/* Chat as an overlay rather than a page, so the map and the floating head
          stay behind it and no gap has to be reserved above the thread header. */}
      <RideChatOverlay
        open={rideStateBelongsToCurrentUser && customerChatPopup}
        conversationId={driverChatId.current}
        peerId={rideDriverId}
        currentUserId={user?.id ?? null}
        peerAvatar={rideDriverAvatar}
        peerName={activeRide?.driver || 'Driver'}
        senderRole="customer"
        onClose={() => setCustomerChatPopup(false)}
      />

      {/* Hidden while the panel is open, so the two heads cannot stack in the
          same corner. */}
      {rideStateBelongsToCurrentUser && chatHeadActivated && visibleRideStatus === 'driver-found' && visibleActiveRide && rideDriverId && (
        <FloatingChatHead
          headId={driverChatId.current || undefined}
          hidden={customerChatPopup}
          storageKey="trikeserve_chat_head_pos_customer"
          peerAvatar={rideDriverAvatar}
          peerLabel={activeRide.driver || 'Driver'}
          unread={driverUnread}
          pulseKey={chatPulseKey}
          opened={chatOpened}
          onOpen={openDriverChatThread}
        />
      )}

      {/* Resume a shared ride from the Home tab with the same floating shortcut
          used when the lobby is minimized. */}
      {rideBlocked && resumableShareLobbyId && !(rideStateBelongsToCurrentUser && showShareLobby) && !visibleActiveRide && visibleRideStatus !== 'searching' && bookingStep === 'home' && (
        <button
          type="button"
          onClick={() => {
            setActiveShareLobbyId(resumableShareLobbyId);
            setShareLobbyInitialId(resumableShareLobbyId);
            setBookingStep('home');
            setShowShareLobby(true);
          }}
          aria-label="Open your active Share Ride"
          title="Share Ride"
          className="fixed bottom-24 right-4 z-[2000] shadow-2xl transition-transform hover:scale-110"
        >
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] transition-all hover:bg-[var(--primary)]">
              <Users className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            {activeShareRidePassengerCount > 0 && (
              <div className="absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-[var(--primary)] bg-surface px-1">
                <span className="text-xs font-bold text-[var(--primary)]">
                  {activeShareRidePassengerCount}/{activeRideLobby?.max_seats || '—'}
                </span>
              </div>
            )}
            <div className="absolute inset-0 animate-ping rounded-full bg-[var(--primary)] opacity-20" aria-hidden="true" />
          </div>
        </button>
      )}

      {/* Private rides do not have a share-lobby shortcut, so keep their status
          note while preventing a second booking. */}
      {rideBlocked && !resumableShareLobbyId && !(rideStateBelongsToCurrentUser && showShareLobby) && !visibleActiveRide && visibleRideStatus !== 'searching' && bookingStep === 'home' && (
        <div className="relative z-[999] px-4 pt-3 pb-24">
          <Card className="mx-auto max-w-3xl bg-surface p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-[var(--primary-soft)]">
              <Navigation className="h-6 w-6 text-[var(--primary)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--ink)]">You&apos;re on a ride right now</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Finish this trip before booking another ride.
            </p>
          </Card>
        </div>
      )}

      {/* Unapproved businesses remain on the customer app with an inline status note. */}
      {showBookingFlow && bookingStep === 'home' && user?.role === 'business' && isAwaitingApproval(user.role, user.isVerified) && (
        <div className="relative z-[999] px-4 pt-3">
          <div className="rounded-2xl border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)] p-4">
            <p className="text-sm font-bold text-[var(--amber-ink)]">Business account pending approval</p>
            <p className="mt-1 text-xs text-[var(--amber-ink)]">
              You are using TrikeServe as a customer for now. A superadmin needs to verify your business account before you can open the business dashboard. Access will be enabled after approval; you do not need to register again.
            </p>
          </div>
        </div>
      )}

      {showBookingFlow && bookingStep === 'home' && user?.role === 'rider' && isAwaitingApproval(user.role, user.isVerified) && !driverApprovalModalDismissed && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/55 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="driver-approval-title" aria-describedby="driver-approval-description" className="relative w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl sm:p-7">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[var(--amber-soft)] text-[var(--amber-ink)]">
                  <Clock className="size-5" aria-hidden="true" />
                </div>
                <h2 id="driver-approval-title" className="min-w-0 text-lg font-extrabold leading-snug text-[var(--ink)]">Driver account pending approval</h2>
              </div>
              <button
                type="button"
                onClick={() => setDriverApprovalModalDismissed(true)}
                aria-label="Close approval notice"
                className="grid size-10 place-items-center rounded-xl text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div aria-hidden="true" className="mb-4 border-t border-line" />
            <p id="driver-approval-description" className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              You are using TrikeServe as a customer for now. A superadmin needs to verify your account before you can open the driver dashboard. You will get access as soon as it is approved. You do not need to register again.
            </p>
            <Button
              type="button"
              onClick={() => setDriverApprovalModalDismissed(true)}
              className="mt-6 min-h-11 w-full bg-[var(--primary)] font-bold text-[var(--primary-foreground)] hover:opacity-90"
            >
              Continue as customer
            </Button>
          </div>
        </div>
      )}

        {/* Hub â€” three layers in normal flow: the app bar, then "What do you
            need today?", then the recommended feed. None of them float over the
            content any more, which is what lets the feed scroll underneath the
            sticky bar. */}
        {showCustomerHomeHub && (
          <div className="relative z-[999] flex flex-1 flex-col pb-28">
            <CustomerHubHeader
              avatarUrl={user?.avatarUrl}
              userName={user?.name}
              userEmail={user?.email}
              unreadCount={unreadDeliveryNotifications}
              onOpenSearch={() => navigate('/customer/search', { state: {
                fallbackOrigin: !isLoadingLocation && !locationProblem ? currentLocation : null,
              } })}
            />

            <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6">
              {/* The original landing choice: a ride or a meal, one tap each.
                  The filter / search / terminal feed is what the app bar
                  search field opens now, so it lives on /customer/search. */}
              <CustomerServiceHub
                onBookRide={() => {
                  setSelectedVehicle(null);
                  setBookingStep('ride');
                  navigate('/customer/book-ride', {
                    state: selectedTerminalId ? { selectedPickupTerminalId: selectedTerminalId } : undefined,
                  });
                }}
                onOrderFood={() => navigate('/customer/food')}
                rideDisabled={!showBookingFlow}
              />
              <CustomerCartPreview />

              <RecommendedRestaurants
                fallbackOrigin={!isLoadingLocation && !locationProblem ? currentLocation : null}
              />
            </main>
          </div>
        )}

        {/* Booking flow â€” Steps 2 & 3: ride type first, then pickup and drop-off */}
        {showBookingFlow && bookingStep !== 'home' && (
          <>
            {!isRideOptionsBookingPage && (
              <div
                className="pointer-events-none absolute inset-0 z-[998] bg-black/25"
                aria-hidden="true"
              />
            )}
            <div className={isRideOptionsBookingPage
              ? "absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[999] mx-auto w-full max-w-3xl px-3 sm:px-5"
              : "absolute bottom-20 left-0 right-0 z-[999] mx-auto max-w-3xl px-4"}>
            <Card className={isRideOptionsBookingPage
              ? "max-h-[calc(100dvh-8rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] gap-0 overflow-y-auto rounded-3xl border border-line bg-[var(--background)] shadow-2xl"
              : "max-h-[calc(100vh-7rem)] gap-0 overflow-y-auto rounded-3xl bg-[var(--background)] shadow-2xl"}>
              {/* Step header â€” back control plus plain-language context */}
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-[var(--background)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    if (bookingStep === 'ride') {
                      if (isBookingPage) {
                        navigate('/customer', { state: { customerHomeTab: true } });
                      } else {
                        setBookingStep('home');
                      }
                    } else {
                      setBookingStep('ride');
                    }
                  }}
                  aria-label={bookingStep === 'ride' ? 'Back to Home' : 'Back to ride type'}
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
                      ? 'Share Ride (Sabay) or Private Ride (Pribado)'
                      : 'Piliin ang sakayan at pupuntahan'}
                  </p>
                </div>
              </div>
              <div className="bg-[var(--background)] px-5 pb-6 pt-5">
                {/* Step 2 â€” ride type: Sabay / Pribado */}
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
                    label="Share Ride"
                    filipino="Sabay"
                    description="May kasabay na ibang pasahero; hati sa pamasahe."
                    icon={UsersRound}
                  />
                  <ChoiceCard
                    selected={selectedVehicle === 'special'}
                    onSelect={() => {
                      setSelectedVehicle('special');
                      setPassengerCount(1);
                      setBookingStep('locations');
                    }}
                    label="Private Ride"
                    filipino="Pribado"
                    description="Buong tricycle para sa iyo at sa iyong mga kasama."
                    icon={TerminalIconGlyph}
                  />
                </div>
                </div>

                {/* Step 3 â€” pickup and drop-off, only after the ride type is chosen */}
                <div className={bookingStep === 'locations' ? '' : 'hidden'}>
                {/* Location Inputs */}
                <div className="mb-5 space-y-4">
                  {/* Pick up Location Label */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
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
                          {selectedTerminalId ? (terminals.find(t => t.id === selectedTerminalId)?.name || pickup || 'Pickup Location') : 'Select pickup route'}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {selectedTerminalId
                            ? [selectedTerminalBoundary.selectedRoute?.name, terminals.find(t => t.id === selectedTerminalId)?.boundary || pickupAddress || 'Terminal location'].filter(Boolean).join(' · ')
                            : 'Choose a route to limit drop-off choices'}
                        </p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </button>
                    </div>
                  </Card>
                  </div>

                  {/* Drop off Location Label */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                      Drop off location
                    </label>

                  {/* Destination */}
                  <Card 
                    className="p-3 border border-line shadow-sm cursor-pointer hover:border-[var(--primary)] transition-colors"
                    onClick={() => {
                      if (!selectedTerminalBoundary.terminal || (enforceBoundary && !selectedTerminalBoundary.displayRoad?.length)) {
                        setTerminalPickerWarning(missingSelectedRouteMessage);
                        setShowTerminalPicker(true);
                        return;
                      }
                      setTerminalPickerWarning(null);
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
                        {fareInfo.distanceKm != null && (
                          <p className="mt-1 text-xs font-semibold text-[var(--primary)]">
                            Approx. {formatKm(fareInfo.distanceKm)} km from pickup
                          </p>
                        )}
                        <p className="mt-1 text-xs font-medium text-[var(--info)]">{selectedRouteDropoffGuide}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </button>
                    </div>
                  </Card>
                  </div>
                </div>

                {/* Book Ride Button â€” stays visible but disabled until the ride is complete */}
                <Button
                  onClick={handleBookRide}
                  disabled={!selectedVehicle || !dropoff}
                  className="min-h-14 w-full flex-col rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white hover:bg-[var(--coral-dark)] disabled:bg-[var(--border)] disabled:text-[var(--muted-foreground)]"
                >
                  <span className="block">
                    {selectedVehicle
                      ? `Book this ride \u00B7 \u20B1${getPrice()}`
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


        {/* Active Ride Card - Driver Info over the map */}
        {rideStateBelongsToCurrentUser && visibleRideStatus === 'driver-found' && visibleActiveRide && (
          <>
            {/* Keep the status over the full-screen map, clear of the page header. */}
            <RideMapStatusBanner label="Live Tracking" />

            <div
              className="absolute left-0 right-0 z-[1100] p-3 animate-slide-up"
              style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
            >
              <ActiveRideDriverCard
                className="mx-auto max-w-xl"
                driverName={activeRide.driver}
                avatarUrl={rideDriverAvatar}
                onAvatarError={() => setRideDriverAvatar(null)}
                statusLabel={(isDeliveryRide ? DELIVERY_DRIVER_STATUS_LABELS : DRIVER_STATUS_LABELS)[driverLiveStatus]}
                plate={activeRide.plateNumber}
                rating={activeRide.rating}
                eta={activeRide.eta}
                pickup={!isDeliveryRide ? pickup : undefined}
                dropoff={dropoff}
                destinationEta={etaToDestination}
                fare={`${"\u20B1"}${Number(bookedFare ?? getPrice()).toFixed(2)}`}
                paymentLabel={String(paymentMethod || 'COD').toUpperCase() === 'COD' ? 'Cash' : paymentMethod}
                chatDisabled={openingChat}
                chatLabel={openingChat ? 'Opening...' : 'Chat'}
                onChat={handleOpenDriverChat}
                onCancel={currentRequestId && !currentRequestId.startsWith('lobby_') ? handleCancelRideClick : undefined}
              />
          </div>
          </>
        )}

        {/* Validation Error Popup */}
        {showValidationError && (
          <div className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">{"\u26A0\uFE0F"}</span>
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
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">{"\u26A0\uFE0F"}</span>
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

        {/* Not standing in a terminal. This is the BORDER gate: where the customer
            is right now, not where they want to go. */}
        {showOutOfBoundaryError && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">{"\u{1F4CD}"}</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--error)] mb-2">
                {selectedVehicle === 'special' ? 'Pickup outside terminal boundary' : "You're not at a terminal"}
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                {selectedVehicle === 'special'
                  ? `The pickup point must be inside ${selectedTerminalBoundary.terminal?.name || 'the selected terminal'}'s service area.`
                  : "Rides can only be booked from inside a terminal. You're currently outside every terminal's service area, so please move to one of our terminals and try again."}
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

        {/* Drop-off not on any terminal's route. This is the ROUTE gate, and it
            is a different problem from the border above: the customer may well
            be standing at a terminal, but the destination is somewhere a
            tricycle cannot be shown driving. */}
        {showOutsideRouteError && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">{"\u{1F6E3}\uFE0F"}</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--error)] mb-2">Drop-off outside selected route</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Your designated <strong>drop-off location</strong> is outside the selected route.
                Choose a point within the highlighted road corridor for that route.
              </p>

              <Button
                onClick={() => setShowOutsideRouteError(false)}
                className="w-full bg-[var(--error)] hover:bg-[var(--error)] text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}

        {/* Drop-off we could not locate.
            Refused rather than allowed through: with no coordinates there is
            nothing to compare against the terminals, and passing the booking
            would mean the boundary only applies when geocoding happens to
            succeed. */}
        {unresolvedDropoffError && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--amber-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">{"\u{1F4CD}"}</span>
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] mb-2">We couldn't locate that drop-off</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Before we can check whether your <strong>drop-off point</strong> is
                on the selected route we need to find it on the map.
                Tap the highlighted route, or try a more complete address.
              </p>

              <Button
                onClick={() => {
                  setUnresolvedDropoffError(false);
                  setActiveLocationInput('dropoff');
                  setPickerBoundaryWarning(null);
                  setLocationPreview(null);
                  setPredictions([]);
                  setSearchQuery('');
                  setShowLocationPicker(true);
                }}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold"
              >
                Choose on map
              </Button>
            </Card>
          </div>
        )}

        {terminalBoundaryCheckUnavailable && (
          <div className="fixed inset-0 bg-black/50 z-[2200] flex items-center justify-center p-4">
            <Card className="bg-surface p-8 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-[var(--amber-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-9 h-9 text-[var(--amber)]" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Couldn't verify terminal boundaries</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Check your connection and try booking again. The ride can't be booked until its pickup and drop-off are verified.
              </p>
              <Button
                onClick={() => setTerminalBoundaryCheckUnavailable(false)}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold"
              >
                Understood
              </Button>
            </Card>
          </div>
        )}


        {/* Ride Completed Popup */}
        {rideCompletedPopup && (
          completionPopupType === 'ride' ? (
            <RideModal
              labelledBy="customer-ride-completed-title"
              zIndexClassName="z-[2200]"
              contentClassName="border-2 border-[var(--success-soft)] p-5 text-center"
            >
                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-[var(--success-soft)]">
                  <Check className="size-8 text-[var(--success)]" aria-hidden="true" />
                </div>
                <h3 id="customer-ride-completed-title" className="mb-1 text-lg font-bold text-[var(--ink)]">
                  Ride Completed
                </h3>
                <p className="mb-4 text-sm text-[var(--muted-foreground)]">
                  Thank you for riding with TrikeServe!
                </p>
                {rideDriverId && (
                  <div className="mb-4 rounded-xl bg-[var(--muted)] p-3 text-left">
                    <div className="flex items-center gap-3">
                      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary)]">
                        {rideDriverAvatar ? (
                          <img
                            src={rideDriverAvatar}
                            alt={`${activeRide?.driver || 'Driver'}'s profile`}
                            className="size-full object-cover"
                            onError={() => setRideDriverAvatar(null)}
                          />
                        ) : (
                          getDriverInitials(activeRide?.driver)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Your driver</p>
                        <p className="truncate text-sm font-bold text-[var(--ink)]">{activeRide?.driver || 'Your driver'}</p>
                      </div>
                    </div>
                    {ratingSubmitted ? (
                      <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--success-soft)] p-2 text-sm font-semibold text-[var(--success)]">
                        <Check className="size-4 shrink-0" aria-hidden="true" />
                        Thank you! Your rating has been submitted.
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-center text-sm font-semibold text-[var(--ink)]">How was your ride?</p>
                        <div role="radiogroup" aria-label="Rate your driver" className="mt-1 flex justify-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              role="radio"
                              aria-label={`${star} out of 5 stars`}
                              aria-checked={selectedRating === star}
                              onClick={() => setSelectedRating(star)}
                              className="grid size-10 place-items-center rounded-lg transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                            >
                              <Star
                                className={`size-7 ${
                                  star <= selectedRating
                                    ? 'fill-[var(--amber)] text-[var(--amber)]'
                                    : 'fill-[var(--border)] text-[var(--border)]'
                                }`}
                                aria-hidden="true"
                              />
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            onClick={handleSubmitRating}
                            disabled={!selectedRating || ratingSubmitting}
                            className="h-11 w-full bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)] disabled:opacity-50"
                          >
                            {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                          </Button>
                          <Button
                            type="button"
                            onClick={finishRideCompletion}
                            className="h-11 w-full border-2 border-[var(--border)] bg-surface font-bold text-[var(--ink)]"
                          >
                            Done
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {(!rideDriverId || ratingSubmitted) && (
                  <Button
                    type="button"
                    onClick={finishRideCompletion}
                    className="w-full bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)]"
                  >
                    Done
                  </Button>
                )}
            </RideModal>
          ) : (
            <RideModal
              labelledBy="customer-delivery-completed-title"
              zIndexClassName="z-[2100]"
              contentClassName="p-6 text-center"
            >
                <div className="mx-auto max-w-sm text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--info-soft)]">
                    <Check className="size-8 text-[var(--info)]" aria-hidden="true" />
                  </div>
                  <h3 id="customer-delivery-completed-title" className="mb-2 text-2xl font-bold text-[var(--ink)]">Delivery Completed!</h3>
                  <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                    Thank you for using TrikeServe. Your delivery has been completed!
                  </p>

                  <div className="mb-0 grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        setRideCompletedPopup(false);
                        setRatingSubmitted(false);
                        setSelectedRating(0);
                        setShowRatingModal(true);
                        setCurrentRequestId(null);
                      }}
                      className="w-full border-2 border-[var(--info-soft)] bg-surface py-3 font-bold text-[var(--info)]"
                    >
                      Rate Restaurant
                    </Button>

                    <Button
                      onClick={finishRideCompletion}
                      className="w-full bg-[var(--info)] py-3 font-bold text-white hover:bg-[var(--info)]"
                    >
                      Done
                    </Button>
                  </div>
                </div>
            </RideModal>
          )
        )}

        {/* Leave a Rating Modal (private rides) */}
        {showRatingModal && (
          <RideModal
            labelledBy="customer-private-rating-title"
            zIndexClassName="z-[2400]"
            contentClassName="p-6 text-center"
          >
              {ratingSubmitted ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--success-soft)] flex items-center justify-center text-3xl">
                    <Check className="size-8 text-[var(--success)]" aria-hidden="true" />
                  </div>
                  <h3 id="customer-private-rating-title" className="text-xl font-bold text-[var(--ink)] mb-2">Thank you!</h3>
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
                      <h3 id="customer-private-rating-title" className="text-xl font-bold text-[var(--ink)] mb-2">Rate {deliveryBusiness.restaurantName}</h3>
                      <p className="text-sm text-[var(--muted-foreground)] mb-6">How was your order and delivery?</p>
                    </>
                  ) : (
                    <>
                      <h3 id="customer-private-rating-title" className="text-xl font-bold text-[var(--ink)] mb-2">Rate Your Driver</h3>
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
          </RideModal>
        )}

        {/* Driver Status Update Popup */}
        {/* âŒ REMOVED: Driver status popup that appeared at top of screen */}
        {/* This was showing status updates like "On the Way", "Arrived", etc. */}

      {/* Bottom Navigation */}
      <BottomNav active={!isBookingPage && bookingStep === 'home' ? "home" : undefined} messagesBadge={unreadMessagesCount} />

      {/* Terminal Picker Modal */}
      {showTerminalPicker && (
        <div className="fixed inset-0 z-[2000] bg-surface flex flex-col">
          <div className="bg-surface border-b-2 border-[var(--border)] px-4 py-4 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--ink)]">Select Pickup Route</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {terminalPickerDescription}
                </p>
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
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter pickup terminals">
              {([
                { id: "all", label: `All (${terminals.length})` },
                { id: "closest", label: "Closest" },
                { id: "frequent", label: `Often used${frequentlyUsedTerminalCount ? ` (${frequentlyUsedTerminalCount})` : ""}` },
                { id: "selected", label: "Selected" },
              ] as const).map(filter => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={terminalPickerFilter === filter.id}
                  onClick={() => setTerminalPickerFilter(filter.id)}
                  className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors ${
                    terminalPickerFilter === filter.id
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-line bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--primary)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {terminalPickerWarning && (
              <div role="alert" className="rounded-xl border border-[var(--error)] bg-[var(--error-soft)] px-3 py-2 text-sm font-semibold text-[var(--error)]">
                {terminalPickerWarning}
              </div>
            )}
            {terminals.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--muted-foreground)]">No terminals available</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Please try again later</p>
              </div>
            ) : terminalPickerOptions.length === 0 ? (
              <div role="status" className="py-12 text-center">
                <MapPin className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--muted-foreground)]">{terminalPickerEmptyMessage}</p>
                {terminalPickerFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setTerminalPickerFilter("all")}
                    className="mt-3 min-h-10 rounded-xl px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                  >
                    Show all terminals
                  </button>
                )}
              </div>
            ) : (
              terminalPickerOptions.map((terminal) => (
                <div
                  key={terminal.id}
                  onClick={() => {
                    setTerminalPickerWarning(null);
                    openRoutePreview(terminal.id);
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
                      {/*
                        No aria-label. `TerminalIconGlyph` is decorative unless a
                        caller labels it, and every row here was labelled "Pickup
                        terminal" -- so a screen reader heard that same phrase once
                        per terminal in the list and none of them named which one.
                        The terminal's name is the adjacent text, so the glyph has
                        nothing to add; it is left aria-hidden.
                      */}
                      <TerminalIconGlyph
                        size={22}
                        className={selectedTerminalId === terminal.id ? 'text-white' : 'text-[var(--primary)]'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-[var(--ink)]">{terminal.name}</p>
                        {selectedTerminalId === terminal.id && (
                          <span className="text-[10px] font-bold text-[var(--primary)] bg-[var(--primary-soft)] px-2 py-0.5 rounded-full">
                            SELECTED
                          </span>
                        )}
                        {nearestTerminal?.id === terminal.id && (
                          <span className="text-[10px] font-bold text-[var(--success)] bg-[var(--success-soft)] px-2 py-0.5 rounded-full">
                            NEAREST
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{terminal.boundary}</p>
                      <p className="text-xs text-[var(--info)] mt-1">Tap to preview routes</p>
                      {terminal.max_passengers != null && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                          Up to {terminal.max_passengers} on a shared ride
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {routePreviewTerminal && (
        <div className="fixed inset-0 z-[2100] flex flex-col bg-[var(--background)]" role="dialog" aria-modal="true" aria-label={`${routePreviewTerminal.name} routes`}>
          <header className="flex items-center justify-between gap-3 border-b border-line bg-[var(--surface)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">{routePreviewTerminal.name}</p>
              <h2 className="truncate text-lg font-bold text-[var(--ink)]">{routePreviewFocusedRoute?.name || 'Route preview'}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isMapsLoaded && (
                <button
                  type="button"
                  aria-expanded={showRoutePreviewList}
                  onClick={() => setShowRoutePreviewList(open => !open)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] shadow-sm"
                >
                  <RouteIcon className="size-4 text-[var(--primary)]" />
                  Routes
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary)]">
                    {routePreviewVisibleRouteIds.filter(id => routePreviewTerminalRoutes.some(route => route.id === id)).length}/{routePreviewTerminalRoutes.length}
                  </span>
                  <ChevronDown className={`size-4 transition-transform ${showRoutePreviewList ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRoutePreviewTerminalId(null);
                  setShowRoutePreviewList(false);
                  routePreviewMapRef.current = null;
                }}
                aria-label="Close terminal route"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                <X className="size-5" />
              </button>
            </div>
          </header>
          <div className="relative min-h-0 flex-1">
            {isMapsLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={routePreviewMapCenter}
                zoom={14}
                onLoad={(map: any) => {
                  routePreviewMapRef.current = map;
                  focusRoutePreview(routePreviewFocusRouteId, routePreviewTerminal.id, map);
                }}
                onUnmount={() => { routePreviewMapRef.current = null; }}
                options={{ gestureHandling: 'greedy', zoomControl: true, fullscreenControl: false, streetViewControl: false, mapTypeControl: false }}
              >
                <MapTypeToggle />
                <MarkerF
                  position={{ lat: routePreviewTerminal.center_lat, lng: routePreviewTerminal.center_lng }}
                  title={routePreviewTerminal.name}
                  icon={terminalMarkerIcon(routePreviewMarkerColor)}
                />
                {routePreviewArea && routePreviewVisibleTerminalIds.has(routePreviewTerminal.id) && (
                  <Polygon
                    path={routePreviewArea}
                    options={{ strokeColor: routePreviewBorderColor, strokeWeight: 2, fillColor: routePreviewBorderColor, fillOpacity: 0.12, clickable: false }}
                  />
                )}
                {routePreviewTerminalRoutes.map(route => {
                  if (!routePreviewVisibleRouteIds.includes(route.id)) return null;
                  const isFocused = route.id === routePreviewFocusRouteId;
                  return (
                    <Polyline
                      key={route.id}
                      path={route.points}
                      options={{
                        strokeColor: route.color,
                        strokeWeight: isFocused ? 7 : 5,
                        strokeOpacity: isFocused ? 0.95 : route.enabled ? 0.78 : 0.38,
                        clickable: false,
                        geodesic: true,
                      }}
                    />
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="grid h-full place-items-center bg-[var(--muted)] px-6 text-center text-sm text-[var(--muted-foreground)]">
                Loading terminal route map...
              </div>
            )}
            {isMapsLoaded && (
              <div className="absolute right-3 top-3 z-10 w-[min(22rem,calc(100vw_-_1.5rem))]">
                {showRoutePreviewList && (
                  <div className="max-h-[min(65vh,32rem)] overflow-hidden rounded-2xl border border-line bg-[var(--surface)] shadow-xl">
                    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3">
                      <div>
                        <p className="text-sm font-bold text-[var(--ink)]">{routePreviewTerminal.name} routes</p>
                        <p className="text-xs text-[var(--muted-foreground)]">View a route or hide it from the map.</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setRoutePreviewVisibleRouteIds(routePreviewTerminalRoutes.map(route => route.id));
                            focusAllRoutePreview();
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                        >
                          Show all
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoutePreviewVisibleRouteIds([])}
                          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          Hide all
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[calc(min(65vh,32rem)_-_4.5rem)] overflow-y-auto p-2">
                      {routePreviewTerminalRoutes.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-[var(--muted-foreground)]">No routes have been mapped for this terminal yet.</p>
                      ) : routePreviewTerminalRoutes.map(route => {
                        const visible = routePreviewVisibleRouteIds.includes(route.id);
                        const active = routePreviewFocusRouteId === route.id;
                        const routeColor = route.color;
                        return (
                          <div key={route.id} className={`flex items-center gap-2 rounded-xl p-2 ${active ? 'bg-[var(--primary-soft)]' : ''}`}>
                            <button
                              type="button"
                              onClick={() => selectRoutePreview(route.id)}
                              aria-current={active ? 'true' : undefined}
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
                            >
                              <span className="size-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: routeColor }} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[var(--ink)]">{route.name}</span>
                                <span className="block truncate text-xs text-[var(--muted-foreground)]">{route.enabled ? 'Enabled' : 'Disabled'}{active ? ' · Viewing' : ''}</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRoutePreviewVisibleRouteIds(current => (
                                current.includes(route.id)
                                  ? current.filter(id => id !== route.id)
                                  : [...current, route.id]
                              ))}
                              aria-label={`${visible ? 'Hide' : 'Show'} ${route.name}`}
                              aria-pressed={visible}
                              className="grid size-10 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                            >
                              {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="border-t border-line bg-[var(--surface)] p-4 pb-safe">
            {enforceBoundary && (!routePreviewSelectionRoute || !routePreviewSelectionRoute.enabled) && (
              <p role="alert" className="mb-3 rounded-xl border border-[var(--error)] bg-[var(--error-soft)] px-3 py-2 text-sm font-semibold text-[var(--error)]">
                {routePreviewSelectionRoute
                  ? `${routePreviewSelectionRoute.name} is disabled. Choose an enabled route to set your pickup.`
                  : `${routePreviewTerminal.name} has no enabled mapped route yet. Drop-off selection is unavailable until one is set.`}
              </p>
            )}
            {!enforceBoundary && !routePreviewSelectionRoute && (
              <p role="status" className="mb-3 rounded-xl border border-[var(--info-soft)] bg-[var(--info-soft)] px-3 py-2 text-sm text-[var(--info)]">
                No route is mapped for this terminal. You can still select it for pickup.
              </p>
            )}
            <Button
              type="button"
              disabled={enforceBoundary && (!routePreviewSelectionRoute || !routePreviewSelectionRoute.enabled)}
              className="min-h-12 w-full bg-[var(--primary)] font-bold text-[var(--primary-foreground)]"
              onClick={() => {
                selectTerminalRoute(routePreviewTerminal.id, routePreviewFocusRouteId);
              }}
            >
              {!enforceBoundary && !routePreviewSelectionRoute ? 'Select terminal' : 'Select route'}
            </Button>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-[var(--background)]">
          <header className="relative z-[2010] shrink-0 border-b border-line bg-[var(--card)] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-xl sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] font-semibold">
                  {activeLocationInput === 'pickup' ? 'Pickup \u2014 search or tap map' : 'Drop-off \u2014 search or tap map'}
                </p>
                <h2 className="text-lg font-bold text-[var(--ink)]">Find a nearby place or tap the map</h2>
              </div>
              <button
                type="button"
                aria-label="Close location picker"
                onClick={() => { setShowLocationPicker(false); setActiveLocationInput(null); setLocationPreview(null); setPredictions([]); setSearchQuery(""); setPickerBoundaryWarning(null); }}
              >
                <X className="w-6 h-6 text-[var(--error)]" />
              </button>
            </div>

            <div className="mt-3">
              {pickerBoundaryWarning && activeLocationInput === 'pickup' && (
                <div
                  role="alert"
                  className="mb-2 flex items-start gap-2 rounded-xl border-2 border-[var(--error)] bg-[var(--error-soft)] px-3 py-2 text-sm font-semibold text-[var(--error)]"
                >
                  <span aria-hidden="true">ðŸ“</span>
                  <span>{pickerBoundaryWarning}</span>
                </div>
              )}
              <Input
                value={searchQuery}
                onChange={(e) => { fetchPredictions((e.target as HTMLInputElement).value); }}
                placeholder={activeLocationInput === 'dropoff' && enforceBoundary ? 'Search for a place along the selected route...' : 'Search restaurants, parks, hotels, terminals...'}
                aria-label="Search for a place"
                className="text-[var(--ink)] placeholder:text-[var(--muted-foreground)]"
              />
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
          </header>

          <div className="relative min-h-0 flex-1">
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
                  gestureHandling: 'greedy',
                  zoomControl: true,
                  fullscreenControl: false,
                  streetViewControl: false,
                  mapTypeControl: false,
                }}
              >
                <MapTypeToggle />
                <MarkerF position={currentLocation} title="Current location" icon={createCurrentLocationIcon()} />

                {/* The terminal this pickup/drop-off belongs to. Without it the
                    two shapes below float on the map with nothing explaining whose
                    they are -- the customer sees a border and a road but has no way
                    to tell it is GTDL rather than any other. */}
                {pickerTerminal && (
                  <MarkerF
                    position={{ lat: pickerTerminal.center_lat, lng: pickerTerminal.center_lng }}
                    title={pickerTerminal.name}
                  icon={terminalMarkerIcon(pickerMarkerColor)}
                    zIndex={5}
                  />
                )}

                {/* The border: the area a customer must be standing in to book. */}
                {selectedTerminalBoundary.area && (
                  <Polygon
                    path={selectedTerminalBoundary.area}
                    options={{
                      fillColor: pickerBorderColor,
                      fillOpacity: 0.12,
                      strokeColor: pickerBorderColor,
                      strokeWeight: 2,
                      strokeOpacity: 0.6,
                      clickable: false,
                    }}
                  />
                )}

                {/* The route: the corridor a drop-off has to sit in. Drawn twice,
                    a wide translucent casing under a crisp line, so it reads as a
                    road the tricycle drives rather than a single thin stroke. */}
                {selectedTerminalBoundary.displayRoad && (
                  <Polyline
                    path={selectedTerminalBoundary.displayRoad}
                    options={{
                      strokeColor: pickerRouteColor,
                      strokeWeight: 9,
                      strokeOpacity: 0.25,
                      clickable: false,
                      geodesic: true,
                    }}
                  />
                )}
                {selectedTerminalBoundary.displayRoad && (
                  <Polyline
                    path={selectedTerminalBoundary.displayRoad}
                    options={{
                      strokeColor: pickerRouteColor,
                      strokeWeight: 4,
                      strokeOpacity: 0.95,
                      clickable: false,
                      geodesic: true,
                    }}
                  />
                )}
                {locationPreview && (
                  <MarkerF
                    position={{ lat: locationPreview.lat, lng: locationPreview.lng }}
                    title={activeLocationInput === 'pickup' ? 'Pickup preview' : 'Drop-off preview'}
                    icon={activeLocationInput === 'pickup' ? terminalMarkerIcon(pickerMarkerColor) : createDropoffMarkerIcon()}
                  />
                )}
              </GoogleMap>
            )}

            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
              {activeLocationInput === 'dropoff'
                ? selectedTerminalBoundary.displayRoad
                  ? `Tap within ${Math.round(normalizeRoadWidth(selectedTerminalBoundary.routeWidthM) / 2)} m of the highlighted route`
                  : 'Select a route before choosing a drop-off'
                : selectedTerminalBoundary.area
                  ? 'Tap inside the shaded terminal area to set pickup'
                  : 'Tap map to pin pickup'}
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

          {pickerBoundaryWarning && activeLocationInput === 'dropoff' && (
            <div
              className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="dropoff-route-validation-title"
              aria-describedby="dropoff-route-validation-message"
            >
              <Card className="w-full max-w-sm bg-surface p-6 text-center shadow-xl">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--error-soft)] text-[var(--error)]">
                  <MapPin className="size-7" aria-hidden="true" />
                </div>
                <h2 id="dropoff-route-validation-title" className="mb-2 text-lg font-bold text-[var(--ink)]">
                  Choose another drop-off
                </h2>
                <p id="dropoff-route-validation-message" className="mb-5 text-sm text-[var(--muted-foreground)]">
                  {pickerBoundaryWarning}
                </p>
                <Button
                  type="button"
                  onClick={() => setPickerBoundaryWarning(null)}
                  className="w-full bg-[var(--primary)] font-bold text-[var(--primary-foreground)]"
                >
                  Try another location
                </Button>
              </Card>
            </div>
          )}

         </div>
       )}

      {/* Passenger Count Modal (for Share Rides) */}
      {activeShareLobbyPromptId && (
        <div
          className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/55 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="active-share-lobby-title"
          aria-describedby="active-share-lobby-description"
        >
          <Card className="w-full max-w-sm bg-surface p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <UsersRound className="size-7" aria-hidden="true" />
            </div>
            <h2 id="active-share-lobby-title" className="mb-2 text-lg font-bold text-[var(--ink)]">
              You&apos;re already in a Share Ride lobby
            </h2>
            <p id="active-share-lobby-description" className="mb-5 text-sm text-[var(--muted-foreground)]">
              Open your current lobby to continue waiting. You can only be in one active lobby at a time.
            </p>
            <div className="grid gap-2">
              <Button
                type="button"
                className="w-full bg-[var(--primary)] text-white"
                onClick={() => {
                  const lobbyId = activeShareLobbyPromptId;
                  setActiveShareLobbyPromptId(null);
                  setActiveShareLobbyId(lobbyId);
                  setShareLobbyInitialId(lobbyId);
                  setBookingStep('home');
                  setShowShareLobby(true);
                  try {
                    if (activeShareLobbyStorageKey) {
                      localStorage.setItem(activeShareLobbyStorageKey, lobbyId);
                    }
                  } catch {
                    // Storage is only a resume hint; the lobby can still open.
                  }
                }}
              >
                Open current lobby
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setActiveShareLobbyPromptId(null)}
              >
                Not now
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showPassengerCount && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-surface w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">How many passengers?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">Select the number of seats you need for this trip.</p>

            {/*
              Passenger Count Selection.

              The seat list is however many this terminal allows, which is usually
              four, so the grid is sized for four rather than the old fixed three --
              `grid-cols-3` left the fourth seat alone on a row of its own, which
              read as a different kind of option to the other three.
            */}
            <div className={`grid gap-3 mb-6 ${selectedVehicle === 'special' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
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
                        <span className="font-bold text-lg text-[var(--ink)]">{count}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {count === 1 ? 'passenger' : 'passengers'}
                        </span>
                      </div>
                    </button>
                  ))
                : seatChoices.map(count => (
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
                  <p className="text-xs text-[var(--amber-ink)] uppercase tracking-widest font-semibold">Your Total for {passengerCount} {passengerCount === 1 ? 'seat' : 'seats'}</p>
                  {selectedVehicle === 'share' ? (
                    <>
                      <p className="text-sm text-[var(--amber-ink)] mt-0.5">
                        ₱{shareFarePerSeat} per passenger × {passengerCount}
                      </p>
                      {/* Show the total cost for all seats while keeping the per-person rate above. */}
                      <p className="text-3xl font-bold text-[var(--amber-ink)]">₱{shareFareForParty}</p>
                      <p className="text-[10px] text-[var(--amber-ink)] mt-0.5">{shareFareBreakdown}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--amber-ink)] mt-0.5">{privateBreakdown}</p>
                      <p className="text-3xl font-bold text-[var(--amber-ink)]">{"\u20B1"}{privateTotal}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Info Card - Only show for Share Rides */}
            {selectedVehicle !== 'special' && (
              <div className="bg-[var(--info-soft)] border border-[var(--info-soft)] rounded-lg p-3 mb-6">
                <p className="text-xs text-[var(--info)]">
                  {"\u{1F4A1}"} <span className="font-semibold">Tip:</span> You'll join a shared lobby and wait for other passengers heading the same route. More passengers = faster match!
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
          <div className="bg-surface w-full rounded-t-3xl p-5">
            <h2 className="text-2xl font-bold text-[var(--ink)] mb-4">Confirm Booking</h2>

            {/* Trip Details */}
            <div className="space-y-3 mb-4">
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
            <div className="bg-[var(--primary-soft)] border-2 border-[var(--primary)] rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--background)]">
                    {selectedVehicle === 'share'
                      ? <UsersRound className="size-6 text-[var(--primary)]" aria-hidden="true" />
                      : <TerminalIconGlyph className="size-6 text-[var(--primary)]" aria-hidden="true" />}
                  </span>
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {selectedVehicle === 'share' ? 'Share Ride' : 'Private Ride'}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {selectedVehicle === 'share' ? `₱${shareFarePerSeat} per passenger · ride with others` : 'Your group gets the whole tricycle'}
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[var(--primary)]">{"\u20B1"}{getPrice()}</p>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-[var(--muted-foreground)] mb-2">Payment Method</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="p-3 border-2 rounded-xl border-[var(--primary)] bg-[var(--primary-soft)]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl">{"\u{1F4B5}"}</span>
                    <span className="font-semibold text-[var(--ink)]">Cash</span>
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

      {/* Map-first private ride search card */}
      {rideStateBelongsToCurrentUser && visibleRideStatus === 'searching' && !isSearchMinimized && (
        <div
          className="fixed inset-x-0 z-[1100] px-3 animate-slide-up"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          <RideSurfaceCard className="mx-auto max-h-[calc(100dvh-8rem)] w-full max-w-xl gap-0 overflow-y-auto rounded-2xl border-2 border-[var(--primary)] bg-surface p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] animate-pulse">
                <Search className="size-6 text-[var(--primary)]" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-base font-bold text-[var(--ink)]">Finding a driver</h3>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
                    <span className="size-1.5 animate-pulse rounded-full bg-[var(--primary)]" aria-hidden="true" />
                    Searching
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Looking for a nearby driver</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Elapsed</p>
                <p className="text-lg font-bold tabular-nums text-[var(--primary)]" aria-live="polite">{searchingTime}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchMinimized(true)}
                aria-label="Minimize driver search"
                title="Minimize"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)]"
              >
                <ChevronDown className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4 space-y-3 rounded-xl bg-[var(--muted)] p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--ink-solid)] text-[10px] font-bold text-white">A</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Pickup</p>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{pickupAddress || pickup || 'Pickup location'}</p>
                </div>
              </div>
              <div className="ml-3 h-3 border-l border-dashed border-[var(--border)]" aria-hidden="true" />
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">B</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Drop-off</p>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{dropoffAddress || dropoff || 'Drop-off location'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Fare</p>
                <p className="text-xl font-bold text-[var(--primary)]">{"\u20B1"}{Number(bookedFare ?? getPrice()).toFixed(2)}</p>
                <p className="text-[10px] text-[var(--muted-foreground)]">{String(paymentMethod || 'COD').toUpperCase() === 'COD' ? 'Cash' : paymentMethod}</p>
              </div>
              <Button
                type="button"
                onClick={handleCancelRideClick}
                variant="outline"
                className="h-11 border-[var(--error)] px-4 font-bold text-[var(--error)] hover:bg-[var(--error-soft)]"
              >
                Cancel Request
              </Button>
            </div>
          </RideSurfaceCard>
        </div>
      )}

      {/* Minimized Floating Icon */}
      {rideStateBelongsToCurrentUser && visibleRideStatus === 'searching' && isSearchMinimized && (
        <button
          type="button"
          onClick={() => setIsSearchMinimized(false)}
          aria-label={`Reopen driver search. Elapsed ${searchingTime}`}
          title="Reopen driver search"
          className="fixed right-4 z-[2000] flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)] shadow-2xl transition-all hover:scale-110 hover:bg-[var(--primary)]"
          style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        >
          <div className="relative">
            <Search className="size-8 text-white animate-pulse" aria-hidden="true" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--success)] rounded-full animate-ping"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--success)] rounded-full"></div>
          </div>
          {/* The wait keeps running while the dialog is minimised. Hiding it would
              mean minimising is what makes the customer stop being told how long
              they have been waiting. */}
          <span className="absolute -bottom-1 -right-2 bg-surface text-[var(--ink)] text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow tabular-nums">
            {searchingTime}
          </span>
        </button>
      )}

      {/* Browse Available Lobbies Modal */}
      {showLobbyList && (
        <BrowseAvailableLobbies
          /*
           * Name and address are handed over separately, on purpose.
           *
           * These used to be collapsed into `pickupAddress || pickup`, which
           * silently threw the terminal's name away and left the browse screen
           * matching lobbies against its boundary text instead -- so it found
           * no route match and showed "No lobbies available" no matter what was
           * waiting. The terminal id goes too: it is the only unambiguous way to
           * say two people are leaving the same place, since two terminals
           * ("GTDL TODA TERMINAL" and "IN TODA TERMINAL") share the boundary
           * "Marulas".
           */
          pickup={pickup}
          pickupAddress={pickupAddress}
          pickupCoords={pickupCoords}
          terminalId={selectedTerminalId}
          routePoints={selectedTerminalBoundary.displayRoad}
          routeWidthM={selectedTerminalBoundary.routeWidthM}
          dropoff={dropoff}
          dropoffAddress={dropoffAddress}
          dropoffCoords={dropoffCoords}
          rates={activeRates}
          onLobbyJoined={(lobbyId) => {
            setActiveShareLobbyId(lobbyId);
            setShareLobbyInitialId(lobbyId);
            setShowLobbyList(false);
            setBookingStep('home');
            setShowShareLobby(true);
            // Remember the active lobby so the customer can return after leaving.
            if (activeShareLobbyStorageKey) {
              localStorage.setItem(activeShareLobbyStorageKey, lobbyId);
            }
          }}
          onClose={() => {
            setShowLobbyList(false);
          }}
        />
      )}

      {/* Keep the customer home mounted below the translucent lobby loader. */}
      {showShareLobby && rideStateBelongsToCurrentUser && (
        <ShareRideLobby
          lobbyId={shareLobbyInitialId}
          pickup={pickup}
          pickupAddress={pickupAddress}
          dropoff={dropoff}
          dropoffAddress={dropoffAddress}
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          passengerCount={passengerCount}
          maxPassengersAllowed={terminalSeatLimit}
          pricePerSeat={shareFarePerSeat}
          paymentMethod={paymentMethod}
          selectedTerminalId={activeRideLobby?.terminal_id || selectedTerminalId}
          terminalCoords={shareRideTerminalPickup}
          selectedRouteId={selectedTerminalBoundary.selectedRoute?.id || null}
          routePoints={selectedTerminalBoundary.displayRoad}
          routeWidthM={selectedTerminalBoundary.routeWidthM}
          presentation="page"
          onLobbyLoaded={rememberActiveShareLobby}
          onDriverFound={rememberActiveShareLobby}
          onLobbyMoved={rememberActiveShareLobby}
          onClose={closeShareLobby}
        />
      )}


      {/* Driver Status Update Popup */}
      {rideStateBelongsToCurrentUser && showCustomerPaymentModal && !showShareLobby && !isDeliveryRide && (
        <RideModal labelledBy="customer-payment-title" zIndexClassName="z-[3600]" contentClassName="text-left sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary)]">
                {rideDriverAvatar ? (
                  <img
                    src={rideDriverAvatar}
                    alt={`${activeRide?.driver || 'Driver'}'s profile`}
                    className="size-full object-cover"
                    onError={() => setRideDriverAvatar(null)}
                  />
                ) : (
                  getDriverInitials(activeRide?.driver)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="customer-payment-title" className="text-lg font-bold leading-6 text-[var(--ink)]">
                  Payment to {activeRide?.driver || 'your driver'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">
                  {paymentMethod === 'COD'
                    ? 'Pay your fare at drop-off to complete the ride.'
                    : 'This ride was prepaid. The driver will complete it shortly.'}
                </p>
              </div>
            </div>
            <div className="mb-4 space-y-3 rounded-xl bg-[var(--muted)] p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted-foreground)]">Ride fare</span>
                <strong className="text-lg text-[var(--primary)]">₱{Number(bookedFare ?? getPrice()).toFixed(2)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <span className="text-sm text-[var(--muted-foreground)]">Payment method</span>
                <strong className="text-sm text-[var(--ink)]">{paymentMethod === 'COD' ? 'Cash to driver' : 'Prepaid'}</strong>
              </div>
            </div>
            <Button onClick={dismissCustomerPaymentModal} className="h-12 w-full bg-[var(--primary)] text-white">
              Got it
            </Button>
        </RideModal>
      )}

      {privateRideAssignmentPopup?.requestId === currentRequestId ? (
        <RideModal labelledBy="customer-driver-assigned-title" zIndexClassName="z-[11000]" contentClassName="p-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <TerminalIconGlyph className="size-8" aria-hidden="true" />
          </div>
          <h2 id="customer-driver-assigned-title" className="mb-2 text-xl font-bold text-[var(--ink)]">
            Driver assigned!
          </h2>
          <p className="mb-5 text-sm text-[var(--muted-foreground)]">
            {privateRideAssignmentPopup.message}
          </p>
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-[var(--muted)] p-3 text-left">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)] text-sm font-bold text-white">
              {rideDriverAvatar ? (
                <img
                  src={rideDriverAvatar}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setRideDriverAvatar(null)}
                />
              ) : (
                getDriverInitials(activeRide?.driver)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted-foreground)]">Your driver</p>
              <p className="truncate font-bold text-[var(--ink)]">{activeRide?.driver || 'Driver'}</p>
              {activeRide?.plateNumber && (
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  Plate: {activeRide.plateNumber}
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() => {
              if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
              driverStatusTimerRef.current = null;
              const requestId = privateRideAssignmentPopup?.requestId;
              if (requestId) {
                acknowledgedPrivateRideAssignmentsRef.current.add(requestId);
                try {
                  localStorage.setItem(privateRideAssignmentAcknowledgementKey(requestId), '1');
                } catch {
                  // The in-memory acknowledgement still prevents repeat polling from reopening it.
                }
              }
              setPrivateRideAssignmentPopup(null);
            }}
            className="w-full bg-[var(--primary)] text-white"
          >
            Got it
          </Button>
        </RideModal>
      ) : driverStatusPopup && (
        <RideStatusModal
          titleId="private-ride-status-title"
          zIndexClassName="z-[3000]"
          title={
            driverStatusPopup.status === 'cancelled' ? 'Ride Cancelled'
              : driverStatusPopup.status === 'on-the-way' ? 'Driver On The Way'
                : driverStatusPopup.status === 'arrived' ? 'Driver Arrived'
                  : driverStatusPopup.status === 'pickup' ? 'Picked Up!'
                    : driverStatusPopup.status === 'drop-off' ? 'Arrived at Destination'
                      : driverStatusPopup.status === 'payment' ? 'Complete Payment'
                        : 'Ride Completed!'
          }
          statusLabel={
            driverStatusPopup.status === 'cancelled' ? 'Cancelled'
              : driverStatusPopup.status === 'on-the-way' ? 'On the way'
                : driverStatusPopup.status === 'arrived' ? 'Arrived'
                  : driverStatusPopup.status === 'pickup' ? 'Picked up'
                    : driverStatusPopup.status === 'drop-off' ? 'At destination'
                      : driverStatusPopup.status === 'payment' ? 'Payment pending'
                        : 'Completed'
          }
          message={driverStatusPopup.message}
          icon={<DriverStatusIcon status={driverStatusPopup.status} className="size-8 text-white" />}
          onDismiss={() => setDriverStatusPopup(null)}
        />
       )}

      {/* Cancel Ride Popup â€” asks for a reason before dropping the ride */}
      <ReasonPromptModal
        isOpen={rideStateBelongsToCurrentUser && showCancelConfirm && cancelRequiresReason}
        title={visibleRideStatus === 'driver-found' ? 'Cancel this ride? / Kanselahin ang biyahe?' : 'Cancel Request? / Kanselahin ang request?'}
        description={
          visibleRideStatus === 'driver-found'
            ? 'A driver is already on the way. Let them know why you need to cancel so they are told to stop.'
            : 'Are you sure you want to cancel this ride request?'
        }
        confirmLabel={visibleRideStatus === 'driver-found' ? 'Yes, Cancel Ride' : 'Yes, Cancel'}
        placeholder="e.g. Changed my mind, found another ride, wrong pickup pointâ€¦"
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
