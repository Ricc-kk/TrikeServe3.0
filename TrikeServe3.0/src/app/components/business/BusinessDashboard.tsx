import { useState, useEffect } from "react";
import { 
  Store, Package, TrendingUp, DollarSign, ChevronRight, 
  Users, MessageSquare, BarChart3, Settings, ShoppingBag,
  Clock, Eye, Edit2, Bell, User as UserIcon, Search, Menu, X, Star
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { supabaseHelpers } from "@/lib/supabase";

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalItems: 0,
    earnings: 0,
    rating: 0,
    ratingCount: 0
  });
  const [popularMenu, setPopularMenu] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [incomeBreakdown, setIncomeBreakdown] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const messages: any[] = [];

  // Load delivery status notifications (driver updates) for this business.
  useEffect(() => {
    if (!user?.id) return;
    const loadNotifications = async () => {
      const { data } = await supabaseHelpers.getDeliveryNotifications(user.id);
      setNotifications((data || []).map((n: any) => ({
        id: n.id,
        type: 'delivery',
        title: n.title || 'Delivery update',
        message: n.message || '',
        read: !!n.read,
        time: formatNotificationTime(n.created_at),
      })));
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 4000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Mark delivery notifications as read when the panel is opened.
  useEffect(() => {
    if (showNotifications && user?.id) {
      supabaseHelpers.markDeliveryNotificationsRead(user.id);
      setNotifications(prev => prev.map((n: any) => ({ ...n, read: true })));
    }
  }, [showNotifications, user?.id]);

  const formatNotificationTime = (timestamp: string) => {
    if (!timestamp) return '';
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Load dashboard data
  useEffect(() => {
    loadDashboardData();
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const currentUserData = localStorage.getItem('trikeserve_current_user');
      if (!currentUserData) {
        setIsLoading(false);
        return;
      }

      const currentUser = JSON.parse(currentUserData);
      let businessRestaurantId = currentUser.restaurantId;

      // If no restaurantId, fetch from Supabase
      if (!businessRestaurantId && currentUser.id) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('id')
          .eq('business_user_id', currentUser.id)
          .single();

        if (restaurant) {
          businessRestaurantId = restaurant.id;
          setRestaurantId(businessRestaurantId);
        }
      } else if (businessRestaurantId) {
        setRestaurantId(businessRestaurantId);
      }

      if (!businessRestaurantId) {
        setIsLoading(false);
        return;
      }

      // Load orders
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_email', businessRestaurantId)
        .order('created_at', { ascending: false });

      if (orders && orders.length > 0) {
        // Calculate stats
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);

        // Today's earnings - orders from today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysOrders = orders.filter((order: any) => {
          const orderDate = new Date(order.created_at);
          orderDate.setHours(0, 0, 0, 0);
          return orderDate.getTime() === today.getTime();
        });
        const earnings = todaysOrders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);

        // Load the business's average rating from business_ratings.
        let rating = 0;
        let ratingCount = 0;
        if (currentUser.id) {
          const ratingRes = await supabaseHelpers.getBusinessRating(currentUser.id);
          if (ratingRes && ratingRes.average != null) {
            rating = Number(ratingRes.average.toFixed(1));
            ratingCount = ratingRes.count;
          }
        }

        setStats({
          totalOrders,
          totalRevenue,
          totalItems: 0, // Will be loaded separately
          earnings,
          rating,
          ratingCount
        });

        // Calculate daily sales for last 7 days
        const dailySalesData = calculateDailySales(orders);
        setDailySales(dailySalesData);

        // Calculate income breakdown (cash vs gcash)
        const incomeBreakdownData = calculateIncomeBreakdown(orders);
        setIncomeBreakdown(incomeBreakdownData);
      }

      // Load menu items
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', businessRestaurantId)
        .order('created_at', { ascending: false })
        .limit(6);

      if (menuItems) {
        setStats(prev => ({
          ...prev,
          totalItems: menuItems.length
        }));

        // Show top 6 items (most ordered or most recent)
        setPopularMenu(menuItems.slice(0, 6).map((item: any) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          image: item.image || 'https://via.placeholder.com/200x150?text=Menu+Item'
        })));
      }

      setIsLoading(false);
    } catch (error) {
      console.error('[BusinessDashboard] Error loading data:', error);
      setIsLoading(false);
    }
  };

  const calculateDailySales = (orders: any[]) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const salesData = [];

    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const daySales = orders.filter((order: any) => {
        const orderDate = new Date(order.created_at);
        return orderDate >= date && orderDate < nextDate;
      });

      const amount = daySales.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
      salesData.push({
        day: days[date.getDay()],
        amount: Math.max(amount, 100) // Minimum 100 for chart visibility
      });
    }

    return salesData;
  };

  const calculateIncomeBreakdown = (orders: any[]) => {
    let cashTotal = 0;
    let gcashTotal = 0;

    orders.forEach((order: any) => {
      const amount = order.total || 0;
      if (order.payment_method === 'gcash') {
        gcashTotal += amount;
      } else {
        cashTotal += amount;
      }
    });

    const total = cashTotal + gcashTotal;
    if (total === 0) return [];

    return [
      {
        label: 'Cash on Delivery',
        percentage: Math.round((cashTotal / total) * 100),
        color: '#F59E0B'
      },
      {
        label: 'GCash (Prepaid)',
        percentage: Math.round((gcashTotal / total) * 100),
        color: '#10B981'
      }
    ];
  };

  // Check if user is not verified
  if (!user?.isVerified) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center border-2 border-[#E2E8F0]">
          <div className="w-20 h-20 bg-[#FEF3C7] rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-[#F59E0B]" />
          </div>
          <h2 className="text-2xl font-bold text-[#121212] mb-3">Pending Verification</h2>
          <p className="text-[#64748B] mb-6">
            Please visit the TrikeServe Admin Office at Barangay Hall to complete your face-to-face verification.
          </p>
          <div className="bg-[#F8F9FA] rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-[#121212] mb-2">Required Documents:</p>
            <ul className="text-sm text-[#64748B] space-y-1 text-left">
              <li>• Business Permit</li>
              <li>• Sanitary Permit</li>
              <li>• Valid ID</li>
              <li>• Proof of Address</li>
            </ul>
          </div>
          <Link to="/">
            <button className="w-full py-3 bg-[#E11D48] text-white font-bold rounded-xl uppercase">
              Back to Login
            </button>
          </Link>
        </Card>
      </div>
    );
  }

  // Calculate max sales for chart scaling
  const maxSales = dailySales.length > 0
    ? Math.max(...dailySales.map(d => d.amount))
    : 1;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
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
                <h1 className="text-2xl lg:text-3xl font-extrabold text-[#121212]">Welcome, {user?.name?.split(' ')[0] || 'Business Owner'}!</h1>
                <p className="text-xs lg:text-sm text-[#64748B]">Here's what's happening with your store today</p>
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
              <button 
                onClick={() => setShowMessages(true)}
                className="relative p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <MessageSquare className="w-5 h-5 lg:w-6 lg:h-6 text-[#64748B]" />
                {messages.filter((m: any) => m.unread).length > 0 && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-[#E11D48] rounded-full" />
                )}
              </button>
              <Link to="/business/account" className="hidden lg:flex">
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-[#F8F9FA] rounded-xl transition-all cursor-pointer">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-[#121212] text-sm">{user?.name || 'Business Owner'}</p>
                    <p className="text-xs text-[#64748B]">Business Owner</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 lg:p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-6 lg:mb-8">
            {/* Total Orders */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Total Orders</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalOrders}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FFF1F2] rounded-xl flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 lg:w-6 lg:h-6 text-[#E11D48]" />
                </div>
              </div>
              {/* Mini Chart */}
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[40, 60, 35, 80, 45, 90, 70, 55, 85, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#E11D48]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Revenue */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Total Revenue</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">₱{(stats.totalRevenue >= 1000 ? (stats.totalRevenue / 1000).toFixed(1) : stats.totalRevenue.toFixed(0))}{stats.totalRevenue >= 1000 ? 'k' : ''}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 lg:w-6 lg:h-6 text-[#F59E0B]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[45, 55, 70, 50, 85, 60, 75, 90, 65, 80, 70, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#F59E0B]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Total Items */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Total Items</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.totalItems}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#D1FAE5] rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 lg:w-6 lg:h-6 text-[#10B981]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[60, 70, 55, 85, 65, 75, 90, 70, 80, 65, 75, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Earnings */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Today's Earnings</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">₱{(stats.earnings >= 1000 ? (stats.earnings / 1000).toFixed(1) : stats.earnings.toFixed(0))}{stats.earnings >= 1000 ? 'k' : ''}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#DBEAFE] rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 text-[#3B82F6]" />
                </div>
              </div>
              <div className="flex items-end gap-0.5 lg:gap-1 h-8 lg:h-12">
                {[50, 65, 75, 60, 85, 70, 90, 75, 85, 70, 80, 95].map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${i === 11 ? 'bg-[#3B82F6]' : 'bg-[#E2E8F0]'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </Card>

            {/* Rating */}
            <Card className="p-4 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div>
                  <p className="text-xs lg:text-sm text-[#64748B] mb-1">Rating</p>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl lg:text-4xl font-bold text-[#121212]">{stats.rating > 0 ? stats.rating.toFixed(1) : '—'}</h2>
                    <Star className="w-5 h-5 lg:w-6 lg:h-6 text-yellow-500 fill-yellow-500" />
                  </div>
                  <p className="text-xs text-[#64748B] mt-1">{stats.ratingCount > 0 ? `${stats.ratingCount} rating${stats.ratingCount !== 1 ? 's' : ''}` : 'No ratings yet'}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[#FEF3C7] rounded-xl flex items-center justify-center">
                  <Star className="w-5 h-5 lg:w-6 lg:h-6 text-[#F59E0B]" />
                </div>
              </div>
              {/* Star bar */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-3 h-3 lg:w-4 lg:h-4 ${
                      stats.rating > 0 && star <= Math.round(stats.rating)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-[#E2E8F0] fill-[#E2E8F0]'
                    }`}
                  />
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-6 lg:mb-8">
            {/* Popular Menu */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl lg:text-2xl font-bold text-[#121212]">Popular Menu</h2>
                <Link to="/business/menu">
                  <button className="text-[#E11D48] font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                    View All
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
              {popularMenu.length === 0 ? (
                <Card className="p-12 border-2 border-dashed border-[#E2E8F0] text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-[#64748B] text-sm mb-2">No menu items yet</p>
                  <p className="text-[#94A3B8] text-xs mb-4">Add items to your menu to start selling</p>
                  <Link to="/business/menu">
                    <button className="px-6 py-2 bg-[#E11D48] text-white font-bold rounded-xl uppercase text-sm">
                      ADD MENU ITEMS
                    </button>
                  </Link>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
                  {popularMenu.map((item) => (
                    <Card key={item.id} className="p-3 lg:p-4 border-2 border-[#E2E8F0] bg-white group hover:border-[#E11D48] transition-all">
                      <div className="relative h-28 lg:h-32 rounded-xl overflow-hidden mb-3">
                        <ImageWithFallback
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-[#121212] mb-1 text-sm lg:text-base">{item.name}</h3>
                          <p className="text-base lg:text-lg font-bold text-[#E11D48]">₱{item.price}</p>
                        </div>
                        <button className="w-8 h-8 lg:w-10 lg:h-10 bg-[#E11D48] rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Sales Chart */}
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[#121212] mb-4">Daily Sales</h2>
              <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
                {dailySales.length === 0 ? (
                  <div className="text-center py-12">
                    <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-[#64748B] text-sm">No sales data yet</p>
                    <p className="text-[#94A3B8] text-xs mt-1">Start receiving orders to see your sales chart</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <p className="text-sm text-[#64748B] mb-1">This Week</p>
                      <h3 className="text-2xl lg:text-3xl font-bold text-[#121212]">
                        ₱{((dailySales.reduce((sum, d) => sum + d.amount, 0) - dailySales.length * 100) >= 1000
                          ? ((dailySales.reduce((sum, d) => sum + d.amount, 0) - dailySales.length * 100) / 1000).toFixed(1)
                          : (dailySales.reduce((sum, d) => sum + d.amount, 0) - dailySales.length * 100).toFixed(0))}
                        {(dailySales.reduce((sum, d) => sum + d.amount, 0) - dailySales.length * 100) >= 1000 ? 'k' : ''}
                      </h3>
                    </div>
                    
                    {/* Area Chart */}
                    <div className="relative h-40 lg:h-48">
                      <svg className="w-full h-full" viewBox="0 0 280 180" preserveAspectRatio="none">
                        {/* Grid lines */}
                        {[0, 1, 2, 3, 4].map((i) => (
                          <line
                            key={i}
                            x1="0"
                            y1={i * 45}
                            x2="280"
                            y2={i * 45}
                            stroke="#E2E8F0"
                            strokeWidth="1"
                          />
                        ))}
                        
                        {/* Area fill */}
                        <path
                          d={`M 0 ${180 - (dailySales[0].amount / maxSales) * 160} ${dailySales.map((d, i) => 
                            `L ${(i * 40) + 20} ${180 - (d.amount / maxSales) * 160}`
                          ).join(' ')} L 260 180 L 0 180 Z`}
                          fill="url(#gradient)"
                          opacity="0.3"
                        />
                        
                        {/* Line */}
                        <path
                          d={`M 0 ${180 - (dailySales[0].amount / maxSales) * 160} ${dailySales.map((d, i) => 
                            `L ${(i * 40) + 20} ${180 - (d.amount / maxSales) * 160}`
                          ).join(' ')}`}
                          fill="none"
                          stroke="#E11D48"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        
                        {/* Gradient definition */}
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#E11D48" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#E11D48" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Points */}
                        {dailySales.map((d, i) => (
                          <circle
                            key={i}
                            cx={(i * 40) + 20}
                            cy={180 - (d.amount / maxSales) * 160}
                            r="4"
                            fill="#E11D48"
                          />
                        ))}
                      </svg>
                      
                      {/* Labels */}
                      <div className="flex justify-between mt-2">
                        {dailySales.map((d) => (
                          <span key={d.day} className="text-xs text-[#64748B] font-semibold">
                            {d.day}
                          </span>
                        ))}
                      </div>
                      
                      {/* Highlight badge */}
                      <div className="absolute top-4 right-4">
                        <Badge className="bg-[#E11D48] text-white">+20%</Badge>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </div>
          </div>

          {/* Total Income */}
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-[#121212] mb-4">Total Income</h2>
            <Card className="p-5 lg:p-6 border-2 border-[#E2E8F0] bg-white">
              {incomeBreakdown.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-[#64748B] text-sm">No income data yet</p>
                  <p className="text-[#94A3B8] text-xs mt-1">Income breakdown will appear when you receive orders</p>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
                  {/* Donut Chart */}
                  <div className="relative w-40 h-40 lg:w-48 lg:h-48">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="35"
                        fill="none"
                        stroke="#F8F9FA"
                        strokeWidth="15"
                      />
                      
                      {/* Segments */}
                      {incomeBreakdown.reduce((acc, item, index) => {
                        const previousTotal = incomeBreakdown.slice(0, index).reduce((sum, i) => sum + i.percentage, 0);
                        const circumference = 2 * Math.PI * 35;
                        const offset = (previousTotal / 100) * circumference;
                        const dashArray = `${(item.percentage / 100) * circumference} ${circumference}`;
                        
                        acc.push(
                          <circle
                            key={index}
                            cx="50"
                            cy="50"
                            r="35"
                            fill="none"
                            stroke={item.color}
                            strokeWidth="15"
                            strokeDasharray={dashArray}
                            strokeDashoffset={-offset}
                            strokeLinecap="round"
                          />
                        );
                        
                        return acc;
                      }, [] as JSX.Element[])}
                    </svg>
                    
                    {/* Center text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-sm text-[#64748B]">Total</p>
                      <p className="text-2xl font-bold text-[#121212]">100%</p>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex-1 w-full space-y-4">
                    {incomeBreakdown.map((item, index) => (
                      <div key={index}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-semibold text-[#121212] text-sm lg:text-base">{item.label}</span>
                          </div>
                          <span className="text-xl lg:text-2xl font-bold text-[#121212]">{item.percentage}%</span>
                        </div>
                        <div className="w-full bg-[#F8F9FA] rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
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
              {notifications.map((notification) => (
                <Card 
                  key={notification.id}
                  className={`p-4 border-2 transition-all cursor-pointer hover:border-[#E11D48] ${
                    notification.read ? 'border-[#E2E8F0] bg-white' : 'border-[#FFF1F2] bg-[#FFF1F2]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      notification.type === 'order' ? 'bg-[#FFF1F2]' :
                      notification.type === 'system' ? 'bg-[#DBEAFE]' :
                      'bg-[#FEF3C7]'
                    }`}>
                      {notification.type === 'order' && <ShoppingBag className="w-5 h-5 text-[#E11D48]" />}
                      {notification.type === 'system' && <Settings className="w-5 h-5 text-[#3B82F6]" />}
                      {notification.type === 'review' && <Users className="w-5 h-5 text-[#F59E0B]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[#121212]">{notification.title}</h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-[#E11D48] rounded-full mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-[#64748B] mb-2">{notification.message}</p>
                      <p className="text-xs text-[#94A3B8]">{notification.time}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Messages Panel */}
      {showMessages && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[2000]"
            onClick={() => setShowMessages(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full lg:w-[400px] bg-white z-[2001] shadow-2xl overflow-y-auto">
            <div className="p-5 border-b-2 border-[#E2E8F0] sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[#121212]">Messages</h2>
                <button 
                  onClick={() => setShowMessages(false)}
                  className="p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-[#64748B]" />
                </button>
              </div>
              <p className="text-sm text-[#64748B] mt-1">
                {messages.filter(m => m.unread).length} unread messages
              </p>
            </div>
            <div className="p-5 space-y-3">
              {messages.map((message) => (
                <Card 
                  key={message.id}
                  className={`p-4 border-2 transition-all cursor-pointer hover:border-[#E11D48] ${
                    message.unread ? 'border-[#FFF1F2] bg-[#FFF1F2]' : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[#121212]">{message.customerName}</h3>
                        {message.unread && (
                          <div className="w-2 h-2 bg-[#E11D48] rounded-full mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-[#64748B] mb-2">{message.message}</p>
                      <p className="text-xs text-[#94A3B8]">{message.time}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}