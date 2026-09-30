import { useState, useEffect } from "react";
import {
  Users, Store, Bike, CheckCircle, XCircle,
  AlertTriangle, User as UserIcon,
  Bell, Menu, X
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser } from "../../../lib/supabase";
import { normalizeRates } from "@/lib/pricing";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";

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
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingVerifications, setPendingVerifications] = useState<PendingUser[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);

  const [rateConfig, setRateConfig] = useState({
    baseFare: 20,
    perKm: 10,
    sharedRide: 15,
    privateRide: 50,
    deliveryBaseFee: 30,
  });

  const notifications: any[] = [];

  // Load users from localStorage
  useEffect(() => {
    loadUsers();
    loadRates();
  }, [user]);

  const loadRates = async () => {
    // Supabase is the source of truth (it's what the customer app reads);
    // localStorage is only an offline fallback.
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'rates')
        .single();

      if (!error && data?.setting_value) {
        const rates = normalizeRates(JSON.parse(data.setting_value));
        setRateConfig(rates);
        localStorage.setItem('trikeserve_rates', JSON.stringify(rates));
        return;
      }
    } catch (error) {
      console.warn('Error loading rates from Supabase:', error);
    }

    const savedRates = localStorage.getItem('trikeserve_rates');
    if (savedRates) {
      try {
        setRateConfig(normalizeRates(JSON.parse(savedRates)));
      } catch (error) {
        console.error('Error loading rates:', error);
      }
    }
  };

  const loadUsers = async () => {
    try {
      const { data: supabaseUsers, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('Error loading users from Supabase:', error);
        loadUsersFromLocalStorage();
        return;
      }

      if (!supabaseUsers) return;

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
    } catch (error) {
      console.error('Error in loadUsers:', error);
      loadUsersFromLocalStorage();
    }
  };

  const loadUsersFromLocalStorage = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const users: StoredUser[] = JSON.parse(usersJson);
      const adminType = user?.adminType;

      let filteredUsers = users;
      if (adminType === 'business_customer') {
        filteredUsers = users.filter(u => u.role === 'business' || u.role === 'customer');
      } else if (adminType === 'rider') {
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

  const handleApproveUser = async (userId: string) => {
    openModal({
      title: "Approve User",
      message: "Approve this user? They will be able to log in immediately.",
      variant: "success",
      confirmLabel: "Approve",
      onConfirm: async () => {
        const result = await adminVerifyUser(userId);
        if (!result.success) {
          setToast({ message: `Approve failed: ${result.error}`, variant: 'error' });
          return;
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User approved successfully', variant: 'success' });
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

  const RATE_LABELS: Record<'baseFare' | 'perKm' | 'sharedRide' | 'privateRide' | 'deliveryBaseFee', string> = {
    baseFare: 'Base Fare',
    perKm: 'Rate per Kilometer',
    sharedRide: 'Shared Ride',
    privateRide: 'Private Ride',
    deliveryBaseFee: 'Delivery Fee',
  };

  const handleUpdateRate = (rateType: keyof typeof RATE_LABELS) => {
    const label = RATE_LABELS[rateType];
    openModal({
      title: 'Save Rate Change',
      message: `Save the updated ${label} rate?`,
      variant: 'success',
      confirmLabel: 'Save',
      onConfirm: async () => {
        closeModal();
        localStorage.setItem('trikeserve_rates', JSON.stringify(rateConfig));
        try {
          const { error } = await supabase
            .from('admin_settings')
            .upsert({
              setting_key: 'rates',
              setting_value: JSON.stringify(rateConfig),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'setting_key' });

          setToast(
            error
              ? { message: 'Saved on this device — cloud sync failed.', variant: 'warning' }
              : { message: `${label} rate updated successfully!`, variant: 'success' }
          );
        } catch (error) {
          console.error('Error saving rates to Supabase:', error);
          setToast({ message: 'Saved on this device — cloud sync failed.', variant: 'warning' });
        }
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
    <div className="min-h-screen bg-[var(--muted)] flex">
      {/* Sidebar Navigation */}
      <AdminSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Top Header */}
        <div className="bg-white border-b-2 border-[var(--border)] px-5 lg:px-8 py-4 lg:py-5 sticky top-0 z-50">
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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[var(--ink)]">
                  Welcome, {user?.name || 'Admin'}! / Maligayang pagdating
                </h1>
                <p className="text-xs lg:text-sm text-[var(--muted-foreground)]">
                  {user?.adminType === 'business_customer' ? 'Super Admin - Full Platform Control' :
                   user?.adminType === 'rider' ? 'Rider Admin - Terminal Management' :
                   'TrikeServe Control Panel - System Overview'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-4">
              <button
                onClick={() => setShowNotifications(true)}
                className="relative p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
              >
                <Bell className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--muted-foreground)]" />
                {notifications.filter((n: any) => !n.read).length > 0 && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-[var(--primary)] rounded-full" />
                )}
              </button>
              <div className="hidden lg:flex items-center gap-3 px-3 py-2 rounded-xl">
                <div className="w-10 h-10 bg-gradient-to-br from-[var(--primary)] to-[var(--ink)] rounded-full flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-[var(--ink)] text-sm">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Administrator</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-6 mb-6 lg:mb-8">
            {/* Total Customers */}
            <Card className="p-4 lg:p-6 border-2 border-[var(--border)] bg-white">
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
            <Card className="p-4 lg:p-6 border-2 border-[var(--border)] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Drivers</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalRiders}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--info-soft)] rounded-xl flex items-center justify-center">
                  <Bike className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--info)]" />
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
            <Card className="p-4 lg:p-6 border-2 border-[var(--border)] bg-white">
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
            <Card className="p-4 lg:p-6 border-2 border-[var(--border)] bg-white">
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
            <Card className="p-4 lg:p-6 border-2 border-[var(--border)] bg-white">
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
                <Card className="border-2 border-[var(--border)] bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">User</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {pendingVerifications.map((user) => (
                          <tr key={user.id} className="hover:bg-[var(--muted)] transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 ${user.type === 'rider' ? 'bg-[var(--info-soft)]' : 'bg-[var(--violet-soft)]'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                  {user.type === 'rider' ? (
                                    <Bike className="w-5 h-5 text-[var(--info)]" />
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

          {/* Delivery Fee Configuration - Super Admin */}
          {isSuperAdmin && (
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Delivery Fee Configuration</h2>
              <Card className="p-5 lg:p-6 border-2 border-[var(--border)] bg-white max-w-md">
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
                    className="text-2xl lg:text-3xl font-bold text-center border-2 border-[var(--border)]"
                  />
                </div>
                <button
                  onClick={() => handleUpdateRate('deliveryBaseFee')}
                  className="w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-xl uppercase transition-all"
                >
                  Update Rate
                </button>
              </Card>
            </div>
          )}

          {/* Fixed Rate Configuration - Super Admin */}
          {isSuperAdmin && (
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Fixed Rate Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                <Card className="p-5 lg:p-6 border-2 border-[var(--border)] bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Store className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--violet)] mb-2" />
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
                      className="text-2xl lg:text-3xl font-bold text-center border-2 border-[var(--border)]"
                    />
                  </div>
                  <button
                    onClick={() => handleUpdateRate('baseFare')}
                    className="w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-xl uppercase transition-all"
                  >
                    Update Rate
                  </button>
                </Card>

                <Card className="p-5 lg:p-6 border-2 border-[var(--border)] bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Bike className="w-8 h-8 lg:w-10 lg:h-10 text-[var(--violet)] mb-2" />
                      <h3 className="font-bold text-base lg:text-lg text-[var(--ink)]">Rate per Kilometer</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">Charged for each km travelled</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg text-[var(--muted-foreground)] font-bold">₱</span>
                    <Input
                      type="number"
                      value={rateConfig.perKm}
                      onChange={(e) => setRateConfig({ ...rateConfig, perKm: Number(e.target.value) })}
                      className="text-2xl lg:text-3xl font-bold text-center border-2 border-[var(--border)]"
                    />
                    <span className="text-sm text-[var(--muted-foreground)] font-semibold">/km</span>
                  </div>
                  <button
                    onClick={() => handleUpdateRate('perKm')}
                    className="w-full py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold rounded-xl uppercase transition-all"
                  >
                    Update Rate
                  </button>
                </Card>

  
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[2000]"
            onClick={() => setShowNotifications(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full lg:w-[400px] bg-white z-[2001] shadow-2xl overflow-y-auto">
            <div className="p-5 border-b-2 border-[var(--border)] sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--ink)]">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
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
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}