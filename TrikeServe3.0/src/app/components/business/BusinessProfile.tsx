import { ArrowLeft, Menu, Check, User, Mail, Phone, Store, MapPin, Save, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import BusinessSidebar from "./BusinessSidebar";
import BusinessMapSelector from "./BusinessMapSelector";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";

export default function BusinessProfile() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    businessName: (user as any)?.businessName || "",
    businessAddress: (user as any)?.businessAddress || "",
  });

  const handleSave = () => {
    setShowConfirmSave(true);
  };

  const confirmSave = async () => {
    setShowConfirmSave(false);
    if (!user?.id) return;
    setIsSaving(true);
    try {
      // Update the users table in Supabase
      const { error: userError } = await supabase
        .from("users")
        .update({
          name: formData.name,
          phone: formData.phone,
          business_name: formData.businessName,
          business_address: formData.businessAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (userError) {
        console.error("[BusinessProfile] Error updating user:", userError);
      }

      // Also update the restaurants table if a restaurant exists for this business
      try {
        const { data: restaurant } = await supabase
          .from("restaurants")
          .select("id")
          .eq("business_user_id", user.id)
          .single();

        if (restaurant) {
          const { error: restError } = await supabase
            .from("restaurants")
            .update({
              name: formData.businessName,
              address: formData.businessAddress,
              updated_at: new Date().toISOString(),
            })
            .eq("id", restaurant.id);

          if (restError) {
            console.error("[BusinessProfile] Error updating restaurant:", restError);
          }
        }
      } catch (restErr) {
        console.warn("[BusinessProfile] Restaurant update skipped:", restErr);
      }

      // Update local auth state via updateProfile
      await updateProfile({
        name: formData.name,
        phone: formData.phone,
        businessName: formData.businessName,
        businessAddress: formData.businessAddress,
      });

      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      console.error("[BusinessProfile] Save error:", err);
      alert("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
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
              onClick={() => navigate(-1)}
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
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/30 shadow-lg">
              <User className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg lg:text-xl font-bold text-white truncate">{formData.businessName || formData.name || "Business"}</h2>
              <p className="text-white/80 text-xs lg:text-sm">{formData.email}</p>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="px-4 lg:px-6 py-5 space-y-5">
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
                <p className="text-xs text-[var(--muted-foreground)] mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Click to open map and select your business pickup point
                </p>
              </div>

              {/* Map Selector Modal */}
              {showMapSelector && (
                <BusinessMapSelector
                  onClose={() => setShowMapSelector(false)}
                  onSelectLocation={(loc) => {
                    setFormData({ ...formData, businessAddress: loc.full });
                    setShowMapSelector(false);
                  }}
                  currentAddress={formData.businessAddress}
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
            ) : showSaved ? (
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
    </div>
  );
}
