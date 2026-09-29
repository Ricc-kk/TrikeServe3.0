import { Camera, ChevronRight, Home as HomeIcon, MessageCircle, User, ShoppingCart, ClipboardList, ArrowLeft, LogOut, Shield, Bell, HelpCircle, Pencil, Heart, Check, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import BottomNav from "../ui/BottomNav";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";

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

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    setShowGoodbye(true);
    setTimeout(() => {
      logout();
      navigate("/");
    }, 2000);
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
      <div className="relative bg-gradient-to-br from-[var(--primary)] via-[var(--primary)] to-[var(--primary)] px-5 pt-6 pb-6 rounded-b-2xl shadow-lg">
        {/* Edit Profile Button - Top Right */}
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/30 transition-colors"
        >
          {isEditing ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Pencil className="w-3.5 h-3.5" /> Edit Profile</>}
        </button>

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
              className="absolute bottom-0 right-0 w-7 h-7 bg-[var(--teal)] rounded-full flex items-center justify-center shadow-md border-2 border-white hover:bg-[var(--teal)] transition-colors active:scale-95"
            >
              {uploadingPhoto ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-white" />
              )}
            </button>
          </div>

          {/* User Name & Email */}
          <h1 className="text-white text-base font-bold">{formData.name}</h1>
          <p className="text-white/70 text-[11px]">{formData.email || "No email set"}</p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="px-5 mt-2 space-y-4">

        {/* Quick Actions Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">

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
        </div>

        {/* Personal Information Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[var(--muted)] p-5">
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-[var(--muted-foreground)]" />
            <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Personal Information</h3>
          </div>

          {/* Name */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              readOnly={!isEditing}
              className={`w-full text-base font-medium text-[var(--ink)] pb-2 border-b border-[var(--border)] outline-none transition-colors bg-transparent ${isEditing ? 'focus:border-[var(--teal)]' : 'cursor-not-allowed'}`}
            />
          </div>

          {/* Mobile Number */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 uppercase tracking-wider">Mobile Number</label>
            <input
              type="text"
              value={formData.mobile}
              readOnly
              className="w-full text-base font-medium text-[var(--ink)] pb-2 border-b border-[var(--border)] bg-transparent cursor-not-allowed"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2 uppercase tracking-wider">Email</label>
            <input
              type="email"
              placeholder="Enter your email address"
              value={formData.email}
              readOnly={!isEditing}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={`w-full text-base font-medium text-[var(--ink)] placeholder:text-[var(--border)] pb-2 border-b border-[var(--border)] outline-none transition-colors bg-transparent ${isEditing ? 'focus:border-[var(--teal)]' : 'cursor-not-allowed'}`}
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-2 leading-relaxed">
              We'll reach out to you via email for account-related issues and product communication purposes.
            </p>
          </div>

          {/* Save Button - only visible in edit mode */}
          {isEditing && (
            <div className="mt-5">
              <button
                onClick={handleSaveProfile}
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
          )}
        </div>

        {/* Help Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">
          <div className="flex items-center justify-between p-4 hover:bg-[var(--muted)] transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[var(--teal)] to-[var(--teal)] rounded-xl flex items-center justify-center shadow-sm">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Help & Support</p>
                <p className="text-xs text-[var(--muted-foreground)]">FAQs and contact us</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--border)]" />
          </div>
        </div>

        {/* Switch Back to Driver/Business Button */}
        {localStorage.getItem('trikeserve_original_role') === 'rider' && (
          <div className="pt-2">
            <Button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full bg-[var(--ink)] hover:bg-[var(--ink)] text-white font-bold uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
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
              className="w-full bg-[var(--ink)] hover:bg-[var(--ink)] text-white font-bold uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
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
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
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
          <div className="bg-white p-6 max-w-sm w-full rounded-2xl shadow-xl">
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
          <div className="bg-white p-6 max-w-sm w-full rounded-2xl shadow-xl">
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
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-[var(--primary-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-[var(--primary)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Goodbye!</h3>
            <p className="text-[var(--muted-foreground)] text-sm">See you again soon, <span className="font-semibold text-[var(--ink)]">{formData.name}</span>! 👋</p>
            <div className="mt-6">
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div className="bg-[var(--primary)] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 2s linear forwards' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}