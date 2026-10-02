import { useState, useEffect } from "react";
import {
  Users, Store, Search, Edit2, Trash2, CheckCircle,
  XCircle, Menu, User as UserIcon, Shield, Filter, MoreVertical
} from "lucide-react";
import { Tricycle } from "../ui/Tricycle";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";

import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser, adminUnverifyUser, adminChangeRole } from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/Toast";
import EmptyState from "../ui/EmptyState";
import AdminShell from "./AdminShell";
import { StatSkeleton, TableSkeleton } from "./AdminSkeleton";

interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'rider' | 'business' | 'admin';
  isVerified: boolean;
  createdAt: string;
  password: string;
  adminType?: 'business_customer' | 'rider';
  todaPlate?: string;
  licenseNumber?: string;
  businessName?: string;
  businessAddress?: string;
  address?: string;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [user]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: supabaseUsers, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('Error loading users from Supabase:', error);
        loadUsersFromLocalStorage();
        return;
      }

      if (!supabaseUsers) {
        setLoading(false);
        return;
      }

      const allUsers: StoredUser[] = supabaseUsers.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.is_verified,
        createdAt: u.created_at,
        password: '',
        adminType: u.admin_type,
        todaPlate: u.toda_plate,
        licenseNumber: u.license_number,
        businessName: u.business_name,
        businessAddress: u.business_address,
        address: u.address,
      }));

      const adminType = user?.adminType;
      // Super Admin sees every user; the Rider Admin only gets riders (read-only).
      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers);
    } catch (error) {
      console.error('Error in loadUsers:', error);
      loadUsersFromLocalStorage();
    } finally {
      setLoading(false);
    }
  };

  const loadUsersFromLocalStorage = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (!usersJson) {
      setLoading(false);
      return;
    }
    {
      const allUsers: StoredUser[] = JSON.parse(usersJson);
      const adminType = user?.adminType;

      // Super Admin sees every user; the Rider Admin only gets riders (read-only).
      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers);
    }
    setLoading(false);
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

  const handleDeleteUser = async (userId: string) => {
    openModal({
      title: "Delete User",
      message: "Are you sure you want to delete this user? This action cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        const result = await adminDeleteUser(userId);
        if (!result.success) {
          setToast({ message: `Delete failed: ${result.error}`, variant: 'error' });
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allUsers: StoredUser[] = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allUsers.filter(u => u.id !== userId)));
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User deleted successfully', variant: 'success' });
      },
    });
  };

  const handleVerifyUser = async (userId: string) => {
    openModal({
      title: "Verify User",
      message: "Approve this user? They will be able to log in immediately.",
      variant: "success",
      confirmLabel: "Verify",
      onConfirm: async () => {
        const result = await adminVerifyUser(userId);
        if (!result.success) {
          setToast({ message: `Verify failed: ${result.error}`, variant: 'error' });
          return;
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User verified successfully', variant: 'success' });
      },
    });
  };

  const handleUnverifyUser = async (userId: string) => {
    openModal({
      title: "Unverify User",
      message: "Are you sure you want to unverify this user? They will not be able to log in until re-verified.",
      variant: "warning",
      confirmLabel: "Unverify",
      onConfirm: async () => {
        const result = await adminUnverifyUser(userId);
        if (!result.success) {
          setToast({ message: `Unverify failed: ${result.error}`, variant: 'error' });
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allUsers: StoredUser[] = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allUsers.map(u =>
            u.id === userId ? { ...u, isVerified: false } : u
          )));
        }
        loadUsers();
        closeModal();
        setToast({ message: 'User unverified successfully', variant: 'warning' });
      },
    });
  };

  // Only the Super Admin performs user actions; the Rider Admin gets a read-only driver list.
  const isSuperAdmin = user?.adminType === 'business_customer';
  const isRiderReadOnly = user?.adminType === 'rider';

  const canVerifyUser = (_userRole: string): boolean => isSuperAdmin;
  const canDeleteUser = (_userRole: string): boolean => isSuperAdmin;

  const getBlockedReason = (_userRole: string): string =>
    'Only the Super Admin can manage users';

  const handleStartEditRole = (userId: string, currentRole: string) => {
    setEditingUserId(userId);
    setEditRole(currentRole);
  };

  const handleSaveRole = (userId: string) => {
    openModal({
      title: "Change Role",
      message: `Change this user's role to ${editRole.toUpperCase()}?`,
      variant: "success",
      confirmLabel: "Change Role",
      onConfirm: async () => {
        const result = await adminChangeRole(userId, editRole);
        if (!result.success) {
          setToast({ message: `Change role failed: ${result.error}`, variant: 'error' });
          return;
        }
        loadUsers();
        setEditingUserId(null);
        closeModal();
        setToast({ message: `User role changed to ${editRole.toUpperCase()}`, variant: 'success' });
      },
    });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditRole("");
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery);

    const matchesRole = filterRole === "all" || u.role === filterRole;
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "verified" && u.isVerified) ||
      (filterStatus === "pending" && !u.isVerified);

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Lets the empty state say *why* it is empty and offer a way back.
  const hasActiveFilter =
    searchQuery.trim() !== "" || filterRole !== "all" || filterStatus !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setFilterRole("all");
    setFilterStatus("all");
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'customer':
        return <Users className="w-5 h-5 text-[var(--success)]" />;
      case 'rider':
        return <Tricycle className="w-5 h-5 text-[var(--info)]" />;
      case 'business':
        return <Store className="w-5 h-5 text-[var(--violet)]" />;
      default:
        return <UserIcon className="w-5 h-5 text-[var(--muted-foreground)]" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'customer':
        return 'bg-[var(--success)]';
      case 'rider':
        return 'bg-[var(--info)]';
      case 'business':
        return 'bg-[var(--violet)]';
      default:
        return 'bg-[var(--muted-foreground)]';
    }
  };

  const stats = {
    total: users.length,
    customers: users.filter(u => u.role === 'customer').length,
    riders: users.filter(u => u.role === 'rider').length,
    businesses: users.filter(u => u.role === 'business').length,
    verified: users.filter(u => u.isVerified).length,
    pending: users.filter(u => !u.isVerified).length,
  };

  return (
    <AdminShell
      title="User Management"
      subtitle="Manage users, roles, and verifications"
    >

        {/* Content */}
        <div className="space-y-6">
          {loading && (
            <>
              <StatSkeleton count={6} />
              <div className="mt-6">
                <TableSkeleton rows={6} cols={5} />
              </div>
            </>
          )}

          {!loading && isRiderReadOnly && (
            <Card className="p-4 mb-6 border-2 border-[var(--info-soft)] bg-[var(--info-soft)]">
              <p className="text-sm text-[var(--info)] font-semibold">Read-only access</p>
              <p className="text-xs text-[var(--info)]/80 mt-0.5">
                Verification, role changes and account management are handled by the Super Admin.
              </p>
            </Card>
          )}

          {!loading && (
          <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mb-6">
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Total Users</p>
              <p className="text-2xl font-bold text-[var(--ink)]">{stats.total}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Customers</p>
              <p className="text-2xl font-bold text-[var(--success)]">{stats.customers}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Drivers</p>
              <p className="text-2xl font-bold text-[var(--info)]">{stats.riders}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Businesses</p>
              <p className="text-2xl font-bold text-[var(--violet)]">{stats.businesses}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Verified</p>
              <p className="text-2xl font-bold text-[var(--success)]">{stats.verified}</p>
            </Card>
            <Card className="p-4 border border-line bg-surface">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Pending</p>
              <p className="text-2xl font-bold text-[var(--amber)]">{stats.pending}</p>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card className="p-5 border border-line bg-surface mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <label htmlFor="admin-user-search" className="sr-only">
                  Search users
                </label>
                <Input
                  id="admin-user-search"
                  type="search"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border border-line min-h-11"
                />
              </div>

              {/* Role Filter */}
              <div>
                <label htmlFor="admin-user-filter-role" className="sr-only">
                  Filter by role
                </label>
                <select
                  id="admin-user-filter-role"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full min-h-11 p-3 border border-line rounded-xl font-semibold"
                >
                  <option value="all">All Roles</option>
                  {(!user?.adminType || user?.adminType === 'business_customer') && (
                    <>
                      <option value="customer">Customers</option>
                      <option value="business">Businesses</option>
                      <option value="rider">Drivers</option>
                    </>
                  )}
                  {(!user?.adminType || user?.adminType === 'rider') && (
                    <option value="rider">Drivers</option>
                  )}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label htmlFor="admin-user-filter-status" className="sr-only">
                  Filter by verification status
                </label>
                <select
                  id="admin-user-filter-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full min-h-11 p-3 border border-line rounded-xl font-semibold"
                >
                  <option value="all">All Status</option>
                  <option value="verified">Verified Only</option>
                  <option value="pending">Pending Only</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Users List */}
          <Card className="border border-line bg-surface overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState
                  icon={Users}
                  title={hasActiveFilter ? 'No users match these filters' : 'No users yet'}
                  description={
                    hasActiveFilter
                      ? 'Try a different search term, role or status.'
                      : 'Registered customers, drivers and businesses will appear here.'
                  }
                  filipino={hasActiveFilter ? 'Wala pang tumutugma sa mga filter na ito.' : 'Wala pang nakarehistong gumagamit.'}
                  action={
                    hasActiveFilter ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="min-h-11 px-5 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
              {/* Mobile: stacked cards. A 5-column table needs ~900px and reads
                  poorly on a phone, so below sm each user becomes one card. */}
              <div className="sm:hidden space-y-3">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${getRoleBadgeColor(u.role)}`}>
                        {getRoleIcon(u.role)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--ink)] truncate">
                          {u.role === 'business' ? (u.businessName || u.name) : u.name}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className={getRoleBadgeColor(u.role)}>{u.role.toUpperCase()}</Badge>
                      {u.isVerified ? (
                        <Badge className="bg-[var(--success-soft)] text-[var(--success)]">Verified</Badge>
                      ) : (
                        <Badge className="bg-[var(--amber-soft)] text-[var(--amber-ink)]">Pending</Badge>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={canVerifyUser(u.role) ? (u.isVerified ? () => handleUnverifyUser(u.id) : () => handleVerifyUser(u.id)) : undefined}
                        disabled={!canVerifyUser(u.role)}
                        aria-label={`${u.isVerified ? 'Unverify' : 'Verify'} ${u.name}`}
                        title={!canVerifyUser(u.role) ? getBlockedReason(u.role) : u.isVerified ? 'Unverify this user' : 'Verify this user'}
                        className={`min-h-11 rounded-xl transition-all flex items-center justify-center gap-1.5 font-semibold text-xs ${
                          canVerifyUser(u.role)
                            ? u.isVerified
                              ? 'bg-[var(--amber)] text-white'
                              : 'bg-[var(--success)] text-white'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)] opacity-50'
                        }`}
                      >
                        {u.isVerified ? <XCircle className="w-4 h-4" aria-hidden="true" /> : <CheckCircle className="w-4 h-4" aria-hidden="true" />}
                        {u.isVerified ? 'Unverify' : 'Verify'}
                      </button>
                      <button
                        onClick={canDeleteUser(u.role) ? () => handleDeleteUser(u.id) : undefined}
                        disabled={!canDeleteUser(u.role)}
                        aria-label={`Delete ${u.name}`}
                        title={!canDeleteUser(u.role) ? getBlockedReason(u.role) : 'Delete this user'}
                        className={`min-h-11 rounded-xl transition-all flex items-center justify-center gap-1.5 font-semibold text-xs ${
                          canDeleteUser(u.role)
                            ? 'bg-[var(--error)] text-white'
                            : 'bg-[var(--muted)] text-[var(--muted-foreground)] opacity-50'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / tablet: the full table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                <caption className="sr-only">Registered users, their role, verification status and available actions</caption>
                  <thead className="bg-[var(--muted)] border-b-2 border-[var(--border)]">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">User</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Role</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Status</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Email</th>
                      <th scope="col" className="hidden lg:table-cell px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Phone</th>
                      <th scope="col" className="hidden lg:table-cell px-4 py-3 text-left text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Details</th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-[var(--muted-foreground)] tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[var(--muted)] transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${
                              u.role === 'customer' ? 'bg-[var(--success-soft)]' :
                              u.role === 'rider' ? 'bg-[var(--info-soft)]' :
                              'bg-[var(--violet-soft)]'
                            } rounded-xl flex items-center justify-center flex-shrink-0`}>
                              {getRoleIcon(u.role)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-[var(--ink)]">
                                  {u.role === 'business' ? (u.businessName || u.name) : u.name}
                                </p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {editingUserId === u.id ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value)}
                                className="px-3 py-1 border-2 border-[var(--primary)] rounded-lg font-semibold text-sm"
                              >
                                {(!user?.adminType || user?.adminType === 'business_customer') && (
                                  <>
                                    <option value="customer">Customer</option>
                                    <option value="business">Business</option>
                                    <option value="rider">Driver</option>
                                  </>
                                )}
                                {(!user?.adminType || user?.adminType === 'rider') && (
                                  <option value="rider">Driver</option>
                                )}
                              </select>
                              <button
                                onClick={() => handleSaveRole(u.id)}
                                className="p-1.5 bg-[var(--success)] hover:bg-[var(--success)] rounded-lg transition-all"
                              >
                                <CheckCircle className="w-4 h-4 text-white" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1.5 bg-[var(--muted-foreground)] hover:bg-[var(--muted-foreground)] rounded-lg transition-all"
                              >
                                <XCircle className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge className={getRoleBadgeColor(u.role)}>
                                {u.role.toUpperCase()}
                              </Badge>
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleStartEditRole(u.id, u.role)}
                                  aria-label={`Change role for ${u.name}`}
                                  className="min-h-11 min-w-11 flex items-center justify-center hover:bg-[var(--muted)] rounded-lg transition-all"
                                >
                                  <Edit2 className="w-4 h-4 text-[var(--muted-foreground)]" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {u.isVerified ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                                <span className="font-semibold text-[var(--success)]">Verified</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-[var(--amber)]" />
                                <span className="font-semibold text-[var(--amber)]">Pending</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[var(--muted-foreground)]">{u.email}</p>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <p className="text-sm text-[var(--muted-foreground)]">{u.phone}</p>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <div className="text-sm text-[var(--muted-foreground)]">
                            {u.role === 'rider' && u.todaPlate && (
                              <p><span className="font-semibold">TODA:</span> {u.todaPlate}</p>
                            )}
                            {u.role === 'business' && u.businessAddress && (
                              <p className="max-w-xs truncate"><span className="font-semibold">Addr:</span> {u.businessAddress}</p>
                            )}
                            {u.role === 'customer' && u.address && (
                              <p className="max-w-xs truncate"><span className="font-semibold">Addr:</span> {u.address}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={canVerifyUser(u.role) ? (u.isVerified ? () => handleUnverifyUser(u.id) : () => handleVerifyUser(u.id)) : undefined}
                              disabled={!canVerifyUser(u.role)}
                              title={!canVerifyUser(u.role) ? getBlockedReason(u.role) : u.isVerified ? 'Unverify this user' : 'Verify this user'}
                              className={`min-h-11 px-3 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                canVerifyUser(u.role)
                                  ? u.isVerified
                                    ? 'bg-[var(--amber)] hover:bg-[var(--amber)] text-white cursor-pointer'
                                    : 'bg-[var(--success)] hover:bg-[var(--success)] text-white cursor-pointer'
                                  : 'bg-[var(--muted-foreground)] text-[var(--muted-foreground)] cursor-not-allowed opacity-50'
                              }`}
                            >
                              {u.isVerified ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              {u.isVerified ? 'Unverify' : 'Verify'}
                            </button>
                            <button
                              onClick={canDeleteUser(u.role) ? () => handleDeleteUser(u.id) : undefined}
                              disabled={!canDeleteUser(u.role)}
                              title={!canDeleteUser(u.role) ? getBlockedReason(u.role) : 'Delete this user'}
                              className={`min-h-11 px-3 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                canDeleteUser(u.role)
                                  ? 'bg-[var(--error)] hover:bg-[var(--error)] text-white cursor-pointer'
                                  : 'bg-[var(--muted-foreground)] text-[var(--muted-foreground)] cursor-not-allowed opacity-50'
                              }`}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Card>
          </>
          )}
        </div>

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
    </AdminShell>
  );
}
