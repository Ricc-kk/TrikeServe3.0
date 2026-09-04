import { X, Camera, ArrowLeft, Check, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import profilePlaceholder from "../../../assets/49624c6fb8f504041a2a91198a581a109cd5507d.png";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { supabase } from "../../../lib/supabase";

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

  const handleSave = async () => {
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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 px-5 py-4">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center -ml-2"
        >
          <X className="w-6 h-6 text-[#121212]" />
        </button>
      </div>

      {/* Profile Photo Section */}
      <div className="flex flex-col items-center px-5 pb-6">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[#18B5A4]">
            <img 
              src={profilePlaceholder} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          </div>
          <button className="absolute bottom-0 right-0 w-9 h-9 bg-[#18B5A4] rounded-full flex items-center justify-center shadow-lg border-3 border-white">
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>


      </div>

      {/* Form Fields */}
      <div className="px-5 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-[#64748B] mb-2">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full text-base text-[#121212] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors"
          />
        </div>

        {/* Mobile Number */}
        <div>
          <label className="block text-sm text-[#64748B] mb-2">Mobile Number</label>
          <input
            type="text"
            value={formData.mobile}
            readOnly
            className="w-full text-base text-[#121212] pb-2 border-b border-[#E2E8F0] bg-transparent"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm text-[#64748B] mb-2">Email</label>
          <input
            type="email"
            value={formData.email}
            readOnly
            className="w-full text-base text-[#121212] pb-2 border-b border-[#E2E8F0] bg-transparent"
          />
          <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
            We'll reach out to you via email for account-related issues and product communication purposes.
          </p>
        </div>

      </div>



       {/* Switch Back to Driver Button - if user is currently viewing customer UI but is a driver */}
       {localStorage.getItem('trikeserve_original_role') === 'rider' && (
         <div className="px-5 py-6">
           <Button
             onClick={async () => {
               await restoreOriginalRole?.();
               navigate('/rider');
             }}
             className="w-full bg-[#0f172a] hover:bg-[#111827] text-white font-bold uppercase py-4 rounded-lg flex items-center justify-center gap-2"
           >
             <ArrowLeft className="w-5 h-5" />
             Switch back to Driver App
           </Button>
         </div>
       )}

      {/* Save Button */}
      <div className="px-5 pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 text-base font-semibold text-white bg-[#18B5A4] rounded-2xl hover:bg-[#159E8F] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
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
          className="w-full py-3 text-base font-semibold text-[#E11D48] bg-[#FFF1F2] rounded-2xl hover:bg-[#FFE4E6] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Log out
        </button>
      </div>



      {/* Bottom spacing for navigation */}
      <div className="h-20" />
    </div>
  );
}
