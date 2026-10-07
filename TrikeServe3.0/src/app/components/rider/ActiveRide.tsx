import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Navigation, MapPin, CheckCircle, Users, User, X, MessageSquare } from "lucide-react";
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer, Polyline } from "@react-google-maps/api";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import FloatingChatHead from "../ui/FloatingChatHead";
import { useRideResume } from "../../../lib/rideResume";
import RideChatOverlay from "../rider/RideChatOverlay";
import { Badge } from "../ui/badge";
import LocationBanner, { type LocationProblem } from "../ui/LocationBanner";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, logAudit } from "@/lib/supabase";
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

export default function ActiveRide() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

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

  /*
   * Hold the marker for as long as this ride is live, and release it the moment it
   * is not.
   *
   * `completed` releases it. A marker pointing at a finished trip would pull the
   * driver back to a ride screen for a ride that no longer exists -- and the resume
   * check would query a row that is gone.
   */
  useEffect(() => {
    if (!live) {
      // Only release the marker when the ride has actually ended. `status` starts as
      // undefined before `rideData` hydrates, and treating that transient as "over"
      // would clear the marker on the very first tick.
      if (rideData && rideData.status === 'completed') {
        syncRideResume(null);
      }
      return;
    }
    syncRideResume(rideData.id);
  }, [rideData?.id, rideData?.status, syncRideResume]);
  const [rideData, setRideData] = useState<ActiveRideData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  // Drives the inline location banner; null while the device can give us a position.
  const [locationProblem, setLocationProblem] = useState<LocationProblem | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 });

  const isCompleting = useRef(false);
  const lastReportedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Latest ride data, readable from mount-only callbacks; and whether at least
  // one GPS fix has been pushed to the database for the current ride.
  const rideDataRef = useRef<ActiveRideData | null>(null);
  const hasPersistedLocationRef = useRef(false);
  rideDataRef.current = rideData;
  const [showRideComplete, setShowRideComplete] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  /** The passenger's profile photo, resolved by id from the users table. */
  const [passengerAvatar, setPassengerAvatar] = useState<string | null>(null);

  /**
   * In-ride chat with the passenger.
   *
   * A driver had no way to talk to the passenger without leaving the ride
   * screen, which meant calling them or nothing. This reuses the same
   * conversation the customer's Chat button opens (`findOrCreateRideChat`), so
   * both sides land in one thread rather than two half-used ones.
   */
  const [chatId, setChatId] = useState<string | null>(null);
  /** Whether the chat overlay is showing. */
  const [chatPopupOpen, setChatPopupOpen] = useState(false);
  /** Messages from the passenger the driver has not looked at yet. */
  const [unreadFromPassenger, setUnreadFromPassenger] = useState(0);
  /** Counts from the last poll, so a rise can be told apart from steady state. */
  const lastSeenCount = useRef(0);
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
  const [customerCancellation, setCustomerCancellation] = useState<{ reason: string | null } | null>(null);
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
        }
      }
    } else {
      const saved = localStorage.getItem('trikeserve_active_ride');
      if (saved) try { setRideData(JSON.parse(saved)); } catch (e) {}
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
  const openPassengerChat = useCallback(async () => {
    const peerId = rideData?.customerId || rideData?.passengerDetails?.[0]?.id;
    if (!peerId || !user?.id) return;

    const { data, error } = await supabaseHelpers.findOrCreateRideChat({
      currentUserId: user.id,
      currentUserName: user.name,
      currentUserRole: user.role,
      peerId,
      peerName: rideData.customerName,
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
  }, [rideData?.customerId, rideData?.id, user?.id, navigate, passengerAvatar, resolvedName, rideData?.customerName]);

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
    const peerId = rideData?.customerId || rideData?.passengerDetails?.[0]?.id;
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
  }, [rideData?.customerId, user?.id]);

  useEffect(() => {
    if (chatId || !chatStarted || !user?.id) return;
    resolvePassengerChat();
  }, [chatId, chatStarted, user?.id, resolvePassengerChat]);

  /**
   * Poll the passenger thread so the floating head's unread badge stays honest.
   *
   * Only the count matters now that reading happens in the Messages tab, so this
   * deliberately does not keep a local copy of the messages -- that would be a
   * second, staler version of what the tab already shows.
   */
  useEffect(() => {
    if (!chatId || !user?.id) return;
    let cancelled = false;

    const check = async () => {
      const { data } = await supabaseHelpers.getChatMessages(chatId);
      if (cancelled) return;
      const fromThem = ((data || []) as any[]).filter(
        (m) => m.sender_id !== user.id && m.read === false
      );
      const count = fromThem.length;

      // Ripple only when the count actually grows, not on the first poll and not
      // every five seconds. Without the previous-count check the head pulsed
      // forever on any thread that had unread history.
      if (count > lastSeenCount.current) {
        setPulseKey((k) => k + 1);
      }
      lastSeenCount.current = count;
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
    const cid = rideData?.customerId || rideData?.passengerDetails?.[0]?.id;
    if (!cid) {
      setPassengerAvatar(null);
      return;
    }
    let active = true;
    supabase.from('users').select('avatar_url').eq('id', cid).maybeSingle()
      .then(({ data }) => { if (active) setPassengerAvatar(data?.avatar_url || null); })
      .catch(() => { /* no photo is not a failure; the name still renders */ });
    return () => { active = false; };
  }, [rideData?.customerId, rideData?.passengerDetails]);

  useEffect(() => { if (driverLocation) setMapCenter(driverLocation); }, [driverLocation]);

  /**
   * Keep the camera on the driver.
   *
   * Only pans, never zooms, and only when the driver has moved far enough to
   * matter. The imperative pan is what actually moves an already-mounted map --
   * re-passing `center` as a prop after mount does not, which is why the driver
   * drifted off screen while the route kept re-fitting the viewport.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverLocation) return;

    let cancelled = false;
    const pan = () => {
      if (cancelled || mapRef.current !== map) return;
      map.panTo(driverLocation);
    };
    // panTo interrupts any in-flight pan animation, so a slow gesture would
    // otherwise be cut short and leave the camera behind the vehicle.
    const interval = setInterval(pan, 1000);
    pan();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [driverLocation]);

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

    localStorage.removeItem('trikeserve_active_ride');
    setShowRideComplete(true);
    setTimeout(() => {
      navigate('/rider');
    }, 2500);
    } finally {
      isCompleting.current = false;
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
        console.log('🚫 Customer cancelled the ride:', data.cancel_reason);
        setCustomerCancellation({ reason: data.cancel_reason || null });
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

  /**
   * The single action for the ride's current phase.
   *
   * Derived once so the full sheet and the compact bar cannot drift apart -- they
   * are the same control at two sizes, and two hand-written lists meant a phase
   * could gain a button in one and not the other.
   */
  const activeAction = (() => {
    switch (rideData.status) {
      case 'on-the-way':
        return { label: "I've Arrived", onClick: () => updateStatus('arrived'), isComplete: false };
      case 'arrived':
        return { label: 'Confirm Pickup', onClick: () => updateStatus('pickup'), isComplete: false };
      case 'pickup':
        return { label: 'Arrived at Drop-off', onClick: () => updateStatus('drop-off'), isComplete: false };
      case 'drop-off':
        return { label: 'Confirm Drop-off', onClick: () => updateStatus('payment'), isComplete: false };
      case 'payment':
        return { label: 'Complete Ride', onClick: completeRide, isComplete: true };
      default:
        return null;
    }
  })();

  // The customer cancelled — say so, and show the reason they gave.
  if (customerCancellation) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[4000] flex items-center justify-center p-4">
        <Card className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-2xl text-center">
          <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h3 className="text-xl font-bold text-[#121212] mb-2">Ride cancelled</h3>
          <p className="text-sm text-[#64748B] mb-4">The customer cancelled this ride request.</p>
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
      {/* Hidden entirely while the chat panel is open, not made transparent.

          Making it transparent was tried first and was the wrong call: this header
          sits in the normal flow, so clearing its fill exposed the page background
          behind it -- the same dark green band, just without a title on it.

          Removing it outright moves the map up into the vacated space, so the strip
          shows the map the driver is actually navigating by. Hiding it is also why
          the back arrow does not need to survive: the chat head closes the panel,
          and the ride screen is still there underneath it. */}
      {!chatPopupOpen && (
      <div className="bg-[var(--primary)] text-white p-4 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/rider')} className="text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-bold">Active Ride</h1>
          {/* The map and the detail sheet are resized by dragging the sheet's
              handle, so this toggle was a redundant second way to do the same
              thing. Removed rather than kept as a duplicate control. */}
          <span className="w-10" aria-hidden="true" />
        </div>
      </div>
      )}

      <div className={`relative w-full transition-all duration-300 ${isMinimized ? 'h-[80vh]' : 'h-80'}`}>
        {isMapsLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            // Re-centre imperatively on every accepted fix.
            //
            // Passing `center` as a prop does not re-centre after mount: React
            // only applies it when the value changes by identity, and the map
            // had already taken over the camera. So the driver icon walked off
            // screen while the route re-fit the viewport around itself.
            // `reportDriverLocation` already throttles to meaningful movement, so
            // this does not fire on GPS jitter.
            center={driverLocation || mapCenter}
            onLoad={(map) => { mapRef.current = map; }}
            zoom={15}
            options={{ disableDefaultUI: true }}
          >
            {driverLocation && (
              <Marker position={driverLocation} icon={{ url: tricycleIcon, scaledSize: new (window as any).google.maps.Size(44, 44), anchor: new (window as any).google.maps.Point(22, 22) }} zIndex={100} />
            )}
            {/* Both endpoints stay pinned for the whole ride, not just whichever
                one is next. Showing only the active leg hid the destination from
                the driver, so there was nothing on screen to steer toward. */}
            {rideData.pickupLat && (
              <Marker position={{ lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) }} icon={markerIcon(PICKUP_HEX)} title="Pickup" zIndex={isHeadingToPickup ? 90 : 70} />
            )}
            {rideData.dropoffLat && (
              <Marker position={{ lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) }} icon={markerIcon(DROPOFF_HEX)} title="Drop-off" zIndex={!isHeadingToPickup ? 90 : 70} />
            )}

            {/* Google Directions route line */}
            {directions && (
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

            {/* Straight-line fallback.
                The road route only exists if DirectionsService answered. When it
                fails -- quota, offline, an unroutable pair -- there was no line at
                all, so the driver saw two pins and no path between them. This
                draws the direct connection from the driver to the active
                destination, which at least shows which way to head. The real
                route replaces it as soon as directions arrive. */}
            {!directions && driverLocation && (() => {
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
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold shadow-md">
              <span className="size-2.5 rounded-full" style={{ background: DROPOFF_HEX }} aria-hidden="true" />
              Drop-off · {rideData.dropoff}
            </span>
          </div>
        )}
        <Button onClick={() => {
          const dest = isHeadingToPickup
            ? { lat: rideData.pickupLat, lng: rideData.pickupLng }
            : { lat: rideData.dropoffLat, lng: rideData.dropoffLng };
          if (dest && dest.lat) window.open(`https://www.google.com/maps/dir/?api=1&origin=${driverLocation?.lat},${driverLocation?.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`, '_blank');
        }} className="absolute top-3 right-3 bg-surface text-black shadow-md hover:bg-[var(--muted)]"><Navigation className="w-4 h-4 mr-2" />Navigate</Button>
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
        peerAvatar={passengerAvatar}
        peerName={resolvedName || rideData.customerName || 'Passenger'}
        peerIsGroup={rideData.customerPhoto === 'shared'}
        senderRole="rider"
        onClose={() => setChatPopupOpen(false)}
      />

      {/* Hidden while the panel is open: the panel carries its own head, and both
          would otherwise sit in the same top-right corner on top of each other. */}
      {chatStarted && rideData.status !== 'completed' && !chatPopupOpen && (
        <FloatingChatHead
          storageKey="trikeserve_chat_head_pos_rider"
          peerAvatar={passengerAvatar}
          peerIsGroup={rideData.customerPhoto === 'shared'}
          peerLabel={resolvedName || rideData.customerName || 'passenger'}
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
          aria-label={isMinimized ? 'Show ride details' : 'Expand map'}
          aria-expanded={isMinimized}
          className="mx-auto mb-1 flex h-6 w-full max-w-24 items-center justify-center rounded-full hover:bg-[var(--muted)] active:bg-[var(--muted)]"
        >
          <span className="h-1.5 w-12 rounded-full bg-[var(--muted-foreground)] opacity-60" aria-hidden="true" />
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
            <div className="size-11 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
              {passengerAvatar ? (
                <img
                  src={passengerAvatar}
                  alt={`${resolvedName || rideData.customerName || 'Passenger'}'s profile`}
                  className="w-full h-full object-cover"
                />
              ) : rideData.customerPhoto === 'shared' ? (
                <Users className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
              ) : (
                <User className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
              )}
            </div>
            {/* Details run left to right across the bar: photo, name, fare and
                destination, then the controls. The name and the detail were
                stacked in a column, which made the bar taller for no gain and
                pushed the action button toward the edge. */}
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <p className="truncate font-bold text-[var(--ink)]">
                {resolvedName || rideData.customerName}
              </p>
              <span className="text-[var(--muted-foreground)]" aria-hidden="true">·</span>
              <p className="truncate text-xs text-[var(--muted-foreground)]">
                ₱{rideData.amount} · {isHeadingToPickup ? 'To pickup' : 'To drop-off'}
              </p>
            </div>
            <Button
              onClick={openPassengerChat}
              aria-label="Message passenger"
              className="size-11 flex-shrink-0 rounded-full bg-[var(--surface)] border-2 border-[var(--primary)] flex items-center justify-center"
            >
              <MessageSquare className="w-4 h-4 text-[var(--primary)]" aria-hidden="true" />
            </Button>
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
        <Card className="p-4 border-2 border-[var(--muted)] shadow-sm">
          <div className="flex gap-4 mb-3">
            {/* Round passenger photo, cropped by the wrapper. A shared ride has
                several passengers and no single person to show, so it keeps the
                group glyph. */}
            <div className="size-14 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary-soft)] flex items-center justify-center">
              {passengerAvatar ? (
                <img
                  src={passengerAvatar}
                  alt={`${resolvedName || rideData.customerName || 'Passenger'}'s profile`}
                  className="w-full h-full object-cover"
                />
              ) : rideData.customerPhoto === 'shared' ? (
                <Users className="w-6 h-6 text-[var(--primary)]" aria-hidden="true" />
              ) : (
                <User className="w-6 h-6 text-[var(--primary)]" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-lg">{resolvedName || rideData.customerName}</h2>
              {rideData.passengerDetails && rideData.passengerDetails.length > 1 && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {rideData.passengerDetails.map((p: any) => p.name || 'Passenger').join(', ')}
                </p>
              )}
              <div className="flex gap-2 mt-1">
                <Badge className="bg-[var(--primary)]">₱{rideData.amount}</Badge>
                <Badge variant="outline" className="text-[var(--muted-foreground)]">{rideData.payment === 'COD' ? 'Cash' : 'Prepaid'}</Badge>
              </div>
            </div>
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
            <div className={`flex gap-3 p-2 rounded-lg ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-[var(--error-soft)] border border-[var(--error-soft)]' : ''}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 ${!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) ? 'bg-[var(--primary)]' : 'bg-[var(--muted-foreground)]'}`} />
              <div className="flex-1 text-sm">
                <p className="text-[var(--muted-foreground)] text-xs">Drop-off</p>
                <p className="font-semibold">{rideData.dropoff}</p>
              </div>
              {!isHeadingToPickup && ['pickup', 'drop-off'].includes(rideData.status) && <span className="text-[10px] bg-[var(--primary)] text-white px-2 py-0.5 rounded-full font-bold self-center">HERE</span>}
            </div>
          </div>
        </Card>
        )}

        <div className="grid gap-2">
          {!isMinimized && (
            <Button
              onClick={openPassengerChat}
              className="bg-[var(--surface)] text-[var(--ink)] border-2 border-[var(--primary)] py-4 font-bold flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              Message passenger
            </Button>
          )}
        </div>

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
            className={`${activeAction.isComplete ? 'bg-[var(--success)]' : 'bg-[var(--primary)]'} -mx-1 mt-2 w-[calc(100%+0.5rem)] py-4 text-base font-bold shadow-lg`}
          >
            {activeAction.label}
          </Button>
        )}

      </div>
    </div>
  );
}
