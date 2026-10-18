import { Store, Package, Clock, User, ChevronRight, LogOut, ArrowLeft, Menu, Shield, Bell, HelpCircle, CreditCard, Pencil, Mail, Phone, MapPin } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { usePreviousPage } from "../../hooks/usePreviousPage";
import { Card } from "../ui/card";
import GoodbyeOverlay from "../ui/GoodbyeOverlay";
import { Badge } from "../ui/badge";
import { useState, useEffect } from "react";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import { supabase } from "../../../lib/supabase";
import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";

export default function BusinessAccount() {
  const navigate = useNavigate();
  // A bare navigate(-1) walks a cold deep link straight out of the app,
  // because there is no history entry before it to return to.
  const goBack = usePreviousPage("/business/dashboard");
  const { user, logout, switchUiRole, restoreOriginalRole } = useAuth();
  /*
   * The shop name, from the same place Overview and Shop read it.
   *
   * This header used to read `user.businessName`, a copy kept on the user row
   * that nothing guaranteed to agree with the shop's actual name -- so the same
   * shop was "Boss A Silogan" in Shop and "Nemia's Kakanin" here. Settings is
   * also where the name is edited, so having it display a different value from
   * the one you just typed was the most confusing place for that to show up.
   */
  const profile = useRestaurantProfile();
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
        <div className="border-b border-[var(--border)] bg-surface">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation" className="lg:hidden grid size-11 shrink-0 place-items-center rounded-xl hover:bg-soft"
            >
              <Menu className="w-5 h-5 text-[var(--ink)]" />
            </button>
            
            {/* Back Button - Shows on Mobile and Desktop */}
            <button
              onClick={goBack}
              aria-label="Go back" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-soft"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--ink)]" />
            </button>
            
            <div className="min-w-0 flex-1 basis-20">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Business workspace</p>
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink)] lg:text-2xl">Settings</h1>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)] sm:text-sm">Manage your business settings</p>
            </div>
            <Link to="/business/edit-profile" className="min-h-11 flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-line bg-card px-4 text-xs font-semibold text-[var(--primary)] transition-colors hover:border-[var(--primary)]">
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit profile</span><span className="sm:hidden">Edit</span>
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {/*
          Shop identity and contact details in one banner.

          These were two stacked full-width cards: a 1117px-wide strip holding a
          logo and a name, then another the same width holding three rows of
          contact details floating in white space. Together they filled the top
          third of a desktop screen without saying much. The details belong with
          the shop they describe, so they sit under the name.
        */}
        <section className="relative isolate overflow-hidden rounded-3xl bg-[var(--ink-solid)] px-5 py-6 text-white sm:px-7 sm:py-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 -z-10 size-80 rounded-full border-[3rem] border-white/5" />
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/30 bg-white/20 shadow-lg backdrop-blur-sm lg:size-20">
              {logoUrl ? (
                <img src={logoUrl} alt="Store logo" className="size-full object-cover" />
              ) : (
                <Store className="size-8 text-white lg:size-10" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)]">Shop account</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-extrabold tracking-tight lg:text-2xl">{profile.shopName}</h2>
                {user?.isVerified && (
                  <Badge className="bg-[var(--success)] text-white text-[10px] px-2 py-0.5">Verified</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-white/80">{user?.name}</p>
              <p className="mt-0.5 text-xs text-white/60">Member since {new Date(user?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-white/15 pt-5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-w-0 items-start gap-3 rounded-2xl bg-white/10 px-3 py-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-[var(--mint)]" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Email</dt>
                <dd className="mt-0.5 break-all text-sm font-semibold">{user?.email || 'Not set'}</dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-2xl bg-white/10 px-3 py-3">
              <Phone className="mt-0.5 size-4 shrink-0 text-[var(--mint)]" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Mobile</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold">{user?.phone || 'Not set'}</dd>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-3 rounded-2xl bg-white/10 px-3 py-3 sm:col-span-2 xl:col-span-1">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--mint)]" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Address</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold">{(user as any).businessAddress || 'Address not provided'}</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Sections: two columns of settings at desktop widths, one on a phone. */}
        <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
          {/* Business Management */}
          <div className="min-w-0 bg-card rounded-3xl border border-line overflow-hidden">
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
          </div>

          {/* Preferences */}
          <div className="min-w-0 overflow-hidden rounded-3xl border border-line bg-card">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Preferences</h3>
              </div>
            </div>



            <div className="px-4 pb-4 pt-1">
              <ThemeModeSwitcher bilingual />
            </div>

            <Link
              to="/business/help"
              className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--muted)] transition-colors cursor-pointer"
            >
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
            </Link>
          </div>
        </div>

        {/*
          Account actions, below the settings.

          The session summary that used to sit here is gone — the shop, owner and
          contact details are already in the banner above. These two remain, side
          by side on a desktop and stacked on a phone.
        */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Use Customer App / Switch Back */}
          {localStorage.getItem('trikeserve_original_role') ? (
            <button
              onClick={() => setShowSwitchConfirm(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink-solid)] px-4 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              Switch back to Business App
            </button>
          ) : (
            <button
              onClick={() => setShowSwitchConfirm(true)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--success)] px-4 text-sm font-semibold text-white transition-all active:scale-[0.98]"
            >
              Use Customer App
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary-soft)] px-4 text-sm font-semibold text-[var(--primary)] transition-all active:scale-[0.98]"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log out
          </button>
        </div>
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
          <GoodbyeOverlay
            name={user?.name}
            subline={(name) => (
              <>See you soon, <span className="font-semibold text-[var(--ink)]">{name}</span></>
            )}
            icon={<LogOut className="w-8 h-8 text-[var(--info)]" />}
            accentSoft="var(--info-soft)"
            accent="var(--info)"
            onDone={() => {
              logout();
              navigate("/");
            }}
          />
        )}
      </div>
    </div>
  );
}