import { ChevronRight, Home as HomeIcon, MessageCircle, User, ShoppingCart, ClipboardList, ArrowLeft, LogOut, Shield, Bell, HelpCircle, Pencil, Heart, Check, MapPin } from "lucide-react";

import { uploadErrorMessage } from "@/lib/uploadErrors";
import { Link, useNavigate } from "react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import BottomNav from "../ui/BottomNav";
import GoodbyeOverlay from "../ui/GoodbyeOverlay";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import MapSelector from "./MapSelector";
import { getDefaultAddress, setDefaultAddress, type DefaultAddress } from "@/lib/defaultAddress";
import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";

export default function Account() {
  const navigate = useNavigate();
  const { user, logout, restoreOriginalRole } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || "User",
    mobile: user?.phone || "",
    email: user?.email || "",
  });
  const [showGoodbye, setShowGoodbye] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Customer's default delivery address, set from the map (search or tap).
  const [showAddressMap, setShowAddressMap] = useState(false);
  const [defaultAddress, setDefaultAddressState] = useState<DefaultAddress | null>(
    () => getDefaultAddress(user?.id, user?.email)
  );
  const [addressSaved, setAddressSaved] = useState(false);

  // Reload when the signed-in user resolves or changes.
  useEffect(() => {
    setDefaultAddressState(getDefaultAddress(user?.id, user?.email));
  }, [user?.id, user?.email]);

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
        const { error } = await supabase
          .from('users')
          .update({ avatar_url: result.data.publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) throw error;
      } else {
        // Surface the actual cause (missing bucket, RLS, size) instead of a
        // message that gives the customer nothing to act on.
        alert(uploadErrorMessage(result?.error));
      }
    } catch (err) {
      console.error('Photo upload error:', err);
      alert(uploadErrorMessage(err));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    setShowGoodbye(true);
  };

  const handleSaveProfile = () => {
    setShowConfirmSave(true);
  };

  const confirmSaveProfile = async () => {
    setShowConfirmSave(false);
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      setShowSaved(true);
      setTimeout(() => {
        setShowSaved(false);
        setIsEditing(false);
      }, 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--muted)] pb-24">
      {/* Gradient Header with Profile */}
      <div className="relative bg-[var(--primary)] px-5 pt-6 pb-6 rounded-b-2xl shadow-lg">
        <div className="relative flex flex-col items-center">
          {/* Profile Photo */}
          <div className="relative mb-2">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-lg overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-white" />
              )}
            </div>
            {/* Photo editing lives on /customer/edit-profile. Nothing here is editable,
                so a camera badge on the avatar would only invite a tap that
                does nothing on a read-only screen. */}
          </div>

          {/* User Name & Email */}
          <h1 className="text-white text-base font-bold">{formData.name}</h1>
          <p className="text-white/70 text-[11px]">{formData.email || "No email set"}</p>

          {/* Editing lives on its own screen now. */}
          <button
            onClick={() => navigate('/customer/edit-profile')}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/20 px-5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30 active:scale-[0.99]"
          >
            <Pencil className="w-4 h-4" />
            Edit profile
          </button>
        </div>
      </div>

      {/* Content Sections */}
      <div className="px-5 mt-2 space-y-4">

        {/* Quick Actions Card */}
        <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">

          <Link to="/customer/notifications">
            <div className="flex items-center justify-between p-4 hover:bg-[var(--muted)] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[var(--amber)] to-[var(--amber)] rounded-xl flex items-center justify-center shadow-sm">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Notifications</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Manage your alerts</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--border)]" />
            </div>
          </Link>

          <Link to="/customer/help">
            <div className="flex items-center justify-between p-4 hover:bg-[var(--muted)] transition-colors border-t border-[var(--muted)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[var(--success)] to-[var(--success)] rounded-xl flex items-center justify-center shadow-sm">
                  <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Help &amp; Support</p>
                  <p className="text-xs text-[var(--muted-foreground)]">FAQs and contact us</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--border)]" />
            </div>
          </Link>
        </div>
        <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[var(--muted-foreground)]" />
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] tracking-wider">Delivery Address</h3>
          </div>

          <button
            onClick={() => setShowAddressMap(true)}
            className="w-full flex items-center gap-3 p-4 text-left bg-[var(--muted)] border border-[var(--border)] rounded-xl active:scale-[0.98] transition-transform"
          >
            <MapPin className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {defaultAddress ? (
                <>
                  <p className="font-semibold text-[var(--ink)] truncate">{defaultAddress.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">{defaultAddress.full}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[var(--ink)]">Set your default address</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Search or tap the map to pin it.</p>
                </>
              )}
            </div>
            <span className="text-xs font-semibold text-[var(--primary)] flex-shrink-0">
              {defaultAddress ? 'Change' : 'Set'}
            </span>
          </button>

          <p className="text-xs text-[var(--muted-foreground)] mt-3 leading-relaxed">
            Used automatically as the delivery address when you place an order.
          </p>
          {addressSaved && (
            <p className="text-xs text-[var(--success)] mt-2 font-semibold">Default address saved.</p>
          )}
        </div>

        {/* Personal Information Card */}
        <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] p-5">
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-[var(--muted-foreground)]" />
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] tracking-wider">Personal Information</h3>
          </div>

          {/* These are now read-only here. Editing happens on its own screen
              (/customer/edit-profile), reached from the button under the name,
              rather than mutating the account screen in place. */}
          <div className="mb-5">
            <p className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 tracking-wider">Name</p>
            <p className="w-full text-base font-medium text-[var(--ink)] pb-2 border-b border-[var(--border)]">
              {formData.name || 'Not set'}
            </p>
          </div>

          <div className="mb-5">
            <p className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 tracking-wider">Mobile Number</p>
            <p className="w-full text-base font-medium text-[var(--ink)] pb-2 border-b border-[var(--border)]">
              {formData.mobile || 'Not set'}
            </p>
          </div>

          <div>
            <p className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 tracking-wider">Email</p>
            <p className="w-full text-base font-medium text-[var(--ink)] pb-2 border-b border-[var(--border)]">
              {formData.email || 'No email set'}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
              We'll reach out to you via email for account-related issues and product communication purposes.
            </p>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] p-4">
          <ThemeModeSwitcher bilingual />
        </div>

        {/* Switch Back to Driver/Business Button */}
        {localStorage.getItem('trikeserve_original_role') === 'rider' && (
          <div className="pt-2">
            <Button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              Switch back to Driver App
            </Button>
          </div>
        )}
        {localStorage.getItem('trikeserve_original_role') === 'business' && (
          <div className="pt-2">
            <Button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              Switch back to Business App
            </Button>
          </div>
        )}

        {/* Logout Button */}
        <div className="pt-2 pb-4">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-4 text-base font-semibold text-[var(--primary)] bg-[var(--primary-soft)] rounded-2xl hover:bg-[var(--primary-soft)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Log out
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav active="account" />

      {/* Confirm Save Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-[var(--teal)]" />
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
                onClick={confirmSaveProfile}
                className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--teal)] rounded-xl hover:bg-[var(--teal)] transition-colors"
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
            <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">Switch Back?</h3>
            <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
              {localStorage.getItem('trikeserve_original_role') === 'rider'
                ? 'You will return to the Driver app.'
                : 'You will return to the Business app.'}
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowSwitchConfirm(false);
                  const role = localStorage.getItem('trikeserve_original_role');
                  await restoreOriginalRole?.();
                  navigate(role === 'rider' ? '/rider' : '/business/account');
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

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
            <div className="w-16 h-16 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <LogOut className="w-8 h-8 text-[var(--primary)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">Logout</h3>
            <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
              Are you sure you want to logout?
            </p>
            <div className="space-y-3">
              <button
                onClick={handleLogout}
                className="w-full py-3 bg-[var(--primary)] text-white font-bold rounded-xl active:scale-95 transition-transform"
              >
                Yes, Logout
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
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
        <GoodbyeOverlay
          name={formData.name}
          subline={(name) => (
            <>See you again soon, <span className="font-semibold text-[var(--ink)]">{name}</span>! 👋</>
          )}
          icon={<Heart className="w-8 h-8 text-[var(--primary)]" />}
          accentSoft="var(--primary-soft)"
          accent="var(--primary)"
          onDone={() => {
            logout();
            navigate("/");
          }}
        />
      )}

      {/* Default Address Map Selector */}
      {showAddressMap && (
        <MapSelector
          onClose={() => setShowAddressMap(false)}
          onSelectLocation={(location) => {
            const addr: DefaultAddress = {
              name: location.name,
              full: location.full,
              lat: location.lat,
              lng: location.lng,
            };
            setDefaultAddress(addr, user?.id, user?.email);
            setDefaultAddressState(addr);
            setShowAddressMap(false);
            setAddressSaved(true);
            setTimeout(() => setAddressSaved(false), 3000);
          }}
          currentLocation={
            defaultAddress || {
              name: 'Select delivery address',
              full: 'Tap the map to place your pin',
              lat: 14.7244,
              lng: 120.9668,
            }
          }
        />
      )}
    </div>
  );
}