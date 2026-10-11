import { useState } from "react";
import {
  LogOut, AlertTriangle, Palette
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";
import AdminShell from "./AdminShell";

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Rate/platform configuration is Super Admin only, but every admin still
  // needs the Account & Security section below (it holds Sign Out).
  const isSuperAdmin = user?.adminType === 'business_customer';

  return (
    <AdminShell
      title="Settings"
      subtitle="Your account and how the app looks"
    >

        {/* Content */}
        <div className="space-y-6">
          {/*
            Rider Admin sees less, and the reason is no longer rates.

            This card used to say rate and platform configuration was the Super
            Admin's job, which made sense while this screen held those settings.
            Fares and delivery now live on their own tab, per terminal, and nothing
            here is Super Admin only -- so a notice explaining a restriction that
            does not apply would be worse than no notice.
          */}
          {!isSuperAdmin && (
            <Card className="p-4 border-2 border-[var(--info-soft)] bg-[var(--info-soft)]">
              <p className="text-sm text-[var(--info)] font-semibold">Limited access</p>
              <p className="text-xs text-[var(--info)]/80 mt-0.5">
                Fares and delivery settings are managed by the Super Admin on the Fares
                &amp; Delivery tab. You can still manage your account below.
              </p>
            </Card>
          )}

          {/* Appearance — Super Admin sees English-only labels */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[var(--info-soft)] rounded-xl flex items-center justify-center">
                <Palette className="w-6 h-6 text-[var(--info)]" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Appearance</h2>
                <p className="text-sm text-[var(--muted-foreground)]">Light, dark, or follow your device</p>
              </div>
            </div>
            <ThemeModeSwitcher />
          </div>

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

      </AdminShell>
  );
}
