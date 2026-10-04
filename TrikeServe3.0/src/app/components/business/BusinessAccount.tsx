import { Store, Package, Clock, User, ChevronRight, LogOut, ArrowLeft, Menu, Shield, Bell, HelpCircle, CreditCard, Pencil } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useState, useEffect } from "react";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";

export default function BusinessAccount() {
  const navigate = useNavigate();
  const { user, logout, switchUiRole, restoreOriginalRole } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
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
    <div className="min-h-screen bg-[var(--muted)] flex overflow-x-hidden">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 w-full min-w-0">
        {/* Header with Back Button */}
        <div className="bg-surface px-3 lg:px-4 py-3 lg:py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden flex-shrink-0"
            >
              <Menu className="w-5 h-5 text-[var(--ink)]" />
            </button>
            
            {/* Back Button - Shows on Mobile and Desktop */}
            <button
              onClick={() => navigate(-1)}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--ink)]" />
            </button>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg lg:text-2xl xl:text-3xl font-extrabold text-[var(--ink)]">Account</h1>
            </div>
            <Link to="/business/profile" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-full text-[var(--primary)] text-xs font-semibold hover:bg-surface transition-colors shadow-sm">
              <Pencil className="w-3.5 h-3.5" />
              Edit Profile
            </Link>
          </div>
          <p className="text-xs lg:text-sm text-[var(--muted-foreground)] ml-7 lg:ml-11">Manage your business settings</p>
        </div>

        {/* Profile Section - Gradient Header */}
        <div className="relative bg-[var(--primary)] px-4 lg:px-6 py-6 lg:py-8">
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
                  <Badge className="bg-[var(--success)] text-white text-[10px] px-1.5 py-0.5">Verified</Badge>
                )}
              </div>
              <p className="text-white/80 text-xs lg:text-sm">{user?.name}</p>
              <p className="text-white/60 text-[10px] lg:text-xs mt-1">Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Contact Info Card */}
        <div className="px-4 lg:px-6 mt-4 relative z-10">
          <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--success-soft)] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📧</span>
                </div>
                <span className="text-sm text-[var(--ink)] break-all">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--info-soft)] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📱</span>
                </div>
                <span className="text-sm text-[var(--ink)]">{user?.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[var(--primary-soft)] rounded-lg flex items-center justify-center">
                  <span className="text-sm">📍</span>
                </div>
                <span className="text-sm text-[var(--ink)] break-words">{(user as any).businessAddress || 'Address not provided'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Sections */}
        <div className="px-4 lg:px-6 py-5 space-y-5">
          {/* Business Management */}
          <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] tracking-wider">Business Management</h3>
              </div>
            </div>
            
            <Link to="/business/menu">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center shadow-sm">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">Menu Management</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">Edit items and categories</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--border)]" />
              </div>
            </Link>
            <div className="border-t border-[var(--muted)] mx-4" />

            <Link to="/business/orders">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[var(--info)] to-[var(--info)] rounded-xl flex items-center justify-center shadow-sm relative">
                    <Clock className="w-5 h-5 text-white" />
                    {pendingOrders > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--primary)] rounded-full flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">{pendingOrders}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">Orders</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">View and manage orders</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--border)]" />
              </div>
            </Link>
            <div className="border-t border-[var(--muted)] mx-4" />

            <Link to="/business/home">
              <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--muted)] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[var(--success)] to-[var(--success)] rounded-xl flex items-center justify-center shadow-sm">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">Store Appearance</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">Edit photos and info</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--border)]" />
              </div>
            </Link>
          </div>

          {/* Quick Links Card */}
          <div className="bg-surface rounded-2xl shadow-sm border border-[var(--muted)] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] tracking-wider">Settings</h3>
              </div>
            </div>



            <div className="px-4 pb-4 pt-1">
              <ThemeModeSwitcher bilingual />
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--muted)] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[var(--teal)] to-[var(--teal)] rounded-xl flex items-center justify-center shadow-sm">
                  <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Help & Support</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">FAQs and contact us</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--border)]" />
            </div>
          </div>

          {/* Use Customer App / Switch Back */}
          {localStorage.getItem('trikeserve_original_role') ? (
            <button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full py-4 text-base font-semibold text-white bg-[var(--ink-solid)] hover:bg-[var(--ink-solid)] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mb-3"
            >
              Switch back to Business App
            </button>
          ) : (
            <button
              onClick={() => setShowSwitchConfirm(true)}
              className="w-full py-4 text-base font-semibold text-white bg-[var(--success)] hover:bg-[var(--success)] rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mb-3"
            >
              Use Customer App
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-4 text-base font-semibold text-[var(--primary)] bg-[var(--primary-soft)] rounded-2xl hover:bg-[var(--primary-soft)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>

        {/* Switch Confirmation Modal */}
        {showSwitchConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
            <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
              <div className="w-16 h-16 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <ArrowLeft className="w-8 h-8 text-[var(--info)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">
                {localStorage.getItem('trikeserve_original_role') ? 'Switch Back?' : 'Switch to Customer App?'}
              </h3>
              <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
                {localStorage.getItem('trikeserve_original_role')
                  ? 'You will return to the Business app.'
                  : 'You will be switched to the Customer app to browse and order food.'}
              </p>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    setShowSwitchConfirm(false);
                    if (localStorage.getItem('trikeserve_original_role')) {
                      await restoreOriginalRole?.();
                      navigate('/business/account');
                    } else {
                    localStorage.setItem('trikeserve_post_switch_route', '/customer');
                    switchUiRole && await switchUiRole('customer');
                    navigate('/customer');
                    }
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
            <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
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
            <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
              <div className="w-16 h-16 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-[var(--info)]" />
              </div>
              <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Goodbye! 👋</h3>
              <p className="text-[var(--muted-foreground)] text-sm">See you soon, <span className="font-semibold text-[var(--ink)]">{user?.name || 'there'}</span></p>
              <div className="mt-6">
                <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                  <div className="bg-[var(--info)] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 1.8s linear forwards' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}