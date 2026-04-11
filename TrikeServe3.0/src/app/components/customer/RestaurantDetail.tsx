import { useState, useEffect } from "react";
import { ArrowLeft, Heart, Users, Calendar, Share2, Clock, Star, MapPin, ChevronDown, ChevronRight, Home as HomeIcon, ShoppingCart, MessageCircle, ClipboardList, User, Search, BadgeCheck, X, Check } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { useCart } from "../../contexts/CartContext";
import { useFavorites } from "../../contexts/FavoritesContext";
import CustomizationModal, { MenuItem as CustomizableMenuItem, CustomizationGroup } from "./CustomizationModal";
import { supabase } from "../../../utils/supabase";

interface MenuItem extends CustomizableMenuItem {
  available: boolean;
}

interface Review {
  id: number;
  author: string;
  rating: number;
  text: string;
  date: string;
  helpful: number;
}

interface RestaurantData {
  name: string;
  subtitle: string;
  logo: string;
  image: string;
  heroImage: string;
  rating: number;
  ratingCount: number;
  deliveryFee: number;
  originalFee: number;
  deliveryTime: string;
  verified: boolean;
  goodService: boolean;
  categories: { id: string; name: string }[];
  menuItems: MenuItem[];
  reviews: Review[];
}

export default function RestaurantDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get("id");
  const restaurantName = searchParams.get("name") || "Restaurant";
  const { addToCart: addItemToCart, getTotalItems } = useCart();
  const { toggleFavorite, isFavorite: checkIsFavorite } = useFavorites();
  
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showRatingsModal, setShowRatingsModal] = useState(false);
  const [showCustomizationModal, setShowCustomizationModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load restaurant data from Supabase
  useEffect(() => {
    const loadRestaurantData = async () => {
      if (!restaurantId) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('[RestaurantDetail] Loading restaurant:', restaurantId);

        // Load restaurant info from Supabase
        const { data: restaurant, error: restaurantError } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', restaurantId)
          .single();

        if (restaurantError || !restaurant) {
          console.error('[RestaurantDetail] Restaurant not found:', restaurantError);
          setIsLoading(false);
          return;
        }

        // Load menu items for this restaurant
        const { data: menuItems, error: menuError } = await supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantId);

        if (menuError) {
          console.error('[RestaurantDetail] Error loading menu items:', menuError);
        }

        // Load categories from the categories table for this restaurant
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('*')
          .eq('restaurant_id', restaurantId);

        if (categoriesError) {
          console.error('[RestaurantDetail] Error loading categories:', categoriesError);
        }

        // Use categories from the database, or fall back to extracting from menu items
        let categories = [{ id: "all", name: "All Items" }];

        if (categoriesData && categoriesData.length > 0) {
          // Use categories from database
          categories = [
            { id: "all", name: "All Items" },
            ...categoriesData.map((cat: any) => ({
              id: cat.id,
              name: cat.name
            }))
          ];
        } else {
          // Fallback: Extract unique categories from menu items
          const categoriesSet = new Set(
            (menuItems || []).map((item: any) => item.category)
          );
          categories = [
            { id: "all", name: "All Items" },
            ...Array.from(categoriesSet).map((cat: any) => ({
              id: cat as string,
              name: (cat as string).charAt(0).toUpperCase() + (cat as string).slice(1)
            }))
          ];
        }

        // Map menu items to MenuItem format
        const mappedMenuItems = (menuItems || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || '',
          price: parseFloat(item.price),
          image: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
          category: item.category,
          available: item.is_available,
          badge: undefined,
          customizationGroups: []
        }));

        // Create restaurant data object
        const data: RestaurantData = {
          name: restaurant.name || restaurantName,
          subtitle: restaurant.address || 'Tagalag, Valenzuela',
          logo: '🍽️',
          image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          heroImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          rating: restaurant.rating || 5.0,
          ratingCount: 0,
          deliveryFee: 35,
          originalFee: 70,
          deliveryTime: '25-35 min',
          verified: true,
          goodService: true,
          categories,
          menuItems: mappedMenuItems,
          reviews: []
        };

        console.log('[RestaurantDetail] Loaded restaurant with', mappedMenuItems.length, 'menu items');
        setRestaurantData(data);
      } catch (error) {
        console.error('[RestaurantDetail] Error loading restaurant:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRestaurantData();
  }, [restaurantId, restaurantName]);

  // Real-time subscription to categories changes
  useEffect(() => {
    if (!restaurantId) return;

    console.log('[RestaurantDetail] Setting up real-time categories subscription');

    // Subscribe to categories table changes
    const subscription = supabase
      .channel(`categories-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'categories',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('[RestaurantDetail] Categories changed:', payload);

          // Reload categories when they change
          const reloadCategories = async () => {
            try {
              const { data: categoriesData } = await supabase
                .from('categories')
                .select('*')
                .eq('restaurant_id', restaurantId);

              if (restaurantData && categoriesData) {
                // Build new categories list
                let categories = [{ id: "all", name: "All Items" }];

                if (categoriesData.length > 0) {
                  categories = [
                    { id: "all", name: "All Items" },
                    ...categoriesData.map((cat: any) => ({
                      id: cat.id,
                      name: cat.name
                    }))
                  ];
                }

                // Update restaurant data with new categories
                setRestaurantData({
                  ...restaurantData,
                  categories
                });

                console.log('[RestaurantDetail] Categories updated in real-time');
              }
            } catch (error) {
              console.error('[RestaurantDetail] Error reloading categories:', error);
            }
          };

          reloadCategories();
        }
      )
      .subscribe();

    return () => {
      console.log('[RestaurantDetail] Cleaning up categories subscription');
      supabase.removeChannel(subscription);
    };
  }, [restaurantId, restaurantData]);

  // Real-time subscription to menu items changes
  useEffect(() => {
    if (!restaurantId) return;

    console.log('[RestaurantDetail] Setting up real-time menu items subscription');

    // Subscribe to menu_items table changes
    const subscription = supabase
      .channel(`menu-items-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'menu_items',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          console.log('[RestaurantDetail] Menu items changed:', payload);

          // Reload menu items when they change
          const reloadMenuItems = async () => {
            try {
              const { data: menuItems } = await supabase
                .from('menu_items')
                .select('*')
                .eq('restaurant_id', restaurantId);

              if (restaurantData && menuItems) {
                // Map menu items to MenuItem format
                const mappedMenuItems = (menuItems || []).map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description || '',
                  price: parseFloat(item.price),
                  image: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
                  category: item.category,
                  available: item.is_available,
                  badge: undefined,
                  customizationGroups: []
                }));

                // Update restaurant data with new menu items
                setRestaurantData({
                  ...restaurantData,
                  menuItems: mappedMenuItems
                });

                console.log('[RestaurantDetail] Menu items updated in real-time:', mappedMenuItems.length, 'items');
              }
            } catch (error) {
              console.error('[RestaurantDetail] Error reloading menu items:', error);
            }
          };

          reloadMenuItems();
        }
      )
      .subscribe();

    return () => {
      console.log('[RestaurantDetail] Cleaning up menu items subscription');
      supabase.removeChannel(subscription);
    };
  }, [restaurantId, restaurantData]);

  // Scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Ensure restaurantData has a reviews array (if it exists)
  if (restaurantData && !restaurantData.reviews) {
    restaurantData.reviews = [];
  }

  const handleAddToCart = (item: MenuItem) => {
    // If item has customization groups, show the customization modal
    if (item.customizationGroups && item.customizationGroups.length > 0) {
      setSelectedItem(item);
      setShowCustomizationModal(true);
    } else {
      // Add directly to cart without customizations
      addToCartWithCustomizations(item, 1, []);
    }
  };

  const addToCartWithCustomizations = (item: MenuItem, quantity: number, customizations: any[]) => {
    const restaurantInfo = {
      id: restaurantId || restaurantData.name, // Use restaurant ID
      businessUserId: (restaurantData as any)?.business_user_id, // ✅ CRITICAL: Add business user ID for orders
      name: restaurantData.name,
      location: restaurantData.subtitle,
      distance: "1.2 km",
      time: restaurantData.deliveryTime,
      image: restaurantData.image,
      deliveryFee: restaurantData.deliveryFee
    };

    // Calculate total price with customizations
    let itemPrice = item.price;
    customizations.forEach((customization: any) => {
      itemPrice += customization.price;
    });

    addItemToCart(restaurantInfo, {
      id: item.id,
      name: item.name,
      description: item.description,
      price: itemPrice,
      quantity: quantity,
      image: item.image,
      category: item.category,
      badge: item.badge,
      customizations: customizations
    });
  };

  const filteredItems = restaurantData?.menuItems.filter(item => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  }) || [];

  const selectedCategoryName = restaurantData?.categories.find(cat => cat.id === selectedCategory)?.name || "All Items";

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Hero Image */}
      <div className="relative h-64 bg-gradient-to-b from-[#121212] to-[#2a2a2a]">
        <ImageWithFallback
          src={restaurantData?.heroImage}
          alt={restaurantData?.name}
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Header Overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-11 h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-[#121212]" />
          </button>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                toggleFavorite({
                  id: restaurantId || restaurantName,
                  name: restaurantData?.name,
                  image: restaurantData?.heroImage,
                  rating: restaurantData?.rating,
                  reviews: restaurantData?.ratingCount,
                  distance: restaurantData?.subtitle,
                  estimatedTime: restaurantData?.deliveryTime,
                  category: "restaurant",
                  priceRange: `₱${restaurantData?.deliveryFee}`
                });
              }}
              className="w-11 h-11 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
            >
              <Heart className={`w-6 h-6 ${checkIsFavorite(restaurantId || restaurantName) ? 'fill-[#E11D48] text-[#E11D48]' : 'text-[#121212]'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Restaurant Info Card */}
      <div className="bg-white mx-5 -mt-6 relative z-10 rounded-3xl shadow-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center shadow-lg flex-shrink-0">
            <span className="text-4xl">{restaurantData?.logo}</span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                {restaurantData?.goodService && (
                  <div className="flex items-center gap-1 text-[#18B5A4] mb-1">
                    <BadgeCheck className="w-4 h-4" />
                    <span className="text-xs font-bold">Good Service</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                )}
                <h1 className="text-2xl font-bold text-[#121212]">{restaurantData?.name}</h1>
                <p className="text-sm text-[#64748B]">- {restaurantData?.subtitle}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#FFC107] text-[#FFC107]" />
                <span className="text-sm font-bold text-[#121212]">{restaurantData?.rating}</span>
                <span className="text-xs text-[#64748B]">({restaurantData?.ratingCount.toLocaleString()}+)</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#E11D48] font-bold">
                <span className="text-xs">₱</span>{restaurantData?.deliveryFee.toFixed(2)}
              </span>
              <span className="text-[#94A3B8] line-through text-xs">
                <span className="text-[10px]">₱</span>{restaurantData?.originalFee.toFixed(2)}
              </span>
              <span className="text-[#64748B]">• From {restaurantData?.deliveryTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Category Header with Visible Pills */}
      <div className={`sticky top-0 z-40 bg-white transition-all mt-4 ${isScrolled ? 'shadow-lg' : ''}`}>
        <div className="px-5 py-4 space-y-3">
          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {restaurantData?.categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedCategory === category.id
                    ? "bg-[#E11D48] text-white"
                    : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
              <input
                type="text"
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={() => setShowSearchModal(true)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-[#E2E8F0] rounded-2xl text-sm bg-[#F8F9FA]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* What People Say */}
      {restaurantData?.reviews && restaurantData.reviews.length > 0 && (
        <div className="px-5 py-4">
          <button 
            onClick={() => setShowRatingsModal(true)}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-[#121212]">What people say</h2>
              <ChevronRight className="w-6 h-6 text-[#64748B]" />
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-[#F1F5F9] active:bg-[#F8F9FA] transition-colors">
              <p className="text-[#121212] text-sm mb-2 line-clamp-2">{restaurantData.reviews[0].text}</p>
              <div className="flex items-center gap-2">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`w-4 h-4 ${star <= restaurantData.reviews[0].rating ? 'fill-[#FFC107] text-[#FFC107]' : 'text-[#E2E8F0]'}`} />
                  ))}
                </div>
                <span className="text-xs text-[#64748B]">• {restaurantData.reviews[0].author}</span>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Menu Items */}
      <div className="px-5 pb-6">
        <h2 className="text-xl font-bold text-[#121212] mb-4">
          {selectedCategory === "all" ? "For You" : selectedCategoryName}
        </h2>
        
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#64748B] text-lg">No items found</p>
            <p className="text-[#94A3B8] text-sm mt-2">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <Card key={item.id} className="overflow-hidden border-0 shadow-lg rounded-2xl bg-white">
                <div className="flex items-center gap-4 p-4">
                  <div className="relative w-24 h-24 flex-shrink-0 rounded-2xl overflow-hidden">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                    {item.badge && (
                      <div className={`absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-bold text-white ${
                        item.badge === "most-ordered" ? "bg-[#E11D48]" :
                        item.badge === "most-liked" ? "bg-[#18B5A4]" :
                        "bg-[#121212]"
                      }`}>
                        {item.badge === "most-ordered" ? "Most ordered" :
                         item.badge === "most-liked" ? "Most liked" :
                         "Signature dish"}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#121212] text-base mb-1 line-clamp-1">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-[#64748B] mb-2 line-clamp-2">{item.description}</p>
                    )}
                    <p className="text-lg font-bold text-[#121212]">
                      <span className="text-sm">₱</span>{item.price.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleAddToCart(item)}
                    className="w-11 h-11 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center shadow-lg shadow-[#E11D48]/30 active:scale-90 transition-all flex-shrink-0"
                  >
                    <span className="text-white text-2xl font-bold leading-none">+</span>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
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

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0]">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-[#F8F9FA] rounded-2xl text-base text-[#121212] placeholder:text-[#94A3B8] border-2 border-transparent focus:border-[#E11D48] outline-none"
                  autoFocus
                />
              </div>
              <button 
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery("");
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-90 transition-all"
              >
                <X className="w-6 h-6 text-[#64748B]" />
              </button>
            </div>
            <div className="p-5">
              <button
                onClick={() => setShowSearchModal(false)}
                className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:shadow-xl active:scale-95 transition-all shadow-lg shadow-[#E11D48]/30 uppercase text-sm tracking-wide"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ratings and Reviews Modal */}
      {showRatingsModal && (
        <div className="fixed inset-0 bg-white z-[2000] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-5 py-4 flex items-center gap-4 z-10">
            <button 
              onClick={() => setShowRatingsModal(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] active:scale-90 transition-all"
            >
              <X className="w-6 h-6 text-[#121212]" />
            </button>
            <h2 className="text-xl font-bold text-[#121212]">Ratings and reviews</h2>
          </div>

          {/* Rating Summary */}
          <div className="px-5 py-6">
            <div className="bg-white border-2 border-[#E2E8F0] rounded-3xl p-6">
              <div className="flex items-start gap-6">
                {/* Overall Rating */}
                <div className="flex flex-col items-center">
                  <div className="text-5xl font-bold text-[#121212] mb-2">{restaurantData?.rating}</div>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className={`w-5 h-5 ${star <= Math.floor(restaurantData?.rating) ? 'fill-[#FFC107] text-[#FFC107]' : star <= restaurantData?.rating ? 'fill-[#FFC107]/50 text-[#FFC107]/50' : 'fill-[#E2E8F0] text-[#E2E8F0]'}`} />
                    ))}
                  </div>
                  <div className="text-sm text-[#64748B]">{restaurantData?.ratingCount.toLocaleString()} ratings</div>
                </div>

                {/* Rating Breakdown */}
                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const percentage = rating === 5 ? 75 : rating === 4 ? 15 : rating === 3 ? 5 : rating === 2 ? 3 : 2;
                    return (
                      <div key={rating} className="flex items-center gap-2">
                        <span className="text-sm text-[#64748B] w-3">{rating}</span>
                        <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${rating === 5 ? 'bg-[#FFC107]' : 'bg-[#E2E8F0]'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Top Picks */}
          <div className="px-5 pb-6">
            <h3 className="text-lg font-bold text-[#121212] mb-4">Top picks</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
              {restaurantData?.menuItems.filter(item => item.badge).slice(0, 4).map((item) => (
                <div key={item.id} className="flex-shrink-0 w-32">
                  <div className="relative w-32 h-32 rounded-2xl overflow-hidden mb-2">
                    <ImageWithFallback
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {item.badge === "most-ordered" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Most ordered</span>
                      </>
                    )}
                    {item.badge === "most-liked" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Heart className="w-2.5 h-2.5 fill-white text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Most liked</span>
                      </>
                    )}
                    {item.badge === "signature" && (
                      <>
                        <div className="w-4 h-4 bg-[#18B5A4] rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-xs font-bold text-[#18B5A4]">Signature dish</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[#121212] line-clamp-2">{item.name}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews Section */}
          <div className="px-5 pb-6">
            <h3 className="text-lg font-bold text-[#121212] mb-4">Reviews</h3>
            
            {/* AI Summary */}
            <div className="bg-[#F8F9FA] rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-[#121212]">Summarised by AI</span>
                <div className="w-5 h-5 bg-[#18B5A4] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              </div>
              <p className="text-sm text-[#64748B] mb-3">
                Customers enjoy tasty, fresh food; some note order accuracy and portion size issues.
              </p>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Taste:</span>
                  <span className="text-sm text-[#64748B]">Many enjoy the delicious taste, cheesy burgers, and crispy fries.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Freshness:</span>
                  <span className="text-sm text-[#64748B]">Food is often fresh, with hot meals and fresh buns appreciated.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-[#121212]">• Order accuracy:</span>
                  <span className="text-sm text-[#64748B]">Orders are sometimes incomplete or incorrect; check items upon receipt.</span>
                </div>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              <button className="px-4 py-2 bg-white border-2 border-[#18B5A4] text-[#18B5A4] rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap">
                <span>↑↓</span>
                Most relevant
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap">
                Topics
                <ChevronDown className="w-4 h-4" />
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm whitespace-nowrap">
                Photos
              </button>
              <button className="px-4 py-2 bg-white border-2 border-[#E2E8F0] text-[#121212] rounded-full font-bold text-sm whitespace-nowrap">
                Order type
              </button>
            </div>

            {/* Individual Reviews */}
            <div className="space-y-4">
              {restaurantData?.reviews && restaurantData.reviews.length > 0 ? restaurantData.reviews.map((review) => (
                <div key={review.id} className="bg-white border-2 border-[#E2E8F0] rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center text-white font-bold">
                        {review.author.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-[#121212]">{review.author}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star key={star} className={`w-4 h-4 ${star <= review.rating ? 'fill-[#FFC107] text-[#FFC107]' : 'text-[#E2E8F0]'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-[#64748B]">{review.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-[#121212] mb-3">{review.text}</p>
                  <button className="text-sm text-[#64748B] flex items-center gap-2">
                    <span>👍</span>
                    Helpful?
                  </button>
                </div>
              )) : (
                <div className="text-center py-12">
                  <p className="text-[#64748B]">No reviews yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customization Modal */}
      {selectedItem && (
        <CustomizationModal
          item={selectedItem}
          isOpen={showCustomizationModal}
          onClose={() => {
            setShowCustomizationModal(false);
            setSelectedItem(null);
          }}
          onAddToCart={addToCartWithCustomizations}
        />
      )}
    </div>
  );
}
