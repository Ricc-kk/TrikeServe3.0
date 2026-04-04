import { useState, useEffect } from "react";
import { Search, MapPin, Heart, User, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, BadgeCheck, Clock, Star, Shield, SlidersHorizontal, ArrowUp, X, Check, Store, Bell } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import Slider from "react-slick";
import tricycleIcon from "figma:asset/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import { useCart } from "../../contexts/CartContext";
import { useFavorites } from "../../contexts/FavoritesContext";

// TrikeServe Food Delivery Home - Tagalag, Valenzuela
export default function FoodHome() {
  const navigate = useNavigate();
  const { getTotalItems } = useCart();
  const { toggleFavorite, isFavorite, getTotalFavorites } = useFavorites();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isScrolling, setIsScrolling] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Filter drag state
  const [isFilterDragging, setIsFilterDragging] = useState(false);
  const [filterStartX, setFilterStartX] = useState(0);
  const [filterScrollLeft, setFilterScrollLeft] = useState(0);
  
  // Filter states
  const [selectedSortBy, setSelectedSortBy] = useState<string>("recommended");
  const [selectedDeliveryTime, setSelectedDeliveryTime] = useState<string[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<string>("");
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(false);

  // Function to get unread notifications count
  const getUnreadNotificationsCount = () => {
    const currentUserData = localStorage.getItem('trikeserve_current_user');
    if (!currentUserData) return 0;

    const currentUser = JSON.parse(currentUserData);
    const userEmail = currentUser.email;

    const savedNotifications = localStorage.getItem(`notifications_${userEmail}`);
    if (!savedNotifications) return 0;

    const notifications = JSON.parse(savedNotifications);
    return notifications.filter((n: any) => n.unread).length;
  };

  // Function to load restaurants
  const loadRestaurants = () => {
    const usersData = localStorage.getItem('trikeserve_users');
    if (usersData) {
      try {
        const users = JSON.parse(usersData);
        const businessUsers = users.filter((u: any) => u.role === 'business' && u.isVerified);
        
        const restaurantList = businessUsers.map((business: any) => {
          const restaurantDataKey = `restaurantData_${business.email}`;
          const savedData = localStorage.getItem(restaurantDataKey);
          let restaurantData = savedData ? JSON.parse(savedData) : {};
          
          // Load menu items to check if restaurant has items
          const menuItemsKey = `menuItems_${business.email}`;
          const savedMenuItems = localStorage.getItem(menuItemsKey);
          const menuItems = savedMenuItems ? JSON.parse(savedMenuItems) : [];
          const hasMenu = menuItems.length > 0;
          
          return {
            id: business.email,
            name: restaurantData.name || business.businessName || business.name || "Restaurant",
            subtitle: restaurantData.subtitle || business.businessAddress || "Tagalag",
            logo: restaurantData.logo || "🍽️",
            image: restaurantData.heroImage || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
            time: restaurantData.deliveryTime || "25-35 min",
            rating: restaurantData.rating || 0,
            ratingCount: restaurantData.ratingCount || 0,
            bgColor: "#FFF7ED",
            deliveryFee: `₱${restaurantData.deliveryFee || 35}`,
            promo: hasMenu ? "Open for Orders!" : "Coming Soon",
            verified: true,
            category: "restaurant",
            address: restaurantData.address || business.businessAddress || "",
            operatingHours: restaurantData.operatingHours || "8:00 AM - 10:00 PM",
            hasMenu
          };
        });
        
        setRestaurants(restaurantList);
      } catch (error) {
        console.error('Error loading restaurants:', error);
      }
    }
  };

  // Load verified business users as restaurants - Initial load
  useEffect(() => {
    loadRestaurants();
    setUnreadNotifications(getUnreadNotificationsCount());
  }, []);

  // Auto-refresh restaurants every 5 seconds to detect newly verified businesses
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadRestaurants();
      setUnreadNotifications(getUnreadNotificationsCount());
    }, 5000); // Check every 5 seconds

    return () => clearInterval(refreshInterval);
  }, []);

  // Refresh restaurants when page becomes visible (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadRestaurants();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle scroll to expand/collapse FAB
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      setIsScrolling(true);
      setFabExpanded(true);
      setShowBackToTop(false); // Hide while scrolling
      
      // Check if page is scrolled
      setIsScrolled(window.scrollY > 10);
      
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
        setFabExpanded(false);
        // Show back to top only after scrolling stops
        if (window.scrollY > 10) {
          setShowBackToTop(true);
        }
      }, 750);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Local Valenzuela/Tagalag categories
  const categories = [
    { id: "silugan", name: "Silugan", icon: "🍳", gradient: "from-yellow-400 to-orange-400" },
    { id: "ihawan", name: "Ihawan", icon: "🔥", gradient: "from-red-500 to-orange-500" },
    { id: "karinderya", name: "Karinderya", icon: "🍲", gradient: "from-green-500 to-emerald-600" },
    { id: "kape", name: "Kape & Tsaa", icon: "☕", gradient: "from-amber-700 to-yellow-600" },
    { id: "merienda", name: "Merienda", icon: "🥐", gradient: "from-pink-400 to-rose-400" },
    { id: "malamig", name: "Malamig", icon: "🧋", gradient: "from-purple-400 to-pink-500" },
  ];

  const restaurantFilters = ["All", "Pinoy Food", "Fast Food", "Kape", "Merienda"];

  const carouselSettings = {
    dots: true,
    infinite: true,
    speed: 800,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 3000,
    cssEase: "ease-in-out",
    arrows: false,
    pauseOnHover: true,
  };

  return (
    <div className="min-h-screen bg-[#BE123C] flex flex-col pb-20">
      {/* Header - Clean and Simple */}
      <div className="bg-gradient-to-b from-[#E11D48] to-[#BE123C] px-5 pt-6 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-7 h-7 text-white" />
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">Tagalag Rd</h1>
              <p className="text-white/90 text-sm">Valenzuela City</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/customer/notifications')}
              className="active:scale-90 transition-transform relative"
            >
              <Bell className="w-7 h-7 text-white" />
              {/* Notification badge - can be dynamic */}
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-[#E11D48]">{unreadNotifications}</span>
              </div>
            </button>
            <button 
              onClick={() => navigate('/customer/favorites')}
              className="active:scale-90 transition-transform relative"
            >
              <Heart className="w-7 h-7 text-white" />
              {getTotalFavorites() > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#E11D48]">{getTotalFavorites()}</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar - Clean White */}
      <div className="bg-gradient-to-b from-[#BE123C] to-[#BE123C]/95 px-5 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search for restaurants and groceries"
              className="w-full pl-16 pr-5 py-4 bg-white rounded-full shadow-sm border-0 text-base text-[#121212] placeholder:text-[#94A3B8]"
              style={{ outline: 'none' }}
            />
          </div>
          <button 
            onClick={() => setShowFilterModal(true)}
            className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center active:scale-90 transition-transform flex-shrink-0"
          >
            <SlidersHorizontal className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Restaurant Carousel - Extended Crimson Background */}
      {restaurants.length > 0 && (
        <div 
          className="pt-6 pb-10 bg-gradient-to-b from-[#BE123C]/95 to-[#BE123C]/80"
        >
          <style>{`
            .restaurant-carousel .slick-dots {
              bottom: -35px;
            }
            .restaurant-carousel .slick-dots li button:before {
              color: white;
              font-size: 10px;
              opacity: 0.4;
            }
            .restaurant-carousel .slick-dots li.slick-active button:before {
              color: white;
              opacity: 1;
            }
          `}</style>
          <Slider {...carouselSettings} className="restaurant-carousel">
            {restaurants.map((restaurant, idx) => (
              <div key={idx}>
                <Link to={`/customer/restaurant-detail?id=${encodeURIComponent(restaurant.id)}&name=${encodeURIComponent(restaurant.name)}`}>
                  <div className="bg-white/15 backdrop-blur-xl rounded-none p-0 border-0 h-[140px] cursor-pointer hover:bg-white/20 transition-colors"
                    style={{
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)'
                    }}
                  >
                  <div className="flex items-center gap-4 px-5 h-full">
                    {/* Restaurant Image */}
                    <div className="w-24 h-24 rounded-2xl flex-shrink-0 overflow-hidden relative border-2 border-white/50">
                      <ImageWithFallback 
                        src={restaurant.image}
                        alt={restaurant.name}
                        className="w-full h-full object-cover"
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      {/* Verified badge */}
                      {restaurant.verified && (
                        <div className="absolute top-2 left-2 bg-[#121212] text-white p-1 rounded-full">
                          <BadgeCheck className="w-3 h-3" fill="white" />
                        </div>
                      )}
                    </div>
                    
                    {/* Restaurant Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-1">
                      <div>
                        <h3 className="text-white font-bold text-lg mb-0.5 leading-tight truncate">
                          {restaurant.name}
                        </h3>
                        <p className="text-white/85 text-xs mb-2.5 leading-tight truncate">
                          {restaurant.subtitle}
                        </p>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="flex items-center gap-1 bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-1">
                            <Clock className="w-3 h-3 text-white" />
                            <span className="text-white text-[11px] font-semibold">{restaurant.time}</span>
                          </div>
                          <div className="flex items-center gap-1 bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-1">
                            <Star className="w-3 h-3 text-yellow-300 fill-yellow-300" />
                            <span className="text-white text-[11px] font-semibold">{restaurant.rating}</span>
                          </div>
                        </div>
                        
                        <div className="bg-white/20 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/30">
                          <p className="text-white text-[11px] font-bold leading-tight truncate">🎉 {restaurant.promo}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </Link>
              </div>
            ))}
          </Slider>
        </div>
      )}

      {/* Categories and Restaurant List - Combined Section */}
      <div className="px-5 py-6 bg-white rounded-t-[32px] -mt-2 relative z-10">
        {/* Popular Restaurants - Enhanced Cards */}
        <div className="pt-2">
          <h3 className="text-xl font-bold text-[#121212] mb-4">Lahat ng Tindahan sa Tagalag</h3>
          
          {restaurants.length === 0 ? (
            // Empty State
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="w-12 h-12 text-[#94A3B8]" />
              </div>
              <h3 className="text-xl font-bold text-[#121212] mb-2">Walang Available na Tindahan</h3>
              <p className="text-sm text-[#64748B] mb-4 px-8">
                No verified restaurants yet. Check back soon!
              </p>
            </div>
          ) : (
            <>
              {/* Filter Pills */}
              <style>{`
                .filter-pills-container::-webkit-scrollbar {
                  display: none;
                }
                .filter-pills-container {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
              `}</style>
              <div className="flex gap-2 overflow-x-auto pb-3 mb-5 filter-pills-container"
                onMouseDown={(e) => {
                  setIsFilterDragging(true);
                  setFilterStartX(e.clientX);
                  setFilterScrollLeft(e.currentTarget.scrollLeft);
                }}
                onMouseUp={() => setIsFilterDragging(false)}
                onMouseLeave={() => setIsFilterDragging(false)}
                onMouseMove={(e) => {
                  if (!isFilterDragging) return;
                  e.preventDefault();
                  const x = e.clientX;
                  const walk = (x - filterStartX) * 1.5;
                  e.currentTarget.scrollLeft = filterScrollLeft - walk;
                }}
              >
                {restaurantFilters.map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveCategory(filter.toLowerCase())}
                    className={`px-4 py-2.5 rounded-full whitespace-nowrap text-sm font-bold transition-all active:scale-95 shadow-md ${
                      activeCategory === filter.toLowerCase()
                        ? 'bg-[#121212] text-white shadow-lg'
                        : 'bg-white text-[#121212] hover:shadow-xl'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Restaurant Cards with Verified Badges */}
              <div className="space-y-4">
                {restaurants
                  .filter((restaurant) => 
                    activeCategory === 'all' || restaurant.category === activeCategory
                  )
                  .map((restaurant, idx) => (
                  <Link key={idx} to={`/customer/restaurant-detail?id=${encodeURIComponent(restaurant.id)}&name=${encodeURIComponent(restaurant.name)}`}>
                    <Card className="overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl bg-white active:scale-[0.98]">
                    <div className="flex items-center gap-0">
                      {/* Image Thumbnail */}
                      <div className="w-32 h-32 flex-shrink-0 relative overflow-hidden">
                        <ImageWithFallback 
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                        />
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                        {/* Rating badge */}
                        <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm text-[#121212] px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                          <Star className="w-3 h-3 fill-[#FFC107] text-[#FFC107]" />
                          <span className="text-xs font-bold">{restaurant.rating}</span>
                        </div>
                      </div>

                      {/* Restaurant Info */}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-[#121212] text-base truncate">
                                {restaurant.name}
                              </h4>
                              {/* Verified Merchant Badge */}
                              {restaurant.verified && (
                                <div className="flex-shrink-0 w-5 h-5 bg-[#121212] rounded-full flex items-center justify-center shadow-md">
                                  <Shield className="w-3 h-3 text-white" fill="white" />
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-[#64748B] flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {restaurant.subtitle}
                            </p>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite({
                                id: restaurant.id,
                                name: restaurant.name,
                                image: restaurant.image,
                                rating: restaurant.rating,
                                reviews: restaurant.ratingCount,
                                distance: restaurant.subtitle,
                                estimatedTime: restaurant.time,
                                category: restaurant.category,
                                priceRange: restaurant.deliveryFee
                              });
                            }}
                            className={`flex-shrink-0 ml-2 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-md ${
                              isFavorite(restaurant.id) ? 'bg-[#E11D48]' : 'bg-[#FFF7ED]'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isFavorite(restaurant.id) ? 'text-white fill-white' : 'text-[#E11D48]'}`} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#64748B] mb-3">
                          <span className="flex items-center gap-1 bg-[#F8F9FA] px-2.5 py-1.5 rounded-lg shadow-sm">
                            <Clock className="w-3 h-3" />
                            {restaurant.time}
                          </span>
                          <span className="flex items-center gap-1 bg-[#F8F9FA] px-2.5 py-1.5 rounded-lg shadow-sm">
                            <span className="text-[10px]">₱</span>
                            {restaurant.deliveryFee.replace('₱', '')}
                          </span>
                        </div>

                        {/* Promo Badge */}
                        <div className="bg-gradient-to-r from-[#FFF7ED] to-[#FEF2F2] border-2 border-[#E11D48]/20 rounded-xl px-3 py-2 shadow-sm">
                          <p className="text-[#E11D48] text-xs font-bold">
                            🎉 {restaurant.promo}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Button */}
                    <div className="px-4 pb-4">
                      <button className="w-full bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-bold py-3.5 rounded-2xl hover:shadow-xl transition-all duration-200 active:scale-95 shadow-lg shadow-[#E11D48]/30 uppercase text-sm tracking-wide">
                        Order Na!
                      </button>
                    </div>
                  </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed left-1/2 -translate-x-1/2 bottom-28 bg-white/95 backdrop-blur-sm rounded-full px-5 py-3 flex items-center justify-center gap-2 shadow-2xl shadow-[#121212]/20 hover:shadow-3xl active:scale-90 transition-all duration-300 z-[1600] border-2 border-[#E11D48]"
        >
          <ArrowUp className="w-5 h-5 text-[#E11D48]" />
          <span className="text-[#E11D48] font-bold text-sm whitespace-nowrap">Back to Top</span>
        </button>
      )}

      {/* Floating Tricycle Ride Button - Bottom Right */}
      <Link to="/customer">
        <div
          className={`fixed bottom-24 right-5 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center shadow-2xl shadow-[#E11D48]/50 hover:shadow-3xl transition-all duration-300 z-[1600] border-4 border-white active:scale-95 ${
            fabExpanded ? 'px-5 py-3 gap-2' : 'w-16 h-16'
          }`}
        >
          {/* Filipino Tricycle Icon */}
          <img
            src={tricycleIcon}
            alt="Tricycle"
            className="drop-shadow-2xl pointer-events-none"
            style={{ 
              width: fabExpanded ? "40px" : "52px", 
              height: fabExpanded ? "40px" : "52px",
              objectFit: 'contain'
            }}
          />
          
          {/* Contextual label when scrolling */}
          {fabExpanded && (
            <span className="text-white font-bold text-sm whitespace-nowrap drop-shadow-lg pointer-events-none">
              Book a Ride
            </span>
          )}
        </div>
      </Link>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-[1500]">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#E11D48]" />
            <span className="text-xs text-[#E11D48] font-bold">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1 relative">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            {getTotalItems() > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#E11D48] rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{getTotalItems()}</span>
              </div>
            )}
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </nav>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-xl font-bold text-[#121212]">Filters</h2>
              <button 
                onClick={() => setShowFilterModal(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-90 transition-all"
              >
                <X className="w-6 h-6 text-[#64748B]" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Sort By */}
              <div>
                <h3 className="text-base font-bold text-[#121212] mb-3">Sort By</h3>
                <div className="space-y-2">
                  {['recommended', 'rating', 'delivery-time', 'distance'].map((option) => (
                    <button
                      key={option}
                      onClick={() => setSelectedSortBy(option)}
                      className={`w-full px-4 py-3 rounded-2xl flex items-center justify-between transition-all ${
                        selectedSortBy === option
                          ? 'bg-[#E11D48] text-white shadow-lg'
                          : 'bg-[#F8F9FA] text-[#121212] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      <span className="font-medium capitalize">{option.replace('-', ' ')}</span>
                      {selectedSortBy === option && <Check className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Time */}
              <div>
                <h3 className="text-base font-bold text-[#121212] mb-3">Delivery Time</h3>
                <div className="flex flex-wrap gap-2">
                  {['10-20 min', '20-30 min', '30+ min'].map((time) => (
                    <button
                      key={time}
                      onClick={() => {
                        setSelectedDeliveryTime(prev =>
                          prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time]
                        );
                      }}
                      className={`px-4 py-2.5 rounded-full font-medium transition-all ${
                        selectedDeliveryTime.includes(time)
                          ? 'bg-[#E11D48] text-white shadow-lg'
                          : 'bg-[#F8F9FA] text-[#121212] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <h3 className="text-base font-bold text-[#121212] mb-3">Price Range</h3>
                <div className="flex flex-wrap gap-2">
                  {['₱ (Under ₱100)', '₱₱ (₱100-₱200)', '₱₱₱ (₱200+)'].map((price) => (
                    <button
                      key={price}
                      onClick={() => {
                        setSelectedPriceRange(prev =>
                          prev.includes(price) ? prev.filter(p => p !== price) : [...prev, price]
                        );
                      }}
                      className={`px-4 py-2.5 rounded-full font-medium transition-all ${
                        selectedPriceRange.includes(price)
                          ? 'bg-[#E11D48] text-white shadow-lg'
                          : 'bg-[#F8F9FA] text-[#121212] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {price}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div>
                <h3 className="text-base font-bold text-[#121212] mb-3">Minimum Rating</h3>
                <div className="flex flex-wrap gap-2">
                  {['4.0+', '4.5+', '4.8+'].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setSelectedRating(selectedRating === rating ? '' : rating)}
                      className={`px-4 py-2.5 rounded-full font-medium flex items-center gap-1 transition-all ${
                        selectedRating === rating
                          ? 'bg-[#E11D48] text-white shadow-lg'
                          : 'bg-[#F8F9FA] text-[#121212] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${selectedRating === rating ? 'fill-white' : 'fill-[#FFC107]'}`} />
                      {rating}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free Delivery */}
              <div>
                <button
                  onClick={() => setFreeDeliveryOnly(!freeDeliveryOnly)}
                  className={`w-full px-4 py-4 rounded-2xl flex items-center justify-between transition-all ${
                    freeDeliveryOnly
                      ? 'bg-[#E11D48] text-white shadow-lg'
                      : 'bg-[#F8F9FA] text-[#121212] hover:bg-[#E2E8F0]'
                  }`}
                >
                  <span className="font-bold">Free Delivery Only</span>
                  <div className={`w-12 h-6 rounded-full transition-all relative ${
                    freeDeliveryOnly ? 'bg-white/30' : 'bg-[#CBD5E1]'
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-all ${
                      freeDeliveryOnly ? 'right-0.5' : 'left-0.5'
                    }`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-[#E2E8F0] flex gap-3">
              <button
                onClick={() => {
                  setSelectedSortBy('recommended');
                  setSelectedDeliveryTime([]);
                  setSelectedPriceRange([]);
                  setSelectedRating('');
                  setFreeDeliveryOnly(false);
                }}
                className="flex-1 py-3.5 rounded-2xl font-bold text-[#E11D48] bg-[#FEF2F2] hover:bg-[#FEE2E2] active:scale-95 transition-all uppercase text-sm tracking-wide"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:shadow-xl active:scale-95 transition-all shadow-lg shadow-[#E11D48]/30 uppercase text-sm tracking-wide"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}