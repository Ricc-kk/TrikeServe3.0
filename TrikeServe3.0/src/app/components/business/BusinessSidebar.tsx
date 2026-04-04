import { useState, useEffect } from "react";
import { 
  Store, Package, ShoppingBag, MessageSquare, TrendingUp, 
  Settings, BarChart3, Users, X, Menu
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { Card } from "../ui/card";

interface BusinessSidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export default function BusinessSidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: BusinessSidebarProps) {
  const location = useLocation();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // Load pending orders count
  useEffect(() => {
    loadPendingOrdersCount();
    
    // Auto-refresh every 3 seconds
    const interval = setInterval(loadPendingOrdersCount, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadPendingOrdersCount = () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) return;

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;

    const businessOrdersKey = `business_orders_${userEmail}`;
    const savedOrders = localStorage.getItem(businessOrdersKey);
    
    if (savedOrders) {
      const orders = JSON.parse(savedOrders);
      const pendingCount = orders.filter((o: any) => o.status === 'pending').length;
      setPendingOrdersCount(pendingCount);
    } else {
      setPendingOrdersCount(0);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const menuItems = [
    { path: "/business/dashboard", icon: BarChart3, label: "Overview" },
    { path: "/business/menu", icon: Package, label: "Products" },
    { path: "/business/orders", icon: ShoppingBag, label: "Orders" },
    { path: "/business/home", icon: Store, label: "Shop" },
    { path: "/business/account", icon: Settings, label: "Settings" }
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
                <div className="w-10 h-10 bg-[#E11D48] rounded-xl flex items-center justify-center">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-[#121212]">TRIKESERVE</span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
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
                  {item.path === "/business/orders" && pendingOrdersCount > 0 && (
                    <div className="ml-auto w-6 h-6 bg-[#E11D48] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{pendingOrdersCount}</span>
                    </div>
                  )}
                </button>
              </Link>
            ))}
          </nav>

          {/* Support Widget */}
          <div className="p-6">
            <Card className="p-4 border-2 border-[#E2E8F0] bg-gradient-to-br from-[#FFF1F2] to-white">
              <div className="text-center mb-3">
                <div className="w-16 h-16 bg-[#E11D48] rounded-full flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-bold text-[#121212] mb-1">Need Help?</h3>
                <p className="text-xs text-[#64748B]">Contact our support team</p>
              </div>
              <button className="w-full py-2.5 bg-[#E11D48] text-white font-bold rounded-lg text-sm uppercase hover:bg-[#BE123C] transition-all">
                Get Support
              </button>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}