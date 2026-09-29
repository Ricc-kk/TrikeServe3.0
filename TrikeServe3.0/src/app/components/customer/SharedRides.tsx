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
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-[var(--ink)]">Available Share Rides</h2>
            <button onClick={onClose}>
              <X className="w-6 h-6 text-[var(--muted-foreground)]" />
            </button>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">Join an existing ride or start a new one</p>
        </div>

        {/* Route Info */}
        <div className="px-5 py-4 bg-[var(--muted)] border-b border-[var(--border)]">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-[var(--ink)]" />
            <span className="font-semibold text-[var(--ink)]">{pickup}</span>
            <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
            <MapPin className="w-4 h-4 text-[var(--primary)]" />
            <span className="font-semibold text-[var(--primary)]">{dropoff}</span>
          </div>
        </div>

        {/* Available Rides List */}
        <div className="flex-1 overflow-y-auto p-5">
          {availableRides.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-[var(--muted)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-[var(--muted-foreground)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--ink)] mb-2">No Available Rides</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">Be the first to start a share ride for this route</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRides.map((ride) => (
                <Card
                  key={ride.id}
                  className="p-4 border-2 border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                >
                  {/* Ride Status */}
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={
                      ride.status === 'driver-assigned' 
                        ? 'bg-[var(--success)] text-white' 
                        : 'bg-[var(--amber)] text-white'
                    }>
                      {ride.status === 'driver-assigned' ? '✓ Driver Found' : '🔍 Finding Driver'}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
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
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--primary)] flex items-center justify-center text-sm border-2 border-white"
                          title={passenger.name}
                        >
                          {passenger.emoji}
                        </div>
                      ))}
                      {/* Empty seats */}
                      {Array.from({ length: ride.maxSeats - ride.occupiedSeats }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center text-lg border-2 border-white"
                        >
                          <Users className="w-4 h-4 text-[var(--muted-foreground)]" />
                        </div>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-[var(--ink)]">
                      {ride.occupiedSeats}/{ride.maxSeats} seats
                    </span>
                  </div>

                  {/* Route Details */}
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[var(--ink)] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{ride.pickup}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{ride.pickupAddress}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{ride.dropoff}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{ride.dropoffAddress}</p>
                      </div>
                    </div>
                  </div>

                  {/* Driver Info (if assigned) */}
                  {ride.status === 'driver-assigned' && ride.driverName && (
                    <div className="bg-[var(--success-soft)] rounded-lg p-2 mb-3 flex items-center gap-2">
                      <span className="text-xl">👨‍✈️</span>
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-[var(--ink)]">{ride.driverName}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{ride.driverPlate}</p>
                      </div>
                    </div>
                  )}

                  {/* Price and Join Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-[var(--primary)]">₱{ride.pricePerSeat}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">per person</p>
                    </div>
                    <Button
                      onClick={() => onJoinRide(ride.id)}
                      className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white"
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
        <div className="p-5 border-t border-[var(--border)] bg-white">
          <Button
            onClick={onCreateNewRide}
            className="w-full bg-[var(--ink)] hover:bg-[var(--ink)] text-white py-6 text-base font-bold uppercase"
          >
            <Users className="w-5 h-5 mr-2" />
            Start New Share Ride
          </Button>
        </div>
      </div>
    </div>
  );
}
