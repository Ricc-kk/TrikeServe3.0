import { useState, useEffect } from "react";
import {
  Shield, Users, Settings, MapPin, ClipboardCheck, ClipboardList, Flag
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { getApprovalRequests } from "../../../lib/supabase";

interface AdminSidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export default function AdminSidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: AdminSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [pendingVerificationsCount, setPendingVerificationsCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const isSuperAdmin = user?.adminType === 'business_customer';

  // Poll badge counts. Super Admin tracks unverified accounts + approval queue;
  // Rider Admin tracks how many of their own requests are awaiting review.
  useEffect(() => {
    if (!user) return;
    loadBadgeCounts();
    const interval = setInterval(loadBadgeCounts, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const loadBadgeCounts = async () => {
    if (isSuperAdmin) {
      try {
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('is_verified', false)
          .in('role', ['rider', 'business']);
        setPendingVerificationsCount(count || 0);
      } catch {
        setPendingVerificationsCount(0);
      }

      const { data } = await getApprovalRequests({ status: 'pending' });
      setPendingApprovalsCount(data.length);
    } else {
      // Rider Admin: only their own requests
      const { data } = await getApprovalRequests({
        status: 'pending',
        requestedByEmail: user?.email || undefined,
      });
      setPendingApprovalsCount(data.length);
      setPendingVerificationsCount(0);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Super Admin: all admin actions, plus the approval queue.
  // Rider Admin: terminal management + read-only driver list only.
  const allMenuItems = isSuperAdmin
    ? [
        { path: "/admin/dashboard", icon: Shield, label: "Overview", badge: pendingVerificationsCount },
        { path: "/admin/users", icon: Users, label: "Users", badge: 0 },
        { path: "/admin/terminals", icon: MapPin, label: "Terminals", badge: 0 },
        { path: "/admin/approvals", icon: ClipboardCheck, label: "Approvals", badge: pendingApprovalsCount },
        { path: "/admin/reports", icon: Flag, label: "Reports", badge: 0 },
        { path: "/admin/audit", icon: ClipboardList, label: "Audit Trail", badge: 0 },
        { path: "/admin/settings", icon: Settings, label: "Settings", badge: 0 },
      ]
    : [
        { path: "/admin/dashboard", icon: Shield, label: "Overview", badge: 0 },
        { path: "/admin/terminals", icon: MapPin, label: "Terminals", badge: pendingApprovalsCount },
        { path: "/admin/users", icon: Users, label: "Drivers", badge: 0 },
        { path: "/admin/settings", icon: Settings, label: "Settings", badge: 0 },
      ];

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
        fixed top-0 left-0 h-screen w-64 bg-white border-r-2 border-[var(--border)] z-[1001]
        transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b-2 border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[var(--primary)] to-[var(--ink)] rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="text-xl font-bold text-[var(--ink)]">ADMIN</span>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {isSuperAdmin ? 'Super Admin' : user?.adminType === 'rider' ? 'Rider Admin' : 'Control Panel'}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {allMenuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <button
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative ${
                    isActive(item.path)
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-semibold">{item.label}</span>
                  {item.badge > 0 && (
                    <div className="ml-auto w-6 h-6 bg-[var(--primary)] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{item.badge}</span>
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
