import { useState, useEffect } from "react";
import { MapPin, Users, Clock, X, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

interface AvailableLobby {
  id: string;
  pickup_location: string;
  pickup_address: string;
  dropoff_location: string;
  dropoff_address: string;
  passengers_json?: Array<{ id: string; name: string; emoji: string }>;
  max_seats: number;
  price_per_seat: number;
  status: 'waiting' | 'driver_found' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

interface BrowseAvailableLobbiesProps {
  dropoffAddress: string;
  onLobbyJoined: (lobbyId: string) => void;
  onClose: () => void;
}

export default function BrowseAvailableLobbies({
  dropoffAddress,
  onLobbyJoined,
  onClose
}: BrowseAvailableLobbiesProps) {
  const { user } = useAuth();
  const [lobbies, setLobbies] = useState<AvailableLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null);
  const [joiningLobby, setJoiningLobby] = useState(false);

  // Fetch available lobbies on mount
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        setLoading(true);
        // Fetch lobbies with matching dropoff address
        const { data, error: fetchError } = await supabaseHelpers.getAvailableLobbies(dropoffAddress);

        if (fetchError) {
          setError('Failed to load available lobbies');
          console.error('Error fetching lobbies:', fetchError);
          return;
        }

        if (data) {
          // Filter out lobbies where user is already a passenger
          const availableLobbies = (data as AvailableLobby[]).filter(lobby => {
            const passengers = lobby.passengers_json || [];
            return !passengers.some(p => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`));
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
          table: 'shared_ride_lobbies',
          filter: `dropoff_address=eq.${dropoffAddress}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new.status === 'waiting') {
            setLobbies(prev => [...prev, payload.new as AvailableLobby]);
          } else if (payload.eventType === 'UPDATE') {
            setLobbies(prev =>
              prev.map(l => l.id === payload.new.id ? payload.new as AvailableLobby : l)
                .filter(l => l.status === 'waiting')
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dropoffAddress, user?.id]);

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

      // Create passenger object
      const passenger = {
        id: user.id,
        name: user.name || 'Customer',
        emoji: '👤',
        joinedAt: new Date().toISOString(),
        pickup: lobby.pickup_location,
        pickupAddress: lobby.pickup_address
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
        <Card className="bg-white p-8 w-full max-w-md text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[#E11D48] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-[#64748B]">Loading available lobbies...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
        <Card className="bg-white p-6 w-full max-w-md">
          <h3 className="text-lg font-bold text-red-600 mb-2">Error</h3>
          <p className="text-sm text-[#64748B] mb-6">{error}</p>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
      <div className="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FFF1F2] rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-[#E11D48]" />
            </div>
            <h2 className="text-xl font-bold text-[#121212]">Available Lobbies</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        {/* Lobbies List */}
        <div className="flex-1 overflow-y-auto p-5">
          {lobbies.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8 text-[#E11D48]" />
              </div>
              <p className="text-lg font-semibold text-[#121212] mb-1">No lobbies available</p>
              <p className="text-sm text-[#64748B]">
                Be the first to create a lobby for this route!
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
                        ? 'border-[#E11D48] bg-[#FFF1F2]'
                        : 'border-[#E2E8F0] hover:border-[#E11D48]'
                    }`}
                    onClick={() => setSelectedLobby(lobby.id)}
                  >
                    <div className="space-y-3">
                      {/* Route Info */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-[#121212] mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Drop-off</p>
                            <p className="font-bold text-[#121212]">{lobby.dropoff_location}</p>
                          </div>
                        </div>
                      </div>

                      {/* Passengers */}
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {passengers.slice(0, 3).map(passenger => (
                            <div
                              key={passenger.id}
                              className="w-7 h-7 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center text-xs border-2 border-white"
                            >
                              {passenger.emoji}
                            </div>
                          ))}
                          {passengers.length > 3 && (
                            <div className="w-7 h-7 rounded-full bg-[#E2E8F0] flex items-center justify-center text-xs border-2 border-white font-semibold text-[#121212]">
                              +{passengers.length - 3}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-[#121212]">
                          {passengers.length}/{lobby.max_seats}
                        </span>
                        {availableSeats > 0 && (
                          <Badge variant="outline" className="border-green-500 text-green-700 ml-auto">
                            {availableSeats} seats
                          </Badge>
                        )}
                      </div>

                      {/* Price and Time */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-[#64748B]">Price per seat</p>
                          <p className="text-lg font-bold text-[#E11D48]">₱{lobby.price_per_seat}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#64748B]">{getTimeWaiting(lobby.created_at)}</p>
                          <Badge variant="outline" className="border-[#64748B] text-[#64748B]">
                            Waiting
                          </Badge>
                        </div>
                      </div>

                      {/* Join Button */}
                      {selectedLobby === lobby.id && (
                        <Button
                          onClick={() => handleJoinLobby(lobby.id)}
                          disabled={joiningLobby || availableSeats === 0}
                          className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white"
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
        <div className="p-5 border-t border-[#E2E8F0] bg-[#F8F9FA]">
          <p className="text-xs text-[#64748B] text-center">
            💡 Joining a shared ride lobby saves you up to 30% on fares!
          </p>
        </div>
      </div>
    </div>
  );
}


