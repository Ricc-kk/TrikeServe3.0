import { useState, useEffect } from "react";
import {
  Users, Bike, Store, Search, Edit2, Trash2, CheckCircle,
  XCircle, Menu, User as UserIcon, Shield, Filter, MoreVertical
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser, adminUnverifyUser, adminChangeRole } from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";
import Toast from "../ui/toast";

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; variant?: 'success' | 'error' | 'warning' } | null>(null);

  useEffect(() => {
    loadUsers();
  }, [user]);

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
      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'business_customer') {
        filteredUsers = filteredUsers.filter(u => u.role === 'business' || u.role === 'customer');
      } else if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers);
    } catch (error) {
      console.error('Error in loadUsers:', error);
      loadUsersFromLocalStorage();
    }
  };

  const loadUsersFromLocalStorage = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const allUsers: StoredUser[] = JSON.parse(usersJson);
      const adminType = user?.adminType;

      let filteredUsers = allUsers.filter(u => u.role !== 'admin');
      if (adminType === 'business_customer') {
        filteredUsers = filteredUsers.filter(u => u.role === 'business' || u.role === 'customer');
      } else if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      setUsers(filteredUsers);
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

  // Helper function to check if admin can verify a user
  const canVerifyUser = (userRole: string): boolean => {
    // Business & Customer Admin can verify customer and business users, but NOT riders
    if (user?.adminType === 'business_customer') {
      return userRole !== 'rider';
    }
    // Driver Admin can verify rider users, but NOT customers or businesses
    if (user?.adminType === 'rider') {
      return userRole === 'rider';
    }
    // Super admin can verify anyone
    return true;
  };

  // Helper function to check if admin can delete a user
  const canDeleteUser = (userRole: string): boolean => {
    // Same restrictions as verification
    return canVerifyUser(userRole);
  };

  // Helper function to get reason why action is blocked
  const getBlockedReason = (userRole: string): string => {
    if (user?.adminType === 'business_customer' && userRole === 'rider') {
      return 'Business & Customer Admin cannot manage driver users';
    }
    if (user?.adminType === 'rider' && (userRole === 'customer' || userRole === 'business')) {
      return 'Driver Admin can only manage driver users';
    }
    return '';
  };

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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'customer':
        return <Users className="w-5 h-5 text-[#10B981]" />;
      case 'rider':
        return <Bike className="w-5 h-5 text-[#3B82F6]" />;
      case 'business':
        return <Store className="w-5 h-5 text-[#9333EA]" />;
      default:
        return <UserIcon className="w-5 h-5 text-[#64748B]" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'customer':
        return 'bg-[#10B981]';
      case 'rider':
        return 'bg-[#3B82F6]';
      case 'business':
        return 'bg-[#9333EA]';
      default:
        return 'bg-[#64748B]';
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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">User Management</h1>
                <p className="text-xs lg:text-sm text-[#64748B]">Manage users, roles, and verifications</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mb-6">
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Total Users</p>
              <p className="text-2xl font-bold text-[#121212]">{stats.total}</p>
            </Card>
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Customers</p>
              <p className="text-2xl font-bold text-[#10B981]">{stats.customers}</p>
            </Card>
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Drivers</p>
              <p className="text-2xl font-bold text-[#3B82F6]">{stats.riders}</p>
            </Card>
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Businesses</p>
              <p className="text-2xl font-bold text-[#9333EA]">{stats.businesses}</p>
            </Card>
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Verified</p>
              <p className="text-2xl font-bold text-[#10B981]">{stats.verified}</p>
            </Card>
            <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
              <p className="text-xs text-[#64748B] mb-1">Pending</p>
              <p className="text-2xl font-bold text-[#F59E0B]">{stats.pending}</p>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card className="p-5 border-2 border-[#E2E8F0] bg-white mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <Input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-2 border-[#E2E8F0]"
                />
              </div>

              {/* Role Filter */}
              <div>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                >
                  <option value="all">All Roles</option>
                  {(!user?.adminType || user?.adminType === 'business_customer') && (
                    <>
                      <option value="customer">Customers</option>
                      <option value="business">Businesses</option>
                    </>
                  )}
                  {(!user?.adminType || user?.adminType === 'rider') && (
                    <option value="rider">Drivers</option>
                  )}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                >
                  <option value="all">All Status</option>
                  <option value="verified">Verified Only</option>
                  <option value="pending">Pending Only</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Users List */}
          <Card className="border-2 border-[#E2E8F0] bg-white overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-[#E2E8F0] text-center">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-[#64748B] text-sm">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F8F9FA] border-b-2 border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Details</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-[#64748B] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#F8F9FA] transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${
                              u.role === 'customer' ? 'bg-[#D1FAE5]' :
                              u.role === 'rider' ? 'bg-[#DBEAFE]' :
                              'bg-[#F3E8FF]'
                            } rounded-xl flex items-center justify-center flex-shrink-0`}>
                              {getRoleIcon(u.role)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-[#121212]">
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
                                className="px-3 py-1 border-2 border-[#E11D48] rounded-lg font-semibold text-sm"
                              >
                                {(!user?.adminType || user?.adminType === 'business_customer') && (
                                  <>
                                    <option value="customer">Customer</option>
                                    <option value="business">Business</option>
                                  </>
                                )}
                                {(!user?.adminType || user?.adminType === 'rider') && (
                                  <option value="rider">Driver</option>
                                )}
                              </select>
                              <button
                                onClick={() => handleSaveRole(u.id)}
                                className="p-1.5 bg-[#10B981] hover:bg-[#059669] rounded-lg transition-all"
                              >
                                <CheckCircle className="w-4 h-4 text-white" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1.5 bg-[#64748B] hover:bg-[#475569] rounded-lg transition-all"
                              >
                                <XCircle className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge className={getRoleBadgeColor(u.role)}>
                                {u.role.toUpperCase()}
                              </Badge>
                              <button
                                onClick={() => handleStartEditRole(u.id, u.role)}
                                className="p-1 hover:bg-[#F8F9FA] rounded transition-all"
                              >
                                <Edit2 className="w-4 h-4 text-[#64748B]" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {u.isVerified ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-[#10B981]" />
                                <span className="font-semibold text-[#10B981]">Verified</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-[#F59E0B]" />
                                <span className="font-semibold text-[#F59E0B]">Pending</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[#64748B]">{u.email}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-[#64748B]">{u.phone}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-[#64748B]">
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
                              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                canVerifyUser(u.role)
                                  ? u.isVerified
                                    ? 'bg-[#F59E0B] hover:bg-[#D97706] text-white cursor-pointer'
                                    : 'bg-[#10B981] hover:bg-[#059669] text-white cursor-pointer'
                                  : 'bg-[#D1D5DB] text-[#6B7280] cursor-not-allowed opacity-50'
                              }`}
                            >
                              {u.isVerified ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              {u.isVerified ? 'Unverify' : 'Verify'}
                            </button>
                            <button
                              onClick={canDeleteUser(u.role) ? () => handleDeleteUser(u.id) : undefined}
                              disabled={!canDeleteUser(u.role)}
                              title={!canDeleteUser(u.role) ? getBlockedReason(u.role) : 'Delete this user'}
                              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 font-semibold text-xs ${
                                canDeleteUser(u.role)
                                  ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer'
                                  : 'bg-[#D1D5DB] text-[#6B7280] cursor-not-allowed opacity-50'
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
            )}
          </Card>
        </div>
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
    </div>
  );
}
