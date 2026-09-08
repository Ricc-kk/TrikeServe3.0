import { Store, Package, Clock, User, ChevronRight, LogOut, ArrowLeft, Menu, Shield, Bell, HelpCircle, CreditCard, Pencil } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useState, useEffect } from "react";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";

export default function BusinessAccount() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showGoodbye, setShowGoodbye] = useState(false);

  useEffect(() => {
    const fetchLogo = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('restaurants')
        .select('logo_image')
        .eq('business_user_id', user.id)
        .single();
      if (data?.logo_image) {
        setLogoUrl(data.logo_image);
      }
    };
    fetchLogo();
  }, [user?.id]);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    setShowGoodbye(true);
    setTimeout(() => {
      logout();
      navigate("/");
    }, 2000);
  };

  const pendingOrders = 0;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 w-full min-w-0">
        {/* Header with Back Button */}
        <div className="bg-white px-3 lg:px-4 py-3 lg:py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden flex-shrink-0"
            >
              <Menu className="w-5 h-5 text-[#121212]" />
            </button>
            
            {/* Back Button - Shows on Mobile and Desktop */}
            <button
              onClick={() => navigate(-1)}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-[#121212]" />
            </button>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[#121212]">Account</h1>
            </div>
            <Link to="/business/profile" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-[#E11D48] text-xs font-semibold hover:bg-white transition-colors shadow-sm">
              <Pencil className="w-3.5 h-3.5" />
              Edit Profile
            </Link>
          </div>
          <p className="text-xs lg:text-sm text-[#64748B] ml-7 lg:ml-11">Manage your business settings</p>
        </div>

        {/* Profile Section - Gradient Header */}
        <div className="relative bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#9F1239] px-4 lg:px-6 py-6 lg:py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/30 shadow-lg overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Store Logo" className="w-full h-full object-cover" />
              ) : (
                <Store className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg lg:text-xl font-bold text-white truncate">{(user as any).businessName || user?.name || 'Business'}</h2>
                {user?.isVerified && (
                  <Badge className="bg-[#10B981] text-white text-[10px] px-1.5 py-0.5">Verified</Badge>
                )}
              </div>
              <p className="text-white/80 text-xs lg:text-sm">{user?.name}</p>
              <p className="text-white/60 text-[10px] lg:text-xs mt-1">Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Contact Info Card */}
        <div className="px-4 lg:px-6 mt-4 relative z-10">
          <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#F0FDF4] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📧</span>
                </div>
                <span className="text-sm text-[#121212] break-all">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#DBEAFE] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📱</span>
                </div>
                <span className="text-sm text-[#121212]">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FFF1F2] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📍</span>
                </div>
                <span className="text-sm text-[#121212] break-words">{(user as any).businessAddress || 'Address not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Sections */}
        <div className="px-4 lg:px-6 py-5 space-y-5">
          {/* Business Management */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#64748B]" />
                <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Business Management</h3>
              </div>
            </div>
            
            <Link to="/business/menu">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-xl flex items-center justify-center shadow-sm">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#121212]">Menu Management</p>
                    <p className="text-[11px] text-[#94A3B8]">Edit items and categories</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
              </div>
            </Link>
            <div className="border-t border-[#F1F5F9] mx-4" />

            <Link to="/business/orders">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-xl flex items-center justify-center shadow-sm relative">
                    <Clock className="w-5 h-5 text-white" />
                    {pendingOrders > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">{pendingOrders}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#121212]">Orders</p>
                    <p className="text-[11px] text-[#94A3B8]">View and manage orders</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
              </div>
            </Link>
            <div className="border-t border-[#F1F5F9] mx-4" />

            <Link to="/business/home">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-xl flex items-center justify-center shadow-sm">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#121212]">Store Appearance</p>
                    <p className="text-[11px] text-[#94A3B8]">Edit photos and info</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
              </div>
            </Link>
          </div>

          {/* Quick Links Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#F1F5F9] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#64748B]" />
                <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Settings</h3>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#F59E0B] to-[#D97706] rounded-xl flex items-center justify-center shadow-sm">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#121212]">Notifications</p>
                  <p className="text-[11px] text-[#94A3B8]">Manage your alerts</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
            </div>
            <div className="border-t border-[#F1F5F9] mx-4" />

            <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#18B5A4] to-[#159E8F] rounded-xl flex items-center justify-center shadow-sm">
                  <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#121212]">Help & Support</p>
                  <p className="text-[11px] text-[#94A3B8]">FAQs and contact us</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#CBD5E1]" />
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-4 text-base font-semibold text-[#E11D48] bg-[#FFF1F2] rounded-2xl hover:bg-[#FFE4E6] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <div className="bg-white p-6 max-w-sm w-full rounded-2xl shadow-xl">
              <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-[#E11D48]" />
              </div>
              <h3 className="text-xl font-bold text-[#121212] text-center mb-2">Logout</h3>
              <p className="text-[#64748B] text-center mb-6 text-sm">
                Are you sure you want to logout?
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-[#E11D48] text-white font-bold rounded-xl active:scale-95 transition-transform"
                >
                  Yes, Logout
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-3 bg-[#F8F9FA] text-[#64748B] font-bold rounded-xl active:scale-95 transition-transform"
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
              <div className="w-16 h-16 bg-[#DBEAFE] rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-[#3B82F6]" />
              </div>
              <h3 className="text-2xl font-bold text-[#121212] mb-2">Goodbye! 👋</h3>
              <p className="text-[#64748B] text-sm">See you soon, <span className="font-semibold text-[#121212]">{user?.name || 'there'}</span></p>
              <div className="mt-6">
                <div className="w-full bg-[#E2E8F0] rounded-full h-1.5">
                  <div className="bg-[#3B82F6] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 1.8s linear forwards' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}