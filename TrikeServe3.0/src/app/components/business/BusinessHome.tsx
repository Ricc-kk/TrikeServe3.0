import { useState, useEffect } from "react";
import { Store, Package, BarChart3, User, Plus, Edit2, Image, Clock, Star, MapPin, BadgeCheck, Eye, EyeOff, Upload, ChevronRight, Settings, Camera, Check, Menu } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";

export default function BusinessHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [showEditBanner, setShowEditBanner] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  // Restaurant data - initialize with user data
  const [restaurantData, setRestaurantData] = useState({
    name: "",
    subtitle: "",
    logo: "🍽️",
    heroImage: "",
    rating: 0,
    ratingCount: 0,
    deliveryTime: "25-35 min",
    deliveryFee: 35,
    verified: true,
    address: "",
    operatingHours: "8:00 AM - 10:00 PM"
  });

  // Load menu items from Supabase
  useEffect(() => {
    const loadMenuItems = async () => {
      if (!user?.id || user?.role !== 'business') return;

      try {
        // Get restaurant ID
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('id, is_open')
          .eq('business_user_id', user.id)
          .single();

        if (!restaurant) {
          // Fallback to localStorage
          if (user?.email) {
            const storageKey = `menuItems_${user.email}`;
            const savedItems = localStorage.getItem(storageKey);
            if (savedItems) {
              setMenuItems(JSON.parse(savedItems));
            }
          }
          return;
        }

        // Load the store status from database
        if (restaurant.is_open !== undefined) {
          setIsStoreOpen(restaurant.is_open);
        }

        // Load menu items from Supabase
        const { data: items } = await supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurant.id);

        if (items) {
          const mappedItems = items.map((item: any) => ({
            id: item.id,
            name: item.name,
            description: item.description || '',
            price: item.price,
            image: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            category: item.category,
            available: item.is_available,
          }));
          setMenuItems(mappedItems);
        } else if (user?.email) {
          // Fallback to localStorage if Supabase query fails
          const storageKey = `menuItems_${user.email}`;
          const savedItems = localStorage.getItem(storageKey);
          if (savedItems) {
            setMenuItems(JSON.parse(savedItems));
          }
        }
      } catch (error) {
        console.error('Error loading menu items:', error);
        // Fallback to localStorage
        if (user?.email) {
          const storageKey = `menuItems_${user.email}`;
          const savedItems = localStorage.getItem(storageKey);
          if (savedItems) {
            setMenuItems(JSON.parse(savedItems));
          }
        }
      }
    };

    loadMenuItems();

    // Reload menu items when page becomes visible (switching back from another tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page is now visible - reload menu items
        loadMenuItems();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, user?.email, user?.role]);

  // Real-time subscription to store status changes
  useEffect(() => {
    if (!user?.id) return;

    console.log('[BusinessHome] Setting up real-time store status subscription');

    // Subscribe to restaurant status changes
    const subscription = supabase
      .channel(`restaurant-status-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'restaurants',
          filter: `business_user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[BusinessHome] Store status changed:', payload);
          if (payload.new && payload.new.is_open !== undefined) {
            setIsStoreOpen(payload.new.is_open);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[BusinessHome] Cleaning up store status subscription');
      supabase.removeChannel(subscription);
    };
  }, [user?.id]);

  // Update restaurant data when user data is available
  useEffect(() => {
    if (user) {
      // Load saved restaurant data or initialize with user data
      const storageKey = `restaurantData_${user.email}`;
      const savedData = localStorage.getItem(storageKey);
      
      if (savedData) {
        try {
          setRestaurantData(JSON.parse(savedData));
        } catch (error) {
          console.error('Error loading restaurant data:', error);
        }
      } else {
        // Initialize with user data if no saved data exists
        setRestaurantData(prev => ({
          ...prev,
          name: (user as any).businessName || user.name || "",
          address: (user as any).businessAddress || "",
        }));
      }
    }
  }, [user]);

  // Save restaurant data to localStorage whenever it changes
  useEffect(() => {
    if (user?.email) {
      const storageKey = `restaurantData_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify(restaurantData));
    }
  }, [restaurantData, user?.email]);

  // Function to toggle store status and save to Supabase
  const toggleStoreStatus = async (newStatus: boolean) => {
    if (!user?.id) return;

    setIsStoreOpen(newStatus);

    try {
      // Get restaurant record
      let { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('business_user_id', user.id)
        .single();

      if (!restaurant) {
        // Create new restaurant record if it doesn't exist
        const { data: newRestaurant, error } = await supabase
          .from('restaurants')
          .insert([{
            name: restaurantData.name,
            business_user_id: user.id,
            address: restaurantData.address,
            phone: user.phone || '',
            rating: restaurantData.rating,
            is_open: newStatus,
            created_at: new Date().toISOString(),
          }])
          .select()
          .single();

        if (error) {
          console.error('Error creating restaurant:', error);
          setIsStoreOpen(!newStatus); // Revert on error
          return;
        }
      } else {
        // Update existing restaurant with new status
        const { error } = await supabase
          .from('restaurants')
          .update({
            is_open: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', restaurant.id);

        if (error) {
          console.error('Error updating store status:', error);
          setIsStoreOpen(!newStatus); // Revert on error
          return;
        }
      }

      console.log('[BusinessHome] Store status updated to:', newStatus);
    } catch (error) {
      console.error('Error toggling store status:', error);
      setIsStoreOpen(!newStatus); // Revert on error
    }
  };

  // Function to save store information to Supabase
  const saveStoreInformation = async () => {
    if (!user?.id) return;

    try {
      // Get or create restaurant record
      let { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('business_user_id', user.id)
        .single();

      if (!restaurant) {
        // Create new restaurant record
        const { data: newRestaurant, error } = await supabase
          .from('restaurants')
          .insert([{
            name: restaurantData.name,
            business_user_id: user.id,
            address: restaurantData.address,
            phone: user.phone || '',
            rating: restaurantData.rating,
            is_open: isStoreOpen,
            created_at: new Date().toISOString(),
          }])
          .select()
          .single();

        if (error) {
          console.error('Error creating restaurant:', error);
          return;
        }
        restaurant = newRestaurant;
      } else {
        // Update existing restaurant
        const { error } = await supabase
          .from('restaurants')
          .update({
            name: restaurantData.name,
            address: restaurantData.address,
            is_open: isStoreOpen,
            updated_at: new Date().toISOString(),
          })
          .eq('id', restaurant.id);

        if (error) {
          console.error('Error updating restaurant:', error);
          return;
        }
      }

      // Close the modal after successful save
      setShowEditInfo(false);
    } catch (error) {
      console.error('Error saving store information:', error);
    }
  };

  const todayStats = {
    orders: 0,
    revenue: 0,
    avgOrderValue: 0,
    pendingOrders: 0
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Header with Preview Toggle */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] sticky top-0 bg-white z-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[#F8F9FA] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[#121212]" />
              </button>
              <div>
                <h1 className="text-3xl font-extrabold text-[#121212]\">My Shop</h1>
                <p className="text-sm text-[#64748B]\">Manage your store</p>
              </div>
            </div>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                previewMode
                  ? "bg-[#E11D48] text-white"
                  : "bg-[#F8F9FA] text-[#64748B] border-2 border-[#E2E8F0]"
              }`}
            >
              <Eye className="w-4 h-4" />
              {previewMode ? "Exit Preview" : "Preview"}
            </button>
          </div>
        </div>

        {previewMode ? (
          // CUSTOMER PREVIEW MODE
          <div className="bg-[#F8F9FA] min-h-screen">
            {/* Preview Header Notice */}
            <div className="bg-[#FFF1F2] border-b-2 border-[#E11D48] px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#E11D48]" />
                  <div>
                    <p className="font-bold text-[#E11D48] text-sm">Customer Preview Mode</p>
                    <p className="text-xs text-[#BE123C]">This is how customers see your shop</p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewMode(false)}
                  className="px-3 py-1.5 bg-[#E11D48] text-white rounded-lg text-sm font-semibold"
                >
                  Exit
                </button>
              </div>
            </div>

            {/* Customer View */}
            <div className="px-5 py-4">
              {/* Hero Banner */}
              <div className="relative h-48 rounded-2xl overflow-hidden mb-4">
                <ImageWithFallback
                  src={restaurantData.heroImage}
                  alt={restaurantData.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                
                {/* Logo */}
                <div className="absolute bottom-4 left-4">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                    {restaurantData.logo}
                  </div>
                </div>

                {/* Store Status Badge */}
                <div className="absolute top-4 right-4">
                  <Badge className={isStoreOpen ? "bg-[#10B981]" : "bg-[#64748B]"}>
                    {isStoreOpen ? "Open Now" : "Closed"}
                  </Badge>
                </div>
              </div>

              {/* Store Info */}
              <Card className="p-5 border-2 border-[#E2E8F0] mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-2xl font-bold text-[#121212]">{restaurantData.name}</h2>
                      {restaurantData.verified && (
                        <BadgeCheck className="w-6 h-6 text-[#3B82F6] fill-[#3B82F6]" />
                      )}
                    </div>
                    <p className="text-sm text-[#64748B] mb-2">{restaurantData.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <span className="font-semibold text-[#121212]">{restaurantData.rating}</span>
                    <span className="text-[#64748B]">({restaurantData.ratingCount}+)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#64748B]">
                    <Clock className="w-4 h-4" />
                    <span>{restaurantData.deliveryTime}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#64748B]">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs">{restaurantData.address}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]">
                  <span className="text-sm text-[#64748B]">Delivery Fee</span>
                  <span className="text-xl font-bold text-[#E11D48]">₱{restaurantData.deliveryFee}</span>
                </div>
              </Card>

              {/* Menu Preview */}
              <Card className="p-5 border-2 border-[#E2E8F0]">
                <h3 className="font-bold text-[#121212] mb-3">Menu Items</h3>
                
                {menuItems.length > 0 ? (
                  <div className="space-y-3">
                    {menuItems.filter(item => item.available).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-[#F8F9FA] rounded-xl">
                        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 border-[#E2E8F0]">
                          <ImageWithFallback
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-[#121212] text-sm truncate">{item.name}</h4>
                          <p className="text-xs text-[#64748B] line-clamp-1">{item.description}</p>
                          <p className="text-base font-bold text-[#E11D48] mt-1">₱{item.price}</p>
                        </div>
                      </div>
                    ))}
                    <Link to="/business/menu">
                      <Button variant="outline" className="w-full mt-2">
                        Edit Menu Items
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Package className="w-12 h-12 text-[#CBD5E1] mx-auto mb-2" />
                    <p className="text-sm text-[#64748B] mb-3">No menu items yet</p>
                    <Link to="/business/menu">
                      <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                        Add Menu Items
                      </Button>
                    </Link>
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : (
          // EDIT MODE
          <>
            {/* Store Status Toggle */}
            <div className="px-5 py-4 border-b border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-[#121212] mb-1">Store Status</h3>
                  <p className="text-sm text-[#64748B]">
                    {isStoreOpen ? "✅ Accepting orders" : "🔴 Not accepting orders"}
                  </p>
                </div>
                <button
                  onClick={() => toggleStoreStatus(!isStoreOpen)}
                  className={`w-16 h-9 rounded-full transition-all ${
                    isStoreOpen ? "bg-[#10B981]" : "bg-[#CBD5E1]"
                  }`}
                >
                  <div
                    className={`w-7 h-7 bg-white rounded-full shadow-md transition-transform ${
                      isStoreOpen ? "translate-x-8" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Today's Stats */}
            <div className="px-5 py-4 bg-[#F8F9FA]">
              <h3 className="font-bold text-[#121212] mb-3">📊 Today's Performance</h3>
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
                  <p className="text-xs text-[#64748B] mb-1">Total Orders</p>
                  <p className="text-3xl font-bold text-[#121212]">{todayStats.orders}</p>
                  <Badge className="bg-[#10B981] mt-2 text-xs">+5 from yesterday</Badge>
                </Card>
                <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
                  <p className="text-xs text-[#64748B] mb-1">Revenue</p>
                  <p className="text-2xl font-bold text-[#E11D48]">₱{todayStats.revenue.toLocaleString()}</p>
                  <Badge className="bg-[#3B82F6] mt-2 text-xs">+12%</Badge>
                </Card>
                <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
                  <p className="text-xs text-[#64748B] mb-1">Average Order</p>
                  <p className="text-2xl font-bold text-[#121212]">₱{todayStats.avgOrderValue}</p>
                </Card>
                <Card className="p-4 border-2 border-[#E2E8F0] bg-white">
                  <p className="text-xs text-[#64748B] mb-1">Pending</p>
                  <p className="text-3xl font-bold text-[#F59E0B]">{todayStats.pendingOrders}</p>
                  {todayStats.pendingOrders > 0 && (
                    <Link to="/business/orders">
                      <Button size="sm" variant="outline" className="mt-2 text-xs w-full">
                        View Orders
                      </Button>
                    </Link>
                  )}
                </Card>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="px-5 py-4">
              <h3 className="font-bold text-[#121212] mb-3">⚡ Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Link to="/business/menu">
                  <Card className="p-5 text-center border-2 border-[#E2E8F0] hover:border-[#E11D48] transition-all active:scale-95 bg-gradient-to-br from-[#FFF1F2] to-white">
                    <Package className="w-10 h-10 text-[#E11D48] mx-auto mb-2" />
                    <p className="font-bold text-[#121212] mb-1">Menu</p>
                    <p className="text-xs text-[#64748B]">Add & edit items</p>
                  </Card>
                </Link>
                <Link to="/business/orders">
                  <Card className="p-5 text-center border-2 border-[#E2E8F0] hover:border-[#3B82F6] transition-all active:scale-95 bg-gradient-to-br from-[#EFF6FF] to-white relative">
                    <Clock className="w-10 h-10 text-[#3B82F6] mx-auto mb-2" />
                    {todayStats.pendingOrders > 0 && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-[#E11D48] rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-white">{todayStats.pendingOrders}</span>
                      </div>
                    )}
                    <p className="font-bold text-[#121212] mb-1">Orders</p>
                    <p className="text-xs text-[#64748B]">Manage orders</p>
                  </Card>
                </Link>
              </div>
            </div>

            {/* Store Appearance Section */}
            <div className="px-5 py-4 border-t-8 border-[#F8F9FA]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#121212]">🎨 Store Appearance</h3>
                <Badge variant="outline" className="text-xs">
                  <Eye className="w-3 h-3 mr-1" />
                  Tap Preview to see
                </Badge>
              </div>

              {/* Hero Banner Editor */}
              <Card className="p-4 border-2 border-[#E2E8F0] mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[#121212]">Hero Banner & Logo</p>
                  <button
                    onClick={() => setShowEditBanner(true)}
                    className="p-2 bg-[#F8F9FA] rounded-lg active:scale-95 transition-transform"
                  >
                    <Edit2 className="w-4 h-4 text-[#E11D48]" />
                  </button>
                </div>
                <div className="relative h-32 rounded-xl overflow-hidden mb-2">
                  <ImageWithFallback
                    src={restaurantData.heroImage}
                    alt="Banner"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl shadow-lg">
                      {restaurantData.logo}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => setShowEditBanner(true)}
                  variant="outline"
                  className="w-full text-sm"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Change Banner & Logo
                </Button>
              </Card>

              {/* Store Info Editor */}
              <Card className="p-4 border-2 border-[#E2E8F0]">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-[#121212]">Store Information</p>
                  <button
                    onClick={() => setShowEditInfo(true)}
                    className="p-2 bg-[#F8F9FA] rounded-lg active:scale-95 transition-transform"
                  >
                    <Edit2 className="w-4 h-4 text-[#E11D48]" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start justify-between py-2 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Name</span>
                    <span className="font-semibold text-[#121212] text-right">{restaurantData.name}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Subtitle</span>
                    <span className="font-semibold text-[#121212] text-right">{restaurantData.subtitle}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Address</span>
                    <span className="font-semibold text-[#121212] text-right flex-1 ml-4">{restaurantData.address}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Delivery Time</span>
                    <span className="font-semibold text-[#121212]">{restaurantData.deliveryTime}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Delivery Fee</span>
                    <span className="font-semibold text-[#E11D48]">₱{restaurantData.deliveryFee}</span>
                  </div>
                  <div className="flex items-start justify-between py-2">
                    <span className="text-[#64748B]">Hours</span>
                    <span className="font-semibold text-[#121212]">{restaurantData.operatingHours}</span>
                  </div>
                </div>
                <Button
                  onClick={() => setShowEditInfo(true)}
                  variant="outline"
                  className="w-full text-sm mt-3"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Edit Information
                </Button>
              </Card>
            </div>
          </>
        )}

        {/* Edit Banner Modal */}
        {showEditBanner && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end animate-in slide-in-from-bottom">
            <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#121212]">Edit Banner & Logo</h2>
                <button
                  onClick={() => setShowEditBanner(false)}
                  className="px-4 py-2 bg-[#10B981] text-white rounded-lg font-semibold active:scale-95 transition-transform flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Hero Banner Image</label>
                  <div className="h-44 rounded-2xl overflow-hidden mb-3 border-2 border-[#E2E8F0]">
                    <ImageWithFallback
                      src={restaurantData.heroImage}
                      alt="Banner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-sm py-5">
                    <Upload className="w-5 h-5 mr-2" />
                    Upload New Banner
                  </Button>
                  <p className="text-xs text-[#64748B] mt-2 text-center">Recommended: 1200x400px (landscape), max 5MB</p>
                </div>

                <div className="border-t-2 border-[#E2E8F0] pt-5">
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Store Logo (Emoji)</label>
                  <p className="text-xs text-[#64748B] mb-3">Choose an emoji that represents your business</p>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 bg-white border-2 border-[#E2E8F0] rounded-2xl flex items-center justify-center text-4xl">
                      {restaurantData.logo}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={restaurantData.logo}
                        onChange={(e) => setRestaurantData({ ...restaurantData, logo: e.target.value })}
                        className="w-full p-4 border-2 border-[#E2E8F0] rounded-xl text-3xl text-center"
                        maxLength={2}
                        placeholder="🍗"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-8 gap-2">
                    {["🍗", "🍔", "🍕", "🍜", "🍱", "🍰", "☕", "🥘", "🍛", "🍝", "🥗", "🍣", "🌮", "🍩", "🧋", "🥙"].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setRestaurantData({ ...restaurantData, logo: emoji })}
                        className={`p-3 text-2xl rounded-xl border-2 transition-all active:scale-95 ${
                          restaurantData.logo === emoji
                            ? "border-[#E11D48] bg-[#FFF1F2]"
                            : "border-[#E2E8F0] bg-white"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Info Modal */}
        {showEditInfo && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end animate-in slide-in-from-bottom">
            <div className="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#121212]">Edit Store Info</h2>
                <button
                  onClick={saveStoreInformation}
                  className="px-4 py-2 bg-[#10B981] text-white rounded-lg font-semibold active:scale-95 transition-transform flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Store Name *</label>
                  <input
                    type="text"
                    value={restaurantData.name}
                    onChange={(e) => setRestaurantData({ ...restaurantData, name: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl font-semibold"
                    placeholder="e.g., Mang Inasal"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Subtitle/Branch</label>
                  <input
                    type="text"
                    value={restaurantData.subtitle}
                    onChange={(e) => setRestaurantData({ ...restaurantData, subtitle: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl"
                    placeholder="e.g., Tagalag Center"
                  />
                  <p className="text-xs text-[#64748B] mt-1">Branch location or tagline</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Address *</label>
                  <textarea
                    value={restaurantData.address}
                    onChange={(e) => setRestaurantData({ ...restaurantData, address: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl min-h-[80px]"
                    placeholder="Full address with barangay and city"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold text-[#121212] mb-2 block">Delivery Time</label>
                    <input
                      type="text"
                      value={restaurantData.deliveryTime}
                      onChange={(e) => setRestaurantData({ ...restaurantData, deliveryTime: e.target.value })}
                      className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl"
                      placeholder="15-25 min"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-[#121212] mb-2 block">Delivery Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]">₱</span>
                      <input
                        type="number"
                        value={restaurantData.deliveryFee}
                        onChange={(e) => setRestaurantData({ ...restaurantData, deliveryFee: parseInt(e.target.value) || 0 })}
                        className="w-full p-3 pl-7 border-2 border-[#E2E8F0] rounded-xl"
                        placeholder="35"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-[#121212] mb-2 block">Operating Hours</label>
                  <input
                    type="text"
                    value={restaurantData.operatingHours}
                    onChange={(e) => setRestaurantData({ ...restaurantData, operatingHours: e.target.value })}
                    className="w-full p-3 border-2 border-[#E2E8F0] rounded-xl"
                    placeholder="8:00 AM - 10:00 PM"
                  />
                  <p className="text-xs text-[#64748B] mt-1">Daily operating hours</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}