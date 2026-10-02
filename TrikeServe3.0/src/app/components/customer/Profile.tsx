import { X, Camera, ArrowLeft, Check, LogOut, User, MapPin } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { supabase } from "../../../lib/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import MapSelector from "./MapSelector";
import { getDefaultAddress, setDefaultAddress, type DefaultAddress } from "@/lib/defaultAddress";

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, restoreOriginalRole } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    mobile: user?.phone || "",
    email: user?.email || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
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

  const handleSave = () => {
    setShowConfirmSave(true);
  };

  const confirmSave = async () => {
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
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="sticky top-0 bg-surface z-10 px-5 py-4">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center -ml-2"
        >
          <X className="w-6 h-6 text-[var(--ink)]" />
        </button>
      </div>

      {/* Profile Photo Section */}
      <div className="flex flex-col items-center px-5 pb-6">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[var(--teal)]">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-12 h-12 text-white" />
              </div>
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
      </div>

      {/* Form Fields */}
      <div className="px-5 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-[var(--muted-foreground)] mb-2">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full text-base text-[var(--ink)] pb-2 border-b border-[var(--border)] focus:border-[var(--teal)] outline-none transition-colors"
          />
        </div>

        {/* Mobile Number */}
        <div>
          <label className="block text-sm text-[var(--muted-foreground)] mb-2">Mobile Number</label>
          <input
            type="text"
            value={formData.mobile}
            readOnly
            className="w-full text-base text-[var(--ink)] pb-2 border-b border-[var(--border)] bg-transparent"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm text-[var(--muted-foreground)] mb-2">Email</label>
          <input
            type="email"
            value={formData.email}
            readOnly
            className="w-full text-base text-[var(--ink)] pb-2 border-b border-[var(--border)] bg-transparent"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
            We'll reach out to you via email for account-related issues and product communication purposes.
          </p>
        </div>

        {/* Default Delivery Address */}
        <div>
          <label className="block text-sm text-[var(--muted-foreground)] mb-2">Delivery Address</label>
          <button
            onClick={() => setShowAddressMap(true)}
            className="w-full flex items-center gap-3 p-4 text-left bg-surface border border-[var(--border)] rounded-xl active:scale-[0.98] transition-transform"
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
          <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
            Used automatically as the delivery address when you place an order.
          </p>
          {addressSaved && (
            <p className="text-xs text-[var(--success)] mt-2 font-semibold">Default address saved.</p>
          )}
        </div>

      </div>



       {/* Switch Back to Driver/Business Button */}
       {localStorage.getItem('trikeserve_original_role') === 'rider' && (
         <div className="px-5 py-6">
           <Button
             onClick={() => setShowSwitchConfirm(true)}
             className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2"
           >
             <ArrowLeft className="w-5 h-5" />
             Switch back to Driver App
           </Button>
         </div>
       )}
       {localStorage.getItem('trikeserve_original_role') === 'business' && (
         <div className="px-5 py-6">
           <Button
             onClick={() => setShowSwitchConfirm(true)}
             className="w-full bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2"
           >
             <ArrowLeft className="w-5 h-5" />
             Switch back to Business App
           </Button>
         </div>
       )}

      {/* Save Button */}
      <div className="px-5 pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 text-base font-semibold text-white bg-[var(--teal)] rounded-2xl hover:bg-[var(--teal)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : showSaved ? (
            <><Check className="w-5 h-5" /> Saved!</>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>

      {/* Log out Button */}
      <div className="px-5 py-4">
        <button
          onClick={handleLogout}
          className="w-full py-3 text-base font-semibold text-[var(--primary)] bg-[var(--primary-soft)] rounded-2xl hover:bg-[var(--primary-soft)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Log out
        </button>
      </div>



      {/* Bottom spacing for navigation */}
      <div className="h-20" />

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

      {/* Confirm Save Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
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
                onClick={confirmSave}
                className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--teal)] rounded-xl hover:bg-[var(--teal)] transition-colors"
              >
                Yes, Save
              </button>
            </div>
          </div>
        </div>
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
