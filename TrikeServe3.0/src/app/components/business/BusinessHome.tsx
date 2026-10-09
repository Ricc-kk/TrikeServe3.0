import { useState, useEffect, useMemo, useRef } from "react";
import { Store, Package, BarChart3, User, Plus, X, Image, Clock, Star, MapPin, BadgeCheck, Eye, EyeOff, Upload, ChevronRight, Settings, Camera, Check, Menu, Loader2, Mail, Phone } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import StoreLogo from "../figma/StoreLogo";
import BusinessSidebar from "./BusinessSidebar";
import BusinessMapSelector from "./BusinessMapSelector";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { CUISINES, isCuisineId, type CuisineId } from "@/lib/foodTaxonomy";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import {
  DAY_LABELS,
  DAY_NAMES,
  describeClock,
  describeOpenState,
  describeSchedule,
  isEffectivelyOpen,
  resolveHours,
} from "@/lib/shopHours";

export default function BusinessHome() {
  const navigate = useNavigate();
  // Lets another screen deep-link straight into a particular editor, which is
  // how "Edit" on the Overview reaches the store-info form instead of dumping
  // the owner on the storefront preview to look for it.
  const [searchParams] = useSearchParams();
  const { user, updateProfile } = useAuth();
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
  // The GCash instructions save on their own, immediately, and so carry their
  // own state rather than borrowing the shop-details modal's.
  const [isSavingPaymentInstructions, setIsSavingPaymentInstructions] = useState(false);
  const [savePaymentInstructionsError, setSavePaymentInstructionsError] = useState<string | null>(null);
  const [paymentInstructionsSaved, setPaymentInstructionsSaved] = useState(false);
  // Address and pin move together, so the full-screen map picker is the only way
  // to edit them. Typing the address on its own produced a text address with no
  // coordinates behind it, which is exactly what "distance to you" needs.
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Open the requested editor on arrival. Reading it in an effect rather than
  // initialising state means the query is honoured on every navigation to this
  // route, not only the first mount.
  useEffect(() => {
    if (searchParams.get("edit") === "info") setShowEditInfo(true);
  }, [searchParams]);

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
    longitude: null as number | null,
    /**
     * How to pay, in the shop's own words: which GCash number, under whose name,
     * what to put in the reference. Shown verbatim at checkout, above the proof
     * upload, because this is the text the customer is reading while they decide
     * where to send money.
     *
     * Saved straight to the row rather than staged for Super Admin review: it is
     * the shop's own payment details, it cannot affect any other shop, and making
     * a customer wait for an admin to publish a GCash number would block every
     * order in the meantime.
     */
    paymentInstructions: ""
  });

  /*
   * Trading hours.
   *
   * Separate from `restaurantData` because this one saves itself the moment it
   * changes, rather than waiting on the shop-details form's Save and its
   * Super Admin review. Hours are not a claim about the shop that a platform
   * needs to vet — they are the owner saying when their own door is open — and
   * holding them in a queue means customers keep ordering from a shop that has
   * been shut since 10pm.
   */
  const [hours, setHours] = useState({
    openTime: '08:00',
    closeTime: '22:00',
    days: [0, 1, 2, 3, 4, 5, 6] as number[],
  });
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
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
        if (restaurant.open_time && restaurant.close_time) {
          setHours({
            openTime: restaurant.open_time,
            closeTime: restaurant.close_time,
            days:
              Array.isArray(restaurant.open_days) && restaurant.open_days.length > 0
                ? restaurant.open_days
                : [0, 1, 2, 3, 4, 5, 6],
          });
        }

        /*
         * Trading hours, read on their own rather than folded into the select
         * above.
         *
         * PostgREST rejects a whole SELECT that names a column the project does
         * not have, so putting `open_time` up there would take the shop's name,
         * address, hours and map pin down with it on any database where
         * ADD_SHOP_HOURS.sql has not been run — which is every database until
         * someone runs it. A failure here costs the owner their schedule and
         * nothing else.
         */
        supabase
          .from('restaurants')
          .select('open_time, close_time, open_days')
          .eq('id', restaurant.id)
          .maybeSingle()
          .then(({ data: hoursRow }) => {
            if (!hoursRow?.open_time || !hoursRow.close_time) return;
            setHours({
              openTime: hoursRow.open_time,
              closeTime: hoursRow.close_time,
              days:
                Array.isArray(hoursRow.open_days) && hoursRow.open_days.length > 0
                  ? hoursRow.open_days
                  : [0, 1, 2, 3, 4, 5, 6],
            });
          })
          .catch(() => {
            // Migration not applied yet. The editor keeps its defaults and says so
            // when the owner tries to save.
          });

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

        /*
         * The GCash instructions, read on their own.
         *
         * Deliberately a second query rather than one more column on the select
         * above. PostgREST rejects a whole select that names a column the project
         * does not have, so putting `payment_instructions` there meant that until
         * ADD_ORDER_PAYMENT_AND_DELIVERY_PROOF.sql had been run, this screen lost
         * the shop's name, address, hours and map pin too -- one optional column
         * taking down every other field on the page.
         *
         * `?? prev` rather than `|| prev`, so a shop that deliberately clears the
         * field is not given their old instructions back on the next load.
         */
        supabaseHelpers
          .getPaymentInstructions(restaurant.id)
          .then((res) => {
            if (res.error) {
              console.warn('[BusinessHome] Payment instructions unavailable:', res.error);
              return;
            }
            setRestaurantData((prev) => ({
              ...prev,
              paymentInstructions: res.instructions ?? '',
            }));
          })
          .catch((err) =>
            console.warn('[BusinessHome] Failed to load payment instructions:', err),
          );

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
            payment_instructions: restaurantData.paymentInstructions,
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
            payment_instructions: restaurantData.paymentInstructions,
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

        /*
         * The store logo and the owner's profile photo are the same image, so keep
         * the profile in step when the logo is changed here.
         *
         * Goes through `updateProfile` rather than a direct `users` write, for the
         * reason EditProfileScreen documents: a bare write leaves AuthContext.user
         * and the localStorage cache holding the old photo, so the account header
         * would keep showing the previous image until a reload.
         *
         * Best effort and deliberately not awaited into the success path -- the logo
         * is already saved and on screen, so a failure here must not turn a
         * successful logo change into an error.
         */
        void updateProfile({ avatarUrl: publicUrl });
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
            payment_instructions: restaurantData.paymentInstructions,
            logo_image: publicUrl,
            created_at: new Date().toISOString(),
          }]);

        if (insertError) {
          console.error('[BusinessHome] Error creating restaurant with logo:', insertError);
          alert('Logo uploaded but could not be saved to the database. Check the logo_image column exists.');
        } else {
          console.log('[BusinessHome] Logo saved to database ✅');
        }

        // Same profile sync as the update branch above -- a store being set up for
        // the first time needs it just as much as an existing store.
        void updateProfile({ avatarUrl: publicUrl });
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

  /*
 * Save the GCash instructions on their own.
 *
 * Writes the row directly rather than going through `profile.save`, which stages
 * a change for Super Admin review. That queue exists for the fields that describe
 * the shop to the public -- its name, where it is, what it serves -- because a
 * wrong value there misleads customers about a business the platform vouches for.
 * A GCash number is none of those things: it is this shop's own account, it
 * affects nobody else's listing, and a customer who cannot read it at checkout
 * cannot pay, so every order stalls until an admin gets to it.
 */
