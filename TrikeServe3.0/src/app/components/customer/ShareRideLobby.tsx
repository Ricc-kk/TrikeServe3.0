import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Users, Clock, X, ChevronDown, MessageCircle, User, Minimize2, Star, Navigation } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabase, supabaseHelpers, isSimilarRoute, isPointWithinAnyTerminalBorder, isPointWithinAnyTerminalRoute, haversineDistanceMeters } from "@/lib/supabase";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { useElapsedTime } from "@/app/hooks/useElapsedTime";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'
import FloatingChatHead from "../ui/FloatingChatHead";
import RideChatOverlay from "../rider/RideChatOverlay";

interface LobbyPassenger {
  id: string;
  name: string;
  emoji: string;
  /** The passenger's own avatar: a profile photo URL, or an emoji fallback. */
  avatar?: string;
  joinedAt: string;
  pickup: string;  // Individual pickup location
  pickupAddress: string;  // Individual pickup address
  // Each passenger rides to their own destination, captured when they join, so
  // the lobby can show every drop-off and the order they happen in.
  dropoff?: string;
  dropoffAddress?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
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
  className,
}: {
  passenger: LobbyPassenger;
  /** The passenger's live photo from `users.avatar_url`, when known. */
  resolvedAvatar?: string | null;
  className?: string;
}) {
  // The live profile photo wins: it is the only source that also covers a
  // passenger who joined before the lobby row stored an avatar.
  const value = (resolvedAvatar || passenger.avatar || passenger.emoji || '👤').trim();
  const isImage = /^https?:\/\//i.test(value) || value.startsWith('data:image/');
  if (!isImage) return <span className={className}>{value}</span>;
  return <img src={value} alt="" className={`size-full object-cover ${className || ''}`} />;
}

interface ShareRideLobby {
  id: string;
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
  pricePerSeat?: number;
  paymentMethod?: 'COD';
  selectedTerminalId?: string | null;
  onDriverFound: (lobbyId: string) => void;
  onLobbyLoaded?: (lobbyId: string) => void;
  onClose: (status?: string) => void;
}

