import { useState, useEffect } from "react";
import { 
  Store, Package, ShoppingBag, MessageSquare, TrendingUp, 
  Settings, BarChart3, Users, X, Menu
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import TrikeServeLogo from "../../../assets/TRIKESERVE_logo.png";

interface BusinessSidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export default function BusinessSidebar({ isMobileMenuOpen, setIsMobileMenuOpen }: BusinessSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // Load pending orders count from Supabase
  useEffect(() => {
    loadPendingOrdersCount();

    // Auto-refresh every 3 seconds
    const interval = setInterval(loadPendingOrdersCount, 3000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadPendingOrdersCount = async () => {
    try {
      /*
       * Scoped to the signed-in user from the auth context rather than the cached
       * copy in localStorage, which every tab shares. The badge was counting
       * whoever signed in last anywhere, under this shop's own name.
       */
      const currentUser = user;
      if (!currentUser?.id) {
        setPendingOrdersCount(0);
        return;
      }

      // SECURITY: Fetch orders from Supabase using RLS
      // The RLS policy ensures this business user can only see orders for their restaurant
      const { data: supabaseOrders, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('business_id', currentUser.id)
        .in('status', ['pending', 'preparing', 'ready', 'on-the-way']);

      if (fetchError) {
        console.error('[BusinessSidebar] Error fetching orders from Supabase:', fetchError);
        setPendingOrdersCount(0);
        return;
      }

      if (supabaseOrders) {
        setPendingOrdersCount(supabaseOrders.length);
      } else {
        setPendingOrdersCount(0);
      }
    } catch (error) {
      console.error('[BusinessSidebar] Error in loadPendingOrdersCount:', error);
      setPendingOrdersCount(0);
    }
  };

  /**
   * `/business` and `/business/dashboard` are the same screen reached two ways
   * (login lands on the first), so Overview has to light up for both or it looks
   * like the sidebar lost its place right after signing in.
   */
  const isActive = (path: string) => {
    if (location.pathname === path) return true;
    return path === "/business/dashboard" && location.pathname === "/business";
  };

  const menuItems = [
    { path: "/business/dashboard", icon: BarChart3, label: "Overview" },
    { path: "/business/menu", icon: Package, label: "Products" },
    { path: "/business/orders", icon: ShoppingBag, label: "Orders" },
    { path: "/business/messages", icon: MessageSquare, label: "Messages" },
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
        fixed top-0 left-0 h-screen w-64 bg-[var(--sidebar)] border-r-2 border-[var(--border)] z-[1001]
        transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b-2 border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* The brand mark, not a generic shop glyph: this panel is
                    TrikeServe's navigation, so it should say who it is. */}
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-[var(--primary)]">
                  <img
                    src={TrikeServeLogo}
                    alt="TrikeServe"
                    className="size-full object-contain p-0.5"
                  />
                </div>
                <span className="text-xl font-bold text-[var(--ink)]">TRIKESERVE</span>
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
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-semibold">{item.label}</span>
                  {item.path === "/business/orders" && pendingOrdersCount > 0 && (
                    <div className="ml-auto w-6 h-6 bg-[var(--primary)] rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{pendingOrdersCount}</span>
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