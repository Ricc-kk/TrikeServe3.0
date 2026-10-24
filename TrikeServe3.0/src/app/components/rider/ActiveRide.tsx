import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { Navigation, MapPin, CheckCircle, Users, User, X, MessageSquare, Flag, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer, Polyline } from "@react-google-maps/api";
import MapTypeToggle from "../ui/MapTypeToggle";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import FloatingChatHead from "../ui/FloatingChatHead";
import { useRideResume } from "../../../lib/rideResume";
import RideChatOverlay from "../rider/RideChatOverlay";
import { Badge } from "../ui/badge";
import { OrderStatusUpdates } from "../ui/OrderStatusUpdates";
import LocationBanner, { type LocationProblem } from "../ui/LocationBanner";
import ProofCapture from "../ui/ProofCapture";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import StoreLogo from "../figma/StoreLogo";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, logAudit, isPointOnRoadCorridor } from "@/lib/supabase";
import { readRiderActiveRide, writeRiderActiveRide, clearRiderActiveRide, fetchRiderActiveRide } from "../../../lib/riderActiveRide";
import { supabase } from "../../../utils/supabase";
import useMapLoader from "@/lib/mapLoader";
import { createCustomerMarkerIcon, createRestaurantMarkerIcon } from "@/lib/mapIcons";
import { legacyRouteFromBoundary, normalizeTerminalRoutes, type TerminalRoute } from "@/lib/terminalRoutes";
import PassengerMessagingDB from "./PassengerMessagingDB";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import { useDevModeOverride } from "../../hooks/useDevModeSettings";

type RideStatus = 'on-the-way' | 'arrived' | 'pickup' | 'drop-off' | 'payment';

const RIDER_REPORT_CATEGORIES = [
  'Passenger behavior',
  'Safety concern',
  'Fare or payment issue',
  'Route or navigation issue',
  'Vehicle or road issue',
  'Other',
];
const DELIVERY_REPORT_CATEGORIES = [
  'Customer behavior',
  'Safety concern',
  'Order or handoff issue',
  'Route or navigation issue',
  'Vehicle or road issue',
  'Other',
];

const passengerAccountId = (id: unknown): string => {
  const passengerId = String(id ?? '');
  const companionMarker = passengerId.indexOf('_companion_');
  return companionMarker < 0 ? passengerId : passengerId.slice(0, companionMarker);
};

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
  businessUserId?: string;
  restaurantName?: string;
  restaurantImage?: string;
  restaurantAddress?: string;
  restaurantSubtitle?: string;
  restaurantCuisine?: string;
  restaurantDeliveryTime?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  lobbyId?: string;
  terminalId?: string | null;
  selectedRouteId?: string | null;
  passengerDetails?: any[];
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance in metres between two coordinates.
const distanceInMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const earthRadius = 6371e3;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

// GPS fixes wobble by several metres even when the driver is parked, and each of
// those wobbles used to re-centre the map and republish the position to customers.
// Anything under this threshold is ignored. At the zoom this screen uses, 8 m is
// less than two pixels, so real movement still tracks while jitter disappears.
const MIN_LOCATION_DELTA_METERS = 8;

// Zoom the map opens at. The driver chooses their own zoom after that: re-centring
// deliberately does NOT reset it, so snapping back to the tricycle never yanks the
// view out of the detail level they picked.
const INITIAL_MAP_ZOOM = 15;

// Below this speed a device compass heading is meaningless -- a parked phone keeps
// reporting whichever way it happens to be lying -- so it is not used for rotation.
const MIN_HEADING_SPEED_MPS = 1.5;

// Distance the driver must cover before a derived bearing is trusted. Two fixes a
// metre apart sit at an arbitrary angle to each other, and rotating the map to that
// would make it spin on the spot.
const MIN_HEADING_BASELINE_METERS = 10;

const SHARED_DROPOFF_COLORS = [
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#EA580C', // orange
  '#0891B2', // cyan
  '#A16207', // amber
];

const SILENT_LOBBY_STATUS_MESSAGE = '__silent__';

type RideCoordinate = { lat: number; lng: number };

interface SharedDropoffStop {
  id: string;
  name: string;
  color: string;
  position: RideCoordinate;
}

interface SharedDropoffRoute extends SharedDropoffStop {
  path: RideCoordinate[];
}

function coordinateFromValues(latValue: unknown, lngValue: unknown): RideCoordinate | null {
  if (latValue == null || lngValue == null || latValue === '' || lngValue === '') return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

function getSharedDropoffStops(ride: ActiveRideData | null): SharedDropoffStop[] {
  if (!ride || (ride.type !== 'shared' && !ride.lobbyId)) return [];

  const passengers = Array.isArray(ride.passengerDetails) ? ride.passengerDetails : [];
  const primaryDropoff = coordinateFromValues(ride.dropoffLat, ride.dropoffLng);
  const pickup = coordinateFromValues(ride.pickupLat, ride.pickupLng);
  const passengerStops = passengers.flatMap((passenger: any, index: number) => {
    if (['dropped-off', 'completed'].includes(String(passenger?.dropoff_status || passenger?.dropoffStatus || '').toLowerCase())) {
      return [];
    }
    const passengerId = passenger?.id == null ? '' : String(passenger.id);
    const isPrimaryPassenger = passengerId && ride.customerId
      ? passengerAccountId(passengerId) === String(ride.customerId)
      : passengers.length === 1 || (!passengerId && index === 0);
    const position = coordinateFromValues(
      passenger?.dropoffLat ?? passenger?.dropoff_lat,
      passenger?.dropoffLng ?? passenger?.dropoff_lng,
    ) || (isPrimaryPassenger ? primaryDropoff : null);
    if (!position) return [];

    return [{
      id: passengerId || `passenger-${index}`,
      name: getSharedPassengerName(passenger, index, passengers),
      color: SHARED_DROPOFF_COLORS[index % SHARED_DROPOFF_COLORS.length],
      position,
      index,
    }];
  });

  // Older active ride records may not include passengerDetails. The lobby row's
  // own destination still lets that single passenger's stop render.
  if (passengerStops.length === 0 && passengers.length === 0 && primaryDropoff) {
    return [{
      id: String(ride.customerId || ride.id),
      name: firstNameOnly(ride.customerName) || 'Passenger',
      color: SHARED_DROPOFF_COLORS[0],
      position: primaryDropoff,
    }];
  }

  return passengerStops
    .sort((a, b) => {
      if (!pickup) return a.index - b.index;
      return distanceInMeters(pickup, a.position) - distanceInMeters(pickup, b.position) || a.index - b.index;
    })
    .map(stop => ({ id: stop.id, name: stop.name, color: stop.color, position: stop.position }));
}

function getSharedPassengerName(passenger: any, index: number, passengers: any[]): string {
  const passengerId = String(passenger?.id ?? '');
  const ownerId = passengerAccountId(passengerId);
  const companionOwner = passengerId.includes('_companion_')
    ? passengers.find(candidate => String(candidate?.id || '') === ownerId)
    : null;
  const passengerName = firstNameOnly(passenger?.name) || `Passenger ${index + 1}`;
  return companionOwner?.name
    ? `${passengerName} of ${firstNameOnly(companionOwner.name)}`
    : passengerName;
}

function firstNameOnly(name: unknown): string {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function getSharedPassengerDropoff(passenger: any, index: number, ride: ActiveRideData): string {
  const passengers = Array.isArray(ride.passengerDetails) ? ride.passengerDetails : [];
  const passengerId = String(passenger?.id ?? '');
  const ownerId = passengerAccountId(passengerId);
  const companionOwner = passengerId.includes('_companion_')
    ? passengers.find(candidate => String(candidate?.id || '') === ownerId)
    : null;
  const passengerDropoff = passenger?.dropoff || passenger?.dropoffAddress || passenger?.dropoff_location || passenger?.dropoff_address;
  const companionDropoff = companionOwner?.dropoff || companionOwner?.dropoffAddress || companionOwner?.dropoff_location || companionOwner?.dropoff_address;
  if (passengerDropoff || companionDropoff) return String(passengerDropoff || companionDropoff).trim();

  const isPrimaryPassenger = ride.customerId
    ? ownerId === String(ride.customerId)
    : index === 0;
  return isPrimaryPassenger
    ? String(ride.dropoffAddress || ride.dropoff || 'Drop-off unavailable').trim()
    : 'Drop-off unavailable';
}

function decodeRoutePolyline(encoded: string): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

interface RouteProjection {
  point: RideCoordinate;
  distanceAlong: number;
  distanceFromRoute: number;
}

function interpolateCoordinate(a: RideCoordinate, b: RideCoordinate, fraction: number): RideCoordinate {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction,
  };
}

function cumulativePathDistances(path: RideCoordinate[]): number[] {
  const distances = [0];
  for (let index = 1; index < path.length; index++) {
    distances.push(distances[index - 1] + distanceInMeters(path[index - 1], path[index]));
  }
  return distances;
}

/** Snap a point to the closest plotted terminal-road segment. */
function projectOntoRoute(point: RideCoordinate, path: RideCoordinate[]): RouteProjection | null {
  if (path.length < 2) return null;
  const cumulative = cumulativePathDistances(path);
  let closest: RouteProjection | null = null;
  const longitudeScale = Math.cos(toRadians(point.lat));

  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    const ax = start.lng * longitudeScale;
    const ay = start.lat;
    const bx = end.lng * longitudeScale;
    const by = end.lat;
    const px = point.lng * longitudeScale;
    const py = point.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
      : 0;
    const projected = interpolateCoordinate(start, end, fraction);
    const fromRoute = distanceInMeters(point, projected);
    if (closest && fromRoute >= closest.distanceFromRoute) continue;

    closest = {
      point: projected,
      distanceAlong: cumulative[index - 1] + distanceInMeters(start, projected),
      distanceFromRoute: fromRoute,
    };
  }
  return closest;
}

function routeSlice(path: RideCoordinate[], startDistance: number, endDistance: number): RideCoordinate[] {
  if (path.length < 2) return [...path];
  const cumulative = cumulativePathDistances(path);
  const totalDistance = cumulative[cumulative.length - 1];
  const start = Math.max(0, Math.min(totalDistance, startDistance));
  const end = Math.max(0, Math.min(totalDistance, endDistance));
  if (Math.abs(end - start) < 0.01) return [pointAtRouteDistance(path, cumulative, start)];
  if (end < start) return routeSlice(path, end, start).reverse();

  const result = [pointAtRouteDistance(path, cumulative, start)];
  for (let index = 1; index < path.length - 1; index++) {
    if (cumulative[index] > start && cumulative[index] < end) result.push(path[index]);
  }
  result.push(pointAtRouteDistance(path, cumulative, end));
  return result;
}

function pointAtRouteDistance(
  path: RideCoordinate[],
  cumulative: number[],
  distance: number,
): RideCoordinate {
  if (distance <= 0) return path[0];
  const lastIndex = path.length - 1;
  if (distance >= cumulative[lastIndex]) return path[lastIndex];
  for (let index = 1; index < path.length; index++) {
    if (distance > cumulative[index]) continue;
    const segmentDistance = cumulative[index] - cumulative[index - 1];
    const fraction = segmentDistance > 0 ? (distance - cumulative[index - 1]) / segmentDistance : 0;
    return interpolateCoordinate(path[index - 1], path[index], fraction);
  }
  return path[lastIndex];
}

/**
 * Draw the shared itinerary on the selected terminal road. Destinations are
 * snapped to that road and ordered by their progress along it; no routing API is
 * asked to replace the selected road with its fastest alternative.
 */
function buildSharedDropoffRoutes(
  pickup: RideCoordinate,
  stops: SharedDropoffStop[],
  selectedRoute: TerminalRoute | null,
): SharedDropoffRoute[] {
  const routePoints = selectedRoute?.points || [];
  if (routePoints.length < 2 || stops.length === 0) return [];

  const buildDirection = (path: RideCoordinate[]) => {
    const cumulative = cumulativePathDistances(path);
    const totalDistance = cumulative[cumulative.length - 1];
    const pickupProjection = projectOntoRoute(pickup, path);
    if (!pickupProjection) return null;

    const turnaroundTravel = totalDistance - pickupProjection.distanceAlong;
    const visits = stops.flatMap((stop, index) => {
      const projection = projectOntoRoute(stop.position, path);
      if (!projection) return [];
      const travelDistance = projection.distanceAlong >= pickupProjection.distanceAlong
        ? projection.distanceAlong - pickupProjection.distanceAlong
        : turnaroundTravel + totalDistance - projection.distanceAlong;
      return [{ stop, index, projection, travelDistance }];
    }).sort((a, b) => a.travelDistance - b.travelDistance || a.index - b.index);

    return { path, cumulative, totalDistance, pickupProjection, turnaroundTravel, visits };
  };

  const forward = buildDirection(routePoints);
  const reverse = buildDirection([...routePoints].reverse());
  const getTravelCost = (candidate: ReturnType<typeof buildDirection>) =>
    candidate?.visits.length ? candidate.visits[candidate.visits.length - 1].travelDistance : Number.POSITIVE_INFINITY;
  const itinerary = getTravelCost(reverse) < getTravelCost(forward) ? reverse : forward;
  if (!itinerary || itinerary.visits.length === 0) return [];

  const routeBetweenVisits = (fromTravel: number, toTravel: number): RideCoordinate[] => {
    const stationAt = (travel: number) => travel <= itinerary.turnaroundTravel
      ? itinerary.pickupProjection.distanceAlong + travel
      : itinerary.totalDistance - (travel - itinerary.turnaroundTravel);
    const startStation = stationAt(fromTravel);
    const endStation = stationAt(toTravel);
    if (fromTravel <= itinerary.turnaroundTravel && toTravel > itinerary.turnaroundTravel) {
      return [
        ...routeSlice(itinerary.path, startStation, itinerary.totalDistance),
        ...routeSlice(itinerary.path, endStation, itinerary.totalDistance).reverse().slice(1),
      ];
    }
    return routeSlice(itinerary.path, startStation, endStation);
  };

  let previousTravel = 0;
  let previousStop: RideCoordinate | null = null;
  let previousProjection: RideCoordinate | null = null;
  return itinerary.visits.map(({ stop, projection, travelDistance }, index) => {
    const roadPath = routeBetweenVisits(previousTravel, travelDistance);
    const path: RideCoordinate[] = index === 0
      ? [pickup, ...roadPath]
      : [
          ...(previousStop ? [previousStop] : []),
          ...(previousProjection ? [previousProjection] : []),
          ...roadPath.slice(1),
        ];
    path.push(stop.position);
    previousTravel = travelDistance;
    previousStop = stop.position;
    previousProjection = projection.point;
    return { ...stop, path };
  });
}

// Ceiling on how fast the map is allowed to rotate, in degrees per second. GPS fixes
// arrive seconds apart, so without a limit each one would snap the map to a new
// angle and the rotation would be unreadable.
const MAX_TURN_DEG_PER_SEC = 90;

