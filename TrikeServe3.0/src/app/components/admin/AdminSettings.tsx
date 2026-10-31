import { useState } from "react";
import { LogOut, Palette, ShieldCheck, UserRound, ArrowUpRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import ThemeModeSwitcher from "../ui/ThemeModeSwitcher";
import ConfirmationModal from "../ui/confirmation-modal";
import AdminShell from "./AdminShell";
import AdminPageIntro from "./AdminPageIntro";

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const isSuperAdmin = user?.adminType === 'business_customer';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <AdminShell title="Settings" subtitle="Your account and how the app looks">
      <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
        <AdminPageIntro eyebrow="Settings" title="Your workspace. Your way." description="Choose a comfortable appearance, review your administrator details, and manage your current session." />

        {!isSuperAdmin && <div className="rounded-2xl border border-line bg-[var(--info-soft)] p-4 text-sm text-[var(--info)]">
          Fares and delivery settings are managed by the Super Admin. You can still manage your account and appearance here.
        </div>}

        <div className="grid items-start gap-5 @min-[58rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-5">
            <section aria-labelledby="appearance-heading" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--info-soft)] text-[var(--info)]"><Palette className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h2 id="appearance-heading" className="text-lg font-bold text-[var(--ink)]">Appearance</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">Make the dashboard feel right for you.</p>
                </div>
              </div>
              <ThemeModeSwitcher />
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">Default follows your device’s light or dark preference. Changes apply immediately on this browser.</p>
            </section>

            {isSuperAdmin && <section aria-labelledby="pricing-settings-heading" className="rounded-3xl border border-line bg-[var(--teal-soft)] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--teal)]">Platform configuration</p>
              <h2 id="pricing-settings-heading" className="mt-2 text-lg font-bold text-[var(--ink)]">Looking for pricing settings?</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">Tricycle fares, delivery fees, and shared-ride capacity are managed per terminal.</p>
              <Link to="/admin/delivery" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-card px-4 text-sm font-bold text-[var(--teal)] hover:opacity-80">Tricycle Fares <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
            </section>}
          </div>

          <section aria-labelledby="account-heading" className="min-w-0 overflow-hidden rounded-3xl border border-line bg-card">
            <div className="p-5 sm:p-6">
              <div className="mb-6 flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--teal-soft)] text-[var(--teal)]"><UserRound className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h2 id="account-heading" className="text-lg font-bold text-[var(--ink)]">Account &amp; security</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">Your signed-in administrator profile.</p>
                </div>
              </div>
              <dl className="divide-y divide-line text-sm">
                <div className="grid min-w-0 gap-1 py-4 pt-0 @min-[32rem]:grid-cols-[5rem_minmax(0,1fr)] @min-[32rem]:gap-4">
                  <dt className="text-[var(--muted-foreground)]">Name</dt>
                  <dd className="min-w-0 break-words font-semibold text-[var(--ink)]">{user?.name || 'Admin'}</dd>
                </div>
                <div className="grid min-w-0 gap-1 py-4 @min-[32rem]:grid-cols-[5rem_minmax(0,1fr)] @min-[32rem]:gap-4">
                  <dt className="text-[var(--muted-foreground)]">Email</dt>
                  <dd className="min-w-0 break-all font-semibold text-[var(--ink)]">{user?.email || 'Not available'}</dd>
                </div>
                <div className="grid min-w-0 gap-2 py-4 @min-[32rem]:grid-cols-[5rem_minmax(0,1fr)] @min-[32rem]:gap-4">
                  <dt className="text-[var(--muted-foreground)]">Role</dt>
                  <dd><span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--teal-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--teal)]"><ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />{isSuperAdmin ? 'Super Administrator' : 'Rider Administrator'}</span></dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-line bg-soft/40 p-5 sm:p-6">
              <div className="flex justify-end">
                <button type="button" onClick={() => setShowLogoutConfirm(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--error)]/25 bg-[var(--error-soft)] px-4 py-3 text-sm font-bold text-[var(--error)] transition-colors hover:bg-[var(--error)] hover:text-white"><LogOut className="size-4 shrink-0" aria-hidden="true" />Sign Out</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ConfirmationModal isOpen={showLogoutConfirm} onCancel={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} title="Sign Out?" message="Are you sure you want to sign out of the admin panel?" confirmLabel="Sign Out" variant="danger" zIndexClassName="z-[2001]" />
    </AdminShell>
  );
}
