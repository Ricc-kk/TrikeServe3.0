import { useState, useEffect } from "react";
import { Search, MapPin, Users, User as UserIcon, ChevronDown, X, Clock, CreditCard, Utensils, Search as SearchIcon, User, Navigation, MessageCircle, Bike, Home as HomeIcon, ShoppingCart, ClipboardList } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { GoogleMap, LoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import tricycleIcon from '../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png';
import { useAuth } from "../../contexts/AuthContext";
import SharedRides from "./SharedRides";
import ShareRideLobby from "./ShareRideLobby";
import LobbyList from "./LobbyList";

// Get Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function CustomerHome() {
  const { user } = useAuth();
  const [selectedVehicle, setSelectedVehicle] = useState<'share' | 'special' | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 }); // Default: Manila
  const [selectedMarker, setSelectedMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [activeLocationInput, setActiveLocationInput] = useState<'pickup' | 'dropoff' | null>(null);
  const [pickup, setPickup] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [showSharedRides, setShowSharedRides] = useState(false);
  const [showShareLobby, setShowShareLobby] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'GCASH'>('GCASH');
  const [activeRide, setActiveRide] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<'searching' | 'driver-found' | 'picking-up' | 'in-transit' | null>(null);
  const [isSearchMinimized, setIsSearchMinimized] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [currentSharedRideId, setCurrentSharedRideId] = useState<string | null>(null);
  const [showPassengerCount, setShowPassengerCount] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [showLobbyList, setShowLobbyList] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // Get user's current location on component mount
  useEffect(() => {
    setIsLoadingLocation(true);
    setLocationError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lng: longitude });
          setIsLoadingLocation(false);
          console.log('User location:', latitude, longitude);
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          setLocationError(error.message);
          setIsLoadingLocation(false);
          // Keep default location (Manila) if geolocation fails
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      console.warn('Geolocation not supported by browser');
      setLocationError('Geolocation not supported');
      setIsLoadingLocation(false);
    }
  }, []);

  // DEBUG: Clear all ride data
  const clearAllRideData = () => {
    if (confirm('Clear all lobbies and requests? This will reset the testing environment.')) {
      localStorage.removeItem('trikeserve_share_lobbies');
      localStorage.removeItem('trikeserve_ride_requests');
      localStorage.removeItem('trikeserve_active_ride');
      localStorage.removeItem('trikeserve_accepted_rides');
      
      // Reset component state
      setShowShareLobby(false);
      setShowSharedRides(false);
      setRideStatus(null);
      setActiveRide(null);
      setPickup('');
      setDropoff('');
      setPickupAddress('');
      setDropoffAddress('');
      setSelectedVehicle(null);
      
      alert('✅ All ride data cleared! You can now create a new lobby.');
      window.location.reload();
    }
  };

  // Load persisted ride data on mount
  useEffect(() => {
    const savedRideData = localStorage.getItem('trikeserve_active_ride');
    if (savedRideData) {
      try {
        const rideData = JSON.parse(savedRideData);
        setRideStatus(rideData.status);
        setPickup(rideData.pickup);
        setPickupAddress(rideData.pickupAddress);
        setDropoff(rideData.dropoff);
        setDropoffAddress(rideData.dropoffAddress);
        setSelectedVehicle(rideData.vehicleType);
        setPaymentMethod(rideData.paymentMethod);
        setCurrentRequestId(rideData.requestId);
        if (rideData.activeRide) {
          setActiveRide(rideData.activeRide);
        }
      } catch (error) {
        console.error('Error loading ride data:', error);
      }
    }

    // Check if user is in an active lobby
    const checkActiveLobby = () => {
      if (!user?.id) return;

      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (!lobbiesData) return;

      try {
        const lobbies = JSON.parse(lobbiesData);
        // Find lobby where user is a passenger (waiting OR driver-found status)
        const userLobby = lobbies.find((lobby: any) => 
          (lobby.status === 'waiting' || lobby.status === 'driver-found') &&
          lobby.passengers.some((p: any) => 
            p.id === user.id || p.id.startsWith(`${user.id}_companion_`)
          )
        );

        if (userLobby) {
          // User is already in a lobby, restore state
          setPickup(userLobby.pickup);
          setPickupAddress(userLobby.pickupAddress);
          setDropoff(userLobby.dropoff);
          setDropoffAddress(userLobby.dropoffAddress);
          setSelectedVehicle('share');
          
          // Count how many seats the user has (main + companions)
          const userSeats = userLobby.passengers.filter((p: any) => 
            p.id === user.id || p.id.startsWith(`${user.id}_companion_`)
          ).length;
          setPassengerCount(userSeats);
          
          // Show the lobby
          setShowShareLobby(true);
          console.log('✅ Restored active lobby:', userLobby.id, 'Status:', userLobby.status);
        }
      } catch (error) {
        console.error('Error checking active lobby:', error);
      }
    };

    checkActiveLobby();
  }, [user]);

  // Listen for accepted rides (polling + storage events)
  useEffect(() => {
    if (rideStatus !== 'searching' || !currentRequestId) return;

    const checkForAcceptedRide = () => {
      const acceptedRidesData = localStorage.getItem('trikeserve_accepted_rides');
      if (acceptedRidesData) {
        try {
          const acceptedRides = JSON.parse(acceptedRidesData);
          const myRide = acceptedRides.find((ride: any) => ride.id === currentRequestId);
          
          if (myRide) {
            // Driver accepted the ride!
            setActiveRide({
              driver: myRide.driverName || 'Driver',
              plateNumber: myRide.driverPlate || 'N/A',
              rating: myRide.driverRating || '4.8',
              eta: myRide.eta || '5 mins',
            });
            setRideStatus('driver-found');
            setIsSearchMinimized(false);
          }
        } catch (error) {
          console.error('Error checking accepted rides:', error);
        }
      }
    };

    // Check immediately
    checkForAcceptedRide();

    // Poll every 2 seconds
    const interval = setInterval(checkForAcceptedRide, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trikeserve_accepted_rides') {
        checkForAcceptedRide();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [rideStatus, currentRequestId]);

  // Persist ride data whenever it changes
  useEffect(() => {
    if (rideStatus) {
      const rideData = {
        status: rideStatus,
        pickup,
        pickupAddress,
        dropoff,
        dropoffAddress,
        vehicleType: selectedVehicle,
        paymentMethod,
        activeRide,
        requestId: currentRequestId,
      };
      localStorage.setItem('trikeserve_active_ride', JSON.stringify(rideData));
    } else {
      localStorage.removeItem('trikeserve_active_ride');
    }
  }, [rideStatus, pickup, pickupAddress, dropoff, dropoffAddress, selectedVehicle, paymentMethod, activeRide, currentRequestId]);

  // Count unread messages from drivers
  useEffect(() => {
    const countUnreadMessages = () => {
      if (!user?.id) return;
      
      let unreadCount = 0;
      
      // Scan localStorage for all chat keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chat_')) {
          try {
            const messages = JSON.parse(localStorage.getItem(key) || '[]');
            // Count unread messages from drivers (sent by riders)
            const unread = messages.filter((m: any) => 
              m.senderType === 'driver' && !m.read
            ).length;
            unreadCount += unread;
          } catch (error) {
            console.error('Error counting unread messages:', error);
          }
        }
      }
      
      setUnreadMessagesCount(unreadCount);
    };

    // Count initially
    countUnreadMessages();

    // Poll for updates every 2 seconds
    const interval = setInterval(countUnreadMessages, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('chat_')) {
        countUnreadMessages();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [user]);

  const popularLocations = [
    { name: "Tagalag Terminal", address: "Main Road, Tagalag", icon: "🚏" },
    { name: "Barangay Hall", address: "Tagalag Center", icon: "🏛️" },
    { name: "Tagalag Market", address: "Market District", icon: "🏪" },
    { name: "SM City North EDSA", address: "North Avenue - cor EDSA", icon: "🏬" },
    { name: "Carlo's Palabok", address: "Macarthur Highway, Karuhatan", icon: "🍜" },
  ];

  const handleLocationSelect = (location: any) => {
    if (activeLocationInput === 'pickup') {
      setPickup(location.name);
      setPickupAddress(location.address);
    } else if (activeLocationInput === 'dropoff') {
      setDropoff(location.name);
      setDropoffAddress(location.address);
    }
    setShowLocationPicker(false);
    setActiveLocationInput(null);
    setSearchQuery("");
  };

  const handleBookRide = () => {
    if (!selectedVehicle) return;
    
    // For shared rides, check if user is already in a lobby
    if (selectedVehicle === 'share') {
      const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
      if (lobbiesData) {
        try {
          const lobbies = JSON.parse(lobbiesData);
          const existingLobby = lobbies.find((lobby: any) => 
            lobby.status === 'waiting' &&
            lobby.passengers.some((p: any) => 
              p.id === user?.id || p.id.startsWith(`${user?.id}_companion_`)
            )
          );

          if (existingLobby) {
            // User is already in a lobby, show it instead of creating new
            alert('You are already in an active lobby. Please leave your current lobby before joining another.');
            setShowShareLobby(true);
            return;
          }
        } catch (error) {
          console.error('Error checking lobbies:', error);
        }
      }
    }
    
    // Ask for passenger count for both share and special rides
    setShowPassengerCount(true);
  };

  const handleConfirmBooking = () => {
    setShowBookingConfirm(false);
    
    // For share rides, open the lobby system
    if (selectedVehicle === 'share') {
      setShowShareLobby(true);
    } else {
      // For special rides, use the old system
      setRideStatus('searching');
      
      // Create ride request and add to localStorage for drivers to see
      const rideRequest = {
        id: `req_${Date.now()}`,
        type: 'private',
        pickup: pickup,
        dropoff: dropoff,
        pickupAddress: pickupAddress,
        dropoffAddress: dropoffAddress,
        payment: paymentMethod === 'GCASH' ? 'PREPAID' : 'COD',
        amount: getPrice(),
        passengers: passengerCount,
        customerName: user?.name || 'Customer',
        customerPhoto: '👤',
        distance: '2.5 km',
        estimatedTime: '7 mins',
      };

      const existingRequests = localStorage.getItem('trikeserve_ride_requests');
      let requests = [];
      if (existingRequests) {
        try {
          requests = JSON.parse(existingRequests);
        } catch (error) {
          console.error('Error parsing existing requests:', error);
        }
      }
      requests.push(rideRequest);
      localStorage.setItem('trikeserve_ride_requests', JSON.stringify(requests));
      setCurrentRequestId(rideRequest.id);
      
      console.log('✅ Ride request sent to drivers:', rideRequest);
    }
  };

  const handleCancelRide = () => {
    setActiveRide(null);
    setRideStatus(null);
    setCurrentRequestId(null);
  };

  const getPrice = () => {
    if (selectedVehicle === 'share') return 15;
    if (selectedVehicle === 'special') return 50;
    return 0;
  };

  const filteredLocations = popularLocations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {/* Full Screen Map */}
      <div className="absolute inset-0">
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <div className="text-center">
              <p className="text-xl font-bold text-red-600 mb-4">⚠️ Google Maps API Key Missing</p>
              <p className="text-gray-700 mb-4">To use Google Maps, please add your API key to .env.local</p>
            </div>
          </div>
        ) : (
          <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={["places"]}>
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={currentLocation}
              zoom={15}
              options={{
                zoomControl: false,
                fullscreenControl: true,
                streetViewControl: false,
                mapTypeControl: true,
              }}
            >
              {/* Current Location Marker */}
              <Marker
                position={currentLocation}
                onClick={() => setSelectedMarker(currentLocation)}
                title="Your location"
              />

              {/* Info Window for selected marker */}
              {selectedMarker && (
                <InfoWindow
                  position={selectedMarker}
                  onCloseClick={() => setSelectedMarker(null)}
                >
                  <div className="text-sm">
                    <p className="font-bold">Your current location</p>
                    <p className="text-gray-600">
                      {selectedMarker.lat.toFixed(4)}, {selectedMarker.lng.toFixed(4)}
                    </p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          </LoadScript>
        )}

        {/* Search Bar Overlay */}
        <div className="absolute top-4 left-4 right-4 z-[1000]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-12 pr-4 py-3.5 bg-white rounded-xl shadow-lg border-0 text-base"
                style={{ outline: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Sheet - Main Booking Interface */}
        {!activeRide && (
          <div className="absolute bottom-20 left-0 right-0 z-[999] px-4">
            <Card className="bg-white shadow-2xl rounded-t-3xl">
              <div className="px-5 pb-6 pt-6">
                {/* Vehicle Type Selection */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Share Ride */}
                  <button
                    onClick={() => setSelectedVehicle('share')}
                    className={`p-3 rounded-2xl border-2 transition-all ${
                      selectedVehicle === 'share'
                        ? 'border-[#E11D48] bg-[#FFF1F2]'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E2E8F0] flex items-center justify-center">
                        <Users className="w-10 h-10 text-[#121212]" />
                      </div>
                      <span className="font-bold text-sm text-[#121212]">Share Ride</span>
                    </div>
                  </button>

                  {/* Special Ride */}
                  <button
                    onClick={() => setSelectedVehicle('special')}
                    className={`p-3 rounded-2xl border-2 transition-all ${
                      selectedVehicle === 'special'
                        ? 'border-[#E11D48] bg-[#FFF1F2]'
                        : 'border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-[#E2E8F0] flex items-center justify-center">
                        <UserIcon className="w-10 h-10 text-[#121212]" />
                      </div>
                      <span className="font-bold text-sm text-[#121212]">Special Ride</span>
                    </div>
                  </button>
                </div>

                {/* Location Inputs */}
                <div className="space-y-3 mb-4">
                  {/* Pick up Location Label */}
                  <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide block mb-2">
                    Pick up location
                  </label>
                  
                  {/* Current Location */}
                  <Card 
                    className="p-3 border-2 border-[#E2E8F0] shadow-sm cursor-pointer hover:border-[#E11D48] transition-colors"
                    onClick={() => {
                      setActiveLocationInput('pickup');
                      setShowLocationPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[#121212]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#121212] mb-0.5">{pickup}</p>
                        <p className="text-xs text-[#64748B] truncate">{pickupAddress}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[#64748B]" />
                      </button>
                    </div>
                  </Card>

                  {/* Drop off Location Label */}
                  <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide block mb-2 mt-4">
                    Drop off location
                  </label>

                  {/* Destination */}
                  <Card 
                    className="p-3 border-2 border-[#E2E8F0] shadow-sm cursor-pointer hover:border-[#E11D48] transition-colors"
                    onClick={() => {
                      setActiveLocationInput('dropoff');
                      setShowLocationPicker(true);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <MapPin className="w-4 h-4 text-[#E11D48]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-[#121212] mb-0.5">{dropoff}</p>
                        <p className="text-xs text-[#64748B] truncate">{dropoffAddress}</p>
                      </div>
                      <button className="mt-0.5 flex-shrink-0">
                        <ChevronDown className="w-4 h-4 text-[#64748B]" />
                      </button>
                    </div>
                  </Card>
                </div>

                {/* Book Ride Button */}
                {selectedVehicle && (
                  <Button 
                    onClick={handleBookRide}
                    className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase rounded-xl"
                  >
                    Book {selectedVehicle === 'share' ? 'Share' : 'Special'} Ride - ₱{getPrice()}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Active Ride Card */}
        {activeRide && rideStatus === 'driver-found' && (
          <div className="absolute bottom-20 left-0 right-0 z-[1000] p-4">
            <Card className="bg-white shadow-2xl border-2 border-[#E11D48] p-6">
              {/* Driver Info */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center">
                  <span className="text-3xl">👨‍✈️</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-[#121212]">{activeRide.driver}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500 text-white">Driver Found</Badge>
                    <span className="text-sm text-[#64748B]">{activeRide.plateNumber}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-yellow-500 mb-1">
                    <span className="text-lg">⭐</span>
                    <span className="font-bold text-[#121212]">{activeRide.rating}</span>
                  </div>
                  <p className="text-sm text-[#64748B]">ETA: {activeRide.eta}</p>
                </div>
              </div>

              {/* Trip Info */}
              <div className="bg-[#F8F9FA] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#121212] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Pickup</p>
                    <p className="font-semibold text-sm text-[#121212]">{pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#64748B]">Drop-off</p>
                    <p className="font-semibold text-sm text-[#121212]">{dropoff}</p>
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#64748B]">Payment ({paymentMethod})</span>
                <span className="text-2xl font-bold text-[#E11D48]">₱{getPrice()}</span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </Button>
                <Button
                  onClick={handleCancelRide}
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  Cancel Ride
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-[1500]">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1 relative">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
            {unreadMessagesCount > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full border-2 border-white flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{unreadMessagesCount}</span>
              </div>
            )}
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#121212]">
                  {activeLocationInput === 'pickup' ? 'Pickup Location' : 'Drop-off Location'}
                </h2>
                <button onClick={() => {
                  setShowLocationPicker(false);
                  setActiveLocationInput(null);
                  setSearchQuery("");
                }}>
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>
              <Input
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
                autoFocus
              />
            </div>

            {/* Location List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {filteredLocations.map((location, idx) => (
                <button
                  key={idx}
                  onClick={() => handleLocationSelect(location)}
                  className="w-full text-left p-4 border-2 border-[#E2E8F0] rounded-xl hover:border-[#E11D48] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{location.icon}</span>
                    <div className="flex-1">
                      <p className="font-bold text-[#121212]">{location.name}</p>
                      <p className="text-sm text-[#64748B]">{location.address}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Passenger Count Modal (for Share Rides) */}
      {showPassengerCount && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[#121212] mb-2">How many passengers?</h2>
            <p className="text-sm text-[#64748B] mb-6">Select the number of seats you need for this trip.</p>

            {/* Passenger Count Selection */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[1, 2, 3].map(count => (
                <button
                  key={count}
                  onClick={() => setPassengerCount(count)}
                  className={`p-6 border-2 rounded-2xl transition-all ${
                    passengerCount === count
                      ? 'border-[#E11D48] bg-[#FFF1F2]'
                      : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: count }).map((_, i) => (
                        <span key={i} className="text-2xl">👤</span>
                      ))}
                    </div>
                    <span className="font-bold text-lg text-[#121212]">{count}</span>
                    <span className="text-xs text-[#64748B]">
                      {count === 1 ? 'passenger' : 'passengers'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Price Info */}
            <div className="bg-[#FFF7ED] border-2 border-[#FED7AA] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#92400E] uppercase tracking-wide font-semibold">Your Total Fare</p>
                  <p className="text-sm text-[#78350F] mt-0.5">
                    ₱15 × {passengerCount} {passengerCount === 1 ? 'seat' : 'seats'}
                  </p>
                </div>
                <p className="text-3xl font-bold text-[#EA580C]">₱{15 * passengerCount}</p>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <p className="text-xs text-blue-900">
                💡 <span className="font-semibold">Tip:</span> You'll join a shared lobby and wait for other passengers heading the same route. More passengers = faster match!
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setShowPassengerCount(false);
                  setShowBookingConfirm(true);
                }}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase"
              >
                Continue with {passengerCount} {passengerCount === 1 ? 'Seat' : 'Seats'}
              </Button>
              <Button
                onClick={() => {
                  setShowPassengerCount(false);
                  setShowLobbyList(true);
                }}
                variant="outline"
                className="w-full py-6 text-lg font-semibold border-2 border-[#E11D48] text-[#E11D48] hover:bg-[#FFF1F2]"
              >
                <Users className="w-5 h-5 mr-2" />
                Browse Available Lobbies
              </Button>
              <Button
                onClick={() => {
                  setShowPassengerCount(false);
                  setPassengerCount(1);
                }}
                variant="outline"
                className="w-full py-6 text-lg font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Confirmation Modal */}
      {showBookingConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6">
            <h2 className="text-2xl font-bold text-[#121212] mb-6">Confirm Booking</h2>

            {/* Trip Details */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-[#E11D48] mt-1" />
                <div>
                  <p className="text-sm text-[#64748B]">Pickup</p>
                  <p className="font-semibold text-[#121212]">{pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-green-600 mt-1" />
                <div>
                  <p className="text-sm text-[#64748B]">Drop-off</p>
                  <p className="font-semibold text-[#121212]">{dropoff}</p>
                </div>
              </div>
            </div>

            {/* Ride Type */}
            <div className="bg-[#FFF1F2] border-2 border-[#E11D48] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedVehicle === 'share' ? '🛵' : '🚙'}</span>
                  <div>
                    <p className="font-bold text-[#121212]">
                      {selectedVehicle === 'share' ? 'Share Ride' : 'Special Ride'}
                    </p>
                    <p className="text-sm text-[#64748B]">
                      {selectedVehicle === 'share' ? 'Shared with others' : 'Private ride'}
                    </p>
                  </div>
                </div>
                <p className="text-2xl font-bold text-[#E11D48]">₱{getPrice()}</p>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-[#64748B] mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod('GCASH')}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    paymentMethod === 'GCASH'
                      ? 'border-[#E11D48] bg-[#FFF1F2]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <CreditCard className="w-6 h-6 text-[#0066FF]" />
                    <span className="font-semibold text-[#121212]">GCash</span>
                  </div>
                </button>
                <button
                  onClick={() => setPaymentMethod('COD')}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    paymentMethod === 'COD'
                      ? 'border-[#E11D48] bg-[#FFF1F2]'
                      : 'border-[#E2E8F0]'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">💵</span>
                    <span className="font-semibold text-[#121212]">Cash</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleConfirmBooking}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] text-white py-6 text-lg font-bold uppercase"
              >
                Confirm Booking
              </Button>
              <Button
                onClick={() => setShowBookingConfirm(false)}
                variant="outline"
                className="w-full py-6 text-lg font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Searching for Driver Modal */}
      {rideStatus === 'searching' && !isSearchMinimized && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <Card className="bg-white p-8 max-w-sm w-full text-center relative">
            {/* Minimize Button */}
            <button
              onClick={() => setIsSearchMinimized(true)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors"
            >
              <ChevronDown className="w-5 h-5 text-[#64748B]" />
            </button>

            <div className="w-20 h-20 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <span className="text-4xl">🔍</span>
            </div>
            <h3 className="text-xl font-bold text-[#121212] mb-2">Finding a Driver...</h3>
            <p className="text-[#64748B] mb-6">Please wait while we find you a nearby driver</p>
            <Button
              onClick={handleCancelRide}
              variant="outline"
              className="w-full"
            >
              Cancel Request
            </Button>
          </Card>
        </div>
      )}

      {/* Minimized Floating Icon */}
      {rideStatus === 'searching' && isSearchMinimized && (
        <button
          onClick={() => setIsSearchMinimized(false)}
          className="fixed bottom-24 right-4 z-[2000] w-16 h-16 bg-[#E11D48] rounded-full shadow-2xl flex items-center justify-center hover:bg-[#BE123C] transition-all hover:scale-110"
        >
          <div className="relative">
            <span className="text-3xl animate-pulse">🔍</span>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
        </button>
      )}

      {/* Share Ride Lobby */}
      {showShareLobby && (
        <ShareRideLobby
          pickup={pickup}
          pickupAddress={pickupAddress}
          dropoff={dropoff}
          dropoffAddress={dropoffAddress}
          passengerCount={passengerCount}
          onDriverFound={(lobbyId) => {
            // Don't close the lobby - let customers see driver info in the lobby itself
            // Just update the status for tracking
            setRideStatus('driver-found');
            console.log('✅ Driver found for lobby:', lobbyId);
          }}
          onClose={() => {
            setShowShareLobby(false);
          }}
        />
      )}

      {/* Lobby List Modal */}
      {showLobbyList && (
        <LobbyList
          dropoff={dropoff}
          onJoinLobby={(lobby) => {
            // Set the user's pickup to their selected location
            // Join the lobby with the selected pickup
            setShowLobbyList(false);
            setShowShareLobby(true);
          }}
          onClose={() => {
            setShowLobbyList(false);
          }}
        />
      )}
    </div>
  );
}