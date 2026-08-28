import { useState, useEffect } from "react";
import {
  Shield, X, Users, Settings, MapPin
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";

interface AdminSidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export default function AdminSidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: AdminSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [pendingVerificationsCount, setPendingVerificationsCount] = useState(0);

  // Load pending verifications count
  useEffect(() => {
    loadPendingVerificationsCount();

    // Auto-refresh every 3 seconds
    const interval = setInterval(loadPendingVerificationsCount, 3000);
    return () => clearInterval(interval);
  }, [user]);

  const loadPendingVerificationsCount = () => {
    const usersJson = localStorage.getItem('trikeserve_users');
    if (usersJson) {
      const users = JSON.parse(usersJson);

      // Get current admin's type
      const adminType = user?.adminType;

      // Filter pending users based on admin type
      let pendingUsers = users.filter(
        (u: any) => !u.isVerified && (u.role === 'rider' || u.role === 'business')
      );

      if (adminType === 'business_customer') {
        pendingUsers = pendingUsers.filter((u: any) => u.role === 'business');
      } else if (adminType === 'rider') {
        pendingUsers = pendingUsers.filter((u: any) => u.role === 'rider');
      }

      setPendingVerificationsCount(pendingUsers.length);
    } else {
      setPendingVerificationsCount(0);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const allMenuItems = [
    { path: "/admin/dashboard", icon: Shield, label: "Overview" },
    { path: "/admin/users", icon: Users, label: "Users" },
    { path: "/admin/terminals", icon: MapPin, label: "Terminals" },
    { path: "/admin/settings", icon: Settings, label: "Settings" }
  ];

  const menuItems = user?.adminType === 'business_customer'
    ? allMenuItems.filter(item => item.path !== '/admin/terminals')
    : allMenuItems;

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed top-0 left-0 h-screen w-64 bg-white border-r-2 border-[#E2E8F0] z-[1001]
        transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b-2 border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#121212] rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="text-xl font-bold text-[#121212]">ADMIN</span>
                  <p className="text-xs text-[#64748B]">
                    {user?.adminType === 'business_customer' ? 'Business & Customer' :
                     user?.adminType === 'rider' ? 'Driver Management' :
                     'Control Panel'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <button
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative ${
                    isActive(item.path)
                      ? "bg-[#FFF1F2] text-[#E11D48]"
                      : "text-[#64748B] hover:bg-[#F8F9FA]"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-semibold">{item.label}</span>
                  {pendingVerificationsCount > 0 && item.path === "/admin/dashboard" && (
                    <div className="ml-auto w-6 h-6 bg-[#E11D48] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{pendingVerificationsCount}</span>
                    </div>
                  )}
                </button>
              </Link>
            ))}
          </nav>


        </div>
      </div>
    </>
  );
}
