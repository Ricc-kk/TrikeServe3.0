import { useState, useEffect, useRef } from "react";
import {
  Users, Store, CheckCircle, XCircle,
  AlertTriangle,
  Bell, RefreshCw, X
} from "lucide-react";
import { TerminalIconGlyph } from "../ui/TerminalIcon";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";
import AdminShell from "./AdminShell";
import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser, logAudit } from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
import SuperAdminOverview from "./SuperAdminOverview";
import { Link } from "react-router";
import AdminPageIntro, { AdminMetricCards } from "./AdminPageIntro";
import { ArrowUpRight, Clock, MapPin, Send } from "lucide-react";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'rider' | 'business' | 'admin';
  isVerified: boolean;
  createdAt: string;
  password: string;
  // Rider fields
  todaPlate?: string;
  licenseNumber?: string;
  // Business fields
  businessName?: string;
  businessAddress?: string;
  // Customer fields
  address?: string;
}

interface PendingUser {
  id: string;
  name: string;
  type: 'rider' | 'business';
  email: string;
  phone: string;
  documents: string[];
  submittedDate: string;
  todaPlate?: string;
  licenseNumber?: string;
  businessName?: string;
  businessAddress?: string;
}

interface ActiveUser {
  id: string;
  name: string;
  type: 'customer' | 'rider' | 'business';
  email: string;
  phone: string;
  verifiedDate: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsPanelRef = useRef<HTMLDivElement>(null);
  const [pendingVerifications, setPendingVerifications] = useState<PendingUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);

  const notifications: any[] = [];

  // Load users from localStorage
  //
  // Rates are no longer loaded here. This screen used to fetch the platform
  // rates from admin_settings purely to show them in its own editable cards; with
  // those gone the fetch had nothing to feed, and rates are read where they are
  // set -- the Fares & Delivery tab, per terminal.
  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: supabaseUsers, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('Error loading users from Supabase:', error);
        if (!loadUsersFromLocalStorage()) setLoadError('Account data could not be loaded. Try refreshing the overview.');
        return;
      }

      if (!supabaseUsers) {
        setLoadError('Account data could not be loaded. Try refreshing the overview.');
        return;
      }

      const users: StoredUser[] = supabaseUsers.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.is_verified,
        createdAt: u.created_at,
        password: '',
        todaPlate: u.toda_plate,
        licenseNumber: u.license_number,
        businessName: u.business_name,
        businessAddress: u.business_address,
        address: u.address,
      }));

      const adminType = user?.adminType;
      // Super Admin sees every pending account; Rider Admin only sees riders (read-only).
      let filteredUsers = users;
      if (adminType === 'rider') {
        filteredUsers = users.filter(u => u.role === 'rider');
      }

      const pending = filteredUsers
        .filter(u => !u.isVerified && (u.role === 'rider' || u.role === 'business'))
        .map(u => ({
          id: u.id,
          name: u.role === 'business' ? (u.businessName || u.name) : u.name,
          type: u.role as 'rider' | 'business',
          email: u.email,
          phone: u.phone,
          documents: u.role === 'rider'
            ? ['TODA Plate', 'Driver\'s License', 'Valid ID']
            : ['Business Permit', 'Sanitary Permit', 'Valid ID'],
          submittedDate: new Date(u.createdAt).toLocaleDateString('en-PH'),
          todaPlate: u.todaPlate,
          licenseNumber: u.licenseNumber,
          businessName: u.businessName,
          businessAddress: u.businessAddress,
        }));

      const active = filteredUsers
        .filter(u => u.isVerified && u.role !== 'admin')
        .map(u => ({
          id: u.id,
          name: u.name,
          type: u.role as 'customer' | 'rider' | 'business',
          email: u.email,
          phone: u.phone,
          verifiedDate: new Date(u.createdAt).toLocaleDateString('en-PH'),
        }));

      setPendingVerifications(pending);
      setActiveUsers(active);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error in loadUsers:', error);
      if (!loadUsersFromLocalStorage()) setLoadError('Account data could not be loaded. Try refreshing the overview.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsersFromLocalStorage = () => {
    try {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const users: StoredUser[] = JSON.parse(usersJson);
      if (!Array.isArray(users)) return false;
      const adminType = user?.adminType;

      let filteredUsers = users;
      if (adminType === 'rider') {
        filteredUsers = users.filter(u => u.role === 'rider');
      }

      const pending = filteredUsers
        .filter(u => !u.isVerified && (u.role === 'rider' || u.role === 'business'))
        .map(u => ({
          id: u.id,
          name: u.role === 'business' ? (u.businessName || u.name) : u.name,
          type: u.role as 'rider' | 'business',
          email: u.email,
          phone: u.phone,
          documents: u.role === 'rider'
            ? ['TODA Plate', 'Driver\'s License', 'Valid ID']
            : ['Business Permit', 'Sanitary Permit', 'Valid ID'],
          submittedDate: new Date(u.createdAt).toLocaleDateString('en-PH'),
          todaPlate: u.todaPlate,
          licenseNumber: u.licenseNumber,
          businessName: u.businessName,
          businessAddress: u.businessAddress,
        }));

      const active = filteredUsers
        .filter(u => u.isVerified && u.role !== 'admin')
        .map(u => ({
          id: u.id,
          name: u.name,
          type: u.role as 'customer' | 'rider' | 'business',
          email: u.email,
          phone: u.phone,
          verifiedDate: new Date(u.createdAt).toLocaleDateString('en-PH'),
        }));

      setPendingVerifications(pending);
      setActiveUsers(active);
      setLastUpdated(new Date());
      setLoadError('The server is unavailable. Showing saved account data.');
      return true;
    }
    } catch (error) {
      console.error('Error reading saved users:', error);
    }
    return false;
  };

  useEffect(() => {
    if (!showNotifications) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    notificationsPanelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowNotifications(false);
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(notificationsPanelRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [showNotifications]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [isApprovingUser, setIsApprovingUser] = useState(false);
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

  const handleApproveUser = async (userId: string) => {
    openModal({
      title: "Approve User",
      message: "Approve this user? They will be able to log in immediately.",
      variant: "success",
      confirmLabel: "Approve",
      onConfirm: async () => {
        setIsApprovingUser(true);
        try {
          const result = await adminVerifyUser(userId);
          if (!result.success) {
            setToast({ message: `Approve failed: ${result.error}`, variant: 'error' });
            return;
          }
          const approved = pendingVerifications.find(p => p.id === userId);
          logAudit({
            action: 'verify_user',
            actorRole: 'admin',
            entityType: 'user',
            entityId: userId,
            summary: `Approved ${approved?.type || 'user'} account${approved?.name ? `: ${approved.name}` : ''}`,
            details: approved ? { email: approved.email, type: approved.type } : null,
            actorEmail: user?.email,
            actorName: user?.name,
          });
          if (approved) {
            setPendingVerifications(current => current.filter(account => account.id !== userId));
            setActiveUsers(current => current.some(account => account.id === userId)
              ? current
              : [...current, {
                  id: approved.id,
                  name: approved.name,
                  type: approved.type,
                  email: approved.email,
                  phone: approved.phone,
                  verifiedDate: new Date().toLocaleDateString('en-PH'),
                }]);
          }
          setLastUpdated(new Date());
          setAnalyticsRefresh(value => value + 1);
          closeModal();
          setToast({ message: 'User approved successfully', variant: 'success' });
        } catch (error) {
          setToast({ message: `Approve failed: ${error instanceof Error ? error.message : 'Please try again.'}`, variant: 'error' });
        } finally {
          setIsApprovingUser(false);
        }
      },
    });
  };

  const handleRejectUser = async (userId: string) => {
    openModal({
      title: "Reject User",
      message: "Reject this user? Their account will be permanently deleted.",
      variant: "danger",
      confirmLabel: "Reject",
      onConfirm: async () => {
        const result = await adminDeleteUser(userId);
        if (!result.success) {
          setToast({ message: `Reject failed: ${result.error}`, variant: 'error' });
          return;
        }
        const rejected = pendingVerifications.find(p => p.id === userId);
        logAudit({
          action: 'reject_user',
          actorRole: 'admin',
          entityType: 'user',
          entityId: userId,
          summary: `Rejected and deleted ${rejected?.type || 'user'} account${rejected?.name ? `: ${rejected.name}` : ''}`,
          details: rejected ? { email: rejected.email, type: rejected.type } : null,
          actorEmail: user?.email,
          actorName: user?.name,
        });
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allUsers = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allUsers.filter((u: any) => u.id !== userId)));
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User rejected and deleted', variant: 'success' });
      },
    });
  };

  const stats = {
    totalCustomers: activeUsers.filter(u => u.type === 'customer').length,
    totalRiders: activeUsers.filter(u => u.type === 'rider').length,
    totalBusinesses: activeUsers.filter(u => u.type === 'business').length,
    pendingCount: pendingVerifications.length,
    totalUsers: activeUsers.length,
  };

  // Super Admin performs every admin action; Rider Admin is read-only here.
  const isSuperAdmin = user?.adminType === 'business_customer';
  const isRiderAdmin = user?.adminType === 'rider';

  return (
    <AdminShell
      title="Overview"
      subtitle={
        user?.adminType === 'business_customer'
          ? 'Account reviews and platform performance'
          : user?.adminType === 'rider'
            ? 'Rider Admin — pamamahala ng terminal.'
            : 'TrikeServe control panel.'
      }
      actions={
        <>
        {(isSuperAdmin || isRiderAdmin) && (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { void loadUsers(); setAnalyticsRefresh(value => value + 1); }}
            aria-label="Refresh overview"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-[var(--teal)] transition-colors hover:bg-[var(--teal-soft)] disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowNotifications(true)}
          aria-label={`Notifications${notifications.filter((n: any) => !n.read).length ? `, ${notifications.filter((n: any) => !n.read).length} unread` : ''}`}
          className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-line bg-card hover:bg-[var(--soft)] transition-colors"
        >
          <Bell className="w-5 h-5 text-[var(--ink)]" aria-hidden="true" />
          {notifications.filter((n: any) => !n.read).length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-bold flex items-center justify-center">
              {notifications.filter((n: any) => !n.read).length > 9
                ? '9+'
                : notifications.filter((n: any) => !n.read).length}
            </span>
          )}
        </button>
        </>
      }
    >
      {isSuperAdmin ? (
        <SuperAdminOverview
          stats={stats}
          pending={pendingVerifications}
          loading={isLoading}
          error={loadError}
          lastUpdated={lastUpdated}
          refreshToken={analyticsRefresh}
          onApprove={handleApproveUser}
          onReject={handleRejectUser}
        />
      ) : isRiderAdmin ? (
        <div className="@container mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
          <AdminPageIntro eyebrow="Driver admin · Buod" title="Your terminal, moving forward." description="Check driver verification, manage your assigned terminal, and follow changes sent to the Super Admin." note={isLoading ? 'Loading driver accounts…' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}` : 'Account update unavailable'} />
          {loadError && <div role="alert" className="rounded-2xl border border-line bg-[var(--amber-soft)] p-4 text-sm text-[var(--amber-ink)]">{loadError}</div>}
          <AdminMetricCards loading={isLoading} items={[
            { label: 'Registered drivers', value: activeUsers.filter(account => account.type === 'rider').length + pendingVerifications.filter(account => account.type === 'rider').length, detail: 'Driver accounts across the network', Icon: Users },
            { label: 'Verified drivers', value: activeUsers.filter(account => account.type === 'rider').length, detail: 'Verified by the Super Admin', Icon: CheckCircle, tone: 'success' },
            { label: 'Awaiting verification', value: pendingVerifications.length, detail: 'Account reviews · not change requests', Icon: Clock, tone: 'amber' },
          ]} />
          <section aria-labelledby="driver-workspace-title">
            <h2 id="driver-workspace-title" className="mb-4 text-lg font-bold text-[var(--ink)]">Your workspace <span className="text-xs font-normal text-[var(--muted-foreground)]">· Pamamahala</span></h2>
            <div className="grid gap-3 @min-[40rem]:grid-cols-3">
              {[
                { to: '/admin/terminals', title: 'Manage your terminal', filipino: 'Iyong terminal', description: 'Review your assignment, edit terminal details, and prepare driver changes.', Icon: MapPin },
                { to: '/admin/users', title: 'Browse drivers', filipino: 'Mga driver', description: 'Find driver profiles, TODA assignments, and verification status.', Icon: Users },
                { to: '/admin/requests', title: 'Track your requests', filipino: 'Mga kahiling', description: 'See which of your submitted changes are pending, approved, or rejected.', Icon: Send },
              ].map(({ to, title, filipino, description, Icon }) => <Link key={to} to={to} className="group min-w-0 rounded-3xl border border-line bg-card p-5 transition-colors hover:border-[var(--teal)]/40 hover:bg-soft focus-visible:outline-2 focus-visible:outline-[var(--teal)]"><span className="mb-4 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-[var(--teal-soft)] text-[var(--teal)]"><Icon className="size-5" aria-hidden="true" /></span><ArrowUpRight className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" /></span><h3 className="text-base font-bold text-[var(--ink)]">{title}</h3><p className="mt-1 text-xs text-[var(--teal)]">{filipino}</p><p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p></Link>)}
            </div>
          </section>
          <section aria-labelledby="driver-verification-title" className="overflow-hidden rounded-3xl border border-line bg-card">
            <div className="border-b border-line p-5 sm:p-6"><h2 id="driver-verification-title" className="text-lg font-bold text-[var(--ink)]">Awaiting account verification</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">Read-only · The Super Admin handles account reviews. Terminal changes still require approval.</p></div>
            {isLoading ? <p role="status" className="p-6 text-sm text-[var(--muted-foreground)]">Loading verification queue…</p> : pendingVerifications.length === 0 ? <div className="p-8 text-center"><CheckCircle className="mx-auto mb-3 size-9 text-[var(--success-ink)]" aria-hidden="true" /><p className="text-sm font-bold text-[var(--ink)]">No drivers awaiting verification</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">Walang nakabinbing account.</p></div> : <ul className="grid gap-3 p-4 sm:p-5 @min-[42rem]:grid-cols-2">{pendingVerifications.map(account => <li key={account.id} className="min-w-0 rounded-2xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-bold text-[var(--ink)]">{account.name}</h3><span className="rounded-lg bg-[var(--amber-soft)] px-2 py-1 text-xs font-bold text-[var(--amber-ink)]">Pending</span></div><p className="mt-2 break-all text-sm text-[var(--muted-foreground)]">{account.email}</p><p className="mt-2 text-xs text-[var(--muted-foreground)]">{account.todaPlate || 'Plate not provided'} · Submitted {account.submittedDate}</p></li>)}</ul>}
          </section>
        </div>
      ) : (
      <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-6 mb-6 lg:mb-8">
            {/* Total Customers */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Customers</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalCustomers}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--success-soft)] rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--success)]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[40, 60, 35, 80, 45, 90, 70, 55, 85, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[var(--success)]' : 'bg-[var(--border)]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Drivers */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Drivers</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalRiders}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--info-soft)] rounded-xl flex items-center justify-center">
                  <TerminalIconGlyph className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--info)]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[45, 55, 70, 50, 85, 60, 75, 90, 65, 80, 70, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[var(--info)]' : 'bg-[var(--border)]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Businesses */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Businesses</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalBusinesses}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--violet-soft)] rounded-xl flex items-center justify-center">
                  <Store className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--violet)]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[60, 70, 55, 85, 65, 75, 90, 70, 80, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[var(--violet)]' : 'bg-[var(--border)]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Pending Verifications */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Pending</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--primary)]">{stats.pendingCount}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--amber-soft)] rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--amber)]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[50, 65, 75, 60, 85, 70, 90, 75, 85, 70, 80, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[var(--amber)]' : 'bg-[var(--border)]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Users */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Total Users</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalUsers}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--primary-soft)] rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--primary)]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[55, 60, 70, 65, 80, 75, 85, 80, 90, 75, 85, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:gap-8 mb-6 lg:mb-8">
            {/* Pending Verifications */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Pending Verifications</h2>
              </div>
              {isRiderAdmin && (
                <Card className="p-4 mb-4 border-2 border-[var(--info-soft)] bg-[var(--info-soft)]">
                  <p className="text-sm text-[var(--info)] font-semibold">Read-only</p>
                  <p className="text-xs text-[var(--info)]/80 mt-0.5">
                    Account verification is handled by the Super Admin. Manage terminals and driver assignments instead.
                  </p>
                </Card>
              )}
              {pendingVerifications.length === 0 ? (
                <Card className="p-12 border-2 border-dashed border-[var(--border)] text-center">
                  <CheckCircle className="w-16 h-16 text-[var(--success)] mx-auto mb-4" />
                  <p className="text-[var(--muted-foreground)] text-sm mb-2">All verifications completed!</p>
                  <p className="text-[var(--muted-foreground)] text-xs">No pending users awaiting verification</p>
                </Card>
              ) : (
                <Card className="border border-line bg-surface overflow-hidden">
                  {/* Mobile: the 6-column table needs ~880px, so below sm each pending
                      account becomes a stacked card instead of a scrolling grid. */}
                  <div className="sm:hidden divide-y divide-[var(--border)]">
                    {pendingVerifications.map((user) => (
                      <div key={user.id} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 ${user.type === 'rider' ? 'bg-[var(--info-soft)]' : 'bg-[var(--violet-soft)]'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            {user.type === 'rider' ? (
                              <TerminalIconGlyph className="w-5 h-5 text-[var(--info)]" />
                            ) : (
                              <Store className="w-5 h-5 text-[var(--violet)]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[var(--ink)] truncate">{user.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)] break-all">{user.email}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={user.type === 'rider' ? 'bg-[var(--info)]' : 'bg-[var(--violet)]'}>
                            {user.type.toUpperCase()}
                          </Badge>
                          {user.phone && (
                            <span className="text-xs text-[var(--muted-foreground)]">{user.phone}</span>
                          )}
                          <span className="text-xs text-[var(--muted-foreground)]">{user.submittedDate}</span>
                        </div>

                        {isSuperAdmin ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleApproveUser(user.id)}
                              aria-label={`Approve ${user.name}`}
                              className="min-h-11 rounded-xl bg-[var(--success)] text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle className="w-4 h-4" aria-hidden="true" /> Approve
                            </button>
                            <button
                              onClick={() => handleRejectUser(user.id)}
                              aria-label={`Reject ${user.name}`}
                              className="min-h-11 rounded-xl bg-[var(--error)] text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" aria-hidden="true" /> Reject
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--muted-foreground)] text-center">Super Admin only</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <caption className="sr-only">Accounts awaiting verification, with their details and approval actions</caption>
                      <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">User</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {pendingVerifications.map((user) => (
                          <tr key={user.id} className="hover:bg-[var(--muted)] transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 ${user.type === 'rider' ? 'bg-[var(--info-soft)]' : 'bg-[var(--violet-soft)]'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                  {user.type === 'rider' ? (
                                    <TerminalIconGlyph className="w-5 h-5 text-[var(--info)]" />
                                  ) : (
                                    <Store className="w-5 h-5 text-[var(--violet)]" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-[var(--ink)]">{user.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <Badge className={user.type === 'rider' ? 'bg-[var(--info)]' : 'bg-[var(--violet)]'}>
                                {user.type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[var(--muted-foreground)]">{user.phone}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[var(--muted-foreground)]">{user.submittedDate}</p>
                            </td>
                            <td className="px-4 py-4">
                              {isSuperAdmin ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleApproveUser(user.id)}
                                    className="p-2 bg-[var(--success)] hover:bg-[var(--success)] rounded-lg transition-all"
                                    title="Approve"
                                  >
                                    <CheckCircle className="w-5 h-5 text-white" />
                                  </button>
                                  <button
                                    onClick={() => handleRejectUser(user.id)}
                                    className="p-2 bg-[var(--error)] hover:bg-[var(--error)] rounded-lg transition-all"
                                    title="Reject"
                                  >
                                    <XCircle className="w-5 h-5 text-white" />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-[var(--muted-foreground)] text-center">Super Admin only</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Notifications Panel */}
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[2000]"
            onClick={() => setShowNotifications(false)}
          />
          <div ref={notificationsPanelRef} role="dialog" aria-modal="true" aria-label="Notifications" className="fixed top-0 right-0 h-dvh w-full sm:max-w-md bg-card z-[2001] shadow-2xl overflow-y-auto">
            <div className="p-5 border-b-2 border-[var(--border)] sticky top-0 bg-surface z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--ink)]">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                  className="grid size-11 place-items-center hover:bg-[var(--muted)] rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-[var(--muted-foreground)]" />
                </button>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                {notifications.filter(n => !n.read).length} unread notifications
              </p>
            </div>
            <div className="p-5 space-y-3">
              {notifications.length === 0 && (
                <Card className="p-12 text-center border-2 border-dashed border-[var(--border)]">
                  <Bell className="w-16 h-16 text-[var(--border)] mx-auto mb-4" />
                  <p className="text-[var(--muted-foreground)] text-sm">No notifications yet</p>
                </Card>
              )}
            </div>
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
        isConfirming={isApprovingUser}
        confirmingLabel="Approving..."
        zIndexClassName="z-[2300]"
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </AdminShell>
  );
}
