import { useState, useEffect } from "react";
import { MapPin, Users, Clock, X, ChevronDown, MessageCircle, User, Minimize2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

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
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  passengers: LobbyPassenger[];
  maxSeats: number;
  pricePerSeat: number;
  status: 'waiting' | 'driver-found' | 'in-progress' | 'completed';
  driverName?: string;
  driverPlate?: string;
  driverRating?: string;
  createdAt: string;
}

interface ShareRideLobbyProps {
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  passengerCount?: number; // New prop
  onDriverFound: (driverId: string) => void;
  onClose: () => void;
}

export default function ShareRideLobby({
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  passengerCount = 1, // Default to 1
  onDriverFound,
  onClose
}: ShareRideLobbyProps) {
  const { user } = useAuth();
  const [lobby, setLobby] = useState<ShareRideLobby | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Initialize or join lobby
  useEffect(() => {
    const existingLobby = findOrCreateLobby();
    setLobby(existingLobby);

    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      const updatedLobby = loadLobby(existingLobby.id);
      if (updatedLobby) {
        setLobby(updatedLobby);
        
        // Check if driver was found
        if (updatedLobby.status === 'driver-found' && updatedLobby.driverName) {
          onDriverFound(updatedLobby.id);
        }
      }
    }, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trikeserve_share_lobbies') {
        const updatedLobby = loadLobby(existingLobby.id);
        if (updatedLobby) {
          setLobby(updatedLobby);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const findOrCreateLobby = (): ShareRideLobby => {
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    let lobbies: ShareRideLobby[] = [];

    if (lobbiesData) {
      try {
        lobbies = JSON.parse(lobbiesData);
      } catch (error) {
        console.error('Error parsing lobbies:', error);
      }
    }

    // First, check if user is already in an existing lobby
    const existingUserLobby = lobbies.find(l => 
      l.status === 'waiting' &&
      l.passengers.some(p => p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`))
    );

    if (existingUserLobby) {
      console.log('✅ User already in lobby, rejoining:', existingUserLobby.id);
      return existingUserLobby;
    }

    // Find matching lobby with same drop-off and available seats
    const matchingLobby = lobbies.find(l => 
      isSameRoute(l.pickup, l.dropoff, pickup, dropoff) &&
      l.passengers.length + passengerCount <= l.maxSeats && // Check if enough seats
      l.status === 'waiting' &&
      !l.passengers.some(p => p.id === user?.id)
    );

    if (matchingLobby) {
      // Join existing lobby - add main passenger and companions
      const mainPassenger: LobbyPassenger = {
        id: user?.id || `user_${Date.now()}`,
        name: user?.name || 'Customer',
        emoji: getRandomEmoji(),
        joinedAt: new Date().toISOString(),
        pickup: pickup,
        pickupAddress: pickupAddress
      };

      matchingLobby.passengers.push(mainPassenger);

      // Add companions if passenger count > 1
      for (let i = 1; i < passengerCount; i++) {
        const companion: LobbyPassenger = {
          id: `${user?.id || `user_${Date.now()}`}_companion_${i}`,
          name: `+${i} Companion`,
          emoji: '👥',
          joinedAt: new Date().toISOString(),
          pickup: pickup,
          pickupAddress: pickupAddress
        };
        matchingLobby.passengers.push(companion);
      }

      saveLobby(matchingLobby);
      
      // Update ride request with new passenger count
      createRideRequest(matchingLobby);
      
      console.log('✅ Joined existing lobby:', matchingLobby.id);
      return matchingLobby;
    } else {
      // Create new lobby - add main passenger and companions
      const mainPassenger: LobbyPassenger = {
        id: user?.id || `user_${Date.now()}`,
        name: user?.name || 'Customer',
        emoji: getRandomEmoji(),
        joinedAt: new Date().toISOString(),
        pickup: pickup,
        pickupAddress: pickupAddress
      };

      const passengers: LobbyPassenger[] = [mainPassenger];

      // Add companions if passenger count > 1
      for (let i = 1; i < passengerCount; i++) {
        const companion: LobbyPassenger = {
          id: `${user?.id || `user_${Date.now()}`}_companion_${i}`,
          name: `+${i} Companion`,
          emoji: '👥',
          joinedAt: new Date().toISOString(),
          pickup: pickup,
          pickupAddress: pickupAddress
        };
        passengers.push(companion);
      }

      const newLobby: ShareRideLobby = {
        id: `lobby_${Date.now()}`,
        pickup,
        pickupAddress,
        dropoff,
        dropoffAddress,
        passengers,
        maxSeats: 3,
        pricePerSeat: 15,
        status: 'waiting',
        createdAt: new Date().toISOString()
      };

      lobbies.push(newLobby);
      localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));

      // Also create ride request for drivers
      createRideRequest(newLobby);

      console.log('✅ Created new lobby:', newLobby.id);
      return newLobby;
    }
  };

  const loadLobby = (lobbyId: string): ShareRideLobby | null => {
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    if (!lobbiesData) return null;

    try {
      const lobbies: ShareRideLobby[] = JSON.parse(lobbiesData);
      return lobbies.find(l => l.id === lobbyId) || null;
    } catch (error) {
      console.error('Error loading lobby:', error);
      return null;
    }
  };

  const saveLobby = (updatedLobby: ShareRideLobby) => {
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    let lobbies: ShareRideLobby[] = [];

    if (lobbiesData) {
      try {
        lobbies = JSON.parse(lobbiesData);
      } catch (error) {
        console.error('Error parsing lobbies:', error);
      }
    }

    const index = lobbies.findIndex(l => l.id === updatedLobby.id);
    if (index >= 0) {
      lobbies[index] = updatedLobby;
    } else {
      lobbies.push(updatedLobby);
    }

    localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));

    // Trigger storage event for cross-tab sync
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'trikeserve_share_lobbies',
      newValue: JSON.stringify(lobbies)
    }));
  };

  const createRideRequest = (lobby: ShareRideLobby) => {
    const rideRequest = {
      id: `req_${lobby.id}`,
      lobbyId: lobby.id,
      type: 'shared',
      pickup: lobby.pickup,
      dropoff: lobby.dropoff,
      pickupAddress: lobby.pickupAddress,
      dropoffAddress: lobby.dropoffAddress,
      payment: 'PREPAID',
      amount: lobby.pricePerSeat * lobby.passengers.length,
      passengers: lobby.passengers.length,
      maxPassengers: lobby.maxSeats,
      passengerDetails: lobby.passengers,
      customerName: lobby.passengers.length > 1 
        ? `${lobby.passengers.length} Passengers` 
        : lobby.passengers[0]?.name || 'Customer',
      customerPhoto: '🚲',
      distance: '2.5 km',
      estimatedTime: '7 mins',
      status: 'waiting',
      createdAt: lobby.createdAt
    };

    const existingRequests = localStorage.getItem('trikeserve_ride_requests');
    let requests = [];
    if (existingRequests) {
      try {
        requests = JSON.parse(existingRequests);
      } catch (error) {
        console.error('Error parsing requests:', error);
      }
    }

    // Check if request already exists
    const existingIndex = requests.findIndex((r: any) => r.lobbyId === lobby.id);
    if (existingIndex >= 0) {
      requests[existingIndex] = rideRequest;
    } else {
      requests.push(rideRequest);
    }

    localStorage.setItem('trikeserve_ride_requests', JSON.stringify(requests));
  };

  const handleLeaveLobby = () => {
    if (!lobby) return;

    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    if (!lobbiesData) return;

    try {
      let lobbies: ShareRideLobby[] = JSON.parse(lobbiesData);
      const targetLobby = lobbies.find(l => l.id === lobby.id);

      if (targetLobby) {
        // Remove current user and their companions from passengers
        targetLobby.passengers = targetLobby.passengers.filter(p => {
          // Remove the main user
          if (p.id === user?.id) return false;
          // Remove companions (they have id like "userId_companion_1")
          if (p.id.startsWith(`${user?.id}_companion_`)) return false;
          return true;
        });

        // Check if lobby is now empty or user was the only one left
        if (targetLobby.passengers.length === 0) {
          // Delete lobby if empty - user was the only one left
          lobbies = lobbies.filter(l => l.id !== lobby.id);
          console.log(`Lobby ${lobby.id} deleted - last passenger left`);
          
          // Also remove the associated ride request
          const requestsData = localStorage.getItem('trikeserve_ride_requests');
          if (requestsData) {
            try {
              let requests = JSON.parse(requestsData);
              requests = requests.filter((r: any) => r.lobbyId !== lobby.id);
              localStorage.setItem('trikeserve_ride_requests', JSON.stringify(requests));
              console.log(`Ride request for lobby ${lobby.id} deleted`);
            } catch (error) {
              console.error('Error removing ride request:', error);
            }
          }
        } else {
          // Update the lobby with remaining passengers
          lobbies = lobbies.map(l => l.id === lobby.id ? targetLobby : l);
          
          // Update the ride request with new passenger count
          const requestsData = localStorage.getItem('trikeserve_ride_requests');
          if (requestsData) {
            try {
              let requests = JSON.parse(requestsData);
              const requestIndex = requests.findIndex((r: any) => r.lobbyId === lobby.id);
              if (requestIndex >= 0) {
                requests[requestIndex].passengers = targetLobby.passengers.length;
                requests[requestIndex].amount = targetLobby.pricePerSeat * targetLobby.passengers.length;
                requests[requestIndex].passengerDetails = targetLobby.passengers;
                requests[requestIndex].customerName = targetLobby.passengers.length > 1 
                  ? `${targetLobby.passengers.length} Passengers` 
                  : targetLobby.passengers[0]?.name || 'Customer';
                localStorage.setItem('trikeserve_ride_requests', JSON.stringify(requests));
                console.log(`Ride request for lobby ${lobby.id} updated - ${targetLobby.passengers.length} passengers remaining`);
              }
            } catch (error) {
              console.error('Error updating ride request:', error);
            }
          }
        }

        localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));
        
        // Trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'trikeserve_share_lobbies',
          newValue: JSON.stringify(lobbies)
        }));
      }
    } catch (error) {
      console.error('Error leaving lobby:', error);
    }

    onClose();
  };

  const isSameRoute = (l1Pickup: string, l1Dropoff: string, l2Pickup: string, l2Dropoff: string) => {
    // Only match drop-off location, allow different pickups
    const dropoffMatch = l1Dropoff.toLowerCase().trim() === l2Dropoff.toLowerCase().trim();
    return dropoffMatch;
  };

  const getRandomEmoji = () => {
    const emojis = ['👤', '👨', '👩', '🧑', '👦', '👧', '👨‍💼', '👩‍💼', '👨‍🎓', '👩‍🎓'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  };

  const getWaitingTime = () => {
    if (!lobby) return '0s';
    const elapsed = Date.now() - new Date(lobby.createdAt).getTime();
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

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
          {/* Passenger count badge */}
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-white rounded-full border-2 border-[#E11D48] flex items-center justify-center">
            <span className="text-xs font-bold text-[#E11D48]">{lobby.passengers.length}/{lobby.maxSeats}</span>
          </div>
          {/* Pulse animation */}
          <div className="absolute inset-0 bg-[#E11D48] rounded-full animate-ping opacity-20"></div>
        </div>
      </button>
    );
  }

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
            
            {/* Status Badge */}
            <Badge className={
              lobby.status === 'driver-found' 
                ? 'bg-green-500 text-white' 
                : 'bg-yellow-500 text-white'
            }>
              {lobby.status === 'driver-found' ? '✓ Driver Found!' : '🔍 Finding Driver...'}
            </Badge>
          </div>

          {/* Route Info */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#FFF1F2] to-[#FFF7ED] border-b border-[#E2E8F0]">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#121212] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Pickup</p>
                  <p className="font-bold text-[#121212]">{lobby.pickup}</p>
                  <p className="text-xs text-[#64748B]">{lobby.pickupAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">Drop-off</p>
                  <p className="font-bold text-[#121212]">{lobby.dropoff}</p>
                  <p className="text-xs text-[#64748B]">{lobby.dropoffAddress}</p>
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
                  {lobby.passengers.length}/{lobby.maxSeats} Seats
                </span>
              </div>

              {/* Passenger Cards */}
              <div className="space-y-2">
                {lobby.passengers.map((passenger, index) => {
                  // Check if this passenger belongs to the current user (main or companion)
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
                          {passenger.emoji}
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
                {Array.from({ length: lobby.maxSeats - lobby.passengers.length }).map((_, index) => (
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
            {lobby.status === 'driver-found' && lobby.driverName && (
              <Card className="p-4 border-2 border-green-500 bg-green-50 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-green-200 flex items-center justify-center text-3xl">
                    👨‍✈️
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-0.5">Your Driver</p>
                    <p className="font-bold text-[#121212] text-lg">{lobby.driverName}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#64748B]">{lobby.driverPlate}</span>
                      {lobby.driverRating && (
                        <>
                          <span className="text-[#64748B]">•</span>
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-500">⭐</span>
                            <span className="text-xs font-semibold text-[#121212]">{lobby.driverRating}</span>
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
                  {lobby.passengers.length < lobby.maxSeats 
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
                <p className="text-3xl font-bold text-[#E11D48]">₱{lobby.pricePerSeat * passengerCount}</p>
                {passengerCount > 1 && (
                  <p className="text-xs text-[#94A3B8]">
                    {passengerCount} seat{passengerCount > 1 ? 's' : ''} × ₱{lobby.pricePerSeat}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-[#64748B]">Total Trip Value</p>
                <p className="text-xl font-bold text-[#121212]">
                  ₱{lobby.pricePerSeat * lobby.passengers.length}
                </p>
                <p className="text-xs text-[#94A3B8]">
                  {lobby.passengers.length} passenger{lobby.passengers.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {lobby.passengers.length === lobby.maxSeats && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-sm text-green-700 font-semibold">
                  🎉 Lobby Full! Prioritizing your ride request...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[2100] flex items-center justify-center p-4">
          <Card className="bg-white p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[#121212] mb-2">Leave Lobby?</h3>
            <p className="text-sm text-[#64748B] mb-6">
              Are you sure you want to leave? You'll need to find a new ride.
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
                LEAVE
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}