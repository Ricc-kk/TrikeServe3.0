import { useState, useEffect, useRef } from "react";
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
  LogOut,
  Camera,
  Palette
} from "lucide-react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import ActiveRideButton from "./ActiveRideButton";
import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";

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
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Maximum size is 5MB.');
      return;
    }

    setUploadingPhoto(true);
    try {
      const result = await supabaseHelpers.uploadProfilePhoto(user.id, file);
      if (result?.data?.publicUrl) {
        await updateProfile({ avatarUrl: result.data.publicUrl });
      } else {
        alert('Failed to upload photo. Please try again.');
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setShowConfirmSave(true);
  };

  const confirmSave = async () => {
    setShowConfirmSave(false);
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
      <div className="min-h-screen bg-[var(--muted)] flex items-center justify-center">
        <p className="text-[var(--muted-foreground)]">Loading...</p>
      </div>
    );
  }

  const joinDate = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-[var(--muted)]">
      {/* Header */}
      <div className="bg-[var(--primary)] px-4 py-4 sticky top-0 z-50">
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
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-bold text-sm px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                variant="ghost"
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-bold text-sm px-4 py-2 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-surface text-[var(--primary)] hover:bg-white/90 font-bold text-sm px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {/* Profile Header */}
        <div className="flex flex-col items-center">
          <div className="relative mb-3">
            <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-4 border-white/30 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-white" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute bottom-0 right-0 w-9 h-9 bg-[var(--teal)] rounded-full flex items-center justify-center shadow-lg border-3 border-white hover:bg-[var(--teal)] transition-colors"
            >
              {uploadingPhoto ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
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
              <Badge className="bg-[var(--success)] text-white border-0">
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
          <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--primary)]" />
            Personal Information
          </h2>
          
          <div className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border border-line rounded-lg text-base font-semibold text-[var(--ink)] focus:border-[var(--primary)] outline-none"
                  placeholder="Enter your full name"
                />
              ) : (
                <p className="text-base font-semibold text-[var(--ink)]">{user.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                Email Address
              </label>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
                <p className="text-base text-[var(--ink)]">{user.email}</p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Email cannot be changed</p>
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                Phone Number
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-2 border border-line rounded-lg text-base text-[var(--ink)] focus:border-[var(--primary)] outline-none"
                  placeholder="09XX XXX XXXX"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <p className="text-base text-[var(--ink)]">{user.phone}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Driver Information */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
            <Car className="w-5 h-5 text-[var(--primary)]" />
            Driver Information
          </h2>
          
          <div className="space-y-4">
            {/* TODA Plate Number */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                TODA Plate Number
              </label>
              <div className="flex items-center gap-2">
                <div className="px-3 py-2 bg-[var(--muted)] rounded-lg">
                  <p className="text-base font-bold text-[var(--ink)] tracking-wider">
                    {user.todaPlate || "Not provided"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Visit the TrikeServe office to update</p>
            </div>

            {/* Driver's License Number */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                Driver's License Number
              </label>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[var(--muted-foreground)]" />
                <p className="text-base font-mono text-[var(--ink)]">
                  {user.licenseNumber || "Not provided"}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Visit the TrikeServe office to update</p>
            </div>

            {/* Verification Status */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 block">
                Verification Status
              </label>
              <div className={`px-4 py-3 rounded-lg ${
                user.isVerified 
                  ? 'bg-[var(--success-soft)] border-2 border-[var(--success)]' 
                  : 'bg-[var(--amber-soft)] border-2 border-[var(--amber)]'
              }`}>
                <div className="flex items-center gap-2">
                  {user.isVerified ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                      <div>
                        <p className="text-sm font-bold text-[var(--success)]">Verified Driver</p>
                        <p className="text-xs text-[var(--success)] mt-0.5">
                          Your account has been verified by TrikeServe admin
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-5 h-5 text-[var(--amber)]" />
                      <div>
                        <p className="text-sm font-bold text-[var(--amber)]">Pending Verification</p>
                        <p className="text-xs text-[var(--amber)] mt-0.5">
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
            <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[var(--primary)]" />
              Assigned Terminal
            </h2>
            <div className="bg-[var(--primary-soft)] border-2 border-[var(--primary)]/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--primary)] rounded-full flex items-center justify-center">
                  <span className="text-white text-lg">🚏</span>
                </div>
                <div>
                  <p className="font-bold text-[var(--ink)] text-lg">{user.terminalName || terminalData?.name}</p>
                  {terminalData?.boundary && (
                    <p className="text-sm text-[var(--muted-foreground)]">{terminalData.boundary}</p>
                  )}
                </div>
              </div>
            </div>
            {/* Terminal Map */}
            {terminalData && isMapsLoaded && (
              <div className="rounded-xl overflow-hidden border border-line" style={{ height: 200 }}>
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
          <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[var(--primary)]" />
            Operating Locations & Services
          </h2>
          
          <div className="space-y-4">
            {/* Service Types */}
            <div>
              <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-3 block">
                Active Service Types
              </label>
              <div className="flex flex-wrap gap-2">
                {user.serviceTypes && user.serviceTypes.length > 0 ? (
                  user.serviceTypes.map((service) => (
                    <Badge
                      key={service}
                      className="bg-[var(--primary)] text-white capitalize px-3 py-1.5"
                    >
                      {service === 'shared' ? '👥 Ride Share' : service === 'delivery' ? '📦 Delivery' : '🚗 Private Ride'}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">No service types selected</p>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                <Link to="/rider/service-types" className="text-[var(--primary)] hover:underline font-semibold">
                  Manage Service Types
                </Link>
              </p>
            </div>

          </div>
        </Card>

        {/* Account Information */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--primary)]" />
            Account Information
          </h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[var(--muted-foreground)]">User ID</span>
              <span className="text-sm font-mono text-[var(--ink)]">{user.id.substring(0, 12)}...</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[var(--muted-foreground)]">Account Type</span>
              <span className="text-sm font-semibold text-[var(--primary)]">Driver</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[var(--muted-foreground)]">Member Since</span>
              <span className="text-sm text-[var(--ink)]">{joinDate}</span>
            </div>
          </div>
        </Card>

        {/* Appearance — Rider Admin / drivers get the bilingual gloss */}
        <Card className="p-5 border-0 shadow-md">
          <h2 className="text-lg font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5 text-[var(--primary)]" />
            Appearance
          </h2>
          <ThemeModeSwitcher bilingual />
        </Card>

        {/* Help Card */}
        <Card className="p-5 border-0 shadow-md bg-gradient-to-br from-[var(--primary)]/5 to-[var(--primary)]/5 border-2 border-[var(--primary)]/20">
          <h3 className="text-base font-bold text-[var(--ink)] mb-2">Need to update your documents?</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            If you need to update your TODA plate number or driver's license, please visit the TrikeServe office at:
          </p>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
            <p className="text-[var(--ink)] font-medium">
              Barangay Hall, Gen T Deleon, Valenzuela City<br />
              <span className="text-[var(--muted-foreground)] font-normal">Monday-Friday, 9:00 AM - 5:00 PM</span>
            </p>
          </div>
        </Card>

        {/* Switch UI Role (Driver -> Customer) */}
        <div>
          {user.role === 'rider' ? (
            <Button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full bg-[var(--success)] hover:bg-[var(--success)] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 shadow-md mb-3"
            >
              Use Customer App
            </Button>
          ) : (
            localStorage.getItem('trikeserve_original_role') && (
              <Button
                onClick={() => setShowSwitchConfirm(true)}
                className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 shadow-md mb-3"
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
          className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 shadow-md"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </Button>

        {/* Bottom spacing for safe area */}
        <div className="h-8" />
      </div>
      <ActiveRideButton />

      {/* Confirm Save Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-7 h-7 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--ink)]">Save Changes?</h3>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                Are you sure you want to update your profile information?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSave(false)}
                className="flex-1 py-3 text-sm font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl hover:bg-[var(--border)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--primary)] rounded-xl hover:bg-[var(--primary)] transition-colors"
              >
                Yes, Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch Confirmation Modal */}
      {showSwitchConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
            <div className="w-16 h-16 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <ArrowLeft className="w-8 h-8 text-[var(--info)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
              {localStorage.getItem('trikeserve_original_role') ? 'Switch Back?' : 'Switch to Customer App?'}
            </h3>
            <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
              {localStorage.getItem('trikeserve_original_role')
                ? 'You will return to the Driver app.'
                : 'You will be switched to the Customer app to browse and order food.'}
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowSwitchConfirm(false);
                  if (localStorage.getItem('trikeserve_original_role')) {
                    await restoreOriginalRole?.();
                    navigate('/rider');
                  } else {
                    localStorage.setItem('trikeserve_post_switch_route', '/customer');
                    switchUiRole && await switchUiRole('customer');
                    navigate('/customer');
                  }
                }}
                className="w-full py-3 bg-[var(--info)] text-white font-bold rounded-xl active:scale-95 transition-transform"
              >
                Yes, Switch
              </button>
              <button
                onClick={() => setShowSwitchConfirm(false)}
                className="w-full py-3 bg-[var(--muted)] text-[var(--muted-foreground)] font-bold rounded-xl active:scale-95 transition-transform"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goodbye Popup */}
      {showGoodbye && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-8 h-8 text-[var(--info)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Goodbye! 👋</h3>
            <p className="text-[var(--muted-foreground)] text-sm">See you soon, <span className="font-semibold text-[var(--ink)]">{user?.name || 'there'}</span></p>
            <div className="mt-6">
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div className="bg-[var(--info)] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 1.8s linear forwards' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}