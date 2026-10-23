import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Store, Users, Car, Clock, Check, X, CheckCircle, MapPin, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, Polyline, Polygon } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import FullSizeImagePreview from "../ui/FullSizeImagePreview";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useAuth } from "../../contexts/AuthContext";
import { isDeliveryServiceMode, isQueueGatedType, useTerminalQueue } from "../../hooks/useTerminalQueue";
import TerminalQueueCard from "./TerminalQueueCard";
import { isPointInPolygon, isPointWithinTerminalRoute, normalizeBoundaryRoad, normalizeBoundaryArea, normalizeRoadWidth, DEFAULT_ROAD_WIDTH_M, supabaseHelpers, logAudit, geocodeAddress, type LatLngPoint } from "@/lib/supabase";
import { supabase } from "../../../lib/supabase";
import useMapLoader from "@/lib/mapLoader";
import { searchPlacesText } from "@/lib/placesApi";
import { createCustomerMarkerIcon, createRestaurantMarkerIcon } from "@/lib/mapIcons";
import {
  DEFAULT_BORDER_COLOR,
  DEFAULT_ROUTE_COLOR,
  DEFAULT_TERMINAL_COLOR,
  normalizeBorderColor,
  normalizeRouteColor,
  normalizeTerminalColor,
  terminalMarkerIcon,
} from "../ui/TerminalIcon";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import ActiveRideButton from "./ActiveRideButton";
import ReasonPromptModal from "../ui/reason-prompt-modal";
import { backfillLegacySharedRidePassengerFares, sumSharedRidePassengerFares } from "@/lib/pricing";

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

function fitMapToRoute(map: google.maps.Map, points: google.maps.LatLngLiteral[]) {
  if (points.length < 2) return;
  const bounds = new google.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  map.fitBounds(bounds, 48);
}

function reverseGeocodeNearestRoad(point: google.maps.LatLngLiteral): Promise<string | null> {
  const google = (window as any)?.google;
  if (!google?.maps?.Geocoder) return Promise.resolve(null);
  return new Promise(resolve => {
    new google.maps.Geocoder().geocode({ location: point }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.length) {
        resolve(null);
        return;
      }
      const nearestRoad = results.find((result: any) => result.types?.includes('street_address'))
        || results.find((result: any) => result.types?.includes('route'))
        || results[0];
      resolve(nearestRoad?.formatted_address || null);
    });
  });
}

function readAddressCoordinates(address?: string | null): { lat: number; lng: number } | null {
  if (!address) return null;
  const coordinatePart = address.includes('|') ? address.split('|').at(-1) || '' : address;
  const match = coordinatePart.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function displayOrderAddress(address?: string | null): string | undefined {
  const readable = address?.split('|')[0]?.trim();
  return readable || undefined;
}

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
  restaurantName?: string;
  restaurantImage?: string;
  restaurantAddress?: string;
  restaurantLat?: number;
  restaurantLng?: number;
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
  restaurantPackagePhotoUrl?: string;
  lobbyId?: string;
  passengerDetails?: Array<{
    id: string;
    name: string;
    emoji: string;
    joinedAt: string;
    dropoff?: string;
    dropoffAddress?: string;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    fare?: number;
  }>;
  maxPassengers?: number;
  terminalId?: string | null;
}

interface PassengerDropoffStop {
  id: string;
  passengerNames: string[];
  address: string;
  coords: google.maps.LatLngLiteral | null;
}