export default function ShareRideLobby({
  lobbyId,
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  pickupCoords,
  dropoffCoords,
  passengerCount = 1,
  pricePerSeat = 15,
  paymentMethod = 'COD',
  selectedTerminalId,
  onDriverFound,
  onLobbyLoaded,
  onClose
}: ShareRideLobbyProps) {
  const { user } = useAuth();
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
  /** Counts from the last poll, so a rise can be told apart from steady state. */
  const lastDriverCount = useRef(0);
  /** Bumped to replay the ripple; a finished CSS animation needs a remount. */
  const [chatPulseKey, setChatPulseKey] = useState(0);
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
   * Profile photos resolved from the users table.
   *
   * The lobby row itself carries only a name and an emoji, so a passenger who
   * joined before avatars were captured -- or who set a photo afterwards -- kept
   * showing a glyph. Reading `users.avatar_url` by id shows the real photo for
   * existing passengers too, and refreshes it when it changes. The driver's is
   * resolved the same way, because the accept payload has no photo column.
   */
  const [passengerAvatars, setPassengerAvatars] = useState<Record<string, string>>({});
  const [driverProfileAvatar, setDriverProfileAvatar] = useState<string | null>(null);
  const [lobby, setLobby] = useState<ShareRideLobby | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<'completed' | 'cancelled' | null>(null);
  const [terminalCancelMessage, setTerminalCancelMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasHandledTerminalLobbyStatus = useRef(false);
  const terminalCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [driverStatusPopup, setDriverStatusPopup] = useState<{ status: string; message: string } | null>(null);
  const driverStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [computedDriverRating, setComputedDriverRating] = useState<string | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();
  const [showFullCapacityPopup, setShowFullCapacityPopup] = useState(false);
  const [showLobbyFullPopup, setShowLobbyFullPopup] = useState(false);
  const [showOutOfBoundaryPopup, setShowOutOfBoundaryPopup] = useState(false);
  // Distinguishes "we found it and it's outside every terminal" from "we could
  // not find it at all" — the same dialog covers both and the wording differs.
  // Which gate refused this lobby, so the dialog can explain the actual problem
  // rather than a generic "out of area": the customer not being at a terminal,
  // the drop-off not being on a route, and not being able to locate the drop-off
  // are three different things a customer can fix in three different ways.
  const [gateFailure, setGateFailure] = useState<'unresolved' | 'border' | 'route' | null>(null);
  const [fullLobbyInfo, setFullLobbyInfo] = useState<{ passengers: number; maxSeats: number } | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverRoutePath, setDriverRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToDestination, setEtaToDestination] = useState<string | null>(null);
  const [destinationRoutePath, setDestinationRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const driverLocationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
   * them -- and keeps only the count, because the overlay is the source of
   * truth for the messages themselves.
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
      const count = ((msgs || []) as any[]).filter(
        (m: any) => m.sender_id !== user.id && m.read === false
      ).length;

      // Ripple only when the count actually grows, never on the first poll.
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

      // Completed rides stay open so the customer can leave a rating or tap
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

  const openRatingModal = () => {
    // Cancel any pending auto-close so the customer has time to rate.
    if (terminalCloseTimeoutRef.current) {
      clearTimeout(terminalCloseTimeoutRef.current);
      terminalCloseTimeoutRef.current = null;
    }
    setSelectedRating(0);
    setRatingSubmitted(false);
    setShowRatingModal(true);
  };

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

  const closeAfterRating = () => {
    setShowRatingModal(false);
    if (typeof onClose === 'function') {
      onClose('completed');
    }
  };

  // Show the same driver-status popups customers get for private rides.
  // The driver writes driver_status to the lobby (on-the-way, arrived,
  // picked-up, dropped-off, awaiting-payment) as the ride progresses.
  const processDriverStatusUpdate = (lobbyId: string, driverStatus?: string, message?: string) => {
    if (!driverStatus) return;
    const normalizedStatus = String(driverStatus).toLowerCase();
    const lastShownKey = `last_shown_status_lobby_${lobbyId}`;
    const lastShownStatus = localStorage.getItem(lastShownKey);

    if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') return;

    if (normalizedStatus && normalizedStatus !== 'pending' && normalizedStatus !== lastShownStatus) {
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
      };

      // Normalize driver-side statuses to the display keys used by the popup UI.
      const displayStatus =
        normalizedStatus === 'picked-up' ? 'pickup' :
        normalizedStatus === 'dropped-off' ? 'drop-off' :
        normalizedStatus === 'awaiting-payment' ? 'payment' :
        normalizedStatus;

      setDriverStatusPopup({
        status: displayStatus,
        message: statusDisplayMap[normalizedStatus] || message || 'Ride status updated',
      });
      localStorage.setItem(lastShownKey, normalizedStatus);

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

  const toTime = (value?: string) => new Date(value || 0).getTime();

   // Initialize or join lobby on mount
   useEffect(() => {
     let unsubscribe: (() => void) | undefined;
     let syncInterval: NodeJS.Timeout | undefined;
     let isMounted = true;

     const initializeLobby = async () => {
       try {
         if (!isMounted) return;
         setLoading(true);
         let existingLobby: ShareRideLobby | null = null;

         if (lobbyId) {
           const { data: selectedLobby, error: selectedLobbyError } = await supabaseHelpers.getLobbyById(lobbyId);
           if (selectedLobbyError) {
             console.error('Error loading selected lobby:', selectedLobbyError);
           } else if (selectedLobby) {
             existingLobby = {
               ...selectedLobby,
               passengers_json: normalizePassengers(selectedLobby.passengers_json)
             };
           }
         }

         if (!existingLobby) {
           existingLobby = await findOrCreateLobby();
         }

         if (existingLobby && isMounted) {
           setLobby(existingLobby);
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

                    // Show full capacity popup when lobby becomes full
                    if (newPassengerCount >= freshLobby.max_seats && prevPassengerCount < freshLobby.max_seats) {
                      setShowFullCapacityPopup(true);
                    }

                    handleTerminalLobbyStatus(freshLobby.status, freshLobby.driver_status_message);

                    // Show driver status popups (on-the-way, arrived, picked-up, etc.)
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
                setLobby((prevLobby) => {
                  if (!prevLobby) return prevLobby;
                  const prevCount = (prevLobby.passengers_json || []).length;
                  const latestCount = latestPassengers.length;

                  // Log every sync for debugging
                  console.log(`⏳ SYNC CHECK: prev=${prevCount} passengers, latest=${latestCount} passengers, status=${latestLobby.status}`);

                  // Always update if passenger count changed
                  if (prevCount !== latestCount) {
                    console.log(`🔄 PASSENGER COUNT CHANGED from ${prevCount} to ${latestCount} - UPDATING!`);
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
   }, [lobbyId]);

  // Poll for driver location in the lobby (every 3 seconds)
  useEffect(() => {
    if (!lobby || lobby.status !== 'driver_found') {
      setDriverLocation(null);
      setDriverRoutePath([]);
      return;
    }

    const pollDriverLocation = async () => {
      try {
        const { data: freshLobby } = await supabaseHelpers.getLobbyById(lobby.id);
        if (freshLobby && freshLobby.driver_lat && freshLobby.driver_lng) {
          const loc = { lat: freshLobby.driver_lat, lng: freshLobby.driver_lng };
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

  // Compute pickup-to-dropoff route (destination route)
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords || !isMapsLoaded || !(window as any).google) return;
    const DirectionsService = new (window as any).google.maps.DirectionsService();
    DirectionsService.route({
      origin: new (window as any).google.maps.LatLng(pickupCoords.lat, pickupCoords.lng),
      destination: new (window as any).google.maps.LatLng(dropoffCoords.lat, dropoffCoords.lng),
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    }, (result: any, status: string) => {
      if (status === 'OK' && result?.routes?.[0]?.overview_polyline?.points) {
        setDestinationRoutePath(decodePolyline(result.routes[0].overview_polyline.points));
      }
    });
  }, [pickupCoords, dropoffCoords, isMapsLoaded]);

  /*
   * Resolve the profile photo of everyone in the lobby.
   *
   * Keyed on the sorted ids rather than the passenger array: the array is
   * rebuilt on every poll, so depending on it would re-query the users table
   * every couple of seconds for the same people. Companions are excluded -- they
   * are extra seats, not accounts with a profile.
   */
  const passengerIdsKey = Array.from(
    new Set(
      (lobby?.passengers_json || [])
        .map((p) => p.id)
        .filter((id): id is string => !!id && !id.includes('_companion_'))
    )
  )
    .sort()
    .join(',');

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

      const border = await isPointWithinAnyTerminalBorder(pickupCoords.lat, pickupCoords.lng);
      if (!border.allowed) {
        console.log('🚫 Share ride pickup outside every terminal border:', pickupCoords);
        setGateFailure('border');
        setShowOutOfBoundaryPopup(true);
        return null;
      }

      const route = await isPointWithinAnyTerminalRoute(dropoffCoords.lat, dropoffCoords.lng);
      if (!route.allowed) {
        console.log('🚫 Share ride drop-off outside every terminal route:', dropoffCoords);
        setGateFailure('route');
        setShowOutOfBoundaryPopup(true);
        return null;
      }

      // First, check if user is already in a waiting lobby
      const { data: userLobbies, error: userError } = await supabaseHelpers.getAvailableLobbies();
      if (!userError && userLobbies) {
        const userLobbyCandidates = userLobbies.filter((l: any) => {
          const passengers = Array.isArray(l.passengers_json) ? l.passengers_json : [];
          return passengers.some((p: any) => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
        });

        const routeMatchedLobby = userLobbyCandidates
          .filter((l: any) => isSimilarRoute(l, pickup, dropoff, pickupAddress, dropoffAddress, selectedTerminalId))
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
        selectedTerminalId
      );

      if (!matchError && matchingLobby) {
        const passengers = Array.isArray(matchingLobby.passengers_json)
          ? matchingLobby.passengers_json
          : [];

        // Check if we have space
        if (passengers.length + passengerCount <= matchingLobby.max_seats) {
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
            dropoffLng: dropoffCoords?.lng ?? null
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
              dropoffLng: dropoffCoords?.lng ?? null
            });
          }

          // Update the lobby
          const { data: updated, error: updateError } = await supabaseHelpers.updateLobbyPassengers(
            matchingLobby.id,
            newPassengers
          );

          if (!updateError && updated) {
            console.log('✅ Joined existing lobby:', matchingLobby.id);
            return {
              ...updated,
              passengers_json: Array.isArray(updated.passengers_json) ? updated.passengers_json : []
            };
          }
        } else {
          // Lobby is full - show popup
          console.log('🚫 Lobby is full:', matchingLobby.id);
          setFullLobbyInfo({ passengers: passengers.length, maxSeats: matchingLobby.max_seats });
          setShowLobbyFullPopup(true);
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
        dropoffLng: dropoffCoords?.lng ?? null
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
          dropoffLng: dropoffCoords?.lng ?? null
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
        max_seats: 3,
        price_per_seat: pricePerSeat,
        payment_method: paymentMethod,
        terminal_id: selectedTerminalId || null,
        status: 'waiting'
      };

      const { data: createdLobby, error: createError } = await supabaseHelpers.createShareRideLobby(newLobby);

      if (!createError && createdLobby) {
        console.log('✅ Created new lobby:', createdLobby.id);
        return {
          ...createdLobby,
          passengers_json: Array.isArray(createdLobby.passengers_json) ? createdLobby.passengers_json : []
        };
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

       const { error: leaveError } = await supabaseHelpers.leaveShareRideLobby(
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
       // Small delay to ensure database update completes
       await new Promise(resolve => setTimeout(resolve, 500));
       // FIX: Add defensive check
       if (typeof onClose === 'function') {
         onClose(lobby.status);
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

  // Lobby Full Popup (can show even when lobby is null)
  if (showLobbyFullPopup) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
          <div className="w-16 h-16 bg-[var(--amber-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">Lobby is Full!</h3>
          <p className="text-[var(--muted-foreground)] text-center mb-4 text-sm">
            This ride already has {fullLobbyInfo?.maxSeats} passengers. No more seats available.
          </p>
          <div className="bg-[var(--muted)] rounded-xl p-3 mb-6">
            <p className="text-sm text-[var(--muted-foreground)] text-center">
              A new lobby will be created for you instead.
            </p>
          </div>
          <button
            onClick={() => {
              setShowLobbyFullPopup(false);
              setFullLobbyInfo(null);
            }}
            className="w-full py-3 bg-[var(--primary)] text-white font-bold rounded-xl active:scale-95 transition-transform"
          >
            OK
          </button>
        </div>
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
   * Raised to z-[2100]: this screen's sheet and minimized icon are z-[2000],
   * above the components' own defaults (1600/1700), so without the override the
   * head would paint behind them and be untappable. Dialogs (terminal 2200,
   * status popup 2300, rating 2400) still cover it, and the leave-confirm
   * dialog ties it at 2100 while rendering later in the DOM, so paint order
   * keeps that one on top.
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
        zIndexClass="z-[2100]"
      />

      {/* Floating chat head -- the same component the driver's ride screen uses.
          Hidden while the overlay is open so two heads never stack. */}
      {lobby.driver_id && lobby.status === 'driver_found' && terminalStatus === null && !lobbyChatPopup && (
        <FloatingChatHead
          headId={driverChatId.current || undefined}
          zIndexClass="z-[2100]"
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
  if (isMinimized) {
    return (
      <>
        {chatLayer}
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

  const passengers = lobby.passengers_json || [];
  const isTerminal = terminalStatus !== null;

  // The lobby stores the trip total it was created with (computed from the
  // creator's terminal fare). Prefer that over the prop so everyone in the
  // lobby — including a passenger who joined an existing lobby or reopened it
  // later — sees the same, correct fare instead of their own re-estimate.
  const lobbyTripTotal =
    lobby && Number(lobby.price_per_seat) > 0 ? Number(lobby.price_per_seat) : pricePerSeat;
  const perSeatFare = lobbyTripTotal / Math.max(1, passengers.length);

  /*
   * Drop-off order: the destination closest to the pickup is reached first.
   *
   * Measured from the trip's own pickup, because the sequence of stops is a fact
   * about the route, not about who joined when. A passenger whose destination has
   * no coordinates keeps their join position and sorts after the ones that do, so
   * a missing pin never pushes a known stop down the list.
   */
  const dropoffOrder = passengers
    .map((passenger, index) => {
      const lat = passenger.dropoffLat;
      const lng = passenger.dropoffLng;
      const distance =
        pickupCoords && Number.isFinite(lat) && Number.isFinite(lng)
          ? haversineDistanceMeters(pickupCoords, { lat: Number(lat), lng: Number(lng) })
          : null;
      return { passenger, index, distance };
    })
    .sort((a, b) => {
      if (a.distance == null && b.distance == null) return a.index - b.index;
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });

  // Full lobby view
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
        <div className="bg-surface w-full rounded-t-3xl max-h-[92vh] overflow-hidden flex flex-col animate-slide-up">
          {/* Header - Gradient */}
          <div className="bg-[var(--primary)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
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
                <button
                  onClick={() => setIsMinimized(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-white" />
                </button>
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
                  <p className="font-bold text-sm text-[var(--ink)] truncate">{lobby.dropoff_location}</p>
                </div>
                {etaToDestination && (
                  <div className="flex-shrink-0 bg-[var(--error-soft)] text-[var(--error)] px-2 py-1 rounded-lg">
                    <p className="text-[10px] font-bold">🏁 {etaToDestination}</p>
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
                <span className="text-xs font-bold text-[var(--primary)] bg-[var(--primary-soft)] px-2.5 py-1 rounded-full">
                  {passengers.length}/{lobby.max_seats}
                </span>
              </div>

              {/* Passenger Cards */}
              <div className="space-y-2">
                {passengers.map((passenger, index) => {
                  const isCurrentUserOrCompanion =
                    passenger.id === user?.id || 
                    passenger.id.startsWith(`${user?.id}_companion_`);
                  
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
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-[var(--ink)] truncate">{passenger.name}</p>
                            {passenger.id === user?.id && (
                              <Badge variant="outline" className="border-[var(--primary)] text-[var(--primary)] text-[10px]">
                                YOU
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              Drop-off: {passenger.dropoff || passenger.dropoffAddress || lobby.dropoff_location}
                            </span>
                          </p>
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            Joined {new Date(passenger.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {index === 0 && (
                          <Badge className="bg-[var(--violet)] text-white text-[10px]">
                            HOST
                          </Badge>
                        )}
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

              {/* Drop-off order — every passenger's stop, soonest first, with the
                  first one called out so the group knows whose stop is next. */}
              {passengers.length > 0 && (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                    Drop-off order
                  </p>
                  <div className="space-y-1.5">
                    {dropoffOrder.map((entry, order) => (
                      <div key={entry.passenger.id} className="flex items-center gap-2">
                        <span
                          className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                            order === 0 ? 'bg-[var(--primary)] text-white' : 'bg-[var(--border)] text-[var(--ink)]'
                          }`}
                        >
                          {order + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--ink)]">
                          {entry.passenger.id === user?.id ? 'You' : entry.passenger.name}
                        </span>
                        <span className="max-w-[45%] truncate text-right text-[10px] text-[var(--muted-foreground)]">
                          {entry.passenger.dropoff || entry.passenger.dropoffAddress || lobby.dropoff_location}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-[var(--primary)]">
                    Drop off first:{' '}
                    {dropoffOrder[0]?.passenger.id === user?.id ? 'You' : dropoffOrder[0]?.passenger.name}
                  </p>
                </div>
              )}
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
                      />
                    ) : (
                      <span className="text-lg font-bold text-white">
                        {(lobby.driver_name || 'D').trim().charAt(0).toUpperCase()}
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
                          <span className="text-[var(--amber)] text-xs">⭐</span>
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

            {/* Live Tracking Map */}
            {lobby.status === 'driver_found' && isMapsLoaded && driverLocation && (
              <div className="rounded-xl overflow-hidden mb-3 border border-[var(--border)] shadow-sm">
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '240px' }}
                  center={driverLocation}
                  zoom={15}
                  options={{
                    zoomControl: false,
                    fullscreenControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    gestureHandling: 'none',
                  }}
                >
                  {/* Driver marker (tricycle icon) */}
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
                  {/* Pickup marker */}
                  {pickupCoords && (
                    <MarkerF
                      position={pickupCoords}
                      title="Pickup"
                      icon={{
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--info)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'
                        ),
                        scaledSize: new (window as any).google.maps.Size(32, 32),
                        anchor: new (window as any).google.maps.Point(16, 32),
                      }}
                    />
                  )}
                  {/* Dropoff marker */}
                  {dropoffCoords && (
                    <MarkerF
                      position={dropoffCoords}
                      title="Drop-off"
                      icon={{
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                        ),
                        scaledSize: new (window as any).google.maps.Size(32, 32),
                        anchor: new (window as any).google.maps.Point(16, 32),
                      }}
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
                    <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-[var(--ink)]">
                      {(lobby.driver_status === 'on-the-way' || lobby.driver_status === 'arrived') ? 'Heading to pickup' : 'On the way to destination'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-[var(--muted-foreground)]" />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[var(--muted-foreground)] font-bold tracking-wider">Your Fare</p>
                <p className="text-2xl font-bold text-[var(--primary)]">₱{perSeatFare.toFixed(2)}</p>
                {passengers.length > 1 && (
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    ₱{lobbyTripTotal} ÷ {passengers.length} passengers
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-[var(--muted-foreground)] font-bold tracking-wider">Trip Total</p>
                <p className="text-lg font-bold text-[var(--ink)]">₱{lobbyTripTotal}</p>
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
          <Card className="bg-surface p-6 max-w-sm w-full text-center shadow-2xl border-2 border-[var(--success-soft)]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--success-soft)] flex items-center justify-center text-3xl">
              {terminalStatus === 'completed' ? '🎉' : '🛑'}
            </div>
            <h3 className="text-xl font-bold text-[var(--ink)] mb-2">
              {terminalStatus === 'completed' ? 'Ride Completed' : 'Ride Cancelled'}
            </h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              {terminalStatus === 'completed'
                ? 'Your driver has completed the ride. Thank you for using TrikeServe!'
                : terminalCancelMessage || 'This ride has been cancelled. Returning you to the customer screen...'}
            </p>
            {terminalStatus === 'completed' && lobby.driver_id && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={openRatingModal}
                  className="w-full bg-surface border-2 border-[var(--primary)] text-[var(--primary)] py-3 font-bold"
                >
                  ⭐ Leave a Rating
                </Button>
                <Button
                  onClick={() => {
                    if (typeof onClose === 'function') onClose(terminalStatus || undefined);
                  }}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold"
                >
                  Done
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Leave a Rating Modal */}
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
                  onClick={closeAfterRating}
                  className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white py-3 font-bold"
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[var(--ink)] mb-2">Rate Your Driver</h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-6">
                  How was your ride with {lobby.driver_name || 'your driver'}?
                </p>
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

      {/* Chat layer (floating head + overlay). Defined once above the minimized
          branch so the head stays on screen in both views. */}
      {chatLayer}

      {/* Driver Status Update Popup (same as private rides) */}
      {driverStatusPopup && (
        <div
          className="fixed inset-0 bg-black/50 z-[2300] flex items-end"
          onClick={() => setDriverStatusPopup(null)}
        >
          <div className="bg-surface w-full rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
            <div className="max-w-sm mx-auto">
              {/* Status Icon */}
              <div className="w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                {driverStatusPopup.status === 'on-the-way' && '🚗'}
                {driverStatusPopup.status === 'arrived' && '📍'}
                {driverStatusPopup.status === 'pickup' && '🚀'}
                {driverStatusPopup.status === 'drop-off' && '🏁'}
                {driverStatusPopup.status === 'payment' && '💰'}
                {driverStatusPopup.status === 'completed' && '🎉'}
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
            <h3 className="text-lg font-bold text-[var(--ink)] mb-2">Cancel Ride?</h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              Are you sure you want to cancel this ride? You'll need to find a new ride.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1"
              >
                CANCEL
              </Button>
              <Button
                onClick={handleLeaveLobby}
                className="flex-1 bg-[var(--error)] hover:bg-[var(--error)] text-white"
              >
                CANCEL RIDE
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