// Initial forward bearing in degrees from `a` to `b`, where north is 0.
const bearingBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// Signed shortest rotation from `from` to `to`, in the range (-180, 180].
const shortestAngleDelta = (from: number, to: number) => {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

export default function ActiveRide() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [imageProofRequired] = useDevModeOverride("imageProofRequired");

  /*
   * Keeps a pointer to the ride in progress and returns the driver to it after the
   * session comes back. A driver who gets signed out mid-ride was otherwise dumped
   * on the login screen while a passenger was still in the back of the tricycle.
   *
   * The marker is cleared when the ride is no longer active -- on completion the
   * screen is replaced and this component unmounts, so the marker is explicitly
   * released rather than left pointing at a finished trip.
   */
  const { sync: syncRideResume } = useRideResume();

  const [rideData, setRideData] = useState<ActiveRideData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Drives the inline location banner; null while the device can give us a position.
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [sharedDropoffRoutes, setSharedDropoffRoutes] = useState<SharedDropoffRoute[]>([]);
  const [sharedTerminalRoute, setSharedTerminalRoute] = useState<TerminalRoute | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 });
  // Whether the camera is locked to the driver. Defaults on so the opening view is
  // the driver, and turns off by itself the first time they pan or zoom.
  const [followDriver, setFollowDriver] = useState(true);
  // Direction of travel the map is rotated to face, null until we know it.
  const [mapHeading, setMapHeading] = useState<number | null>(null);

  const isCompleting = useRef(false);
  const isCancelling = useRef(false);
  const lastReportedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Latest ride data, readable from mount-only callbacks; and whether at least
  // one GPS fix has been pushed to the database for the current ride.
  const rideDataRef = useRef<ActiveRideData | null>(null);
  const driverLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const routePhaseRef = useRef<string | null>(null);
  const fittedRoutePhaseRef = useRef<string | null>(null);
  const hasPersistedLocationRef = useRef(false);
  const [sharedPaymentPromptPassengerId, setSharedPaymentPromptPassengerId] = useState<string | null>(null);
  // Set briefly while we change the zoom ourselves, so the resulting
  // `zoom_changed` is not read as the driver zooming in by hand. See
  // `stopFollowingOnZoom`.
  const mapMoveRef = useRef(false);
  const mapMoveTimeoutRef = useRef<number | undefined>(undefined);
  // Last fix good enough to derive a bearing from, and the rotation the map has
  // actually been given. Kept as refs because the smoothing loop reads and writes
  // them every frame; routing them through state would re-render 60 times a second.
  const headingBaselineRef = useRef<{ lat: number; lng: number } | null>(null);
  const appliedHeadingRef = useRef<number | null>(null);

  /*
   * Hold the marker for as long as this ride is live, and release it the moment it
   * is not.
   *
   * `completed` releases it. A marker pointing at a finished trip would pull the
   * driver back to a ride screen for a ride that no longer exists -- and the resume
   * check would query a row that is gone.
   *
   * This effect is positioned after every value it reads (`rideData`, `status`,
   * `rideData?.status`). The previous version referenced them inside the dependency
   * array before they were declared, which threw "Cannot access before
   * initialization" during render and took the whole route down.
   */
  useEffect(() => {
    const completed = rideData?.status === 'completed';
    if (completed) {
      syncRideResume(null);
      return;
    }
    if (rideData) {
      syncRideResume(rideData.id);
    }
  }, [rideData?.id, rideData?.status, syncRideResume]);
  rideDataRef.current = rideData;
  driverLocationRef.current = driverLocation;
  const [showRideComplete, setShowRideComplete] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPassenger, setReportPassenger] = useState<{ id: string; name: string } | null>(null);
  const [reportCategory, setReportCategory] = useState(RIDER_REPORT_CATEGORIES[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitError, setReportSubmitError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  /*
   * The handover photo, for deliveries only.
   *
   * A shared ride needs nothing of the sort, so the gate is only raised when
   * `isDeliveryRide` -- otherwise every passenger would be asked to photograph
   * a stranger's handover.
   */
  const [showProofSheet, setShowProofSheet] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  useEffect(() => {
    if (!imageProofRequired) {
      setShowProofSheet(false);
      setProofError(null);
    }
  }, [imageProofRequired]);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  /** The passenger's profile photo, resolved by id from the users table. */
  const [passengerAvatar, setPassengerAvatar] = useState<string | null>(null);
  /** Profile photos for every passenger in a shared ride, keyed by account id. */
  const [passengerAvatars, setPassengerAvatars] = useState<Record<string, string>>({});
  /** The current restaurant profile for accepted delivery orders. */
  const [restaurantProfile, setRestaurantProfile] = useState<{
    businessUserId: string | null;
    name: string;
    subtitle: string | null;
    address: string | null;
    cuisine: string | null;
    deliveryTime: string | null;
    logoImage: string | null;
  } | null>(null);

  /**
   * In-ride chat with the passenger.
   *
   * A driver had no way to talk to the passenger without leaving the ride
   * screen, which meant calling them or nothing. This reuses the same
   * conversation the customer's Chat button opens (`findOrCreateRideChat`), so
   * both sides land in one thread rather than two half-used ones.
   */
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatPeer, setChatPeer] = useState<{
    id: string;
    name: string;
    avatar: string | null;
    isGroup: boolean;
  } | null>(null);
  /** Whether the chat overlay is showing. */
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  const [confirmingDropoffPassengerId, setConfirmingDropoffPassengerId] = useState<string | null>(null);
  const [confirmingSharedPaymentPassengerId, setConfirmingSharedPaymentPassengerId] = useState<string | null>(null);
  const [sharedPaymentError, setSharedPaymentError] = useState<string | null>(null);
  /** Messages from the passenger the driver has not looked at yet. */
  const [unreadFromPassenger, setUnreadFromPassenger] = useState(0);
  /** Latest message seen in this ride thread, excluding badge-only updates. */
  const lastSeenMessage = useRef<{ conversationId: string; messageId: string | null } | null>(null);
  /**
   * Bumped to replay the ripple.
   *
   * A boolean would not do: the animation runs once and ends, and React will not
   * re-render a component to restart an already-finished CSS animation unless
   * something changes. Changing a key remounts the rings each time.
   */
  const [pulseKey, setPulseKey] = useState(0);
  /** Whether anything has been said on this ride -- gates the floating head. */
  /**
   * Whether chat has been opened on this ride.
   *
   * Read from storage like `chatStarted`, because opening the Messages tab
   * unmounts this screen: without persisting it, coming back from a reply would
   * put the head back in the middle of the map instead of up in the corner.
   */
  const [chatOpened, setChatOpened] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('trikeserve_chat_opened') === '1';
    } catch {
      return false;
    }
  });
  const [chatStarted, setChatStarted] = useState(() => {
    // Read straight from storage on mount: opening the Messages tab unmounts this
    // screen, so without this the head vanished on the way back from a chat.
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('trikeserve_chat_started') === '1';
    } catch {
      return false;
    }
  });
  /** The mounted map instance, for imperative camera control. */
  const mapRef = useRef<any>(null);
  // Set when the customer cancels out from under an accepted ride, so the rider
  // isn't left driving to a pickup that no longer exists.
  const [customerCancellation, setCustomerCancellation] = useState<{
    reason: string | null;
    cancelledBy: string | null;
  } | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();

  useEffect(() => {
    if (location.state?.acceptedRide) {
      const ride = { ...location.state.acceptedRide, status: 'on-the-way' as RideStatus };
      setRideData(ride);
      writeRiderActiveRide(ride);
      // Shared-ride lobbies are accepted in PassengerRequests (acceptLobbyAsDriver),
      // so skip the ride_requests calls which only apply to private/delivery rides.
      if (ride.id && user?.id) {
        if (ride.lobbyId) {
          // Shared-ride lobbies are accepted in PassengerRequests (acceptLobbyAsDriver);
          // here we only need to track the driver's progress on the lobby so customers
          // see the status popups.
          supabaseHelpers.updateLobbyDriverStatus(ride.lobbyId, 'on-the-way', 'Driver is on the way!');
          void notifyRideProgress(ride, 'on-the-way');
        } else {
          // Record the acceptance FIRST: the database only lets a driver who is
          // still first in their terminal's queue be assigned, so the queue slot is
          // given up only once the ride is actually ours.
          supabaseHelpers
            .acceptRideRequest(ride.id, user.id, user.name || 'Driver', user.user_metadata?.avatar_url, user.todaPlate || 'N/A', '4.8')
            .then(({ error }) => {
              if (error) return;
              return supabaseHelpers.clearTerminalQueueRows(user.id);
            })
            .catch(() => {});
          supabaseHelpers.updateDriverRideStatus(ride.id, 'on-the-way', 'Driver is on the way!');
          notifyDeliveryStatus(ride, 'on-the-way', 'Driver is on the way!');
          void notifyRideProgress(ride, 'on-the-way');
        }
      }
    } else {
      const saved = readRiderActiveRide();
      if (saved) {
        setRideData(saved);
      } else if (user?.id) {
        // Rebuild from the database when this device holds no copy: a ride
        // accepted on another device, or after storage was cleared, is still the
        // driver's, and an empty ride screen left them unable to continue it.
        fetchRiderActiveRide(user.id).then((dbRide) => {
          if (!dbRide) return;
          writeRiderActiveRide(dbRide);
          setRideData(dbRide);
        });
      }
    }
  }, [location.state, user]);

  // Resolve customer name from the users table if it's missing or generic
  useEffect(() => {
    if (!rideData || (rideData.customerName && rideData.customerName !== 'Customer')) return;
    const cid = rideData.customerId;
    if (!cid) return;
    supabase.from('users').select('name').eq('id', cid).single()
      .then(({ data }) => { if (data?.name) setResolvedName(data.name); })
      .catch(() => {});
  }, [rideData?.customerId, rideData?.customerName]);

  /**
   * The passenger's profile photo.
   *
   * The ride row carries the passenger's name but no avatar, so the card had
   * nothing to render and fell back to a generic person glyph. Resolved by id
   * from the users table, which is the same source the customer side uses for
   * its driver.
   */
  /**
   * Open the passenger conversation in the Messages tab.
   *
   * Chat used to be an inline panel built into the ride screen, which meant a
   * second, dumber copy of the conversation list already exists: the driver had
   * two places to read the same thread, and the inline one had no history beyond
   * what was loaded, no unread state, and no way back to the rest of their
   * messages. Handing off to the real Messages tab means one conversation list,
   * one place where "unread" means something.
   */
  const openPassengerChat = useCallback(async (target?: { id: string; name: string }) => {
    const passengers = Array.isArray(rideData?.passengerDetails) ? rideData.passengerDetails : [];
    const defaultPeerId = rideData?.customerId || passengerAccountId(passengers[0]?.id);
    const peerId = target
      ? passengerAccountId(target.id) || rideData?.customerId
      : chatPeer?.id || defaultPeerId;
    if (!peerId || !user?.id) return;

    const peerPassenger = passengers.find((passenger: any) =>
      String(passenger?.id || '') === peerId && !String(passenger?.id || '').includes('_companion_')
    ) || passengers.find((passenger: any) => passengerAccountId(passenger?.id) === peerId);
    const peerName = firstNameOnly(target
      ? peerPassenger?.name || target.name
      : chatPeer?.name || peerPassenger?.name || rideData?.customerName) || 'Passenger';
    const peerAvatar = passengerAvatars[peerId] || (!target ? passengerAvatar : null);
    const peerIsGroup = !target && !chatPeer && rideData?.customerPhoto === 'shared';
    setChatPeer({ id: peerId, name: peerName, avatar: peerAvatar, isGroup: peerIsGroup });

    const { data, error } = await supabaseHelpers.findOrCreateRideChat({
      currentUserId: user.id,
      currentUserName: user.name,
      currentUserRole: user.role,
      peerId,
      peerName,
      contextId: rideData.id,
    });
    if (error || !data) return;

    setChatId(data.id);
    setUnreadFromPassenger(0);
    // Read here rather than waiting for the Messages tab to do it: the driver is
    // leaving for the thread, and until that thread mounts the badge would still
    // be counting what they are on their way to read.
    await supabaseHelpers.markChatConversationRead(data.id, user.id);
    setChatStarted(true);
    setChatOpened(true);
    // Persisted so the head survives the round trip through the Messages tab,
    // which unmounts this screen entirely.
    try {
      localStorage.setItem('trikeserve_chat_started', '1');
      localStorage.setItem('trikeserve_chat_opened', '1');
    } catch {
      // Storage unavailable; the head still appears for this mount.
    }
    // Opens the overlay in place. No navigation: this screen stays mounted, so
    // the map, the ride sheet and the floating head are all still there behind
    // the chat, and closing it costs the driver nothing.
    setChatPopupOpen(true);
  }, [
    chatPeer?.id,
    chatPeer?.name,
    passengerAvatar,
    passengerAvatars,
    rideData?.customerId,
    rideData?.customerName,
    rideData?.customerPhoto,
    rideData?.id,
    rideData?.passengerDetails,
    user?.id,
    user?.name,
    user?.role,
  ]);

  /**
   * Park the chat head mid-screen the first time it appears.
   *
   * Deferred to the next frame because the element is not mounted yet on the
   * render that first sets `chatStarted`, so its size -- needed to centre it --
   * is not measurable. Centred rather than pinned to a corner so it does not
   * sit over the map's controls or the pickup/drop-off labels.
    window.addEventListener('pointerup', onUp);
  };

  /**
   * Resolve the passenger's thread on mount.
   *
   * Without this the unread badge could never appear until the driver tapped the
   * head: the poll needs a conversation id, and the id was only assigned inside
   * `openPassengerChat`. So the badge would have been permanently invisible on a
   * fresh load -- precisely when there is something unread to show.
   *
   * Deliberately *finds* the thread rather than creating one. A driver who has
   * not messaged yet should get no badge, not a new empty conversation invented
   * for them every time this screen mounts.
   */
  const resolvePassengerChat = useCallback(async () => {
    const firstPassengerId = passengerAccountId(rideData?.passengerDetails?.[0]?.id);
    const peerId = rideData?.customerId || firstPassengerId;
    if (!peerId || !user?.id) return;

    const { data } = await supabase
      .from('chat_conversations')
      .select('id, participant_a_id, participant_b_id, updated_at')
      .or(`participant_a_id.eq.${user.id},participant_b_id.eq.${user.id}`);

    const mine = ((data || []) as any[]).filter((c: any) => {
      const other = c.participant_a_id === user.id ? c.participant_b_id : c.participant_a_id;
      return other === peerId;
    });
    if (mine.length === 0) return;
    // Newest first, so a thread that has duplicates still resolves to the one
    // actually in use rather than an arbitrary stale copy.
    mine.sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    setChatId(mine[0].id);
  }, [rideData?.customerId, rideData?.passengerDetails, user?.id]);

  useEffect(() => {
    if (chatId || !chatStarted || !user?.id) return;
    resolvePassengerChat();
  }, [chatId, chatStarted, user?.id, resolvePassengerChat]);

  /**
   * Poll the passenger thread so the floating head's unread badge stays honest.
   *
   * The unread count drives the badge. The latest message id is tracked only to
   * distinguish actual chat activity from read-state changes.
   */
  useEffect(() => {
    if (!chatId || !user?.id) return;
    let cancelled = false;

    const check = async () => {
      const { data } = await supabaseHelpers.getChatMessages(chatId);
      if (cancelled) return;
      const chatMessages = (data || []) as any[];
      const latestMessage = chatMessages[chatMessages.length - 1];
      const previousMessage = lastSeenMessage.current;
      if (
        previousMessage?.conversationId === chatId &&
        latestMessage?.id &&
        latestMessage.id !== previousMessage.messageId
      ) {
        setPulseKey((k) => k + 1);
      }
      lastSeenMessage.current = { conversationId: chatId, messageId: latestMessage?.id || null };

      const fromThem = chatMessages.filter(
        (m) => m.sender_id !== user.id && m.read === false
      );
      const count = fromThem.length;
      setUnreadFromPassenger(count);
    };

    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatId, user?.id]);

  useEffect(() => {
    const passengerDetails = Array.isArray(rideData?.passengerDetails) ? rideData.passengerDetails : [];
    const profileIds = [...new Set([
      rideData?.customerId,
      ...passengerDetails.map((passenger: any) => passenger?.id),
    ].map(passengerAccountId).filter(Boolean))];
    if (profileIds.length === 0) {
      setPassengerAvatar(null);
      setPassengerAvatars({});
      return;
    }
    setPassengerAvatar(null);
    setPassengerAvatars({});
    let active = true;
    supabase.from('users').select('id, avatar_url').in('id', profileIds)
      .then(({ data }) => {
        if (!active) return;
        const avatars = Object.fromEntries(
          (data || [])
            .filter((profile: any) => profile?.id && profile?.avatar_url)
            .map((profile: any) => [String(profile.id), String(profile.avatar_url)]),
        ) as Record<string, string>;
        const primaryId = passengerAccountId(rideData?.customerId || passengerDetails[0]?.id);
        setPassengerAvatars(avatars);
        setPassengerAvatar(avatars[primaryId] || null);
      })
      .catch(() => {
        if (!active) return;
        setPassengerAvatar(null);
        setPassengerAvatars({});
      });
    return () => { active = false; };
  }, [rideData?.customerId, rideData?.passengerDetails]);

  /*
   * The `center` prop is only meaningful before the map exists.
   *
   * `@react-google-maps/api` re-applies `center` on every change of the value
   * (`instance.setCenter(center)` in an effect keyed on `[center, instance]`), so
   * feeding it the live driver position kept dragging the camera back onto the
   * tricycle after every GPS tick -- including after the driver had deliberately
   * panned away, and it also fired while following was off, which would have made
   * the re-centre button a no-op. All camera movement after creation is therefore
   * imperative and driven by `panMapToDriver`.
   */
  useEffect(() => {
    if (driverLocation && !mapRef.current) setMapCenter(driverLocation);
  }, [driverLocation]);

  /*
   * Camera follows the driver -- until the driver takes the camera themselves.
   *
   * Previously a `setInterval` panned to the driver every second, unconditionally.
   * That made the map unusable: panning ahead to read the next turn, or zooming in
   * on the pickup pin, was undone within a second, so the driver could never
   * inspect the map. Following now stops on the first deliberate gesture and the
   * re-centre button takes over.
   */
  const panMapToDriver = useCallback(() => {
    const map = mapRef.current;
    if (!map || !driverLocation) return;

    mapMoveRef.current = true;
    map.panTo(driverLocation);
    window.clearTimeout(mapMoveTimeoutRef.current);
    mapMoveTimeoutRef.current = window.setTimeout(() => { mapMoveRef.current = false; }, 300);
  }, [driverLocation]);

  /*
   * A programmatic `panTo` does not raise `dragstart`, so anything that does is a
   * real gesture and needs no suppression. No guard here on purpose: a blanket
   * "ignore input right after we moved the camera" rule would swallow the driver's
   * own drags for as long as the flag was held, which is precisely the input this
   * whole change exists to honour.
   */
  const stopFollowingOnDrag = useCallback(() => {
    setFollowDriver(false);
  }, []);

  /*
   * A zoom gesture by the driver stops following too -- they are inspecting the
   * map, so the camera is theirs. `mapMoveRef` is kept as a filter so that if any
   * future code zooms the map itself, that does not read as the driver zooming.
   */
  const stopFollowingOnZoom = useCallback(() => {
    if (mapMoveRef.current) return;
    setFollowDriver(false);
  }, []);

  const handleRecenter = useCallback(() => {
    // Position and orientation only. The zoom the driver is looking at is left
    // exactly as it is: re-centring is about getting the tricycle back on screen,
    // not about overriding how closely they chose to view it.
    setFollowDriver(true);
    panMapToDriver();
  }, [panMapToDriver]);

  useEffect(() => {
    if (followDriver) panMapToDriver();
  }, [followDriver, panMapToDriver]);

  /*
   * Ease the map's rotation towards the direction of travel.
   *
   * GPS fixes arrive seconds apart, so applying each one directly would snap the
   * map between angles. Instead a single animation frame advances the applied
   * heading by at most MAX_TURN_DEG_PER_SEC, which turns the same data into a
   * readable rotation through a turn.
   *
   * Only runs while following: once the driver takes the camera the map keeps the
   * angle it had, which is what a navigation app does rather than spinning under
   * a finger.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followDriver || mapHeading == null) return;

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const map2 = mapRef.current;
      if (map2 !== map || !map2) return;

      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const target = mapHeading;
      if (target == null) return;

      const applied = appliedHeadingRef.current;
      if (applied == null) {
        appliedHeadingRef.current = target;
        map2.setHeading(target);
      } else {
        const delta = shortestAngleDelta(applied, target);
        // Close enough that continuing to animate is invisible; snap and stop.
        if (Math.abs(delta) < 0.5) {
          if (delta !== 0) {
            appliedHeadingRef.current = target;
            map2.setHeading(target);
          }
          return;
        }
        const step = Math.sign(delta) * Math.min(Math.abs(delta), MAX_TURN_DEG_PER_SEC * dt);
        const next = (applied + step + 360) % 360;
        appliedHeadingRef.current = next;
        map2.setHeading(next);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [followDriver, mapHeading]);

  // Drop the programmatic-move flag timer on unmount so it cannot write to state
  // (or to a map instance that is gone) after the ride screen is closed.
  useEffect(() => {
    return () => window.clearTimeout(mapMoveTimeoutRef.current);
  }, []);

  // Accept a GPS fix only when it has moved far enough to be worth acting on.
  // Returns false for sub-threshold wobble so callers can skip both the map
  // update and the database write, which is what keeps the camera steady.
  const reportDriverLocation = (loc: { lat: number; lng: number }, options?: { force?: boolean }) => {
    const previous = lastReportedLocationRef.current;
    if (!options?.force && previous && distanceInMeters(previous, loc) < MIN_LOCATION_DELTA_METERS) {
      return false;
    }
    lastReportedLocationRef.current = loc;
    setDriverLocation(loc);
    return true;
  };

  /*
   * Work out which way the driver is travelling, so the map can face that way.
   *
   * Two sources, in order of trust:
   *
   * 1. The device compass (`coords.heading`). Accurate, but only meaningful while
   *    actually moving, and absent entirely on iOS.
   * 2. The bearing between successive accepted fixes. Always available, but only
   *    as good as the distance covered, hence MIN_HEADING_BASELINE_METERS.
   *
   * Deliberately does nothing while stationary: a parked driver has no direction
   * of travel, and rotating the map to a compass bearing the phone happens to be
   * facing would spin it for no reason.
   */
  const recordHeading = (coords: GeolocationCoordinates) => {
    const loc = { lat: coords.latitude, lng: coords.longitude };
    const speed = coords.speed ?? 0;

    if (typeof coords.heading === 'number' && Number.isFinite(coords.heading) && speed > MIN_HEADING_SPEED_MPS) {
      headingBaselineRef.current = loc;
      setMapHeading((current) => {
        // A heading arriving within a couple of degrees of the one already applied
        // is just GPS jitter; ignoring it keeps the rotation loop from working to
        // move the map that is already correctly oriented.
        if (current != null && Math.abs(shortestAngleDelta(current, coords.heading as number)) < 2) return current;
        return coords.heading as number;
      });
      return;
    }

    const baseline = headingBaselineRef.current;
    if (baseline && distanceInMeters(baseline, loc) >= MIN_HEADING_BASELINE_METERS) {
      headingBaselineRef.current = loc;
      setMapHeading(bearingBetween(baseline, loc));
    }
  };

  // Write the driver's current position to the active ride's backing store so
  // the customer and business maps can follow it.
  const persistDriverLocation = (loc: { lat: number; lng: number }) => {
    const ride = rideDataRef.current;
    if (!ride) return false;
    if (ride.lobbyId) {
      supabaseHelpers.updateLobbyDriverLocation(ride.lobbyId, loc.lat, loc.lng);
    } else if (ride.orderId) {
      // Delivery: keep both the order row and the active ride in sync.
      supabase.from('orders').update({ driver_lat: loc.lat, driver_lng: loc.lng, driver_name: ride.driverName || 'Driver', updated_at: new Date().toISOString() }).eq('id', ride.orderId).then(() => {}, () => {});
      if (ride.id) supabaseHelpers.updateRideRequest(ride.id, { driver_lat: loc.lat, driver_lng: loc.lng, updated_at: new Date().toISOString() });
    } else if (ride.id) {
      supabaseHelpers.updateRideRequest(ride.id, { driver_lat: loc.lat, driver_lng: loc.lng, updated_at: new Date().toISOString() });
    } else {
      return false;
    }
    return true;
  };

  // Request device GPS location
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[ActiveRide] Got device location:', pos.coords.latitude, pos.coords.longitude);
        setLocationProblem(null);
        recordHeading(pos.coords);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        reportDriverLocation(loc, { force: true });
        // Persist the first fix even if the driver is parked and never moves.
        if (!hasPersistedLocationRef.current && persistDriverLocation(loc)) {
          hasPersistedLocationRef.current = true;
        }
      },
      (err) => {
        console.error('[ActiveRide] Geolocation error:', err.message);
        // Retry once after a short delay — sometimes the first request is rushed
        setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            (pos2) => {
              const loc = { lat: pos2.coords.latitude, lng: pos2.coords.longitude };
              recordHeading(pos2.coords);
              reportDriverLocation(loc, { force: true });
              if (!hasPersistedLocationRef.current && persistDriverLocation(loc)) {
                hasPersistedLocationRef.current = true;
              }
            },
            (retryError) => {
              console.error('[ActiveRide] Geolocation retry also failed');
              setLocationProblem(retryError.code === retryError.PERMISSION_DENIED ? 'permission-denied' : 'services-off');
            },
            { enableHighAccuracy: true, timeout: 15000 }
          );
        }, 2000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // A new ride starts fresh: its first GPS fix must be persisted.
  useEffect(() => {
    hasPersistedLocationRef.current = false;
  }, [rideData?.id, rideData?.lobbyId]);

  // Watch position for real-time updates
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        recordHeading(pos.coords);
        setLocationProblem(null);
        // Ignore sub-threshold drift so the map does not twitch while parked and
        // customers are not sent a stream of meaningless position updates. The
        // first fix for a ride is always persisted, so tracking shows up even if
        // the driver never moves.
        const moved = reportDriverLocation(loc);
        if (moved || !hasPersistedLocationRef.current) {
          if (persistDriverLocation(loc)) hasPersistedLocationRef.current = true;
        }
      },
      (error) => {
        // This watch keeps firing while the problem persists and starts
        // succeeding again once it is fixed, so it is the banner's live signal.
        setLocationProblem(error.code === error.PERMISSION_DENIED ? 'permission-denied' : 'services-off');
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [rideData?.id, rideData?.lobbyId]);

  // Determine if we're heading to pickup or dropoff
  const isHeadingToPickup = rideData?.status === 'on-the-way' || rideData?.status === 'arrived';
  const isSharedRide = Boolean(rideData && (rideData.type === 'shared' || rideData.lobbyId));

  // Shared passengers have separate destinations and fares, so keep a payment
  // prompt for each passenger who has been dropped off but not paid.
  useEffect(() => {
    if (confirmingDropoffPassengerId) return;
    if (!rideData || !isSharedRide || rideData.status === 'completed') {
      setSharedPaymentPromptPassengerId(null);
      return;
    }

    const passengers = Array.isArray(rideData.passengerDetails) ? rideData.passengerDetails : [];
    const pendingPassenger = passengers.find((passenger: any) => {
      const passengerId = String(passenger?.id || '');
      const dropoffStatus = String(passenger.dropoff_status || passenger.dropoffStatus || '').toLowerCase();
      const paymentStatus = String(passenger.payment_status || passenger.paymentStatus || '').toLowerCase();
      if (
        !passengerId ||
        !['dropped-off', 'completed'].includes(dropoffStatus) ||
        ['received', 'prepaid'].includes(paymentStatus)
      ) {
        return false;
      }
      return true;
    });

    setSharedPaymentPromptPassengerId(pendingPassenger ? String(pendingPassenger.id) : null);
  }, [rideData?.id, rideData?.passengerDetails, rideData?.status, isSharedRide, sharedPaymentPromptPassengerId, confirmingDropoffPassengerId]);
  const sharedDropoffStops = useMemo(() => getSharedDropoffStops(rideData), [
    rideData?.id,
    rideData?.type,
    rideData?.lobbyId,
    rideData?.customerId,
    rideData?.customerName,
    rideData?.pickupLat,
    rideData?.pickupLng,
    rideData?.dropoffLat,
    rideData?.dropoffLng,
    rideData?.passengerDetails,
  ]);

  // Load the route selected for this lobby. New bookings carry the route id on
  // each passenger; older lobbies are matched to the plotted road that contains
  // the most passenger destinations.
  useEffect(() => {
    if (!isSharedRide || !rideData?.lobbyId) {
      setSharedTerminalRoute(null);
      return;
    }

    let cancelled = false;
    const loadSelectedTerminalRoute = async () => {
      let terminalId = rideData.terminalId || null;
      let passengers = Array.isArray(rideData.passengerDetails) ? rideData.passengerDetails : [];
      try {
        const { data: lobby } = await supabase
          .from('shared_ride_lobbies')
          .select('terminal_id, passengers_json')
          .eq('id', rideData.lobbyId)
          .maybeSingle();
        if (lobby) {
          terminalId = terminalId || lobby.terminal_id || null;
          if (Array.isArray(lobby.passengers_json)) passengers = lobby.passengers_json;
          else if (typeof lobby.passengers_json === 'string') {
            try {
              const parsed = JSON.parse(lobby.passengers_json);
              if (Array.isArray(parsed)) passengers = parsed;
            } catch {
              // Keep the passenger details already carried by the active ride.
            }
          }
        }
      } catch {
        // The accepted ride may still have the terminal and passengers cached.
      }

      if (!terminalId) {
        if (!cancelled) setSharedTerminalRoute(null);
        return;
      }

      const { data: terminal, error } = await supabase
        .from('terminals')
        .select('routes, boundary_polygon, road_width_m')
        .eq('id', terminalId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !terminal) {
        setSharedTerminalRoute(null);
        return;
      }

      const storedRoutes = normalizeTerminalRoutes(terminal.routes);
      const routes = (storedRoutes.length > 0
        ? storedRoutes
        : legacyRouteFromBoundary(terminal.boundary_polygon, terminal.road_width_m))
        .filter(route => route.points.length >= 2);
      if (routes.length === 0) {
        setSharedTerminalRoute(null);
        return;
      }

      const requestedRouteId = rideData.selectedRouteId || passengers
        .map((passenger: any) => passenger?.route_id || passenger?.routeId || passenger?.selectedRouteId)
        .find((routeId: unknown) => typeof routeId === 'string' && routeId.length > 0);
      const savedRoute = requestedRouteId
        ? routes.find(route => route.id === requestedRouteId)
        : null;
      const destinations = passengers.flatMap((passenger: any) => {
        const point = coordinateFromValues(
          passenger?.dropoffLat ?? passenger?.dropoff_lat,
          passenger?.dropoffLng ?? passenger?.dropoff_lng,
        );
        return point ? [point] : [];
      });
      if (destinations.length === 0) {
        const primaryDropoff = coordinateFromValues(rideData.dropoffLat, rideData.dropoffLng);
        if (primaryDropoff) destinations.push(primaryDropoff);
      }

      const matchingRoute = routes
        .map(route => ({
          route,
          matches: destinations.filter(point => isPointOnRoadCorridor(
            point.lat,
            point.lng,
            route.points,
            route.buffer_m,
          )).length,
        }))
        .sort((a, b) => b.matches - a.matches)[0];

      setSharedTerminalRoute(
        savedRoute
        || (matchingRoute?.matches ? matchingRoute.route : null)
        || routes.find(route => route.enabled)
        || routes[0]
        || null,
      );
    };

    void loadSelectedTerminalRoute();
    return () => { cancelled = true; };
  }, [
    isSharedRide,
    rideData?.id,
    rideData?.lobbyId,
    rideData?.terminalId,
    rideData?.selectedRouteId,
    rideData?.passengerDetails,
    rideData?.dropoffLat,
    rideData?.dropoffLng,
  ]);

  // A shared ride has one colored road segment for each passenger stop. Route the
  // ordered itinerary on the selected terminal road, so every segment keeps the
  // color of the passenger who gets off at its end.
  useEffect(() => {
    if (!isSharedRide || !rideData) {
      setSharedDropoffRoutes([]);
      return;
    }

    const pickup = coordinateFromValues(rideData.pickupLat, rideData.pickupLng) || driverLocation;
    if (!pickup || sharedDropoffStops.length === 0 || !sharedTerminalRoute) {
      setSharedDropoffRoutes([]);
      return;
    }
    setSharedDropoffRoutes(buildSharedDropoffRoutes(pickup, sharedDropoffStops, sharedTerminalRoute));
  }, [
    isSharedRide,
    rideData?.id,
    rideData?.pickupLat,
    rideData?.pickupLng,
    sharedDropoffStops,
    sharedTerminalRoute,
    driverLocation?.lat,
    driverLocation?.lng,
  ]);

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
          writeRiderActiveRide(updated);
        }
      })
      .catch(() => {});
  }, [rideData?.pickupAddress, rideData?.pickup, rideData?.pickupLat, rideData?.pickupLng]);

  useEffect(() => {
    if (!rideData || !isMapsLoaded || !(window as any).google) return;

    if (isSharedRide && !isHeadingToPickup) {
      // The colored multi-stop route below replaces the single-destination route
      // once the shared ride has left its pickup.
      const sharedPhaseKey = `${rideData.id}:shared-dropoffs`;
      if (routePhaseRef.current !== sharedPhaseKey) {
        routePhaseRef.current = sharedPhaseKey;
        setDirections(null);
        setRoutePath(null);
      }
      return;
    }

    const phase = isHeadingToPickup ? 'restaurant' : 'customer';
    const phaseKey = `${rideData.id}:${phase}`;
    if (routePhaseRef.current !== phaseKey) {
      // Remove the previous leg immediately when the rider confirms pickup.
      routePhaseRef.current = phaseKey;
      setDirections(null);
      setRoutePath(null);
    }

    let cancelled = false;
    let inFlight = false;
    let hasRoute = false;
    let routeTimer: number | undefined;

    const targetLat = isHeadingToPickup ? rideData.pickupLat : rideData.dropoffLat;
    const targetLng = isHeadingToPickup ? rideData.pickupLng : rideData.dropoffLng;
    const dest = targetLat != null && targetLng != null
      ? { lat: Number(targetLat), lng: Number(targetLng) }
      : null;

    if (!dest || !Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) {
      setDirections(null);
      setRoutePath(null);
      return;
    }

    const scheduleNext = () => {
      if (cancelled) return;
      // Retry quickly until GPS or a route is available. Once found, update the
      // route periodically from the latest position without cancelling an
      // in-flight request on every GPS tick.
      routeTimer = window.setTimeout(() => { void calculateRoute(); }, hasRoute ? 12000 : 1500);
    };

    const calculateRoute = async () => {
      if (cancelled || inFlight) return;
      const origin = driverLocationRef.current;
      if (!origin) {
        scheduleNext();
        return;
      }

      inFlight = true;
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
        if (apiKey) {
          try {
            const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes?key=${apiKey}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
              },
              body: JSON.stringify({
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
                travelMode: 'DRIVE',
                computeAlternativeRoutes: false,
              }),
            });
            const data = await response.json();
            const encoded = response.ok ? data.routes?.[0]?.polyline?.encodedPolyline : null;
            const path = encoded ? decodeRoutePolyline(encoded) : [];
            if (!cancelled && path.length > 1) {
              setDirections(null);
              setRoutePath(path);
              hasRoute = true;
              return;
            }
            if (!response.ok) console.warn('[ActiveRide] Routes API failed:', data.error?.status || response.status);
          } catch (error) {
            console.warn('[ActiveRide] Routes API request failed:', error);
          }
        }

        // Keep compatibility with projects that have the legacy Directions
        // service enabled, but prefer the same Routes API used in request preview.
        const result = await new Promise<{ result: any; status: string }>(resolve => {
          const DirectionsService = new (window as any).google.maps.DirectionsService();
          DirectionsService.route({
            origin: new (window as any).google.maps.LatLng(origin.lat, origin.lng),
            destination: new (window as any).google.maps.LatLng(dest.lat, dest.lng),
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          }, (routeResult: any, status: string) => resolve({ result: routeResult, status }));
        });
        if (cancelled) return;
        if (result.status === 'OK') {
          setRoutePath(null);
          setDirections(result.result);
          hasRoute = true;
        } else {
          console.error(`[ActiveRide] Road route to ${phase} failed:`, result.status);
          setDirections(null);
          setRoutePath(null);
          hasRoute = false;
        }
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };

    void calculateRoute();
    return () => {
      cancelled = true;
      window.clearTimeout(routeTimer);
    };
  }, [rideData?.id, rideData?.status, rideData?.pickupLat, rideData?.pickupLng, rideData?.dropoffLat, rideData?.dropoffLng, isMapsLoaded, isHeadingToPickup, isSharedRide]);

  // Match the accept-preview map: zoom to the road route once for each leg so
  // the route is in view when the rider enters the restaurant or customer phase.
  // GPS following can then keep the rider centred without repeatedly changing
  // the zoom or fighting the driver's map gestures.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rideData) return;
    const phaseKey = `${rideData.id}:${isHeadingToPickup ? 'restaurant' : 'customer'}`;
    if (fittedRoutePhaseRef.current === phaseKey) return;

    const routePoints = isSharedRide && !isHeadingToPickup
      ? sharedDropoffRoutes.flatMap(route => route.path)
      : routePath
        || directions?.routes?.[0]?.overview_path?.map(point => ({ lat: point.lat(), lng: point.lng() }))
        || sharedDropoffRoutes.flatMap(route => route.path);
    if (routePoints.length < 2) return;

    const bounds = new (window as any).google.maps.LatLngBounds();
    routePoints.forEach(point => bounds.extend(point));
    fittedRoutePhaseRef.current = phaseKey;
    mapMoveRef.current = true;
    map.fitBounds(bounds, 48);
    window.clearTimeout(mapMoveTimeoutRef.current);
    mapMoveTimeoutRef.current = window.setTimeout(() => { mapMoveRef.current = false; }, 1000);
  }, [directions, routePath, sharedDropoffRoutes, rideData?.id, isHeadingToPickup, isSharedRide]);

  const isDeliveryRide = (ride: any) =>
    ride?.type === 'delivery' ||
    Boolean(ride?.orderId || ride?.orderNumber) ||
    String(ride?.pickup || '').startsWith('DELIVERY');
  const reportCategories = rideData && isDeliveryRide(rideData)
    ? DELIVERY_REPORT_CATEGORIES
    : RIDER_REPORT_CATEGORIES;

  // Use the restaurant details carried by the accepted request immediately,
  // then refresh them from the current profile so the driver sees up-to-date
  // information when a ride is restored from storage or another device.
  useEffect(() => {
    const isDeliveryOrder = Boolean(rideData?.orderId || rideData?.orderNumber)
      || String(rideData?.pickup || '').startsWith('DELIVERY');
    if (!rideData || !isDeliveryOrder) {
      setRestaurantProfile(null);
      return;
    }

    let cancelled = false;
    const fallbackName = rideData.restaurantName
      || (String(rideData.pickup || '').startsWith('DELIVERY') ? '' : rideData.pickup)
      || 'Restaurant';
    setRestaurantProfile({
      businessUserId: rideData.businessUserId || null,
      name: fallbackName,
      subtitle: rideData.restaurantSubtitle || null,
      address: rideData.restaurantAddress || rideData.pickupAddress || null,
      cuisine: rideData.restaurantCuisine || null,
      deliveryTime: rideData.restaurantDeliveryTime || null,
      logoImage: rideData.restaurantImage || null,
    });

    const loadRestaurantProfile = async () => {
      let order: any = null;
      if (rideData.orderId) {
        const { data } = await supabase
          .from('orders')
          .select('business_id, restaurant_email')
          .eq('id', rideData.orderId)
          .maybeSingle();
        order = data;
      }

      let restaurant: any = null;
      if (order?.restaurant_email) {
        const { data } = await supabase
          .from('restaurants')
          .select('business_user_id, name, subtitle, address, cuisine, delivery_time, logo_image')
          .eq('id', order.restaurant_email)
          .maybeSingle();
        restaurant = data;
      }

      const businessUserId = order?.business_id || restaurant?.business_user_id || rideData.businessUserId || null;
      if (!restaurant && businessUserId) {
        const { data } = await supabase
          .from('restaurants')
          .select('business_user_id, name, subtitle, address, cuisine, delivery_time, logo_image')
          .eq('business_user_id', businessUserId)
          .maybeSingle();
        restaurant = data;
      }

      if (cancelled) return;
      setRestaurantProfile({
        businessUserId: restaurant?.business_user_id || businessUserId,
        name: restaurant?.name || fallbackName,
        subtitle: restaurant?.subtitle || rideData.restaurantSubtitle || null,
        address: restaurant?.address || rideData.restaurantAddress || rideData.pickupAddress || null,
        cuisine: restaurant?.cuisine || rideData.restaurantCuisine || null,
        deliveryTime: restaurant?.delivery_time || rideData.restaurantDeliveryTime || null,
        logoImage: restaurant?.logo_image || rideData.restaurantImage || null,
      });
    };

    loadRestaurantProfile().catch((error) => {
      if (!cancelled) console.warn('[ActiveRide] Could not load restaurant profile:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    rideData?.id,
    rideData?.type,
    rideData?.orderId,
    rideData?.restaurantName,
    rideData?.restaurantImage,
    rideData?.restaurantAddress,
    rideData?.restaurantSubtitle,
    rideData?.restaurantCuisine,
    rideData?.restaurantDeliveryTime,
    rideData?.businessUserId,
    rideData?.pickupAddress,
    rideData?.pickup,
  ]);

  // Reuse the rider/business conversation already shown in Messages. The chat
  // helper resolves an existing conversation for the participant pair before
  // it creates one, so another order with this restaurant stays in the same chat.
  const openRestaurantChat = useCallback(async () => {
    const businessUserId = restaurantProfile?.businessUserId || rideData?.businessUserId;
    if (!businessUserId || !user?.id) return;

    const { data, error } = await supabaseHelpers.findOrCreateRideChat({
      currentUserId: user.id,
      currentUserName: user.name,
      currentUserRole: user.role || 'rider',
      peerId: businessUserId,
      peerRole: 'business',
      peerName: restaurantProfile?.name || rideData?.restaurantName || 'Restaurant',
      peerAvatar: restaurantProfile?.logoImage || rideData?.restaurantImage || undefined,
      contextId: rideData?.id,
    });
    if (error || !data) return;

    try {
      await supabaseHelpers.markChatConversationRead(data.id, user.id);
    } catch (error) {
      console.warn('[ActiveRide] Could not mark restaurant conversation read:', error);
    }
    navigate(`/rider/messages/thread/${data.id}`, {
      state: { rideBackTo: '/rider/active-ride' },
    });
  }, [
    navigate,
    restaurantProfile?.businessUserId,
    restaurantProfile?.logoImage,
    restaurantProfile?.name,
    rideData?.businessUserId,
    rideData?.id,
    rideData?.restaurantImage,
    rideData?.restaurantName,
    user?.id,
    user?.name,
    user?.role,
  ]);

  const driverProgressStatus: Record<RideStatus, string> = {
    'on-the-way': 'on-the-way',
    arrived: 'arrived',
    pickup: 'picked-up',
    'drop-off': 'dropped-off',
    payment: 'awaiting-payment',
  };
  // Notify the customer and business whenever the driver updates a delivery's
  // status (accepted/on-the-way -> arrived -> picked up -> dropped off).
  const notifyDeliveryStatus = (ride: any, dbStatus: string, message?: string, deliveryProofUrl?: string) => {
    if (!isDeliveryRide(ride)) return;
    return supabaseHelpers.notifyDeliveryStatusChange({
      pickupLocation: ride.pickup,
      orderId: ride.orderId,
      orderNumber: ride.orderNumber,
      customerId: ride.customerId || ride.passengerDetails?.[0]?.id,
      senderId: user?.id,
      senderName: user?.name || 'Driver',
      status: dbStatus,
      message,
      deliveryProofUrl,
    }).catch((err) => console.error('❌ Failed to send delivery notification:', err));
  };

  const notifyRideProgress = async (
    ride: any,
    dbStatus: string,
    reason?: string,
    targetPassengerId?: string,
    customMessage?: string,
  ) => {
    if (isDeliveryRide(ride) || !user?.id) return;

    const statusMessages: Record<string, string> = {
      'on-the-way': "I'm on my way to pick you up.",
      arrived: "I've arrived at your pickup location.",
      'picked-up': "I've picked up the passengers and we're heading to the destination.",
      'dropped-off': "I've arrived at your destination.",
      'awaiting-payment': "I'm at your destination. Please prepare your fare.",
      completed: "I've completed the ride. Thank you for riding with me.",
    };
    const message = customMessage || (dbStatus === 'cancelled'
      ? `I've cancelled this ride.${reason ? ` Reason: ${reason}` : ''}`
      : statusMessages[dbStatus]);
    if (!message) return;

    const passengers = Array.isArray(ride.passengerDetails) ? ride.passengerDetails : [];
    const passengerNames = new Map(
      passengers
        .filter((passenger: any) => passenger?.id && !String(passenger.id).includes('_companion_'))
        .map((passenger: any) => [String(passenger.id), passenger.name || 'Customer']),
    );
    const passengerIds = passengers
      .map((passenger: any) => String(passenger?.id || ''))
      .filter((id: string) => id && !/_companion_\d+$/.test(id));
    const sharedRide = Boolean(ride.lobbyId) || ride.type === 'shared';
    const primaryPassengerId = String(ride.customerId || (!sharedRide ? passengerIds[0] : '') || '');
    const allRecipientIds = [...new Set(
      (sharedRide ? [...passengerIds, primaryPassengerId] : [primaryPassengerId])
        .filter((id) => id && !/_companion_\d+$/.test(id)),
    )];
    const targetedRecipientId = targetPassengerId ? passengerAccountId(targetPassengerId) : '';
    const recipientIds = targetedRecipientId ? [targetedRecipientId] : allRecipientIds;
    const rideId = String(ride.lobbyId || ride.id || '');
    if (!rideId || recipientIds.length === 0) return;

    const results = await Promise.all(recipientIds.map((recipientId) =>
      supabaseHelpers.sendRideProgressChatMessage({
        rideId,
        senderId: user.id,
        senderName: user.name || 'Driver',
        recipientId,
        recipientName: passengerNames.get(recipientId) || ride.customerName || 'Customer',
        message,
      }),
    ));
    results.forEach(({ error }) => {
      if (error) console.error('[ActiveRide] Could not send ride progress chat message:', error);
    });
  };

  const confirmSharedPassengerDropoff = async (passengerId: string) => {
    if (!rideData || !isSharedRide || confirmingDropoffPassengerId) return;
    const passengers = Array.isArray(rideData.passengerDetails) ? rideData.passengerDetails : [];
    const targetPassenger = passengers.find((passenger: any) => String(passenger?.id || '') === passengerId);
    if (!targetPassenger || ['dropped-off', 'completed'].includes(String(targetPassenger.dropoff_status || targetPassenger.dropoffStatus || '').toLowerCase())) {
      return;
    }

    setConfirmingDropoffPassengerId(passengerId);
    const droppedOffAt = new Date().toISOString();
    const updatedPassengers = passengers.map((passenger: any) =>
      String(passenger?.id || '') === passengerId
        ? {
            ...passenger,
            dropoff_status: 'dropped-off',
            dropoff_status_updated_at: droppedOffAt,
            payment_status: 'pending',
          }
        : passenger,
    );
    const remainingPassengers = updatedPassengers.filter((passenger: any) =>
      !['dropped-off', 'completed'].includes(String(passenger?.dropoff_status || passenger?.dropoffStatus || '').toLowerCase())
    );
    const hasMoreDropoffs = remainingPassengers.length > 0;
    const nextStatus: RideStatus = hasMoreDropoffs ? 'pickup' : 'payment';
    const updatedRide = { ...rideData, passengerDetails: updatedPassengers, status: nextStatus };
    setRideData(updatedRide);
    writeRiderActiveRide(updatedRide);

    try {
      if (rideData.lobbyId) {
        const passengerUpdate = await supabaseHelpers.updateLobbyPassengerDropoffStatus(
          rideData.lobbyId,
          passengerId,
          'dropped-off',
          { payment_status: 'pending' },
        );
        if (passengerUpdate.error) {
          console.error('[ActiveRide] Could not save passenger drop-off status:', passengerUpdate.error);
        }

        const lobbyStatus = hasMoreDropoffs ? 'picked-up' : 'awaiting-payment';
        const lobbyUpdate = await supabaseHelpers.updateLobbyDriverStatus(
          rideData.lobbyId,
          lobbyStatus,
          SILENT_LOBBY_STATUS_MESSAGE,
        );
        if (lobbyUpdate.error) {
          console.error('[ActiveRide] Could not update shared ride progress:', lobbyUpdate.error);
        }
      } else {
        const rideStatus = hasMoreDropoffs ? 'picked-up' : 'awaiting-payment';
        const rideUpdate = await supabaseHelpers.updateDriverRideStatus(rideData.id, rideStatus, SILENT_LOBBY_STATUS_MESSAGE);
        if (rideUpdate.error) console.error('[ActiveRide] Could not update shared ride progress:', rideUpdate.error);
      }
    } catch (error) {
      console.error('[ActiveRide] Could not finish passenger drop-off:', error);
    } finally {
      setConfirmingDropoffPassengerId(null);
    }
  };

  const updateStatus = (newStatus: RideStatus) => {
    if (!rideData) return;
    const updated = { ...rideData, status: newStatus };
    setRideData(updated);
    writeRiderActiveRide(updated);
    const dbMap: Record<RideStatus, string> = { 'on-the-way': 'on-the-way', 'arrived': 'arrived', 'pickup': 'picked-up', 'drop-off': 'dropped-off', 'payment': 'awaiting-payment' };
    const messageMap: Record<RideStatus, string> = {
      'on-the-way': 'Driver is on the way!',
      'arrived': 'Driver has arrived!',
      'pickup': 'Passengers picked up!',
      'drop-off': 'Arrived at drop-off!',
      'payment': 'Please complete the payment.',
    };
    const waitsForPassengerDropoff = Boolean(
      newStatus === 'drop-off' && isSharedRide && rideData.passengerDetails?.length,
    );
    if (rideData.lobbyId) {
      // Lobby rides have no ride_requests row until completion, so track the
      // driver's progress on the lobby itself so customers see status popups.
      supabaseHelpers.updateLobbyDriverStatus(
        rideData.lobbyId,
        dbMap[newStatus],
        waitsForPassengerDropoff ? SILENT_LOBBY_STATUS_MESSAGE : messageMap[newStatus],
      );
      if (!waitsForPassengerDropoff) void notifyRideProgress(rideData, dbMap[newStatus]);
    } else {
      supabaseHelpers.updateDriverRideStatus(
        rideData.id,
        dbMap[newStatus],
        waitsForPassengerDropoff ? SILENT_LOBBY_STATUS_MESSAGE : messageMap[newStatus],
      );
      // Deliveries: notify the customer and the business.
      notifyDeliveryStatus(rideData, dbMap[newStatus], messageMap[newStatus]);
      if (!waitsForPassengerDropoff) void notifyRideProgress(rideData, dbMap[newStatus]);

      /*
       * Accepting no longer moves the order itself -- it only records the rider,
       * so the shop can sit in a real "rider assigned" state instead of going
       * from searching for one straight to a delivery already under way. That makes
       * this the point where the food is genuinely in the rider's hands and the
       * delivery starts, so the order moves now.
       *
       * `arrived` is deliberately not included: the rider reaching the shop is
       * still the "assigned / heading to the restaurant" phase, and flipping to
       * on-the-way at the door would announce a delivery that has not left yet.
       */
      if (newStatus === 'pickup' && (rideData.orderId || rideData.orderNumber)) {
        supabaseHelpers
          .updateDeliveryOrderStatus(rideData.orderId, rideData.orderNumber, 'on-the-way')
          .catch(() => {});
      }
    }
  };

  const handleProofSelected = (file: File) => {
    setProofError(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const handleProofCleared = () => {
    setProofError(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
    setProofFile(null);
  };

  /**
   * Upload the handover photo and file it against the order.
   *
   * Runs before the order is marked delivered rather than after, so a failure
   * is reported against a ride that is still open and the rider can retake it.
   * Once the order is `delivered` there is no longer a Complete button to come
   * back through.
   */
  const uploadDeliveryProof = async (): Promise<string | null> => {
    if (!rideData?.orderId) {
      setProofError('Could not identify this delivery order. Please reopen the delivery and try again.');
      return null;
    }
    if (!proofFile) {
      setProofError('Take a delivery photo before completing the delivery.');
      return null;
    }

    setIsUploadingProof(true);
    setProofError(null);

    try {
      const { data: proof, error } = await supabaseHelpers.uploadDeliveryProof(
        rideData.orderId,
        proofFile,
      );

      if (error) {
        console.error('Delivery proof upload failed:', error);
        setProofError(error);
        return null;
      }

      const proofUrl = proof?.publicUrl;
      if (!proofUrl) {
        setProofError('Could not get the uploaded delivery photo. Please try again.');
        return null;
      }

      const attached = await supabaseHelpers.attachDeliveryProof(
        rideData.orderId,
        proofUrl,
      );

      if (!attached.success) {
        console.error('Could not attach delivery proof:', attached.error);
        setProofError(attached.error || 'Could not attach the delivery photo.');
        return null;
      }

      return proofUrl;
    } finally {
      setIsUploadingProof(false);
    }
  };

  /** A delivery cannot be completed until its handover photo is attached. */
  const completeDeliveryWithProof = async () => {
    if (isUploadingProof) return;
    if (!imageProofRequired) {
      setShowProofSheet(false);
      await completeRide();
      return;
    }
    if (!proofFile) {
      setProofError('Take a delivery photo before completing the delivery.');
      return;
    }

    const proofUrl = await uploadDeliveryProof();
    if (!proofUrl) return;

    setShowProofSheet(false);
    await completeRide(proofUrl);
  };

  const completeRide = async (deliveryProofUrl?: string) => {
    if (!rideData || isCompleting.current) return;
    isCompleting.current = true;
    try {

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

        // Publish the completion update after the order is saved as delivered.
        // The helper sends the handover photo only to the business chat.
        await notifyDeliveryStatus(
          rideData,
          'completed',
          'Delivery completed!',
          deliveryProofUrl,
        );

        // Notify the business that delivery is completed
        try {
          const orderData = await supabase
            .from('orders')
            .select('business_id, order_number')
            .eq('id', rideData.orderId)
            .single();
          if (orderData?.data?.business_id) {
            const { data: restaurant } = await supabase
              .from('restaurants')
              .select('name')
              .eq('business_user_id', orderData.data.business_id)
              .maybeSingle();
            await supabaseHelpers.notifyBusinessDeliveryCompleted({
              orderId: rideData.orderId,
              orderNumber: orderData.data.order_number || rideData.orderNumber || '',
              restaurantName: restaurant?.name?.trim() || '',
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

    if (!isDeliveryRide(rideData)) {
      await notifyRideProgress(rideData, 'completed');
    }

    logAudit({
      action: 'complete_ride',
      actorRole: 'rider',
      entityType: 'ride_request',
      entityId: rideData.id || rideData.lobbyId,
      summary: `Completed a ${rideData.type || 'ride'}${rideData.pickup ? `: ${rideData.pickup} → ${rideData.dropoff || ''}` : ''}`,
      details: { amount: rideData.amount },
      actorEmail: user?.email,
      actorName: user?.name,
    });

    clearRiderActiveRide();
    setShowRideComplete(true);
    setTimeout(() => {
      navigate('/rider');
    }, 2500);
    } finally {
      isCompleting.current = false;
    }
  };

  const dismissSharedPaymentPrompt = () => {
    setSharedPaymentPromptPassengerId(null);
  };

  const cancelActiveRide = async (reason: string) => {
    if (!rideData || !user?.id || isCancelling.current || isCompleting.current) return;
    isCancelling.current = true;

    const cancelledAt = new Date().toISOString();
    const isDelivery = isDeliveryRide(rideData);
    const serviceLabel = isDelivery
      ? 'delivery'
      : rideData.lobbyId || rideData.type === 'shared'
        ? 'shared ride'
        : 'private ride';
    const cancellationMessage = `The driver cancelled this ${serviceLabel}. Reason: ${reason}`;
    let orderUpdateWarning: string | null = null;

    try {
      if (rideData.lobbyId) {
        const { data, error } = await supabase
          .from('shared_ride_lobbies')
          .update({
            status: 'cancelled',
            driver_status: 'cancelled',
            driver_status_message: cancellationMessage,
            updated_at: cancelledAt,
          })
          .eq('id', rideData.lobbyId)
          .eq('driver_id', user.id)
          .in('status', ['driver_found', 'in_progress'])
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('This shared ride is no longer active or assigned to you.');
      } else {
        const { data: currentRide, error: lookupError } = await supabase
          .from('ride_requests')
          .select('driver_id, accepted_driver_id, status, order_id, pickup_location')
          .eq('id', rideData.id)
          .maybeSingle();

        if (lookupError) throw lookupError;
        if (!currentRide) throw new Error('This ride request could not be found.');
        if (currentRide.status === 'completed' || currentRide.status === 'cancelled') {
          throw new Error('This ride is no longer active.');
        }

        const assignedDriverColumn = currentRide.driver_id === user.id
          ? 'driver_id'
          : currentRide.accepted_driver_id === user.id
            ? 'accepted_driver_id'
            : null;
        if (!assignedDriverColumn) {
          throw new Error('This ride is no longer assigned to you.');
        }

        const { data, error } = await supabase
          .from('ride_requests')
          .update({
            status: 'cancelled',
            driver_status: 'cancelled',
            driver_status_message: cancellationMessage,
            cancel_reason: reason,
            cancelled_by: 'driver',
            updated_at: cancelledAt,
          })
          .eq('id', rideData.id)
          .eq(assignedDriverColumn, user.id)
          .neq('status', 'completed')
          .neq('status', 'cancelled')
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('This ride is no longer active. Refresh the page and try again.');

        if (isDelivery) {
          const orderId = currentRide.order_id
            || rideData.orderId
            || supabaseHelpers.parseOrderIdFromDeliveryPickup(currentRide.pickup_location || rideData.pickup);
          const orderUpdate = {
            status: 'cancelled',
            cancel_reason: reason,
            cancelled_by: 'driver',
            updated_at: cancelledAt,
          };

          const orderResult = orderId
            ? await supabase
              .from('orders')
              .update(orderUpdate)
              .eq('id', orderId)
              .neq('status', 'delivered')
              .select('id')
              .maybeSingle()
            : rideData.orderNumber
              ? await supabase
                .from('orders')
                .update(orderUpdate)
                .eq('order_number', rideData.orderNumber)
                .neq('status', 'delivered')
                .select('id')
                .maybeSingle()
              : null;

          if (!orderResult) {
            orderUpdateWarning = 'The delivery was cancelled, but its food order could not be identified.';
          } else if (orderResult.error || !orderResult.data) {
            console.error('[ActiveRide] Could not cancel the linked food order:', orderResult.error);
            orderUpdateWarning = 'The delivery was cancelled, but the food order status could not be updated. Please contact the restaurant.';
          }

          notifyDeliveryStatus(rideData, 'cancelled', cancellationMessage);
        }
      }

      if (!isDelivery) {
        await notifyRideProgress(rideData, 'cancelled', reason);
      }

      logAudit({
        action: 'cancel_ride',
        actorRole: 'rider',
        entityType: rideData.lobbyId ? 'lobby' : 'ride_request',
        entityId: rideData.lobbyId || rideData.id,
        summary: `Cancelled a ${serviceLabel}${reason ? `: ${reason}` : ''}`,
        details: { reason, orderId: rideData.orderId || null },
        actorEmail: user.email,
        actorName: user.name,
      });

      setShowCancelPrompt(false);
      clearRiderActiveRide();
      syncRideResume(null);
      if (orderUpdateWarning) window.alert(orderUpdateWarning);
      navigate('/rider', { replace: true });
    } catch (error: any) {
      console.error('[ActiveRide] Failed to cancel active ride:', error);
      window.alert(`Could not cancel this ${serviceLabel}: ${error?.message || 'Please try again.'}`);
    } finally {
      isCancelling.current = false;
    }
  };

  const openRideReport = (passenger?: { id: string; name: string }) => {
    setReportPassenger(passenger || null);
    setReportCategory(reportCategories[0]);
    setReportDescription('');
    setReportSubmitError(null);
    setReportSubmitted(false);
    setShowReportModal(true);
  };

  const submitRideReport = async () => {
    if (!rideData || !user?.id || isSubmittingReport) return;
    const description = reportDescription.trim();
    if (description.length < 10) {
      setReportSubmitError('Please describe the issue in at least 10 characters.');
      return;
    }

    setIsSubmittingReport(true);
    setReportSubmitError(null);
    try {
      const category = `Rider report: ${reportCategory}`;
      const reportDetails = reportPassenger
        ? `${description}\n\nPassenger: ${reportPassenger.name} (ID: ${reportPassenger.id})`
        : description;
      const { error } = await supabaseHelpers.createRideReport({
        rideId: rideData.id || rideData.lobbyId,
        reporterId: user.id,
        reporterName: user.name || 'Rider',
        reporterEmail: user.email,
        category,
        description: reportDetails,
        rideRoute: `${rideData.pickup || 'Unknown pickup'} → ${rideData.dropoff || 'Unknown drop-off'}`,
      });
      if (error) throw error;

      logAudit({
        action: 'report_ride',
        actorRole: 'rider',
        entityType: rideData.lobbyId ? 'lobby' : 'ride_request',
        entityId: rideData.lobbyId || rideData.id,
        summary: reportPassenger
          ? `Reported a ride issue with ${reportPassenger.name}: ${reportCategory}`
          : `Reported a ride issue: ${reportCategory}`,
        details: {
          category: reportCategory,
          passengerId: reportPassenger?.id || null,
          passengerName: reportPassenger?.name || null,
        },
        actorEmail: user.email,
        actorName: user.name,
      });
      setReportSubmitted(true);
    } catch (error: any) {
      console.error('[ActiveRide] Failed to submit ride report:', error);
      setReportSubmitError('Could not submit your report. Please try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Watch for the customer cancelling the accepted ride. Lobbies manage their own
  // lifecycle, so only private/delivery requests (which carry an id) are polled.
  useEffect(() => {
    const requestId = rideData?.id;
    if (!requestId || rideData?.lobbyId || customerCancellation) return;

    let cancelled = false;
    const checkForCancellation = async () => {
      const { data } = await supabaseHelpers.getRideRequest(requestId);
      if (cancelled || !data) return;
      if (data.status === 'cancelled') {
        console.log('🚫 Ride cancelled:', data.cancelled_by, data.cancel_reason);
        setCustomerCancellation({
          reason: data.cancel_reason || null,
          cancelledBy: data.cancelled_by || null,
        });
      }
    };

    const interval = setInterval(checkForCancellation, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rideData?.id, rideData?.lobbyId, customerCancellation]);

  /**
   * Pin marker for pickup and drop-off.
   *
   * `color` must be a literal hex, not a CSS variable. Google Maps renders
   * markers in its own canvas and never resolves `var(--x)`, so passing a custom
   * property produced an invalid fill and the pin simply did not draw. Kept
   * explicit hex here for that reason, with the theme token noted alongside so
   * the pairing stays traceable.
   */
  const markerIcon = (hex: string) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${hex}" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.5" r="2.5" fill="white"/></svg>`)}`,
    scaledSize: new (window as any).google.maps.Size(40, 40),
    anchor: new (window as any).google.maps.Point(20, 40)
  });

  // Literal hex values, matching the theme tokens they stand in for. Maps cannot
  // read CSS custom properties; see markerIcon above.
  const PICKUP_HEX = '#2f9e77';   // --success
  const DROPOFF_HEX = '#BC4B1F';  // the existing destination route colour

  if (!rideData) return null;
  const customerDisplayName = firstNameOnly(resolvedName || rideData.customerName) || 'Passenger';

  const nextSharedDropoffPassenger = isSharedRide && rideData.passengerDetails?.length
    ? rideData.passengerDetails.find((passenger: any) => String(passenger?.id || '') === sharedDropoffStops[0]?.id)
      || rideData.passengerDetails.find((passenger: any) =>
        !['dropped-off', 'completed'].includes(String(passenger?.dropoff_status || passenger?.dropoffStatus || '').toLowerCase())
      )
    : null;
  const nextSharedDropoffPassengerId = nextSharedDropoffPassenger?.id == null
    ? ''
    : String(nextSharedDropoffPassenger.id);
  const nextSharedDropoffPassengerIndex = nextSharedDropoffPassengerId
    ? rideData.passengerDetails?.findIndex((passenger: any) => String(passenger?.id || '') === nextSharedDropoffPassengerId) ?? -1
    : -1;
  const nextSharedDropoffPassengerName = nextSharedDropoffPassenger && nextSharedDropoffPassengerIndex >= 0
    ? getSharedPassengerName(nextSharedDropoffPassenger, nextSharedDropoffPassengerIndex, rideData.passengerDetails || [])
    : '';
  const sharedPaymentPassengerIndex = sharedPaymentPromptPassengerId
    ? rideData.passengerDetails?.findIndex((passenger: any) => String(passenger?.id || '') === sharedPaymentPromptPassengerId) ?? -1
    : -1;
  const sharedPaymentPassenger = sharedPaymentPassengerIndex >= 0
    ? rideData.passengerDetails?.[sharedPaymentPassengerIndex] || null
    : null;
  const sharedPaymentPassengerName = sharedPaymentPassenger
    ? getSharedPassengerName(sharedPaymentPassenger, sharedPaymentPassengerIndex, rideData.passengerDetails || [])
    : '';
  const sharedPaymentPassengerId = String(sharedPaymentPassenger?.id || '');
  const paymentPassengerId = isSharedRide
    ? sharedPaymentPassengerId
    : String(rideData.customerId || rideData.passengerDetails?.[0]?.id || '');
  const paymentPassengerName = isSharedRide ? sharedPaymentPassengerName : customerDisplayName;
  const sharedPaymentAvatar = sharedPaymentPassenger?.avatar;
  const sharedPaymentPassengerPhoto = passengerAvatars[passengerAccountId(sharedPaymentPassengerId)]
    || (typeof sharedPaymentAvatar === 'string' && (/^https?:\/\//i.test(sharedPaymentAvatar) || sharedPaymentAvatar.startsWith('data:image/')) ? sharedPaymentAvatar : null);
  const paymentPassengerPhoto = isSharedRide ? sharedPaymentPassengerPhoto : passengerAvatar;
  const sharedPaymentPassengerFare = sharedPaymentPassenger
    ? Number(sharedPaymentPassenger.fare ?? rideData.amount ?? 0)
    : 0;
  const isFinalSharedPassengerPayment = Boolean(sharedPaymentPassenger) && (rideData.passengerDetails || []).every((passenger: any) => {
    if (String(passenger?.id || '') === sharedPaymentPassengerId) return true;
    const dropoffStatus = String(passenger?.dropoff_status || passenger?.dropoffStatus || '').toLowerCase();
    const paymentStatus = String(passenger?.payment_status || passenger?.paymentStatus || '').toLowerCase();
    return dropoffStatus === 'completed' && ['received', 'prepaid'].includes(paymentStatus);
  });
  const handleSharedPaymentAction = async () => {
    if (
      !rideData ||
      !sharedPaymentPassenger ||
      !sharedPaymentPassengerId ||
      confirmingSharedPaymentPassengerId
    ) return;

    const paymentSettledAt = new Date().toISOString();
    const paymentStatus = rideData.payment === 'PREPAID' ? 'prepaid' : 'received';
    const updatedPassengers = (rideData.passengerDetails || []).map((passenger: any) =>
      String(passenger?.id || '') === sharedPaymentPassengerId
        ? {
            ...passenger,
            dropoff_status: 'completed',
            dropoff_status_updated_at: paymentSettledAt,
            payment_status: paymentStatus,
            payment_settled_at: paymentSettledAt,
            ...(paymentStatus === 'received' ? { payment_received_at: paymentSettledAt } : {}),
          }
        : passenger,
    );
    const updatedRide = { ...rideData, passengerDetails: updatedPassengers };
    const hasMoreDropoffs = updatedPassengers.some((passenger: any) =>
      !['dropped-off', 'completed'].includes(String(passenger?.dropoff_status || passenger?.dropoffStatus || '').toLowerCase())
    );
    const progressStatus = hasMoreDropoffs ? 'picked-up' : 'awaiting-payment';

    setConfirmingSharedPaymentPassengerId(sharedPaymentPassengerId);
    setSharedPaymentError(null);
    try {
      if (rideData.lobbyId) {
        const paymentUpdate = await supabaseHelpers.updateLobbyPassengerDropoffStatus(
          rideData.lobbyId,
          sharedPaymentPassengerId,
          'completed',
          {
            payment_status: paymentStatus,
            payment_settled_at: paymentSettledAt,
            ...(paymentStatus === 'received' ? { payment_received_at: paymentSettledAt } : {}),
          },
        );
        if (paymentUpdate.error) throw paymentUpdate.error;

        const progressUpdate = await supabaseHelpers.updateLobbyDriverStatus(
          rideData.lobbyId,
          progressStatus,
          SILENT_LOBBY_STATUS_MESSAGE,
        );
        if (progressUpdate.error) {
          console.error('[ActiveRide] Could not update shared ride progress after payment:', progressUpdate.error);
        }
      } else {
        const paymentUpdate = await supabaseHelpers.updateDriverRideStatus(
          rideData.id,
          progressStatus,
          SILENT_LOBBY_STATUS_MESSAGE,
        );
        if (paymentUpdate.error) throw paymentUpdate.error;
      }

      setRideData(updatedRide);
      writeRiderActiveRide(updatedRide);
      dismissSharedPaymentPrompt();
      try {
        await notifyRideProgress(
          updatedRide,
          'completed',
          undefined,
          sharedPaymentPassengerId,
          'Your ride is complete. The driver has received your payment.',
        );
      } catch (error) {
        console.error('[ActiveRide] Could not notify passenger that payment was received:', error);
      }
      if (isFinalSharedPassengerPayment) void completeRide();
    } catch (error) {
      console.error('[ActiveRide] Could not confirm shared passenger payment:', error);
      setSharedPaymentError('Could not confirm payment. Check your connection and try again.');
    } finally {
      setConfirmingSharedPaymentPassengerId(null);
    }
  };

  /**
   * The single action for the ride's current phase.
   *
   * Derived once so the full sheet and the compact bar cannot drift apart -- they
   * are the same control at two sizes, and two hand-written lists meant a phase
   * could gain a button in one and not the other.
   */
  const startDeliveryCompletion = () => {
    if (imageProofRequired) setShowProofSheet(true);
    else void completeRide();
  };

  const activeAction = (() => {
    switch (rideData.status) {
      case 'on-the-way':
      case 'arrived':
        return { label: 'Confirm Pickup', onClick: () => updateStatus('pickup'), isComplete: false };
      case 'pickup':
        return {
          label: isSharedRide && nextSharedDropoffPassengerName
            ? `Arrived at ${nextSharedDropoffPassengerName}'s drop-off`
            : 'Arrived at Drop-off',
          onClick: () => updateStatus('drop-off'),
          isComplete: false,
        };
      case 'drop-off':
        if (isDeliveryRide(rideData)) {
          return {
            label: 'Complete delivery',
            onClick: startDeliveryCompletion,
            isComplete: true,
          };
        }
        if (isSharedRide && rideData.passengerDetails?.length) {
          return !nextSharedDropoffPassengerId
            ? { label: 'Continue to payment', onClick: () => updateStatus('payment'), isComplete: false }
            : {
                label: confirmingDropoffPassengerId === nextSharedDropoffPassengerId
                  ? 'Saving drop-off…'
                  : `Confirm ${nextSharedDropoffPassengerName}'s drop-off`,
                onClick: () => void confirmSharedPassengerDropoff(nextSharedDropoffPassengerId),
                isComplete: false,
                disabled: confirmingDropoffPassengerId !== null,
              };
        }
        return { label: 'Confirm Drop-off', onClick: () => updateStatus('payment'), isComplete: false };
      case 'payment':
        /*
         * Deliveries raise the photo sheet here instead of completing.
         *
         * This is the only point in the flow where the rider and the customer
         * are in the same room, so it is the only moment a photo of the handover
         * can honestly be taken. The label changes with it, because a button
         * that says 'Complete Ride' and opens a camera is not what anyone
         * pressing it expects.
         */
        if (isDeliveryRide(rideData)) {
          return {
            label: 'Complete delivery',
            onClick: startDeliveryCompletion,
            isComplete: true,
          };
        }
        return { label: 'Complete Ride', onClick: () => completeRide(), isComplete: true };
      default:
        return null;
    }
  })();

  const cancelActionLabel = isDeliveryRide(rideData)
    ? 'Cancel delivery'
    : rideData.lobbyId || rideData.type === 'shared'
      ? 'Cancel shared ride'
      : 'Cancel ride';
  const cancelPromptDescription = isDeliveryRide(rideData)
    ? 'This will cancel the linked food order and notify the customer and restaurant.'
    : rideData.lobbyId || rideData.type === 'shared'
      ? 'This will end the shared ride for every passenger.'
      : 'The passenger will be notified that this ride was cancelled.';

  // The customer cancelled — say so, and show the reason they gave.
  if (customerCancellation) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[4000] flex items-center justify-center p-4">
        <Card className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-2xl text-center">
          <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h3 className="text-xl font-bold text-[#121212] mb-2">Ride cancelled</h3>
          <p className="text-sm text-[#64748B] mb-4">
            {customerCancellation.cancelledBy === 'driver' || customerCancellation.cancelledBy === 'rider'
              ? 'The driver cancelled this ride.'
              : 'The customer cancelled this ride request.'}
          </p>
          {customerCancellation.reason && (
            <div className="p-3 rounded-xl border border-[var(--error)] bg-[var(--error-soft)] text-left mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--error)] mb-1">Reason</p>
              <p className="text-sm text-[var(--error)]">{customerCancellation.reason}</p>
            </div>
          )}
          <Button
            onClick={() => navigate('/rider')}
            className="w-full bg-[var(--error)] hover:opacity-90 text-white font-bold"
          >
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--muted)] pb-20 relative overflow-hidden">
      {/* Ride Complete Popup */}
      {showRideComplete && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-8 mx-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-[var(--success)]" />
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--ink)] mb-2">Ride Complete!</h2>
            <p className="text-[var(--muted-foreground)] text-sm">Thank you for completing this trip.</p>
            <div className="mt-4 px-4 py-2 bg-[var(--success-soft)] rounded-xl">
              <p className="text-[var(--success)] font-bold text-lg">Great job! 🎉</p>
            </div>
          </div>
        </div>
      )}
      {!isDeliveryRide(rideData) && !showRideComplete && (
        (isSharedRide && sharedPaymentPassenger) ||
        (!isSharedRide && ['drop-off', 'payment'].includes(rideData.status))
      ) && (
        <div className="fixed inset-0 z-[4200] flex items-center justify-center bg-black/60 p-4">
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="rider-payment-title"
            className="w-full max-w-sm gap-0 rounded-2xl bg-surface p-5 text-left shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-lg">
                {paymentPassengerPhoto ? (
                  <img src={paymentPassengerPhoto} alt={`${paymentPassengerName || 'Passenger'}’s profile`} className="size-full object-cover" />
                ) : isSharedRide && sharedPaymentPassenger?.emoji ? (
                  sharedPaymentPassenger.emoji
                ) : (
                  <User className="size-5 text-[var(--primary)]" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="rider-payment-title" className="truncate text-lg font-bold leading-6 text-[var(--ink)]">
                  Payment for {paymentPassengerName || 'passenger'}
                </h2>
                <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">
                  {rideData.payment === 'PREPAID'
                    ? isSharedRide
                      ? 'This passenger’s fare was prepaid. Continue the ride after confirming the drop-off.'
                      : 'This ride was prepaid. Confirm completion after the passenger reaches their drop-off.'
                    : isSharedRide
                      ? `Collect this passenger’s fare at their drop-off${isFinalSharedPassengerPayment ? ' before completing the ride' : ''}.`
                      : 'Collect the fare from the passenger before completing the ride.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => openRideReport(paymentPassengerId ? { id: paymentPassengerId, name: paymentPassengerName || 'Passenger' } : undefined)}
                aria-label={`Report an issue with ${paymentPassengerName || 'the passenger'}`}
                title={`Report an issue with ${paymentPassengerName || 'the passenger'}`}
                className="size-10 shrink-0 border-[var(--border)] text-[var(--muted-foreground)]"
              >
                <Flag className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mb-4 space-y-3 rounded-xl bg-[var(--muted)] p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--muted-foreground)]">{isSharedRide ? 'Passenger fare' : 'Total fare'}</span>
                <strong className="text-lg text-[var(--primary)]">₱{(isSharedRide ? sharedPaymentPassengerFare : Number(rideData.amount || 0)).toFixed(2)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <span className="text-sm text-[var(--muted-foreground)]">Payment method</span>
                <strong className="text-sm text-[var(--ink)]">{rideData.payment === 'PREPAID' ? 'Prepaid' : 'Cash'}</strong>
              </div>
            </div>
            {sharedPaymentError && (
              <p role="alert" className="mb-3 text-sm text-[var(--error)]">
                {sharedPaymentError}
              </p>
            )}
            <Button
              type="button"
              onClick={() => isSharedRide ? handleSharedPaymentAction() : void completeRide()}
              disabled={Boolean(confirmingSharedPaymentPassengerId)}
              aria-busy={Boolean(confirmingSharedPaymentPassengerId)}
              className="h-12 w-full bg-[var(--primary)] text-white"
            >
              {isSharedRide && confirmingSharedPaymentPassengerId === sharedPaymentPassengerId
                ? 'Saving payment…'
                : isSharedRide
                ? isFinalSharedPassengerPayment
                  ? rideData.payment === 'PREPAID' ? 'Complete ride' : 'Payment received'
                  : rideData.payment === 'PREPAID' ? 'Continue route' : 'Payment received'
                : rideData.payment === 'PREPAID' ? 'Complete ride' : 'Payment received'}
            </Button>
          </Card>
        </div>
      )}
      {/* Hidden entirely while the chat panel is open, not made transparent.

          Making it transparent was tried first and was the wrong call: this header
          sits in the normal flow, so clearing its fill exposed the page background
          behind it -- the same dark green band, just without a title on it.

          Removing it outright moves the map up into the vacated space, so the strip
          shows the map the driver is actually navigating by. Hiding it is also why
          the back arrow does not need to survive: the chat head closes the panel,
          and the ride screen is still there underneath it. */}
      {!chatPopupOpen && (
      <header className="bg-[var(--primary)] px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-white shadow-md">
        <div className="flex h-10 items-center justify-center">
          <h1 className="text-center text-base font-bold leading-5">Active Ride</h1>
        </div>
      </header>
      )}

      <div className={`relative w-full transition-all duration-300 ${isMinimized ? 'h-[80vh]' : 'h-80'}`}>
        {isMapsLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            // Initial camera only. Deliberately NOT the live driver position: this library
            // re-applies `center` whenever the value changes, which would override
            // both the driver's own panning and the follow toggle. See the
            // `mapCenter` effect. The camera is moved imperatively from here on.
            center={mapCenter}
            onLoad={(map) => {
              mapRef.current = map;
              // The map opens north-up, so that is the angle the rotation loop
              // should ease away from. Without this the first heading would snap
              // the map round in one jump.
              appliedHeadingRef.current = 0;
              // Hand the camera back to the driver on the first deliberate gesture.
              // Listeners are attached here rather than in an effect because the
              // map instance only exists from `onLoad` onwards.
              map.addListener('dragstart', stopFollowingOnDrag);
              map.addListener('zoom_changed', stopFollowingOnZoom);
            }}
            zoom={INITIAL_MAP_ZOOM}
            options={{
              disableDefaultUI: true,
              // One finger pans the map. Two fingers zoom only -- they cannot drag
              // it. The default, 'cooperative', lets a two-finger drag pan as well,
              // and on a phone held at handlebar height that is easy to trigger by
              // accident, which threw the camera somewhere the driver did not ask
              // for and silently switched following off.
              gestureHandling: 'greedy',
              // Double-tap zoom off for the same reason: a stray double tap while
              // steering would change the zoom under a driver who is looking at the
              // road, and re-centring deliberately no longer restores zoom.
              disableDoubleClickZoom: true,
            }}
          >
            <MapTypeToggle />
            {driverLocation && (
              <Marker position={driverLocation} icon={{ url: tricycleIcon, scaledSize: new (window as any).google.maps.Size(44, 44), anchor: new (window as any).google.maps.Point(22, 22) }} zIndex={100} />
            )}
            {/* Both endpoints stay pinned for the whole ride, not just whichever
                one is next. Showing only the active leg hid the destination from
                the driver, so there was nothing on screen to steer toward. */}
            {rideData.pickupLat && (
              <Marker
                position={{ lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) }}
                icon={isDeliveryRide(rideData) ? createRestaurantMarkerIcon() : markerIcon(PICKUP_HEX)}
                title={isDeliveryRide(rideData) ? "Restaurant pickup" : "Pickup"}
                zIndex={isHeadingToPickup ? 90 : 70}
              />
            )}
            {isSharedRide
              ? sharedDropoffStops.map((stop, index) => (
                <Marker
                  key={stop.id}
                  position={stop.position}
                  icon={markerIcon(stop.color)}
                  title={`${stop.name} drop-off`}
                  label={{ text: String(index + 1), color: '#FFFFFF', fontSize: '11px', fontWeight: '700' }}
                  zIndex={!isHeadingToPickup ? 90 + index : 70 + index}
                />
              ))
              : rideData.dropoffLat != null && rideData.dropoffLng != null && (
                <Marker
                  position={{ lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) }}
                  icon={isDeliveryRide(rideData) ? createCustomerMarkerIcon() : markerIcon(DROPOFF_HEX)}
                  title={isDeliveryRide(rideData) ? "Customer drop-off" : "Drop-off"}
                  zIndex={!isHeadingToPickup ? 90 : 70}
                />
              )}

            {/* Each colored segment ends at the matching passenger's drop-off. */}
            {sharedDropoffRoutes.map(route => (
              <Polyline
                key={`dropoff-route-${route.id}`}
                path={route.path}
                options={{
                  strokeColor: route.color,
                  strokeWeight: 6,
                  strokeOpacity: 0.92,
                  zIndex: 20,
                }}
              />
            ))}

            {/* Road route for the current leg from Routes API. */}
            {routePath && (!isSharedRide || isHeadingToPickup) && (
              <Polyline
                path={routePath}
                options={{
                  strokeColor: isHeadingToPickup ? PICKUP_HEX : DROPOFF_HEX,
                  strokeWeight: 6,
                  strokeOpacity: 0.9,
                  zIndex: 10,
                }}
              />
            )}

            {/* Legacy Directions service fallback route line. */}
            {directions && (!isSharedRide || isHeadingToPickup) && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  // Keep the camera on the driver. Without this the renderer re-fits
                  // the map to the whole route every time the directions refresh
                  // (i.e. on every GPS update), so the pickup and drop-off endpoints
                  // keep yanking the centre off the driver icon.
                  preserveViewport: true,
                  polylineOptions: {
                    // Literal hex: Maps does not resolve CSS custom properties,
                    // so `var(--success)` here left the route undrawn.
                    strokeColor: isHeadingToPickup ? PICKUP_HEX : DROPOFF_HEX,
                    strokeWeight: 6,
                    strokeOpacity: 0.9,
                  },
                }}
              />
            )}

            {/* Straight-line fallback. If both road-routing APIs fail while the
                destination coordinates are known, keep a visible line toward
                the active destination until a road route can be loaded. */}
            {!directions && !routePath && driverLocation && (!isSharedRide || isHeadingToPickup) && (() => {
              const dest = isHeadingToPickup
                ? (rideData.pickupLat != null && rideData.pickupLng != null
                    ? { lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) }
                    : null)
                : (rideData.dropoffLat != null && rideData.dropoffLng != null
                    ? { lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) }
                    : null);
              if (!dest) return null;
              return (
                <Polyline
                  path={[{ lat: driverLocation.lat, lng: driverLocation.lng }, dest]}
                  options={{
                    strokeColor: isHeadingToPickup ? PICKUP_HEX : DROPOFF_HEX,
                    strokeOpacity: 0.75,
                    strokeWeight: 4,
                    geodesic: true,
                  }}
                />
              );
            })()}

          </GoogleMap>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-[var(--muted)] space-y-4 p-6">
            <Navigation className="w-12 h-12 text-[var(--primary)] animate-pulse" />
            <p className="text-[var(--muted-foreground)] font-bold text-center">Loading Map...</p>
            {!driverLocation && (
              <div className="text-center">
                <p className="text-sm text-[var(--muted-foreground)] mb-3">Waiting for your device location...</p>
                <Button onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => reportDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { force: true }),
                    () => alert('Please enable Location Services in your device settings to use navigation.'),
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                }} className="bg-[var(--primary)]">
                  <MapPin className="w-4 h-4 mr-2" />Enable Location
                </Button>
              </div>
            )}
          </div>
        )}
        {/* Pickup and drop-off named on the map itself.
            Shown only while the sheet is minimized. That is the one mode where
            the map is fully visible: the compact bar is a single ~76px row, so
            nothing covers the lower edge. Expanded, the sheet's own Pickup and
            Drop-off rows sit right there with the same information, so the map
            labels would be a duplicate. The pins always stay; only this text
            overlay toggles. */}
        {isMinimized && (
          <div className="absolute left-3 bottom-3 flex flex-col gap-1.5 pointer-events-none">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold shadow-md">
              <span className="size-2.5 rounded-full" style={{ background: PICKUP_HEX }} aria-hidden="true" />
              Pickup · {rideData.pickup}
            </span>
            {isSharedRide && sharedDropoffStops.length > 0
              ? sharedDropoffStops.map(stop => (
                <span key={`dropoff-label-${stop.id}`} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold shadow-md">
                  <span className="size-2.5 rounded-full" style={{ background: stop.color }} aria-hidden="true" />
                  {stop.name} · Drop-off
                </span>
              ))
              : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold shadow-md">
                  <span className="size-2.5 rounded-full" style={{ background: DROPOFF_HEX }} aria-hidden="true" />
                  Drop-off · {rideData.dropoff}
                </span>
              )}
          </div>
        )}
        {/* Re-centre on the driver.
            Appears only once following has stopped, i.e. only when the camera is
            somewhere the driver chose. Tapping it brings the tricycle back to the
            middle of the map, resumes following, and resumes facing the direction
            of travel. The zoom is deliberately untouched.

            Centred horizontally but sitting at the bottom of the map rather than dead in the
            middle: the centre is where the driver is looking and where the tricycle
            marker is drawn, so a control there covered the very thing it acts on.
            At the bottom it is in thumb reach and clear of the marker. `bottom-4`
            is measured against the map's own container, which ends above the detail
            sheet, so the button never ends up underneath it. */}
        {!followDriver && driverLocation && (
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Re-centre map on my location"
            className="absolute left-1/2 bottom-4 -translate-x-1/2 z-[4003] inline-flex items-center gap-2 rounded-full border border-[var(--primary)] bg-[var(--primary)] pl-3 pr-5 py-3 text-[var(--primary-foreground)] shadow-xl active:scale-95 transition-transform"
          >
            <Navigation className="w-5 h-5 text-[var(--primary-foreground)]" />
            <span className="text-sm font-bold text-[var(--primary-foreground)]">Re-centre</span>
          </button>
        )}
        {/* Route phase indicator banner */}
        <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-white text-xs font-bold shadow-md flex items-center gap-1.5 ${isHeadingToPickup ? 'bg-[var(--success)]' : 'bg-[var(--primary)]'}`}>
          <div className={`w-2 h-2 rounded-full ${isHeadingToPickup ? 'bg-surface animate-pulse' : 'bg-surface animate-pulse'}`} />
          {isHeadingToPickup ? 'Heading to Pickup' : 'Heading to Drop-off'}
        </div>
      </div>

      {/* Floating chat head. See FloatingChatHead for the drag, snap, badge and
          ripple behaviour -- both sides of a ride use that one component so the
          two cannot drift apart. Appears once the ride has a conversation and
          disappears when the ride is over. */}
      {/* Chat as an overlay rather than a page.
          Navigating to the Messages tab unmounted this screen, which is why the
          floating head vanished the moment the chat opened and a gap had to be
          reserved above the thread header -- a band of the ride screen's own
          background showing through the top of the chat. */}
      <RideChatOverlay
        open={chatPopupOpen}
        conversationId={chatId}
        peerId={chatPeer?.id || rideData?.customerId || passengerAccountId(rideData?.passengerDetails?.[0]?.id) || null}
        currentUserId={user?.id ?? null}
        peerAvatar={chatPeer ? chatPeer.avatar : passengerAvatar}
        peerName={firstNameOnly(chatPeer?.name || customerDisplayName) || 'Passenger'}
        peerIsGroup={chatPeer?.isGroup ?? rideData.customerPhoto === 'shared'}
        senderRole="rider"
        onClose={() => setChatPopupOpen(false)}
      />

      {/* Hidden while the panel is open: the panel carries its own head, and both
          would otherwise sit in the same top-right corner on top of each other. */}
      {chatStarted && rideData.status !== 'completed' && (
        <FloatingChatHead
          headId={chatId || undefined}
          hidden={chatPopupOpen}
          storageKey="trikeserve_chat_head_pos_rider"
          peerAvatar={chatPeer ? chatPeer.avatar : passengerAvatar}
          peerIsGroup={chatPeer?.isGroup ?? rideData.customerPhoto === 'shared'}
          peerLabel={firstNameOnly(chatPeer?.name || customerDisplayName) || 'passenger'}
          unread={unreadFromPassenger}
          pulseKey={pulseKey}
          opened={chatOpened}
          onOpen={openPassengerChat}
          onInitialResolve={resolvePassengerChat}
        />
      )}

      <LocationBanner problem={locationProblem} className="mx-3 mt-3" />

      {/* Minimized, the sheet hugs its content instead of holding 40vh of
          empty panel. It was a fixed-height box with a compact card at the top
          of it, so "minimizing" only shrank the map by the same amount as before
          and left a large blank area. */}
      <div
        className={
          isMinimized
            ? 'fixed bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-3 z-[1001]'
            : 'p-4 space-y-4'
        }
      >
        {/* Drag handle: pulls the sheet up to cover the map, or pushes it back
            down. A tap also toggles, so it works without a drag gesture. The
            header toggle that used to do this was removed. */}
        <button
          type="button"
          onClick={() => setIsMinimized((v) => !v)}
          aria-label={isMinimized ? 'Show ride details' : 'Minimize ride details'}
          aria-expanded={!isMinimized}
          className="mx-auto mb-1 flex h-9 w-full max-w-16 items-center justify-center rounded-full hover:bg-[var(--muted)] active:bg-[var(--muted)]"
        >
          {isMinimized
            ? <ChevronUp className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" />
            : <ChevronDown className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" />}
        </button>

        {isMinimized && (
          /* Compact bar.
             Minimizing previously just stretched the same full card to 40vh, so
             the map was covered by the same amount of white space it had before.
             This collapses to the three things a driver needs at a glance while
             driving: who is in the car, and the one action for the current
             phase. Everything else comes back on a tap. */
          <Card className="flex-row items-center gap-3 p-3 border-2 border-[var(--primary)] shadow-2xl">
            {/* `flex-row` is load-bearing: the shared Card component ships its own
                `flex-col`, and Tailwind resolves the two classes by stylesheet
                order rather than the order they appear in `className`. Without
                the explicit row direction the whole bar stacked vertically and
                read as a narrow column, which is the opposite of what it is for. */}
            {isSharedRide && rideData.passengerDetails?.length ? (
              <div className="flex shrink-0 items-center pl-1">
                {rideData.passengerDetails.map((passenger: any, index: number) => {
                  const passengerId = String(passenger?.id ?? `passenger-${index}`);
                  const accountId = passengerAccountId(passengerId);
                  const companionOwner = passengerId.includes('_companion_')
                    ? rideData.passengerDetails?.find((candidate: any) => String(candidate?.id || '') === accountId)
                    : null;
                  const displayName = companionOwner?.name
                    ? `${passenger.name || 'Companion'} of ${companionOwner.name}`
                    : passenger.name || 'Passenger';
                  const profileUrl = passengerAvatars[accountId]
                    || (typeof passenger.avatar === 'string' && (/^https?:\/\//i.test(passenger.avatar) || passenger.avatar.startsWith('data:image/')) ? passenger.avatar : null);
                  return (
                    <span
                      key={passengerId}
                      title={displayName}
                      className="-ml-2 grid size-8 place-items-center overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--primary-soft)] text-sm first:ml-0"
                    >
                      {profileUrl ? (
                        <img src={profileUrl} alt={`${displayName}'s profile`} className="size-full object-cover" />
                      ) : (
                        passenger.emoji || <User className="size-4 text-[var(--primary)]" aria-hidden="true" />
                      )}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="size-11 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
                {passengerAvatar ? (
                  <img
                    src={passengerAvatar}
                    alt={`${customerDisplayName}'s profile`}
                    className="w-full h-full object-cover"
                  />
                ) : rideData.customerPhoto === 'shared' ? (
                  <Users className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
                ) : (
                  <User className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
                )}
              </div>
            )}
            {/* Details run left to right across the bar: photo, name, fare and
                destination, then the controls. The name and the detail were
                stacked in a column, which made the bar taller for no gain and
                pushed the action button toward the edge. */}
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate font-bold text-[var(--ink)]">
                {isSharedRide ? 'Passengers' : customerDisplayName}
              </p>
              <span className="text-[var(--muted-foreground)]" aria-hidden="true">·</span>
              <p className="truncate text-xs text-[var(--muted-foreground)]">
                ₱{rideData.amount} · {isHeadingToPickup ? 'To pickup' : 'To drop-off'}
              </p>
            </div>
            {!isSharedRide && (
              <Button
                onClick={() => openPassengerChat()}
                aria-label="Message passenger"
                className="size-11 flex-shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] flex items-center justify-center"
              >
                <MessageSquare className="w-4 h-4 text-[var(--primary)]" aria-hidden="true" />
              </Button>
            )}
          </Card>
        )}

        {/*
            Phase action, below the profile row.

            It sat inline after the chat button, which squeezed the name and fare
            into a narrow truncated strip. It is the one control that changes the
            ride's state, so it gets a full-width row of its own, directly beneath
            the passenger details.

            Same size in both states, so the control does not appear to grow or
            shrink as the sheet is toggled -- it is the same action either way.
            In normal flow rather than absolutely positioned: the sheet is a
            bottom-anchored box, so document order is what places the row, and no
            hand-tuned offset can drift out of alignment with a bar whose height
            changes with the name and fare.
        */}
        {!isMinimized && (
          <>
            <Card className="p-4 border-2 border-[var(--muted)] shadow-sm">
              <div className="flex items-start gap-4 mb-3">
                {!isSharedRide && (
                  <div className="size-14 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
                    {passengerAvatar ? (
                      <img
                        src={passengerAvatar}
                        alt={`${customerDisplayName}'s profile`}
                        className="w-full h-full object-cover"
                      />
                    ) : rideData.customerPhoto === 'shared' ? (
                      <Users className="w-6 h-6 text-[var(--primary)]" aria-hidden="true" />
                    ) : (
                      <User className="w-6 h-6 text-[var(--primary)]" aria-hidden="true" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-lg">{isSharedRide ? 'Passengers' : customerDisplayName}</h2>
                  {isSharedRide && rideData.passengerDetails && rideData.passengerDetails.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {rideData.passengerDetails.map((p: any, index: number) => {
                        const passengerId = String(p.id ?? `passenger-${index}`);
                        const ownerId = passengerAccountId(passengerId);
                        const passengerName = getSharedPassengerName(p, index, rideData.passengerDetails || []);
                        const profileUrl = passengerAvatars[ownerId]
                          || (typeof p.avatar === 'string' && (/^https?:\/\//i.test(p.avatar) || p.avatar.startsWith('data:image/')) ? p.avatar : null);
                        const stop = sharedDropoffStops.find(item => item.id === passengerId);
                        const isDroppedOff = ['dropped-off', 'completed'].includes(String(p.dropoff_status || p.dropoffStatus || '').toLowerCase());
                        const isPaymentSettled = ['received', 'prepaid'].includes(String(p.payment_status || p.paymentStatus || '').toLowerCase());
                        const isNextDropoff = !isDroppedOff && nextSharedDropoffPassengerId === passengerId;
                        return (
                          <Card key={passengerId} className="border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-base">
                                  {profileUrl ? (
                                    <img src={profileUrl} alt={`${passengerName}'s profile`} className="size-full object-cover" />
                                  ) : (
                                    p.emoji || <User className="size-4 text-[var(--primary)]" aria-hidden="true" />
                                  )}
                                </span>
                                {stop && <span className="size-2 shrink-0 rounded-full" style={{ background: stop.color }} aria-hidden="true" />}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">{passengerName}</span>
                                  <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">
                                    Drop-off: {getSharedPassengerDropoff(p, index, rideData)}
                                  </span>
                                </span>
                              </span>
                              {p.fare != null && (
                                <span className="shrink-0 text-right">
                                  <span className="block text-[10px] text-[var(--muted-foreground)]">Fare</span>
                                  <span className="text-sm font-bold text-[var(--ink)]">₱{Number(p.fare).toFixed(2)}</span>
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isPaymentSettled ? 'bg-[var(--success-soft)] text-[var(--success)]' : isDroppedOff ? 'bg-[var(--amber-soft)] text-[var(--amber-ink)]' : isNextDropoff ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
                                {isPaymentSettled ? 'Completed' : isDroppedOff ? 'Payment due' : isNextDropoff ? (rideData.status === 'drop-off' ? 'At drop-off' : 'Next drop-off') : 'Upcoming'}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => openRideReport({ id: passengerId, name: passengerName })}
                                aria-label={`Report an issue with ${passengerName}`}
                                title={`Report an issue with ${passengerName}`}
                                className="shrink-0 border-[var(--border)]"
                              >
                                <Flag className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void openPassengerChat({ id: passengerId, name: passengerName })}
                              aria-label={`Message ${passengerName}`}
                              className="mt-2 w-full justify-start border-[var(--border)] py-2 text-sm font-semibold text-[var(--muted-foreground)]"
                            >
                              <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />
                              Message
                            </Button>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <Badge className="bg-[var(--primary)]">₱{rideData.amount}</Badge>
                    <Badge variant="outline" className="text-[var(--muted-foreground)]">{rideData.payment === 'COD' ? 'Cash' : 'Prepaid'}</Badge>
                  </div>
                </div>
                {!isSharedRide && (
                  <Button
                    type="button"
                    onClick={() => openPassengerChat()}
                    aria-label="Message customer"
                    title="Message customer"
                    className="size-11 flex-shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] flex items-center justify-center"
                  >
                    <MessageSquare className="w-4 h-4 text-[var(--primary)]" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <div className="space-y-3 mt-4">
                <div className={`flex gap-3 p-2 rounded-lg ${isHeadingToPickup ? 'bg-[var(--success-soft)] border border-[var(--success-soft)]' : ''}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${isHeadingToPickup ? 'bg-[var(--success)]' : 'bg-[var(--muted-foreground)]'}`} />
                  <div className="flex-1 text-sm">
                    <p className="text-[var(--muted-foreground)] text-xs">Pickup</p>
                    <p className="font-semibold">{rideData.pickup}</p>
                  </div>
                  {isHeadingToPickup && <span className="text-[10px] bg-[var(--success)] text-white px-2 py-0.5 rounded-full font-bold self-center">HERE</span>}
                </div>
                {isSharedRide && rideData.passengerDetails?.length ? (
                  rideData.passengerDetails.map((passenger: any, index: number) => {
                    const passengerId = String(passenger?.id ?? `passenger-${index}`);
                    const passengerName = getSharedPassengerName(passenger, index, rideData.passengerDetails || []);
                    const stop = sharedDropoffStops.find(item => item.id === passengerId);
                    return (
                      <div key={`dropoff-${passengerId}`} className="flex gap-3 rounded-lg border border-[var(--border)] p-2">
                        <span
                          className="mt-1.5 size-2 shrink-0 rounded-full"
                          style={{ background: stop?.color || SHARED_DROPOFF_COLORS[index % SHARED_DROPOFF_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="text-xs text-[var(--muted-foreground)]">Drop-off for {passengerName}</p>
                          <p className="truncate font-semibold">{getSharedPassengerDropoff(passenger, index, rideData)}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={`flex gap-3 p-2 rounded-lg ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-[var(--error-soft)] border border-[var(--error-soft)]' : ''}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-[var(--primary)]' : 'bg-[var(--muted-foreground)]'}`} />
                    <div className="flex-1 text-sm">
                      <p className="text-[var(--muted-foreground)] text-xs">Drop-off</p>
                      <p className="font-semibold">{rideData.dropoff}</p>
                    </div>
                    {!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) && <span className="text-[10px] bg-[var(--primary)] text-white px-2 py-0.5 rounded-full font-bold self-center">HERE</span>}
                  </div>
                )}
              </div>
            </Card>
            {isDeliveryRide(rideData) && (
              <Card className="p-4 border-2 border-[var(--muted)] shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="size-14 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
                    <StoreLogo logo={restaurantProfile?.logoImage || undefined} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Restaurant</p>
                    <h2 className="truncate font-bold text-lg text-[var(--ink)]">
                      {restaurantProfile?.name || rideData.restaurantName || rideData.pickup || 'Restaurant'}
                    </h2>
                    {restaurantProfile?.subtitle && (
                      <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{restaurantProfile.subtitle}</p>
                    )}
                    {(restaurantProfile?.cuisine || restaurantProfile?.deliveryTime) && (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {[restaurantProfile.cuisine, restaurantProfile.deliveryTime].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={openRestaurantChat}
                    disabled={!restaurantProfile?.businessUserId}
                    aria-label="Message restaurant"
                    title="Message restaurant"
                    className="size-11 flex-shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4 text-[var(--primary)]" aria-hidden="true" />
                  </Button>
                </div>
                {restaurantProfile?.address && (
                  <div className="mt-3 flex items-start gap-2 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted-foreground)]">
                    <MapPin className="mt-0.5 size-4 flex-shrink-0" aria-hidden="true" />
                    <span>{restaurantProfile.address}</span>
                  </div>
                )}
              </Card>
            )}
            {isDeliveryRide(rideData) && (
              <Card className="p-4 border-2 border-[var(--muted)] shadow-sm">
                <h3 className="text-center font-bold text-[var(--ink)] text-sm mb-3">Order Progress</h3>
                <OrderStatusUpdates
                  status="preparing"
                  driverStatus={driverProgressStatus[rideData.status]}
                  deliveryMode="delivery"
                />
              </Card>
            )}
          </>
        )}

        {/*
            Phase action, last in the sheet -- beneath the profile and the
            pickup/drop-off rows in either state.

            It used to sit inline next to the chat button, which squeezed the name
            and fare into a narrow truncated strip. It is the one control that
            changes the ride's state, so a full-width row of its own keeps it
            distinct from the passenger's details.

            Identical size in both states, so the control does not appear to grow
            or shrink as the sheet is toggled. The `-mx-1` cancels the expanded
            container's wider padding so it matches the minimized sheet's width
            exactly rather than being 24px narrower.

            In normal flow rather than absolutely positioned: the sheet is a
            bottom-anchored box, so document order is what places the row, and no
            hand-tuned offset can drift out of alignment with a bar whose height
            changes with the name and fare.
        */}
        {activeAction && (
          <Button
            onClick={activeAction.onClick}
            disabled={'disabled' in activeAction && activeAction.disabled}
            className={`${activeAction.isComplete ? 'bg-[var(--success)]' : 'bg-[var(--primary)]'} -mx-1 mt-2 w-[calc(100%+0.5rem)] py-4 text-base font-bold shadow-lg`}
          >
            {activeAction.label}
          </Button>
        )}
        {(!isSharedRide || !rideData.passengerDetails?.length) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => openRideReport()}
            className="-mx-1 mt-2 w-[calc(100%+0.5rem)] border-[var(--border)] py-3 font-semibold text-[var(--muted-foreground)]"
          >
            <Flag className="size-4" aria-hidden="true" />
            Report an issue
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCancelPrompt(true)}
          aria-label={cancelActionLabel}
          className="-mx-1 mt-2 w-[calc(100%+0.5rem)] border-[var(--error)] py-3 font-bold text-[var(--error)] hover:bg-[var(--error-soft)]"
        >
          {cancelActionLabel}
        </Button>

      </div>

      {showReportModal && (
        <div
          className="fixed inset-0 z-[4300] flex items-center justify-center bg-black/60 p-4"
          onClick={() => { if (!isSubmittingReport) setShowReportModal(false); }}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-ride-report-title"
            className="w-full max-w-md gap-0 rounded-2xl bg-surface p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="active-ride-report-title" className="text-lg font-bold text-[var(--ink)]">
                  {reportSubmitted
                    ? 'Report sent'
                    : reportPassenger
                      ? `Report an issue with ${reportPassenger.name}`
                      : 'Report a ride issue'}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {reportSubmitted
                    ? 'Support has received your report.'
                    : reportPassenger
                      ? `Support will receive your report with ${reportPassenger.name}'s passenger and ride details.`
                      : 'Send the details to support for review.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (!isSubmittingReport) setShowReportModal(false); }}
                disabled={isSubmittingReport}
                aria-label="Close report form"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {reportSubmitted ? (
              <div className="mt-5 rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] p-4 text-sm font-medium text-[var(--success-ink)]">
                Thank you for letting us know. The ride details were included with your report.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="active-ride-report-category" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    Issue type
                  </label>
                  <select
                    id="active-ride-report-category"
                    value={reportCategory}
                    onChange={(event) => setReportCategory(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  >
                    {reportCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="active-ride-report-description" className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                    What happened?
                  </label>
                  <textarea
                    id="active-ride-report-description"
                    value={reportDescription}
                    onChange={(event) => {
                      setReportDescription(event.target.value);
                      if (reportSubmitError) setReportSubmitError(null);
                    }}
                    maxLength={1000}
                    rows={4}
                    placeholder="Describe the issue for support..."
                    className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  />
                  <p className="mt-1 text-right text-xs text-[var(--muted-foreground)]">{reportDescription.length}/1000</p>
                </div>
                {reportSubmitError && <p role="alert" className="text-sm text-[var(--error)]">{reportSubmitError}</p>}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              {reportSubmitted ? (
                <Button type="button" onClick={() => setShowReportModal(false)} className="w-full bg-[var(--primary)] text-white">
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowReportModal(false)}
                    disabled={isSubmittingReport}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitRideReport}
                    disabled={isSubmittingReport || !reportDescription.trim()}
                    className="flex-1 bg-[var(--primary)] text-white"
                  >
                    {isSubmittingReport ? 'Sending…' : 'Send report'}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/*
        The handover photo sheet.

        A sheet rather than an inline row because it interrupts a flow the rider
        is in the middle of: they are standing at the door, so this has to be one
        obvious thing to deal with and then go away.

        The customer is named rather than "the customer" -- if the photo comes out
        wrong they will want to know whose order to re-check.

        Cancel only closes this sheet. The delivery stays open until the required
        handover photo has uploaded successfully.
      */}
      {showProofSheet && imageProofRequired && (
        <div
          className="fixed inset-0 z-[4000] flex items-end justify-center bg-black/60 p-4"
          onClick={() => {
            if (!isUploadingProof) setShowProofSheet(false);
          }}
        >
          <Card
            className="w-full max-w-md rounded-2xl bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--ink)]">Handover photo</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Take a photo of the food being handed over
                  {rideData?.customerName ? ` to ${customerDisplayName}` : ''}. It is
                  kept on the order as proof of delivery. This photo is required to complete the delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isUploadingProof) setShowProofSheet(false);
                }}
                disabled={isUploadingProof}
                aria-label="Close"
                className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] disabled:opacity-50"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <ProofCapture
              mode="camera"
              label="Delivery photo (required)"
              hint="Take a clear photo of the order or handover."
              value={proofPreview}
              busy={isUploadingProof}
              error={proofError}
              onSelect={handleProofSelected}
              onClear={handleProofCleared}
            />

            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setShowProofSheet(false)}
                disabled={isUploadingProof}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={completeDeliveryWithProof}
                disabled={isUploadingProof}
                className="flex-1 bg-[var(--success)] hover:bg-[var(--success)] text-white font-bold disabled:opacity-50"
              >
                {isUploadingProof ? 'Uploading…' : 'Complete delivery'}
              </Button>
            </div>

            {proofError && (
              <p role="alert" className="mt-2 text-xs text-[var(--error)]">
                {proofError}
              </p>
            )}
          </Card>
        </div>
      )}

      <ReasonPromptModal
        isOpen={showCancelPrompt}
        title={`${cancelActionLabel[0].toUpperCase()}${cancelActionLabel.slice(1)}?`}
        description={cancelPromptDescription}
        confirmLabel={cancelActionLabel}
        placeholder="Tell us why you need to cancel..."
        onSubmit={cancelActiveRide}
        onCancel={() => setShowCancelPrompt(false)}
      />
    </div>
  );
}
