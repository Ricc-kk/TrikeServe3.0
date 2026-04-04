import { useState, useEffect } from "react";
import { MapPin, Users, X, Clock, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

interface LobbyPassenger {
  id: string;
  name: string;
  emoji: string;
  joinedAt: string;
}

interface Lobby {
  id: string;
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  passengers: LobbyPassenger[];
  maxSeats: number;
  pricePerSeat: number;
  status: 'waiting' | 'driver-found' | 'in-progress' | 'completed';
  createdAt: string;
}

interface LobbyListProps {
  dropoff?: string;
  onJoinLobby: (lobby: Lobby) => void;
  onClose: () => void;
}

export default function LobbyList({
  dropoff,
  onJoinLobby,
  onClose
}: LobbyListProps) {
  const { user } = useAuth();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [userInLobby, setUserInLobby] = useState(false);

  useEffect(() => {
    checkIfUserInLobby();
    loadLobbies();
    
    // Poll for updates every 3 seconds
    const interval = setInterval(() => {
      checkIfUserInLobby();
      loadLobbies();
    }, 3000);
    
    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trikeserve_share_lobbies') {
        checkIfUserInLobby();
        loadLobbies();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [dropoff]);

  const checkIfUserInLobby = () => {
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    if (!lobbiesData) {
      setUserInLobby(false);
      return;
    }

    try {
      const allLobbies = JSON.parse(lobbiesData);
      const inLobby = allLobbies.some((lobby: any) => 
        lobby.status === 'waiting' &&
        lobby.passengers.some((p: any) => 
          p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`)
        )
      );
      setUserInLobby(inLobby);
    } catch (error) {
      console.error('Error checking user lobby:', error);
      setUserInLobby(false);
    }
  };

  const loadLobbies = () => {
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    if (!lobbiesData) {
      setLobbies([]);
      return;
    }

    try {
      const allLobbies: Lobby[] = JSON.parse(lobbiesData);
      
      // Filter lobbies that:
      // 1. Have available seats
      // 2. Are in 'waiting' status
      // 3. User is not already in
      // 4. Match drop-off if provided
      const availableLobbies = allLobbies.filter(lobby => {
        const hasSeats = lobby.passengers.length < lobby.maxSeats;
        const isWaiting = lobby.status === 'waiting';
        const notAlreadyIn = !lobby.passengers.some(p => p.id === user?.id);
        const matchesDropoff = !dropoff || lobby.dropoff.toLowerCase().includes(dropoff.toLowerCase());
        
        return hasSeats && isWaiting && notAlreadyIn && matchesDropoff;
      });

      // Sort by most passengers (fuller lobbies first)
      availableLobbies.sort((a, b) => b.passengers.length - a.passengers.length);

      setLobbies(availableLobbies);
    } catch (error) {
      console.error('Error loading lobbies:', error);
      setLobbies([]);
    }
  };

  const getWaitingTime = (createdAt: string) => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
      <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold text-[#121212]">Available Share Rides</h2>
              <p className="text-sm text-[#64748B]">Join an existing lobby going your way</p>
            </div>
            <button onClick={onClose}>
              <X className="w-6 h-6 text-[#64748B]" />
            </button>
          </div>
          
          {dropoff && (
            <div className="mt-3 flex items-center gap-2 text-sm bg-[#FFF1F2] p-3 rounded-lg">
              <MapPin className="w-4 h-4 text-[#E11D48]" />
              <span className="text-[#64748B]">Heading to:</span>
              <span className="font-semibold text-[#121212]">{dropoff}</span>
            </div>
          )}
        </div>

        {/* Lobbies List */}
        <div className="flex-1 overflow-y-auto p-5">
          {lobbies.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-[#F8F9FA] rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-[#94A3B8]" />
              </div>
              <h3 className="text-lg font-bold text-[#121212] mb-2">No Active Lobbies</h3>
              <p className="text-sm text-[#64748B] mb-6">
                {dropoff 
                  ? `No one is heading to ${dropoff} right now.` 
                  : 'No active share ride lobbies at the moment.'}
              </p>
              <p className="text-xs text-[#94A3B8]">
                Create a new share ride to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {lobbies.map((lobby) => (
                <Card
                  key={lobby.id}
                  className="p-4 border-2 border-[#E2E8F0] hover:border-[#E11D48] transition-colors"
                >
                  {/* Status Bar */}
                  <div className="flex items-center justify-between mb-3">
                    <Badge className="bg-yellow-500 text-white">
                      🔍 Finding Driver
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-[#64748B]">
                      <Clock className="w-3 h-3" />
                      <span>Waiting {getWaitingTime(lobby.createdAt)}</span>
                    </div>
                  </div>

                  {/* Passengers Preview */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex -space-x-2">
                      {lobby.passengers.map((passenger) => (
                        <div
                          key={passenger.id}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center text-sm border-2 border-white"
                          title={passenger.name}
                        >
                          {passenger.emoji}
                        </div>
                      ))}
                      {/* Empty seats */}
                      {Array.from({ length: lobby.maxSeats - lobby.passengers.length }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center border-2 border-white"
                        >
                          <Users className="w-4 h-4 text-gray-400" />
                        </div>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-[#E11D48]">
                      {lobby.passengers.length}/{lobby.maxSeats} seats
                    </span>
                  </div>

                  {/* Route Details */}
                  <div className="bg-[#F8F9FA] rounded-lg p-3 mb-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-[#121212] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Pickup</p>
                          <p className="font-semibold text-[#121212]">{lobby.pickup}</p>
                          <p className="text-xs text-[#64748B] truncate">{lobby.pickupAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <div className="h-6 w-0.5 bg-[#E2E8F0]"></div>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Drop-off</p>
                          <p className="font-semibold text-[#E11D48]">{lobby.dropoff}</p>
                          <p className="text-xs text-[#64748B] truncate">{lobby.dropoffAddress}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Price and Join Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-[#E11D48]">₱{lobby.pricePerSeat}</p>
                      <p className="text-xs text-[#64748B]">per seat</p>
                    </div>
                    <Button
                      onClick={() => onJoinLobby(lobby)}
                      className="bg-[#E11D48] hover:bg-[#BE123C] text-white"
                    >
                      <Users className="w-4 h-4 mr-1" />
                      JOIN LOBBY
                    </Button>
                  </div>

                  {/* Full Warning */}
                  {lobby.passengers.length === lobby.maxSeats - 1 && (
                    <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                      <p className="text-xs text-orange-700 font-semibold">
                        🔥 Last seat available!
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-5 border-t border-[#E2E8F0] bg-[#F8F9FA]">
          <p className="text-xs text-center text-[#64748B]">
            💡 Tip: Fuller lobbies get drivers faster!
          </p>
        </div>
      </div>
    </div>
  );
}