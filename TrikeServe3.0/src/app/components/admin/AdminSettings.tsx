import { useState, useEffect } from "react";
import {
  Settings, Menu, Save, DollarSign,
  Bike, Store,
  LogOut, AlertTriangle
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";
import { normalizeRates } from "@/lib/pricing";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Rate Configuration
  const [rateConfig, setRateConfig] = useState({
    baseFare: 20,
    perKm: 10,
    sharedRide: 15,
    privateRide: 50,
    deliveryBaseFee: 30,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    // Load rates from Supabase
    try {
      const { data: ratesData, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('setting_key', 'rates')
        .single();

      if (!error && ratesData) {
        try {
          setRateConfig(normalizeRates(JSON.parse(ratesData.setting_value)));
        } catch (e) {
          console.error('Error parsing rates:', e);
          loadRatesFromLocalStorage();
        }
      } else {
        loadRatesFromLocalStorage();
      }
    } catch (error) {
      console.error('Error loading rates from Supabase:', error);
      loadRatesFromLocalStorage();
    }

  };

  const loadRatesFromLocalStorage = () => {
    const savedRates = localStorage.getItem('trikeserve_rates');
    if (savedRates) {
      try {
        setRateConfig(normalizeRates(JSON.parse(savedRates)));
      } catch (error) {
        console.error('Error loading rates:', error);
      }
    }
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'success';
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const openModal = (config: typeof modalConfig) => {
    setModalConfig(config);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalConfig(null);
  };

  const handleSaveRates = async () => {
    openModal({
      title: "Save Rates",
      message: "Save rate configuration changes?",
      variant: "success",
      confirmLabel: "Save",
      onConfirm: async () => {
        closeModal();
        try {
          const { error } = await supabase
            .from('admin_settings')
            .upsert({
              setting_key: 'rates',
              setting_value: JSON.stringify(rateConfig),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'setting_key'
            });
          localStorage.setItem('trikeserve_rates', JSON.stringify(rateConfig));
          if (error) {
            console.error('Error saving to Supabase:', error);
            setToast({ message: 'Saved on this device — cloud sync failed.', variant: 'warning' });
          } else {
            setToast({ message: 'Rate configuration saved successfully!', variant: 'success' });
          }
        } catch (error) {
          console.error('Error in handleSaveRates:', error);
          localStorage.setItem('trikeserve_rates', JSON.stringify(rateConfig));
          setToast({ message: 'Rate configuration saved on this device.', variant: 'success' });
        }
      },
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Rate/platform configuration is Super Admin only, but every admin still
  // needs the Account & Security section below (it holds Sign Out).
  const isSuperAdmin = user?.adminType === 'business_customer';

  return (
    <div className="min-h-screen bg-[var(--muted)] flex">
      {/* Sidebar Navigation */}
      <AdminSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Top Header */}
        <div className="bg-surface border-b-2 border-[var(--border)] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[var(--ink)]" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[var(--ink)]">Settings</h1>
                <p className="text-xs lg:text-sm text-[var(--muted-foreground)]">Configure platform settings and rates</p>
              </div>
            </div>

          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8 space-y-6 lg:space-y-8">
          {/* Rider Admin: no rate configuration, but Account & Security stays */}
          {!isSuperAdmin && (
            <Card className="p-4 border-2 border-[var(--info-soft)] bg-[var(--info-soft)]">
              <p className="text-sm text-[var(--info)] font-semibold">Limited access</p>
              <p className="text-xs text-[var(--info)]/80 mt-0.5">
                Rate and platform configuration is managed by the Super Admin. You can still manage your account below.
              </p>
            </Card>
          )}

          {/* Delivery Fee Configuration - Super Admin */}
          {isSuperAdmin && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[var(--success-soft)] rounded-xl flex items-center justify-center">
                  <Store className="w-6 h-6 text-[var(--success)]" />
                </div>
                <div>
                  <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Delivery Fee Configuration</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">Set the base delivery fee for food orders</p>
                </div>
              </div>

              <Card className="p-5 lg:p-6 border border-line bg-surface max-w-md">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Store className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--success)] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[var(--ink)]">Delivery Fee</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Food delivery (base rate)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[var(--muted-foreground)] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.deliveryBaseFee}
                    onChange={(e) => setRateConfig({ ...rateConfig, deliveryBaseFee: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border border-line"
                  />
                </div>
              </Card>

              <button
                onClick={handleSaveRates}
                className="mt-4 px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-xl transition-all flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Delivery Fee
              </button>
            </div>
          )}

          {/* Fixed Rate Configuration - Super Admin */}
          {isSuperAdmin && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[var(--primary-soft)] rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-[var(--primary)]" />
                </div>
                <div>
                  <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Fixed Rate Configuration</h2>
                  <p className="text-sm text-[var(--muted-foreground)]">Rides are charged per kilometer: base fare + rate × distance</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              {/* Base Fare */}
              <Card className="p-5 lg:p-6 border border-line bg-surface">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <DollarSign className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--violet)] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[var(--ink)]">Base Fare</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Flat amount added to every ride</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[var(--muted-foreground)] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.baseFare}
                    onChange={(e) => setRateConfig({ ...rateConfig, baseFare: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border border-line"
                  />
                </div>
              </Card>

              {/* Rate per Kilometer */}
              <Card className="p-5 lg:p-6 border border-line bg-surface">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Bike className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--violet)] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[var(--ink)]">Rate per Kilometer</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Charged for each km the customer travels</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[var(--muted-foreground)] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.perKm}
                    onChange={(e) => setRateConfig({ ...rateConfig, perKm: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border border-line"
                  />
                  <span className="text-sm text-[var(--muted-foreground)] font-semibold">/km</span>
                </div>
              </Card>

              {/* Delivery Base Fee */}
              <Card className="p-5 lg:p-6 border border-line bg-surface">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Store className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--info)] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[var(--ink)]">Delivery Fee</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Flat fee per delivery</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[var(--muted-foreground)] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.deliveryBaseFee}
                    onChange={(e) => setRateConfig({ ...rateConfig, deliveryBaseFee: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border border-line"
                  />
                </div>
              </Card>


            </div>

            <button
              onClick={handleSaveRates}
              className="mt-4 px-6 py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-xl transition-all flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Rate Configuration
            </button>
          </div>
          )}

          {/* Account & Security Section */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[var(--amber-soft)] rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-[var(--amber)]" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Account & Security</h2>
                <p className="text-sm text-[var(--muted-foreground)]">Manage your admin account</p>
              </div>
            </div>

            <Card className="p-6 border border-line bg-surface">
              <div className="space-y-4">
                {/* Admin Info */}
                <div className="pb-4 border-b-2 border-[var(--border)]">
                  <h3 className="font-bold text-lg text-[var(--ink)] mb-3">Administrator Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[var(--muted-foreground)]">Name</span>
                      <span className="font-semibold text-[var(--ink)]">{user?.name || 'Admin'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[var(--muted-foreground)]">Email</span>
                      <span className="font-semibold text-[var(--ink)]">{user?.email || 'admin@trikeserve.com'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[var(--muted-foreground)]">Role</span>
                      <Badge className="bg-gradient-to-br from-[var(--primary)] to-[var(--ink)]">
                        ADMINISTRATOR
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Sign Out Button */}
                <div>
                  <h3 className="font-bold text-lg text-[var(--ink)] mb-3 flex items-center gap-2">
                    <LogOut className="w-5 h-5 text-[var(--error)]" />
                    Sign Out
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">
                    End your current admin session and return to the login page
                  </p>
                  <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="px-6 py-3 bg-[var(--error)] hover:bg-[var(--error)] text-white font-bold rounded-xl transition-all flex items-center gap-2"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign Out of Admin Panel
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[2000]"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="fixed inset-0 z-[2001] flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-6 border border-line bg-surface">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <LogOut className="w-8 h-8 text-[var(--error)]" />
                </div>
                <h2 className="text-2xl font-bold text-[var(--ink)] mb-2">Sign Out?</h2>
                <p className="text-[var(--muted-foreground)]">
                  Are you sure you want to sign out of the admin panel?
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-3 bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--ink)] font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-3 bg-[var(--error)] hover:bg-[var(--error)] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={modalOpen}
        onConfirm={modalConfig?.onConfirm || (() => {})}
        onCancel={closeModal}
        title={modalConfig?.title || ''}
        message={modalConfig?.message || ''}
        variant={modalConfig?.variant || 'danger'}
        confirmLabel={modalConfig?.confirmLabel || 'Confirm'}
      />

      {/* Save feedback popup */}
      {toast && (
        <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
