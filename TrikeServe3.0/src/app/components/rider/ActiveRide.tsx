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
import { OrderStatusUpdates } from "../ui/OrderStatusUpdates";
import LocationBanner, { type LocationProblem } from "../ui/LocationBanner";
import ProofCapture from "../ui/ProofCapture";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, logAudit } from "@/lib/supabase";
import { readRiderActiveRide, writeRiderActiveRide, clearRiderActiveRide, fetchRiderActiveRide } from "../../../lib/riderActiveRide";
import { supabase } from "../../../utils/supabase";
import useMapLoader from "@/lib/mapLoader";
import { createCustomerMarkerIcon, createRestaurantMarkerIcon } from "@/lib/mapIcons";
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
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.6037, lng: 120.9793 });
  // Whether the camera is locked to the driver. Defaults on so the opening view is
  // the driver, and turns off by itself the first time they pan or zoom.
  const [followDriver, setFollowDriver] = useState(true);
  // Direction of travel the map is rotated to face, null until we know it.
  const [mapHeading, setMapHeading] = useState<number | null>(null);

  const isCompleting = useRef(false);
  const lastReportedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Latest ride data, readable from mount-only callbacks; and whether at least
  // one GPS fix has been pushed to the database for the current ride.
  const rideDataRef = useRef<ActiveRideData | null>(null);
  const driverLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const routePhaseRef = useRef<string | null>(null);
  const fittedRoutePhaseRef = useRef<string | null>(null);
  const hasPersistedLocationRef = useRef(false);
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
      writeRiderActiveRide(ride);
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
  }, [rideData?.id, rideData?.status, rideData?.pickupLat, rideData?.pickupLng, rideData?.dropoffLat, rideData?.dropoffLng, isMapsLoaded, isHeadingToPickup]);

  // Match the accept-preview map: zoom to the road route once for each leg so
  // the route is in view when the rider enters the restaurant or customer phase.
  // GPS following can then keep the rider centred without repeatedly changing
  // the zoom or fighting the driver's map gestures.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rideData) return;
    const phaseKey = `${rideData.id}:${isHeadingToPickup ? 'restaurant' : 'customer'}`;
    if (fittedRoutePhaseRef.current === phaseKey) return;

    const routePoints = routePath
      || directions?.routes?.[0]?.overview_path?.map(point => ({ lat: point.lat(), lng: point.lng() }))
      || [];
    if (routePoints.length < 2) return;

    const bounds = new (window as any).google.maps.LatLngBounds();
    routePoints.forEach(point => bounds.extend(point));
    fittedRoutePhaseRef.current = phaseKey;
    mapMoveRef.current = true;
    map.fitBounds(bounds, 48);
    window.clearTimeout(mapMoveTimeoutRef.current);
    mapMoveTimeoutRef.current = window.setTimeout(() => { mapMoveRef.current = false; }, 1000);
  }, [directions, routePath, rideData?.id, isHeadingToPickup]);

  const isDeliveryRide = (ride: any) =>
    Boolean(ride?.orderId || ride?.orderNumber) ||
    String(ride?.pickup || '').startsWith('DELIVERY');

  const driverProgressStatus: Record<RideStatus, string> = {
    'on-the-way': 'on-the-way',
    arrived: 'arrived',
    pickup: 'picked-up',
    'drop-off': 'dropped-off',
    payment: 'awaiting-payment',
  };
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
    writeRiderActiveRide(updated);
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
  const uploadDeliveryProof = async () => {
    if (!rideData?.orderId || !proofFile) return false;

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
        return false;
      }

      const attached = await supabaseHelpers.attachDeliveryProof(
        rideData.orderId,
        proof?.publicUrl ?? '',
      );

      if (!attached.success) {
        console.error('Could not attach delivery proof:', attached.error);
        setProofError(attached.error || 'Could not attach the delivery photo.');
        return false;
      }

      return true;
    } finally {
      setIsUploadingProof(false);
    }
  };

  /** The handover photo is optional and must never block completing delivery. */
  const completeDeliveryWithProof = async () => {
    if (proofFile) await uploadDeliveryProof();

    setShowProofSheet(false);
    await completeRide();
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

    clearRiderActiveRide();
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
            onClick: () => setShowProofSheet(true),
            isComplete: true,
          };
        }
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
            {rideData.dropoffLat && (
              <Marker
                position={{ lat: Number(rideData.dropoffLat), lng: Number(rideData.dropoffLng) }}
                icon={isDeliveryRide(rideData) ? createCustomerMarkerIcon() : markerIcon(DROPOFF_HEX)}
                title={isDeliveryRide(rideData) ? "Customer drop-off" : "Drop-off"}
                zIndex={!isHeadingToPickup ? 90 : 70}
              />
            )}

            {/* Road route for the current leg from Routes API. */}
            {routePath && (
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

            {/* Straight-line fallback. If both road-routing APIs fail while the
                destination coordinates are known, keep a visible line toward
                the active destination until a road route can be loaded. */}
            {!directions && !routePath && driverLocation && (() => {
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
            className="absolute left-1/2 bottom-4 -translate-x-1/2 z-[4003] inline-flex items-center gap-2 rounded-full bg-surface pl-3 pr-5 py-3 shadow-xl active:scale-95 transition-transform"
          >
            <Navigation className="w-5 h-5 text-[var(--primary)]" />
            <span className="text-sm font-bold text-[var(--ink)]">Re-centre</span>
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
        peerId={rideData?.customerId || rideData?.passengerDetails?.[0]?.id || null}
        currentUserId={user?.id ?? null}
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
          <>
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

      {/*
        The handover photo sheet.

        A sheet rather than an inline row because it interrupts a flow the rider
        is in the middle of: they are standing at the door, so this has to be one
        obvious thing to deal with and then go away.

        The customer is named rather than "the customer" -- if the photo comes out
        wrong they will want to know whose order to re-check.

        Cancel is always available and never loses the ride: it only closes this
        sheet. Forcing a photo would mean a rider with a broken camera cannot
        deliver anything at all, which is worse than a delivery without a photo.
      */}
      {showProofSheet && (
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
                  Take an optional photo of the food being handed over
                  {rideData?.customerName ? ` to ${rideData.customerName}` : ''}. It is
                  kept on the order as proof of delivery. You can complete without a photo.
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
              label="Delivery photo"
              hint="The order, the customer, or both."
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
    </div>
  );
}
