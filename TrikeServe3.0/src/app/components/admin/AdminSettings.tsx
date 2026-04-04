import { useState, useEffect } from "react";
import {
  Settings, Menu, Save, DollarSign, Shield, Bell,
  MapPin, Clock, Bike, Users as UsersIcon, Store, CheckCircle,
  LogOut, AlertTriangle
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Rate Configuration
  const [rateConfig, setRateConfig] = useState({
    sharedRide: 15,
    privateRide: 50,
    deliveryBaseFee: 30,
  });

  // Platform Settings
  const [platformSettings, setPlatformSettings] = useState({
    platformName: "TrikeServe",
    supportEmail: "support@trikeserve.com",
    supportPhone: "+63 912 345 6789",
    maxPassengers: 6,
    operatingHoursStart: "05:00",
    operatingHoursEnd: "22:00",
    autoVerifyCustomers: true,
    requireRiderVerification: true,
    requireBusinessVerification: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    // Load rates
    const savedRates = localStorage.getItem('trikeserve_rates');
    if (savedRates) {
      try {
        setRateConfig(JSON.parse(savedRates));
      } catch (error) {
        console.error('Error loading rates:', error);
      }
    }

    // Load platform settings
    const savedPlatformSettings = localStorage.getItem('trikeserve_platform_settings');
    if (savedPlatformSettings) {
      try {
        setPlatformSettings(JSON.parse(savedPlatformSettings));
      } catch (error) {
        console.error('Error loading platform settings:', error);
      }
    }
  };

  const handleSaveRates = () => {
    localStorage.setItem('trikeserve_rates', JSON.stringify(rateConfig));
    showSavedMessage("Rate configuration saved successfully!");
  };

  const handleSavePlatformSettings = () => {
    localStorage.setItem('trikeserve_platform_settings', JSON.stringify(platformSettings));
    showSavedMessage("Platform settings saved successfully!");
  };

  const showSavedMessage = (message: string) => {
    setSavedMessage(message);
    setTimeout(() => setSavedMessage(""), 3000);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar Navigation */}
      <AdminSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Top Header */}
        <div className="bg-white border-b-2 border-[#E2E8F0] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[#121212]" />
              </button>
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">Settings</h1>
                <p className="text-xs lg:text-sm text-[#64748B]">Configure platform settings and rates</p>
              </div>
            </div>
            {savedMessage && (
              <Badge className="bg-[#10B981] flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {savedMessage}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8 space-y-6 lg:space-y-8">
          {/* Rate Configuration Section */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#FFF1F2] rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-[#E11D48]" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-[#121212]">Fixed Rate Configuration</h2>
                <p className="text-sm text-[#64748B]">Set base rates for different service types</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
              {/* Shared Ride Rate */}
              <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <UsersIcon className="w-8 h-8 lg:w-10 lg:h-10 text-[#3B82F6] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[#121212]">Shared Ride</h3>
                    <p className="text-xs text-[#64748B]">Sasabay (per passenger)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[#64748B] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.sharedRide}
                    onChange={(e) => setRateConfig({ ...rateConfig, sharedRide: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border-2 border-[#E2E8F0]"
                  />
                </div>
              </Card>

              {/* Private Ride Rate */}
              <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Bike className="w-8 h-8 lg:w-10 lg:h-10 text-[#9333EA] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[#121212]">Private Ride</h3>
                    <p className="text-xs text-[#64748B]">Pakyaw (entire trike)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[#64748B] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.privateRide}
                    onChange={(e) => setRateConfig({ ...rateConfig, privateRide: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border-2 border-[#E2E8F0]"
                  />
                </div>
              </Card>

              {/* Delivery Fee */}
              <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Store className="w-8 h-8 lg:w-10 lg:h-10 text-[#10B981] mb-2" />
                    <h3 className="font-bold text-base lg:text-lg text-[#121212]">Delivery Fee</h3>
                    <p className="text-xs text-[#64748B]">Food delivery (base rate)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg text-[#64748B] font-bold">₱</span>
                  <Input
                    type="number"
                    value={rateConfig.deliveryBaseFee}
                    onChange={(e) => setRateConfig({ ...rateConfig, deliveryBaseFee: Number(e.target.value) })}
                    className="text-2xl lg:text-3xl font-bold text-center border-2 border-[#E2E8F0]"
                  />
                </div>
              </Card>
            </div>

            <button
              onClick={handleSaveRates}
              className="mt-4 px-6 py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-xl uppercase transition-all flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Rate Configuration
            </button>
          </div>

          {/* Platform Settings Section */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
                <Settings className="w-6 h-6 text-[#3B82F6]" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-[#121212]">Platform Settings</h2>
                <p className="text-sm text-[#64748B]">General platform configuration</p>
              </div>
            </div>

            <Card className="p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="space-y-6">
                {/* Platform Information */}
                <div>
                  <h3 className="font-bold text-lg text-[#121212] mb-4">Platform Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">Platform Name</label>
                      <Input
                        type="text"
                        value={platformSettings.platformName}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, platformName: e.target.value })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">Support Email</label>
                      <Input
                        type="email"
                        value={platformSettings.supportEmail}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, supportEmail: e.target.value })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">Support Phone</label>
                      <Input
                        type="tel"
                        value={platformSettings.supportPhone}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, supportPhone: e.target.value })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">Max Passengers per Trike</label>
                      <Input
                        type="number"
                        value={platformSettings.maxPassengers}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, maxPassengers: Number(e.target.value) })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="border-t-2 border-[#E2E8F0] pt-6">
                  <h3 className="font-bold text-lg text-[#121212] mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#F59E0B]" />
                    Operating Hours
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">Start Time</label>
                      <Input
                        type="time"
                        value={platformSettings.operatingHoursStart}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, operatingHoursStart: e.target.value })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-[#121212] mb-2 block">End Time</label>
                      <Input
                        type="time"
                        value={platformSettings.operatingHoursEnd}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, operatingHoursEnd: e.target.value })}
                        className="border-2 border-[#E2E8F0]"
                      />
                    </div>
                  </div>
                </div>

                {/* Verification Settings */}
                <div className="border-t-2 border-[#E2E8F0] pt-6">
                  <h3 className="font-bold text-lg text-[#121212] mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[#10B981]" />
                    Verification Requirements
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl">
                      <div>
                        <p className="font-semibold text-[#121212]">Auto-verify Customers</p>
                        <p className="text-sm text-[#64748B]">Customers can use the platform immediately</p>
                      </div>
                      <button
                        onClick={() => setPlatformSettings({ ...platformSettings, autoVerifyCustomers: !platformSettings.autoVerifyCustomers })}
                        className={`w-16 h-9 rounded-full transition-all ${
                          platformSettings.autoVerifyCustomers ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 bg-white rounded-full shadow-md transition-transform ${
                            platformSettings.autoVerifyCustomers ? "translate-x-8" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl">
                      <div>
                        <p className="font-semibold text-[#121212]">Require Rider Verification</p>
                        <p className="text-sm text-[#64748B]">Riders must be verified by admin before accepting rides</p>
                      </div>
                      <button
                        onClick={() => setPlatformSettings({ ...platformSettings, requireRiderVerification: !platformSettings.requireRiderVerification })}
                        className={`w-16 h-9 rounded-full transition-all ${
                          platformSettings.requireRiderVerification ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 bg-white rounded-full shadow-md transition-transform ${
                            platformSettings.requireRiderVerification ? "translate-x-8" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-xl">
                      <div>
                        <p className="font-semibold text-[#121212]">Require Business Verification</p>
                        <p className="text-sm text-[#64748B]">Businesses must be verified by admin before taking orders</p>
                      </div>
                      <button
                        onClick={() => setPlatformSettings({ ...platformSettings, requireBusinessVerification: !platformSettings.requireBusinessVerification })}
                        className={`w-16 h-9 rounded-full transition-all ${
                          platformSettings.requireBusinessVerification ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 bg-white rounded-full shadow-md transition-transform ${
                            platformSettings.requireBusinessVerification ? "translate-x-8" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSavePlatformSettings}
                className="mt-6 px-6 py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-xl uppercase transition-all flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                Save Platform Settings
              </button>
            </Card>
          </div>

          {/* Account & Security Section */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-[#121212]">Account & Security</h2>
                <p className="text-sm text-[#64748B]">Manage your admin account</p>
              </div>
            </div>

            <Card className="p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="space-y-4">
                {/* Admin Info */}
                <div className="pb-4 border-b-2 border-[#E2E8F0]">
                  <h3 className="font-bold text-lg text-[#121212] mb-3">Administrator Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[#64748B]">Name</span>
                      <span className="font-semibold text-[#121212]">{user?.name || 'Admin'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[#64748B]">Email</span>
                      <span className="font-semibold text-[#121212]">{user?.email || 'admin@trikeserve.com'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[#64748B]">Role</span>
                      <Badge className="bg-gradient-to-br from-[#E11D48] to-[#121212]">
                        ADMINISTRATOR
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Sign Out Button */}
                <div>
                  <h3 className="font-bold text-lg text-[#121212] mb-3 flex items-center gap-2">
                    <LogOut className="w-5 h-5 text-[#EF4444]" />
                    Sign Out
                  </h3>
                  <p className="text-sm text-[#64748B] mb-4">
                    End your current admin session and return to the login page
                  </p>
                  <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="px-6 py-3 bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold rounded-xl uppercase transition-all flex items-center gap-2"
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
            <Card className="w-full max-w-md p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#FEE2E2] rounded-full flex items-center justify-center mx-auto mb-4">
                  <LogOut className="w-8 h-8 text-[#EF4444]" />
                </div>
                <h2 className="text-2xl font-bold text-[#121212] mb-2">Sign Out?</h2>
                <p className="text-[#64748B]">
                  Are you sure you want to sign out of the admin panel?
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-3 bg-[#F8F9FA] hover:bg-[#E2E8F0] text-[#121212] font-bold rounded-xl uppercase transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-3 bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold rounded-xl uppercase transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
