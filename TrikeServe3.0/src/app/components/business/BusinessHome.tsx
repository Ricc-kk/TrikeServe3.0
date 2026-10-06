import { useState, useEffect, useMemo, useRef } from "react";
import { Store, Package, BarChart3, User, Plus, X, Image, Clock, Star, MapPin, BadgeCheck, Eye, EyeOff, Upload, ChevronRight, Settings, Camera, Check, Menu, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";
import BusinessSidebar from "./BusinessSidebar";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import useMapLoader from "@/lib/mapLoader";
import { CUISINES, isCuisineId, type CuisineId } from "@/lib/foodTaxonomy";
import { useRestaurantProfile } from "@/lib/restaurantProfile";

export default function BusinessHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useRestaurantProfile();
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [showEditBanner, setShowEditBanner] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; sort_order?: number }[]>([]);
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [adminDeliveryFee, setAdminDeliveryFee] = useState(35); // Admin-set delivery fee (view-only for the business)
  const [showConfirmSaveInfo, setShowConfirmSaveInfo] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [saveInfoError, setSaveInfoError] = useState<string | null>(null);

  // Restaurant data - initialize with user data
  const [restaurantData, setRestaurantData] = useState({
    name: "",
    subtitle: "",
    logo: "🍽️",
    heroImage: "",
    rating: 0,
    ratingCount: 0,
    deliveryTime: "25-35 min",
    verified: true,
    address: "",
    operatingHours: "8:00 AM - 10:00 PM",
    // What the shop actually serves, and where it is. Both are declared by the
    // business; the customer filters and "distance to you" both read them.
    cuisine: [] as string[],
    latitude: null as number | null,
    longitude: null as number | null
  });
  const { isLoaded: isMapsLoaded } = useMapLoader();

  /** The customer preview reads the menu in sections, like the storefront does. */
  const menuGroups = useMemo(() => {
    const available = menuItems.filter((item) => item.available);
    const groups = sections
      .map((section) => ({
        key: section.id,
        title: section.name,
        items: available.filter((item) => item.sectionId === section.id),
      }))
      .filter((group) => group.items.length > 0);

    const unfiled = available.filter(
      (item) => !item.sectionId || !sections.some((section) => section.id === item.sectionId),
    );
    if (unfiled.length > 0) {
      groups.push({
        key: "__unfiled",
        title: sections.length > 0 ? "More" : "Menu",
        items: unfiled,
      });
    }
    return groups;
  }, [menuItems, sections]);

  const toggleCuisine = (id: CuisineId) => {
    setRestaurantData((prev) => {
      const current = Array.isArray(prev.cuisine) ? prev.cuisine : [];
      return {
        ...prev,
        cuisine: current.includes(id)
          ? current.filter((c) => c !== id)
          : [...current, id],
      };
    });
  };

  // Load menu items from Supabase
  useEffect(() => {
    const loadMenuItems = async () => {
      if (!user?.id || user?.role !== 'business') return;

      try {
        // Get restaurant ID
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('id, is_open, banner_image, logo_image, subtitle, delivery_time, operating_hours, name, address, cuisine, latitude, longitude')
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

        // Load the hero banner from the database if the business has uploaded one
        if (restaurant.banner_image) {
          setRestaurantData((prev) => ({ ...prev, heroImage: restaurant.banner_image }));
        }

        // Load the store logo from the database if the business has uploaded one
        if (restaurant.logo_image) {
          setRestaurantData((prev) => ({ ...prev, logo: restaurant.logo_image }));
        }

        // Load store info from the database (the business may have edited it on another device)
        setRestaurantData((prev) => ({
          ...prev,
          name: restaurant.name || prev.name,
          address: restaurant.address || prev.address,
          subtitle: restaurant.subtitle || prev.subtitle,
          deliveryTime: restaurant.delivery_time || prev.deliveryTime,
          operatingHours: restaurant.operating_hours || prev.operatingHours,
          cuisine: Array.isArray(restaurant.cuisine)
            ? restaurant.cuisine.filter(isCuisineId)
            : prev.cuisine,
          latitude: restaurant.latitude ?? prev.latitude,
          longitude: restaurant.longitude ?? prev.longitude,
        }));

        // Show the business's real average rating from business_ratings.
        supabaseHelpers.getBusinessRating(user.id).then((ratingRes) => {
          if (ratingRes && ratingRes.average != null) {
            setRestaurantData((prev) => ({
              ...prev,
              rating: Number(ratingRes.average.toFixed(1)),
              ratingCount: ratingRes.count,
            }));
          }
        }).catch((err) => console.error('[BusinessHome] Failed to load rating:', err));

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
            sectionId: item.section_id ?? null,
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

        // Sections are optional: without the ADD_MENU_SECTIONS.sql migration this
        // query fails and the preview simply shows one flat list.
        try {
          const { data: sectionRows, error: sectionError } = await supabase
            .from('menu_sections')
            .select('id, name, sort_order')
            .eq('restaurant_id', restaurant.id)
            .order('sort_order', { ascending: true });
          setSections(sectionError ? [] : sectionRows ?? []);
        } catch {
          setSections([]);
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

  // Load the delivery fee set by the admin (view-only for the business)
  useEffect(() => {
    supabaseHelpers.getAdminDeliveryFee().then(setAdminDeliveryFee);
  }, []);

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
            subtitle: restaurantData.subtitle,
            delivery_time: restaurantData.deliveryTime,
            operating_hours: restaurantData.operatingHours,
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

  // Upload a file with one retry for transient failures (network blips throw out of the helper,
  // so the retry wraps the call in try/catch to catch both thrown and returned errors)
  const uploadWithRetry = async (
    uploadFn: (restaurantId: string, file: File) => Promise<any>,
    restaurantId: string,
    file: File
  ): Promise<string> => {
    let lastError: any = new Error('Unknown upload error');
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await uploadFn(restaurantId, file);
        if (result?.data?.publicUrl) return result.data.publicUrl;
        lastError = result?.error || lastError;
      } catch (err) {
        lastError = err;
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
    throw lastError;
  };

  // Turn storage errors into actionable messages (RLS errors mean the upload policy is missing)
  const describeUploadError = (err: any): string => {
    const message = err?.message || 'Unknown upload error';
    if (/row-level security|RLS|permission denied/i.test(message)) {
      return `${message}. The storage upload policy is missing - run ENSURE_RESTAURANT_STORAGE.sql in the Supabase SQL Editor, then try again.`;
    }
    return message;
  };

  // Upload a new hero banner image and save it to the database
  const handleBannerUpload = async (file: File) => {
    if (!user?.id) return;

    // Validate the file
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPG, PNG, etc.).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Max size is 5MB.');
      return;
    }

    setIsBannerUploading(true);
    try {
      // Find the restaurant record (used for the storage path + DB save)
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('business_user_id', user.id)
        .single();

      const restaurantId = restaurant?.id || user.id;

      // Upload to Supabase Storage (restaurants bucket) with one retry for transient failures
      let publicUrl: string;
      try {
        publicUrl = await uploadWithRetry(supabaseHelpers.uploadRestaurantBanner.bind(supabaseHelpers), restaurantId, file);
      } catch (uploadErr: any) {
        console.error('[BusinessHome] Banner upload failed:', uploadErr);
        alert(`Upload failed: ${describeUploadError(uploadErr)}`);
        return;
      }

      // Update the preview + localStorage immediately
      setRestaurantData((prev) => ({ ...prev, heroImage: publicUrl }));

      // Persist the banner URL to the restaurants table
      if (restaurant) {
        const { error: updateError } = await supabase
          .from('restaurants')
          .update({ banner_image: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', restaurant.id);

        if (updateError) {
          console.error('[BusinessHome] Error saving banner to database:', updateError);
          alert('Banner uploaded but could not be saved to the database. Check the banner_image column exists.');
        } else {
          console.log('[BusinessHome] Banner saved to database ✅');
        }
      } else {
        // No restaurant record yet - create one with the banner
        const { error: insertError } = await supabase
          .from('restaurants')
          .insert([{
            name: restaurantData.name,
            business_user_id: user.id,
            address: restaurantData.address,
            phone: user.phone || '',
            rating: restaurantData.rating,
            is_open: isStoreOpen,
            subtitle: restaurantData.subtitle,
            delivery_time: restaurantData.deliveryTime,
            operating_hours: restaurantData.operatingHours,
            banner_image: publicUrl,
            created_at: new Date().toISOString(),
          }]);

        if (insertError) {
          console.error('[BusinessHome] Error creating restaurant with banner:', insertError);
          alert('Banner uploaded but could not be saved to the database. Check the banner_image column exists.');
        } else {
          console.log('[BusinessHome] Banner saved to database ✅');
        }
      }
    } catch (error: any) {
      console.error('[BusinessHome] Banner upload error:', error);
      alert(`Upload failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsBannerUploading(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = '';
      }
    }
  };

  // Upload a new store logo image and save it to the database
  const handleLogoUpload = async (file: File) => {
    if (!user?.id) return;

    // Validate the file
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPG, PNG, etc.).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Max size is 5MB.');
      return;
    }

    setIsLogoUploading(true);
    try {
      // Find the restaurant record (used for the storage path + DB save)
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('id')
        .eq('business_user_id', user.id)
        .single();

      const restaurantId = restaurant?.id || user.id;

      // Upload to Supabase Storage (restaurants bucket) with one retry for transient failures
      let publicUrl: string;
      try {
        publicUrl = await uploadWithRetry(supabaseHelpers.uploadRestaurantLogo.bind(supabaseHelpers), restaurantId, file);
      } catch (uploadErr: any) {
        console.error('[BusinessHome] Logo upload failed:', uploadErr);
        alert(`Upload failed: ${describeUploadError(uploadErr)}`);
        return;
      }

      // Update the preview + localStorage immediately
      setRestaurantData((prev) => ({ ...prev, logo: publicUrl }));

      // Persist the logo URL to the restaurants table
      if (restaurant) {
        const { error: updateError } = await supabase
          .from('restaurants')
          .update({ logo_image: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', restaurant.id);

        if (updateError) {
          console.error('[BusinessHome] Error saving logo to database:', updateError);
          alert('Logo uploaded but could not be saved to the database. Check the logo_image column exists.');
        } else {
          console.log('[BusinessHome] Logo saved to database ✅');
        }
      } else {
        // No restaurant record yet - create one with the logo
        const { error: insertError } = await supabase
          .from('restaurants')
          .insert([{
            name: restaurantData.name,
            business_user_id: user.id,
            address: restaurantData.address,
            phone: user.phone || '',
            rating: restaurantData.rating,
            is_open: isStoreOpen,
            subtitle: restaurantData.subtitle,
            delivery_time: restaurantData.deliveryTime,
            operating_hours: restaurantData.operatingHours,
            logo_image: publicUrl,
            created_at: new Date().toISOString(),
          }]);

        if (insertError) {
          console.error('[BusinessHome] Error creating restaurant with logo:', insertError);
          alert('Logo uploaded but could not be saved to the database. Check the logo_image column exists.');
        } else {
          console.log('[BusinessHome] Logo saved to database ✅');
        }
      }
    } catch (error: any) {
      console.error('[BusinessHome] Logo upload error:', error);
      alert(`Upload failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsLogoUploading(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  // Save the shop details.
  //
  // This used to write the restaurants row directly, which made the edit modal
  // here and the Pickup Location picker on Edit Profile two separate writers
  // for one row, neither able to see the other's result. It now goes through the
  // shared hook, which also stages the change for Super Admin review.
  const saveStoreInformation = async () => {
    const result = await profile.save({
      name: restaurantData.name,
      subtitle: restaurantData.subtitle,
      address: restaurantData.address,
      delivery_time: restaurantData.deliveryTime,
      operating_hours: restaurantData.operatingHours,
      cuisine: Array.isArray(restaurantData.cuisine) ? restaurantData.cuisine : [],
      latitude: restaurantData.latitude,
      longitude: restaurantData.longitude,
    });

    if (!result.ok) {
      setSaveInfoError(result.error || 'Could not save your shop details.');
      return;
    }

    setSaveInfoError(null);
    setShowEditInfo(false);
    setShowConfirmSaveInfo(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        {/* Header with Preview Toggle */}
        <div className="px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-surface z-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {/* Hamburger Menu - Mobile Only */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
              >
                <Menu className="w-6 h-6 text-[var(--ink)]" />
              </button>
              <div>
                <h1 className="text-3xl font-extrabold text-[var(--ink)]\">My Shop</h1>
                <p className="text-sm text-[var(--muted-foreground)]\">Manage your store</p>
              </div>
            </div>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                previewMode
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] border border-line"
              }`}
            >
              <Eye className="w-4 h-4" />
              {previewMode ? "Exit Preview" : "Preview"}
            </button>
          </div>
        </div>

        {previewMode ? (
          // CUSTOMER PREVIEW MODE
          <div className="bg-[var(--muted)] min-h-screen">
            {/* Preview Header Notice */}
            <div className="bg-[var(--primary-soft)] border-b-2 border-[var(--primary)] px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[var(--primary)]" />
                  <div>
                    <p className="font-bold text-[var(--primary)] text-sm">Customer Preview Mode</p>
                    <p className="text-xs text-[var(--primary)]">This is how customers see your shop</p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewMode(false)}
                  className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold"
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
                  <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center text-3xl shadow-lg overflow-hidden">
                    <StoreLogo logo={restaurantData.logo} emojiClass="text-3xl" />
                  </div>
                </div>

                {/* Store Status Badge */}
                <div className="absolute top-4 right-4">
                  <Badge className={isStoreOpen ? "bg-[var(--success)]" : "bg-[var(--muted-foreground)]"}>
                    {isStoreOpen ? "Open Now" : "Closed"}
                  </Badge>
                </div>
              </div>

              {/* Store Info */}
              <Card className="p-5 border border-line mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-2xl font-bold text-[var(--ink)]">{restaurantData.name}</h2>
                      {restaurantData.verified && (
                        <BadgeCheck className="w-6 h-6 text-[var(--info)] fill-[var(--info)]" />
                      )}
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)] mb-2">{restaurantData.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-[var(--amber)] fill-[var(--amber)]" />
                    <span className="font-semibold text-[var(--ink)]">{restaurantData.rating}</span>
                    <span className="text-[var(--muted-foreground)]">({restaurantData.ratingCount}+)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
                    <Clock className="w-4 h-4" />
                    <span>{restaurantData.deliveryTime}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[var(--muted-foreground)]">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs">{restaurantData.address}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                  <span className="text-sm text-[var(--muted-foreground)]">Delivery Fee</span>
                  <span className="text-xl font-bold text-[var(--primary)]">₱{adminDeliveryFee}</span>
                </div>
              </Card>

              {/* Menu Preview */}
              <Card className="p-5 border border-line">
                <h3 className="font-bold text-[var(--ink)] mb-3">Menu Items</h3>
                
                {menuItems.length > 0 ? (
                  <div className="space-y-5">
                    {menuGroups.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                          {group.title}
                        </h4>
                        {group.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-[var(--muted)] rounded-xl">
                        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-line">
                          <ImageWithFallback
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-[var(--ink)] text-sm truncate">{item.name}</h4>
                          <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">{item.description}</p>
                          <p className="text-base font-bold text-[var(--primary)] mt-1">₱{item.price}</p>
                        </div>
                      </div>
                        ))}
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
                    <Package className="w-12 h-12 text-[var(--border)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--muted-foreground)] mb-3">No menu items yet</p>
                    <Link to="/business/menu">
                      <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary)]">
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
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-[var(--ink)] mb-1">Store Status</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {isStoreOpen ? "✅ Accepting orders" : "🔴 Not accepting orders"}
                  </p>
                </div>
                <button
                  onClick={() => toggleStoreStatus(!isStoreOpen)}
                  className={`w-16 h-9 rounded-full transition-all ${
                    isStoreOpen ? "bg-[var(--success)]" : "bg-[var(--border)]"
                  }`}
                >
                  <div
                    className={`w-7 h-7 bg-surface rounded-full shadow-md transition-transform ${
                      isStoreOpen ? "translate-x-8" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>


            {/* Quick Actions */}
            <div className="px-5 py-4">
              <h3 className="font-bold text-[var(--ink)] mb-3">⚡ Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Link to="/business/menu">
                  <Card className="p-5 text-center border border-line hover:border-[var(--primary)] transition-all active:scale-95 bg-gradient-to-br from-[var(--primary-soft)] to-white">
                    <Package className="w-10 h-10 text-[var(--primary)] mx-auto mb-2" />
                    <p className="font-bold text-[var(--ink)] mb-1">Menu</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Add & edit items</p>
                  </Card>
                </Link>
                <Link to="/business/orders">
                  <Card className="p-5 text-center border border-line hover:border-[var(--info)] transition-all active:scale-95 bg-gradient-to-br from-[var(--info-soft)] to-white">
                    <Clock className="w-10 h-10 text-[var(--info)] mx-auto mb-2" />
                    <p className="font-bold text-[var(--ink)] mb-1">Orders</p>
                    <p className="text-xs text-[var(--muted-foreground)]">Manage orders</p>
                  </Card>
                </Link>
              </div>
            </div>

            {/* Store Appearance Section */}
            <div className="px-5 py-4 border-t-8 border-[var(--muted)]">
              <div className="mb-3">
                <h3 className="font-bold text-[var(--ink)]">🎨 Store Appearance</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  customer view of the store
                </p>
              </div>

              <Button
                onClick={() => {
                  setPreviewMode(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-full min-h-12 mb-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold text-base flex items-center justify-center gap-2"
              >
                <Eye className="w-5 h-5" aria-hidden="true" />
                Preview Store
              </Button>

              {/* Hero Banner Editor */}
              <Card className="p-4 border border-line mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[var(--ink)]">Hero Banner & Logo</p>
                </div>
                <div className="relative h-32 rounded-xl overflow-hidden mb-2">
                  <ImageWithFallback
                    src={restaurantData.heroImage}
                    alt="Banner"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2">
                    <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center text-xl shadow-lg overflow-hidden">
                      <StoreLogo logo={restaurantData.logo} emojiClass="text-xl" />
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
              <Card className="p-4 border border-line">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-[var(--ink)]">Store Information</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted-foreground)]">Name</span>
                    <span className="font-semibold text-[var(--ink)] text-right">{restaurantData.name}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted-foreground)]">Subtitle</span>
                    <span className="font-semibold text-[var(--ink)] text-right">{restaurantData.subtitle}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted-foreground)]">Address</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1 ml-4">{restaurantData.address}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted-foreground)]">Delivery Time</span>
                    <span className="font-semibold text-[var(--ink)]">{restaurantData.deliveryTime}</span>
                  </div>
                  <div className="flex items-start justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted-foreground)]">Delivery Fee</span>
                    <span className="font-semibold text-[var(--primary)]">₱{adminDeliveryFee}</span>
                  </div>
                  <div className="flex items-start justify-between py-2">
                    <span className="text-[var(--muted-foreground)]">Hours</span>
                    <span className="font-semibold text-[var(--ink)]">{restaurantData.operatingHours}</span>
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
            <div className="bg-surface w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-surface border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--ink)]">Edit Banner & Logo</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEditBanner(false)}
                    aria-label="Close"
                    className="p-2 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] active:scale-95 transition-transform"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setShowEditBanner(false)}
                    className="px-4 py-2 bg-[var(--success)] text-white rounded-lg font-semibold active:scale-95 transition-transform flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Done
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Hero Banner Image</label>
                  <div className="h-44 rounded-2xl overflow-hidden mb-3 border border-line">
                    <ImageWithFallback
                      src={restaurantData.heroImage}
                      alt="Banner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={isBannerUploading}
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-sm py-5 disabled:opacity-60"
                  >
                    {isBannerUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Upload New Banner
                      </>
                    )}
                  </Button>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBannerUpload(file);
                    }}
                    className="hidden"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-2 text-center">Recommended: 1200x400px (landscape), max 5MB</p>
                </div>

                <div className="border-t-2 border-[var(--border)] pt-5">
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Store Logo</label>
                  <p className="text-xs text-[var(--muted-foreground)] mb-3">Upload your store logo (square image works best)</p>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 bg-surface border border-line rounded-2xl flex items-center justify-center text-4xl overflow-hidden flex-shrink-0">
                      <StoreLogo logo={restaurantData.logo} emojiClass="text-4xl" />
                    </div>
                    <div className="flex-1">
                      <Button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isLogoUploading}
                        variant="outline"
                        className="w-full text-sm disabled:opacity-60"
                      >
                        {isLogoUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Logo
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-[var(--muted-foreground)] mt-2 text-center">Square image, max 5MB</p>
                    </div>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Info Modal */}
        {profile.hasPending && !showEditInfo && (
          <div className="mx-4 lg:mx-6 mt-4 rounded-2xl border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)] p-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[var(--amber-dark)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--amber-dark)] text-sm">Waiting for Super Admin approval</p>
                <p className="text-sm text-[var(--amber-dark)]/90 mt-0.5 break-words">
                  Your last shop details change is queued. Customers keep seeing the previous ones until it is approved.
                </p>
                <button
                  type="button"
                  onClick={async () => { await profile.withdraw(); }}
                  className="mt-2 min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--amber)] text-[var(--amber-dark)] font-bold text-xs hover:opacity-90 transition-opacity"
                >
                  Withdraw change
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditInfo && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end animate-in slide-in-from-bottom">
            <div className="bg-surface w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-surface border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--ink)]">Edit Store Info</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEditInfo(false)}
                    aria-label="Close"
                    className="p-2 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] active:scale-95 transition-transform"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setShowConfirmSaveInfo(true)}
                    className="px-4 py-2 bg-[var(--success)] text-white rounded-lg font-semibold active:scale-95 transition-transform flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {saveInfoError && (
                  <div className="rounded-xl border-2 border-[var(--error-soft)] bg-[var(--error-soft)] px-3 py-2">
                    <p className="text-sm text-[var(--error)] break-words">{saveInfoError}</p>
                  </div>
                )}

                {profile.hasPending && (
                  <div className="rounded-xl border border-[var(--amber-soft)] bg-[var(--amber-soft)] px-3 py-2">
                    <p className="text-xs text-[var(--amber-dark)] break-words">
                      Saving again replaces the change already waiting for approval.
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Store Name *</label>
                  <input
                    type="text"
                    value={restaurantData.name}
                    onChange={(e) => setRestaurantData({ ...restaurantData, name: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl font-semibold"
                    placeholder="e.g., Mang Inasal"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Subtitle/Branch</label>
                  <input
                    type="text"
                    value={restaurantData.subtitle}
                    onChange={(e) => setRestaurantData({ ...restaurantData, subtitle: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl"
                    placeholder="e.g., Gen T Deleon Center"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Branch location or tagline</p>
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Address *</label>
                  <textarea
                    value={restaurantData.address}
                    onChange={(e) => setRestaurantData({ ...restaurantData, address: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl min-h-[80px]"
                    placeholder="Full address with barangay and city"
                  />
                </div>

                {/* Cuisine is what the customer filters match on. It used to be
                    inferred from menu items, which called any shop selling one
                    chicken dish an "Ihawan" -- only the business knows what it is. */}
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">
                    What we serve
                  </label>
                  <p className="text-xs text-[var(--muted-foreground)] mb-2">
                    Pick everything that describes your shop. Customers filter by this.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CUISINES.map(({ id, label, blurb, Icon }) => {
                      const selected = Array.isArray(restaurantData.cuisine)
                        && restaurantData.cuisine.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selected}
                          title={blurb}
                          onClick={() => toggleCuisine(id)}
                          className={`flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-semibold transition-colors ${
                            selected
                              ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--coral-dark)]'
                              : 'border-line text-[var(--muted-foreground)]'
                          }`}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pinning is the only way "distance to you" can exist: the table
                    held a text address and no coordinates to measure from. */}
                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">
                    Shop location
                  </label>
                  <p className="text-xs text-[var(--muted-foreground)] mb-2">
                    Tap the map to drop a pin on your shop so customers can see how far away you are.
                  </p>
                  <div className="h-56 overflow-hidden rounded-xl border border-line">
                    {isMapsLoaded && (
                      <GoogleMap
                        mapContainerClassName="size-full"
                        center={
                          restaurantData.latitude != null && restaurantData.longitude != null
                            ? { lat: restaurantData.latitude, lng: restaurantData.longitude }
                            : { lat: 14.7294, lng: 120.9349 }
                        }
                        zoom={15}
                        onClick={(e: any) => {
                          const lat = e.latLng?.lat();
                          const lng = e.latLng?.lng();
                          if (typeof lat !== 'number' || typeof lng !== 'number') return;
                          setRestaurantData((prev) => ({
                            ...prev,
                            latitude: lat,
                            longitude: lng,
                          }));
                        }}
                        options={{ disableDefaultUI: true, zoomControl: true }}
                      >
                        {restaurantData.latitude != null && restaurantData.longitude != null && (
                          <MarkerF
                            position={{ lat: restaurantData.latitude, lng: restaurantData.longitude }}
                          />
                        )}
                      </GoogleMap>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    {restaurantData.latitude != null
                      ? `Pinned at ${restaurantData.latitude.toFixed(5)}, ${restaurantData.longitude?.toFixed(5)}`
                      : 'Not pinned yet — your shop will sort last in "near you" lists.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Delivery Time</label>
                    <input
                      type="text"
                      value={restaurantData.deliveryTime}
                      onChange={(e) => setRestaurantData({ ...restaurantData, deliveryTime: e.target.value })}
                      className="w-full p-3 border border-line rounded-xl"
                      placeholder="15-25 min"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Delivery Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">₱</span>
                      <input
                        type="number"
                        value={adminDeliveryFee}
                        disabled
                        className="w-full p-3 pl-7 border border-line rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)] cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">Set by the admin. Contact the admin to change the delivery fee.</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold text-[var(--ink)] mb-2 block">Operating Hours</label>
                  <input
                    type="text"
                    value={restaurantData.operatingHours}
                    onChange={(e) => setRestaurantData({ ...restaurantData, operatingHours: e.target.value })}
                    className="w-full p-3 border border-line rounded-xl"
                    placeholder="8:00 AM - 10:00 PM"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Daily operating hours</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Save Modal */}
        {showConfirmSaveInfo && (
          <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
            <div className="bg-surface p-6 max-w-sm w-full rounded-2xl shadow-xl">
              <div className="w-16 h-16 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-[var(--success)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--ink)] text-center mb-2">Save Changes?</h3>
              <p className="text-[var(--muted-foreground)] text-center mb-6 text-sm">
                Are you sure you want to update your store information?
              </p>
              <div className="space-y-3">
                <button
                  onClick={saveStoreInformation}
                  className="w-full py-3 bg-[var(--success)] text-white font-bold rounded-xl active:scale-95 transition-transform"
                >
                  Yes, Save
                </button>
                <button
                  onClick={() => setShowConfirmSaveInfo(false)}
                  className="w-full py-3 bg-[var(--muted)] text-[var(--muted-foreground)] font-bold rounded-xl active:scale-95 transition-transform"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Success Popup */}
        {showSaveSuccess && (
          <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
            <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
              <div className="w-16 h-16 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-[var(--success)]" />
              </div>
              <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Sent for approval! ✅</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                The Super Admin will review your shop details. Customers see the previous ones until then.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}