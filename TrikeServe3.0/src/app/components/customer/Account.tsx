import { Camera, Star, ChevronRight, Home as HomeIcon, MessageCircle, User, ShoppingCart, ClipboardList, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";

export default function Account() {
  const navigate = useNavigate();
  const { user, logout, restoreOriginalRole } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || "User",
    mobile: user?.phone || "",
    email: user?.email || "",
  });

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header - keeping space for consistency */}
      <div className="h-4" />

      {/* Profile Photo Section */}
      <div className="flex flex-col items-center px-5 pb-6 pt-4">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full bg-[#18B5A4] flex items-center justify-center">
            <User className="w-12 h-12 text-white" />
          </div>
          <button className="absolute bottom-0 right-0 w-9 h-9 bg-[#18B5A4] rounded-full flex items-center justify-center shadow-lg border-3 border-white">
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Not enough ratings */}
        <button className="flex items-center gap-1.5 text-[#64748B]">
          <Star className="w-4 h-4 fill-[#F59E0B] text-[#F59E0B]" />
          <span className="text-sm">Not enough ratings</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Form Fields */}
      <div className="px-5 space-y-6">
        {/* Account Management Link */}
        <Link to="/customer/account-management">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#E11D48] to-[#BE123C] rounded-xl mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white font-bold">Manage Profiles</p>
                <p className="text-white/80 text-xs">Switch between accounts</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white" />
          </div>
        </Link>

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
          <input
            type="email"
            placeholder="Enter your email address"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full text-base text-[#121212] placeholder:text-[#CBD5E1] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors"
          />
          <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
            We'll reach out to you via email for account-related issues and product communication purposes.
          </p>
        </div>

       </div>

       {/* Switch Back to Driver Button - if user is currently viewing customer UI but is a driver */}
       {localStorage.getItem('trikeserve_original_role') === 'rider' && (
         <div className="px-5 py-3">
           <Button
             onClick={async () => {
               await restoreOriginalRole?.();
               navigate('/rider');
             }}
             className="w-full bg-[#0f172a] hover:bg-[#111827] text-white font-bold uppercase py-3 rounded-lg flex items-center justify-center gap-2"
           >
             <ArrowLeft className="w-5 h-5" />
             Switch back to Driver App
           </Button>
         </div>
       )}

       {/* Log out Button */}
       <div className="px-5 py-6 mt-8">
         <button
           className="w-full py-3 text-base font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors"
           onClick={handleLogout}
         >
           Log out
         </button>
       </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#E11D48]" />
            <span className="text-xs font-semibold text-[#E11D48]">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}