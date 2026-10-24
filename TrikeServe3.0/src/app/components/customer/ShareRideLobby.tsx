import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, MapPin, Users, Clock, X, ChevronDown, MessageCircle, User, Minimize2, Star, Navigation, Flag, CreditCard, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabase, supabaseHelpers, isSimilarRoute, isPointWithinAnyTerminalBorder, isPointOnRoadCorridor, haversineDistanceMeters, normalizeRoadWidth } from "@/lib/supabase";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import MapTypeToggle from "../ui/MapTypeToggle";
import useMapLoader from "@/lib/mapLoader";
import { useElapsedTime } from "@/app/hooks/useElapsedTime";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'
import FloatingChatHead from "../ui/FloatingChatHead";
import RideChatOverlay from "../rider/RideChatOverlay";
import { normalizeRouteColor, normalizeTerminalColor, terminalMarkerIcon } from "../ui/TerminalIcon";
import { backfillLegacySharedRidePassengerFares, sumSharedRidePassengerFares, DEFAULT_MAX_PASSENGERS } from "@/lib/pricing";
import { useDevModeOverride } from "../../hooks/useDevModeSettings";
import { customerActiveShareLobbyStorageKey, isCustomerLobbyPassenger } from "../../../lib/rideLock";
import { legacyRouteFromBoundary, normalizeTerminalRoutes } from "@/lib/terminalRoutes";
import { Tricycle } from "../ui/Tricycle";
import BrowseAvailableLobbies from "./BrowseAvailableLobbies";

