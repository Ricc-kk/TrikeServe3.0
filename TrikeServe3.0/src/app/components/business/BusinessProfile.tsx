import {
  ArrowLeft, Menu, Check, User, Mail, Phone, Store, MapPin, Save,
  Loader2, Clock, X, AlertTriangle, Camera
} from "lucide-react";
import { useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { useState, useRef } from "react";
import BusinessSidebar from "./BusinessSidebar";
import BusinessMapSelector from "./BusinessMapSelector";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "../../../lib/supabase";
import { useRestaurantProfile } from "@/lib/restaurantProfile";

export default function BusinessProfile() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/business/dashboard");
  const { user, updateProfile } = useAuth();
  const profile = useRestaurantProfile();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "staged">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  // Profile photo. Written straight to the users row rather than through
  // profile.save(), which stages shop edits for Super Admin review.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("That image is larger than 5MB. Please choose a smaller one.");
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoError(null);
    try {
      const result = await supabaseHelpers.uploadProfilePhoto(user.id, file);
      const publicUrl = result?.data?.publicUrl;
      if (!publicUrl) {
        setPhotoError("Could not upload the photo. Please try again.");
        return;
      }

      // Keep the in-memory user in step so the header avatar updates the moment
      // the upload lands, without waiting for a reload.
      await updateProfile({ avatarUrl: publicUrl });
      setAvatarUrl(publicUrl);
    } catch {
      setPhotoError("Could not upload the photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // Seeded from the shop row, not from the auth user, because `business_address`
  // on the user is only half the fact: the coordinates that the map picker
  // returns have no home on that row at all, which is why the pin was being
  // discarded every time this form was saved.
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    businessName: (user as any)?.businessName || "",
    businessAddress: (user as any)?.businessAddress || "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  // The form is only worth re-seeding once, when the shop row lands. Re-seeding
  // on every render would wipe whatever the owner is part-way through typing.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && profile.restaurant) {
    setSeeded(true);
    const r = profile.restaurant;
    setFormData((prev) => ({
      ...prev,
      businessName: r.name || prev.businessName,
      businessAddress: r.address || prev.businessAddress,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
    }));
  }

  const isPinned = typeof formData.latitude === "number" && typeof formData.longitude === "number";

  const handleSave = () => {
    setShowConfirmSave(true);
  };

  const confirmSave = async () => {
    setShowConfirmSave(false);
    if (!user?.id) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      // Contact details are the owner's own, and nobody else reads them, so
      // they still write straight through. The shop-facing fields go through
      // the shared writer, which stages them for Super Admin review.
      const { error: userError } = await supabase
        .from("users")
        .update({
          name: formData.name,
          phone: formData.phone,
          business_name: formData.businessName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (userError) {
        console.error("[BusinessProfile] Error updating user:", userError);
      }

      const result = await profile.save({
        name: formData.businessName,
        address: formData.businessAddress,
        latitude: formData.latitude,
        longitude: formData.longitude,
      });

      if (!result.ok) {
        setSaveError(result.error || "Could not save the shop details.");
        return;
      }

      await updateProfile({ name: formData.name, phone: formData.phone });

      setSaveState(result.staged ? "staged" : "saved");
      setTimeout(() => setSaveState("idle"), 4000);
    } catch (err) {
      console.error("[BusinessProfile] Save error:", err);
      setSaveError("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const withdraw = async () => {
    setIsSaving(true);
    const result = await profile.withdraw();
    setIsSaving(false);
    if (!result.ok) {
      setSaveError(result.error || "Could not withdraw the change.");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--muted)] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 w-full min-w-0">
        {/* Header */}
        <div className="bg-surface px-3 lg:px-4 py-3 lg:py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden flex-shrink-0"
            >
              <Menu className="w-5 h-5 text-[var(--ink)]" />
            </button>

            {/* Back Button */}
            <button
              onClick={goBack}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--ink)]" />
            </button>

            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[var(--ink)]">Edit Profile</h1>
            </div>
          </div>
          <p className="text-xs lg:text-sm text-[var(--muted-foreground)] ml-7 lg:ml-11">Update your business and personal information</p>
        </div>

        {/* Profile Header Section */}
        <div className="relative bg-[var(--primary)] px-4 lg:px-6 py-6 lg:py-8">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 lg:w-20 lg:h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/30 shadow-lg overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your profile photo" className="size-full object-cover" />
                ) : (
                  <User className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
                )}
              </div>
              {/* Camera badge. Deliberately outside the staged-save flow below:
                  a profile photo is the owner's own likeness, it is not shown
                  to customers as shop information, and gating it behind Super
                  Admin review would mean a shop logo change and a face change
                  are treated as equally risky. They are not. */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isUploadingPhoto || isSaving}
                aria-label="Change profile photo"
                className="absolute -bottom-1.5 -right-1.5 grid size-8 place-items-center rounded-full bg-white text-[var(--primary)] shadow-lg ring-2 ring-[var(--primary)] transition-transform active:scale-90 disabled:opacity-60"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg lg:text-xl font-bold text-white truncate">{formData.businessName || formData.name || "Business"}</h2>
              <p className="text-white/80 text-xs lg:text-sm">{formData.email}</p>
              {photoError && (
                <p className="mt-1 text-xs font-semibold text-white" role="alert">{photoError}</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-6 py-5 space-y-5">
          {/* A staged change is not live. Saying so, with a way back, beats
              letting the owner save and watch the storefront ignore them. */}
          {profile.hasPending && (
            <div className="rounded-2xl border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)] p-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--amber-ink)] text-sm">Waiting for Super Admin approval</p>
                  <p className="text-sm text-[var(--amber-ink)] mt-0.5 break-words">
                    These shop details go live only once they are approved. Customers still see the previous ones.
                  </p>
                  {profile.pendingValues?.address && (
                    <p className="text-xs text-[var(--amber-ink)] mt-1 break-words">
                      Proposed address: {profile.pendingValues.address}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={withdraw}
                    disabled={isSaving}
                    className="mt-2 min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--amber)] text-[var(--amber-ink)] font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <X className="w-4 h-4" aria-hidden="true" /> Withdraw change
                  </button>
                </div>
              </div>
            </div>
          )}

          {saveError && (
            <div className="rounded-2xl border-2 border-[var(--error-soft)] bg-[var(--error-soft)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-[var(--error)] break-words">{saveError}</p>
              </div>
            </div>
          )}

          {/* Personal Information */}
          <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] tracking-wider">Personal Information</h3>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">Full Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--primary-soft)] rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-14 pr-4 py-3 border border-line rounded-xl text-sm font-semibold text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none transition-colors"
                    placeholder="Enter your full name"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">Email</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--success-soft)] rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-[var(--success)]" />
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    readOnly
                    className="w-full pl-14 pr-4 py-3 border border-line rounded-xl text-sm text-[var(--muted-foreground)] bg-[var(--muted)] cursor-not-allowed"
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Email cannot be changed</p>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">Phone Number</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--info-soft)] rounded-lg flex items-center justify-center">
                    <Phone className="w-4 h-4 text-[var(--info)]" />
                  </div>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-14 pr-4 py-3 border border-line rounded-xl text-sm font-semibold text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none transition-colors"
                    placeholder="Enter your phone number"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] tracking-wider">Business Information</h3>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-4">
              {/* Business Name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">Business Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-[var(--primary-soft)] rounded-lg flex items-center justify-center">
                    <Store className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full pl-14 pr-4 py-3 border border-line rounded-xl text-sm font-semibold text-[var(--ink)] focus:border-[var(--primary)] focus:outline-none transition-colors"
                    placeholder="e.g., Mang Inasal"
                  />
                </div>
              </div>

              {/* Business Address (Pickup Location) */}
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-1.5">
                  Pickup Location <span className="text-[var(--muted-foreground)] font-normal">(for food deliveries)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowMapSelector(true)}
                  className="w-full text-left relative"
                >
                  <div className="absolute left-3 top-3 w-8 h-8 bg-[var(--info-soft)] rounded-lg flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-[var(--info)]" />
                  </div>
                  <div className="w-full pl-14 pr-4 py-3 border border-line rounded-xl text-sm font-semibold text-[var(--ink)] min-h-[80px] bg-surface hover:border-[var(--primary)] transition-colors">
                    {formData.businessAddress ? (
                      <span className="text-[var(--ink)]">{formData.businessAddress}</span>
                    ) : (
                      <span className="text-[var(--muted-foreground)] font-normal">Tap to select pickup location on map</span>
                    )}
                  </div>
                </button>
                {/* The coordinates are half of this fact and used to be dropped
                    on the floor. Showing them makes that impossible to miss. */}
                <p className="text-xs text-[var(--muted-foreground)] mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {isPinned
                    ? `Pinned at ${formData.latitude!.toFixed(5)}, ${formData.longitude!.toFixed(5)}`
                    : "Not pinned yet — your shop sorts last in “near you” lists"}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Click to open map and select your business pickup point
                </p>
              </div>

              {/* Map Selector Modal */}
              {showMapSelector && (
                <BusinessMapSelector
                  onClose={() => setShowMapSelector(false)}
                  onSelectLocation={(loc) => {
                    // The lat/lng used to be dropped here: only the address text
                    // survived, so the map and the saved address disagreed.
                    setFormData({
                      ...formData,
                      businessAddress: loc.full,
                      latitude: loc.lat,
                      longitude: loc.lng,
                    });
                    setShowMapSelector(false);
                  }}
                  currentAddress={formData.businessAddress}
                  initialLat={formData.latitude}
                  initialLng={formData.longitude}
                />
              )}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 text-base font-bold text-white bg-[var(--primary)] rounded-2xl hover:bg-[var(--primary)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : saveState === "staged" ? (
              <>
                <Clock className="w-5 h-5" />
                Sent for approval
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="w-5 h-5" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirm Save Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-[var(--primary)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--ink)]">Save Changes?</h3>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                Your name and phone save straight away. Your shop name and pickup location are
                sent to the Super Admin and go live once approved.
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
    </div>
  );
}