const savePaymentInstructions = async () => {
  if (!user?.id) return;

  setIsSavingPaymentInstructions(true);
  setSavePaymentInstructionsError(null);

  try {
    // Always looked up by owner rather than carried in state: the shop row is
    // identified by `business_user_id`, and the other writers on this screen
    // look it up the same way, so a cached id here would be a second source that
    // can disagree after the shop row is recreated.
    const { data: row, error: lookupError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('business_user_id', user.id)
      .maybeSingle();

    if (lookupError) {
      setSavePaymentInstructionsError(lookupError.message);
      return;
    }

    const restaurantId = row?.id;

    if (!restaurantId) {
      setSavePaymentInstructionsError('No shop is linked to this account yet.');
      return;
    }

    const { error: updateError } = await supabase
      .from('restaurants')
      .update({
        // Trimmed, but an emptied field is written as an empty string rather than
        // null so clearing it actually clears it -- the next load reads this back
        // with `??`, which would keep a null and put the old text on screen again.
        payment_instructions: restaurantData.paymentInstructions.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId);

    if (updateError) {
      setSavePaymentInstructionsError(updateError.message);
      return;
    }

    setPaymentInstructionsSaved(true);
    setTimeout(() => setPaymentInstructionsSaved(false), 2500);
  } catch (error) {
    console.error('[BusinessHome] Failed to save payment instructions:', error);
    setSavePaymentInstructionsError('Could not save your payment instructions.');
  } finally {
    setIsSavingPaymentInstructions(false);
  }
};

/*
 * Save the trading hours, immediately.
 *
 * Straight to the row, unlike the shop details above which stage for Super Admin
 * review. Hours are the owner stating when their own door is open: they affect
 * nobody else's listing, and an admin queue here means customers keep ordering
 * from a shop that shut hours ago.
 *
 * Also writes `is_open` so the storefront's own simple check agrees with the
 * hours the moment the owner saves them. `isEffectivelyOpen` on the customer
 * side is what keeps it honest after that, when the shop does not come back to
 * this screen to close itself.
 */
const saveHours = async (next: {
  openTime: string;
  closeTime: string;
  days: number[];
}) => {
  setHoursError(null);

  if (!user?.id) return;

  if (next.days.length === 0) {
    setHoursError('Pick at least one day, or clear the schedule to leave the shop always open.');
    return;
  }
  if (next.openTime === next.closeTime) {
    setHoursError('Opening and closing times cannot be the same.');
    return;
  }

  setIsSavingHours(true);

  try {
    let restaurantId: string | null = null;

    const { data: row, error: lookupError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('business_user_id', user.id)
      .maybeSingle();

    if (lookupError) {
      setHoursError(lookupError.message);
      return;
    }
    restaurantId = row?.id ?? null;

    if (!restaurantId) {
      setHoursError('No shop is linked to this account yet.');
      return;
    }

    const { error: updateError } = await supabase
      .from('restaurants')
      .update({
        open_time: next.openTime,
        close_time: next.closeTime,
        open_days: next.days,
        // The plain-text field the storefront shows, kept in step so it cannot
        // contradict the schedule that is actually enforced.
        operating_hours: `${describeClock(next.openTime)} - ${describeClock(next.closeTime)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId);

    if (updateError) {
      // The most likely cause is the migration not having been run, in which
      // case the columns simply are not there to write to.
      const missingColumns =
        updateError.code === 'PGRST204' || /column .* does not exist/i.test(updateError.message);
      setHoursError(
        missingColumns
          ? 'Opening hours need a database update. Run ADD_SHOP_HOURS.sql in Supabase.'
          : updateError.message,
      );
      return;
    }

    setRestaurantData((prev) => ({
      ...prev,
      operatingHours: `${describeClock(next.openTime)} - ${describeClock(next.closeTime)}`,
    }));

    setHoursSaved(true);
    setTimeout(() => setHoursSaved(false), 2000);
  } catch (error) {
    console.error('[BusinessHome] Failed to save opening hours:', error);
    setHoursError('Could not save your opening hours.');
  } finally {
    setIsSavingHours(false);
  }
};

/** Change one field and persist the whole schedule. */
const updateHours = (patch: Partial<{ openTime: string; closeTime: string; days: number[] }>) => {
  const next = { ...hours, ...patch };
  setHours(next);
  void saveHours(next);
};

const toggleHoursDay = (day: number) => {
  const days = hours.days.includes(day)
    ? hours.days.filter((d) => d !== day)
    : [...hours.days, day].sort((a, b) => a - b);
  updateHours({ days });
};

/*
 * The shop's *effective* state, not its switch.
 *
 * Recomputed on a timer because time passes: a shop that closes at 10pm has to
 * become closed at 10pm without anyone opening this screen. A minute is coarse
 * enough to be free and fine enough that "Open Now" never sits there visibly
 * wrong for long.
 */
const [now, setNow] = useState(() => new Date());
useEffect(() => {
  const tick = setInterval(() => setNow(new Date()), 60000);
  return () => clearInterval(tick);
}, []);

const hoursConfigured = resolveHours({
  open_time: hours.openTime,
  close_time: hours.closeTime,
  open_days: hours.days,
}).configured;

const storeState = describeOpenState(
  { is_open: isStoreOpen, open_time: hours.openTime, close_time: hours.closeTime, open_days: hours.days },
  now,
);

/** Back to "always open", i.e. the shop's manual switch decides again. */
const clearHours = () => {
  setHours({ openTime: '08:00', closeTime: '22:00', days: [0, 1, 2, 3, 4, 5, 6] });

  if (!user?.id) return;

  void supabase
    .from('restaurants')
    .update({ open_time: null, close_time: null, open_days: [] })
    .eq('business_user_id', user.id)
    .then(({ error }) => {
      if (error) {
        setHoursError(
          /column .* does not exist|PGRST204/i.test(error.message)
            ? 'Opening hours need a database update. Run ADD_SHOP_HOURS.sql in Supabase.'
            : error.message,
        );
      }
    });
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
        {/* Header. The Preview toggle used to sit here, opposite the title, so it sat
            in the top-right of every Shop screen doing nothing until tapped —
            while the "Preview Store" quick action below did exactly the same job
            in the place the eye expects it. The preview is entered there and left
            from its own banner. */}
        <div className="px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-surface z-50">
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
                  className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  {/* An open eye to leave the preview with. The banner is about
                      seeing as a customer, so the way out is the eye closing —
                      a bare word next to an open eye on the left read as two
                      unrelated labels. */}
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
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
                  <Badge className={storeState.open ? "bg-[var(--success)]" : "bg-[var(--muted-foreground)]"}>
                    {storeState.open ? "Open Now" : "Closed"}
                  </Badge>
                  {/* Why it is closed, when it is. With hours set the switch
                      alone does not decide, and a bare "Closed" on a shop that
                      plainly opened an hour ago reads as a bug. */}
                  {hoursConfigured && !storeState.open && (
                    <span className="mt-1 max-w-[190px] text-right text-[10px] leading-tight text-white/85">
                      {storeState.detail}
                    </span>
                  )}
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
                  {/* Icon per row. These are the three a shop owner scans for —
                      how customers reach it, where to reach it, and where it
                      sits — and they were three identical grey words. */}
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <Store className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Name</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{restaurantData.name}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <MapPin className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Address</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{restaurantData.address}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <Mail className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Email</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1 break-all">{user?.email}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <Phone className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Phone</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{user?.phone}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <BadgeCheck className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Subtitle</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{restaurantData.subtitle}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <Clock className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Delivery Time</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{restaurantData.deliveryTime}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b border-[var(--border)]">
                    <span className="w-4 flex-shrink-0" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Delivery Fee</span>
                    <span className="font-semibold text-[var(--primary)] text-right flex-1">₱{adminDeliveryFee}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2">
                    <Clock className="w-4 h-4 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-[var(--muted-foreground)] w-24 flex-shrink-0">Hours</span>
                    <span className="font-semibold text-[var(--ink)] text-right flex-1">{restaurantData.operatingHours}</span>
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
              <Clock className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--amber-ink)] text-sm">Waiting for Super Admin approval</p>
                <p className="text-sm text-[var(--amber-ink)] mt-0.5 break-words">
                  Your last shop details change is queued. Customers keep seeing the previous ones until it is approved.
                </p>
                <button
                  type="button"
                  onClick={async () => { await profile.withdraw(); }}
                  className="mt-2 min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--amber)] text-[var(--amber-ink)] font-bold text-xs hover:opacity-90 transition-opacity"
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
                    <p className="text-xs text-[var(--amber-ink)] break-words">
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
                  {/* Search or drop a pin rather than typing. A typed address
                      has no coordinates, and without coordinates the shop
                      cannot be measured against a customer, sorted into
                      "near you", or routed to by a driver. */}
                  <button
                    type="button"
                    onClick={() => setShowLocationPicker(true)}
                    className="w-full flex items-start gap-3 text-left p-3 border border-line rounded-xl hover:border-[var(--primary)] transition-colors"
                  >
                    <MapPin className="w-5 h-5 text-[var(--primary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      {restaurantData.address ? (
                        <span className="block text-sm font-semibold text-[var(--ink)] break-words">
                          {restaurantData.address}
                        </span>
                      ) : (
                        <span className="block text-sm font-semibold text-[var(--ink)]">
                          Pin your shop location
                        </span>
                      )}
                      <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">
                        Search for it, or tap the map to drop a pin
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[var(--primary)] flex-shrink-0">
                      {restaurantData.address ? "Change" : "Set"}
                    </span>
                  </button>
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

                {/* Read-only pin status. Editing moved up to the address button above, so
                    the address and its coordinates can no longer drift apart
                    the way a text box and an inline map let them. */}
                <div>
                  <p className="text-xs text-[var(--muted-foreground)] flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
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
                {/*
                 * Opening hours that actually close the shop.
                 *
                 * The field above is free text nothing reads — it cannot say
                 * which days, and nothing compared it against the clock. These
                 * controls do: pick the days and the window, and the storefront
                 * stops showing the shop as open outside them. Each change saves
                 * on its own, with no Save button and no admin approval, because a
                 * shop that cannot tell a customer it is closed is the whole
                 * problem.
                 */}
                <div className="rounded-2xl border-2 border-line p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-bold text-[var(--ink)]">Opening hours</p>
                    {isSavingHours ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-[var(--primary)]" aria-hidden="true" />
                    ) : hoursSaved ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--success-ink)]">
                        <Check className="size-3.5" aria-hidden="true" />
                        Saved
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-3">
                    Your shop closes itself outside these hours. Changes save straight
                    away — no approval needed.
                  </p>

                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5">
                    Trading days
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {/* Week order, Monday first — the order the days actually
                        happen in. DAY_LABELS is indexed from Sunday, so the list
                        is [1..6, 0] rather than 0..6. */}
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                      const on = hours.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleHoursDay(day)}
                          aria-pressed={on}
                          aria-label={DAY_NAMES[day]}
                          title={DAY_NAMES[day]}
                          className={`min-w-11 rounded-xl border-2 px-2 py-2 text-xs font-bold transition-colors ${
                            on
                              ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                              : 'border-line text-[var(--muted-foreground)]'
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="shop-open-time"
                        className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block"
                      >
                        Opens
                      </label>
                      <input
                        id="shop-open-time"
                        type="time"
                        value={hours.openTime}
                        onChange={(e) => updateHours({ openTime: e.target.value })}
                        className="w-full p-3 border border-line rounded-xl outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="shop-close-time"
                        className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 block"
                      >
                        Closes
                      </label>
                      <input
                        id="shop-close-time"
                        type="time"
                        value={hours.closeTime}
                        onChange={(e) => updateHours({ closeTime: e.target.value })}
                        className="w-full p-3 border border-line rounded-xl outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* The overnight case is worth saying out loud: a shop open
                      6PM to 2AM is a real thing, and "the close time looks wrong"
                      is the obvious misreading of the two inputs above. */}
                  {hours.closeTime <= hours.openTime && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--info)]">
                      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      Closes after midnight — you are trading past {describeClock(hours.openTime).split(' ')[1]}.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={clearHours}
                    className="mt-3 text-xs font-semibold text-[var(--muted-foreground)] underline"
                  >
                    Always open (remove the schedule)
                  </button>

                  {hoursError && (
                    <p
                      role="alert"
                      className="mt-2 rounded-xl bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]"
                    >
                      {hoursError}
                    </p>
                  )}
                </div>

                {/*
                  GCash instructions, with a Save of their own.

                  Deliberately not part of the Save button above. That one stages
                  the change for Super Admin review, which is right for the name
                  and the address but wrong here: this is the shop's own payment
                  details, and holding them behind an admin queue would block
                  every order in the meantime -- customers reach checkout, read
                  no number, and cannot pay.

                  So it writes straight to the row and says so, both here and in
                  the confirmation.
                */}
                <div className="rounded-2xl border-2 border-dashed border-line p-4">
                  <label
                    htmlFor="payment-instructions"
                    className="text-sm font-bold text-[var(--ink)] mb-2 block"
                  >
                    GCash payment instructions
                  </label>
                  <textarea
                    id="payment-instructions"
                    value={restaurantData.paymentInstructions}
                    onChange={(e) =>
                      setRestaurantData({ ...restaurantData, paymentInstructions: e.target.value })
                    }
                    rows={4}
                    className="w-full p-3 border border-line rounded-xl resize-y"
                    placeholder={'GCash number: 0917 123 4567\nName: Juan Dela Cruz\nSend the exact amount and put your order number as the reference.'}
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Shown word for word at checkout, above the payment proof
                    upload. Customers transfer the food amount by GCash and pay the
                    delivery fee in cash to the rider.
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      onClick={savePaymentInstructions}
                      disabled={isSavingPaymentInstructions}
                      className="text-sm disabled:opacity-60"
                    >
                      {isSavingPaymentInstructions ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Save instructions
                        </>
                      )}
                    </Button>
                    {paymentInstructionsSaved && (
                      <p className="text-xs font-semibold text-[var(--success-ink)]">
                        Saved. Customers see this at checkout.
                      </p>
                    )}
                  </div>

                  {savePaymentInstructionsError && (
                    <p
                      role="alert"
                      className="mt-2 rounded-xl bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]"
                    >
                      {savePaymentInstructionsError}
                    </p>
                  )}
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

        {/* Full-screen map picker. Opened from the address button above; the
          edit modal stays mounted underneath so cancelling the picker leaves
          the half-finished edit exactly as it was. */}
      {showLocationPicker && (
        <BusinessMapSelector
          currentAddress={restaurantData.address || ""}
          initialLat={restaurantData.latitude}
          initialLng={restaurantData.longitude}
          onClose={() => setShowLocationPicker(false)}
          onSelectLocation={(location) => {
            setRestaurantData((prev) => ({
              ...prev,
              address: location.full || location.name,
              latitude: location.lat,
              longitude: location.lng,
            }));
            setShowLocationPicker(false);
            setSaveInfoError(null);
          }}
        />
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