export default function PassengerRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'shared' | 'private' | 'delivery'>('all');
  const [requests, setRequests] = useState<PassengerRequest[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const [previewRequest, setPreviewRequest] = useState<PassengerRequest | null>(null);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [pickupRoutePath, setPickupRoutePath] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [dropoffRoutePath, setDropoffRoutePath] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [showPickupRoute, setShowPickupRoute] = useState(true);
  const [showDropoffRoute, setShowDropoffRoute] = useState(true);
  const [isPreviewMapFullscreen, setIsPreviewMapFullscreen] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [resolvedPickupCoords, setResolvedPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedPickupAddress, setResolvedPickupAddress] = useState<string | null>(null);
  const [resolvedDropoffCoords, setResolvedDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedPassengerDropoffs, setResolvedPassengerDropoffs] = useState<PassengerDropoffStop[]>([]);
  const [previewMapCenter, setPreviewMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const previewMapRef = useRef<google.maps.Map | null>(null);
  const packagePhotoColumnAvailableRef = useRef<boolean | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [showAccepted, setShowAccepted] = useState(false);
  const [showConfirmAccept, setShowConfirmAccept] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<PassengerRequest | null>(null);
  // Declining asks for a reason first; the request is then hidden for this rider only.
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<PassengerRequest | null>(null);

  // Terminal queue — private and share rides can only be accepted by the first
  // driver in the terminal's queue.
  const terminalQueueApi = useTerminalQueue();
  const {
    terminalId: queueTerminalId,
    myEntry: queueEntry,
    position: queuePosition,
    isFirst: isFirstInQueue,
    hasNoTerminal,
    leave: leaveQueue,
  } = terminalQueueApi;

  // A driver with no terminal isn't part of any queue and cannot take rides yet.
  const isUnassigned = hasNoTerminal;

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

  const createDropoffMarkerIcon = (stopNumber?: number) => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    const markerDetail = stopNumber == null
      ? '<path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      : `<text x="12" y="10" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" stroke="none" font-size="9" font-family="Arial, sans-serif" font-weight="700">${stopNumber}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/>${markerDetail}</svg>`;
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 40) } as any;
  };

  // Get driver's terminal info for filtering - fetch fresh from Supabase to avoid stale localStorage
  const [driverTerminalId, setDriverTerminalId] = useState<string | null>(user?.terminalId || null);
  // The assigned TODA's plotted boundary, shown as a map so the driver can see
  // the area their terminal covers.
  const [todaBoundary, setTodaBoundary] = useState<LatLngPoint[] | null>(null);
  const [todaArea, setTodaArea] = useState<LatLngPoint[] | null>(null);
  const [todaRoadWidth, setTodaRoadWidth] = useState<number>(DEFAULT_ROAD_WIDTH_M);
  // A disabled boundary is still drawn, but the on/off badge stays hidden rather
  // than telling the driver they're on a road that isn't being enforced.
  const [todaBoundaryEnabled, setTodaBoundaryEnabled] = useState<boolean>(true);
  const [todaCenter, setTodaCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [todaMarkerColor, setTodaMarkerColor] = useState(DEFAULT_TERMINAL_COLOR);
  const [todaRouteColor, setTodaRouteColor] = useState(DEFAULT_ROUTE_COLOR);
  const [todaBorderColor, setTodaBorderColor] = useState(DEFAULT_BORDER_COLOR);
  const [todaName, setTodaName] = useState<string | null>(user?.terminalName || null);
  const [showTodaMap, setShowTodaMap] = useState(true);

  // Always fetch fresh terminal assignment from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('users').select('terminal_id, terminal_name').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.terminal_id) {
          setDriverTerminalId(data.terminal_id);
          // Also update localStorage so other pages stay fresh
          const stored = JSON.parse(localStorage.getItem('trikeserve_current_user') || '{}');
          if (!stored.terminalId) {
            stored.terminalId = data.terminal_id;
            stored.terminalName = data.terminal_name;
            localStorage.setItem('trikeserve_current_user', JSON.stringify(stored));
          }
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Load the assigned terminal's boundary area whenever the assignment changes.
  useEffect(() => {
    if (!driverTerminalId) {
      setTodaBoundary(null);
      setTodaCenter(null);
      return;
    }
    let cancelled = false;

    supabaseHelpers
      .getTerminalGeofence(driverTerminalId)
      .then(({ data }) => {
        if (cancelled) return;
        setTodaBoundary(normalizeBoundaryRoad(data?.boundary_polygon));
        setTodaArea(normalizeBoundaryArea(data?.boundary_area));
        setTodaRoadWidth(normalizeRoadWidth(data?.road_width_m));
        setTodaBoundaryEnabled(data?.boundary_enabled !== false);
        const lat = Number(data?.center_lat);
        const lng = Number(data?.center_lng);
        setTodaCenter(data?.center_lat != null && data?.center_lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
        setTodaMarkerColor(normalizeTerminalColor(data?.marker_color));
        setTodaRouteColor(normalizeRouteColor(data?.route_color));
        setTodaBorderColor(normalizeBorderColor(data?.border_color));
        if (data?.name) setTodaName(data.name);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [driverTerminalId]);

  // Centre the boundary map on the terminal centre, or the middle of whatever the
  // admin plotted, or the driver when neither is available.
  const todaMapCenter = todaCenter ?? (todaBoundary || todaArea
    ? (() => {
        const shape = (todaBoundary || todaArea) as LatLngPoint[];
        return {
          lat: shape.reduce((sum, p) => sum + p.lat, 0) / shape.length,
          lng: shape.reduce((sum, p) => sum + p.lng, 0) / shape.length,
        };
      })()
    : currentLocation);

  // Whether the driver is inside their terminal's BORDER -- the gate for being
  // at the terminal at all. The road corridor is deliberately not used here:
  // it is hundreds of metres wide, so it would call a driver who is nowhere near
  // the terminal "inside".
  const insideToda = todaArea && todaBoundaryEnabled
    ? isPointInPolygon(currentLocation.lat, currentLocation.lng, todaArea)
    : null;

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const { data: rideRequests } = await supabaseHelpers.getRideRequests({ status: 'pending' });
        const { data: waitingLobbies } = await supabaseHelpers.getWaitingLobbiesForDriver();
        const profileIds = [...new Set([
          ...(rideRequests || []).map((req: any) => req.customer_id),
          ...(waitingLobbies || []).flatMap((lobby: any) =>
            Array.isArray(lobby.passengers_json) ? lobby.passengers_json.map((passenger: any) => passenger.id) : []
          ),
        ].filter(Boolean))];
        const nameMap: Record<string, string> = {};
        if (profileIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name')
            .in('id', profileIds);
          (usersData || []).forEach((profile: any) => {
            if (profile.name) nameMap[profile.id] = profile.name;
          });
        }
        const orderIds = [...new Set((rideRequests || [])
          .map((req: any) => req.order_id || parseDeliveryTag(req.pickup_location).orderId)
          .filter(Boolean))];
        const orderMap: Record<string, any> = {};
        if (orderIds.length > 0) {
          let orderProfiles: any[] | null = null;
          if (packagePhotoColumnAvailableRef.current !== false) {
            const { data: profilesWithPhoto, error: profilePhotoError } = await supabase
              .from('orders')
              .select('id, business_id, address, restaurant_package_photo_url')
              .in('id', orderIds);
            if (profilePhotoError) {
              // The package-photo column is added by ADD_RESTAURANT_PACKAGE_PHOTO.sql.
              // Keep existing rider requests usable until that migration is applied.
              if (profilePhotoError.message?.includes('restaurant_package_photo_url')) {
                packagePhotoColumnAvailableRef.current = false;
              }
              const { data: legacyProfiles } = await supabase
                .from('orders')
                .select('id, business_id, address')
                .in('id', orderIds);
              orderProfiles = legacyProfiles;
            } else {
              packagePhotoColumnAvailableRef.current = true;
              orderProfiles = profilesWithPhoto;
            }
          } else {
            // Avoid retrying a known-missing column on every request refresh.
            const { data: legacyProfiles } = await supabase
              .from('orders')
              .select('id, business_id, address')
              .in('id', orderIds);
            orderProfiles = legacyProfiles;
          }
          (orderProfiles || []).forEach((order: any) => { orderMap[order.id] = order; });
        }
        const businessIds = [...new Set(Object.values(orderMap).map((order: any) => order.business_id).filter(Boolean))];
        const restaurantMap: Record<string, any> = {};
        if (businessIds.length > 0) {
          const { data: restaurantLocations } = await supabase
            .from('restaurants')
            .select('business_user_id, name, subtitle, address, cuisine, delivery_time, latitude, longitude, logo_image')
            .in('business_user_id', businessIds);
          (restaurantLocations || []).forEach((restaurant: any) => { restaurantMap[restaurant.business_user_id] = restaurant; });
        }
        // Requests this rider already declined are hidden from them — they stay
        // available to every other rider, so the customer is unaffected.
        const visibleRideRequests = (rideRequests || []).filter(
          (req: any) => !supabaseHelpers.isDeclinedByDriver(req, user?.id)
        );
        const visibleLobbies = (waitingLobbies || []).filter(
          (lobby: any) => !supabaseHelpers.isDeclinedByDriver(lobby, user?.id)
        );

        const mappedRequests = visibleRideRequests.map((req: any) => {
          const requestOrderId = req.order_id || parseDeliveryTag(req.pickup_location).orderId;
          const order = orderMap[requestOrderId];
          const restaurant = restaurantMap[order?.business_id];
          const requestType = mapRideType(req.ride_type, req.pickup_location);
          const orderAddress = order?.address as string | undefined;
          const requestDropoffAddress = req.dropoff_address || req.dropoff_location;
          const requestDropoffCoords = readAddressCoordinates(requestDropoffAddress);
          const orderDropoffCoords = readAddressCoordinates(orderAddress);
          return {
          id: req.id,
          type: requestType,
          pickup: requestType === 'delivery' ? restaurant?.name || 'Restaurant' : formatPickup(req.pickup_location),
          dropoff: displayOrderAddress(req.dropoff_location) || displayOrderAddress(orderAddress) || 'Drop-off',
          payment: req.payment_method === 'GCASH' ? 'PREPAID' : 'COD',
          amount: Number(req.amount || 0),
          foodCost: Number(req.food_cost || 0),
          customerName: req.customer_name || nameMap[req.customer_id] || 'Customer',
          restaurantName: requestType === 'delivery' ? restaurant?.name || 'Restaurant' : undefined,
          restaurantImage: restaurant?.logo_image || undefined,
          businessUserId: restaurant?.business_user_id || order?.business_id || undefined,
          restaurantAddress: restaurant?.address
            || (req.pickup_address && req.pickup_address.trim().toLowerCase() !== formatPickup(req.pickup_location).trim().toLowerCase()
              ? req.pickup_address
              : undefined),
          restaurantSubtitle: restaurant?.subtitle || undefined,
          restaurantCuisine: restaurant?.cuisine || undefined,
          restaurantDeliveryTime: restaurant?.delivery_time || undefined,
          restaurantLat: restaurant?.latitude ?? undefined,
          restaurantLng: restaurant?.longitude ?? undefined,
          customerPhoto: '👤',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          passengers: req.passenger_count || 1,
          customerId: req.customer_id,
          ...parseDeliveryTag(req.pickup_location),
          orderId: requestOrderId,
          restaurantPackagePhotoUrl: order?.restaurant_package_photo_url || undefined,
          pickupAddress: req.pickup_address || undefined,
          dropoffAddress: displayOrderAddress(req.dropoff_address) || displayOrderAddress(orderAddress) || undefined,
          pickupLat: req.pickup_lat ?? undefined,
          pickupLng: req.pickup_lng ?? undefined,
          dropoffLat: req.dropoff_lat ?? requestDropoffCoords?.lat ?? orderDropoffCoords?.lat ?? undefined,
          dropoffLng: req.dropoff_lng ?? requestDropoffCoords?.lng ?? orderDropoffCoords?.lng ?? undefined,
          created_at: req.created_at,
          };
        });
        const mappedLobbies = visibleLobbies.map((lobby: any) => {
          const storedPassengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
          const passengers = backfillLegacySharedRidePassengerFares(
            storedPassengers,
            Number(lobby.price_per_seat || 0),
          );
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
            amount: sumSharedRidePassengerFares(passengers),
            passengers: passengers.length,
            maxPassengers: Number(lobby.max_seats || 3),
            customerName: passengers.length > 1 ? passengers.map((p: any) => p.name || nameMap[p.id] || 'Passenger').join(', ') : (passengers[0]?.name || nameMap[passengers[0]?.id] || 'Customer'),
            customerPhoto: 'shared',
            distance: '2.5 km',
            estimatedTime: '7 mins',
            customerId: lobby.customer_id,
            lobbyId: lobby.id,
            passengerDetails: passengers.map((passenger: any) => ({
              ...passenger,
              name: passenger.name || nameMap[passenger.id] || 'Passenger',
              emoji: passenger.emoji || '👤',
            })),
            created_at: lobby.created_at,
          } as PassengerRequest;
        });
        const seenOrderIds = new Set<string>();
        const dedupedRequests = mappedRequests.map((req: any) => {
          const originalReq = visibleRideRequests.find((r: any) => r.id === req.id);
          return { ...req, terminalId: originalReq?.terminal_id || null };
        }).filter((req: any) => {
          if (req.orderId) {
            if (seenOrderIds.has(req.orderId)) return false;
            seenOrderIds.add(req.orderId);
          }
          return true;
        });

        // Add terminal info to shared ride lobbies too
        const lobbysWithTerminal = mappedLobbies.map((req: any) => {
          const originalLobby = visibleLobbies.find((l: any) => l.id === req.lobbyId);
          return { ...req, terminalId: originalLobby?.terminal_id || null };
        });

        setRequests([...dedupedRequests, ...lobbysWithTerminal]);
      } catch (error) { console.error('❌ Error loading requests:', error); }
    };
    loadRequests();
    const rideSub = supabase.channel('rides').on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests' }, () => loadRequests()).subscribe();
    const lobbySub = supabase.channel('lobbies').on('postgres_changes', { event: '*', schema: 'public', table: 'shared_ride_lobbies' }, () => loadRequests()).subscribe();
    const interval = setInterval(loadRequests, 3000);
    return () => { clearInterval(interval); supabase.removeChannel(rideSub); supabase.removeChannel(lobbySub); };
  }, [user?.id, driverTerminalId]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => { setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }, null, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }, []);

  useEffect(() => {
    if (!routePath || !previewMapRef.current || !(window as any).google) return;
    fitMapToRoute(previewMapRef.current, routePath);
  }, [routePath]);

  useEffect(() => {
    if (!isPreviewMapFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPreviewMapFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewMapFullscreen]);

  useEffect(() => {
    const map = previewMapRef.current;
    if (!map || !isMapsLoaded) return;
    const frame = window.requestAnimationFrame(() => {
      (window as any).google?.maps?.event?.trigger(map, 'resize');
      if (routePath) fitMapToRoute(map, routePath);
      else map.setCenter(previewMapCenter);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isPreviewMapFullscreen, isMapsLoaded, routePath, previewMapCenter]);

  useEffect(() => {
    if (!previewRequest || !isMapsLoaded || !(window as any).google) return;

    let cancelled = false;
    const resolveCoords = async (lat?: number | null, lng?: number | null, address?: string) => {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng) && (lat != null && lng != null)) {
        return { lat: parsedLat, lng: parsedLng };
      }
      const addressCoords = readAddressCoordinates(address);
      if (addressCoords) return addressCoords;
      return address ? geocodeAddress(address) : null;
    };
    const calculateRoute = async (
      origin: { lat: number; lng: number },
      destination: { lat: number; lng: number },
    ): Promise<{ path: google.maps.LatLngLiteral[] | null; status: string }> => {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
      let routesApiStatus = 'Routes API unavailable';

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
              destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
              travelMode: 'DRIVE',
              computeAlternativeRoutes: false,
            }),
          });
          const data = await response.json();
          if (response.ok) {
            const encodedPath = data.routes?.[0]?.polyline?.encodedPolyline;
            const path = encodedPath ? decodeRoutePolyline(encodedPath) : [];
            if (path.length > 1) return { path, status: 'OK' };
            routesApiStatus = 'Routes API returned no route';
          } else {
            routesApiStatus = data.error?.status || `Routes API HTTP ${response.status}`;
          }
        } catch {
          routesApiStatus = 'Routes API request failed';
        }
      } else {
        routesApiStatus = 'Google Maps API key is missing';
      }

      // Keep support for projects that have the legacy Directions API enabled.
      return new Promise(resolve => {
        const service = new (window as any).google.maps.DirectionsService();
        service.route({
          origin,
          destination,
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
        }, (result: any, status: string) => {
          const points = status === 'OK'
            ? (result.routes?.[0]?.overview_path || []).map((point: any) => ({ lat: point.lat(), lng: point.lng() }))
            : [];
          resolve({ path: points.length > 1 ? points : null, status: status === 'OK' ? routesApiStatus : status });
        });
      });
    };

    const loadRoute = async () => {
      setRoutePath(null);
      setPickupRoutePath(null);
      setDropoffRoutePath(null);
      setResolvedPassengerDropoffs([]);
      setRouteError(null);
      const savedPickupLat = previewRequest.restaurantLat ?? previewRequest.pickupLat;
      const savedPickupLng = previewRequest.restaurantLng ?? previewRequest.pickupLng;
      const pickupAddresses = previewRequest.type === 'delivery'
        ? [previewRequest.restaurantAddress, previewRequest.pickupAddress]
            .filter((address): address is string => Boolean(address?.trim()))
            .filter((address, index, all) => all.findIndex(candidate => candidate.trim().toLowerCase() === address.trim().toLowerCase()) === index)
        : [previewRequest.pickupAddress || previewRequest.pickup].filter(Boolean);
      let pickup = await resolveCoords(savedPickupLat, savedPickupLng);
      // A request may have been posted before the restaurant pin was saved, or
      // may carry an older pickup address. Try each real address first.
      for (const address of pickup ? [] : pickupAddresses) {
        if (address.trim().toLowerCase() === previewRequest.restaurantName?.trim().toLowerCase()) continue;
        pickup = await resolveCoords(undefined, undefined, address);
        // Some map keys allow Places but not the Geocoding service. Search the
        // saved address as text in that case; never search a storefront name.
        if (!pickup) {
          const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
          if (apiKey) {
            try {
              const matches = await searchPlacesText({
                textQuery: address,
                apiKey,
                bias: currentLocation,
                biasRadiusMeters: 5000,
              });
              const match = matches.find(place => Number.isFinite(place.lat) && Number.isFinite(place.lng));
              if (match?.lat != null && match.lng != null) pickup = { lat: match.lat, lng: match.lng };
            } catch (error) {
              console.warn('[PassengerRequests] Could not resolve saved restaurant address with Places:', error);
            }
          }
        }
        if (pickup) break;
      }

      // A map pin or street address is optional for businesses. If neither is
      // available, search the restaurant name near the rider and use the
      // nearest nearby match instead of resolving a same-name business far away.
      const restaurantName = previewRequest.restaurantName?.trim();
      if (!pickup && restaurantName && !['restaurant pickup', 'pickup'].includes(restaurantName.toLowerCase())) {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
        if (apiKey) {
          try {
            const matches = await searchPlacesText({
              textQuery: restaurantName,
              apiKey,
              bias: currentLocation,
              biasRadiusMeters: 5000,
            });
            const nearby = matches
              .filter((place): place is typeof place & { lat: number; lng: number } => place.lat != null && place.lng != null)
              .map(place => ({ place, distance: haversineDistance(currentLocation, { lat: place.lat, lng: place.lng }) }))
              .filter(result => result.distance <= 5000)
              .sort((a, b) => a.distance - b.distance)[0];
            if (nearby) pickup = { lat: nearby.place.lat, lng: nearby.place.lng };
          } catch (error) {
            console.warn('[PassengerRequests] Could not find nearby restaurant by name:', error);
          }
        }
      }
      if (cancelled) return;
      if (!pickup) {
        if (previewRequest.type === 'shared') {
          const passengers = previewRequest.passengerDetails?.length
            ? previewRequest.passengerDetails
            : [{
                id: previewRequest.customerId || previewRequest.id,
                name: previewRequest.customerName,
                dropoff: previewRequest.dropoff,
                dropoffAddress: previewRequest.dropoffAddress,
              }];
          setResolvedPassengerDropoffs(passengers.map((passenger) => {
            const addressParts = [displayOrderAddress(passenger.dropoff), displayOrderAddress(passenger.dropoffAddress)]
              .filter((value): value is string => typeof value === 'string' && value.length > 0);
            const lobbyAddress = displayOrderAddress(previewRequest.dropoffAddress || previewRequest.dropoff);
            return {
              id: passenger.id,
              passengerNames: [passenger.name || previewRequest.customerName || 'Passenger'],
              address: addressParts.join(' · ') || lobbyAddress || 'Drop-off location unavailable',
              coords: null,
            };
          }));
        }
        setRouteError(previewRequest.type === 'delivery'
          ? 'Could not locate the restaurant near your current location. A business map pin or street address can improve directions.'
          : previewRequest.type === 'shared'
            ? 'Could not locate the pickup. Passenger drop-offs are listed, but the route order could not be calculated.'
            : 'Could not locate the pickup near your current location. A pickup pin or street address can improve directions.');
        return;
      }

      setResolvedPickupCoords(pickup);
      setPreviewMapCenter(pickup);
      setResolvedPickupAddress(previewRequest.restaurantAddress || null);
      reverseGeocodeNearestRoad(pickup).then(address => {
        if (!cancelled && address) setResolvedPickupAddress(address);
      });

      if (previewRequest.type === 'shared') {
        const passengers = previewRequest.passengerDetails?.length
          ? previewRequest.passengerDetails
          : [{
              id: previewRequest.customerId || previewRequest.id,
              name: previewRequest.customerName,
              dropoff: previewRequest.dropoff,
              dropoffAddress: previewRequest.dropoffAddress,
              dropoffLat: previewRequest.dropoffLat,
              dropoffLng: previewRequest.dropoffLng,
            }];
        const passengerDestinations = await Promise.all(passengers.map(async (passenger) => {
          const lookupAddress = passenger.dropoffAddress || passenger.dropoff
            || previewRequest.dropoffAddress || previewRequest.dropoff;
          const coords = await resolveCoords(passenger.dropoffLat, passenger.dropoffLng, lookupAddress);
          const passengerName = displayOrderAddress(passenger.dropoff);
          const fullAddress = displayOrderAddress(passenger.dropoffAddress);
          const lobbyAddress = displayOrderAddress(previewRequest.dropoffAddress || previewRequest.dropoff);
          const hasPassengerDropoff = Boolean(passengerName || fullAddress);
          const addressCandidates = hasPassengerDropoff ? [passengerName, fullAddress] : [lobbyAddress];
          const addressParts = addressCandidates.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
          const uniqueAddressParts = addressParts.filter((value, index, all) =>
            all.findIndex((candidate) => candidate.trim().toLowerCase() === value.trim().toLowerCase()) === index,
          );
          const address = uniqueAddressParts.join(' · ')
            || (coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Drop-off location unavailable');
          return {
            id: passenger.id,
            name: passenger.name || previewRequest.customerName || 'Passenger',
            address,
            coords,
          };
        }));
        if (cancelled) return;

        // Keep passengers sharing one destination together so their numbered
        // map pins stay readable while the list still names every passenger.
        const groupedStops: PassengerDropoffStop[] = [];
        passengerDestinations.forEach((destination) => {
          const normalizedAddress = destination.address.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
          const matchingStop = groupedStops.find((stop) => {
            const sameAddress = normalizedAddress && normalizedAddress !== 'drop off location unavailable'
              && stop.address.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') === normalizedAddress;
            const sameCoordinates = destination.coords && stop.coords
              && haversineDistance(destination.coords, stop.coords) <= 25;
            return Boolean(sameAddress || sameCoordinates);
          });
          if (matchingStop) {
            matchingStop.passengerNames.push(destination.name);
            if (!matchingStop.coords && destination.coords) matchingStop.coords = destination.coords;
          } else {
            groupedStops.push({
              id: destination.id,
              passengerNames: [destination.name],
              address: destination.address,
              coords: destination.coords,
            });
          }
        });

        // Choose the next mapped stop from the current point, then leave any
        // addresses without usable map coordinates at the end of the list.
        const remainingStops = groupedStops.filter((stop) => stop.coords);
        const orderedStops: PassengerDropoffStop[] = [];
        let routeCursor = pickup;
        while (remainingStops.length > 0) {
          let nearestIndex = 0;
          let nearestDistance = Number.POSITIVE_INFINITY;
          remainingStops.forEach((stop, index) => {
            const distance = haversineDistance(routeCursor, stop.coords!);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestIndex = index;
            }
          });
          const [nearestStop] = remainingStops.splice(nearestIndex, 1);
          orderedStops.push(nearestStop);
          routeCursor = nearestStop.coords!;
        }
        orderedStops.push(...groupedStops.filter((stop) => !stop.coords));
        setResolvedPassengerDropoffs(orderedStops);
        setResolvedDropoffCoords(null);

        const mappedStops = orderedStops.filter((stop) => stop.coords);
        const [toPickup, dropoffLegs] = await Promise.all([
          calculateRoute(currentLocation, pickup),
          Promise.all(mappedStops.map((stop, index) => {
            const origin = index === 0 ? pickup : mappedStops[index - 1].coords!;
            return calculateRoute(origin, stop.coords!);
          })),
        ]);
        if (cancelled) return;

        const successfulDropoffLegs = dropoffLegs.filter((leg) => leg.path);
        const dropoffPath: google.maps.LatLngLiteral[] = [];
        for (const leg of dropoffLegs) {
          if (!leg.path) break;
          dropoffPath.push(...leg.path);
        }
        const combinedPath = [...(toPickup.path || []), ...dropoffPath];
        setPickupRoutePath(toPickup.path);
        setDropoffRoutePath(dropoffPath.length > 1 ? dropoffPath : null);
        if (combinedPath.length > 1) setRoutePath(combinedPath);

        const missingMapCount = orderedStops
          .filter((stop) => !stop.coords)
          .reduce((count, stop) => count + stop.passengerNames.length, 0);
        const failedLegCount = dropoffLegs.length - successfulDropoffLegs.length;
        const routeNotes = [
          !toPickup.path ? `pickup directions unavailable (${toPickup.status})` : null,
          missingMapCount > 0 ? `${missingMapCount} passenger drop-off${missingMapCount === 1 ? '' : 's'} could not be mapped` : null,
          failedLegCount > 0 ? `${failedLegCount} passenger route leg${failedLegCount === 1 ? '' : 's'} unavailable` : null,
          mappedStops.length === 0 ? 'no passenger drop-off locations could be mapped' : null,
        ].filter(Boolean);
        setRouteError(routeNotes.length > 0 ? `The drop-off order is shown, but ${routeNotes.join('; ')}.` : null);
        return;
      }

      const dropoff = await resolveCoords(
        previewRequest.dropoffLat,
        previewRequest.dropoffLng,
        previewRequest.dropoffAddress || previewRequest.dropoff,
      );
      if (cancelled) return;
      if (dropoff) setResolvedDropoffCoords(dropoff);

      // Route each leg on its own so a bad customer pin cannot hide the rider's
      // road route to the store.
      const [toStore, toCustomer] = await Promise.all([
        calculateRoute(currentLocation, pickup),
        dropoff ? calculateRoute(pickup, dropoff) : Promise.resolve({ path: null, status: 'Customer drop-off not located' }),
      ]);
      if (cancelled) return;
      const combinedPath = [...(toStore.path || []), ...(toCustomer.path || [])];
      setPickupRoutePath(toStore.path);
      setDropoffRoutePath(toCustomer.path);
      if (combinedPath.length > 1) setRoutePath(combinedPath);

      if (toStore.path && toCustomer.path) {
        setRouteError(null);
      } else if (toStore.path) {
        setRouteError(`Route to the store is shown, but the customer route is unavailable (${toCustomer.status}). Check the customer drop-off pin.`);
      } else if (toCustomer.path) {
        setRouteError(`Store-to-customer route is shown, but directions to the store from your location are unavailable (${toStore.status}). Check your GPS location.`);
      } else {
        setRouteError(`No road route was found (${toStore.status}; customer leg: ${toCustomer.status}). Check your GPS location and both map pins.`);
      }
    };

    loadRoute().catch(() => {
      if (!cancelled) setRouteError('Could not load road directions. Please try again.');
    });
    return () => { cancelled = true; };
  }, [previewRequest, isMapsLoaded, currentLocation]);

  const handleOpenPreview = (request: PassengerRequest) => {
    setIsPreviewMapFullscreen(false);
    setRoutePath(null);
    setPickupRoutePath(null);
    setDropoffRoutePath(null);
    setShowPickupRoute(true);
    setShowDropoffRoute(true);
    setRouteError(null);
    setResolvedPickupCoords(null);
    setResolvedPickupAddress(null);
    setResolvedDropoffCoords(null);
    setResolvedPassengerDropoffs([]);
    setPreviewRequest(request);
  };

  /**
   * Decline a request, recording the rider's reason against them.
   *
   * The decline is per-rider: the request stays in every other rider's list and
   * the customer sees no change.
   */
  const handleDeclineRequest = async (request: PassengerRequest, reason: string) => {
    if (!user?.id) return;

    const lobbyId = request.lobbyId;
    const { error } = lobbyId
      ? await supabaseHelpers.declineLobby(lobbyId, user.id, reason)
      : await supabaseHelpers.declineRideRequest(request.id, user.id, reason);

    if (error) {
      console.error('❌ Failed to record decline:', error);
      alert(`Failed to decline the request: ${(error as any)?.message || 'Please try again.'}`);
      return;
    }

    // Drop it from this rider's list straight away.
    setRequests(prev => prev.filter(r => r.id !== request.id));
    setPreviewRequest(null);
    console.log('🚫 Declined request with reason:', reason);
  };

  const handleAcceptRequest = async (request: PassengerRequest) => {
    if (!user?.id) return alert('You must be logged in as a driver.');
    if (!(user?.serviceTypes || []).includes(request.type)) {
      return alert('You can only accept requests that match your service types.');
    }
    if (isUnassigned) {
      return alert('You are not assigned to a terminal yet. Ask an admin to assign your terminal before accepting rides.');
    }
    // Only the first driver in the terminal queue may take private/share rides.
    if (queueTerminalId && isQueueGatedType(request.type) && !isFirstInQueue) {
      return alert(
        queueEntry
          ? `You're #${queuePosition} in the queue. Only the first driver in your terminal can accept this ride.`
          : 'Join your terminal queue before accepting private or share rides.'
      );
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
    const acceptedRide = {
      ...request,
      // Deliveries may get the shop pin from the business profile even when an
      // older ride_requests row has no pickup coordinates. Carry that resolved
      // pin into Active Ride so the first leg reliably targets the restaurant.
      pickupLat: request.restaurantLat ?? request.pickupLat,
      pickupLng: request.restaurantLng ?? request.pickupLng,
      pickupAddress: request.restaurantAddress ?? request.pickupAddress,
      passengerDetails,
      driverId: user.id,
      driverName: user.name,
      driverPlate: user.todaPlate,
      driverRating: '4.8',
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      eta: '5 mins',
    };

    if (request.type === 'delivery' && (request.orderId || request.orderNumber)) {
      if (request.orderId) {
        /*
         * Accepting records the rider; it does not start the delivery.
         *
         * This used to write `status: 'on-the-way'` here, in the same statement as
         * the rider's name. That collapsed two distinct facts into one write: a
         * rider existing, and a rider having the food and moving. So the moment
         * anyone accepted, the order claimed to be on the way -- and the shop, whose
         * screen had no "assigned" state to sit in, went from searching for a rider
         * straight to a delivery already under way, with nothing in between.
         *
         * The order stays where the shop left it (`confirmed`) until the rider
         * actually collects the food, which `updateStatus('pickup')` records. So
         * "rider assigned" is a state the shop can be in, not a step it misses.
         */
        const { error: directErr } = await supabase
          .from('orders')
          .update({ driver_name: user.name || 'Driver', updated_at: new Date().toISOString() })
          .eq('id', request.orderId);
        if (directErr) console.error('❌ Direct orders update failed:', directErr);
        else console.log('✅ Orders table updated with rider name (direct)');
      }
      /*
       * The order's status is left alone here. It used to be forced to
       * 'on-the-way' on accept, which made every accepted delivery announce
       * itself as under way before the rider had touched the food -- and, on the
       * shop's screen, left no state in which a rider was assigned but the
       * delivery had not started. ActiveRide moves it when the rider confirms
       * pickup.
       */
      if (request.id && !request.id.startsWith('lobby_')) {
        // `accepted_driver_id` as well as `driver_id`. The customer's ride screen,
        // the delivery screens and the driver's own active-ride lookup all read
        // `accepted_driver_id`; the two other accept paths set both. Setting only
        // `driver_id` here left the row looking accepted to the customer -- who was
        // therefore locked out of booking -- while the driver, who looks rides up
        // by `accepted_driver_id`, saw nothing at all.
        await supabaseHelpers.updateRideRequest(request.id, {
          status: 'accepted',
          driver_id: user.id,
          accepted_driver_id: user.id,
        });
      }
    }

    setPreviewRequest(null);
    setShowAccepted(true);
    // Giving up the queue slot: shared lobbies were already recorded above
    // (acceptLobbyAsDriver) and delivery isn't queue-gated, so those can let go
    // now. A private ride is only recorded once ActiveRide mounts, and the
    // database requires the driver to still be first in queue at that moment —
    // so that path clears the slot itself.
    if (queueEntry && request.type !== 'private') await leaveQueue();
    logAudit({
      action: 'accept_ride',
      actorRole: 'rider',
      entityType: request.lobbyId ? 'lobby' : 'ride_request',
      entityId: request.lobbyId || request.id,
      summary: `Accepted a ${request.type} request: ${request.pickup} → ${request.dropoff}`,
      details: { amount: request.amount },
      actorEmail: user?.email,
      actorName: user?.name,
    });
    setTimeout(() => {
      navigate('/rider/active-ride', { state: { acceptedRide } });
    }, 2000);
  };

  const getServiceLabel = (type: string) => {
    const labels: Record<string, string> = { delivery: 'DELIVERY', shared: 'RIDE SHARE', private: 'PRIVATE RIDE' };
    return labels[type] || type.toUpperCase();
  };

  // Private/share rides stay with their assigned terminal. Deliveries go to the
  // nearest restaurant terminal, plus another terminal only when its plotted
  // route also reaches the restaurant.
  const isWrongTerminal = (request: PassengerRequest) => {
    if (request.type === 'delivery') {
      if (!driverTerminalId) return true;
      if (request.terminalId === driverTerminalId) return false;
      const pickupLat = Number(request.restaurantLat ?? request.pickupLat);
      const pickupLng = Number(request.restaurantLng ?? request.pickupLng);
      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return true;
      return !isPointWithinTerminalRoute(pickupLat, pickupLng, {
        road: todaBoundary,
        widthM: todaRoadWidth,
      });
    }
    if (!isQueueGatedType(request.type)) return false;
    if (!driverTerminalId || !request.terminalId) return false; // No restriction if either has no terminal
    return request.terminalId !== driverTerminalId;
  };
  // Rides from another terminal are hidden entirely rather than listed as
  // un-acceptable, so the driver only ever sees their own TODA's requests.
  const filteredRequests = requests.filter(r =>
    (selectedCategory === 'all' || r.type === selectedCategory) && !isWrongTerminal(r)
  );
  // Private and share rides require being first in the terminal queue.
  const isQueueBlocked = (request: PassengerRequest) =>
    !!queueTerminalId && isQueueGatedType(request.type) && !isFirstInQueue;
  const canAcceptRequest = (request: PassengerRequest) => {
    if (isUnassigned) return false;
    if (!(user?.serviceTypes || []).includes(request.type)) return false;
    if (isWrongTerminal(request)) return false;
    if (isQueueBlocked(request)) return false;
    return true;
  };
  const requestsMatchingServiceTypes = filteredRequests.filter(r => canAcceptRequest(r));

  const recommendedPickup = requestsMatchingServiceTypes.filter(r => r.type === 'private' && r.pickupLat && r.pickupLng).reduce<null | (PassengerRequest & { __distance: number; __eta: number })>((best, r) => {
    const dist = haversineDistance(currentLocation, { lat: Number(r.pickupLat), lng: Number(r.pickupLng) });
    return (!best || dist < best.__distance) ? { ...r, __distance: dist, __eta: estimateETA(dist) } : best;
  }, null);

  const getRestaurantDistance = (request: PassengerRequest) => {
    const latValue = request.restaurantLat ?? request.pickupLat;
    const lngValue = request.restaurantLng ?? request.pickupLng;
    if (latValue == null || lngValue == null) return Number.POSITIVE_INFINITY;
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Number.POSITIVE_INFINITY;
    return haversineDistance(currentLocation, { lat, lng });
  };
  const deliveryRequestsByDistance = filteredRequests
    .filter(request => request.type === 'delivery')
    .sort((a, b) => getRestaurantDistance(a) - getRestaurantDistance(b));
  const nearestAvailableDelivery = deliveryRequestsByDistance.find(request =>
    Number.isFinite(getRestaurantDistance(request)) &&
    requestsMatchingServiceTypes.some(available => available.id === request.id)
  );

  const sortedRequests = selectedCategory === 'delivery'
    ? deliveryRequestsByDistance
    : nearestAvailableDelivery
      ? [
          nearestAvailableDelivery,
          ...deliveryRequestsByDistance.filter(r => r.id !== nearestAvailableDelivery.id),
          ...filteredRequests.filter(r => r.type !== 'delivery'),
        ]
      : recommendedPickup
        ? [recommendedPickup as PassengerRequest, ...filteredRequests.filter(r => r.id !== recommendedPickup.id)]
        : filteredRequests;

  return (
    <div className="min-h-screen bg-[var(--muted)] relative">
      {/* Header */}
      <div className="bg-surface border-b-2 border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1"><h1 className="text-lg md:text-xl font-extrabold text-[var(--primary)]">Passenger Requests</h1></div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
          {['all', 'shared', 'private', 'delivery'].map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat as any)} className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-[var(--primary)] text-white shadow-md' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
              {cat === 'all' ? 'All' : cat === 'shared' ? '👥 Share' : cat === 'private' ? '👤 Private' : '📦 Delivery'}
            </button>
          ))}
        </div>

        {/* Terminal queue status — also shows the "no terminal assigned" block.
            Hidden on the Delivery service type, where the queue never applies. */}
        {!isDeliveryServiceMode(user?.serviceTypes) && (
          <TerminalQueueCard queue={terminalQueueApi} variant="compact" />
        )}

        {/* TODA boundary map — the coverage area the driver's assigned terminal serves */}
        {driverTerminalId && (
          <Card className="border border-line overflow-hidden">
            <button
              onClick={() => setShowTodaMap((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-extrabold text-[var(--ink)] truncate">Your TODA Boundary</p>
                  <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                    {todaName || "Assigned terminal"}
                    {todaBoundary || todaArea
                      ? ` • ${todaArea && todaBoundary ? 'road + area' : todaArea ? 'area' : 'road'} plotted`
                      : ' • no boundary set yet'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0 transition-transform ${showTodaMap ? "rotate-180" : ""}`}
              />
            </button>

            {showTodaMap && (
              <div className="border-t border-[var(--border)]">
                {todaBoundary || todaArea ? (
                  <div className="relative w-full h-56 md:h-64">
                    {isMapsLoaded ? (
                      <GoogleMap
                        mapContainerStyle={{ width: "100%", height: "100%" }}
                        center={todaMapCenter}
                        zoom={14}
                        options={{ zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: 'greedy' }}
                      >
                        {todaArea && (
                          <Polygon
                            path={todaArea}
                            options={{
                              fillColor: todaBorderColor,
                              fillOpacity: 0.12,
                              strokeColor: todaBorderColor,
                              strokeWeight: 2,
                              strokeOpacity: 0.6,
                              clickable: false,
                            }}
                          />
                        )}
                        {todaBoundary && (
                          <Polyline
                            path={todaBoundary}
                            options={{
                              strokeColor: todaRouteColor,
                              strokeWeight: 5,
                              strokeOpacity: 0.9,
                              clickable: false,
                              geodesic: true,
                            }}
                          />
                        )}
                        {todaCenter && (
                          <Marker
                            position={todaCenter}
                            title={todaName || 'Assigned terminal'}
                            icon={terminalMarkerIcon(todaMarkerColor, 58)}
                            zIndex={5}
                          />
                        )}
                        <Marker position={currentLocation} icon={createDriverMarkerIcon()} title="Your Location" />
                      </GoogleMap>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-xs text-[var(--muted-foreground)]">Loading map...</p>
                      </div>
                    )}
                    {insideToda != null && (
                      <span
                        className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-extrabold shadow ${
                          insideToda ? "bg-[var(--success)] text-white" : "bg-[var(--amber)] text-[var(--amber-dark)]"
                        }`}
                      >
                        {insideToda ? "Inside boundary" : "Outside boundary"}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
                    {todaName || "Your terminal"} has no boundary area set yet.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Request Count */}
        {sortedRequests.length > 0 && (
          <p className="text-xs text-[var(--muted-foreground)] font-medium">{sortedRequests.length} request{sortedRequests.length !== 1 ? 's' : ''} available</p>
        )}

        {/* Request Cards */}
        {sortedRequests.map((request) => {
          const canAccept = canAcceptRequest(request);
          const queueBlocked = isQueueBlocked(request);
          return (
            <Card key={request.id} className={`border-2 transition-all overflow-hidden ${
              !canAccept ? 'bg-[var(--muted)] opacity-70 border-[var(--border)]' :
              recommendedPickup && request.id === recommendedPickup.id ? 'bg-gradient-to-br from-[var(--success-soft)] to-[var(--success-soft)] border-[var(--success)] shadow-md' :
              'bg-surface border-[var(--border)] shadow-sm'
            }`}>
              {/* Top: Type icon + Name + Amount */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    request.type === 'delivery' ? 'bg-[var(--info-soft)]' :
                    request.type === 'shared' ? 'bg-[var(--amber-soft)]' : 'bg-[var(--success-soft)]'
                  }`}>
                    {request.type !== 'delivery' && request.customerPhoto === 'shared' ? (
                      <Users className="w-5 h-5 text-[var(--primary)]" />
                    ) : request.type === 'delivery' ? (
                      request.restaurantImage ? (
                        <ImageWithFallback
                          src={request.restaurantImage}
                          alt={`${request.restaurantName || 'Restaurant'} profile`}
                          className="w-full h-full rounded-xl object-cover"
                        />
                      ) : (
                        <Store className="w-5 h-5 text-[var(--info)]" />
                      )
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--ink)] text-sm truncate">
                      {request.type === 'delivery' ? request.restaurantName || 'Restaurant' : request.customerName}
                    </p>
                    {request.type === 'delivery' && (
                      <p className="text-[10px] text-[var(--muted-foreground)] truncate">Customer: {request.customerName}</p>
                    )}
                    {request.type === 'shared' && request.passengerDetails && request.passengerDetails.length > 1 && (
                      <p className="text-[10px] text-[var(--muted-foreground)] truncate">
                        {request.passengerDetails.map((p: any) => p.name || 'Passenger').join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-extrabold text-lg text-[var(--primary)]">₱{request.amount}</p>
                  <Badge className={`text-[9px] border-0 ${
                    request.type === 'delivery' ? 'bg-[var(--info-soft)] text-[var(--info)]' :
                    request.type === 'shared' ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : 'bg-[var(--success-soft)] text-[var(--success)]'
                  }`}>
                    {request.type === 'delivery' ? '📦 Delivery' : request.type === 'shared' ? '👥 Share' : '👤 Private'}
                  </Badge>
                </div>
              </div>

              {/* Pickup & Dropoff with connector */}
              <div className="px-4 py-2">
                <div className="flex items-stretch gap-2">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-[var(--success)] shrink-0" />
                    <div className="w-0.5 flex-1 bg-[var(--border)] my-0.5" />
                    <div className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div>
                      <p className="text-[10px] text-[var(--success)] font-bold">Pickup</p>
                      <p className="text-xs font-semibold text-[var(--ink)] truncate">{request.pickup}</p>
                      {request.type === 'delivery' && request.restaurantAddress && (
                        <p className="text-[10px] text-[var(--muted-foreground)] truncate">{request.restaurantAddress}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--primary)] font-bold">Drop-off</p>
                      <p className="text-xs font-semibold text-[var(--ink)] truncate">{request.dropoff}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="px-4 pb-3 pt-1">
                {isUnassigned && (
                  <Badge className="bg-[var(--error-soft)] text-[var(--error)] text-[10px] mb-2 border border-[var(--error-soft)]">🚏 No terminal assigned</Badge>
                )}
                {!isUnassigned && queueBlocked && (
                  <Badge className="bg-[var(--amber-soft)] text-[var(--amber-ink)] text-[10px] mb-2 border border-[var(--amber-soft)]">
                    {queueEntry ? `⏳ Waiting for your turn (#${queuePosition} in queue)` : '🚏 Join the terminal queue first'}
                  </Badge>
                )}
                {!isUnassigned && !queueBlocked && !canAccept && (
                  <Badge className="bg-[var(--error-soft)] text-[var(--error)] text-[10px] mb-2">Not in your service types</Badge>
                )}
                <Button
                  onClick={() => handleOpenPreview(request)}
                  disabled={!canAccept}
                  className={`w-full text-xs md:text-sm py-5 md:py-6 font-bold rounded-xl ${
                    canAccept ? 'bg-[var(--primary)] hover:bg-[var(--primary)] shadow-lg shadow-[var(--error-soft)]' : 'bg-[var(--border)] text-[var(--muted-foreground)] cursor-not-allowed'
                  }`}
                >
                  {isUnassigned
                    ? '🚏 No Terminal Assigned'
                    : queueBlocked
                      ? (queueEntry ? `⏳ Wait — You're #${queuePosition}` : '🚏 Join Queue to Accept')
                      : canAccept ? (request.lobbyId ? '👥 View Lobby' : 'View') : 'Not Available'}
                </Button>
              </div>
            </Card>
          );
        })}

        {sortedRequests.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
            <p className="text-sm text-[var(--muted-foreground)] font-medium">No passenger requests</p>
            <p className="text-xs text-[var(--border)] mt-1">New requests will appear here</p>
          </div>
        )}
      </div>

      {/* Confirm Accept Popup */}
      {showConfirmAccept && confirmRequest && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-6 mx-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-9 h-9 text-[var(--primary)]" />
            </div>
            <h2 className="text-xl font-extrabold text-[var(--ink)] mb-1">Accept this request?</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-1">
              {confirmRequest.type === 'shared' ? 'Shared Ride' : confirmRequest.type === 'delivery' ? 'Delivery' : 'Private Ride'}
            </p>
            <p className="text-sm font-semibold text-[var(--ink-soft)] mb-1">{confirmRequest.pickup} → {confirmRequest.dropoff}</p>
            <p className="text-lg font-bold text-[var(--primary)] mb-4">₱{confirmRequest.amount}</p>
            <div className="flex gap-3">
              <Button onClick={() => { setShowConfirmAccept(false); setConfirmRequest(null); }} variant="outline" className="flex-1 border-[var(--border)] text-[var(--muted-foreground)]">Cancel</Button>
              <Button onClick={async () => { setShowConfirmAccept(false); setConfirmRequest(null); await handleAcceptRequest(confirmRequest); }} className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]">Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Accepted Popup */}
      {showAccepted && (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
          <div className="bg-surface rounded-3xl p-8 mx-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-[var(--success)]" />
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--ink)] mb-2">Request Accepted!</h2>
            <p className="text-[var(--muted-foreground)] text-sm">Opening your active ride...</p>
          </div>
        </div>
      )}

      {/* Full-page route preview */}
      {previewRequest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rider-route-preview-title"
          className={`fixed inset-0 ${isPreviewMapFullscreen ? 'z-[4000]' : 'z-[1000]'} h-screen h-[100dvh] w-full overflow-hidden bg-[var(--background)]`}
        >
          <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
            <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
              <button
                type="button"
                aria-label="Back to passenger requests"
                onClick={() => setPreviewRequest(null)}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--ink)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="min-w-0">
                <h2 id="rider-route-preview-title" className="text-lg font-bold">Route Preview</h2>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {previewRequest.type === 'delivery'
                    ? previewRequest.restaurantName || 'Restaurant delivery'
                    : previewRequest.type === 'shared'
                      ? `${previewRequest.pickup} → ${previewRequest.passengerDetails?.length || 1} passenger drop-off${(previewRequest.passengerDetails?.length || 1) === 1 ? '' : 's'}`
                      : `${previewRequest.pickup} → ${previewRequest.dropoff}`}
                </p>
              </div>
            </header>
            {isMapsLoaded ? (
              <div className={isPreviewMapFullscreen ? 'fixed inset-0 z-[4001] h-[100dvh] w-screen' : 'relative h-[42dvh] min-h-[250px] w-full shrink-0 md:h-[48dvh]'}>
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={previewMapCenter}
                  zoom={14}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false,
                    rotateControl: false,
                    tilt: 0,
                    keyboardShortcuts: false,
                    gestureHandling: 'greedy',
                  }}
                  onLoad={(map) => {
                    previewMapRef.current = map;
                    if (routePath) fitMapToRoute(map, routePath);
                  }}
                  onUnmount={() => { previewMapRef.current = null; }}
                >
                  <Marker position={currentLocation} icon={createDriverMarkerIcon()} title="Your Location" />
                  {resolvedPickupCoords && <Marker position={resolvedPickupCoords} icon={previewRequest.type === 'delivery' ? createRestaurantMarkerIcon() : createCustomerMarkerIcon()} title={previewRequest.type === 'delivery' ? 'Restaurant pickup' : 'Pickup'} />}
                  {previewRequest.type === 'shared' && resolvedPassengerDropoffs.map((stop, index) => stop.coords && (
                    <Marker
                      key={stop.id}
                      position={stop.coords}
                      icon={createDropoffMarkerIcon(index + 1)}
                      title={`Drop-off ${index + 1}: ${stop.passengerNames.join(', ')} · ${stop.address}`}
                    />
                  ))}
                  {previewRequest.type !== 'shared' && resolvedDropoffCoords && (
                    <Marker position={resolvedDropoffCoords} icon={previewRequest.type === 'delivery' ? createCustomerMarkerIcon() : createDropoffMarkerIcon()} title={previewRequest.type === 'delivery' ? 'Customer' : 'Drop-off'} />
                  )}
                  {showPickupRoute && pickupRoutePath && (
                    <Polyline path={pickupRoutePath} options={{ strokeColor: "#16a34a", strokeWeight: 7, strokeOpacity: 0.95, zIndex: 10 }} />
                  )}
                  {showDropoffRoute && dropoffRoutePath && (
                    <Polyline path={dropoffRoutePath} options={{ strokeColor: "#2563eb", strokeWeight: 7, strokeOpacity: 0.95, zIndex: 11 }} />
                  )}
                </GoogleMap>
                <div className="absolute top-2 left-2 z-10 flex gap-2">
                  <button
                    type="button"
                    aria-label="Toggle pickup route"
                    aria-pressed={showPickupRoute}
                    disabled={!pickupRoutePath}
                    onClick={() => setShowPickupRoute(visible => !visible)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showPickupRoute ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]'}`}
                  >
                    <span className="size-2.5 rounded-full bg-[#16a34a]" />
                    Pickup
                  </button>
                  <button
                    type="button"
                    aria-label="Toggle drop-off route"
                    aria-pressed={showDropoffRoute}
                    disabled={!dropoffRoutePath}
                    onClick={() => setShowDropoffRoute(visible => !visible)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${showDropoffRoute ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]'}`}
                  >
                    <span className="size-2.5 rounded-full bg-[#2563eb]" />
                    Drop off
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={isPreviewMapFullscreen ? 'Exit full-screen map' : 'View map full screen'}
                  title={isPreviewMapFullscreen ? 'Exit full screen' : 'Full screen map'}
                  onClick={() => setIsPreviewMapFullscreen((fullscreen) => !fullscreen)}
                  className="absolute right-2 top-2 z-20 grid size-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  {isPreviewMapFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
                </button>
                {routeError && (
                  <div className="absolute bottom-2 left-2 right-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--error)] shadow">
                    {routeError}
                  </div>
                )}
                {!routeError && routePath && previewRequest.type === 'shared' && (
                  <div className="absolute bottom-2 left-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)] shadow">
                    Road route: Your location → Pickup → {resolvedPassengerDropoffs.filter(stop => stop.coords).length} passenger drop-offs
                  </div>
                )}
                {!routeError && routePath && previewRequest.type !== 'shared' && (
                  <div className="absolute bottom-2 left-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)] shadow">
                    Road route: Your location → {previewRequest.type === 'delivery' ? 'Store → Customer' : 'Pickup → Drop-off'}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid h-[42dvh] min-h-[250px] shrink-0 place-items-center bg-[var(--muted)] text-[var(--muted-foreground)] md:h-[48dvh]">Loading map...</div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex items-stretch gap-2">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)] shrink-0" />
                  <div className="w-0.5 flex-1 bg-[var(--border)] my-0.5" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] shrink-0" />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="p-2 bg-[var(--success-soft)] rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="size-9 shrink-0 rounded-full border border-[var(--border)] bg-surface flex items-center justify-center">
                        {previewRequest.type === 'delivery' ? (
                          previewRequest.restaurantImage ? (
                            <ImageWithFallback
                              src={previewRequest.restaurantImage}
                              alt={`${previewRequest.restaurantName || 'Restaurant'} profile`}
                              className="size-full rounded-full object-cover"
                            />
                          ) : (
                            <Store className="size-4 text-[var(--success)]" />
                          )
                        ) : (
                          <MapPin className="size-4 text-[var(--success)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[var(--success-ink)]">{previewRequest.type === 'delivery' ? 'Restaurant pickup' : 'Pickup'}</p>
                        <p className="text-sm font-semibold truncate">{previewRequest.type === 'delivery' ? resolvedPickupAddress || previewRequest.restaurantName || previewRequest.pickup : previewRequest.pickup}</p>
                      </div>
                    </div>
                  </div>
                  <div className={`${previewRequest.type === 'shared' ? 'hidden' : ''} p-2 rounded-lg ${previewRequest.type === 'delivery' ? 'bg-[var(--error-soft)]' : ''}`}>
                    <div className="flex items-center gap-2">
                      <div className="size-9 shrink-0 rounded-full border border-[var(--border)] bg-surface flex items-center justify-center">
                        <MapPin className="size-4 text-[var(--primary)]" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-bold ${previewRequest.type === 'delivery' ? 'text-[var(--ink)]' : 'text-[var(--muted-foreground)]'}`}>
                          {previewRequest.type === 'delivery' ? `Customer · ${previewRequest.customerName}` : 'Drop-off'}
                        </p>
                        <p className="text-sm font-semibold">{previewRequest.dropoff}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {previewRequest.type === 'shared' && (
                <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <h3 className="mb-2 text-sm font-bold text-[var(--ink)]">Drop-off order</h3>
                  {resolvedPassengerDropoffs.length > 0 ? (
                    <ol className="space-y-2">
                      {resolvedPassengerDropoffs.map((stop, index) => (
                        <li key={stop.id} className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${stop.coords ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--border)] text-[var(--muted-foreground)]'}`}>
                            {stop.coords ? index + 1 : '–'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-[var(--muted-foreground)]">{stop.coords ? `Drop-off ${index + 1}` : 'Location not mapped'}</p>
                            <p className="text-sm font-semibold text-[var(--ink)]">{stop.address}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{stop.passengerNames.join(', ')}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">Loading passenger drop-offs…</p>
                  )}
                </section>
              )}
              {previewRequest.type === 'delivery' && (
                <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <h3 className="mb-3 text-sm font-bold text-[var(--ink)]">Food Ordered</h3>
                  {previewRequest.restaurantPackagePhotoUrl ? (
                    <FullSizeImagePreview
                      src={previewRequest.restaurantPackagePhotoUrl}
                      alt={`Food order from ${previewRequest.restaurantName || 'the restaurant'}`}
                      className="block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                    >
                      <img
                        src={previewRequest.restaurantPackagePhotoUrl}
                        alt=""
                        className="max-h-80 w-full object-contain"
                      />
                      <p className="border-t border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted-foreground)]">Photo provided by the restaurant · tap to view full size</p>
                    </FullSizeImagePreview>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">The restaurant has not added a food photo yet.</p>
                  )}
                </section>
              )}
              {previewRequest.type === 'shared' && (previewRequest.passengerDetails?.length || 0) > 0 && (
                <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <h3 className="mb-2 text-sm font-bold text-[var(--ink)]">Passengers</h3>
                  <div className="space-y-2">
                    {previewRequest.passengerDetails?.map((passenger) => (
                      <div key={passenger.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                        <span className="truncate font-semibold text-[var(--ink)]">{passenger.name}</span>
                        <span className="shrink-0 font-bold text-[var(--primary)]">
                          {passenger.fare == null ? "Fare unavailable" : `₱${Number(passenger.fare).toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2">
                <Button
                  onClick={() => { setDeclineTarget(previewRequest); setShowDeclinePrompt(true); }}
                  variant="outline"
                  className="min-h-12 w-full border-[var(--primary)] px-2 text-xs font-bold text-[var(--primary)] sm:text-sm"
                >
                  Decline Request
                </Button>
                <Button onClick={() => { setConfirmRequest(previewRequest); setShowConfirmAccept(true); }} className="min-h-12 w-full px-2 text-xs font-bold sm:text-sm">Accept & Navigate</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decline Popup — collects a reason before hiding the request for this rider */}
      <ReasonPromptModal
        isOpen={showDeclinePrompt}
        title="Decline this request?"
        description={
          declineTarget
            ? `${declineTarget.type === 'delivery' ? 'Delivery' : declineTarget.type === 'shared' ? 'Shared ride' : 'Private ride'} · ${declineTarget.pickup} → ${declineTarget.dropoff}`
            : undefined
        }
        confirmLabel="Decline Request"
        placeholder="e.g. Too far, not my route, already on a trip…"
        variant="warning"
        zIndexClassName="z-[3500]"
        onCancel={() => { setShowDeclinePrompt(false); setDeclineTarget(null); }}
        onSubmit={async (reason) => {
          const target = declineTarget;
          setShowDeclinePrompt(false);
          setDeclineTarget(null);
          if (!target) return;
          await handleDeclineRequest(target, reason);
        }}
      />

      {/* Active Ride Floating Button */}
      <ActiveRideButton />
    </div>
  );
}
