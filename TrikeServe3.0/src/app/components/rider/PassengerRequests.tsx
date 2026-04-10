import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

interface PassengerRequest {
  id: string;
  type: 'delivery' | 'shared' | 'private';
  pickup: string;
  dropoff: string;
  payment: 'COD' | 'PREPAID';
  amount: number;
  foodCost?: number;
  passengers?: number;
  waitingPassengers?: number;
  customerName: string;
  customerPhoto: string;
  distance: string;
  estimatedTime: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  customerId?: string;
  lobbyId?: string; // New field for shared rides
  passengerDetails?: Array<{ // New field for lobby passengers
    id: string;
    name: string;
    emoji: string;
    joinedAt: string;
  }>;
  maxPassengers?: number; // New field for max seats
}

interface LobbyRequest extends PassengerRequest {
  lobbyId: string;
  passengerDetails: Array<{
    id: string;
    name: string;
    emoji: string;
    joinedAt: string;
  }>;
  maxPassengers: number;
}

export default function PassengerRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'shared' | 'private' | 'delivery'>('all');
  const [requests, setRequests] = useState<PassengerRequest[]>([]);

  // Load requests from localStorage on mount and set up polling
  useEffect(() => {
    const loadRequests = () => {
      const savedRequests = localStorage.getItem('trikeserve_ride_requests');
      if (savedRequests) {
        try {
          const parsedRequests = JSON.parse(savedRequests);
          setRequests(parsedRequests);
        } catch (error) {
          console.error('Error loading ride requests:', error);
        }
      } else {
        setRequests([]);
      }
    };

    // Load initially
    loadRequests();

    // Poll for updates every 2 seconds
    const interval = setInterval(loadRequests, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trikeserve_ride_requests') {
        loadRequests();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleAcceptRequest = (request: PassengerRequest) => {
    // Check if driver already has an active ride
    const activeRideData = localStorage.getItem('trikeserve_active_ride');
    if (activeRideData) {
      try {
        const activeRide = JSON.parse(activeRideData);
        
        // For shared rides with passenger details, check if all passengers are dropped off
        if (activeRide.passengerDetails && activeRide.passengerDetails.length > 0) {
          const allDroppedOff = activeRide.passengerDetails.every((p: any) => p.status === 'dropped-off');
          
          if (!allDroppedOff) {
            alert('You already have an active ride. Please complete your current ride before accepting another.');
            return;
          }
          // If all passengers are dropped off, allow accepting new ride
          // The driver just needs to click "Complete Ride" but can start accepting new requests
        } else {
          // For non-shared rides or rides without passenger details, check the status
          alert('You already have an active ride. Please complete your current ride before accepting another.');
          return;
        }
      } catch (error) {
        console.error('Error checking active ride:', error);
      }
    }

    // Check if driver already has an active ride/lobby
    const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
    if (lobbiesData) {
      try {
        const lobbies = JSON.parse(lobbiesData);
        const driverActiveLobbies = lobbies.filter((lobby: any) => {
          if ((lobby.status === 'driver-found' || lobby.status === 'in-progress') &&
              lobby.driverName === user?.name) {
            
            // Check if all passengers are dropped off
            if (lobby.passengers && lobby.passengers.length > 0) {
              const allDroppedOff = lobby.passengers.every((p: any) => p.status === 'dropped-off');
              return !allDroppedOff; // Only count as active if not all dropped off
            }
            return true;
          }
          return false;
        });

        if (driverActiveLobbies.length > 0) {
          alert('You already have an active ride. Please complete your current ride before accepting another.');
          return;
        }
      } catch (error) {
        console.error('Error checking driver lobbies:', error);
      }
    }

    // Check if driver has any accepted rides
    const acceptedRidesData = localStorage.getItem('trikeserve_accepted_rides');
    if (acceptedRidesData) {
      try {
        const acceptedRides = JSON.parse(acceptedRidesData);
        const driverActiveRides = acceptedRides.filter((ride: any) => 
          ride.driverId === user?.id &&
          (ride.status === 'accepted' || ride.status === 'in-progress')
        );

        if (driverActiveRides.length > 0) {
          alert('You already have an active ride. Please complete your current ride before accepting another.');
          return;
        }
      } catch (error) {
        console.error('Error checking accepted rides:', error);
      }
    }

    // If it's a shared ride lobby, update lobby status
    if (request.lobbyId) {
      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (lobbiesData) {
        try {
          let lobbies = JSON.parse(lobbiesData);
          const lobbyIndex = lobbies.findIndex((l: any) => l.id === request.lobbyId);
          
          if (lobbyIndex >= 0) {
            // Initialize passenger statuses
            const passengersWithStatus = lobbies[lobbyIndex].passengers.map((p: any) => ({
              ...p,
              status: 'pending'
            }));

            // Update lobby with driver info and passenger statuses
            lobbies[lobbyIndex].status = 'driver-found';
            lobbies[lobbyIndex].driverName = user?.name;
            lobbies[lobbyIndex].driverPlate = user?.todaPlate;
            lobbies[lobbyIndex].driverRating = '4.8';
            lobbies[lobbyIndex].passengers = passengersWithStatus;
            
            localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));
            
            // Trigger storage event for cross-tab sync
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'trikeserve_share_lobbies',
              newValue: JSON.stringify(lobbies)
            }));

            // Add passenger details to request for acceptedRide
            request.passengerDetails = passengersWithStatus;
          }
        } catch (error) {
          console.error('Error updating lobby:', error);
        }
      }
    }
    
    // Remove the request from the queue
    const existingRequests = localStorage.getItem('trikeserve_ride_requests');
    let requests: PassengerRequest[] = [];
    if (existingRequests) {
      try {
        requests = JSON.parse(existingRequests);
      } catch (error) {
        console.error('Error parsing requests:', error);
      }
    }

    // Filter out the accepted request
    const updatedRequests = requests.filter(req => req.id !== request.id);
    localStorage.setItem('trikeserve_ride_requests', JSON.stringify(updatedRequests));

    // Create an accepted ride record
    const acceptedRide = {
      ...request,
      driverId: user?.id,
      driverName: user?.name,
      driverPlate: user?.todaPlate,
      driverRating: '4.8',
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      eta: '5 mins',
    };

    // Store in accepted rides
    const existingAcceptedRides = localStorage.getItem('trikeserve_accepted_rides');
    let acceptedRides = [];
    if (existingAcceptedRides) {
      try {
        acceptedRides = JSON.parse(existingAcceptedRides);
      } catch (error) {
        console.error('Error parsing accepted rides:', error);
      }
    }
    acceptedRides.push(acceptedRide);
    localStorage.setItem('trikeserve_accepted_rides', JSON.stringify(acceptedRides));

    // Navigate to active ride page
    navigate('/rider/active-ride', { state: { acceptedRide } });
  };

  const getServiceIcon = (type: string) => {
    switch(type) {
      case 'delivery': return <Package className="w-5 h-5 text-[#E11D48]" />;
      case 'shared': return <Users className="w-5 h-5 text-[#E11D48]" />;
      case 'private': return <Car className="w-5 h-5 text-[#E11D48]" />;
      default: return <Users className="w-5 h-5 text-[#E11D48]" />;
    }
  };

  const getServiceLabel = (type: string) => {
    switch(type) {
      case 'delivery': return 'DELIVERY';
      case 'shared': return 'RIDE SHARE';
      case 'private': return 'PRIVATE RIDE';
      default: return type.toUpperCase();
    }
  };

  const filteredRequests = requests.filter(request => {
    if (selectedCategory === 'all') return true;
    return request.type === selectedCategory;
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA] relative">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
            Passenger Requests
          </h1>
          <p className="text-xs text-[#64748B]">{requests.length} customers looking for service</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-3">
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-teal-900">
            <span className="font-bold">{requests.length} passengers</span> are currently looking for tricycle service in your area
          </p>
          <p className="text-xs text-teal-700 mt-1">
            💡 You can view requests anytime, even when offline
          </p>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-[#E11D48] text-white'
                : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSelectedCategory('shared')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'shared'
                ? 'bg-[#E11D48] text-white'
                : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}
          >
            Share Ride
          </button>
          <button
            onClick={() => setSelectedCategory('private')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'private'
                ? 'bg-[#E11D48] text-white'
                : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}
          >
            Private Ride
          </button>
          <button
            onClick={() => setSelectedCategory('delivery')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === 'delivery'
                ? 'bg-[#E11D48] text-white'
                : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
            }`}
          >
            Delivery
          </button>
        </div>

        {filteredRequests.map((request) => (
          <Card key={request.id} className="p-4 bg-white border-2 border-[#CBD5E1] hover:border-[#E11D48] transition-colors">
            {/* Shared Ride Lobby Display */}
            {request.lobbyId && request.passengerDetails && request.passengerDetails.length > 0 ? (
              <div className="flex flex-col gap-3">
                {/* Lobby Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-purple-500">
                        🚲 SHARED RIDE LOBBY
                      </Badge>
                      <Badge variant="outline" className="border-[#E11D48] text-[#E11D48]">
                        {request.passengerDetails.length}/{request.maxPassengers || 3} SEATS
                      </Badge>
                    </div>
                    <Badge variant="outline" className={request.payment === 'COD' ? 'border-orange-500 text-orange-500' : 'border-green-500 text-green-500'}>
                      {request.payment}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-2xl text-[#E11D48]">₱{request.amount}</p>
                    <p className="text-xs text-[#64748B]">{request.distance}</p>
                    <p className="text-xs font-semibold text-purple-600">
                      ₱{Math.round(request.amount / (request.passengerDetails.length || 1))} per seat
                    </p>
                  </div>
                </div>

                {/* Passengers in Lobby */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">Passengers Waiting</p>
                  <div className="space-y-2">
                    {request.passengerDetails.map((passenger, index) => (
                      <div key={passenger.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-purple-100">
                        <span className="text-2xl flex-shrink-0">{passenger.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[#121212]">{passenger.name}</p>
                            {index === 0 && (
                              <Badge className="bg-purple-500 text-white text-[9px] px-1 py-0">HOST</Badge>
                            )}
                          </div>
                          {(passenger as any).pickup && (
                            <div className="mt-1">
                              <p className="text-xs text-[#64748B]">Pickup: {(passenger as any).pickup}</p>
                              {(passenger as any).pickupAddress && (
                                <p className="text-[10px] text-[#94A3B8]">{(passenger as any).pickupAddress}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Route Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <Navigation className="w-4 h-4 text-[#E11D48] flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-[#64748B]">Pickup</p>
                      <p className="font-semibold text-[#121212]">{request.pickup}</p>
                      {request.pickupAddress && (
                        <p className="text-xs text-[#64748B] mt-0.5">{request.pickupAddress}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Navigation className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-[#64748B]">Drop-off</p>
                      <p className="font-semibold text-[#121212]">{request.dropoff}</p>
                      {request.dropoffAddress && (
                        <p className="text-xs text-[#64748B] mt-0.5">{request.dropoffAddress}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Trip Details */}
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 rounded p-2">
                    <p className="text-xs text-[#64748B]">Distance</p>
                    <p className="text-sm font-semibold text-[#121212]">{request.distance}</p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded p-2">
                    <p className="text-xs text-[#64748B]">Est. Time</p>
                    <p className="text-sm font-semibold text-[#121212]">{request.estimatedTime}</p>
                  </div>
                </div>

                {/* Lobby Full Indicator */}
                {request.passengerDetails.length === (request.maxPassengers || 3) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="text-xs text-green-700 font-semibold text-center">
                      🎉 Lobby Full - Priority Request!
                    </p>
                  </div>
                )}

                <Button
                  onClick={() => handleAcceptRequest(request)}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                >
                  Accept Lobby ({request.passengerDetails.length} Passengers)
                </Button>
              </div>
            ) : (
              /* Regular Request Display */
              <div className="flex items-start gap-3 mb-3">
                <div className="text-4xl">{request.customerPhoto}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-[#121212]">{request.customerName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-[#E11D48]">
                          {getServiceLabel(request.type)}
                        </Badge>
                        <Badge variant="outline" className={request.payment === 'COD' ? 'border-orange-500 text-orange-500' : 'border-green-500 text-green-500'}>
                          {request.payment}
                        </Badge>
                        {request.passengers && request.passengers > 1 && (
                          <Badge variant="outline" className="border-blue-500 text-blue-500">
                            👥 {request.passengers} PAX
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-[#E11D48]">₱{request.amount}</p>
                      <p className="text-xs text-[#64748B]">{request.distance}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex gap-2">
                      <Navigation className="w-4 h-4 text-[#E11D48] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-[#64748B]">Pickup</p>
                        <p className="font-semibold text-[#121212]">{request.pickup}</p>
                        {request.pickupAddress && (
                          <p className="text-xs text-[#64748B] mt-0.5">{request.pickupAddress}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Navigation className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-[#64748B]">Drop-off</p>
                        <p className="font-semibold text-[#121212]">{request.dropoff}</p>
                        {request.dropoffAddress && (
                          <p className="text-xs text-[#64748B] mt-0.5">{request.dropoffAddress}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {request.waitingPassengers && (
                    <p className="text-sm text-[#E11D48] font-semibold mb-2">
                      👥 {request.waitingPassengers} passenger(s) waiting
                    </p>
                  )}

                  {request.type === 'delivery' && request.payment === 'COD' && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-orange-900">
                        <span className="font-semibold">⚠️ Pay Restaurant First:</span> ₱{request.foodCost}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 bg-gray-50 rounded p-2">
                      <p className="text-xs text-[#64748B]">Distance</p>
                      <p className="text-sm font-semibold text-[#121212]">{request.distance}</p>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded p-2">
                      <p className="text-xs text-[#64748B]">Est. Time</p>
                      <p className="text-sm font-semibold text-[#121212]">{request.estimatedTime}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleAcceptRequest(request)}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                  >
                    Accept Request
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {/* Empty State */}
        {filteredRequests.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-[#94A3B8]" />
            </div>
            <h3 className="text-lg font-bold text-[#121212] mb-2">No passenger requests</h3>
            <p className="text-sm text-[#64748B]">
              {selectedCategory === 'all' 
                ? 'Waiting for customers to request rides...'
                : `No ${selectedCategory} ride requests at the moment`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}