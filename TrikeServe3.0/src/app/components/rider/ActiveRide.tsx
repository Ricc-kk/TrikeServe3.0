import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Navigation, User, Phone, MapPin, CheckCircle, Minimize2, Maximize2, Package, Users, Car, MessageCircle, Send, X } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";

type RideStatus = 'on-the-way' | 'arrived' | 'pickup' | 'drop-off' | 'payment';
type PassengerStatus = 'pending' | 'on-the-way' | 'arrived' | 'picked-up' | 'dropped-off';

interface PassengerInfo {
  id: string;
  name: string;
  emoji: string;
  pickup: string;
  pickupAddress?: string;
  status: PassengerStatus;
  arrivedAt?: string;
  pickedUpAt?: string;
}

interface ActiveRideData {
  id: string;
  type: 'delivery' | 'shared' | 'private';
  customerName: string;
  customerPhoto: string;
  customerPhone?: string;
  pickup: string;
  dropoff: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  payment: 'COD' | 'PREPAID';
  amount: number;
  foodCost?: number;
  distance: string;
  estimatedTime: string;
  passengers?: number;
  status: RideStatus;
  acceptedAt: string;
  customerId?: string;
  lobbyId?: string;
  passengerDetails?: PassengerInfo[];
}

export default function ActiveRide() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [rideData, setRideData] = useState<ActiveRideData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeMessaging, setActiveMessaging] = useState<PassengerInfo | null>(null);

  useEffect(() => {
    // Load active ride from localStorage or route state
    const loadActiveRide = async () => {
      if (location.state?.acceptedRide) {
        const ride = {
          ...location.state.acceptedRide,
          status: 'on-the-way' as RideStatus
        };
        setRideData(ride);

        console.log('🚨🚨🚨 DRIVER ACCEPTED RIDE 🚨🚨🚨');
        console.log('   Ride ID:', ride.id);
        console.log('   Ride Type:', ride.type);
        console.log('   Customer ID:', ride.customerId);

        // Save to localStorage for persistence
        localStorage.setItem('trikeserve_active_ride', JSON.stringify(ride));

        // Update DATABASE with driver info and "on-the-way" status for ALL ride types
        if (ride.customerId && ride.id && user?.id) {
          console.log('📤 Updating DATABASE with driver acceptance...');
          try {
            const { error } = await supabaseHelpers.acceptRideRequest(
              ride.id,
              user.id,
              user.user_metadata?.full_name || 'Driver',
              user.user_metadata?.avatar_url
            );

            if (error) {
              console.error('❌ Error accepting ride in database:', error);
            } else {
              console.log('✅ DATABASE UPDATED: Driver accepted ride');

              // Now update driver status to "on-the-way"
              await supabaseHelpers.updateDriverRideStatus(
                ride.id,
                'on-the-way',
                'Driver is on the way to pick you up!'
              );
              console.log('✅ DATABASE UPDATED: Driver status set to on-the-way');
            }
          } catch (error) {
            console.error('❌ Exception accepting ride:', error);
          }
        }
      } else {
        // ...existing code...
      }
    };

    loadActiveRide();
  }, [location.state, navigate, user]);

  useEffect(() => {
    // Update localStorage when ride data changes
    if (rideData) {
      localStorage.setItem('trikeserve_active_ride', JSON.stringify(rideData));
    }
  }, [rideData]);

  const updateStatus = (newStatus: RideStatus) => {
    if (!rideData) return;

    const updatedRide = { ...rideData, status: newStatus };
    setRideData(updatedRide);

    console.log('🚨 DRIVER STATUS BUTTON CLICKED');
    console.log('   New Status:', newStatus);
    console.log('   Ride ID:', rideData.id);
    console.log('   Customer ID:', rideData.customerId);

    // Update database with new driver status (Option 2 - Database-Driven)
    if (rideData.id) {
      console.log('📤 Updating DATABASE with new driver status...');
      updateRideStatusInDatabase(rideData.id, newStatus);
    }
  };

  // Update ride status in database for customer to see
  const updateRideStatusInDatabase = async (rideId: string, driverDisplayStatus: RideStatus) => {
    try {
      // Map display statuses to database driver_status values
      const statusMap: { [key in RideStatus]: string } = {
        'on-the-way': 'on-the-way',
        'arrived': 'arrived',
        'pickup': 'picked-up',
        'drop-off': 'dropped-off',
        'payment': 'awaiting-payment'
      };

      const messageMap: { [key in RideStatus]: string } = {
        'on-the-way': 'Driver is on the way to pick you up!',
        'arrived': 'Driver has arrived at pickup location!',
        'pickup': 'You have been picked up. Enjoy your ride!',
        'drop-off': 'You have arrived at your destination!',
        'payment': 'Please complete the payment.'
      };

      const dbStatus = statusMap[driverDisplayStatus];
      const statusMessage = messageMap[driverDisplayStatus];

      console.log('🔄 UPDATING DATABASE DRIVER STATUS');
      console.log('   Ride ID:', rideId);
      console.log('   New Driver Status:', dbStatus);
      console.log('   Message:', statusMessage);

      // Update the ride request with driver status
      const { data, error } = await supabaseHelpers.updateDriverRideStatus(rideId, dbStatus, statusMessage);

      if (error) {
        console.error('❌ Error updating database:', error);
      } else {
        console.log('✅ DATABASE UPDATED SUCCESSFULLY');
        console.log('   Updated record:', data);
      }
    } catch (error) {
      console.error('❌ Exception updating database:', error);
    }
  };


  // Update ride request status in database
  const updateRideRequestStatus = async (rideId: string, status: string) => {
    try {
      // Map display status to database status
      let dbStatus = 'in_progress';
      if (status === 'arrived') {
        dbStatus = 'in_progress';
      } else if (status === 'pickup') {
        dbStatus = 'in_progress';
      } else if (status === 'drop-off') {
        dbStatus = 'completed';
      }

      const { error } = await supabaseHelpers.updateRideRequest(rideId, {
        status: dbStatus,
        updated_at: new Date().toISOString()
      });

      if (error) {
        console.error('❌ Error updating ride status in database:', error);
      } else {
        console.log('✅ Ride status updated in database:', dbStatus);
      }
    } catch (error) {
      console.error('❌ Error updating ride request status:', error);
    }
  };

  const updatePassengerStatus = (passengerId: string, newStatus: PassengerStatus) => {
    if (!rideData || !rideData.passengerDetails) return;

    // Check if this is a companion
    const isCompanion = passengerId.includes('_companion_');
    
    // If updating a companion, also update their main passenger and all companions in the group
    // If updating a main passenger, also update all their companions
    const mainPassengerId = isCompanion 
      ? passengerId.split('_companion_')[0] 
      : passengerId;

    const updatedPassengers = rideData.passengerDetails.map(p => {
      // Update the clicked passenger OR any passenger in the same group (main + companions)
      const pMainId = p.id.includes('_companion_') 
        ? p.id.split('_companion_')[0] 
        : p.id;
      
      if (pMainId === mainPassengerId) {
        const updatedPassenger = { ...p, status: newStatus };
        if (newStatus === 'arrived') {
          updatedPassenger.arrivedAt = new Date().toISOString();
        } else if (newStatus === 'picked-up') {
          updatedPassenger.pickedUpAt = new Date().toISOString();
        }
        return updatedPassenger;
      }
      return p;
    });

    const updatedRide = { ...rideData, passengerDetails: updatedPassengers };
    setRideData(updatedRide);

    // Send status update to customer (for ALL ride types)
    if (rideData.customerId) {
      let statusMapForCustomer = '';
      let statusMessage = '';

      if (newStatus === 'arrived') {
        statusMapForCustomer = 'arrived';
        statusMessage = 'Driver has arrived at your pickup location!';
      } else if (newStatus === 'picked-up') {
        statusMapForCustomer = 'pickup';
        statusMessage = 'You\'ve been picked up! On the way to your destination.';
      } else if (newStatus === 'dropped-off') {
        statusMapForCustomer = 'drop-off';
        statusMessage = 'You\'ve arrived at your destination!';
      }

      if (statusMapForCustomer) {
        const statusUpdateKey = `driver_status_${rideData.id}`;
        const statusUpdate = {
          status: statusMapForCustomer,
          message: statusMessage,
          timestamp: Date.now()
        };
        localStorage.setItem(statusUpdateKey, JSON.stringify(statusUpdate));

        // Debug logging
        console.log('📤 Driver Status Update Sent:');
        console.log('   Ride ID:', rideData.id);
        console.log('   Ride Type:', rideData.type);
        console.log('   Status Key:', statusUpdateKey);
        console.log('   Status:', statusMapForCustomer);
        console.log('   Message:', statusMessage);
        console.log('   Customer ID:', rideData.customerId);

        // Trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: statusUpdateKey,
          newValue: JSON.stringify(statusUpdate)
        }));

        // Also dispatch custom event for same-tab sync
        window.dispatchEvent(new CustomEvent('custom-storage-change', {
          detail: { key: statusUpdateKey, value: statusUpdate }
        }));

        // Update database with status change
        updateRideRequestStatus(rideData.id, statusMapForCustomer);
      }
    }

    // Sync with lobby data
    if (rideData.lobbyId) {
      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (lobbiesData) {
        try {
          let lobbies = JSON.parse(lobbiesData);
          const lobbyIndex = lobbies.findIndex((l: any) => l.id === rideData.lobbyId);
          
          if (lobbyIndex >= 0) {
            lobbies[lobbyIndex].passengers = updatedPassengers;
            localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));
            
            // Trigger storage event for cross-tab sync
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'trikeserve_share_lobbies',
              newValue: JSON.stringify(lobbies)
            }));
          }
        } catch (error) {
          console.error('Error updating lobby:', error);
        }
      }
    }
  };

  const getPassengerStatusColor = (status: PassengerStatus) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-600 border-gray-300';
      case 'on-the-way': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'arrived': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'picked-up': return 'bg-green-100 text-green-700 border-green-300';
      case 'dropped-off': return 'bg-purple-100 text-purple-700 border-purple-300';
      default: return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  const getPassengerStatusLabel = (status: PassengerStatus) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'on-the-way': return 'On the way';
      case 'arrived': return 'Arrived';
      case 'picked-up': return 'Picked up';
      case 'dropped-off': return 'Dropped off';
      default: return status;
    }
  };

  const completeRide = async () => {
    if (!rideData) return;

    try {
      // 1. UPDATE DATABASE STATUS TO 'COMPLETED' (ALL RIDE TYPES)
      if (rideData.id) {
        const { error: updateError } = await supabaseHelpers.updateRideRequest(
          rideData.id,
          { status: 'completed' }
        );

        if (updateError) {
          console.error('❌ Error updating ride status in database:', updateError);
        } else {
          console.log('✅ Ride status updated to completed in database');
        }
      }

      // 2. SEND COMPLETION STATUS TO CUSTOMER IMMEDIATELY
      if (rideData.customerId) {
        const statusUpdateKey = `driver_status_${rideData.id}`;
        const statusUpdate = {
          status: 'completed',
          message: 'Your ride has been completed! Thank you for using TrikeServe.',
          timestamp: Date.now(),
          completedAt: new Date().toISOString()
        };
        localStorage.setItem(statusUpdateKey, JSON.stringify(statusUpdate));

        // Trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: statusUpdateKey,
          newValue: JSON.stringify(statusUpdate)
        }));

        console.log('✅ Completion status sent to customer');
      }

      // 3. ADD TO COMPLETED RIDES HISTORY (SO CUSTOMER CAN SEE IT)
      const completedRidesKey = 'trikeserve_completed_rides';
      const existingCompletedRides = localStorage.getItem(completedRidesKey);
      const completedRides = existingCompletedRides ? JSON.parse(existingCompletedRides) : [];

      completedRides.push({
        ...rideData,
        completedAt: new Date().toISOString(),
        status: 'completed'
      });

      localStorage.setItem(completedRidesKey, JSON.stringify(completedRides));

      // Trigger storage event for cross-tab sync
      window.dispatchEvent(new StorageEvent('storage', {
        key: completedRidesKey,
        newValue: JSON.stringify(completedRides)
      }));

      console.log('✅ Ride added to completed rides history');
    } catch (error) {
      console.error('❌ Error completing ride:', error);
    }

    // Clear active ride
    localStorage.removeItem('trikeserve_active_ride');

    // Remove from accepted rides
    const acceptedRidesData = localStorage.getItem('trikeserve_accepted_rides');
    if (acceptedRidesData) {
      try {
        let acceptedRides = JSON.parse(acceptedRidesData);
        // Filter out this completed ride
        acceptedRides = acceptedRides.filter((ride: any) => ride.id !== rideData.id);
        localStorage.setItem('trikeserve_accepted_rides', JSON.stringify(acceptedRides));
        
        // Trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'trikeserve_accepted_rides',
          newValue: JSON.stringify(acceptedRides)
        }));
      } catch (error) {
        console.error('Error removing from accepted rides:', error);
      }
    }

    // If it's a shared ride, update lobby status to completed
    if (rideData.lobbyId) {
      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (lobbiesData) {
        try {
          let lobbies = JSON.parse(lobbiesData);
          const lobbyIndex = lobbies.findIndex((l: any) => l.id === rideData.lobbyId);
          
          if (lobbyIndex >= 0) {
            lobbies[lobbyIndex].status = 'completed';
            lobbies[lobbyIndex].completedAt = new Date().toISOString();
            localStorage.setItem('trikeserve_share_lobbies', JSON.stringify(lobbies));
            
            // Trigger storage event for cross-tab sync
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'trikeserve_share_lobbies',
              newValue: JSON.stringify(lobbies)
            }));
          }
        } catch (error) {
          console.error('Error updating lobby:', error);
        }
      }
    }

    // Add to ride history
    const historyKey = `ride_history_${user?.id}`;
    const existingHistory = localStorage.getItem(historyKey);
    const history = existingHistory ? JSON.parse(existingHistory) : [];
    history.push({
      ...rideData,
      completedAt: new Date().toISOString(),
      status: 'completed'
    });
    localStorage.setItem(historyKey, JSON.stringify(history));

    // Send completion notification to all passengers
    if (rideData.passengerDetails) {
      rideData.passengerDetails.forEach(passenger => {
        const customerId = passenger.id.split('_companion_')[0]; // Get base customer ID
        const customerNotificationsKey = `notifications_${customerId}`;
        const existingNotifications = localStorage.getItem(customerNotificationsKey);
        const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];

        const notification = {
          id: `ride-${rideData.id}-completed-${passenger.id}`,
          type: 'ride',
          title: `Ride Completed`,
          message: 'Your ride has been completed. Thank you for using TrikeServe!',
          time: 'Just now',
          timestamp: Date.now(),
          unread: true,
          icon: '🎉',
        };

        notifications.unshift(notification);
        localStorage.setItem(customerNotificationsKey, JSON.stringify(notifications));
      });
    } else if (rideData.customerId) {
      // For non-shared rides
      const customerNotificationsKey = `notifications_${rideData.customerId}`;
      const existingNotifications = localStorage.getItem(customerNotificationsKey);
      const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];

      const notification = {
        id: `ride-${rideData.id}-completed`,
        type: 'ride',
        title: `Ride Completed`,
        message: 'Your ride has been completed. Thank you for using TrikeServe!',
        time: 'Just now',
        timestamp: Date.now(),
        unread: true,
        icon: '🎉',
      };

      notifications.unshift(notification);
      localStorage.setItem(customerNotificationsKey, JSON.stringify(notifications));
    }

    console.log('✅ Ride completed successfully');

    // Navigate back to dashboard
    navigate('/rider');
  };

  const getStatusSteps = () => {
    const steps: { status: RideStatus; label: string }[] = [
      { status: 'on-the-way', label: 'On The Way' },
      { status: 'arrived', label: 'Arrived' },
      { status: 'pickup', label: 'Pickup' },
      { status: 'drop-off', label: 'Drop Off' },
      { status: 'payment', label: 'Payment' }
    ];
    return steps;
  };

  const getStatusIndex = (status: RideStatus) => {
    const steps = getStatusSteps();
    return steps.findIndex(s => s.status === status);
  };

  const getServiceIcon = (type?: string) => {
    if (!type) return <Users className="w-6 h-6 text-[#E11D48]" />;
    switch(type) {
      case 'delivery': return <Package className="w-6 h-6 text-[#E11D48]" />;
      case 'shared': return <Users className="w-6 h-6 text-[#E11D48]" />;
      case 'private': return <Car className="w-6 h-6 text-[#E11D48]" />;
      default: return <Users className="w-6 h-6 text-[#E11D48]" />;
    }
  };

  const getServiceLabel = (type?: string) => {
    if (!type) return 'RIDE';
    switch(type) {
      case 'delivery': return 'DELIVERY';
      case 'shared': return 'RIDE SHARE';
      case 'private': return 'PRIVATE RIDE';
      default: return type.toUpperCase();
    }
  };

  if (!rideData) {
    return null;
  }

  // Full Page View
  const currentStatusIndex = getStatusIndex(rideData.status);
  const steps = getStatusSteps();

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-[#E11D48] text-white px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/rider')}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-extrabold" style={{ letterSpacing: '-0.02em' }}>
            Active {rideData.type === 'delivery' ? 'Delivery' : 'Ride'}
          </h1>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsMinimized(true)}
            className="text-white hover:bg-white/20"
          >
            <Minimize2 className="w-5 h-5" />
          </Button>
        </div>

        {/* Status Progress */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            {steps.map((step, index) => (
              <div key={step.status} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 transition-all ${
                    index <= currentStatusIndex 
                      ? 'bg-white text-[#E11D48]' 
                      : 'bg-white/20 text-white/50'
                  }`}
                >
                  {index < currentStatusIndex ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-bold">{index + 1}</span>
                  )}
                </div>
                <p className={`text-xs text-center ${
                  index <= currentStatusIndex ? 'text-white font-semibold' : 'text-white/50'
                }`}>
                  {step.label}
                </p>
                {index < steps.length - 1 && (
                  <div 
                    className={`absolute h-0.5 -mt-[30px] transition-all ${
                      index < currentStatusIndex ? 'bg-white' : 'bg-white/20'
                    }`}
                    style={{
                      width: 'calc(20% - 40px)',
                      left: `calc(${(index * 20) + 10}% + 20px)`
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Customer Info Card */}
        <Card className="p-4 border-2 border-[#E2E8F0]">
          <div className="flex items-start gap-4 mb-4">
            <div className="text-5xl">{rideData.customerPhoto}</div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-bold text-[#121212]">{rideData.customerName}</h3>
                  <Badge className="bg-[#E11D48] mt-1">
                    {getServiceLabel(rideData.type)}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#E11D48]">₱{rideData.amount}</p>
                  <Badge variant="outline" className={rideData.payment === 'COD' ? 'border-orange-500 text-orange-500' : 'border-green-500 text-green-500'}>
                    {rideData.payment}
                  </Badge>
                </div>
              </div>
              {rideData.customerPhone && (
                <a href={`tel:${rideData.customerPhone}`}>
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <Phone className="w-4 h-4 mr-2" />
                    Call Customer
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Location Details */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E11D48] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                <Navigation className="w-4 h-4 text-[#E11D48]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Pickup</p>
                <p className="font-semibold text-[#121212]">{rideData.pickup}</p>
                {rideData.pickupAddress && (
                  <p className="text-sm text-[#64748B] mt-0.5">{rideData.pickupAddress}</p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#64748B] mb-1">Drop-off</p>
                <p className="font-semibold text-[#121212]">{rideData.dropoff}</p>
                {rideData.dropoffAddress && (
                  <p className="text-sm text-[#64748B] mt-0.5">{rideData.dropoffAddress}</p>
                )}
              </div>
            </div>
          </div>

          {/* Delivery Special Info */}
          {rideData.type === 'delivery' && rideData.payment === 'COD' && rideData.foodCost && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-900">
                <span className="font-semibold">⚠️ Collect from customer:</span> ₱{rideData.foodCost + rideData.amount}
              </p>
              <p className="text-xs text-orange-700 mt-1">
                (₱{rideData.foodCost} food + ₱{rideData.amount} delivery)
              </p>
            </div>
          )}

          {/* Shared Ride Info */}
          {rideData.type === 'shared' && rideData.passengers && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">👥 Passengers:</span> {rideData.passengers}
              </p>
            </div>
          )}
        </Card>

        {/* Individual Passengers Section - For Shared Rides */}
        {rideData.passengerDetails && rideData.passengerDetails.length > 0 && (
          <Card className="p-4 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <h3 className="font-bold text-[#121212] mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Passengers ({rideData.passengerDetails.length})
            </h3>
            <div className="space-y-3">
              {rideData.passengerDetails.map((passenger, index) => {
                // Check if this is a companion (not a main passenger)
                const isCompanion = passenger.id.includes('_companion_');
                
                return (
                  <div key={passenger.id} className="bg-white rounded-xl p-3 border-2 border-purple-100">
                    {/* Passenger Header */}
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-3xl">{passenger.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-bold text-[#121212]">{passenger.name}</p>
                          {index === 0 && (
                            <Badge className="bg-purple-500 text-white text-[9px] px-1.5 py-0">HOST</Badge>
                          )}
                          {isCompanion && (
                            <Badge className="bg-gray-400 text-white text-[9px] px-1.5 py-0">COMPANION</Badge>
                          )}
                        </div>
                        <Badge className={`text-[10px] border ${getPassengerStatusColor(passenger.status)}`}>
                          {getPassengerStatusLabel(passenger.status)}
                        </Badge>
                      </div>
                    </div>

                    {/* Pickup Location */}
                    <div className="bg-blue-50 rounded-lg p-2 mb-2 border border-blue-100">
                      <div className="flex gap-2">
                        <Navigation className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-blue-600 font-semibold">Pickup Location</p>
                          <p className="text-sm font-semibold text-[#121212]">{passenger.pickup}</p>
                          {passenger.pickupAddress && (
                            <p className="text-xs text-[#64748B] mt-0.5">{passenger.pickupAddress}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Actions */}
                    <div className="space-y-2">
                      {/* Message Button - Only show for main passengers, not companions */}
                      {!isCompanion && (
                        <Button
                          onClick={() => navigate(`/rider/messages/${rideData.id}/${passenger.id}`)}
                          variant="outline"
                          size="sm"
                          className="w-full border-purple-300 text-purple-700 hover:bg-purple-50 uppercase text-xs"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message {passenger.name}
                        </Button>
                      )}
                      
                      {/* Companion Info Message */}
                      {isCompanion && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
                          <p className="text-xs text-gray-600">
                            💡 Companions share status with main passenger
                          </p>
                        </div>
                      )}
                      
                      {passenger.status === 'pending' && (
                        <Button
                          onClick={() => updatePassengerStatus(passenger.id, 'on-the-way')}
                          size="sm"
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white uppercase text-xs"
                        >
                          Start Journey to {passenger.name}
                        </Button>
                      )}

                      {passenger.status === 'on-the-way' && (
                        <Button
                          onClick={() => updatePassengerStatus(passenger.id, 'arrived')}
                          size="sm"
                          className="w-full bg-yellow-500 hover:bg-yellow-600 text-white uppercase text-xs"
                        >
                          Arrived at Pickup
                        </Button>
                      )}

                      {passenger.status === 'arrived' && (
                        <Button
                          onClick={() => updatePassengerStatus(passenger.id, 'picked-up')}
                          size="sm"
                          className="w-full bg-green-500 hover:bg-green-600 text-white uppercase text-xs"
                        >
                          Confirm Pickup
                        </Button>
                      )}

                      {passenger.status === 'picked-up' && !rideData.passengerDetails?.every(p => p.status === 'picked-up') && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                          <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
                          <p className="text-xs text-green-700 font-semibold">Passenger on Board</p>
                        </div>
                      )}

                      {passenger.status === 'picked-up' && rideData.passengerDetails?.every(p => p.status === 'picked-up') && (
                        <Button
                          onClick={() => updatePassengerStatus(passenger.id, 'dropped-off')}
                          size="sm"
                          className="w-full bg-purple-500 hover:bg-purple-600 text-white uppercase text-xs"
                        >
                          Drop Off {passenger.name}
                        </Button>
                      )}

                      {passenger.status === 'dropped-off' && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-center">
                          <CheckCircle className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                          <p className="text-xs text-purple-700 font-semibold">Dropped Off</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Completion Check */}
            {rideData.passengerDetails.every(p => p.status === 'picked-up') && (
              <div className="mt-3 p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                <p className="text-sm text-green-900 font-semibold text-center">
                  ✅ All passengers picked up! Proceed to drop-off location.
                </p>
              </div>
            )}

            {/* All Dropped Off - Complete Ride */}
            {rideData.passengerDetails.every(p => p.status === 'dropped-off') && (
              <div className="mt-3 space-y-3">
                <div className="p-3 bg-purple-50 border-2 border-purple-300 rounded-lg">
                  <p className="text-sm text-purple-900 font-semibold text-center">
                    🎉 All passengers dropped off!
                  </p>
                </div>
                
                {rideData.payment === 'PREPAID' ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                    <p className="font-semibold text-green-900">Payment Already Received</p>
                    <p className="text-sm text-green-700">This ride was prepaid</p>
                  </div>
                ) : (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="font-semibold text-orange-900 mb-2">Collect Payment</p>
                    <p className="text-2xl font-bold text-orange-900 mb-1">₱{rideData.amount}</p>
                    <p className="text-xs text-orange-700">Split between {rideData.passengerDetails.length} passengers</p>
                  </div>
                )}

                <Button
                  onClick={completeRide}
                  className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6 text-lg"
                >
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Complete Ride
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Trip Details */}
        <Card className="p-4 border-2 border-[#E2E8F0]">
          <h3 className="font-bold text-[#121212] mb-3">Trip Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#F8F9FA] rounded-lg">
              <p className="text-xs text-[#64748B] mb-1">Distance</p>
              <p className="text-lg font-bold text-[#121212]">{rideData.distance}</p>
            </div>
            <div className="p-3 bg-[#F8F9FA] rounded-lg">
              <p className="text-xs text-[#64748B] mb-1">Est. Time</p>
              <p className="text-lg font-bold text-[#121212]">{rideData.estimatedTime}</p>
            </div>
          </div>
        </Card>

        {/* Action Buttons Based on Status */}
        <div className="space-y-2">
          {rideData.status === 'on-the-way' && (
            <Button
              onClick={() => updateStatus('arrived')}
              className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              I've Arrived
            </Button>
          )}

          {rideData.status === 'arrived' && (
            <Button
              onClick={() => updateStatus('pickup')}
              className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Confirm Pickup
            </Button>
          )}

          {rideData.status === 'pickup' && (
            <Button
              onClick={() => updateStatus('drop-off')}
              className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Arrived at Drop-off
            </Button>
          )}

          {rideData.status === 'drop-off' && (
            <Button
              onClick={() => updateStatus('payment')}
              className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase py-6"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Confirm Drop-off
            </Button>
          )}

          {rideData.status === 'payment' && (
            <div className="space-y-3">
              {rideData.payment === 'PREPAID' ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-green-900">Payment Already Received</p>
                  <p className="text-sm text-green-700">This ride was prepaid</p>
                </div>
              ) : (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="font-semibold text-orange-900 mb-2">Collect Payment</p>
                  <p className="text-2xl font-bold text-orange-900 mb-1">₱{rideData.amount}</p>
                  {rideData.type === 'delivery' && rideData.foodCost && (
                    <p className="text-sm text-orange-700">
                      + ₱{rideData.foodCost} for food = ₱{rideData.amount + rideData.foodCost}
                    </p>
                  )}
                </div>
              )}
              
              <Button
                onClick={completeRide}
                className="w-full bg-[#10B981] hover:bg-[#059669] uppercase py-6"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Ride
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messaging Modal */}
      {activeMessaging && rideData && (
        <PassengerMessaging
          passengerId={activeMessaging.id}
          passengerName={activeMessaging.name}
          passengerEmoji={activeMessaging.emoji}
          rideId={rideData.id}
          onClose={() => setActiveMessaging(null)}
        />
      )}
    </div>
  );
}