import { useState, useEffect, useRef } from "react";
import { MapPin, Users, Clock, X, ChevronDown, MessageCircle, User, Minimize2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

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
  status: 'waiting' | 'driver_found' | 'in_progress' | 'completed' | 'cancelled';
  driver_name?: string;
  driver_plate?: string;
  driver_rating?: string;
  created_at: string;
}

interface ShareRideLobbyProps {
  lobbyId?: string;
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  passengerCount?: number;
  pricePerSeat?: number;
  onDriverFound: (lobbyId: string) => void;
  onClose: () => void;
}

export default function ShareRideLobby({
  lobbyId,
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  passengerCount = 1,
  pricePerSeat = 15,
  onDriverFound,
  onClose
}: ShareRideLobbyProps) {
  const { user } = useAuth();
  const [lobby, setLobby] = useState<ShareRideLobby | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<'completed' | 'cancelled' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasHandledTerminalLobbyStatus = useRef(false);
  const terminalCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTerminalLobbyStatus = (status?: string) => {
    if (hasHandledTerminalLobbyStatus.current) return;

    if (status === 'completed' || status === 'cancelled') {
      hasHandledTerminalLobbyStatus.current = true;
      setIsMinimized(false);
      setTerminalStatus(status);

      if (terminalCloseTimeoutRef.current) {
        clearTimeout(terminalCloseTimeoutRef.current);
      }

      terminalCloseTimeoutRef.current = setTimeout(() => {
        if (typeof onClose === 'function') {
          onClose();
        }
      }, 1600);
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
            handleTerminalLobbyStatus(existingLobby.status);

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
          .filter((l: any) => l.pickup_address === pickupAddress && l.dropoff_address === dropoffAddress)
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

      // Try to find matching lobby with same dropoff
      const { data: matchingLobby, error: matchError } = await supabaseHelpers.getAvailableLobbyByRoute(
        pickupAddress,
        dropoffAddress
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
        passengers_json: passengers,
        max_seats: 3,
        price_per_seat: pricePerSeat,
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
         onClose();
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
        <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
          {/* Header */}
          <div className="p-5 border-b border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#FFF1F2] rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#E11D48]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#121212]">Share Ride Lobby</h2>
                  <p className="text-xs text-[#64748B]">Waiting: {getWaitingTime()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-[#64748B]" />
                </button>
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
                >
                  <X className="w-5 h-5 text-[#64748B]" />
                </button>
              </div>
            </div>

            <Badge className={
              lobby.status === 'driver_found'
                ? 'bg-green-500 text-white'
                : 'bg-yellow-500 text-white'
            }>
              {lobby.status === 'driver_found' ? '✓ Driver Found!' : '🔍 Finding Driver...'}
            </Badge>
          </div>

          {/* Route Info */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#FFF1F2] to-[#FFF7ED] border-b border-[#E2E8F0]">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#121212] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Pickup</p>
                  <p className="font-bold text-[#121212]">{lobby.pickup_location}</p>
                  <p className="text-xs text-[#64748B]">{lobby.pickup_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Drop-off</p>
                  <p className="font-bold text-[#121212]">{lobby.dropoff_location}</p>
                  <p className="text-xs text-[#64748B]">{lobby.dropoff_address}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Passengers Section */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#64748B] uppercase tracking-wide">Passengers</h3>
                <span className="text-sm font-bold text-[#E11D48]">
                  {passengers.length}/{lobby.max_seats} Seats
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
              <Card className="p-4 border-2 border-green-500 bg-green-50 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-green-200 flex items-center justify-center text-3xl">
                    👨‍✈️
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-0.5">Your Driver</p>
                    <p className="font-bold text-[#121212] text-lg">{lobby.driver_name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#64748B]">{lobby.driver_plate}</span>
                      {lobby.driver_rating && (
                        <>
                          <span className="text-[#64748B]">•</span>
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500">⭐</span>
                            <span className="text-xs font-semibold text-[#121212]">{lobby.driver_rating}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    className="bg-green-500 hover:bg-green-600 text-white"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </Button>
                </div>
              </Card>
            )}

            {/* Waiting Animation */}
            {lobby.status === 'waiting' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <span className="text-4xl">🔍</span>
                </div>
                <p className="text-sm text-[#64748B] mb-1">
                  {passengers.length < lobby.max_seats
                    ? 'Waiting for more passengers...'
                    : 'Finding the best driver for you...'}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  The more passengers, the faster we find a driver!
                </p>
              </div>
            )}
          </div>

          {/* Footer - Price Info */}
          <div className="p-5 border-t border-[#E2E8F0] bg-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-[#64748B]">Your Fare</p>
                <p className="text-3xl font-bold text-[#E11D48]">₱{(pricePerSeat / Math.max(1, passengers.length)).toFixed(2)}</p>
                {passengers.length > 1 && (
                  <p className="text-xs text-[#94A3B8]">
                    ₱{pricePerSeat} ÷ {passengers.length} passengers
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-[#64748B]">Total Trip Cost</p>
                <p className="text-xl font-bold text-[#121212]">
                  ₱{pricePerSeat}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  {passengers.length} × ₱{(pricePerSeat / Math.max(1, passengers.length)).toFixed(2)}
                </p>
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
            <p className="text-sm text-[#64748B]">
              {terminalStatus === 'completed'
                ? 'Your driver has completed the ride. Returning you to the customer screen...'
                : 'This ride has been cancelled. Returning you to the customer screen...'}
            </p>
          </Card>
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