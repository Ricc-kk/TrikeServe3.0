import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { MapPin, Users, Clock, X, ChevronDown, MessageCircle, User, Minimize2, Star, Navigation } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers, isSimilarRoute } from "@/lib/supabase";
import { GoogleMap, MarkerF, Polyline } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png'

interface LobbyPassenger {
  id: string;
  name: string;
  emoji: string;
  joinedAt: string;
  pickup: string;  // Individual pickup location
  pickupAddress: string;  // Individual pickup address
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
  paymentMethod?: 'COD' | 'GCASH';
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
  paymentMethod = 'GCASH',
  selectedTerminalId,
  onDriverFound,
  onLobbyLoaded,
  onClose
}: ShareRideLobbyProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);
  const [lobby, setLobby] = useState<ShareRideLobby | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<'completed' | 'cancelled' | null>(null);
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
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverRoutePath, setDriverRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const [etaToDestination, setEtaToDestination] = useState<string | null>(null);
  const [destinationRoutePath, setDestinationRoutePath] = useState<Array<{ lat: number; lng: number }>>([]);
  const driverLocationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleOpenDriverChat = async () => {
    if (!user?.id || !lobby?.driver_id || openingChat) return;
    setOpeningChat(true);
    try {
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
        alert('Failed to open chat. Please try again.');
        return;
      }
      navigate(`/customer/messages/thread/${data.id}`);
    } finally {
      setOpeningChat(false);
    }
  };

  const handleTerminalLobbyStatus = (status?: string) => {
    if (hasHandledTerminalLobbyStatus.current) return;

    if (status === 'completed' || status === 'cancelled') {
      hasHandledTerminalLobbyStatus.current = true;
      setIsMinimized(false);
      setTerminalStatus(status);

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
        }, 1600);
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

      if (normalizedStatus === 'payment' || normalizedStatus === 'awaiting-payment') {
        if (driverStatusTimerRef.current) clearTimeout(driverStatusTimerRef.current);
        driverStatusTimerRef.current = setTimeout(() => setDriverStatusPopup(null), 4000);
      }
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
            handleTerminalLobbyStatus(existingLobby.status);

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

                    handleTerminalLobbyStatus(freshLobby.status);

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

                handleTerminalLobbyStatus(latestLobby.status);

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
      // First, check if user is already in a waiting lobby
      const { data: userLobbies, error: userError } = await supabaseHelpers.getAvailableLobbies();
      if (!userError && userLobbies) {
        const userLobbyCandidates = userLobbies.filter((l: any) => {
          const passengers = Array.isArray(l.passengers_json) ? l.passengers_json : [];
          return passengers.some((p: any) => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
        });

        const routeMatchedLobby = userLobbyCandidates
          .filter((l: any) => isSimilarRoute(l, pickup, dropoff, pickupAddress, dropoffAddress))
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
        dropoff
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
            joinedAt: new Date().toISOString(),
            pickup,
            pickupAddress
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
              pickupAddress
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
        }
      }

      // No matching lobby found, create a new one
      const mainPassenger: LobbyPassenger = {
        id: user?.id || `user_${Date.now()}`,
        name: user?.name || 'Customer',
        emoji: getRandomEmoji(),
        joinedAt: new Date().toISOString(),
        pickup,
        pickupAddress
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
          pickupAddress
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

  const getWaitingTime = () => {
    if (!lobby) return '0s';
    const elapsed = Date.now() - new Date(lobby.created_at).getTime();
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[#E11D48] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[#64748B]">Creating lobby...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <Card className="bg-white p-6 max-w-sm w-full">
          <h3 className="text-lg font-bold text-red-600 mb-2">Error</h3>
          <p className="text-sm text-[#64748B] mb-6">{error}</p>
          <Button onClick={onClose} className="w-full bg-red-500 hover:bg-red-600">
            Close
          </Button>
        </Card>
      </div>
    );
  }

  if (!lobby) return null;

  // Minimized floating icon
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-24 right-4 z-[2000] shadow-2xl"
      >
        <div className="relative">
          <div className="w-16 h-16 bg-[#E11D48] rounded-full flex items-center justify-center hover:bg-[#BE123C] transition-all hover:scale-110">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-white rounded-full border-2 border-[#E11D48] flex items-center justify-center">
            <span className="text-xs font-bold text-[#E11D48]">
              {(lobby.passengers_json || []).length}/{lobby.max_seats}
            </span>
          </div>
          <div className="absolute inset-0 bg-[#E11D48] rounded-full animate-ping opacity-20"></div>
        </div>
      </button>
    );
  }

  const passengers = lobby.passengers_json || [];
  const isTerminal = terminalStatus !== null;

  // Full lobby view
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
        <div className="bg-white w-full rounded-t-3xl max-h-[92vh] overflow-hidden flex flex-col animate-slide-up">
          {/* Header - Gradient */}
          <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Share Ride</h2>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${lobby.status === 'driver_found' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
                    <p className="text-xs text-white/80">
                      {lobby.status === 'driver_found' ? 'Driver Found!' : `Finding driver... ${getWaitingTime()}`}
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
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Route Info - clean design */}
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <div className="flex items-stretch gap-3">
              {/* Route dots & line */}
              <div className="flex flex-col items-center justify-center gap-0.5 w-4 flex-shrink-0">
                <div className="w-3 h-3 rounded-full bg-[#121212] border-2 border-white shadow-sm" />
                <div className="w-0.5 flex-1 bg-gradient-to-b from-[#121212] to-[#E11D48] rounded-full" />
                <div className="w-3 h-3 rounded-full bg-[#E11D48] border-2 border-white shadow-sm" />
              </div>
              {/* Addresses */}
              <div className="flex-1 space-y-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Pickup</p>
                  <p className="font-bold text-sm text-[#121212] truncate">{lobby.pickup_location}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Drop-off</p>
                  <p className="font-bold text-sm text-[#121212] truncate">{lobby.dropoff_location}</p>
                </div>
                {etaToDestination && (
                  <div className="flex-shrink-0 bg-red-100 text-red-700 px-2 py-1 rounded-lg">
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
                <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wide">Passengers</h3>
                <span className="text-xs font-bold text-[#E11D48] bg-[#FFF1F2] px-2.5 py-1 rounded-full">
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
                          ? 'border-[#E11D48] bg-[#FFF1F2]' 
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center text-2xl">
                          {passenger.emoji || '👤'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-[#121212]">{passenger.name}</p>
                            {passenger.id === user?.id && (
                              <Badge variant="outline" className="border-[#E11D48] text-[#E11D48] text-[10px]">
                                YOU
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-[#64748B]">
                            Joined {new Date(passenger.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {index === 0 && (
                          <Badge className="bg-purple-500 text-white text-[10px]">
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
                    className="p-4 border-2 border-dashed border-[#E2E8F0] bg-[#F8F9FA]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                        <Users className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-[#94A3B8] italic">Waiting for passenger...</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Driver Info (when found) */}
            {lobby.status === 'driver_found' && lobby.driver_name && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl p-3.5 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">👨‍✈️</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Your Driver</p>
                    <p className="font-bold text-[#121212] truncate">{lobby.driver_name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#64748B]">{lobby.driver_plate}</span>
                      {(computedDriverRating || lobby.driver_rating) && (
                        <span className="flex items-center gap-0.5">
                          <span className="text-yellow-500 text-xs">⭐</span>
                          <span className="text-xs font-semibold text-[#121212]">{computedDriverRating || lobby.driver_rating}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="bg-green-500 hover:bg-green-600 text-white h-10 w-10"
                    onClick={handleOpenDriverChat}
                    disabled={openingChat}
                  >
                    <MessageCircle className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Live Tracking Map */}
            {lobby.status === 'driver_found' && isMapsLoaded && driverLocation && (
              <div className="rounded-xl overflow-hidden mb-3 border border-[#E2E8F0] shadow-sm">
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
                          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3B82F6" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><circle cx="12" cy="8.6" r="2.3" fill="#FFFFFF" stroke="none"/></svg>'
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
                          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E11D48" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/><path d="M7.8 9.6l2.1 2.1 4.3-4.3" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
                        strokeColor: (lobby.driver_status === 'on-the-way' || lobby.driver_status === 'arrived') ? '#10B981' : '#3B82F6',
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
                        strokeColor: '#E11D48',
                        strokeOpacity: 0.9,
                        strokeWeight: 5,
                        geodesic: true,
                      }}
                    />
                  )}
                </GoogleMap>
                {/* Driver status indicator */}
                <div className="px-3 py-2 bg-white border-t border-[#E2E8F0] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-[#121212]">
                      {(lobby.driver_status === 'on-the-way' || lobby.driver_status === 'arrived') ? 'Heading to pickup' : 'On the way to destination'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-[#94A3B8]" />
                    <span className="text-[10px] text-[#94A3B8]">
                      {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting Animation */}
            {lobby.status === 'waiting' && (
              <div className="text-center py-5">
                <div className="w-14 h-14 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <span className="text-3xl">🔍</span>
                </div>
                <p className="text-sm font-semibold text-[#121212] mb-1">
                  {passengers.length < lobby.max_seats
                    ? 'Waiting for more passengers...'
                    : 'Finding the best driver for you...'}
                </p>
                <p className="text-xs text-[#64748B]">
                  More passengers = faster pickup!
                </p>
              </div>
            )}
          </div>

          {/* Footer - Price Info */}
          <div className="p-4 border-t border-[#E2E8F0] bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Your Fare</p>
                <p className="text-2xl font-bold text-[#E11D48]">₱{(pricePerSeat / Math.max(1, passengers.length)).toFixed(2)}</p>
                {passengers.length > 1 && (
                  <p className="text-[10px] text-[#94A3B8]">
                    ₱{pricePerSeat} ÷ {passengers.length} passengers
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">Trip Total</p>
                <p className="text-lg font-bold text-[#121212]">₱{pricePerSeat}</p>
              </div>
            </div>

            {passengers.length === lobby.max_seats && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-sm text-green-700 font-semibold">
                  🎉 Lobby Full! Prioritizing your ride request...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isTerminal && (
        <div className="fixed inset-0 bg-black/60 z-[2200] flex items-center justify-center p-4">
          <Card className="bg-white p-6 max-w-sm w-full text-center shadow-2xl border-2 border-green-200">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-3xl">
              {terminalStatus === 'completed' ? '🎉' : '🛑'}
            </div>
            <h3 className="text-xl font-bold text-[#121212] mb-2">
              {terminalStatus === 'completed' ? 'Ride Completed' : 'Ride Cancelled'}
            </h3>
            <p className="text-sm text-[#64748B] mb-6">
              {terminalStatus === 'completed'
                ? 'Your driver has completed the ride. Thank you for using TrikeServe!'
                : 'This ride has been cancelled. Returning you to the customer screen...'}
            </p>
            {terminalStatus === 'completed' && lobby.driver_id && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={openRatingModal}
                  className="w-full bg-white border-2 border-[#E11D48] text-[#E11D48] py-3 font-bold"
                >
                  ⭐ Leave a Rating
                </Button>
                <Button
                  onClick={() => {
                    if (typeof onClose === 'function') onClose(terminalStatus || undefined);
                  }}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 font-bold"
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
          <Card className="bg-white p-6 max-w-sm w-full text-center">
            {ratingSubmitted ? (
              <>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-3xl">
                  🙏
                </div>
                <h3 className="text-xl font-bold text-[#121212] mb-2">Thank you!</h3>
                <p className="text-sm text-[#64748B] mb-6">Your rating has been submitted.</p>
                <Button
                  onClick={closeAfterRating}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 font-bold"
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-[#121212] mb-2">Rate Your Driver</h3>
                <p className="text-sm text-[#64748B] mb-6">
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
                            ? 'fill-[#FFC107] text-[#FFC107]'
                            : 'fill-[#E2E8F0] text-[#E2E8F0]'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <Button
                  onClick={handleSubmitRating}
                  disabled={!selectedRating || ratingSubmitting}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-3 font-bold disabled:opacity-50"
                >
                  {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                </Button>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Driver Status Update Popup (same as private rides) */}
      {driverStatusPopup && (
        <div className="fixed inset-0 bg-black/50 z-[2300] flex items-end">
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

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[2100] flex items-center justify-center p-4">
          <Card className="bg-white p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[#121212] mb-2">Cancel Ride?</h3>
            <p className="text-sm text-[#64748B] mb-6">
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
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
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