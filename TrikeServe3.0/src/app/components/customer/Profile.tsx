import { X, Camera, ArrowLeft, Check, LogOut, MapPin } from "lucide-react";

import { uploadErrorMessage } from "@/lib/uploadErrors";
import { Link, useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { supabase } from "../../../lib/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import MapSelector from "./MapSelector";
import { getDefaultAddress, setDefaultAddress, type DefaultAddress } from "@/lib/defaultAddress";
import { getProfileInitials } from "@/lib/profileInitials";

export default function Profile() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/customer/account");
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
    <div className="min-h-screen bg-canvas text-[var(--ink)]">
      <div className="w-full px-4 pb-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex items-center gap-3 py-4 sm:py-6">
        <button 
          onClick={goBack}
          aria-label="Back to account"
          className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface"
        >
          <ArrowLeft className="size-5 text-[var(--ink)]" />
        </button>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Your account</p><h1 className="text-2xl font-extrabold tracking-tight">Profile</h1></div>
      </header>

      {/* Profile Photo Section */}
      <section className="mb-5 flex flex-col items-center gap-4 rounded-3xl bg-[var(--ink-solid)] p-6 text-center text-white">
        <div className="relative shrink-0">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[var(--teal)]">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-3xl font-extrabold text-white" aria-hidden="true">
                {getProfileInitials(user?.name, user?.email)}
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
            aria-label="Change profile photo"
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 w-11 h-11 bg-[var(--teal)] rounded-full flex items-center justify-center shadow-lg border-3 border-white hover:bg-[var(--teal)] transition-colors"
          >
            {uploadingPhoto ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)]">Made for you · Para sa iyo</p><h2 className="mt-2 break-words text-2xl font-extrabold tracking-tight">{user?.name || 'Your profile'}</h2><p className="mt-2 text-sm leading-relaxed text-white/75">Keep your details up to date for smoother rides and deliveries.</p><p className="mt-3 text-xs text-white/60">Tap the camera to update your photo · Up to 5 MB</p></div>
      </section>

      {/* Form Fields */}
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-extrabold">Personal details</h2>
      <p className="mb-5 mt-1 text-sm text-[var(--muted-foreground)]">Your contact information and go-to delivery spot.</p>
      <div className="grid grid-cols-1 gap-5">
        {/* Name */}
        <div>
          <label htmlFor="customer-profile-name" className="mb-2 block text-sm font-semibold">Full name</label>
          <input
            id="customer-profile-name"
            autoComplete="name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-[var(--ink)] outline-none transition-colors focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--teal)]"
          />
        </div>

        {/* Mobile Number */}
        <div>
          <label htmlFor="customer-profile-mobile" className="mb-2 block text-sm font-semibold">Mobile number <span className="font-normal text-[var(--muted-foreground)]">· Read only</span></label>
          <input
            id="customer-profile-mobile"
            type="tel"
            value={formData.mobile}
            readOnly
            className="min-h-12 w-full rounded-xl border border-line bg-[var(--muted)] px-3 text-base text-[var(--muted-foreground)]"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="customer-profile-email" className="mb-2 block text-sm font-semibold">Email <span className="font-normal text-[var(--muted-foreground)]">· Read only</span></label>
          <input
            id="customer-profile-email"
            type="email"
            value={formData.email}
            readOnly
            className="min-h-12 w-full rounded-xl border border-line bg-[var(--muted)] px-3 text-base text-[var(--muted-foreground)]"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
            We'll reach out to you via email for account-related issues and product communication purposes.
          </p>
        </div>

        {/* Default Delivery Address */}
        <div className="border-t border-line pt-5">
          <h3 className="mb-3 text-sm font-bold">Delivery address</h3>
          <button
            onClick={() => setShowAddressMap(true)}
            className="w-full flex items-center gap-3 p-4 text-left bg-surface border border-[var(--border)] rounded-xl active:scale-[0.98] transition-transform"
          >
            <MapPin className="w-5 h-5 text-[var(--primary)] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {defaultAddress ? (
                <>
                  <p className="font-semibold text-[var(--ink)] break-words">{defaultAddress.name}</p>
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)] break-words">{defaultAddress.full}</p>
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
      </section>

       {/* Switch Back to Driver/Business Button */}
       {localStorage.getItem('trikeserve_original_role') === 'rider' && (
         <div className="mt-5">
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
         <div className="mt-5">
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
      <div className="mt-5">
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
      <div className="mt-3">
        <button
          onClick={handleLogout}
          className="w-full py-3 text-base font-semibold text-[var(--primary)] bg-[var(--primary-soft)] rounded-2xl hover:bg-[var(--primary-soft)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Log out
        </button>
      </div>



      </div>

      {/* Switch Confirmation Modal */}
      {showSwitchConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl max-h-[90dvh] overflow-y-auto">
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
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full max-h-[90dvh] overflow-y-auto">
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
