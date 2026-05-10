import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Navigation, Package, Users, Car } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { supabase } from "../../../lib/supabase";

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
  orderId?: string;
  orderNumber?: string;
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

  const mapRideType = (rideType: string, pickupLocation?: string): PassengerRequest['type'] => {
    const normalized = (rideType || '').toLowerCase();
    const taggedDelivery = (pickupLocation || '').startsWith('DELIVERY|');
    if (normalized === 'delivery' || taggedDelivery) return 'delivery';
    if (normalized === 'share' || normalized === 'shared') return 'shared';
    return 'private';
  };

  const formatPickup = (value?: string) => {
    const pickup = value || 'Pickup';
    if (!pickup.startsWith('DELIVERY|')) return pickup;

    const parts = pickup.split('|');
    return parts[parts.length - 1] || pickup;
  };

  const parseDeliveryTag = (pickupLocation?: string) => {
    if (!pickupLocation?.startsWith('DELIVERY|')) return { orderId: undefined, orderNumber: undefined };

    const parts = pickupLocation.split('|');
    const orderIdPart = parts.find((part) => part.startsWith('ORDER_ID:'));
    const orderNumberPart = parts.find((part) => part.startsWith('ORDER_NO:'));

    return {
      orderId: orderIdPart ? orderIdPart.replace('ORDER_ID:', '') : undefined,
      orderNumber: orderNumberPart ? orderNumberPart.replace('ORDER_NO:', '') : undefined,
    };
  };

   // Load requests from Supabase on mount and set up real-time subscriptions
   useEffect(() => {
     const loadRequests = async () => {
       try {
         // Fetch pending ride requests from Supabase
         const { data: rideRequests, error: dbError } = await supabaseHelpers.getRideRequests({
           status: 'pending'
         });

         // Fetch waiting shared lobbies from Supabase
         const { data: waitingLobbies, error: lobbyError } = await supabaseHelpers.getWaitingLobbiesForDriver();

         if (dbError) {
           console.error('❌ PassengerRequests: Error loading requests from database:', dbError);
         }

         if (lobbyError) {
           console.error('❌ PassengerRequests: Error loading waiting lobbies from database:', lobbyError);
         }

         const mappedRequests = (rideRequests || []).map((req: any) => ({
              id: req.id,
             type: mapRideType(req.ride_type, req.pickup_location),
              pickup: formatPickup(req.pickup_location),
              dropoff: req.dropoff_location || 'Drop-off',
              payment: req.payment_method === 'GCASH' ? 'PREPAID' : 'COD',
              amount: Number(req.amount || 0),
              foodCost: Number(req.food_cost || 0),
              customerName: req.customer_name || 'Customer',
              customerPhoto: '👤',
              distance: '2.5 km',
              estimatedTime: '7 mins',
              passengers: req.passenger_count || 1,
              customerId: req.customer_id,
              ...parseDeliveryTag(req.pickup_location),
              pickupAddress: req.pickup_address || undefined,
              dropoffAddress: req.dropoff_address || undefined,
              created_at: req.created_at,
           }));

         const mappedLobbies = (waitingLobbies || []).map((lobby: any) => {
           const passengers = Array.isArray(lobby.passengers_json) ? lobby.passengers_json : [];
           return {
             id: `lobby_${lobby.id}`,
             type: 'shared',
             pickup: lobby.pickup_location,
             dropoff: lobby.dropoff_location,
             pickupAddress: lobby.pickup_address,
             dropoffAddress: lobby.dropoff_address,
             payment: 'PREPAID',
             amount: Number(lobby.price_per_seat || 15) * passengers.length,
             passengers: passengers.length,
             maxPassengers: Number(lobby.max_seats || 3),
             customerName: passengers.length > 1 ? `${passengers.length} Passengers` : (passengers[0]?.name || 'Customer'),
             customerPhoto: '🚲',
             distance: '2.5 km',
             estimatedTime: '7 mins',
             customerId: lobby.customer_id,
             lobbyId: lobby.id,
             passengerDetails: passengers,
             created_at: lobby.created_at,
           } as PassengerRequest;
         });

         const mergedRequests = [...mappedRequests, ...mappedLobbies];
         setRequests(mergedRequests);
         console.log('✅ PassengerRequests: Loaded passenger + lobby requests from database:', mergedRequests.length);
       } catch (error) {
         console.error('❌ PassengerRequests: Error loading requests:', error);
         setRequests([]);
       }
     };

     // Load initially
     loadRequests();

     // Set up real-time subscriptions
     console.log('🔔 PassengerRequests: Setting up real-time subscriptions');

     // Subscribe to ride_requests table changes
     const rideRequestsSubscription = supabase
       .channel('passenger-requests-rides')
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'ride_requests'
         },
         (payload) => {
           console.log('📡 PassengerRequests: Ride request changed, reloading', payload.eventType);
           loadRequests();
         }
       )
       .subscribe();

     // Subscribe to shared_ride_lobbies table changes
     const lobbiesSubscription = supabase
       .channel('passenger-requests-lobbies')
       .on(
         'postgres_changes',
         {
           event: '*',
           schema: 'public',
           table: 'shared_ride_lobbies'
         },
         (payload) => {
           console.log('📡 PassengerRequests: Shared ride lobby changed, reloading', payload.eventType);
           loadRequests();
         }
       )
       .subscribe();

     // Also poll for updates every 3 seconds as fallback
     const interval = setInterval(loadRequests, 3000);

     return () => {
       clearInterval(interval);
       supabase.removeChannel(rideRequestsSubscription);
       supabase.removeChannel(lobbiesSubscription);
       console.log('🔌 PassengerRequests: Cleaned up real-time subscriptions');
     };
   }, [user?.id]);

  const handleAcceptRequest = async (request: PassengerRequest) => {
    // 🚨 CRITICAL: Log what request is being accepted
    console.log('🚨🚨🚨 DRIVER ACCEPTING REQUEST 🚨🚨🚨');
    console.log('   Request ID:', request.id);
    console.log('   Request Type:', request.type);
    console.log('   Customer ID:', request.customerId);
    console.log('   Full request object:', request);

    if (!request.id) {
      console.error('❌❌❌ REQUEST HAS NO ID! THIS IS THE BUG! ❌❌❌');
    }

    if (!user?.id) {
      alert('You must be logged in as a driver to accept requests.');
      return;
    }

    const activeStatuses = ['accepted', 'on-the-way', 'arrived', 'in-progress'];

    // Check if driver already has an active shared lobby in Supabase
    if (user?.id) {
      try {
        const { data: allLobbies, error: lobbiesError } = await supabaseHelpers.getLobbies();
        if (!lobbiesError && allLobbies) {
          const driverActiveLobbies = allLobbies.filter((lobby: any) =>
            lobby.driver_id === user.id &&
            activeStatuses.includes(lobby.status)
          );

          if (driverActiveLobbies.length > 0) {
            alert('You already have an active ride. Please complete your current ride before accepting another.');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking driver lobbies:', error);
      }
    }

    // If it's a shared ride lobby, update lobby status in Supabase
    let passengerDetails = request.passengerDetails || [];
    if (request.lobbyId) {
      try {
        const { data: updatedLobby, error: acceptError } = await supabaseHelpers.acceptLobbyAsDriver(
          request.lobbyId,
          user?.id || '',
          user?.name || 'Driver',
          user?.todaPlate,
          '4.8'
        );

        if (acceptError) {
          console.error('Error accepting shared lobby:', acceptError);
          alert('Failed to accept shared ride lobby. Please try again.');
          return;
        }

        passengerDetails = Array.isArray(updatedLobby?.passengers_json) ? updatedLobby.passengers_json : passengerDetails;
      } catch (error) {
        console.error('Error updating lobby:', error);
        alert('Failed to update shared ride lobby. Please try again.');
        return;
      }
    }

    // Create an accepted ride record
    const acceptedRide = {
      ...request,
      passengerDetails,
      driverId: user?.id,
      driverName: user?.name,
      driverPlate: user?.todaPlate,
      driverRating: '4.8',
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      eta: '5 mins',
    };

    // DEBUG: Log acceptedRide to verify lobbyId is included
    console.log('🎯 ACCEPTED RIDE CREATED:');
    console.log('   Type:', acceptedRide.type);
    console.log('   ID:', acceptedRide.id);
    console.log('   Lobby ID:', acceptedRide.lobbyId);
    console.log('   Full accepted ride:', acceptedRide);

    // Navigate to active ride page
    navigate('/rider/active-ride', { state: { acceptedRide } });
  };

  const handleDeclineRequest = async (request: PassengerRequest) => {
    if (!request.id || request.lobbyId) return;

    const { error } = await supabase
      .from('ride_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', request.id);

    if (error) {
      console.error('❌ Failed to decline request:', error);
      alert('Failed to decline request. Please try again.');
      return;
    }

    setRequests((prev) => prev.filter((req) => req.id !== request.id));
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

  // Filter requests based on driver's active service types
  const requestsMatchingServiceTypes = filteredRequests.filter(request => {
    const driverActiveTypes = user?.serviceTypes || ['shared', 'delivery'];
    return driverActiveTypes.includes(request.type);
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
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-3">

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

        {requestsMatchingServiceTypes.map((request) => (
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

                  {request.type === 'delivery' && request.payment === 'COD' && Number(request.foodCost || 0) > 0 && (
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

                  {request.type === 'delivery' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleDeclineRequest(request)}
                        variant="outline"
                        className="border-[#E11D48] text-[#E11D48] uppercase"
                      >
                        Decline
                      </Button>
                      <Button
                        onClick={() => handleAcceptRequest(request)}
                        className="bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                      >
                        Accept
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleAcceptRequest(request)}
                      className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase"
                    >
                      Accept Request
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}

        {/* Empty State */}
        {requestsMatchingServiceTypes.length === 0 && (
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