import { useState, useEffect } from "react";
import { MapPin, Users, Clock, ArrowRight, X, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

interface SharedRide {
  id: string;
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  maxSeats: number;
  occupiedSeats: number;
  passengers: Array<{
    id: string;
    name: string;
    emoji: string;
  }>;
  pricePerSeat: number;
  estimatedTime: string;
  distance: string;
  status: 'waiting' | 'driver-assigned' | 'in-progress' | 'completed';
  driverName?: string;
  driverPlate?: string;
  createdAt: string;
}

interface SharedRidesProps {
  pickup: string;
  pickupAddress: string;
  dropoff: string;
  dropoffAddress: string;
  onJoinRide: (rideId: string) => void;
  onCreateNewRide: () => void;
  onClose: () => void;
}

export default function SharedRides({
  pickup,
  pickupAddress,
  dropoff,
  dropoffAddress,
  onJoinRide,
  onCreateNewRide,
  onClose
}: SharedRidesProps) {
  const { user } = useAuth();
  const [availableRides, setAvailableRides] = useState<SharedRide[]>([]);

  useEffect(() => {
    loadAvailableSharedRides();
    
    // Poll for updates every 3 seconds
    const interval = setInterval(loadAvailableSharedRides, 3000);
    
    // Listen for storage changes (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trikeserve_shared_rides') {
        loadAvailableSharedRides();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pickup, dropoff]);

  const loadAvailableSharedRides = () => {
    const sharedRidesData = localStorage.getItem('trikeserve_shared_rides');
    if (!sharedRidesData) {
      setAvailableRides([]);
      return;
    }

    try {
      const allSharedRides: SharedRide[] = JSON.parse(sharedRidesData);
      
      // Filter rides that:
      // 1. Have similar pickup/dropoff locations
      // 2. Have available seats
      // 3. Are in 'waiting' or 'driver-assigned' status
      // 4. User is not already in
      const matchingRides = allSharedRides.filter(ride => {
        const hasSeats = ride.occupiedSeats < ride.maxSeats;
        const isWaiting = ride.status === 'waiting' || ride.status === 'driver-assigned';
        const notAlreadyIn = !ride.passengers.some(p => p.id === user?.id);
        const sameRoute = isSimilarRoute(ride.pickup, ride.dropoff, pickup, dropoff);
        
        return hasSeats && isWaiting && notAlreadyIn && sameRoute;
      });

      setAvailableRides(matchingRides);
    } catch (error) {
      console.error('Error loading shared rides:', error);
      setAvailableRides([]);
    }
  };

  // Simple route matching - in production, use actual GPS coordinates
  const isSimilarRoute = (ridePickup: string, rideDropoff: string, userPickup: string, userDropoff: string) => {
    const pickupMatch = ridePickup.toLowerCase().includes(userPickup.toLowerCase()) || 
                       userPickup.toLowerCase().includes(ridePickup.toLowerCase());
    const dropoffMatch = rideDropoff.toLowerCase().includes(userDropoff.toLowerCase()) || 
                        userDropoff.toLowerCase().includes(rideDropoff.toLowerCase());
    return pickupMatch && dropoffMatch;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
      <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-[#121212]">Available Share Rides</h2>
            <button onClick={onClose}>
              <X className="w-6 h-6 text-[#64748B]" />
            </button>
          </div>
          <p className="text-sm text-[#64748B]">Join an existing ride or start a new one</p>
        </div>

        {/* Route Info */}
        <div className="px-5 py-4 bg-[#F8F9FA] border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-[#121212]" />
            <span className="font-semibold text-[#121212]">{pickup}</span>
            <ArrowRight className="w-4 h-4 text-[#64748B]" />
            <MapPin className="w-4 h-4 text-[#E11D48]" />
            <span className="font-semibold text-[#E11D48]">{dropoff}</span>
          </div>
        </div>

        {/* Available Rides List */}
        <div className="flex-1 overflow-y-auto p-5">
          {availableRides.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-[#F8F9FA] rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-[#94A3B8]" />
              </div>
              <h3 className="text-lg font-bold text-[#121212] mb-2">No Available Rides</h3>
              <p className="text-sm text-[#64748B] mb-6">Be the first to start a share ride for this route</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRides.map((ride) => (
                <Card
                  key={ride.id}
                  className="p-4 border-2 border-[#E2E8F0] hover:border-[#E11D48] transition-colors"
                >
                  {/* Ride Status */}
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={
                      ride.status === 'driver-assigned' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-yellow-500 text-white'
                    }>
                      {ride.status === 'driver-assigned' ? '✓ Driver Found' : '🔍 Finding Driver'}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-[#64748B]">
                      <Clock className="w-4 h-4" />
                      <span>{ride.estimatedTime}</span>
                    </div>
                  </div>

                  {/* Passengers */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex -space-x-2">
                      {ride.passengers.map((passenger, idx) => (
                        <div
                          key={idx}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center text-sm border-2 border-white"
                          title={passenger.name}
                        >
                          {passenger.emoji}
                        </div>
                      ))}
                      {/* Empty seats */}
                      {Array.from({ length: ride.maxSeats - ride.occupiedSeats }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-lg border-2 border-white"
                        >
                          <Users className="w-4 h-4 text-gray-400" />
                        </div>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-[#121212]">
                      {ride.occupiedSeats}/{ride.maxSeats} seats
                    </span>
                  </div>

                  {/* Route Details */}
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[#121212] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[#121212]">{ride.pickup}</p>
                        <p className="text-xs text-[#64748B]">{ride.pickupAddress}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[#121212]">{ride.dropoff}</p>
                        <p className="text-xs text-[#64748B]">{ride.dropoffAddress}</p>
                      </div>
                    </div>
                  </div>

                  {/* Driver Info (if assigned) */}
                  {ride.status === 'driver-assigned' && ride.driverName && (
                    <div className="bg-green-50 rounded-lg p-2 mb-3 flex items-center gap-2">
                      <span className="text-xl">👨‍✈️</span>
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-[#121212]">{ride.driverName}</p>
                        <p className="text-xs text-[#64748B]">{ride.driverPlate}</p>
                      </div>
                    </div>
                  )}

                  {/* Price and Join Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-[#E11D48]">₱{ride.pricePerSeat}</p>
                      <p className="text-xs text-[#64748B]">per person</p>
                    </div>
                    <Button
                      onClick={() => onJoinRide(ride.id)}
                      className="bg-[#E11D48] hover:bg-[#BE123C] text-white"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      JOIN RIDE
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Create New Ride Button */}
        <div className="p-5 border-t border-[#E2E8F0] bg-white">
          <Button
            onClick={onCreateNewRide}
            className="w-full bg-[#121212] hover:bg-[#1e1e1e] text-white py-6 text-base font-bold uppercase"
          >
            <Users className="w-5 h-5 mr-2" />
            Start New Share Ride
          </Button>
        </div>
      </div>
    </div>
  );
}
