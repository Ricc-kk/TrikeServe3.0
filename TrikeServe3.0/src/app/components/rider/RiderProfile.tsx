import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import {
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Car, 
  CreditCard, 
  Calendar,
  CheckCircle,
  Edit2,
  Save,
  X,
  LogOut
} from "lucide-react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { supabase } from "../../../utils/supabase";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import ActiveRideButton from "./ActiveRideButton";

export default function RiderProfile() {
  const navigate = useNavigate();
  const { user, updateProfile, logout, switchUiRole, restoreOriginalRole } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    todaPlate: user?.todaPlate || "",
    licenseNumber: user?.licenseNumber || "",
  });
  const [showGoodbye, setShowGoodbye] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    const result = await updateProfile(formData);
    
    if (result.success) {
      setIsEditing(false);
    }
    
    setIsSaving(false);
  };

  const [terminalData, setTerminalData] = useState<{ name: string; lat: number; lng: number; boundary: string } | null>(null);
  const { isLoaded: isMapsLoaded } = useMapLoader();

  // Fetch terminal details from DB - always check Supabase for fresh terminal assignment
  useEffect(() => {
    if (!user?.id) return;
    // First check if user has terminal_id in localStorage
    const terminalId = user.terminalId;
    if (terminalId) {
      supabase.from('terminals').select('name, center_lat, center_lng, boundary').eq('id', terminalId).single()
        .then(({ data }) => {
          if (data) {
            setTerminalData({ name: data.name, lat: data.center_lat || 14.7294, lng: data.center_lng || 120.9349, boundary: data.boundary || '' });
          }
        })
        .catch(() => {});
    } else {
      // No terminalId in localStorage - fetch fresh from DB in case it was assigned after login
      supabase.from('users').select('terminal_id, terminal_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.terminal_id) {
            // Update localStorage with fresh terminal info
            const stored = JSON.parse(localStorage.getItem('trikeserve_current_user') || '{}');
            stored.terminalId = data.terminal_id;
            stored.terminalName = data.terminal_name;
            localStorage.setItem('trikeserve_current_user', JSON.stringify(stored));
            // Fetch terminal details
            return supabase.from('terminals').select('name, center_lat, center_lng, boundary').eq('id', data.terminal_id).single();
          }
          return null;
        })
        .then(({ data }) => {
          if (data) {
            setTerminalData({ name: data.name, lat: data.center_lat || 14.7294, lng: data.center_lng || 120.9349, boundary: data.boundary || '' });
          }
        })
        .catch(() => {});
    }
  }, [user?.id, user?.terminalId]);

  const handleCancel = () => {
    setFormData({
      name: user?.name || "",
      phone: user?.phone || "",
      todaPlate: user?.todaPlate || "",
      licenseNumber: user?.licenseNumber || "",
      pickupLocation: user?.pickupLocation || "",
      dropoffLocation: user?.dropoffLocation || "",
    });
    setIsEditing(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <p className="text-[#64748B]">Loading...</p>
      </div>
    );
  }

  const joinDate = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate('/rider')}
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-bold uppercase text-sm px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                variant="ghost"
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-bold uppercase text-sm px-4 py-2 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-white text-[#E11D48] hover:bg-white/90 font-bold uppercase text-sm px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {/* Profile Header */}
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-4 border-white/30 mb-3">
            <User className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {user.name}
          </h1>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-white/20 backdrop-blur-sm text-white border-0">
              <Car className="w-3 h-3 mr-1" />
              Driver
            </Badge>
            {user.isVerified && (
              <Badge className="bg-[#10B981] text-white border-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
          <p className="text-white/80 text-sm">
            Member since {joinDate}
          </p>
        </div>
      </div>

      {/* Profile Information */}
      <div className="px-4 py-6 space-y-4">
        {/* Personal Information */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[#121212] mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[#E11D48]" />
            Personal Information
          </h2>
          
          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                Full Name
              </label>
              {isEditing ? (
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                  placeholder="Enter your full name"
                />
              ) : (
                <p className="text-base font-semibold text-[#121212]">{user.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                Email Address
              </label>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#64748B]" />
                <p className="text-base text-[#121212]">{user.email}</p>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">Email cannot be changed</p>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                Phone Number
              </label>
              {isEditing ? (
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full"
                  placeholder="09XX XXX XXXX"
                  type="tel"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#64748B]" />
                  <p className="text-base text-[#121212]">{user.phone}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Driver Information */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[#121212] mb-4 flex items-center gap-2">
            <Car className="w-5 h-5 text-[#E11D48]" />
            Driver Information
          </h2>
          
          <div className="space-y-4">
            {/* TODA Plate Number */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                TODA Plate Number
              </label>
              {isEditing ? (
                <Input
                  value={formData.todaPlate}
                  onChange={(e) => setFormData({ ...formData, todaPlate: e.target.value })}
                  className="w-full"
                  placeholder="e.g., ABC-1234"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 bg-[#F1F5F9] rounded-lg">
                    <p className="text-base font-bold text-[#121212] tracking-wider">
                      {user.todaPlate || "Not provided"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Driver's License Number */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                Driver's License Number
              </label>
              {isEditing ? (
                <Input
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                  className="w-full"
                  placeholder="e.g., N01-12-345678"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#64748B]" />
                  <p className="text-base font-mono text-[#121212]">
                    {user.licenseNumber || "Not provided"}
                  </p>
                </div>
              )}
            </div>

            {/* Verification Status */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2 block">
                Verification Status
              </label>
              <div className={`px-4 py-3 rounded-lg ${
                user.isVerified 
                  ? 'bg-[#D1FAE5] border-2 border-[#10B981]' 
                  : 'bg-[#FEF3C7] border-2 border-[#F59E0B]'
              }`}>
                <div className="flex items-center gap-2">
                  {user.isVerified ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-[#10B981]" />
                      <div>
                        <p className="text-sm font-bold text-[#10B981]">Verified Driver</p>
                        <p className="text-xs text-[#059669] mt-0.5">
                          Your account has been verified by TrikeServe admin
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-5 h-5 text-[#F59E0B]" />
                      <div>
                        <p className="text-sm font-bold text-[#F59E0B]">Pending Verification</p>
                        <p className="text-xs text-[#D97706] mt-0.5">
                          Please visit TrikeServe office at Barangay Hall with your documents
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Terminal Assignment */}
        {(user.terminalId || terminalData) && (
          <Card className="p-5 border-0 shadow-md">
            <h2 className="text-lg font-bold text-[#121212] mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#E11D48]" />
              Assigned Terminal
            </h2>
            <div className="bg-[#FFF1F2] border-2 border-[#E11D48]/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#E11D48] rounded-full flex items-center justify-center">
                  <span className="text-white text-lg">🚏</span>
                </div>
                <div>
                  <p className="font-bold text-[#121212] text-lg">{user.terminalName || terminalData?.name}</p>
                  {terminalData?.boundary && (
                    <p className="text-sm text-[#64748B]">{terminalData.boundary}</p>
                  )}
                </div>
              </div>
            </div>
            {/* Terminal Map */}
            {terminalData && isMapsLoaded && (
              <div className="rounded-xl overflow-hidden border-2 border-[#E2E8F0]" style={{ height: 200 }}>
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={{ lat: terminalData.lat, lng: terminalData.lng }}
                  zoom={15}
                  options={{
                    zoomControl: false,
                    fullscreenControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    scrollwheel: false,
                    draggable: false,
                  }}
                >
                  <MarkerF position={{ lat: terminalData.lat, lng: terminalData.lng }} />
                </GoogleMap>
              </div>
            )}
          </Card>
        )}

        {/* Operating Locations */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[#121212] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#E11D48]" />
            Operating Locations & Services
          </h2>
          
          <div className="space-y-4">
            {/* Service Types */}
            <div>
              <label className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3 block">
                Active Service Types
              </label>
              <div className="flex flex-wrap gap-2">
                {user.serviceTypes && user.serviceTypes.length > 0 ? (
                  user.serviceTypes.map((service) => (
                    <Badge
                      key={service}
                      className="bg-[#E11D48] text-white capitalize px-3 py-1.5"
                    >
                      {service === 'shared' ? '👥 Ride Share' : service === 'delivery' ? '📦 Delivery' : '🚗 Private Ride'}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-[#64748B]">No service types selected</p>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] mt-2">
                <Link to="/rider/service-types" className="text-[#E11D48] hover:underline font-semibold">
                  Manage Service Types
                </Link>
              </p>
            </div>

          </div>
        </Card>

        {/* Account Information */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[#121212] mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#E11D48]" />
            Account Information
          </h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#E2E8F0]">
              <span className="text-sm text-[#64748B]">User ID</span>
              <span className="text-sm font-mono text-[#121212]">{user.id.substring(0, 12)}...</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#E2E8F0]">
              <span className="text-sm text-[#64748B]">Account Type</span>
              <span className="text-sm font-semibold text-[#E11D48]">Driver</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[#64748B]">Member Since</span>
              <span className="text-sm text-[#121212]">{joinDate}</span>
            </div>
          </div>
        </Card>

        {/* Help Card */}
        <Card className="p-5 border-0 shadow-md bg-gradient-to-br from-[#E11D48]/5 to-[#BE123C]/5 border-2 border-[#E11D48]/20">
          <h3 className="text-base font-bold text-[#121212] mb-2">Need to update your documents?</h3>
          <p className="text-sm text-[#64748B] mb-3">
            If you need to update your TODA plate number or driver's license, please visit the TrikeServe office at:
          </p>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-[#E11D48] mt-0.5 flex-shrink-0" />
            <p className="text-[#121212] font-medium">
              Barangay Hall, Gen T Deleon, Valenzuela City<br />
              <span className="text-[#64748B] font-normal">Monday-Friday, 9:00 AM - 5:00 PM</span>
            </p>
          </div>
        </Card>

        {/* Switch UI Role (Driver -> Customer) */}
        <div>
          {user.role === 'rider' ? (
            <Button
              onClick={async () => {
                // Switch to customer UI so driver can place orders
                localStorage.setItem('trikeserve_post_switch_route', '/customer/food');
                switchUiRole && await switchUiRole('customer');
                // Fallback navigation (guard will already route using post-switch key)
                navigate('/customer/food');
              }}
              className="w-full bg-[#065f46] hover:bg-[#047857] text-white font-bold uppercase py-4 rounded-lg flex items-center justify-center gap-2 shadow-md mb-3"
            >
              Use Customer App
            </Button>
          ) : (
            // If user's UI has been switched, allow restoring original role
            localStorage.getItem('trikeserve_original_role') && (
              <Button
                onClick={async () => {
                  await restoreOriginalRole?.();
                  navigate('/rider');
                }}
                className="w-full bg-[#0f172a] hover:bg-[#111827] text-white font-bold uppercase py-4 rounded-lg flex items-center justify-center gap-2 shadow-md mb-3"
              >
                Switch back to Driver App
              </Button>
            )
          )}
        </div>

        {/* Sign Out Button */}
        <Button
          onClick={() => {
            // TEMPORARILY DISABLED FOR TESTING
            // Check if driver has active passengers
            // const activeRideData = localStorage.getItem('trikeserve_active_ride');
            // let hasActivePassengers = false;
            
            // if (activeRideData) {
            //   try {
            //     const activeRide = JSON.parse(activeRideData);
                
            //     // Check if there are passengers not yet dropped off
            //     if (activeRide.passengerDetails && activeRide.passengerDetails.length > 0) {
            //       hasActivePassengers = activeRide.passengerDetails.some((p: any) => 
            //         p.status !== 'dropped-off'
            //       );
            //     }
            //   } catch (error) {
            //     console.error('Error checking active ride:', error);
            //   }
            // }
            
            // // Also check lobbies
            // const lobbiesData = localStorage.getItem('trikeserve_share_lobbies');
            // if (lobbiesData && !hasActivePassengers) {
            //   try {
            //     const lobbies = JSON.parse(lobbiesData);
            //     const driverActiveLobby = lobbies.find((lobby: any) => 
            //       lobby.driverName === user?.name &&
            //       lobby.status !== 'completed' &&
            //       lobby.passengers.some((p: any) => p.status !== 'dropped-off')
            //     );
                
            //     if (driverActiveLobby) {
            //       hasActivePassengers = true;
            //     }
            //   } catch (error) {
            //     console.error('Error checking lobbies:', error);
            //   }
            // }
            
            // if (hasActivePassengers) {
            //   alert('⚠️ Cannot sign out while you have active passengers. Please complete all rides and drop off all passengers first.');
            //   return;
            // }
            
            setShowGoodbye(true);
            setTimeout(() => {
              logout();
              navigate('/');
            }, 2000);
          }}
          className="w-full bg-[#121212] hover:bg-[#2a2a2a] text-white font-bold uppercase py-4 rounded-lg flex items-center justify-center gap-2 shadow-md"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </Button>

        {/* Bottom spacing for safe area */}
        <div className="h-8" />
      </div>
      <ActiveRideButton />

      {/* Goodbye Popup */}
      {showGoodbye && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-[#DBEAFE] rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-8 h-8 text-[#3B82F6]" />
            </div>
            <h3 className="text-2xl font-bold text-[#121212] mb-2">Goodbye! 👋</h3>
            <p className="text-[#64748B] text-sm">See you soon, <span className="font-semibold text-[#121212]">{user?.name || 'there'}</span></p>
            <div className="mt-6">
              <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
                <div className="bg-[#3B82F6] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 1.8s linear forwards' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}