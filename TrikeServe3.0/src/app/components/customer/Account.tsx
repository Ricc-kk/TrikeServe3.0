import { Camera, ChevronRight, Home as HomeIcon, MessageCircle, User, ShoppingCart, ClipboardList, ArrowLeft, LogOut, Shield, Bell, HelpCircle } from "lucide-react";
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
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Gradient Header with Profile */}
      <div className="relative bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#9F1239] px-5 pt-6 pb-6 rounded-b-2xl shadow-lg">
        <div className="relative flex flex-col items-center">
          {/* Profile Photo */}
          <div className="relative mb-2">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-lg">
              <User className="w-8 h-8 text-white" />
            </div>
            <button className="absolute bottom-0 right-0 w-7 h-7 bg-[#18B5A4] rounded-full flex items-center justify-center shadow-md border-2 border-white hover:bg-[#159E8F] transition-colors active:scale-95">
              <Camera className="w-3.5 h-3.5 text-white" />
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
        <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] overflow-hidden">
          <Link to="/customer/account-management">
            <div className="flex items-center justify-between p-4 hover:bg-[#F8FAFC] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-xl flex items-center justify-center shadow-sm">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#121212]">Manage Profile</p>
                  <p className="text-xs text-[#94A3B8]">Switch between accounts</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
            </div>
          </Link>
          <div className="border-t border-[#F1F5F9]" />
          <Link to="/customer/notifications">
            <div className="flex items-center justify-between p-4 hover:bg-[#F8FAFC] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#F59E0B] to-[#D97706] rounded-xl flex items-center justify-center shadow-sm">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#121212]">Notifications</p>
                  <p className="text-xs text-[#94A3B8]">Manage your alerts</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
            </div>
          </Link>
        </div>

        {/* Personal Information Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] p-5">
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-4 h-4 text-[#64748B]" />
            <h3 className="text-sm font-semibold text-[#64748B] uppercase tracking-wider">Personal Information</h3>
          </div>

          {/* Name */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full text-base font-medium text-[#121212] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors bg-transparent"
            />
          </div>

          {/* Mobile Number */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">Mobile Number</label>
            <input
              type="text"
              value={formData.mobile}
              readOnly
              className="w-full text-base font-medium text-[#121212] pb-2 border-b border-[#E2E8F0] bg-transparent cursor-not-allowed"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-2 uppercase tracking-wider">Email</label>
            <input
              type="email"
              placeholder="Enter your email address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full text-base font-medium text-[#121212] placeholder:text-[#CBD5E1] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors bg-transparent"
            />
            <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
              We'll reach out to you via email for account-related issues and product communication purposes.
            </p>
          </div>
        </div>

        {/* Help Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] overflow-hidden">
          <div className="flex items-center justify-between p-4 hover:bg-[#F8FAFC] transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-[#18B5A4] to-[#159E8F] rounded-xl flex items-center justify-center shadow-sm">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#121212]">Help & Support</p>
                <p className="text-xs text-[#94A3B8]">FAQs and contact us</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
          </div>
        </div>

        {/* Switch Back to Driver Button */}
        {localStorage.getItem('trikeserve_original_role') === 'rider' && (
          <div className="pt-2">
            <Button
              onClick={async () => {
                await restoreOriginalRole?.();
                navigate('/rider');
              }}
              className="w-full bg-[#0f172a] hover:bg-[#111827] text-white font-bold uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              Switch back to Driver App
            </Button>
          </div>
        )}

        {/* Logout Button */}
        <div className="pt-2 pb-4">
          <button
            onClick={handleLogout}
            className="w-full py-4 text-base font-semibold text-[#E11D48] bg-[#FFF1F2] rounded-2xl hover:bg-[#FFE4E6] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Log out
          </button>
        </div>
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