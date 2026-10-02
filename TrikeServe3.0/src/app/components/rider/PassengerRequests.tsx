import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Package, Users, Car, Clock, Check, X, CheckCircle, MapPin, ChevronDown } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, Polyline, Polygon, DirectionsRenderer } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { isDeliveryServiceMode, isQueueGatedType, useTerminalQueue } from "../../hooks/useTerminalQueue";
import TerminalQueueCard from "./TerminalQueueCard";
import { isPointInPolygon, normalizeBoundaryPolygon, supabaseHelpers, logAudit, type LatLngPoint } from "@/lib/supabase";
import { supabase } from "../../../lib/supabase";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import ActiveRideButton from "./ActiveRideButton";
import ReasonPromptModal from "../ui/reason-prompt-modal";

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
  terminalId?: string | null;
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

  const createCustomerMarkerIcon = () => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--info)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/><path d="M8.7 15.9c.55-2.05 2.15-3.3 3.3-3.3s2.75 1.25 3.3 3.3" fill="#FFFFFF" stroke="none"/></svg>`;
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 40) } as any;
  };

  const createDropoffMarkerIcon = () => {
    const google = (window as any)?.google;
    if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 40) } as any;
  };

  // Get driver's terminal info for filtering - fetch fresh from Supabase to avoid stale localStorage
  const [driverTerminalId, setDriverTerminalId] = useState<string | null>(user?.terminalId || null);
  // The assigned TODA's plotted boundary, shown as a map so the driver can see
  // the area their terminal covers.
  const [todaBoundary, setTodaBoundary] = useState<LatLngPoint[] | null>(null);
  const [todaCenter, setTodaCenter] = useState<{ lat: number; lng: number } | null>(null);
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
        setTodaBoundary(normalizeBoundaryPolygon(data?.boundary_polygon));
        const lat = Number(data?.center_lat);
        const lng = Number(data?.center_lng);
        setTodaCenter(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
        if (data?.name) setTodaName(data.name);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [driverTerminalId]);

  // Centre the boundary map on the terminal centre, or the polygon's centroid,
  // or the driver when neither is available.
  const todaMapCenter = todaCenter ?? (todaBoundary
    ? {
        lat: todaBoundary.reduce((sum, p) => sum + p.lat, 0) / todaBoundary.length,
        lng: todaBoundary.reduce((sum, p) => sum + p.lng, 0) / todaBoundary.length,
      }
    : currentLocation);

  const insideToda = todaBoundary
    ? isPointInPolygon(currentLocation.lat, currentLocation.lng, todaBoundary)
    : null;

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const { data: rideRequests } = await supabaseHelpers.getRideRequests({ status: 'pending' });
        const { data: waitingLobbies } = await supabaseHelpers.getWaitingLobbiesForDriver();
        const missingNameIds = [...new Set(
          (rideRequests || [])
            .filter((req: any) => !req.customer_name && req.customer_id)
            .map((req: any) => req.customer_id)
        )];
        const nameMap: Record<string, string> = {};
        if (missingNameIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name')
            .in('id', missingNameIds);
          (usersData || []).forEach((u: any) => { if (u.name) nameMap[u.id] = u.name; });
        }
        // Requests this rider already declined are hidden from them — they stay
        // available to every other rider, so the customer is unaffected.
        const visibleRideRequests = (rideRequests || []).filter(
          (req: any) => !supabaseHelpers.isDeclinedByDriver(req, user?.id)
        );
        const visibleLobbies = (waitingLobbies || []).filter(
          (lobby: any) => !supabaseHelpers.isDeclinedByDriver(lobby, user?.id)
        );

        const mappedRequests = visibleRideRequests.map((req: any) => ({
          id: req.id,
          type: mapRideType(req.ride_type, req.pickup_location),
          pickup: formatPickup(req.pickup_location),
          dropoff: req.dropoff_location || 'Drop-off',
          payment: req.payment_method === 'GCASH' ? 'PREPAID' : 'COD',
          amount: Number(req.amount || 0),
          foodCost: Number(req.food_cost || 0),
          customerName: req.customer_name || nameMap[req.customer_id] || 'Customer',
          customerPhoto: '👤',
          distance: '2.5 km',
          estimatedTime: '7 mins',
          passengers: req.passenger_count || 1,
          customerId: req.customer_id,
          ...parseDeliveryTag(req.pickup_location),
          pickupAddress: req.pickup_address || undefined,
          dropoffAddress: req.dropoff_address || undefined,
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
        const mappedLobbies = visibleLobbies.map((lobby: any) => {
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
            payment: lobby.payment_method === 'COD' ? 'COD' : 'PREPAID',
            amount: Number(lobby.price_per_seat || 15),
            passengers: passengers.length,
            maxPassengers: Number(lobby.max_seats || 3),
            customerName: passengers.length > 1 ? passengers.map((p: any) => p.name || 'Passenger').join(', ') : (passengers[0]?.name || 'Customer'),
            customerPhoto: 'shared',
            distance: '2.5 km',
            estimatedTime: '7 mins',
            customerId: lobby.customer_id,
            lobbyId: lobby.id,
            passengerDetails: passengers,
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
    if (!previewRequest || !isMapsLoaded || !(window as any).google) return;

    const pLat = Number(previewRequest.pickupLat);
    const pLng = Number(previewRequest.pickupLng);
    const dLat = Number(previewRequest.dropoffLat);
    const dLng = Number(previewRequest.dropoffLng);
    const isDelivery = previewRequest.type === 'delivery';
    const DirectionsService = new (window as any).google.maps.DirectionsService();

    if (!isNaN(pLat) && !isNaN(pLng)) {
      setResolvedPickupCoords({ lat: pLat, lng: pLng });
      setPreviewMapCenter({ lat: pLat, lng: pLng });
    }

    const resolveAndRoute = (pickup: { lat: number; lng: number }) => {
      setResolvedPickupCoords(pickup);
      setPreviewMapCenter(pickup);

      DirectionsService.route({
        origin: new (window as any).google.maps.LatLng(currentLocation.lat, currentLocation.lng),
        destination: new (window as any).google.maps.LatLng(pickup.lat, pickup.lng),
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
      }, (result: any, status: string) => {
        if (status === 'OK') setDirectionsResult(result);
      });

      // Show drop-off route for ALL ride types, not just deliveries
      if (!isNaN(dLat) && !isNaN(dLng)) {
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
    const acceptedRide = { ...request, passengerDetails, driverId: user.id, driverName: user.name, driverPlate: user.todaPlate, driverRating: '4.8', status: 'accepted', acceptedAt: new Date().toISOString(), eta: '5 mins' };

    if (request.type === 'delivery' && (request.orderId || request.orderNumber)) {
      if (request.orderId) {
        const { error: directErr } = await supabase
          .from('orders')
          .update({ status: 'on-the-way', driver_name: user.name || 'Driver', updated_at: new Date().toISOString() })
          .eq('id', request.orderId);
        if (directErr) console.error('❌ Direct orders update failed:', directErr);
        else console.log('✅ Orders table updated to on-the-way (direct)');
      }
      await supabaseHelpers.updateDeliveryOrderStatus(request.orderId, request.orderNumber, 'on-the-way');
      if (request.id && !request.id.startsWith('lobby_')) {
        await supabaseHelpers.updateRideRequest(request.id, { status: 'accepted', driver_id: user.id });
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

  // A request tagged to another TODA isn't this driver's to serve. Only rides are
  // terminal-scoped — delivery reaches any rider, so it's never restricted.
  const isWrongTerminal = (request: PassengerRequest) => {
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

  const sortedRequests = recommendedPickup
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
                    {todaBoundary ? ` • ${todaBoundary.length} plotted points` : " • no area set yet"}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-[var(--muted-foreground)] flex-shrink-0 transition-transform ${showTodaMap ? "rotate-180" : ""}`}
              />
            </button>

            {showTodaMap && (
              <div className="border-t border-[var(--border)]">
                {todaBoundary ? (
                  <div className="relative w-full h-56 md:h-64">
                    {isMapsLoaded ? (
                      <GoogleMap
                        mapContainerStyle={{ width: "100%", height: "100%" }}
                        center={todaMapCenter}
                        zoom={14}
                        options={{ zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
                      >
                        <Polygon
                          path={todaBoundary}
                          options={{
                            fillColor: "#bc4b1f",
                            fillOpacity: 0.18,
                            strokeColor: "#bc4b1f",
                            strokeWeight: 2,
                            clickable: false,
                          }}
                        />
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
                        {insideToda ? "Inside TODA boundary" : "Outside TODA boundary"}
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
                    {request.customerPhoto === 'shared' ? (
                      <Users className="w-5 h-5 text-[var(--primary)]" />
                    ) : request.type === 'delivery' ? (
                      <Package className="w-5 h-5 text-[var(--info)]" />
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--ink)] text-sm truncate">{request.customerName}</p>
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
                  <Badge className="bg-[var(--amber-soft)] text-[var(--amber-dark)] text-[10px] mb-2 border border-[var(--amber-soft)]">
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
                      : canAccept ? (request.lobbyId ? '👥 View Lobby' : '🛵 View & Accept') : 'Not Available'}
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

      {/* Preview Modal */}
      {previewRequest && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end">
          <div className="bg-surface w-full max-h-[90vh] rounded-t-3xl flex flex-col overflow-hidden">
            <div className="bg-[var(--primary)] text-white px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Route Preview</h2>
              <button onClick={() => setPreviewRequest(null)} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            {isMapsLoaded ? (
              <div className="w-full h-64 md:h-80">
                <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={previewMapCenter} zoom={14} options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false }}>
                  <Marker position={currentLocation} icon={createDriverMarkerIcon()} title="Your Location" />
                  {resolvedPickupCoords && <Marker position={resolvedPickupCoords} icon={createCustomerMarkerIcon()} title="Pickup" />}
                  {previewRequest.dropoffLat && previewRequest.dropoffLng && (
                    <Marker position={{ lat: Number(previewRequest.dropoffLat), lng: Number(previewRequest.dropoffLng) }} icon={createDropoffMarkerIcon()} title="Drop-off" />
                  )}
                  {directionsResult && <DirectionsRenderer directions={directionsResult} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "var(--success)", strokeWeight: 5, strokeOpacity: 0.85 } }} />}
                  {deliveryRouteResult && <DirectionsRenderer directions={deliveryRouteResult} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "var(--primary)", strokeWeight: 5, strokeOpacity: 0.85 } }} />}
                </GoogleMap>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center"><p className="text-[var(--muted-foreground)]">Loading map...</p></div>
            )}
            <div className="p-4 space-y-3">
              <div className="flex items-stretch gap-2">
                <div className="flex flex-col items-center pt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)] shrink-0" />
                  <div className="w-0.5 flex-1 bg-[var(--border)] my-0.5" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] shrink-0" />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="p-2 bg-[var(--success-soft)] rounded-lg">
                    <p className="text-[10px] text-[var(--success)] font-bold">Pickup</p>
                    <p className="text-sm font-semibold">{previewRequest.pickup}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${previewRequest.type === 'delivery' ? 'bg-[var(--error-soft)]' : ''}`}>
                    <p className={`text-[10px] font-bold ${previewRequest.type === 'delivery' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}>
                      {previewRequest.type === 'delivery' ? 'Deliver to Customer' : 'Drop-off'}
                    </p>
                    <p className="text-sm font-semibold">{previewRequest.dropoff}</p>
                  </div>
                </div>
              </div>
              <Button onClick={() => { setConfirmRequest(previewRequest); setShowConfirmAccept(true); }} className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] py-6 font-bold">Accept & Navigate</Button>
              <Button
                onClick={() => { setDeclineTarget(previewRequest); setShowDeclinePrompt(true); }}
                variant="outline"
                className="w-full border-[var(--primary)] text-[var(--primary)]"
              >
                Decline Request
              </Button>
              <Button onClick={() => setPreviewRequest(null)} variant="outline" className="w-full border-[var(--border)] text-[var(--muted-foreground)]">Close</Button>
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
