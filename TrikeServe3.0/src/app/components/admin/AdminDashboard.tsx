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

  const [rateConfig, setRateConfig] = useState({
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

  const loadRates = () => {
    const savedRates = localStorage.getItem('trikeserve_rates');
    if (savedRates) {
      try {
        setRateConfig(JSON.parse(savedRates));
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

  const handleApproveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.error('Error approving user:', error);
        return;
      }

      loadUsers();
    } catch (error) {
      console.error('Error in handleApproveUser:', error);
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) {
        console.error('Error rejecting user:', error);
        return;
      }

      loadUsers();
    } catch (error) {
      console.error('Error in handleRejectUser:', error);
    }
  };

  const handleUpdateRate = (rateType: 'sharedRide' | 'privateRide' | 'deliveryBaseFee') => {
    // Save to localStorage for persistence
    localStorage.setItem('trikeserve_rates', JSON.stringify(rateConfig));
    alert(`${rateType} rate updated successfully!`);
  };

  const stats = {
    totalCustomers: activeUsers.filter(u => u.type === 'customer').length,
    totalRiders: activeUsers.filter(u => u.type === 'rider').length,
    totalBusinesses: activeUsers.filter(u => u.type === 'business').length,
    pendingCount: pendingVerifications.length,
    totalUsers: activeUsers.length,
  };

  // Check if user is Driver Admin (only they can see rate configuration)
  const isDriverAdmin = user?.adminType === 'rider';

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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">
                  Welcome, {user?.name || 'Admin'}!
                </h1>
                <p className="text-xs lg:text-sm text-[#64748B]">
                  {user?.adminType === 'business_customer' ? 'Business & Customer Management' :
                   user?.adminType === 'rider' ? 'Rider Management' :
                   'TrikeServe Control Panel - System Overview'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-4">
              <button
                onClick={() => setShowNotifications(true)}
                className="relative p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <Bell className="w-5 h-5 lg:w-6 lg:h-6 text-[#64748B]" />
                {notifications.filter((n: any) => !n.read).length > 0 && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-[#E11D48] rounded-full" />
                )}
              </button>
              <div className="hidden lg:flex items-center gap-3 px-3 py-2 hover:bg-[#F8F9FA] rounded-xl transition-all cursor-pointer"
                onClick={() => {
                  logout();
                  navigate('/');
                }}>
                <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#121212] rounded-full flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-[#121212] text-sm">{user?.name || 'Admin'}</p>
                  <p className="text-xs text-[#64748B]">Administrator</p>
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
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Customers</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalCustomers}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#D1FAE5] rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 lg:w-6 lg:h-6 text-[#10B981]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[40, 60, 35, 80, 45, 90, 70, 55, 85, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Riders */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Riders</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalRiders}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#DBEAFE] rounded-xl flex items-center justify-center">
                  <Bike className="w-5 h-5 lg:w-6 lg:h-6 text-[#3B82F6]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[45, 55, 70, 50, 85, 60, 75, 90, 65, 80, 70, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#3B82F6]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Businesses */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Businesses</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalBusinesses}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#F3E8FF] rounded-xl flex items-center justify-center">
                  <Store className="w-5 h-5 lg:w-6 lg:h-6 text-[#9333EA]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[60, 70, 55, 85, 65, 75, 90, 70, 80, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#9333EA]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Pending Verifications */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Pending</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#E11D48]">{stats.pendingCount}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6 text-[#F59E0B]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[50, 65, 75, 60, 85, 70, 90, 75, 85, 70, 80, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#F59E0B]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Users */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Total Users</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalUsers}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FFF1F2] rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 lg:w-6 lg:h-6 text-[#E11D48]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[55, 60, 70, 65, 80, 75, 85, 80, 90, 75, 85, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#E11D48]' : 'bg-[#E2E8F0]'}`}
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
                <h2 className="text-xl lg:text-2xl font-bold text-[#121212]">Pending Verifications</h2>
              </div>
              {pendingVerifications.length === 0 ? (
                <Card className="p-12 border-2 border-dashed border-[#E2E8F0] text-center">
                  <CheckCircle className="w-16 h-16 text-[#10B981] mx-auto mb-4" />
                  <p className="text-[#64748B] text-sm mb-2">All verifications completed!</p>
                  <p className="text-[#94A3B8] text-xs">No pending users awaiting verification</p>
                </Card>
              ) : (
                <Card className="border-2 border-[#E2E8F0] bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-[#F8F9FA] border-b-2 border-[#E2E8F0]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">User</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-[#64748B] uppercase tracking-wider">Submitted</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-[#64748B] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {pendingVerifications.map((user) => (
                          <tr key={user.id} className="hover:bg-[#F8F9FA] transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 ${user.type === 'rider' ? 'bg-[#DBEAFE]' : 'bg-[#F3E8FF]'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                  {user.type === 'rider' ? (
                                    <Bike className="w-5 h-5 text-[#3B82F6]" />
                                  ) : (
                                    <Store className="w-5 h-5 text-[#9333EA]" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-[#121212]">{user.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <Badge className={user.type === 'rider' ? 'bg-[#3B82F6]' : 'bg-[#9333EA]'}>
                                {user.type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[#64748B]">{user.email}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[#64748B]">{user.phone}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-[#64748B]">{user.submittedDate}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleApproveUser(user.id)}
                                  className="p-2 bg-[#10B981] hover:bg-[#059669] rounded-lg transition-all"
                                  title="Approve"
                                >
                                  <CheckCircle className="w-5 h-5 text-white" />
                                </button>
                                <button
                                  onClick={() => handleRejectUser(user.id)}
                                  className="p-2 bg-[#EF4444] hover:bg-[#DC2626] rounded-lg transition-all"
                                  title="Reject"
                                >
                                  <XCircle className="w-5 h-5 text-white" />
                                </button>
                              </div>
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

          {/* Rate Configuration - Only for Driver Admin */}
          {isDriverAdmin && (
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[#121212] mb-4">Fixed Rate Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Users className="w-8 h-8 lg:w-10 lg:h-10 text-[#3B82F6] mb-2" />
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
                  <button
                    onClick={() => handleUpdateRate('sharedRide')}
                    className="w-full py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-xl uppercase transition-all"
                  >
                    Update Rate
                  </button>
                </Card>

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
                  <button
                    onClick={() => handleUpdateRate('privateRide')}
                    className="w-full py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-xl uppercase transition-all"
                  >
                    Update Rate
                  </button>
                </Card>

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
                  <button
                    onClick={() => handleUpdateRate('deliveryBaseFee')}
                    className="w-full py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold rounded-xl uppercase transition-all"
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
            <div className="p-5 border-b-2 border-[#E2E8F0] sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[#121212]">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>
              <p className="text-sm text-[#64748B] mt-1">
                {notifications.filter(n => !n.read).length} unread notifications
              </p>
            </div>
            <div className="p-5 space-y-3">
              {notifications.length === 0 && (
                <Card className="p-12 text-center border-2 border-dashed border-[#E2E8F0]">
                  <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-[#64748B] text-sm">No notifications yet</p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}