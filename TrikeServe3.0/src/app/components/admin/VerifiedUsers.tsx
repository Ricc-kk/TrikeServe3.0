import { useState, useEffect } from "react";
import {
  Users, Bike, Store, Search, CheckCircle, Clock,
  Menu, X, Shield, Filter
} from "lucide-react";
import { useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { useAuth } from "../../contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";
import { supabase } from "../../../utils/supabase";
import { adminDeleteUser, adminVerifyUser } from "../../../lib/supabase";
import ConfirmationModal from "../ui/confirmation-modal";

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

export default function VerifiedUsers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<StoredUser[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<StoredUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<StoredUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'verified' | 'pending'>('verified');

  useEffect(() => {
    // Check if user is admin
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }

    loadUsers();
  }, [user, navigate]);

  const loadUsers = async () => {
    try {
      // Fetch all users from Supabase
      const { data: allStoredUsers, error } = await supabase
        .from('users')
        .select('*');

      if (error) {
        console.error('Error loading users from Supabase:', error);
        // Fallback to localStorage if Supabase fails
        loadUsersFromLocalStorage();
        return;
      }

      if (!allStoredUsers) return;

      // Convert Supabase format to local format
      const users = allStoredUsers.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isVerified: u.is_verified,
        createdAt: u.created_at,
        adminType: u.admin_type,
        todaPlate: u.toda_plate,
        licenseNumber: u.license_number,
        businessName: u.business_name,
        businessAddress: u.business_address,
        address: u.address,
      }));

      setAllUsers(users);

      // Get current admin's type
      const adminType = user?.adminType;

      // Filter users based on admin type
      let filteredUsers = users.filter((u: any) => u.role !== 'admin');

      if (adminType === 'business_customer') {
        filteredUsers = filteredUsers.filter(
          (u: any) => u.role === 'business' || u.role === 'customer'
        );
      } else if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter((u: any) => u.role === 'rider');
      }

      // Separate into verified and pending
      const verified = filteredUsers.filter((u: any) => u.isVerified);
      const pending = filteredUsers.filter((u: any) => !u.isVerified);

      setVerifiedUsers(verified);
      setPendingUsers(pending);
    } catch (error) {
      console.error('Error in loadUsers:', error);
      loadUsersFromLocalStorage();
    }
  };

  // Fallback function for localStorage
  const loadUsersFromLocalStorage = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const allStoredUsers: StoredUser[] = JSON.parse(usersJson);
      setAllUsers(allStoredUsers);

      const adminType = user?.adminType;
      let filteredUsers = allStoredUsers.filter(u => u.role !== 'admin');

      if (adminType === 'business_customer') {
        filteredUsers = filteredUsers.filter(
          u => u.role === 'business' || u.role === 'customer'
        );
      } else if (adminType === 'rider') {
        filteredUsers = filteredUsers.filter(u => u.role === 'rider');
      }

      const verified = filteredUsers.filter(u => u.isVerified);
      const pending = filteredUsers.filter(u => !u.isVerified);

      setVerifiedUsers(verified);
      setPendingUsers(pending);
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

  const handleVerifyUser = async (userId: string) => {
    openModal({
      title: "Approve User",
      message: "Approve this user? They will be able to log in immediately.",
      variant: "success",
      confirmLabel: "Approve",
      onConfirm: async () => {
        const result = await adminVerifyUser(userId, {
          email: user?.email || '',
          password: user?.password || '',
        });
        if (!result.success) {
          alert(`Failed to verify user: ${result.error}`);
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allStoredUsers: StoredUser[] = JSON.parse(usersJson);
          localStorage.setItem('trikeserve_users', JSON.stringify(allStoredUsers.map(u =>
            u.id === userId ? { ...u, isVerified: true } : u
          )));
        }
        loadUsers();
        closeModal();
      },
    });
  };

  const handleVerifyUserLocalStorage = (userId: string) => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const allStoredUsers: StoredUser[] = JSON.parse(usersJson);
      const updatedUsers = allStoredUsers.map(u =>
        u.id === userId ? { ...u, isVerified: true } : u
      );
      localStorage.setItem('trikeserve_users', JSON.stringify(updatedUsers));
      loadUsers();
    }
  };

  const handleRejectUser = async (userId: string) => {
    openModal({
      title: "Reject User",
      message: "Are you sure you want to reject this user? Their account will be permanently deleted.",
      variant: "danger",
      confirmLabel: "Reject",
      onConfirm: async () => {
        const result = await adminDeleteUser(userId, {
          email: user?.email || '',
          password: user?.password || '',
        });
        if (!result.success) {
          alert(`Failed to delete user: ${result.error}`);
          return;
        }
        const usersJson = localStorage.getItem('trikeserve_users');
        if (usersJson) {
          const allStoredUsers: StoredUser[] = JSON.parse(usersJson);
          const updatedUsers = allStoredUsers.filter(u => u.id !== userId);
          localStorage.setItem('trikeserve_users', JSON.stringify(updatedUsers));
        }

        loadUsers();
        closeModal();
      },
    });
  };

  const handleRejectUserLocalStorage = (userId: string) => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const allStoredUsers: StoredUser[] = JSON.parse(usersJson);
      const updatedUsers = allStoredUsers.filter(u => u.id !== userId);
      localStorage.setItem('trikeserve_users', JSON.stringify(updatedUsers));
      loadUsers();
    }
  };

  const getFilteredUsers = (users: StoredUser[]) => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      u =>
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.phone.includes(query) ||
        (u.businessName?.toLowerCase().includes(query))
    );
  };

  const getAdminTypeLabel = () => {
    if (user?.adminType === 'business_customer') {
      return 'Business & Customer Admin';
    } else if (user?.adminType === 'rider') {
      return 'Driver Admin';
    }
    return 'Admin';
  };

  const canVerifyUser = (userRole: string): boolean => {
    // Business & Customer Admin can verify business and customer users, but NOT riders
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

  const getVerificationBlockedReason = (userRole: string): string => {
    if (user?.adminType === 'business_customer') {
      return 'Business & Customer Admin cannot verify driver users';
    }
    if (user?.adminType === 'rider') {
      return 'Driver Admin can only verify driver users';
    }
    return '';
  };

  const getRoleIcon = (role: string) => {
    if (role === 'rider') return <Bike className="w-4 h-4" />;
    if (role === 'business') return <Store className="w-4 h-4" />;
    return <Users className="w-4 h-4" />;
  };

  const getRoleBadgeColor = (role: string) => {
    if (role === 'rider') return 'bg-blue-100 text-blue-800';
    if (role === 'business') return 'bg-purple-100 text-purple-800';
    return 'bg-green-100 text-green-800';
  };

  const filteredVerified = getFilteredUsers(verifiedUsers);
  const filteredPending = getFilteredUsers(pendingUsers);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block`}>
        <AdminSidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">User Verification</h1>
              <p className="text-sm text-gray-600">{getAdminTypeLabel()}</p>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 hover:bg-gray-200 rounded-lg"
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="p-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Verified Users</p>
                  <p className="text-3xl font-bold text-green-600">{filteredVerified.length}</p>
                </div>
                <CheckCircle className="w-12 h-12 text-green-100" />
              </div>
            </Card>

            <Card className="p-4 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Pending Verification</p>
                  <p className="text-3xl font-bold text-yellow-600">{filteredPending.length}</p>
                </div>
                <Clock className="w-12 h-12 text-yellow-100" />
              </div>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('verified')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'verified'
                  ? 'text-green-600 border-green-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              <CheckCircle className="inline w-4 h-4 mr-2" />
              Verified Users ({filteredVerified.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'text-yellow-600 border-yellow-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              <Clock className="inline w-4 h-4 mr-2" />
              Pending ({filteredPending.length})
            </button>
          </div>

          {/* Verified Users Table */}
          {activeTab === 'verified' && (
            <div className="space-y-4">
              {filteredVerified.length > 0 ? (
                filteredVerified.map(u => (
                  <Card key={u.id} className="p-4 bg-white hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`p-3 rounded-lg ${getRoleBadgeColor(u.role)}`}>
                          {getRoleIcon(u.role)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-800">{u.name}</h3>
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{u.email}</p>
                          <p className="text-sm text-gray-600">{u.phone}</p>
                          {u.role === 'business' && (
                            <>
                              <p className="text-sm font-medium text-gray-700 mt-2">
                                {u.businessName}
                              </p>
                              <p className="text-xs text-gray-600">{u.businessAddress}</p>
                            </>
                          )}
                          {u.role === 'rider' && (
                            <>
                              <p className="text-sm text-gray-600 mt-2">
                                Plate: <span className="font-medium">{u.todaPlate}</span>
                              </p>
                              <p className="text-sm text-gray-600">
                                License: <span className="font-medium">{u.licenseNumber}</span>
                              </p>
                            </>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            Joined: {new Date(u.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-8 bg-white text-center">
                  <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600">No verified users found</p>
                </Card>
              )}
            </div>
          )}

          {/* Pending Users Table */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {filteredPending.length > 0 ? (
                filteredPending.map(u => (
                  <Card key={u.id} className="p-4 bg-white hover:shadow-lg transition-shadow border-l-4 border-yellow-500">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`p-3 rounded-lg ${getRoleBadgeColor(u.role)}`}>
                          {getRoleIcon(u.role)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-800">{u.name}</h3>
                            <Badge className="bg-yellow-100 text-yellow-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{u.email}</p>
                          <p className="text-sm text-gray-600">{u.phone}</p>
                          {u.role === 'business' && (
                            <>
                              <p className="text-sm font-medium text-gray-700 mt-2">
                                {u.businessName}
                              </p>
                              <p className="text-xs text-gray-600">{u.businessAddress}</p>
                            </>
                          )}
                          {u.role === 'rider' && (
                            <>
                              <p className="text-sm text-gray-600 mt-2">
                                Plate: <span className="font-medium">{u.todaPlate}</span>
                              </p>
                              <p className="text-sm text-gray-600">
                                License: <span className="font-medium">{u.licenseNumber}</span>
                              </p>
                            </>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            Applied: {new Date(u.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={canVerifyUser(u.role) ? () => handleVerifyUser(u.id) : undefined}
                          disabled={!canVerifyUser(u.role)}
                          title={!canVerifyUser(u.role) ? getVerificationBlockedReason(u.role) : 'Approve this user'}
                          className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                            canVerifyUser(u.role)
                              ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                              : 'bg-[#D1D5DB] text-[#6B7280] cursor-not-allowed opacity-50'
                          }`}
                        >
                          Approve
                        </button>
                        <button
                          onClick={canVerifyUser(u.role) ? () => handleRejectUser(u.id) : undefined}
                          disabled={!canVerifyUser(u.role)}
                          title={!canVerifyUser(u.role) ? getVerificationBlockedReason(u.role) : 'Reject this user'}
                          className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                            canVerifyUser(u.role)
                              ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
                              : 'bg-[#D1D5DB] text-[#6B7280] cursor-not-allowed opacity-50'
                          }`}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-8 bg-white text-center">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600">No pending users</p>
                </Card>
              )}
            </div>
          )}
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
    </div>
  );
}
