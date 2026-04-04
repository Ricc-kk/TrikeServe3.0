import { Store, Package, Clock, User, ChevronRight, LogOut, Bell, HelpCircle, FileText, Settings, Shield, BarChart3, ArrowLeft, Menu } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useState } from "react";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";

export default function BusinessAccount() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/");
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
            
            <div className="min-w-0">
              <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[#121212]">Account</h1>
            </div>
          </div>
          <p className="text-xs lg:text-sm text-[#64748B] ml-7 lg:ml-11">Manage your business settings</p>
        </div>

        {/* Profile Section */}
        <div className="bg-white px-3 lg:px-4 py-4 lg:py-6 border-b border-[#E2E8F0]">
          <div className="flex items-start gap-3 lg:gap-4 mb-3 lg:mb-4">
            <div className="w-14 h-14 lg:w-20 lg:h-20 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-2xl flex items-center justify-center text-2xl lg:text-3xl flex-shrink-0">
              🍗
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 lg:mb-1">
                <h2 className="text-base lg:text-xl font-bold text-[#121212]">{(user as any).businessName || user?.name || 'Business'}</h2>
                {user?.isVerified && (
                  <Badge className="bg-[#10B981] text-white text-[10px] lg:text-xs px-1.5 lg:px-2 py-0.5">Verified</Badge>
                )}
              </div>
              <p className="text-xs lg:text-sm text-[#64748B]">{user?.name}</p>
              <p className="text-[10px] lg:text-xs text-[#94A3B8] mt-0.5 lg:mt-1">Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white">
            <div className="space-y-2 lg:space-y-2.5 text-xs lg:text-sm">
              <div className="flex items-center gap-2 lg:gap-3">
                <span className="text-base lg:text-lg flex-shrink-0">📧</span>
                <span className="text-[#121212] break-all">{user?.email}</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3">
                <span className="text-base lg:text-lg flex-shrink-0">📱</span>
                <span className="text-[#121212]">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-2 lg:gap-3">
                <span className="text-base lg:text-lg flex-shrink-0">📍</span>
                <span className="text-[#121212] break-words">{(user as any).businessAddress || 'Address not provided'}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Menu Sections */}
        <div className="px-3 lg:px-4 py-4 lg:py-6 space-y-5 lg:space-y-6">
          {/* Business Management */}
          <div>
            <h3 className="text-xs lg:text-sm font-bold text-[#64748B] uppercase mb-2 lg:mb-3 tracking-wide">Business Management</h3>
            <div className="space-y-2">
              <Link to="/business/menu">
                <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                  <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FFF1F2] rounded-xl flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 lg:w-5 lg:h-5 text-[#E11D48]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm lg:text-base text-[#121212]">Menu Management</p>
                      <p className="text-[10px] lg:text-xs text-[#64748B]">Edit items and categories</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
                </Card>
              </Link>

              <Link to="/business/orders">
                <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                  <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#DBEAFE] rounded-xl flex items-center justify-center relative flex-shrink-0">
                      <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-[#3B82F6]" />
                      {pendingOrders > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">{pendingOrders}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm lg:text-base text-[#121212]">Orders</p>
                      <p className="text-[10px] lg:text-xs text-[#64748B]">View and manage orders</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
                </Card>
              </Link>

              <Link to="/business/home">
                <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                  <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F0FDF4] rounded-xl flex items-center justify-center flex-shrink-0">
                      <Store className="w-4 h-4 lg:w-5 lg:h-5 text-[#10B981]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm lg:text-base text-[#121212]">Store Appearance</p>
                      <p className="text-[10px] lg:text-xs text-[#64748B]">Edit photos and info</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
                </Card>
              </Link>
            </div>
          </div>

          {/* Settings */}
          <div>
            <h3 className="text-xs lg:text-sm font-bold text-[#64748B] uppercase mb-2 lg:mb-3 tracking-wide">Settings</h3>
            <div className="space-y-2">
              <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm lg:text-base text-[#121212]">Notifications</p>
                    <p className="text-[10px] lg:text-xs text-[#64748B]">Order alerts and updates</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
              </Card>

              <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Settings className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm lg:text-base text-[#121212]">Business Settings</p>
                    <p className="text-[10px] lg:text-xs text-[#64748B]">Hours, delivery zones</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
              </Card>

              <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm lg:text-base text-[#121212]">Privacy & Security</p>
                    <p className="text-[10px] lg:text-xs text-[#64748B]">Password, verification</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
              </Card>
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-xs lg:text-sm font-bold text-[#64748B] uppercase mb-2 lg:mb-3 tracking-wide">Support</h3>
            <div className="space-y-2">
              <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm lg:text-base text-[#121212]">Help Center</p>
                    <p className="text-[10px] lg:text-xs text-[#64748B]">FAQs and guides</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
              </Card>

              <Card className="p-3 lg:p-4 border border-[#E2E8F0] bg-white flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                  <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F8F9FA] rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm lg:text-base text-[#121212]">Terms & Policies</p>
                    <p className="text-[10px] lg:text-xs text-[#64748B]">Legal information</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#64748B] flex-shrink-0 ml-2" />
              </Card>
            </div>
          </div>

          {/* Logout */}
          <Card
            onClick={() => setShowLogoutConfirm(true)}
            className="p-3 lg:p-4 border-2 border-[#FEE2E2] bg-[#FFF1F2] flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-2.5 lg:gap-3">
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0">
                <LogOut className="w-4 h-4 lg:w-5 lg:h-5 text-[#E11D48]" />
              </div>
              <p className="font-semibold text-sm lg:text-base text-[#E11D48]">Logout</p>
            </div>
            <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-[#E11D48] flex-shrink-0" />
          </Card>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <Card className="bg-white p-6 max-w-sm w-full">
              <div className="w-16 h-16 bg-[#FFF1F2] rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-[#E11D48]" />
              </div>
              <h3 className="text-xl font-bold text-[#121212] text-center mb-2">Logout</h3>
              <p className="text-[#64748B] text-center mb-6">
                Are you sure you want to logout?
              </p>
              <div className="space-y-2">
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-[#E11D48] text-white font-bold rounded-xl uppercase active:scale-95 transition-transform"
                >
                  Yes, Logout
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="w-full py-3 bg-[#F8F9FA] text-[#64748B] font-bold rounded-xl uppercase active:scale-95 transition-transform"
                >
                  Cancel
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}