const DRIVER_STATUS_ICONS: Record<string, typeof MapPin> = {
  cancelled: X,
  'on-the-way': Tricycle,
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

interface LobbyPassenger {
  id: string;
  name: string;
  emoji: string;
  /** The passenger's own avatar: a profile photo URL, or an emoji fallback. */
  avatar?: string;
  joinedAt: string;
  pickup: string;  // Individual pickup location
  pickupAddress: string;  // Individual pickup address
  // Each passenger's destination is stored for individual fares, shared stop
  // ordering, map markers, and driver routing.
  dropoff?: string;
  dropoffAddress?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  /** The terminal road selected when this passenger booked. */
  route_id?: string | null;
  dropoff_status?: string | null;
  dropoffStatus?: string | null;
  payment_status?: string | null;
  paymentStatus?: string | null;
  /** This passenger's fare: the full base fare plus their distance charge. */
  fare?: number;
}

type OrderedLobbyDropoff = {
  passenger: LobbyPassenger;
  index: number;
  distance: number | null;
};

function orderLobbyDropoffs(
  passengers: LobbyPassenger[],
  pickupCoords?: { lat: number; lng: number } | null,
): OrderedLobbyDropoff[] {
  return passengers
    .map((passenger, index) => {
      const lat = passenger.dropoffLat == null ? Number.NaN : Number(passenger.dropoffLat);
      const lng = passenger.dropoffLng == null ? Number.NaN : Number(passenger.dropoffLng);
      const distance =
        pickupCoords && Number.isFinite(lat) && Number.isFinite(lng)
          ? haversineDistanceMeters(pickupCoords, { lat, lng })
          : null;
      return { passenger, index, distance };
    })
    .sort((a, b) => {
      if (a.distance == null && b.distance == null) return a.index - b.index;
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
}

function createDropoffStopIcon(color: string): google.maps.Symbol | undefined {
  const maps = (window as any)?.google?.maps;
  if (!maps?.SymbolPath) return undefined;
  return {
    path: maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
    scale: 12,
  } as google.maps.Symbol;
}

/**
 * A passenger's avatar.
 *
 * `avatar` holds either a real profile photo URL or an emoji placeholder, so a
 * bare string cannot be dropped into the JSX: a URL would print as its own
 * address. Anything that looks like an image renders as one; everything else is
 * treated as the emoji it is. Falls back to the legacy `emoji` field for
 * passengers stored before avatars were captured.
 */
function PassengerAvatar({
  passenger,
  resolvedAvatar,
  showProfile,
  className,
}: {
  passenger: LobbyPassenger;
  /** The passenger's live photo from `users.avatar_url`, when known. */
  resolvedAvatar?: string | null;
  /** Only the signed-in customer's account may display a profile photo. */
  showProfile: boolean;
  className?: string;
}) {
  if (!showProfile) {
    return <User className={className || 'h-7 w-7 text-white'} aria-hidden="true" />;
  }

  // The live profile photo wins: it is the only source that also covers a
  // passenger who joined before the lobby row stored an avatar.
  const value = (resolvedAvatar || passenger.avatar || passenger.emoji || '👤').trim();
  const isImage = /^https?:\/\//i.test(value) || value.startsWith('data:image/');
  if (!isImage) return <span className={className}>{value}</span>;
  return <img src={value} alt="" className={`size-full object-cover ${className || ''}`} />;
}

interface ShareRideLobby {
  id: string;
  terminal_id?: string | null;
  customer_id?: string;
  pickup_location: string;
  pickup_address: string;
  dropoff_location: string;
  dropoff_address: string;
  passengers_json?: LobbyPassenger[];
  max_seats: number;
  price_per_seat: number;
  payment_method?: string;
  status: 'waiting' | 'driver_found' | 'in_progress' | 'completed' | 'cancelled';
  driver_id?: string;
  driver_name?: string;
  driver_plate?: string;
  driver_rating?: string;
  driver_status?: string;
  driver_status_message?: string;
  created_at: string;
}

interface ShareRideLobbyProps {
  lobbyId?: string;
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  pickupCoords?: { lat: number; lng: number } | null;
  dropoffCoords?: { lat: number; lng: number } | null;
  passengerCount?: number;
  maxPassengersAllowed?: number;
  pricePerSeat?: number;
  paymentMethod?: 'COD';
  selectedTerminalId?: string | null;
  selectedRouteId?: string | null;
  routePoints?: Array<{ lat: number; lng: number }> | null;
  routeWidthM?: number | null;
  presentation?: 'sheet' | 'page';
  onDriverFound: (lobbyId: string) => void;
  onLobbyLoaded?: (lobbyId: string) => void;
  onLobbyMoved?: (lobbyId: string) => void;
  onClose: (status?: string) => void;
}

type MatchingLobbyChoice = 'join' | 'create' | 'cancel' | 'stay';
type MatchingLobbyPromptMode = 'booking' | 'after-create';

export default function ShareRideLobby({
  lobbyId,
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  pickupCoords,
  dropoffCoords,
  passengerCount = 1,
  maxPassengersAllowed = DEFAULT_MAX_PASSENGERS,
  pricePerSeat = 15,
  paymentMethod = 'COD',
  selectedTerminalId,
  selectedRouteId,
  routePoints,
  routeWidthM,
  presentation = 'sheet',
  onDriverFound,
  onLobbyLoaded,
  onLobbyMoved,
  onClose
}: ShareRideLobbyProps) {
  const { user } = useAuth();
  const lobbySeatLimit = Number.isFinite(maxPassengersAllowed) && maxPassengersAllowed >= 1
    ? Math.floor(maxPassengersAllowed)
    : DEFAULT_MAX_PASSENGERS;
  const [enforceBoundary] = useDevModeOverride("enforceBoundary");
  const [openingChat, setOpeningChat] = useState(false);
  /**
   * Floating chat head state, mirroring the driver's ride screen.
   *
   * The lobby is the customer's active shared ride, yet it only had a Message
   * button that navigated away -- no way to reach the driver without leaving the
   * screen. Same shared component as the driver's side, so the drag, snap, badge
   * and ripple cannot drift apart between the two.
   */
  const driverChatId = useRef<string | null>(null);
  /** Whether the ride chat overlay is showing. */
  const [lobbyChatPopup, setLobbyChatPopup] = useState(false);
  /** Messages from the driver the customer has not looked at yet. */
  const [driverUnread, setDriverUnread] = useState(0);
  /** Latest message seen per driver thread, excluding badge-only updates. */
  const lastDriverMessage = useRef<{ conversationId: string; messageId: string | null } | null>(null);
  /** Bumped to replay the ripple; a finished CSS animation needs a remount. */
  const [chatPulseKey, setChatPulseKey] = useState(0);
  const [chatHeadActivated, setChatHeadActivated] = useState(false);
  const chatHeadScopeRef = useRef<string | null>(null);
  /**
   * Whether chat has been opened on this ride.
   *
   * Read from storage on mount because navigating to the Messages tab unmounts
   * this screen; without it, coming back would drop the head out of the corner.
   * Shares the customer-side key with Home so the head keeps one parked spot.
   */
  const [chatOpened, setChatOpened] = useState(() => {
    try {
      return localStorage.getItem('trikeserve_chat_opened_customer') === '1';
    } catch {
      return false;
    }
  });
  /*
   * Resolve the signed-in customer's profile photo for their own passenger row.
   * Other passengers use a generic silhouette. The driver's photo is resolved
   * separately because the accept payload has no photo column.
   */
  const [passengerAvatars, setPassengerAvatars] = useState<Record<string, string>>({});
  const [driverProfileAvatar, setDriverProfileAvatar] = useState<string | null>(null);
  const [lobby, setLobby] = useState<ShareRideLobby | null>(null);
  const [matchingRouteLobby, setMatchingRouteLobby] = useState<ShareRideLobby | null>(null);
  const [matchingLobbyPromptMode, setMatchingLobbyPromptMode] = useState<MatchingLobbyPromptMode>('booking');
  const matchingLobbyChoiceResolver = useRef<((choice: MatchingLobbyChoice) => void) | null>(null);
  const [bookingCancelled, setBookingCancelled] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLobbyBrowser, setShowLobbyBrowser] = useState(false);
  const [moveFailureMessage, setMoveFailureMessage] = useState<string | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<'completed' | 'cancelled' | null>(null);
  const [terminalCancelMessage, setTerminalCancelMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverAssignedNotice, setDriverAssignedNotice] = useState<{
    lobbyId: string;
    driverId: string;
    driverName: string;
    driverPlate?: string;
  } | null>(null);
  const handledDriverAssignmentRef = useRef<string | null>(null);
  const hasHandledTerminalLobbyStatus = useRef(false);
  const terminalCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [driverStatusPopup, setDriverStatusPopup] = useState<{ status: string; message: string } | null>(null);
  const [paymentModalPassengerId, setPaymentModalPassengerId] = useState<string | null>(null);
  const driverStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [computedDriverRating, setComputedDriverRating] = useState<string | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [showFullCapacityPopup, setShowFullCapacityPopup] = useState(false);
  const [showOutOfBoundaryPopup, setShowOutOfBoundaryPopup] = useState(false);
  // Distinguishes "we found it and it's outside every terminal" from "we could
  // not find it at all" — the same dialog covers both and the wording differs.
  // Which gate refused this lobby, so the dialog can explain the actual problem
  // rather than a generic "out of area": the customer not being at a terminal,
  // the drop-off not being on a route, and not being able to locate the drop-off
  // are three different things a customer can fix in three different ways.
  const [gateFailure, setGateFailure] = useState<'unresolved' | 'border' | 'route' | 'lookup' | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverRoutePath, setDriverRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToDestination, setEtaToDestination] = useState<string | null>(null);
  const [destinationRoutePath, setDestinationRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [terminalRoutePath, setTerminalRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [terminalRouteColor, setTerminalRouteColor] = useState(() => normalizeRouteColor(undefined));
  const [terminalMarkerColor, setTerminalMarkerColor] = useState(() => normalizeTerminalColor(undefined));
  const lobbyMapRef = useRef<any>(null);
  const lobbyMapWasManuallyMovedRef = useRef(false);
  const driverLocationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const scope = lobby?.id && lobby.driver_id && user?.id
      ? `${user.id}:${lobby.id}:${lobby.driver_id}`
      : null;
    if (chatHeadScopeRef.current === scope) return;
    chatHeadScopeRef.current = scope;
    lastDriverMessage.current = null;
    setChatHeadActivated(false);
  }, [lobby?.id, lobby?.driver_id, user?.id]);

  /**
   * The driver thread for this lobby, found or created in one place.
   *
   * Shared by the Message button and the floating chat head so both land in the
   * same conversation rather than two parallel ones. Null means it could not be
   * opened; each caller decides how to say so.
   */
  const ensureDriverThread = async (): Promise<{ id: string } | null> => {
    if (!user?.id || !lobby?.driver_id) return null;
    const { data, error } = await supabaseHelpers.findOrCreateRideChat({
      currentUserId: user.id,
      currentUserName: user.name,
      currentUserRole: user.role,
      peerId: lobby.driver_id,
      peerName: lobby.driver_name || 'Driver',
      contextId: lobby.id,
    });
    if (error || !data) {
      console.error('❌ Failed to open driver chat:', error);
      return null;
    }
    driverChatId.current = data.id;
    return data;
  };

  /**
   * Open the driver chat as an overlay, the way the driver's ride screen does.
   *
   * Navigating away unmounts this lobby, so the head vanished the moment the
   * chat opened and the customer lost sight of the ride. Opening in place keeps
   * the sheet, the map and the head all mounted behind the conversation, and
   * closing it costs nothing.
   */
  const openLobbyChatThread = async () => {
    if (!user?.id || !lobby?.driver_id || openingChat) return;
    setOpeningChat(true);
    try {
      const data = await ensureDriverThread();
      if (!data) {
        // Both the head and the driver card's Message button come here, so the
        // failure is reported once, here, rather than at each call site.
        alert('Failed to open chat. Please try again.');
        return;
      }
      // Read here rather than on close: the badge would otherwise keep counting
      // the very message the customer is looking at.
      await supabaseHelpers.markChatConversationRead(data.id, user.id);
      setDriverUnread(0);
      setChatHeadActivated(true);
      setChatOpened(true);
      try {
        localStorage.setItem('trikeserve_chat_opened_customer', '1');
      } catch {
        // Not fatal; the head still repositions for this mount.
      }
      setLobbyChatPopup(true);
    } finally {
      setOpeningChat(false);
    }
  };

  /**
   * Watch the driver's messages so the floating head's badge is honest.
   *
   * Finds the thread rather than creating one -- a customer who has not
   * messaged yet should get no badge, not an empty conversation invented for
   * them. The overlay remains the source of truth for message contents; the
   * latest id only detects new activity between polls.
   */
  useEffect(() => {
    if (!user?.id || !lobby?.driver_id) return;
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase
        .from('chat_conversations')
        .select('id, participant_a_id, participant_b_id, updated_at')
        .or(`participant_a_id.eq.${user.id},participant_b_id.eq.${user.id}`);
      if (cancelled) return;
      const mine = ((data || []) as any[]).filter((c: any) => {
        const other = c.participant_a_id === user.id ? c.participant_b_id : c.participant_a_id;
        return other === lobby.driver_id;
      });
      if (mine.length === 0) return;
      // Newest first, so a thread with duplicates resolves to the one in use.
      mine.sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''));
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

      const count = chatMessages.filter(
        (m: any) => m.sender_id !== user.id && m.read === false
      ).length;
      setDriverUnread(count);
    };

    check();
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id, lobby?.driver_id]);

  const handleTerminalLobbyStatus = (status?: string, statusMessage?: string) => {
    if (hasHandledTerminalLobbyStatus.current) return;

    if (status === 'completed' || status === 'cancelled') {
      hasHandledTerminalLobbyStatus.current = true;
      setIsMinimized(false);
      setTerminalStatus(status);
      const driverCancelled = status === 'cancelled'
        && statusMessage?.startsWith('The driver cancelled this shared ride.');
      setTerminalCancelMessage(driverCancelled ? statusMessage || null : null);

      // Completed rides stay open so the customer can rate the driver or tap
      // Done; cancelled rides auto-close after a short delay.
      if (status === 'cancelled') {
        if (terminalCloseTimeoutRef.current) {
          clearTimeout(terminalCloseTimeoutRef.current);
        }

        terminalCloseTimeoutRef.current = setTimeout(() => {
          if (typeof onClose === 'function') {
            onClose(status);
          }
        }, driverCancelled ? 5000 : 1600);
      }
    }
  };

  const showDriverAssignedNotice = (assignedLobby: ShareRideLobby) => {
    if (assignedLobby.status !== 'driver_found' || !assignedLobby.driver_id) return;

    const assignmentKey = `${assignedLobby.id}:${assignedLobby.driver_id}`;
    if (handledDriverAssignmentRef.current === assignmentKey) return;

    handledDriverAssignmentRef.current = assignmentKey;
    setDriverAssignedNotice({
      lobbyId: assignedLobby.id,
      driverId: assignedLobby.driver_id,
      driverName: assignedLobby.driver_name || 'Your driver',
      driverPlate: assignedLobby.driver_plate,
    });
  };

  useEffect(() => {
    if (!driverAssignedNotice || driverAssignedNotice.lobbyId !== lobby?.id) return;

    const { lobbyId, driverId } = driverAssignedNotice;
    const timeout = setTimeout(() => {
      setDriverAssignedNotice(current =>
        current?.lobbyId === lobbyId && current.driverId === driverId ? null : current
      );
    }, 3000);

    return () => clearTimeout(timeout);
  }, [driverAssignedNotice, lobby?.id]);

  const handleSubmitRating = async () => {
    if (!selectedRating || !lobby?.driver_id || !user) return;
    setRatingSubmitting(true);
    const { error } = await supabaseHelpers.rateDriver({
      driverId: lobby.driver_id,
      customerId: user.id,
      rating: selectedRating,
      lobbyId: lobby.id,
    });
    setRatingSubmitting(false);
    if (error) {
      console.error('❌ Failed to submit rating:', error);
      setError('Failed to submit rating. Please try again.');
      return;
    }
    setRatingSubmitted(true);
  };

  // Show the same driver-status popups customers get for private rides.
  // The driver writes driver_status to the lobby (on-the-way, arrived,
  // picked-up, dropped-off, awaiting-payment) as the ride progresses.
  const processDriverStatusUpdate = (lobbyId: string, driverStatus?: string, message?: string) => {
    if (!driverStatus) return;
    const normalizedStatus = String(driverStatus).toLowerCase();
    // Shared ride customers see the status flow from pickup onward. The driver
    // still uses the travel and arrival steps to navigate to the pickup, but
    // those intermediate steps do not create customer status popups.
    if (normalizedStatus === 'on-the-way' || normalizedStatus === 'arrived') return;
    if (normalizedStatus === 'awaiting-payment' || normalizedStatus === 'payment') return;
    const rawMessage = String(message || '');
    if (rawMessage === '__silent__') return;

    const targetedMessage = rawMessage.match(/^\[\[passenger:([^\]]+)\]\]\s*(.*)$/);
    const targetPassengerId = targetedMessage?.[1] || '';
    const notificationMessage = targetedMessage?.[2] || '';
    const isPassengerRideCompleted = Boolean(
      targetPassengerId && notificationMessage.toLowerCase().startsWith('your ride is complete.'),
    );
    if (targetPassengerId) {
      const targetAccountId = targetPassengerId.split('_companion_')[0];
      if (!user?.id || targetAccountId !== user.id) return;
    }
    // The passenger completion modal is driven by their own saved drop-off
    // status below; don't stack a transient progress popup over it.
    if (isPassengerRideCompleted) return;

    const lastShownKey = `last_shown_status_lobby_${lobbyId}_${user?.id || 'guest'}`;
    const lastShownStatus = localStorage.getItem(lastShownKey);
    const statusEventKey = `${normalizedStatus}:${targetPassengerId || 'all'}`;

    if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') return;

    if (normalizedStatus && normalizedStatus !== 'pending' && statusEventKey !== lastShownStatus) {
      const statusDisplayMap: { [key: string]: string } = {
        'pickup': 'You have been picked up! On the way to your destination.',
        'picked-up': 'You have been picked up! On the way to your destination.',
        'drop-off': 'You have arrived at your destination.',
        'dropped-off': 'You have arrived at your destination.',
        'in-progress': 'Your ride is in progress!',
        'payment': message || 'Please complete the payment.',
        'awaiting-payment': message || 'Please complete the payment.',
      };

      // Normalize driver-side statuses to the display keys used by the popup UI.
      const displayStatus =
        normalizedStatus === 'picked-up' ? 'pickup' :
        normalizedStatus === 'dropped-off' ? 'drop-off' :
        normalizedStatus === 'awaiting-payment' ? 'payment' :
        normalizedStatus;

      setDriverStatusPopup({
        status: displayStatus,
        message: notificationMessage || statusDisplayMap[normalizedStatus] || rawMessage || 'Ride status updated',
      });
      localStorage.setItem(lastShownKey, statusEventKey);

      // Auto-dismiss after 2 seconds for every status, not only payment, so the
      // popup never sits over the lobby waiting for an OK tap. It also closes on
      // any tap (see its overlay).
      if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
      driverStatusTimerRef.current = setTimeout(() => setDriverStatusPopup(null), 2000);
    }
  };

  const normalizePassengers = (value: any): LobbyPassenger[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const dedupePassengers = (passengers: LobbyPassenger[]) => {
    const seen = new Set<string>();
    return passengers.filter((p) => {
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  };

  const askAboutMatchingLobby = (
    candidate: ShareRideLobby,
    promptMode: MatchingLobbyPromptMode = 'booking',
  ): Promise<MatchingLobbyChoice> => {
    setMatchingRouteLobby(candidate);
    setMatchingLobbyPromptMode(promptMode);
    return new Promise((resolve) => {
      matchingLobbyChoiceResolver.current = resolve;
    });
  };

  const resolveMatchingLobbyChoice = (choice: MatchingLobbyChoice) => {
    const resolve = matchingLobbyChoiceResolver.current;
    matchingLobbyChoiceResolver.current = null;
    setMatchingRouteLobby(null);
    setMatchingLobbyPromptMode('booking');
    if (choice === 'cancel') {
      setBookingCancelled(true);
      onClose();
    }
    resolve?.(choice);
  };

  const toTime = (value?: string) => new Date(value || 0).getTime();

  const movePassengerGroup = async (
    sourceLobby: ShareRideLobby,
    destinationLobbyId: string,
    group: LobbyPassenger[],
  ) => {
    if (!user?.id || group.length === 0) {
      return { data: null, error: new Error('Your passenger group could not be loaded') };
    }

    const { data: destinationLobby, error: joinError } = await supabaseHelpers.joinShareRideLobbyGroup(
      destinationLobbyId,
      group,
    );
    if (joinError || !destinationLobby) return { data: null, error: joinError || new Error('Could not join that lobby') };

    const { data: latestSource, error: sourceError } = await supabaseHelpers.getLobbyById(sourceLobby.id);
    if (sourceError || !latestSource || latestSource.status !== 'waiting') {
      await supabaseHelpers.leaveShareRideLobby(destinationLobbyId, user.id);
      return { data: null, error: new Error('Your current lobby is no longer waiting, so the move was cancelled') };
    }

    const { error: leaveError } = await supabaseHelpers.leaveShareRideLobby(sourceLobby.id, user.id);
    if (leaveError) {
      const { error: rollbackError } = await supabaseHelpers.leaveShareRideLobby(destinationLobbyId, user.id);
      return {
        data: null,
        error: new Error(rollbackError
          ? 'The move could not be completed. Check both lobbies before trying again.'
          : 'Could not leave your current lobby, so you remain there.'),
      };
    }

    return { data: destinationLobby, error: null };
  };

  useEffect(() => {
    const terminalId = lobby?.terminal_id || selectedTerminalId;
    if (!terminalId) {
      setTerminalRoutePath([]);
      setTerminalRouteColor(normalizeRouteColor(undefined));
      setTerminalMarkerColor(normalizeTerminalColor(undefined));
      return;
    }

    let active = true;
    setTerminalMarkerColor(normalizeTerminalColor(undefined));
    supabase
      .from('terminals')
      .select('*')
      .eq('id', terminalId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setTerminalRoutePath([]);
          setTerminalMarkerColor(normalizeTerminalColor(undefined));
          return;
        }
        const storedRoutes = normalizeTerminalRoutes(data.routes);
        const routes = (storedRoutes.length > 0
          ? storedRoutes
          : legacyRouteFromBoundary(data.boundary_polygon, data.road_width_m))
          .filter(route => route.points.length >= 2);
        const currentSelectionMatchesLobby = Boolean(
          routePoints?.length && selectedTerminalId && selectedTerminalId === terminalId,
        );
        const ownPassenger = (lobby?.passengers_json || []).find(passenger => Boolean(
          user?.id && (
            passenger.id === user.id ||
            passenger.id.startsWith(`${user.id}_companion_`)
          ) && passenger.dropoffLat != null && passenger.dropoffLng != null
        ));
        const dropoffPoint = ownPassenger
          ? { lat: Number(ownPassenger.dropoffLat), lng: Number(ownPassenger.dropoffLng) }
          : dropoffCoords;
        const routeForPassenger = dropoffPoint
          ? routes.find(route => route.enabled && isPointOnRoadCorridor(
              dropoffPoint.lat,
              dropoffPoint.lng,
              route.points,
              route.buffer_m,
            ))
          : null;
        const selectedRoute = currentSelectionMatchesLobby
          ? null
          : routeForPassenger || routes.find(route => route.enabled) || routes[0];
        setTerminalRoutePath(currentSelectionMatchesLobby ? routePoints! : selectedRoute?.points || []);
        setTerminalRouteColor(normalizeRouteColor(data.route_color));
        setTerminalMarkerColor(normalizeTerminalColor(data.marker_color));
      })
      .catch(() => {
        if (active) {
          setTerminalRoutePath([]);
          setTerminalMarkerColor(normalizeTerminalColor(undefined));
        }
      });

    return () => {
      active = false;
    };
  }, [lobby?.terminal_id, lobby?.passengers_json, selectedTerminalId, routePoints, dropoffCoords, user?.id]);

  const fitLobbyRouteBounds = useCallback(() => {
    if (lobbyMapWasManuallyMovedRef.current) return;

    const map = lobbyMapRef.current;
    const maps = (window as any).google?.maps;
    if (!map || !maps?.LatLngBounds) return;

    const passengerDropoffs = (lobby?.passengers_json || [])
      .filter(passenger => Boolean(
        user?.id && (
          passenger.id === user.id ||
          passenger.id.startsWith(`${user.id}_companion_`)
        )
      ))
      .flatMap(passenger => {
        if (passenger.dropoffLat == null || passenger.dropoffLng == null) return [];
        const lat = Number(passenger.dropoffLat);
        const lng = Number(passenger.dropoffLng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
      });
    const endpoints = [pickupCoords, dropoffCoords, ...passengerDropoffs].filter(
      (point): point is { lat: number; lng: number } => point !== null && point !== undefined,
    );
    const points = [...terminalRoutePath, ...endpoints, ...(driverLocation ? [driverLocation] : [])];
    if (points.length === 0) return;
    const bounds = new maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 24);
  }, [terminalRoutePath, pickupCoords, dropoffCoords, lobby?.passengers_json, driverLocation, user?.id]);

  useEffect(() => {
    fitLobbyRouteBounds();
  }, [fitLobbyRouteBounds]);

   // Initialize or join lobby on mount
   useEffect(() => {
     let unsubscribe: (() => void) | undefined;
     let syncInterval: NodeJS.Timeout | undefined;
     let isMounted = true;

     const initializeLobby = async () => {
       try {
         if (!isMounted) return;
         if (!user?.id) {
           setError('Please sign in to open this ride lobby.');
           return;
         }
         setLoading(true);
         let existingLobby: ShareRideLobby | null = null;

         if (lobbyId) {
           const { data: selectedLobby, error: selectedLobbyError } = await supabaseHelpers.getLobbyById(lobbyId);
           if (selectedLobbyError) {
             console.error('Error loading selected lobby:', selectedLobbyError);
             if (isMounted) setError('Unable to load this ride lobby. Please close and try again.');
             return;
           }
           if (!selectedLobby) {
             if (isMounted) setError('This ride lobby is no longer available.');
             return;
           }

           const normalizedLobby = {
             ...selectedLobby,
             passengers_json: normalizePassengers(selectedLobby.passengers_json),
           };
           if (!isCustomerLobbyPassenger(normalizedLobby, user.id)) {
             if (isMounted) setError('This ride lobby is not linked to your account.');
             return;
           }
           existingLobby = normalizedLobby;
         }

         if (!existingLobby && !lobbyId) {
           existingLobby = await findOrCreateLobby();
         }

         if (existingLobby && !isCustomerLobbyPassenger(existingLobby, user.id)) {
           if (isMounted) setError('This ride lobby is not linked to your account.');
           return;
         }

         if (existingLobby && isMounted) {
           setLobby(existingLobby);
            showDriverAssignedNotice(existingLobby);
            // Tell the parent the lobby is open so it can persist the id for
            // the return-to-ride button (even before a driver accepts).
            if (typeof onLobbyLoaded === 'function') {
              onLobbyLoaded(existingLobby.id);
            }
            handleTerminalLobbyStatus(existingLobby.status, existingLobby.driver_status_message);

             // Use the driver's real average rating from driver_ratings.
             if (existingLobby.driver_id) {
               supabaseHelpers.getDriverRating(existingLobby.driver_id).then(({ average }: { average: number | null }) => {
                 if (isMounted) setComputedDriverRating(average != null ? average.toFixed(1) : null);
               });
             }

             if (existingLobby.status === 'driver_found' && existingLobby.driver_name && typeof onDriverFound === 'function') {
               onDriverFound(existingLobby.id);
             }

            // Set up real-time subscription
            if (typeof supabaseHelpers.subscribeLobbyUpdates === 'function') {
              unsubscribe = supabaseHelpers.subscribeLobbyUpdates(
                existingLobby.id,
                async (updatedLobbyData) => {
                  if (!isMounted) return;
                  console.log('🔄 🔄 🔄 LOBBY UPDATE RECEIVED 🔄 🔄 🔄:', updatedLobbyData);

                  // CRITICAL: Always fetch the fresh lobby data from database
                  // This ensures we get the complete passenger list
                  try {
                    const { data: freshLobby, error: freshError } = await supabaseHelpers.getLobbyById(existingLobby.id);

                    if (freshError) {
                      console.error('❌ Error fetching fresh lobby data:', freshError);
                      return;
                    }

                    if (!freshLobby) {
                      console.error('❌ Fresh lobby data is null');
                      return;
                    }

                    if (!isMounted) return;

                    console.log('✅ ✅ ✅ FRESH LOBBY DATA FROM DB ✅ ✅ ✅:', freshLobby);
                    const normalizedPassengers = dedupePassengers(normalizePassengers(freshLobby.passengers_json));

                    const prevPassengerCount = (lobby?.passengers_json || []).length;
                    const newPassengerCount = normalizedPassengers.length;

                    setLobby(prevLobby => {
                      const newLobby = {
                        ...prevLobby!,
                        ...freshLobby,
                        passengers_json: normalizedPassengers
                      };

                      console.log('👥 OLD PASSENGERS:', (prevLobby?.passengers_json || []).length);
                      console.log('👥 NEW PASSENGERS:', normalizedPassengers.length);

                      return newLobby;
                    });
                    showDriverAssignedNotice(freshLobby);

                    // Show full capacity popup when lobby becomes full
                    if (newPassengerCount >= freshLobby.max_seats && prevPassengerCount < freshLobby.max_seats) {
                      setShowFullCapacityPopup(true);
                    }

                    handleTerminalLobbyStatus(freshLobby.status, freshLobby.driver_status_message);

                    // Customer status popups begin at pickup; earlier driver
                    // navigation steps are intentionally kept quiet here.
                    processDriverStatusUpdate(existingLobby.id, freshLobby.driver_status, freshLobby.driver_status_message);

                    // Use the driver's real average rating from driver_ratings.
                    if (freshLobby.driver_id) {
                      supabaseHelpers.getDriverRating(freshLobby.driver_id).then(({ average }: { average: number | null }) => {
                        if (isMounted) setComputedDriverRating(average != null ? average.toFixed(1) : null);
                      });
                    }

                    // Check if driver was found
                    if (freshLobby.status === 'driver_found' && freshLobby.driver_name) {
                      console.log('🚗 DRIVER FOUND:', freshLobby.driver_name);
                      // Safely call onDriverFound if it's a function
                      if (typeof onDriverFound === 'function') {
                        onDriverFound(freshLobby.id);
                      } else {
                        console.error('❌ onDriverFound is not a function:', typeof onDriverFound);
                      }
                    }
                  } catch (err) {
                    console.error('❌ Error processing lobby update:', err);
                  }
                }
              );
            } else {
              console.error('❌ subscribeLobbyUpdates is not a function');
            }

            // Fallback sync for cases where realtime payloads are delayed/partial.
            syncInterval = setInterval(async () => {
              if (!isMounted) return;
              try {
                const { data: latestLobby, error: latestLobbyError } = await supabaseHelpers.getLobbyById(existingLobby!.id);
                if (latestLobbyError || !latestLobby) {
                  console.log('⏳ Sync interval: Could not fetch lobby');
                  return;
                }

                const latestPassengers = dedupePassengers(normalizePassengers(latestLobby.passengers_json));
                showDriverAssignedNotice(latestLobby);
                setLobby((prevLobby) => {
                  if (!prevLobby) return prevLobby;
                  const prevCount = (prevLobby.passengers_json || []).length;
                  const latestCount = latestPassengers.length;
                  const passengerDataChanged = JSON.stringify(prevLobby.passengers_json || []) !== JSON.stringify(latestPassengers);

                  // Log every sync for debugging
                  console.log(`⏳ SYNC CHECK: prev=${prevCount} passengers, latest=${latestCount} passengers, status=${latestLobby.status}`);

                  // Update whenever any passenger's profile, destination, or fare changes.
                  if (prevCount !== latestCount || passengerDataChanged) {
                    console.log(`🔄 PASSENGER DATA CHANGED from ${prevCount} to ${latestCount} passengers - UPDATING!`);
                    return {
                      ...prevLobby,
                      ...latestLobby,
                      passengers_json: latestPassengers,
                    };
                  }

                  // Also update if other important fields changed
                  if (
                    prevLobby.status !== latestLobby.status ||
                    toTime(prevLobby.updated_at) !== toTime(latestLobby.updated_at)
                  ) {
                    console.log(`🔄 LOBBY STATE CHANGED - UPDATING!`);
                    return {
                      ...prevLobby,
                      ...latestLobby,
                      passengers_json: latestPassengers,
                    };
                  }

                  return prevLobby;
                });

                handleTerminalLobbyStatus(latestLobby.status, latestLobby.driver_status_message);

                // Show driver status popups from the sync fallback too
                processDriverStatusUpdate(existingLobby!.id, latestLobby.driver_status, latestLobby.driver_status_message);

                // Keep the driver's computed average rating fresh.
                if (latestLobby.driver_id) {
                  supabaseHelpers.getDriverRating(latestLobby.driver_id).then(({ average }: { average: number | null }) => {
                    if (isMounted) setComputedDriverRating(average != null ? average.toFixed(1) : null);
                  });
                }
              } catch (err) {
                console.error('❌ Error in sync interval:', err);
              }
            }, 1500);
         }
       } catch (err) {
         console.error('Error initializing lobby:', err);
         if (isMounted) {
           setError('Failed to create lobby');
         }
       } finally {
         if (isMounted) {
           setLoading(false);
         }
       }
     };

     // Call initialization
     initializeLobby().catch(err => console.error('Unhandled error in initializeLobby:', err));

     return () => {
       isMounted = false;
       // Let initialization finish if this effect is cleaned up while the
       // matching lobby choice dialog is open.
       const pendingChoiceResolver = matchingLobbyChoiceResolver.current;
       matchingLobbyChoiceResolver.current = null;
       pendingChoiceResolver?.('cancel');
        if (terminalCloseTimeoutRef.current) {
          clearTimeout(terminalCloseTimeoutRef.current);
        }
        if (driverStatusTimerRef.current) {
          clearTimeout(driverStatusTimerRef.current);
        }
       if (typeof syncInterval !== 'undefined' && syncInterval !== null) {
         clearInterval(syncInterval);
       }
       if (typeof unsubscribe === 'function') {
         try {
           unsubscribe();
         } catch (err) {
           console.error('❌ Error in cleanup unsubscribe:', err);
         }
       }
     };
   }, [lobbyId, user?.id]);

  // Poll for driver location in the lobby (every 3 seconds)
  useEffect(() => {
    if (!lobby || !['driver_found', 'in_progress'].includes(lobby.status)) {
      setDriverLocation(null);
      setDriverRoutePath([]);
      return;
    }

    const pollDriverLocation = async () => {
      try {
        const { data: freshLobby } = await supabaseHelpers.getLobbyById(lobby.id);
        if (freshLobby?.driver_lat != null && freshLobby?.driver_lng != null) {
          const loc = { lat: Number(freshLobby.driver_lat), lng: Number(freshLobby.driver_lng) };
          if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
          setDriverLocation(loc);
        }
      } catch (err) {
        console.error('Error polling driver location:', err);
      }
    };

    pollDriverLocation();
    driverLocationIntervalRef.current = setInterval(pollDriverLocation, 3000);

    return () => {
      if (driverLocationIntervalRef.current) {
        clearInterval(driverLocationIntervalRef.current);
      }
    };
  }, [lobby?.id, lobby?.status]);

  useEffect(() => {
    if (!lobby?.id || !user?.id || terminalStatus || ['completed', 'cancelled'].includes(String(lobby.status || '').toLowerCase())) {
      setPaymentModalPassengerId(null);
      return;
    }

    const ownPassengers = normalizePassengers(lobby.passengers_json).filter(passenger =>
      passenger.id === user.id || passenger.id.startsWith(`${user.id}_companion_`)
    );
    const pendingPassenger = ownPassengers.find(passenger => {
      const dropoffStatus = String(passenger.dropoff_status || passenger.dropoffStatus || '').toLowerCase();
      const paymentStatus = String(passenger.payment_status || passenger.paymentStatus || '').toLowerCase();
      if (
        !['dropped-off', 'completed'].includes(dropoffStatus) ||
        ['received', 'prepaid'].includes(paymentStatus)
      ) {
        return false;
      }

      try {
        return localStorage.getItem(`share_ride_payment_modal_dismissed_${lobby.id}_${user.id}_${passenger.id}`) !== '1';
      } catch {
        return true;
      }
    });

    if (pendingPassenger) {
      if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
      setDriverStatusPopup(null);
    }
    setPaymentModalPassengerId(pendingPassenger?.id || null);
  }, [lobby?.id, lobby?.status, lobby?.passengers_json, user?.id, terminalStatus, paymentModalPassengerId]);

  // Compute route from driver to pickup/dropoff
  useEffect(() => {
    if (!driverLocation || !isMapsLoaded || !(window as any).google) {
      setDriverRoutePath([]);
      return;
    }

    const isHeadingToPickup = lobby?.driver_status === 'on-the-way' || lobby?.driver_status === 'arrived';
    let dest: { lat: number; lng: number } | null = null;

    if (isHeadingToPickup && pickupCoords) {
      dest = pickupCoords;
    } else if (dropoffCoords) {
      dest = dropoffCoords;
    }

    if (!dest) { setDriverRoutePath([]); return; }

    const DirectionsService = new (window as any).google.maps.DirectionsService();
    DirectionsService.route({
      origin: new (window as any).google.maps.LatLng(driverLocation.lat, driverLocation.lng),
      destination: new (window as any).google.maps.LatLng(dest.lat, dest.lng),
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === 'OK' && result?.routes?.[0]) {
        const route = result.routes[0];
        if (route.overview_polyline?.points) {
          setDriverRoutePath(decodePolyline(route.overview_polyline.points));
        }
        const leg = route.legs?.[0];
        if (leg?.duration?.text) {
          setEtaToDestination(leg.duration.text);
        }
      }
    });
  }, [driverLocation, isMapsLoaded, lobby?.driver_status, pickupCoords, dropoffCoords]);

  // Route from pickup through only this customer's drop-offs.
  useEffect(() => {
    setDestinationRoutePath([]);
    if (!pickupCoords || !isMapsLoaded || !(window as any).google) return;

    const customerPassengers = (lobby?.passengers_json || []).filter(passenger => Boolean(
      user?.id && (
        passenger.id === user.id ||
        passenger.id.startsWith(`${user.id}_companion_`)
      )
    ));
    const destinations = orderLobbyDropoffs(customerPassengers, pickupCoords)
      .flatMap(({ passenger }) => {
        if (passenger.dropoffLat == null || passenger.dropoffLng == null) return [];
        const lat = Number(passenger.dropoffLat);
        const lng = Number(passenger.dropoffLng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
      });
    if (dropoffCoords && !destinations.some(point =>
      Math.abs(point.lat - dropoffCoords.lat) < 0.00001 && Math.abs(point.lng - dropoffCoords.lng) < 0.00001
    )) {
      destinations.push(dropoffCoords);
    }
    const uniqueDestinations = destinations.filter((point, index) =>
      destinations.findIndex(candidate =>
        Math.abs(candidate.lat - point.lat) < 0.00001 && Math.abs(candidate.lng - point.lng) < 0.00001
      ) === index
    ).sort((a, b) => haversineDistanceMeters(pickupCoords, a) - haversineDistanceMeters(pickupCoords, b));
    if (uniqueDestinations.length === 0) return;

    let active = true;
    const maps = (window as any).google.maps;
    const DirectionsService = new maps.DirectionsService();
    DirectionsService.route({
      origin: new maps.LatLng(pickupCoords.lat, pickupCoords.lng),
      destination: new maps.LatLng(
        uniqueDestinations[uniqueDestinations.length - 1].lat,
        uniqueDestinations[uniqueDestinations.length - 1].lng,
      ),
      waypoints: uniqueDestinations.slice(0, -1).map(point => ({
        location: new maps.LatLng(point.lat, point.lng),
        stopover: true,
      })),
      optimizeWaypoints: false,
      travelMode: maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (!active) return;
      if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
        setDestinationRoutePath(decodePolyline(result.routes[0].overview_polyline.points));
      }
    });

    return () => { active = false; };
  }, [pickupCoords, dropoffCoords, lobby?.passengers_json, isMapsLoaded, user?.id]);

  // Only load the signed-in customer's own profile photo for this lobby.
  const passengerIdsKey = user?.id && (lobby?.passengers_json || []).some(passenger => passenger.id === user.id)
    ? user.id
    : '';

  useEffect(() => {
    const ids = passengerIdsKey.split(',').filter(Boolean);
    if (ids.length === 0) return;
    let active = true;
    supabase
      .from('users')
      .select('id, avatar_url')
      .in('id', ids)
      .then(({ data }) => {
        if (!active || !data) return;
        const next: Record<string, string> = {};
        for (const row of data as any[]) {
          if (row?.id && row.avatar_url) next[row.id] = row.avatar_url;
        }
        setPassengerAvatars(next);
      });
    return () => {
      active = false;
    };
  }, [passengerIdsKey]);

  // Resolve the assigned driver's profile photo by id.
  useEffect(() => {
    const driverId = lobby?.driver_id;
    if (!driverId) {
      setDriverProfileAvatar(null);
      return;
    }
    let active = true;
    supabase
      .from('users')
      .select('avatar_url')
      .eq('id', driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setDriverProfileAvatar(data?.avatar_url || null);
      });
    return () => {
      active = false;
    };
  }, [lobby?.driver_id]);

  const decodePolyline = (encoded: string): Array<{ lat: number; lng: number }> => {
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b: number, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  };

  const getRandomEmoji = () => {
    const emojis = ['👤', '👨', '👩', '🧑', '👦', '👧', '👨‍💼', '👩‍💼', '👨‍🎓', '👩‍🎓'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  };

  const findOrCreateLobby = async (): Promise<ShareRideLobby | null> => {
    let declinedMatchingLobbyId: string | null = null;
    try {
      // The booking screen runs these two gates too, but a lobby can also be
      // opened directly from the shared-rides browser, so they cannot be assumed.
      //
      // 1. BORDER -- the customer has to be standing inside a terminal's area.
      // 2. ROUTE  -- the drop-off has to sit on a terminal's road corridor.
      //
      // A location entered as text may never have been geocoded, and skipping
      // the checks in that case is how lobbies got created outside every
      // terminal. With no coordinates to test there is nothing safe but refuse.
      if (!dropoffCoords || !pickupCoords) {
        setGateFailure('unresolved');
        setShowOutOfBoundaryPopup(true);
        return null;
      }

      if (enforceBoundary) {
        const border = await isPointWithinAnyTerminalBorder(pickupCoords.lat, pickupCoords.lng);
        if (border.lookupFailed) {
          setGateFailure('lookup');
          setShowOutOfBoundaryPopup(true);
          return null;
        }
        if (!border.allowed) {
          console.log('🚫 Share ride pickup outside every terminal border:', pickupCoords);
          setGateFailure('border');
          setShowOutOfBoundaryPopup(true);
          return null;
        }

        // Validate against the exact selected route geometry used by the
        // customer picker. The legacy terminal-wide lookup can disagree with
        // mapped routes and reject a drop-off accepted by the highlighted route.
        const routeAllowed = Boolean(
          routePoints?.length &&
          isPointOnRoadCorridor(
            dropoffCoords.lat,
            dropoffCoords.lng,
            routePoints,
            normalizeRoadWidth(routeWidthM),
          )
        );
        if (!routeAllowed) {
          console.log('🚫 Share ride drop-off outside the selected terminal route:', dropoffCoords);
          setGateFailure('route');
          setShowOutOfBoundaryPopup(true);
          return null;
        }
      }

      // First, check if user is already in a waiting lobby
      const { data: userLobbies, error: userError } = await supabaseHelpers.getAvailableLobbies();
      if (!userError && userLobbies) {
        const userLobbyCandidates = userLobbies.filter((l: any) => {
          const passengers = Array.isArray(l.passengers_json) ? l.passengers_json : [];
          return passengers.some((p: any) => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
        });

        const routeMatchedLobby = userLobbyCandidates
          .filter((l: any) => isSimilarRoute(l, pickup, dropoff, pickupAddress, dropoffAddress, selectedTerminalId, {
            dropoffCoords,
            routePoints,
            routeWidthM,
            routeId: selectedRouteId,
          }))
          .sort((a: any, b: any) => toTime(b.updated_at || b.created_at) - toTime(a.updated_at || a.created_at))[0];

        const existingUserLobby = routeMatchedLobby || userLobbyCandidates
          .sort((a: any, b: any) => toTime(b.updated_at || b.created_at) - toTime(a.updated_at || a.created_at))[0];

        if (existingUserLobby) {
          console.log('✅ User already in lobby:', existingUserLobby.id);
          return {
            ...existingUserLobby,
            passengers_json: dedupePassengers(normalizePassengers(existingUserLobby.passengers_json))
          };
        }
      }

      // Try to find matching lobby with a similar route (fuzzy match on
      // short display names and full addresses, since Google Maps can return
      // different formatted strings for the same place)
      const { data: matchingLobby, error: matchError } = await supabaseHelpers.getAvailableLobbyByRoute(
        pickupAddress,
        dropoffAddress,
        pickup,
        dropoff,
        selectedTerminalId,
        { dropoffCoords, routePoints, routeWidthM, routeId: selectedRouteId },
      );

      // A failed lookup is not the same as "there is no matching lobby". The
      // old flow silently fell through and created a new lobby when this query
      // failed, which made the same-route prompt appear to be broken and could
      // leave two lobbies for the same trip. Keep the customer in this flow and
      // show the existing error dialog so they can retry instead.
      if (matchError) {
        console.error('Failed to check for a matching shared ride lobby:', matchError);
        setError("We couldn't check for a lobby on this route. Check your connection and try booking again.");
        return null;
      }

      if (matchingLobby) {
        let passengers = backfillLegacySharedRidePassengerFares(
          dedupePassengers(normalizePassengers(matchingLobby.passengers_json)),
          Number(matchingLobby.price_per_seat || 0),
        );

        const choice = await askAboutMatchingLobby({
          ...matchingLobby,
          passengers_json: passengers,
        } as ShareRideLobby);
        if (choice === 'cancel') return null;
        if (choice === 'create') declinedMatchingLobbyId = matchingLobby.id;

        if (choice === 'join') {
          // Refresh after the choice so a passenger who joined meanwhile is not
          // overwritten by this booking.
          const { data: latestLobby, error: latestLobbyError } = await supabaseHelpers.getLobbyById(matchingLobby.id);
          if (latestLobbyError || !latestLobby || latestLobby.status !== 'waiting') {
            setError('This lobby is no longer available. Please try booking again.');
            return null;
          }
          passengers = backfillLegacySharedRidePassengerFares(
            dedupePassengers(normalizePassengers(latestLobby.passengers_json)),
            Number(latestLobby.price_per_seat || 0),
          );
          const latestMaxSeats = Number(latestLobby.max_seats || lobbySeatLimit);
          if (passengers.length + passengerCount > latestMaxSeats) {
            setError('This lobby filled up while you were deciding. Please try booking again.');
            return null;
          }

          // Join the lobby
          const mainPassenger: LobbyPassenger = {
            id: user?.id || `user_${Date.now()}`,
            name: user?.name || 'Customer',
            emoji: getRandomEmoji(),
            // The signed-in customer's own profile photo, so the lobby shows the
            // person rather than a random glyph. Falls back to the emoji above.
            avatar: user?.avatarUrl || undefined,
            joinedAt: new Date().toISOString(),
            pickup,
            pickupAddress,
            dropoff,
            dropoffAddress,
            dropoffLat: dropoffCoords?.lat ?? null,
            dropoffLng: dropoffCoords?.lng ?? null,
            route_id: selectedRouteId || null,
            fare: pricePerSeat,
          };

          const newPassengers = [...passengers, mainPassenger];

          // Add companions if needed
          for (let i = 1; i < passengerCount; i++) {
            newPassengers.push({
              id: `${user?.id}_companion_${i}`,
              name: `+${i} Companion`,
              emoji: '👥',
              joinedAt: new Date().toISOString(),
              pickup,
              pickupAddress,
              dropoff,
              dropoffAddress,
              dropoffLat: dropoffCoords?.lat ?? null,
              dropoffLng: dropoffCoords?.lng ?? null,
              route_id: selectedRouteId || null,
              fare: pricePerSeat,
            });
          }

          // Update the lobby
          const { data: updated, error: updateError } = await supabaseHelpers.joinShareRideLobbyGroup(
            matchingLobby.id,
            newPassengers.slice(passengers.length),
          );

          if (!updateError && updated) {
            console.log('✅ Joined existing lobby:', matchingLobby.id);
            return {
              ...updated,
              passengers_json: dedupePassengers(normalizePassengers(updated.passengers_json))
            };
          }
          console.error('Failed to join selected shared ride lobby:', updateError);
          setError('Unable to join that lobby. Please try booking again.');
          return null;
        }
      }

      // No matching lobby found, create a new one
      const mainPassenger: LobbyPassenger = {
        id: user?.id || `user_${Date.now()}`,
        name: user?.name || 'Customer',
        emoji: getRandomEmoji(),
        // Uses the customer's profile photo when they have one, so the lobby
        // shows the person instead of a random glyph; the emoji is the fallback.
        avatar: user?.avatarUrl || undefined,
        joinedAt: new Date().toISOString(),
        pickup,
        pickupAddress,
        dropoff,
        dropoffAddress,
        dropoffLat: dropoffCoords?.lat ?? null,
        dropoffLng: dropoffCoords?.lng ?? null,
        route_id: selectedRouteId || null,
        fare: pricePerSeat,
      };

      const passengers: LobbyPassenger[] = [mainPassenger];

      // Add companions if needed
      for (let i = 1; i < passengerCount; i++) {
        passengers.push({
          id: `${user?.id}_companion_${i}`,
          name: `+${i} Companion`,
          emoji: '👥',
          joinedAt: new Date().toISOString(),
          pickup,
          pickupAddress,
          dropoff,
          dropoffAddress,
          dropoffLat: dropoffCoords?.lat ?? null,
          dropoffLng: dropoffCoords?.lng ?? null,
          route_id: selectedRouteId || null,
          fare: pricePerSeat,
        });
      }

      const newLobby = {
        customer_id: user?.id,
        pickup_location: pickup,
        pickup_address: pickupAddress,
        dropoff_location: dropoff,
        dropoff_address: dropoffAddress,
        pickup_lat: pickupCoords?.lat || null,
        pickup_lng: pickupCoords?.lng || null,
        dropoff_lat: dropoffCoords?.lat || null,
        dropoff_lng: dropoffCoords?.lng || null,
        passengers_json: passengers,
        max_seats: lobbySeatLimit,
        price_per_seat: pricePerSeat,
        payment_method: paymentMethod,
        terminal_id: selectedTerminalId || null,
        status: 'waiting'
      };

      const { data: createdLobby, error: createError } = await supabaseHelpers.createShareRideLobby(newLobby);

      if (!createError && createdLobby) {
        console.log('✅ Created new lobby:', createdLobby.id);
        const normalizedCreatedLobby = {
          ...createdLobby,
          passengers_json: dedupePassengers(normalizePassengers(createdLobby.passengers_json)),
        } as ShareRideLobby;

        // Two customers can both pass the pre-create lookup before either
        // insert is visible. Briefly recheck after our insert so the second
        // lobby can offer an explicit move into the first one.
        let concurrentMatch: any = null;
        for (let attempt = 0; attempt < 4 && !concurrentMatch; attempt += 1) {
          const { data: waitingLobbies, error: waitingError } = await supabaseHelpers.getAvailableLobbies();
          if (!waitingError && waitingLobbies) {
            concurrentMatch = waitingLobbies.find((candidate: any) =>
              candidate.id !== normalizedCreatedLobby.id &&
              candidate.id !== declinedMatchingLobbyId &&
              isSimilarRoute(candidate, pickup, dropoff, pickupAddress, dropoffAddress, selectedTerminalId, {
                dropoffCoords,
                routePoints,
                routeWidthM,
                routeId: selectedRouteId,
              })
            ) || null;
          }
          if (!concurrentMatch && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }

        if (concurrentMatch) {
          const choice = await askAboutMatchingLobby({
            ...concurrentMatch,
            passengers_json: dedupePassengers(normalizePassengers(concurrentMatch.passengers_json)),
          } as ShareRideLobby, 'after-create');

          if (choice === 'join') {
            const sourceGroup = normalizedCreatedLobby.passengers_json.filter((passenger) =>
              passenger.id === user?.id || passenger.id.startsWith(`${user?.id}_companion_`)
            );
            const { data: movedLobby, error: moveError } = await movePassengerGroup(
              normalizedCreatedLobby,
              concurrentMatch.id,
              sourceGroup,
            );
            if (moveError || !movedLobby) {
              setMoveFailureMessage(`${moveError?.message || 'Could not move your group'}. You are still in your new lobby.`);
              return normalizedCreatedLobby;
            }
            return {
              ...movedLobby,
              passengers_json: dedupePassengers(normalizePassengers(movedLobby.passengers_json)),
            } as ShareRideLobby;
          }
        }

        return normalizedCreatedLobby;
      }

      setError('Failed to create lobby');
      return null;
    } catch (err) {
      console.error('Error finding or creating lobby:', err);
      setError('Error with lobby system');
      return null;
    }
  };

   const handleLeaveLobby = async () => {
     if (!lobby || !user) {
       console.error('❌ Missing lobby or user data');
       setError('Cannot leave lobby: missing data');
       return;
     }

     try {
       console.log('🚪 Attempting to leave lobby...');

       const { data: updatedLobby, error: leaveError } = await supabaseHelpers.leaveShareRideLobby(
         lobby.id,
         user.id
       );

       if (leaveError) {
         console.error('❌ Error leaving lobby:', leaveError);

         // Check if it's a permission error
         if (leaveError.message?.includes('policy') || leaveError.message?.includes('permission')) {
           setError('Permission denied: You cannot leave this lobby. Please try again.');
         } else {
           setError(`Failed to leave lobby: ${leaveError.message || 'Unknown error'}`);
         }
         return;
       }

       console.log('✅ Successfully left lobby');
       try {
         if (user?.id) {
           localStorage.removeItem(customerActiveShareLobbyStorageKey(user.id));
         }
       } catch {
         // The database membership is already removed; storage is only a resume hint.
       }
       setShowLeaveConfirm(false);
       // Small delay to ensure database update completes
       await new Promise(resolve => setTimeout(resolve, 500));
       // FIX: Add defensive check
       if (typeof onClose === 'function') {
         onClose(updatedLobby?.status || lobby.status);
       } else {
         console.error('❌ onClose prop is not a function or is missing');
         // Optional: fallback navigation if you have a router available
         // router.push('/customer/home');
       }
     } catch (err) {
       console.error('❌ Unexpected error in handleLeaveLobby:', err);
       setError(`Error leaving lobby: ${err instanceof Error ? err.message : 'Unknown error'}`);
     }
   };

  /*
 * Live waiting time.
 *
 * This was a plain function called during render, which meant the number only moved
 * when something else re-rendered the lobby -- and the lobby polls every 5s, so the
 * counter visibly jumped five seconds at a time. The hook drives it off its own
 * 1s timer instead, anchored to the lobby's own created_at so the count is correct
 * even after a reload rather than restarting from zero.
 */
const waitingTime = useElapsedTime(lobby?.created_at);

const matchingLobbyPassengers = matchingRouteLobby
  ? dedupePassengers(normalizePassengers(matchingRouteLobby.passengers_json))
  : [];
const matchingLobbyMaxSeats = matchingRouteLobby
  ? Number(matchingRouteLobby.max_seats || lobbySeatLimit)
  : 0;
const matchingLobbySeatsLeft = Math.max(0, matchingLobbyMaxSeats - matchingLobbyPassengers.length);
const canJoinMatchingLobby = matchingLobbySeatsLeft >= passengerCount;
const matchingLobbyBackgroundRoute = routePoints?.length ? routePoints : terminalRoutePath;
const matchingLobbyBackgroundCenter = pickupCoords
  || dropoffCoords
  || matchingLobbyBackgroundRoute[0]
  || { lat: 14.5995, lng: 120.9842 };

if (bookingCancelled) return null;

if (matchingRouteLobby) {
  const closeMatchingLobbyPrompt = () =>
    resolveMatchingLobbyChoice(matchingLobbyPromptMode === 'after-create' ? 'stay' : 'cancel');

  return (
    <div className="fixed inset-0 z-[2600] overflow-hidden bg-[var(--background)]">
      {isMapsLoaded ? (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={matchingLobbyBackgroundCenter}
          zoom={15}
          options={{
            disableDefaultUI: true,
            zoomControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: 'none',
            keyboardShortcuts: false,
          }}
          onLoad={(map: any) => {
            const maps = (window as any)?.google?.maps;
            const points = [
              ...matchingLobbyBackgroundRoute,
              ...(pickupCoords ? [pickupCoords] : []),
              ...(dropoffCoords ? [dropoffCoords] : []),
            ];
            if (points.length > 1 && maps?.LatLngBounds) {
              const bounds = new maps.LatLngBounds();
              points.forEach(point => bounds.extend(point));
              map.fitBounds(bounds, 56);
            }
          }}
        >
          {matchingLobbyBackgroundRoute.length > 1 && (
            <Polyline
              path={matchingLobbyBackgroundRoute}
              options={{ strokeColor: terminalRouteColor, strokeOpacity: 0.9, strokeWeight: 5, clickable: false }}
            />
          )}
          {pickupCoords && (
            <MarkerF
              position={pickupCoords}
              title="Pickup"
              icon={terminalMarkerIcon(terminalMarkerColor, 58)}
            />
          )}
          {dropoffCoords && (
            <MarkerF
              position={dropoffCoords}
              title="Drop-off"
              icon={createDropoffStopIcon(terminalRouteColor)}
            />
          )}
        </GoogleMap>
      ) : (
        <div className="absolute inset-0 bg-[var(--background)]" aria-hidden="true" />
      )}

      <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/10 p-4">
      <Card role="dialog" aria-modal="true" aria-labelledby="matching-lobby-title" className="relative w-full max-w-sm border border-[var(--border)] bg-surface p-6 pt-12 shadow-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={closeMatchingLobbyPrompt}
          className="absolute right-3 top-3 rounded-full text-[var(--muted-foreground)]"
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
        <div className="mb-5 text-center">
          <h3 id="matching-lobby-title" className="text-lg font-bold text-[var(--ink)]">
            {matchingLobbyPromptMode === 'after-create'
              ? 'Another lobby was created on this route'
              : 'A lobby with the same route already exists'}
          </h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {matchingLobbyPromptMode === 'after-create'
              ? canJoinMatchingLobby
                ? 'A customer created a lobby for this route at the same time. Do you want to move your group into it?'
                : 'A customer created a lobby for this route at the same time, but it does not have enough seats for your group.'
              : 'Join the existing lobby or create a new one for this route.'}
          </p>
        </div>
        <div className="grid gap-2">
          {canJoinMatchingLobby && (
            <Button onClick={() => resolveMatchingLobbyChoice('join')} className="w-full bg-[var(--primary)] text-white">
              {matchingLobbyPromptMode === 'after-create' ? 'Move to this lobby' : 'Join existing lobby'}
            </Button>
          )}
          {matchingLobbyPromptMode === 'after-create' ? (
            <Button variant="outline" onClick={() => resolveMatchingLobbyChoice('stay')} className="w-full">
              Stay in this lobby
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => resolveMatchingLobbyChoice('create')} className="w-full">
                Create a new lobby
              </Button>
            </>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}

if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center">
        <div className="bg-surface rounded-lg p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[var(--muted-foreground)]">Creating lobby...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <Card className="bg-surface p-6 max-w-sm w-full">
          <h3 className="text-lg font-bold text-[var(--error)] mb-2">Error</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">{error}</p>
          <Button onClick={onClose} className="w-full bg-[var(--error)] hover:bg-[var(--error)]">
            Close
          </Button>
        </Card>
      </div>
    );
  }

  // Gate refusal popup (can show even when lobby is null). The copy follows the
  // gate, because the customer's next action differs for each one.
  if (showOutOfBoundaryPopup) {
    const copy = {
      border: {
        icon: '📍',
        tone: 'error',
        title: "You're not at a terminal",
        body: (
          <>
            Shared rides can only be booked from inside a terminal. You're currently outside
            every terminal's service area, so please move to one of our terminals and try again.
          </>
        ),
      },
      route: {
        icon: '🛣️',
        tone: 'error',
        title: 'Drop-off not on our route',
        body: (
          <>
            Your designated <strong>drop-off location</strong> is not within the route of the
            selected terminal. Please choose a drop-off point on one of our routes.
          </>
        ),
      },
      unresolved: {
        icon: '📍',
        tone: 'warn',
        title: "We couldn't locate that drop-off",
        body: (
          <>
            Before we can check whether your <strong>drop-off point</strong> is on a terminal's
            route we need to find it on the map. Tap the drop-off on the map, or try a more
            complete address.
          </>
        ),
      },
      lookup: {
        icon: '⚠️',
        tone: 'warn',
        title: "Couldn't verify terminal boundaries",
        body: (
          <>
            Check your connection and try again. The shared ride can't be booked until its pickup and drop-off are verified.
          </>
        ),
      },
    }[gateFailure || 'route'];

    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              copy.tone === 'warn' ? 'bg-[var(--amber-soft)]' : 'bg-[var(--error-soft)]'
            }`}
          >
            <span className="text-3xl">{copy.icon}</span>
          </div>
          <h3
            className={`text-xl font-bold text-center mb-2 ${
              copy.tone === 'warn' ? 'text-[var(--ink)]' : 'text-[var(--error)]'
            }`}
          >
            {copy.title}
          </h3>
          <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
            {copy.body}
          </p>
          <button
            onClick={() => {
              setShowOutOfBoundaryPopup(false);
              setGateFailure(null);
              onClose();
            }}
            className="w-full py-3 bg-[var(--primary)] text-white font-bold rounded-xl active:scale-95 transition-transform"
          >
            Understood
          </button>
        </div>
      </div>
    );
  }

  if (!lobby) return null;

  const driverAssignedModal = driverAssignedNotice?.lobbyId === lobby.id ? (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-ride-driver-assigned-title"
        className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
          <Tricycle className="size-8" aria-hidden="true" />
        </div>
        <h2 id="share-ride-driver-assigned-title" className="mb-2 text-xl font-bold text-[var(--ink)]">
          Driver assigned!
        </h2>
        <p className="mb-5 text-sm text-[var(--muted-foreground)]">
          A driver has accepted your share ride and is heading to your pickup.
        </p>
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-[var(--muted)] p-3 text-left">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary)] text-sm font-bold text-white">
            {driverProfileAvatar && lobby.driver_id === driverAssignedNotice.driverId ? (
              <img
                src={driverProfileAvatar}
                alt=""
                className="size-full object-cover"
                onError={() => setDriverProfileAvatar(null)}
              />
            ) : (
              getDriverInitials(driverAssignedNotice.driverName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--muted-foreground)]">Your driver</p>
            <p className="truncate font-bold text-[var(--ink)]">{driverAssignedNotice.driverName}</p>
            {driverAssignedNotice.driverPlate && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                Plate: {driverAssignedNotice.driverPlate}
              </p>
            )}
          </div>
        </div>
        <Button onClick={() => setDriverAssignedNotice(null)} className="w-full bg-[var(--primary)] text-white">
          Got it
        </Button>
      </Card>
    </div>
  ) : null;

  const passengers = lobby.passengers_json || [];
  // Old lobbies stored one fare for the whole group; keep the per-passenger
  // values available here so payment prompts work in both minimized and full views.
  const passengersWithFares = backfillLegacySharedRidePassengerFares(
    passengers,
    Number(lobby.price_per_seat || pricePerSeat * passengers.length),
  );
  const ownLobbyPassengers = normalizePassengers(passengersWithFares).filter(passenger => Boolean(
    user?.id && (
      passenger.id === user.id ||
      passenger.id.startsWith(`${user.id}_companion_`)
    )
  ));
  const ownRideCompleted = ownLobbyPassengers.length > 0 && ownLobbyPassengers.every(passenger =>
    String(passenger.dropoff_status || passenger.dropoffStatus || '').toLowerCase() === 'completed' &&
    ['received', 'prepaid'].includes(String(passenger.payment_status || passenger.paymentStatus || '').toLowerCase())
  );
  const paymentModalPassenger = ownLobbyPassengers.find(passenger => passenger.id === paymentModalPassengerId) || null;
  const dismissPaymentModal = () => {
    if (lobby.id && user?.id && paymentModalPassenger) {
      try {
        localStorage.setItem(
          `share_ride_payment_modal_dismissed_${lobby.id}_${user.id}_${paymentModalPassenger.id}`,
          '1',
        );
      } catch {
        // The prompt can still be dismissed for this mounted lobby if storage is unavailable.
      }
    }
    setPaymentModalPassengerId(null);
  };
  const paymentModal = paymentModalPassenger ? (
    <div className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/60 p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-ride-payment-title"
        className="w-full max-w-sm gap-0 rounded-2xl bg-surface p-5 text-left shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary)]">
            {driverProfileAvatar ? (
              <img
                src={driverProfileAvatar}
                alt={`${lobby.driver_name || 'Driver'}'s profile`}
                className="size-full object-cover"
                onError={() => setDriverProfileAvatar(null)}
              />
            ) : (
              getDriverInitials(lobby.driver_name)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="share-ride-payment-title" className="text-lg font-bold leading-6 text-[var(--ink)]">
              Payment to {lobby.driver_name || 'your driver'}
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">
              {String(lobby.payment_method || 'COD').toUpperCase() === 'COD'
                ? 'Pay your fare at drop-off to complete the ride.'
                : 'This ride was prepaid. The driver will continue the ride shortly.'}
            </p>
          </div>
        </div>
        <div className="mb-4 space-y-3 rounded-xl bg-[var(--muted)] p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--muted-foreground)]">Your fare</span>
            <strong className="text-lg text-[var(--primary)]">₱{Number(paymentModalPassenger.fare ?? pricePerSeat).toFixed(2)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <span className="text-sm text-[var(--muted-foreground)]">Payment method</span>
            <strong className="text-sm text-[var(--ink)]">
              {String(lobby.payment_method || 'COD').toUpperCase() === 'COD' ? 'Cash to driver' : 'Prepaid'}
            </strong>
          </div>
        </div>
        <Button onClick={dismissPaymentModal} className="h-12 w-full bg-[var(--primary)] text-white">
          Got it
        </Button>
      </Card>
    </div>
  ) : null;

  /*
   * The chat layer: the floating head and the overlay it opens.
   *
   * Built once and rendered by both the minimized icon and the full sheet. The
   * customer asked for the head to survive minimizing, and the minimized branch
   * is an early return that never reached the markup below -- so a second copy
   * there would have been two places to keep the gates in step. The overlay
   * lives here too, so it works from either view and closing it returns to
   * whichever one is on screen.
   *
   * `terminalStatus` rather than `isTerminal`, because that const is declared
   * further down, after this branch.
   *
   * The floating head and chat panel use the shared app overlay layers, so the
   * chat stays reachable above this lobby and its dialogs.
   */
  const chatLayer = (
    <>
      {/* Chat with the driver as an overlay, so the lobby stays behind it the
          way the driver's ride screen keeps its map. */}
      <RideChatOverlay
        open={lobbyChatPopup}
        conversationId={driverChatId.current}
        peerId={lobby.driver_id || null}
        currentUserId={user?.id ?? null}
        peerAvatar={driverProfileAvatar}
        peerName={lobby.driver_name || 'Driver'}
        senderRole="customer"
        onClose={() => setLobbyChatPopup(false)}
        zIndexClass="z-[10001]"
      />

      {/* Floating chat head -- the same component the driver's ride screen uses.
          Hidden while the overlay is open so two heads never stack. */}
      {chatHeadActivated && lobby.driver_id && lobby.status === 'driver_found' && terminalStatus === null && !ownRideCompleted && (
        <FloatingChatHead
          headId={driverChatId.current || undefined}
          zIndexClass="z-[10000]"
          hidden={lobbyChatPopup}
          storageKey="trikeserve_chat_head_pos_customer"
          peerAvatar={driverProfileAvatar}
          peerLabel={lobby.driver_name || 'Driver'}
          unread={driverUnread}
          pulseKey={chatPulseKey}
          opened={chatOpened}
          onOpen={openLobbyChatThread}
        />
      )}
    </>
  );

  // Minimized floating icon
  if (isMinimized && !ownRideCompleted) {
    return (
      <>
        {chatLayer}
        {paymentModal}
        {driverAssignedModal}
        <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-24 right-4 z-[2000] shadow-2xl"
      >
        <div className="relative">
          <div className="w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center hover:bg-[var(--primary)] transition-all hover:scale-110">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-surface rounded-full border-2 border-[var(--primary)] flex items-center justify-center">
            <span className="text-xs font-bold text-[var(--primary)]">
              {(lobby.passengers_json || []).length}/{lobby.max_seats}
            </span>
          </div>
          <div className="absolute inset-0 bg-[var(--primary)] rounded-full animate-ping opacity-20"></div>
        </div>
        </button>
      </>
    );
  }

  const effectiveTerminalStatus = terminalStatus || (ownRideCompleted ? 'completed' : null);
  const isTerminal = effectiveTerminalStatus !== null;
  const getPassengerDisplayName = (passenger: LobbyPassenger) => {
    if (passenger.id === user?.id) return 'You';

    const ownCompanionPrefix = user?.id ? `${user.id}_companion_` : null;
    if (ownCompanionPrefix && passenger.id.startsWith(ownCompanionPrefix)) {
      const ownCompanions = passengers.filter((candidate) => candidate.id.startsWith(ownCompanionPrefix));
      const companionNumber = ownCompanions.findIndex((candidate) => candidate.id === passenger.id) + 1;
      return ownCompanions.length > 1 ? `Your companion ${companionNumber}` : 'Your companion';
    }

    const otherPassengers = passengers.filter((candidate) =>
      candidate.id !== user?.id && !(ownCompanionPrefix && candidate.id.startsWith(ownCompanionPrefix))
    );
    const passengerNumber = otherPassengers.findIndex((candidate) => candidate.id === passenger.id) + 1;
    return `Passenger ${passengerNumber}`;
  };

  // Old lobbies stored one total on the row; newer passengers carry their own
  // fare because each can have a different drop-off distance.
  const yourPassengers = user
    ? passengersWithFares.filter(passenger => passenger.id === user.id || passenger.id.startsWith(`${user.id}_companion_`))
    : [];
  const yourSeatCount = yourPassengers.length;
  const yourSeatTotal = sumSharedRidePassengerFares(yourPassengers);
  const yourFarePerSeat = yourSeatCount > 0 ? yourSeatTotal / yourSeatCount : pricePerSeat;
  const ownPassenger = yourPassengers.find(passenger => passenger.id === user?.id) || yourPassengers[0];
  const ownDropoff =
    ownPassenger?.dropoff?.trim() ||
    ownPassenger?.dropoffAddress?.trim() ||
    dropoff?.trim() ||
    dropoffAddress?.trim() ||
    (lobby.customer_id === user?.id ? lobby.dropoff_location : 'Your drop-off');
  const isCurrentCustomerPassenger = (passenger: LobbyPassenger) => Boolean(
    user?.id && (
      passenger.id === user.id ||
      passenger.id.startsWith(`${user.id}_companion_`)
    )
  );
  // Only show this customer's own drop-offs on their map.
  const ownDropoffOrder = orderLobbyDropoffs(yourPassengers, pickupCoords);
  const mapDropoffStops = ownDropoffOrder.reduce<Array<{
    key: string;
    coords: { lat: number; lng: number };
  }>>((stops, { passenger }) => {
    if (passenger.dropoffLat == null || passenger.dropoffLng == null) return stops;
    const lat = Number(passenger.dropoffLat);
    const lng = Number(passenger.dropoffLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return stops;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (!stops.some(stop => stop.key === key)) stops.push({ key, coords: { lat, lng } });
    return stops;
  }, []);
  if (dropoffCoords && !mapDropoffStops.some(stop =>
    Math.abs(stop.coords.lat - dropoffCoords.lat) < 0.00001 && Math.abs(stop.coords.lng - dropoffCoords.lng) < 0.00001
  )) {
    mapDropoffStops.push({
      key: 'current-user-dropoff',
      coords: dropoffCoords,
    });
  }
  mapDropoffStops.sort((a, b) =>
    pickupCoords
      ? haversineDistanceMeters(pickupCoords, a.coords) - haversineDistanceMeters(pickupCoords, b.coords)
      : 0,
  );

  // Full lobby view
  return (
    <>
      <div className={presentation === 'page'
        ? "fixed inset-0 z-[2000] bg-[var(--background)]"
        : "fixed inset-0 bg-black/50 z-[2000] flex items-end"}>
        <div className={presentation === 'page'
          ? "flex h-full w-full flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          : "bg-surface w-full rounded-t-3xl max-h-[92vh] overflow-hidden flex flex-col animate-slide-up"}>
          {/* Header - Gradient */}
          <div className="bg-[var(--primary)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => presentation === 'page' ? onClose() : setIsMinimized(true)}
                  aria-label={presentation === 'page' ? 'Back to customer home' : 'Minimize share ride'}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
                >
                  {presentation === 'page'
                    ? <ArrowLeft className="h-5 w-5 text-white" />
                    : <ChevronDown className="h-5 w-5 text-white" />}
                </button>
                <div>
                  <h2 className="text-lg font-bold text-white">Share Ride</h2>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${lobby.status === 'driver_found' ? 'bg-[var(--success)]' : 'bg-[var(--amber)] animate-pulse'}`} />
                    <p className="text-xs text-white/80">
                      {lobby.status === 'driver_found' ? 'Driver Found!' : `Finding driver... ${waitingTime}`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Only show cancel button while still searching for a driver */}
                {lobby.status === 'waiting' && (
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Route Info - clean design */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-stretch gap-3">
              {/* Route dots & line */}
              <div className="flex flex-col items-center justify-center gap-0.5 w-4 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-[var(--ink-solid)] border-2 border-white shadow-sm" />
                <div className="w-0.5 flex-1 bg-gradient-to-b from-[var(--ink)] to-[var(--primary)] rounded-full" />
                <div className="w-3 h-3 rounded-full bg-[var(--primary)] border-2 border-white shadow-sm" />
              </div>
              {/* Addresses */}
              <div className="flex-1 space-y-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--muted-foreground)] font-bold tracking-wider">Pickup</p>
                  <p className="font-bold text-sm text-[var(--ink)] truncate">{lobby.pickup_location}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--muted-foreground)] font-bold tracking-wider">Drop-off</p>
                  <p className="font-bold text-sm text-[var(--ink)] truncate">{ownDropoff}</p>
                </div>
                {etaToDestination && (
                  <div className="flex-shrink-0 bg-[var(--error-soft)] text-[var(--error)] px-2 py-1 rounded-lg">
                    <p className="flex items-center gap-1 text-[10px] font-bold"><Flag className="size-3" aria-hidden="true" />{etaToDestination}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Passengers Section */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest">Passengers</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--primary)] bg-[var(--primary-soft)] px-2.5 py-1 rounded-full">
                    {passengers.length}/{lobby.max_seats}
                  </span>
                  {lobby.status === 'waiting' && (
                    <Button
                      variant="outline"
                      onClick={() => setShowLobbyBrowser(true)}
                      className="h-8 px-2 text-xs"
                    >
                      <Users className="mr-1.5 size-4" aria-hidden="true" />
                      View lobbies
                    </Button>
                  )}
                </div>
              </div>

              {/* Passenger Cards */}
              <div className="space-y-2">
                {passengers.map((passenger) => {
                  const isCurrentUserOrCompanion = isCurrentCustomerPassenger(passenger);
                  
                  return (
                    <Card 
                      key={passenger.id}
                      className={`p-4 border-2 transition-all ${
                        isCurrentUserOrCompanion
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)]' 
                          : 'border-[var(--border)] bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 flex-shrink-0 overflow-hidden rounded-full bg-[var(--primary)] flex items-center justify-center text-2xl">
                          <PassengerAvatar
                            passenger={passenger}
                            resolvedAvatar={passengerAvatars[passenger.id]}
                            showProfile={isCurrentUserOrCompanion}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-[var(--ink)] truncate">{getPassengerDisplayName(passenger)}</p>
                            {passenger.id === user?.id && (
                              <Badge variant="outline" className="border-[var(--primary)] text-[var(--primary)] text-[10px]">
                                YOU
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            Joined {new Date(passenger.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {/* Empty Seats */}
                {Array.from({ length: lobby.max_seats - passengers.length }).map((_, index) => (
                  <Card
                    key={`empty-${index}`}
                    className="p-4 border-2 border-dashed border-[var(--border)] bg-[var(--muted)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[var(--border)] flex items-center justify-center">
                        <Users className="w-6 h-6 text-[var(--muted-foreground)]" />
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] italic">Waiting for passenger...</p>
                    </div>
                  </Card>
                ))}
              </div>

            </div>

            {/* Driver Info (when found) */}
            {lobby.status === 'driver_found' && lobby.driver_name && (
              <div className="bg-gradient-to-r from-[var(--success-soft)] to-[var(--success-soft)] border-2 border-[var(--success)] rounded-xl p-3.5 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 flex-shrink-0 overflow-hidden rounded-full bg-[var(--success)] flex items-center justify-center">
                    {driverProfileAvatar ? (
                      <img
                        src={driverProfileAvatar}
                        alt={`${lobby.driver_name || 'Driver'}'s profile`}
                        className="size-full object-cover"
                        onError={() => setDriverProfileAvatar(null)}
                      />
                    ) : (
                      <span className="text-sm font-bold text-white" role="img" aria-label={`${lobby.driver_name || 'Driver'}'s initials`}>
                        {getDriverInitials(lobby.driver_name)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[var(--success)] font-bold tracking-wider">Your Driver</p>
                    <p className="font-bold text-[var(--ink)] truncate">{lobby.driver_name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted-foreground)]">{lobby.driver_plate}</span>
                      {(computedDriverRating || lobby.driver_rating) && (
                        <span className="flex items-center gap-0.5">
                          <Star className="size-3 fill-[var(--amber)] text-[var(--amber)]" aria-hidden="true" />
                          <span className="text-xs font-semibold text-[var(--ink)]">{computedDriverRating || lobby.driver_rating}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Opens the same chat the floating head does, in place.
                      It used to navigate to the Messages tab, which unmounted
                      the lobby -- two different behaviours for one thread. */}
                  <Button
                    size="icon"
                    aria-label="Message driver"
                    className="bg-[var(--success)] hover:bg-[var(--success)] text-white h-10 w-10"
                    onClick={openLobbyChatThread}
                    disabled={openingChat}
                  >
                    <MessageCircle className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Terminal route and live tracking map */}
            {isMapsLoaded && ((['driver_found', 'in_progress'].includes(lobby.status) && driverLocation) || terminalRoutePath.length > 0 || mapDropoffStops.length > 0) && (
              <div className="rounded-xl overflow-hidden mb-3 border border-[var(--border)] shadow-sm">
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '240px' }}
                  center={pickupCoords || terminalRoutePath[0] || driverLocation || { lat: 14.5995, lng: 120.9842 }}
                  zoom={15}
                  onLoad={(map: any) => {
                    lobbyMapRef.current = map;
                    fitLobbyRouteBounds();
                  }}
                  onUnmount={() => { lobbyMapRef.current = null; }}
                  onDragStart={() => { lobbyMapWasManuallyMovedRef.current = true; }}
                  options={{
                    zoomControl: false,
                    fullscreenControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    draggable: true,
                    gestureHandling: 'greedy',
                  }}
                >
                  <MapTypeToggle />
                  {/* Driver marker (tricycle icon) */}
                  {driverLocation && (
                    <MarkerF
                      position={driverLocation}
                      title="Driver Location"
                      icon={(() => {
                        const google = (window as any)?.google;
                        if (!google?.maps?.Size || !google?.maps?.Point) return undefined;
                        return {
                          url: tricycleIcon,
                          scaledSize: new google.maps.Size(44, 44),
                          anchor: new google.maps.Point(22, 22),
                        };
                      })()}
                    />
                  )}
                  {/* Pickup marker */}
                  {pickupCoords && (
                    <MarkerF
                      position={pickupCoords}
                      title="Pickup"
                      icon={terminalMarkerIcon(terminalMarkerColor, 58)}
                    />
                  )}
                  {/* Markers show only this customer's own drop-offs. */}
                  {mapDropoffStops.map(stop => {
                    return (
                      <MarkerF
                        key={stop.key}
                        position={stop.coords}
                        title="Your drop-off"
                        icon={createDropoffStopIcon(terminalRouteColor)}
                        zIndex={20}
                      />
                    );
                  })}
                  {/* Terminal route corridor, visible before and after driver assignment. */}
                  {terminalRoutePath.length > 0 && (
                    <Polyline
                      path={terminalRoutePath}
                      options={{ strokeColor: terminalRouteColor, strokeOpacity: 0.22, strokeWeight: 10, geodesic: true, clickable: false }}
                    />
                  )}
                  {terminalRoutePath.length > 0 && (
                    <Polyline
                      path={terminalRoutePath}
                      options={{ strokeColor: terminalRouteColor, strokeOpacity: 0.95, strokeWeight: 4, geodesic: true, clickable: false }}
                    />
                  )}
                  {/* Driver route line */}
                  {driverRoutePath.length > 0 && (
                    <Polyline
                      path={driverRoutePath}
                      options={{
                        strokeColor: (lobby.driver_status === 'on-the-way' || lobby.driver_status === 'arrived') ? 'var(--success)' : 'var(--info)',
                        strokeOpacity: 0.9,
                        strokeWeight: 4,
                        geodesic: true,
                      }}
                    />
                  )}
                  {/* Destination route line (pickup to dropoff) */}
                  {destinationRoutePath.length > 0 && (
                    <Polyline
                      path={destinationRoutePath}
                      options={{
                        strokeColor: 'var(--primary)',
                        strokeOpacity: 0.9,
                        strokeWeight: 5,
                        geodesic: true,
                      }}
                    />
                  )}
                </GoogleMap>
                {/* Driver status indicator */}
                <div className="px-3 py-2 bg-surface border-t border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${driverLocation ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--info)]'}`} />
                    <span className="text-xs font-semibold text-[var(--ink)]">
                      {!driverLocation
                        ? (lobby.driver_id ? 'Connecting to driver' : 'Waiting for a driver')
                        : ['picked-up', 'pickup', 'drop-off', 'dropped-off', 'payment', 'awaiting-payment', 'completed'].includes(String(lobby.driver_status || '').toLowerCase())
                          ? 'On the way to destination'
                          : 'Waiting for pickup'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-[var(--muted-foreground)]" />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {driverLocation
                        ? `${driverLocation.lat.toFixed(4)}, ${driverLocation.lng.toFixed(4)}`
                        : 'Terminal route'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting Animation */}
            {lobby.status === 'waiting' && (
              <div className="text-center py-5">
                <div className="w-14 h-14 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <span className="text-3xl">🔍</span>
                </div>
                <p className="text-sm font-semibold text-[var(--ink)] mb-1">
                  {passengers.length < lobby.max_seats
                    ? 'Waiting for more passengers...'
                    : 'Finding the best driver for you...'}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  More passengers = faster pickup!
                </p>
              </div>
            )}
          </div>

          {/* Footer - Price Info */}
          <div className="p-4 border-t border-[var(--border)] bg-surface">
            <div className="flex items-center">
              <div>
                <p className="text-[10px] text-[var(--muted-foreground)] font-bold tracking-wider">Your Fare</p>
                <p className="text-2xl font-bold text-[var(--primary)]">₱{yourFarePerSeat.toFixed(2)}</p>
                {yourSeatCount > 1 && (
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    Your {yourSeatCount} seats: ₱{yourSeatTotal.toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            {passengers.length === lobby.max_seats && (
              <div className="bg-[var(--success-soft)] border border-[var(--success-soft)] rounded-lg p-3 text-center">
                <p className="text-sm text-[var(--success)] font-semibold">
                  🎉 Lobby Full! Prioritizing your ride request...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isTerminal && (
        <div className="fixed inset-0 bg-black/60 z-[2200] flex items-center justify-center p-4">
          <Card className="bg-surface p-5 max-w-sm w-full gap-0 text-center shadow-2xl border-2 border-[var(--success-soft)]">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[var(--success-soft)] flex items-center justify-center">
              {effectiveTerminalStatus === 'completed'
                ? <Check className="size-8 text-[var(--success)]" aria-hidden="true" />
                : <X className="size-8 text-[var(--error)]" aria-hidden="true" />}
            </div>
            <h3 className="text-lg font-bold text-[var(--ink)] mb-1">
              {effectiveTerminalStatus === 'completed' ? 'Ride Completed' : 'Ride Cancelled'}
            </h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              {effectiveTerminalStatus === 'completed'
                ? 'Your drop-off is confirmed. Your ride is complete. Thank you for riding with TrikeServe!'
                : terminalCancelMessage || 'This ride has been cancelled. Returning you to the customer screen...'}
            </p>
            {effectiveTerminalStatus === 'completed' && lobby.driver_id && (
              <div className="mb-4 rounded-xl bg-[var(--muted)] p-3 text-left">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--primary-soft)] text-sm font-bold text-[var(--primary)]">
                    {driverProfileAvatar ? (
                      <img
                        src={driverProfileAvatar}
                        alt={`${lobby.driver_name || 'Driver'}'s profile`}
                        className="size-full object-cover"
                        onError={() => setDriverProfileAvatar(null)}
                      />
                    ) : (
                      getDriverInitials(lobby.driver_name)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Your driver</p>
                    <p className="truncate text-sm font-bold text-[var(--ink)]">{lobby.driver_name || 'Your driver'}</p>
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
                        onClick={() => {
                          if (typeof onClose === 'function') onClose('completed');
                        }}
                        className="h-11 w-full border-2 border-[var(--border)] bg-surface font-bold text-[var(--ink)]"
                      >
                        Done
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {effectiveTerminalStatus === 'completed' && (!lobby.driver_id || ratingSubmitted) && (
              <Button
                type="button"
                onClick={() => {
                  if (typeof onClose === 'function') onClose('completed');
                }}
                className="w-full bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary)]"
              >
                Done
              </Button>
            )}
          </Card>
        </div>
      )}

      {/* Chat layer (floating head + overlay). Defined once above the minimized
          branch so the head stays on screen in both views. */}
      {chatLayer}

      {paymentModal}
      {driverAssignedModal}

      {/* Driver Status Update Popup (same as private rides) */}
      {driverStatusPopup && (
        <div
          className="fixed inset-0 bg-black/50 z-[2300] flex items-end"
          onClick={() => setDriverStatusPopup(null)}
        >
          <div className="bg-surface w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
            <div className="max-w-sm mx-auto">
              {/* Status Icon */}
              <div className="w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center mx-auto mb-4">
                <DriverStatusIcon status={driverStatusPopup.status} className="size-8 text-white" />
              </div>

              {/* Status Message */}
              <h3 className="text-2xl font-bold text-[var(--ink)] text-center mb-2">
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
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full Capacity Popup */}
      {showFullCapacityPopup && (
        <div className="fixed inset-0 bg-black/50 z-[2300] flex items-center justify-center p-4">
          <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
            <div className="w-16 h-16 bg-[var(--amber-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🎉</span>
            </div>
            <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">Lobby Full!</h3>
            <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
              All {lobby.max_seats} seats are taken! Your ride is being prioritized for faster pickup.
            </p>
            <div className="bg-[var(--success-soft)] border border-[var(--success-soft)] rounded-xl p-3 mb-6">
              <p className="text-sm text-[var(--success)] text-center font-semibold">
                💰 You're now sharing the fare with {lobby.max_seats - 1} other passengers!
              </p>
            </div>
            <button
              onClick={() => setShowFullCapacityPopup(false)}
              className="w-full py-3 bg-[var(--success)] text-white font-bold rounded-xl active:scale-95 transition-transform"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[2100] flex items-center justify-center p-4">
          <Card className="bg-surface p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[var(--ink)] mb-2">Leave Lobby?</h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              You and your companion seats will leave this lobby. Other passengers can continue their ride.
              {lobby.customer_id === user?.id
                ? ' The next passenger in join order becomes host. If nobody remains, the lobby closes.'
                : ''}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1"
              >
                Stay
              </Button>
              <Button
                onClick={handleLeaveLobby}
                className="flex-1 bg-[var(--error)] hover:bg-[var(--error)] text-white"
              >
                Leave Lobby
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showLobbyBrowser && lobby.status === 'waiting' && (
        <BrowseAvailableLobbies
          pickup={lobby.pickup_location}
          pickupAddress={lobby.pickup_address || lobby.pickup_location}
          pickupCoords={pickupCoords || (
            lobby.pickup_lat != null && lobby.pickup_lng != null
              ? { lat: Number(lobby.pickup_lat), lng: Number(lobby.pickup_lng) }
              : null
          )}
          terminalId={lobby.terminal_id || selectedTerminalId}
          routeId={ownPassenger?.route_id || selectedRouteId}
          routePoints={routePoints}
          routeWidthM={routeWidthM}
          dropoff={ownDropoff}
          dropoffAddress={ownPassenger?.dropoffAddress || ownDropoff}
          dropoffCoords={dropoffCoords || (
            ownPassenger?.dropoffLat != null && ownPassenger?.dropoffLng != null
              ? { lat: Number(ownPassenger.dropoffLat), lng: Number(ownPassenger.dropoffLng) }
              : null
          )}
          rates={{ baseFare: yourFarePerSeat, baseFareIncludedKm: 0, perKm: 0 }}
          moveFromLobbyId={lobby.id}
          movingPassengers={yourPassengers}
          fareOverride={yourSeatTotal}
          onLobbyJoined={(nextLobbyId) => {
            setShowLobbyBrowser(false);
            onLobbyMoved?.(nextLobbyId);
          }}
          onClose={() => setShowLobbyBrowser(false)}
        />
      )}

      {moveFailureMessage && (
        <div className="fixed inset-0 z-[2700] flex items-center justify-center bg-black/60 p-4">
          <Card role="dialog" aria-modal="true" className="w-full max-w-sm p-6">
            <h3 className="mb-2 text-lg font-bold text-[var(--ink)]">Could not move lobbies</h3>
            <p className="mb-5 text-sm text-[var(--muted-foreground)]">{moveFailureMessage}</p>
            <Button onClick={() => setMoveFailureMessage(null)} className="w-full bg-[var(--primary)] text-white">
              Stay in this lobby
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
