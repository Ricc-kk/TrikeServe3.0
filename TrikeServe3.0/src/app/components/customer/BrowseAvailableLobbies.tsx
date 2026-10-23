import { useState, useEffect, useCallback } from "react";
import { MapPin, Users, Clock, X, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import {
  supabaseHelpers,
  isSimilarRoute,
  isPointWithinAnyTerminalBorder,
  isPointWithinAnyTerminalRoute,
  isPointWithinTerminalRoute,
  normalizeBoundaryRoad,
  geocodeAddress,
} from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { computeSharedRideFarePerPassenger, straightLineKm, type RideRates } from "@/lib/pricing";
import { useDevModeOverride } from "../../hooks/useDevModeSettings";

interface AvailableLobby {
  id: string;
  pickup_location: string;
  pickup_address: string;
  dropoff_location: string;
  dropoff_address: string;
  dropoff_lat?: number | string | null;
  dropoff_lng?: number | string | null;
  passengers_json?: Array<{
    id: string;
    name: string;
    emoji: string;
    avatar?: string;
    dropoff?: string;
    dropoffAddress?: string;
    fare?: number;
  }>;
  max_seats: number;
  price_per_seat: number;
  terminal_id?: string | null;
  status: 'waiting' | 'driver_found' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

interface BrowseAvailableLobbiesProps {
  /** Short display name for the pickup -- for a terminal ride, the terminal's name. */
  pickup: string;
  /** Full/geocoded pickup address, when the customer typed one. */
  pickupAddress: string;
  /**
   * Where the joining customer currently is. The border gate is checked against
   * this, so without it a join cannot be validated.
   */
  pickupCoords?: { lat: number; lng: number } | null;
  /** Terminal the pickup came from, when it came from the terminal picker. */
  terminalId?: string | null;
  /** The selected terminal service road, used to match different drop-offs on one route. */
  routePoints?: Array<{ lat: number; lng: number }> | null;
  routeWidthM?: number | null;
  /** The joining customer's own drop-off, recorded on their lobby passenger. */
  dropoff: string;
  dropoffAddress: string;
  dropoffCoords?: { lat: number; lng: number } | null;
  rates: Pick<RideRates, "baseFare" | "baseFareIncludedKm" | "perKm">;
  onLobbyJoined: (lobbyId: string) => void;
  onClose: () => void;
}

/**
 * A lobby passenger's avatar.
 *
 * The stored value is a profile photo URL or an emoji placeholder; a URL must
 * render as an image, while anything else is the emoji it looks like.
 */
function PassengerAvatar({ value }: { value?: string }) {
  const src = (value || '👤').trim();
  const isImage = /^https?:\/\//i.test(src) || src.startsWith('data:image/');
  if (!isImage) return <span>{src}</span>;
  return <img src={src} alt="" className="size-full object-cover" />;
}

export default function BrowseAvailableLobbies({
  pickup,
  pickupAddress,
  pickupCoords,
  terminalId,
  routePoints,
  routeWidthM,
  dropoff,
  dropoffAddress,
  dropoffCoords,
  rates,
  onLobbyJoined,
  onClose
}: BrowseAvailableLobbiesProps) {
  const { user } = useAuth();
  const [enforceBoundary] = useDevModeOverride("enforceBoundary");
  const [sameRouteLobbyFilter] = useDevModeOverride("sameRouteLobbyFilter");
  const [lobbies, setLobbies] = useState<AvailableLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null);
  const [joiningLobby, setJoiningLobby] = useState(false);
  const joiningDistanceKm = straightLineKm(pickupCoords, dropoffCoords);
  const joiningFare = computeSharedRideFarePerPassenger(rates, joiningDistanceKm);
  const joiningFareHasDistance = joiningDistanceKm != null;

  // Match the selected pickup and drop-off. A terminal can have several
  // destinations, and terminal IDs only identify the pickup side of a trip.
  const routeMatches = useCallback((lobby: AvailableLobby) => {
    if (!sameRouteLobbyFilter) return true;
    // Treat a stored terminal ID as authoritative when both sides have one;
    // older lobbies without one fall back to normalized place matching.
    if (terminalId && lobby.terminal_id && lobby.terminal_id !== terminalId) return false;

    return isSimilarRoute(lobby, pickup, dropoff, pickupAddress, dropoffAddress, terminalId, {
      dropoffCoords,
      routePoints,
      routeWidthM,
    });
  }, [sameRouteLobbyFilter, terminalId, pickup, pickupAddress, dropoff, dropoffAddress, dropoffCoords, routePoints, routeWidthM]);

  // Fetch available lobbies on mount
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        setLoading(true);
        // Fetch waiting lobbies (fuzzy route matching happens below)
        const { data, error: fetchError } = await supabaseHelpers.getAvailableLobbies();

        if (fetchError) {
          setError('Failed to load available lobbies');
          console.error('Error fetching lobbies:', fetchError);
          return;
        }

        if (data) {
          // Filter out lobbies where user is already a passenger
          const availableLobbies = (data as AvailableLobby[]).filter(lobby => {
            const passengers = lobby.passengers_json || [];
            return routeMatches(lobby) &&
              !passengers.some(p => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
          });

          setLobbies(availableLobbies);
        }
      } catch (err) {
        console.error('Error fetching lobbies:', err);
        setError('Error loading lobbies');
      } finally {
        setLoading(false);
      }
    };

    fetchLobbies();

    // Set up real-time subscription for new lobbies
    const channel = supabase
      .channel('public:shared_ride_lobbies')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_ride_lobbies'
        },
        (payload) => {
          const matchesRoute = routeMatches(payload.new);

          if (payload.eventType === 'INSERT' && payload.new.status === 'waiting' && matchesRoute) {
            console.log('➕ NEW LOBBY CREATED:', payload.new.id);
            setLobbies(prev => [...prev, payload.new as AvailableLobby]);
          } else if (payload.eventType === 'UPDATE') {
            console.log('🔄 LOBBY UPDATED:', payload.new.id, 'Passengers:', (payload.new.passengers_json || []).length);
            setLobbies(prev =>
              prev.map(l => l.id === payload.new.id ? payload.new as AvailableLobby : l)
                .filter(l => l.status === 'waiting')
                .filter(routeMatches)
            );
          }
        }
      )
      .subscribe();

    // Add polling to ensure lobbies are always up-to-date (every 2 seconds)
    const pollInterval = setInterval(async () => {
      try {
        const { data, error: fetchError } = await supabaseHelpers.getAvailableLobbies();

        if (!fetchError && data) {
          const availableLobbies = (data as AvailableLobby[]).filter(lobby => {
            const passengers = lobby.passengers_json || [];
            return routeMatches(lobby) &&
              !passengers.some(p => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
          });

          setLobbies(availableLobbies);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [routeMatches, user?.id]);

  const handleJoinLobby = async (lobbyId: string) => {
    if (!user) {
      setError('You must be logged in to join a lobby');
      return;
    }

    try {
      setJoiningLobby(true);

      // Get the current lobby
      const { data: lobby, error: fetchError } = await supabaseHelpers.getLobbyById(lobbyId);

      if (fetchError || !lobby) {
        setError('Lobby not found');
        return;
      }

      const joinedDropoffAddress = dropoffAddress || dropoff;

      if (!routeMatches(lobby)) {
        setError('This lobby does not match your selected pickup and drop-off. Refresh the list and choose a matching lobby.');
        return;
      }

      /*
       * Joining is a booking like any other, so it has to clear the same two
       * gates as booking from the home screen -- otherwise the shared-rides
       * browser is a way straight past them: pick any waiting lobby, join, done.
       * This path was completely unchecked.
       *
       *   1. BORDER -- the joiner must be standing inside a terminal's area.
       *   2. ROUTE  -- the drop-off must sit on a terminal's road corridor.
       *
       * Resolve the destination before testing, because a text-only drop-off has
       * no coordinates and "no coordinates" must never read as "allowed".
       */
      let coords = dropoffCoords;
      if (!coords && joinedDropoffAddress) {
        coords = (await geocodeAddress(joinedDropoffAddress)) ?? null;
      }

      if (!coords || !pickupCoords) {
        setError("We couldn't locate your pickup and drop-off. Tap them on the map or enter more complete addresses.");
        return;
      }

      if (enforceBoundary) {
        const border = await isPointWithinAnyTerminalBorder(pickupCoords.lat, pickupCoords.lng);
        if (border.lookupFailed) {
          setError("We couldn't verify terminal boundaries. Check your connection and try again.");
          return;
        }
        if (!border.allowed) {
          console.log('🚫 Lobby join pickup outside every terminal border:', pickupCoords);
          setError("You're not at a terminal. Rides can only be booked from inside a terminal.");
          return;
        }

        let routeAllowed = false;
        let routeName = pickup || 'selected terminal';
        if (terminalId) {
          const { data: terminal, error: terminalError } = await supabaseHelpers.getTerminalGeofence(terminalId);
          if (terminalError || !terminal) {
            setError("We couldn't verify the selected terminal route. Check your connection and try again.");
            return;
          }

          routeName = terminal.name || routeName;
          routeAllowed = isPointWithinTerminalRoute(coords.lat, coords.lng, {
            road: normalizeBoundaryRoad(terminal.boundary_polygon),
            widthM: terminal.road_width_m,
          });
        } else {
          const route = await isPointWithinAnyTerminalRoute(coords.lat, coords.lng);
          if (route.lookupFailed) {
            setError("We couldn't verify terminal boundaries. Check your connection and try again.");
            return;
          }
          routeAllowed = route.allowed;
        }

        if (!routeAllowed) {
          console.log('🚫 Lobby join drop-off is outside the selected terminal route:', coords, terminalId);
          setError(`Your drop-off must be within the ${routeName} route to join this lobby.`);
          return;
        }
      }

      // Create passenger object. The joiner's own profile and destination ride
      // with them, so the lobby can show who is in it and where each person gets
      // off -- not just the lobby creator's details.
      const passenger = {
        id: user.id,
        name: user.name || 'Customer',
        emoji: '👤',
        avatar: user.avatarUrl || undefined,
        joinedAt: new Date().toISOString(),
        pickup: lobby.pickup_location,
        pickupAddress: lobby.pickup_address,
        dropoff: dropoff || lobby.dropoff_location,
        dropoffAddress: joinedDropoffAddress,
        dropoffLat: coords.lat,
        dropoffLng: coords.lng,
        fare: computeSharedRideFarePerPassenger(rates, straightLineKm(pickupCoords, coords)),
      };

      // Join the lobby
      const { data: updatedLobby, error: joinError } = await supabaseHelpers.joinShareRideLobby(
        lobbyId,
        passenger
      );

      if (joinError) {
        setError(joinError.message || 'Could not join lobby');
        return;
      }

      if (updatedLobby) {
        console.log('✅ Successfully joined lobby:', updatedLobby.id);
        // Notify parent component
        onLobbyJoined(updatedLobby.id);
        // Close the browse dialog
        onClose();
      }
    } catch (err) {
      console.error('Error joining lobby:', err);
      setError('Error joining lobby');
    } finally {
      setJoiningLobby(false);
    }
  };

  const getTimeWaiting = (createdAt: string) => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    return `${minutes} mins ago`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <Card className="bg-surface p-8 w-full max-w-md text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[var(--muted-foreground)]">Loading available lobbies...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <Card className="bg-surface p-6 w-full max-w-md">
          <h3 className="text-lg font-bold text-[var(--error)] mb-2">Error</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">{error}</p>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
      <div className="bg-surface w-full rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--primary-soft)] rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--ink)]">Available Lobbies</h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {pickup || 'Selected pickup'} → {dropoff || 'selected drop-off'}
              </p>
            </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--muted)] hover:bg-[var(--border)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Lobbies List */}
        <div className="flex-1 overflow-y-auto p-5">
          {lobbies.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8 text-[var(--primary)]" />
              </div>
              <p className="text-lg font-semibold text-[var(--ink)] mb-1">No lobbies available</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Nobody else is waiting on this route right now. Be the
                first to start a lobby.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {lobbies.map(lobby => {
                const passengers = lobby.passengers_json || [];
                const availableSeats = lobby.max_seats - passengers.length;

                return (
                  <Card
                    key={lobby.id}
                    className={`p-4 border-2 cursor-pointer transition-all ${
                      selectedLobby === lobby.id
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                        : 'border-[var(--border)] hover:border-[var(--primary)]'
                    }`}
                    onClick={() => setSelectedLobby(lobby.id)}
                  >
                    <div className="space-y-3">
                      {/* Route Info */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-[var(--ink)] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest font-semibold">
                              Going to
                            </p>
                            <p className="font-bold text-[var(--ink)]">{lobby.dropoff_location}</p>
                          </div>
                        </div>
                      </div>

                      {/* Passengers */}
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {passengers.slice(0, 3).map(passenger => (
                            <div
                              key={passenger.id}
                              className="w-7 h-7 overflow-hidden rounded-full bg-[var(--primary)] flex items-center justify-center text-xs border-2 border-white"
                            >
                              <PassengerAvatar value="👤" />
                            </div>
                          ))}
                          {passengers.length > 3 && (
                            <div className="w-7 h-7 rounded-full bg-[var(--border)] flex items-center justify-center text-xs border-2 border-white font-semibold text-[var(--ink)]">
                              +{passengers.length - 3}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-[var(--ink)]">
                          {passengers.length}/{lobby.max_seats}
                        </span>
                        {availableSeats > 0 && (
                          <Badge variant="outline" className="border-[var(--success)] text-[var(--success)] ml-auto">
                            {availableSeats} seats
                          </Badge>
                        )}
                      </div>

                      {/* Price and Time */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-[var(--muted-foreground)]">Your fare</p>
                          <p className="text-lg font-bold text-[var(--primary)]">₱{joiningFare.toFixed(2)}</p>
                          <p className="text-[10px] text-[var(--muted-foreground)]">
                            {joiningFareHasDistance ? "Base fare + your distance" : "Base fare; distance charge added when located"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[var(--muted-foreground)]">{getTimeWaiting(lobby.created_at)}</p>
                          <Badge variant="outline" className="border-[var(--muted-foreground)] text-[var(--muted-foreground)]">
                            Waiting
                          </Badge>
                        </div>
                      </div>

                      {/* Join Button */}
                      {selectedLobby === lobby.id && (
                        <Button
                          onClick={() => handleJoinLobby(lobby.id)}
                          disabled={joiningLobby || availableSeats === 0}
                          className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-white"
                        >
                          {joiningLobby ? (
                            <>
                              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                              Joining...
                            </>
                          ) : availableSeats === 0 ? (
                            'Lobby Full'
                          ) : (
                            <>
                              Join Lobby
                              <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="p-5 border-t border-[var(--border)] bg-[var(--muted)]">
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            💡 Joining a shared ride lobby saves you up to 30% on fares!
          </p>
        </div>
      </div>
    </div>
  );
}


