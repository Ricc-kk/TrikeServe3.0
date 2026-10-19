import { useState, useEffect, useMemo, useRef } from "react";
import { Store, Package, BarChart3, User, Plus, X, Image, Clock, Star, MapPin, BadgeCheck, Eye, EyeOff, Upload, ChevronRight, Settings, Camera, Check, Menu, Loader2, Mail, Phone, Truck, UtensilsCrossed, Wallet } from "lucide-react";
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
import { CUISINES, cuisineLabels, isCuisineId, type CuisineId } from "@/lib/foodTaxonomy";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import {
  DAY_LABELS,
  DAY_NAMES,
  describeClock,
  describeOpenState,
  describeSchedule,
  isEffectivelyOpen,
  isForcedOpen,
  normalizeOpenDays,
  resolveHours,
} from "@/lib/shopHours";

/*
 * Shared by every field in the store-information card while it is being edited.
 *
 * One definition because they are all the same box; they were each spelled out
 * separately in the sheet this replaced, which meant a change to the focus
 * colour or the border was a hunt through eight copies.
 */
const infoField =
  "w-full p-3 border border-line rounded-xl font-semibold outline-none focus:border-[var(--primary)]";
const infoLabel =
  "mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]";

/**
 * Midnight tonight, as an ISO timestamp.
 *
 * The cap on "open now anyway". Built from local components rather than by
 * adding hours to `Date.now()`, because adding 24h from 11pm lands at 11pm
 * tomorrow — which would leave the shop "still open" for a whole extra trading
 * day and read as a bug.
 */
const midnightTonight = (): string => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
};

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
  // own state rather than borrowing the store-information card's.
  const [isSavingPaymentInstructions, setIsSavingPaymentInstructions] = useState(false);
  const [savePaymentInstructionsError, setSavePaymentInstructionsError] = useState<string | null>(null);
  const [paymentInstructionsSaved, setPaymentInstructionsSaved] = useState(false);
  // Address and pin move together, so the full-screen map picker is the only way
  // to edit them. Typing the address on its own produced a text address with no
  // coordinates behind it, which is exactly what "distance to you" needs.
  const [showLocationPicker, setShowLocationPicker] = useState(false);

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
   * The shop details as they were before this editing session began.
   *
   * The store-information fields are edited in place, in the card that displays
   * them, so Cancel has something to put back. Without this it would only close
   * the fields and leave the card showing values nobody ever saved -- and the
   * next Save would publish a change the owner had already backed out of.
   */
  const infoSnapshotRef = useRef<typeof restaurantData | null>(null);

  /*
   * Trading hours.
   *
   * Separate from `restaurantData` because this one saves itself the moment it
   * changes, rather than waiting on the store-information card's Save and its
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
  /*
   * "Open now anyway", as the ISO timestamp it expires at.
   *
   * Held as the timestamp rather than a boolean so the toggle below can say when
   * it ends, and so an override that has lapsed stops counting without anything
   * having to clear it.
   */
  const [forceOpenUntil, setForceOpenUntil] = useState<string | null>(null);
  const [lateOpenError, setLateOpenError] = useState<string | null>(null);
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
        // Trading hours used to be read here, off a select that no longer asks
        // for them -- the columns moved to their own query below. Left in, it was
        // dead code that never ran and read as though the schedule were already
        // loaded when it was not.

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
          .select('open_time, close_time, open_days, force_open_until')
          .eq('id', restaurant.id)
          .maybeSingle()
          .then(({ data: hoursRow }) => {
            if (!hoursRow?.open_time || !hoursRow.close_time) return;
            // `open_days` comes back as strings because the column is TEXT[].
            // Normalised here so the day chips compare numbers to numbers; taken
            // raw, `.includes(day)` never matched and every chip looked unset.
            const days = normalizeOpenDays(hoursRow.open_days);
            setHours({
              openTime: hoursRow.open_time,
              closeTime: hoursRow.close_time,
              days: days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6],
            });
            setForceOpenUntil(hoursRow.force_open_until ?? null);
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

  /*
   * The shop's own fields, seeded once from the shop row.
   *
   * This screen used to build its form entirely out of localStorage, seeded from
   * `user.businessName` the very first time it was ever opened and never looked at
   * again. The shop row -- the one customers are shown, and the one this screen
   * saves to -- was never read back into the form at all, so renaming the shop
   * anywhere else left this screen showing the old name indefinitely, and the
   * next save here silently wrote that stale name back over the real one.
   *
   * So the shop row wins: seeded once when it arrives, and only fields it does not
   * have fall back to the local copy. Seeded rather than tracked, because this form
   * is editable and re-syncing on every change of `restaurant` would overwrite
   * whatever the owner is typing.
   */
  const [shopSeeded, setShopSeeded] = useState(false);
  useEffect(() => {
    if (shopSeeded) return;
    const shop = profile.restaurant;
    if (!shop) return;

    setShopSeeded(true);
    setRestaurantData((prev) => ({
      ...prev,
      // The name is the shop's, full stop. Not `prev.name`: that is the stale
      // localStorage copy this is here to replace.
      name: shop.name || prev.name || "",
      subtitle: shop.subtitle ?? prev.subtitle ?? "",
      address: shop.address || prev.address || "",
      deliveryTime: shop.delivery_time ?? prev.deliveryTime ?? "",
      operatingHours: shop.operating_hours ?? prev.operatingHours ?? "",
      cuisine: Array.isArray(shop.cuisine) && shop.cuisine.length > 0 ? shop.cuisine : prev.cuisine,
      latitude: shop.latitude ?? prev.latitude ?? null,
      longitude: shop.longitude ?? prev.longitude ?? null,
    }));
  }, [profile.restaurant, shopSeeded]);

  // Before the shop row lands, seed from the signed-in profile so the form is
  // usable while the live restaurant record loads. Old browser snapshots are
  // deliberately not read here; the database profile is the source of truth.
  useEffect(() => {
    if (user && !shopSeeded) {
      setRestaurantData((prev) => ({
        ...prev,
        name: user.businessName || user.name || "",
        address: user.businessAddress || "",
      }));
    }
  }, [user, shopSeeded]);

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
        //
        // Switching the shop off ends any "open now anyway" too. The manual
        // switch is meant to be the blunt instrument: turning it off has to
        // close the shop, override or not, or there is no way back from here.
        //
        // The key is omitted rather than set to undefined on purpose — JSON drops
        // undefined, and depending on that to mean "leave this column alone"
        // would be a trap for whoever edits it next.
        const patch: Record<string, unknown> = {
          is_open: newStatus,
          updated_at: new Date().toISOString(),
        };
        if (!newStatus) patch.force_open_until = null;

        const { error } = await supabase
          .from('restaurants')
          .update(patch)
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

  /**
   * Trade past closing time for tonight, without touching the schedule.
   *
   * Capped at midnight local rather than left as an open-ended flag. An override
   * nobody has to remember to clear is how a shop ends up serving at 3am next
   * week; a deadline is compared against the clock on every read, so it lapses
   * by itself and no scheduled job is needed. Midnight also stops an evening
   * override bleeding into the next trading day.
   *
   * Passing no argument ends it early, which is the other half of the promise:
   * the owner can always shut up again from here.
   */
  const toggleLateOpen = async () => {
    if (!user?.id) return;
    const next = forcedOpen ? null : midnightTonight();
    const previous = forceOpenUntil;
    setForceOpenUntil(next);
    setLateOpenError(null);

    const { data: row, error: lookupError } = await supabase
      .from('restaurants')
      .select('id')
      .eq('business_user_id', user.id)
      .maybeSingle();

    if (lookupError) {
      setForceOpenUntil(previous);
      setLateOpenError(lookupError.message);
      return;
    }
    if (!row) {
      // No shop row yet. The Shop screen creates one on first use; nothing to
      // override before then.
      setForceOpenUntil(previous);
      return;
    }

    const { error } = await supabase
      .from('restaurants')
      .update({ force_open_until: next, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (error) {
      // Most likely the migration has not been run: the column is not there to
      // write to. Say so rather than reverting silently, because the switch
      // would otherwise appear to do nothing at all.
      setForceOpenUntil(previous);
      setLateOpenError(
        /column .* does not exist|PGRST204/i.test(error.message)
          ? 'Late opening needs a database update. Run ADD_SHOP_FORCE_OPEN.sql in Supabase.'
          : error.message,
      );
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
  {
    is_open: isStoreOpen,
    open_time: hours.openTime,
    close_time: hours.closeTime,
    open_days: hours.days,
    force_open_until: forceOpenUntil,
  },
  now,
);

/*
 * The Store Status switch, and what it is allowed to control.
 *
 * The switch is the owner's own decision — "I am open for business" — so it is
 * left exactly as they set it. What the screen shows is the *effective* state,
 * which is that switch AND the trading hours AND any "open now anyway", so the
 * toggle turns itself off at closing time and back on at opening without
 * anything being written.
 *
 * Writing `is_open = false` at closing was the obvious alternative and it does
 * not work: something would then have to write it back to true at opening, and
 * that same rule would flip a deliberate "closed for a break" back on a minute
 * later. The two features cancel out, and the owner loses the only control they
 * have. So the hours decide what customers see, the override bends them for
 * tonight, and the switch stays theirs.
 */
const forcedOpen = isForcedOpen({ force_open_until: forceOpenUntil }, now);
const closedByHours = isStoreOpen && !forcedOpen && !storeState.open;
const shownOpen = storeState.open;

/**
 * What the shop says it serves, as one line for the summary card.
 *
 * Labels come from the taxonomy in its own order rather than the order they were
 * ticked, so two shops that both sell "Noodles, Filipino" read identically
 * instead of one of them appearing to have a different set.
 */
const cuisineSummary = cuisineLabels(restaurantData.cuisine).join(", ");

const storeInfoSummary: Array<{
  label: string;
  Icon: typeof Store;
  value: string;
  note?: string;
  tone?: string;
  wide?: boolean;
}> = [
  { label: "Name", Icon: Store, value: restaurantData.name },
  { label: "Address", Icon: MapPin, value: restaurantData.address || "Not set", wide: true },
  { label: "Email", Icon: Mail, value: user?.email || "Not set" },
  { label: "Phone", Icon: Phone, value: user?.phone || "Not set" },
  { label: "Delivery time", Icon: Clock, value: restaurantData.deliveryTime },
  { label: "Delivery fee", Icon: Truck, value: `₱${adminDeliveryFee}`, tone: "text-[var(--primary)]" },
  {
    label: "What we serve",
    Icon: UtensilsCrossed,
    value: cuisineSummary || "Not set",
    note: cuisineSummary ? undefined : "Customers filter shops by this",
    tone: cuisineSummary ? undefined : "text-[var(--muted-foreground)]",
  },
  {
    label: "Opening hours",
    Icon: Clock,
    value: describeSchedule({ open_time: hours.openTime, close_time: hours.closeTime, open_days: hours.days }),
    note: hoursConfigured ? "Closes itself outside these hours" : undefined,
  },
  {
    label: "Map pin",
    Icon: MapPin,
    value: restaurantData.latitude != null
      ? `${restaurantData.latitude.toFixed(5)}, ${restaurantData.longitude?.toFixed(5)}`
      : "Not pinned",
    note: restaurantData.latitude != null ? undefined : 'Your shop sorts last in "near you" lists',
    tone: restaurantData.latitude != null ? undefined : "text-[var(--error)]",
  },
  {
    label: "GCash",
    Icon: Wallet,
    value: restaurantData.paymentInstructions.trim() ? "Instructions set" : "Not set",
    note: restaurantData.paymentInstructions.trim()
      ? "Shown at checkout"
      : "Customers need payment instructions to complete orders",
    tone: restaurantData.paymentInstructions.trim() ? "text-[var(--success-ink)]" : "text-[var(--error)]",
  },
];

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
  // This used to write the restaurants row directly, which made the store-info
  // fields here and the Pickup Location picker on Edit Profile two separate
  // writers for one row, neither able to see the other's result. It now goes
  // through the shared hook, which keeps one writer for both screens.
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
    // The card now shows what was just saved, so there is nothing left to put
    // back if they change their mind and Cancel afterwards.
    infoSnapshotRef.current = null;
    setShowEditInfo(false);
    setShowConfirmSaveInfo(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  /*
   * Turn the store-information fields into inputs, in the card that already
   * displays them, rather than in a sheet over it.
   *
   * The snapshot is taken on the way in and only then: the deep link below fires
   * on every navigation to this route, and re-entering an already open editor
   * must not capture the half-finished values as the thing Cancel restores.
   */
  const openInfoEditor = () => {
    if (!showEditInfo) infoSnapshotRef.current = restaurantData;
    setSaveInfoError(null);
    setShowEditInfo(true);
  };

  /** Close the fields without saving, putting the card back as it was. */
  const cancelInfoEdit = () => {
    if (infoSnapshotRef.current) setRestaurantData(infoSnapshotRef.current);
    infoSnapshotRef.current = null;
    setSaveInfoError(null);
    setShowEditInfo(false);
  };

  // Open the requested editor on arrival. Reading it in an effect rather than
  // initialising state means the query is honoured on every navigation to this
  // route, not only the first mount.
  useEffect(() => {
    if (searchParams.get("edit") === "info") openInfoEditor();
    // openInfoEditor closes over showEditInfo and restaurantData, but re-running
    // on those would reopen the editor on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /*
   * Storefront readiness, for the desktop rail only.
   *
   * Every row is something this screen already edits, and its open() goes to
   * that editor — so the checklist is a way in, not a second copy of the form.
   */
  const setupSteps: { label: string; done: boolean; open: () => void }[] = [
    { label: "Banner photo", done: Boolean(restaurantData.heroImage), open: () => setShowEditBanner(true) },
    { label: "Opening hours", done: hoursConfigured, open: openInfoEditor },
    { label: "Map pin", done: restaurantData.latitude != null, open: () => setShowLocationPicker(true) },
    {
      label: "Cuisine selected",
      done: Array.isArray(restaurantData.cuisine) && restaurantData.cuisine.length > 0,
      open: openInfoEditor,
    },
    { label: "GCash instructions", done: restaurantData.paymentInstructions.trim().length > 0, open: openInfoEditor },
    { label: "Menu items", done: menuItems.length > 0, open: () => navigate("/business/menu") },
  ];
  const setupDone = setupSteps.filter((step) => step.done).length;

  return (
    <div className="min-h-dvh bg-[var(--muted)] flex">
      {/* Sidebar Navigation */}
      <BusinessSidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <div className="@container flex-1 lg:ml-64 w-full min-w-0">
        {/* Header. The Preview toggle used to sit here, opposite the title, so it sat
            in the top-right of every Shop screen doing nothing until tapped —
            while the "Preview Store" quick action below did exactly the same job
            in the place the eye expects it. The preview is entered there and left
            from its own banner. */}
        <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-surface">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
            {/* Hamburger Menu - Mobile Only */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation" className="lg:hidden grid size-11 shrink-0 place-items-center hover:bg-[var(--muted)] rounded-xl transition-all"
            >
              <Menu className="w-6 h-6 text-[var(--ink)]" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">My Shop</h1>
              <p className="text-sm text-[var(--muted-foreground)]">Manage your store</p>
            </div>
          </div>
        </div>

        {previewMode ? (
          // CUSTOMER PREVIEW MODE
          <div className="min-h-screen bg-[var(--muted)] pb-12">
            {/* Preview Header Notice */}
            <div className="border-b-2 border-[var(--primary)] bg-[var(--primary-soft)]">
              <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
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

            {/* Customer View. Constrained to a customer-sized column: this is a
                phone layout, and stretched across a desktop it stops reading as
                the preview of what a customer sees. */}
            <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
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
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {/*
            The phone/tablet stack stays the stack: status, quick actions, then
            the store editor.

            From 2xl up the empty right-hand margin on a wide screen is used by a
            rail that answers the questions the stack leaves open — what the
            shop looks like right now, and what is still unfinished. The rail is
            hidden below 2xl, so tablet and laptop widths keep the full editor width.
          */}
          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] 2xl:items-start">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
              {/* Store Status Toggle */}
              <div className="min-w-0 rounded-3xl border border-line bg-card p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-[var(--ink)] mb-1">Store Status</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {shownOpen ? (
                        "✅ Accepting orders"
                      ) : closedByHours ? (
                        <span className="text-[var(--amber-ink)]">
                          🔴 Closed by your opening hours
                        </span>
                      ) : (
                        <span>🔴 Not accepting orders</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleStoreStatus(!isStoreOpen)}
                    aria-pressed={isStoreOpen}
                    aria-label={
                      shownOpen
                        ? "Turn the shop off"
                        : closedByHours
                          ? "Turn the shop off for the rest of the day"
                          : "Turn the shop on"
                    }
                    className={`w-16 h-9 rounded-full transition-all flex-shrink-0 ${
                      shownOpen ? "bg-[var(--success)]" : "bg-[var(--border)]"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 bg-surface rounded-full shadow-md transition-transform ${
                        shownOpen ? "translate-x-8" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/*
                  Every state gets a reason, because a switch reading "off" that
                  the owner cannot see the cause of is indistinguishable from a
                  bug — and because tapping the switch while the hours have it shut
                  produces no visible change. Saying so first is what stops that
                  looking broken.
                */}
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {shownOpen ? (
                    hoursConfigured ? (
                      <>Within your trading hours.</>
                    ) : (
                      <>
                        No trading hours set, so this switch decides on its own.{" "}
                        <button
                          type="button"
                          onClick={openInfoEditor}
                          className="underline font-semibold text-[var(--primary)]"
                        >
                          Set opening hours
                        </button>
                      </>
                    )
                  ) : closedByHours ? (
                    <>Customers see your shop closed until your hours start again.</>
                  ) : (
                    <>
                      You switched the shop off. Turning it back on here will not open it outside your
                      trading hours.
                    </>
                  )}
                </p>

                {/*
                  Still trading after hours.

                  Without this, a shop open at 11pm with hours that say it shuts at
                  10pm has exactly one way to take a late order: edit the schedule,
                  which silently rewrites what every customer sees from tomorrow on.
                  So this opens the shop for tonight only and leaves the hours
                  exactly as they are.
                */}
                {hoursConfigured && (closedByHours || forcedOpen) && (
                  <div className="mt-3 rounded-xl border border-line bg-[var(--muted)] p-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {forcedOpen ? "Open late" : "Still trading?"}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {forcedOpen
                        ? 'Customers can see you open. Your opening hours are unchanged — this ends at midnight.'
                        : 'Open the shop for tonight without changing your opening hours. It closes again at midnight.'}
                    </p>
                    <Button
                      onClick={toggleLateOpen}
                      className="mt-2 min-h-11 w-full text-sm"
                    >
                      {forcedOpen ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          End late opening
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 mr-2" />
                          Open now anyway
                        </>
                      )}
                    </Button>
                    {lateOpenError && (
                      <p
                        role="alert"
                        className="mt-2 rounded-xl bg-[var(--error-soft)] px-3 py-2 text-xs text-[var(--error)]"
                      >
                        {lateOpenError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="min-w-0 rounded-3xl border border-line bg-card p-5 sm:p-6">
                <h3 className="mb-3 font-bold text-[var(--ink)]">Quick Actions</h3>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <Link to="/business/menu">
                    <Card className="p-5 text-center border border-line hover:border-[var(--primary)] transition-all active:scale-95 rounded-2xl bg-[var(--primary-soft)]">
                      <Package className="w-10 h-10 text-[var(--primary)] mx-auto mb-2" />
                      <p className="font-bold text-[var(--ink)] mb-1">Menu</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Add & edit items</p>
                    </Card>
                  </Link>
                  <Link to="/business/orders">
                    <Card className="p-5 text-center border border-line hover:border-[var(--info)] transition-all active:scale-95 rounded-2xl bg-[var(--info-soft)]">
                      <Clock className="w-10 h-10 text-[var(--info)] mx-auto mb-2" />
                      <p className="font-bold text-[var(--ink)] mb-1">Orders</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Manage orders</p>
                    </Card>
                  </Link>
                </div>
              </div>

              {/* Store Appearance Section */}
              <div className="min-w-0 rounded-3xl border border-line bg-card p-4 md:col-span-2 sm:p-6 lg:p-7">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-bold text-[var(--ink)]">Store Appearance</h3>
                    <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                      What customers see, and the details behind it
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setPreviewMode(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-h-12 w-full bg-[var(--primary)] text-base font-bold text-white hover:bg-[var(--primary)] sm:w-auto sm:min-w-48"
                  >
                    <Eye className="mr-2 h-5 w-5" aria-hidden="true" />
                    Preview Store
                  </Button>
                </div>

                {/* Hero Banner Editor */}
                <Card className="mb-4 min-w-0 border border-line p-4 sm:p-5">
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
                <Card className="min-w-0 border border-line p-4 sm:p-5 lg:p-6">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-[var(--ink)]">Store Information</h4>
                      <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
                        Manage your pickup point, delivery details, and customer-facing settings.
                      </p>
                    </div>
                    {/* Says which mode the card is in, because the way out of
                        editing is now Cancel at the bottom of the card rather than
                        an obvious close control on a sheet over it. */}
                    {showEditInfo && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] bg-[var(--primary-soft)] px-2 py-0.5 rounded-full">
                        Editing
                      </span>
                    )}
                  </div>

                  {showEditInfo && saveInfoError && (
                    <div className="mb-3 rounded-xl border-2 border-[var(--error-soft)] bg-[var(--error-soft)] px-3 py-2">
                      <p className="text-sm text-[var(--error)] break-words">{saveInfoError}</p>
                    </div>
                  )}

                  {showEditInfo ? (
                    /*
                     * The fields, editable in place.
                     *
                     * Group related fields and let the grids open up as the card
                     * gets wider, while keeping a single readable column on phones.
                     */
                    <div className="space-y-6 sm:space-y-7">
                      <section className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Store className="size-4 text-[var(--primary)]" aria-hidden="true" />
                          <h4 className="text-sm font-bold text-[var(--ink)]">Store details</h4>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor="store-name" className={infoLabel}>
                              <Store className="size-4 text-[var(--primary)]" aria-hidden="true" />
                              Name *
                            </label>
                            <input
                              id="store-name"
                              type="text"
                              value={restaurantData.name}
                              onChange={(e) => setRestaurantData({ ...restaurantData, name: e.target.value })}
                              className={infoField}
                              placeholder="e.g., Mang Inasal"
                            />
                          </div>

                          {/* Search or drop a pin rather than typing. A typed address
                              has no coordinates, and without coordinates the shop
                              cannot be measured against a customer, sorted into
                              "near you", or routed to by a driver. */}
                          <div className="md:col-span-2">
                            <span className={infoLabel}>
                              <MapPin className="size-4 text-[var(--primary)]" aria-hidden="true" />
                              Address *
                            </span>
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
                            {/* Read-only pin status, sitting with the address it belongs
                                to rather than in a list of its own. */}
                            <p className="mt-1 text-xs text-[var(--muted-foreground)] flex items-start gap-1.5">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
                              {restaurantData.latitude != null
                                ? `Pinned at ${restaurantData.latitude.toFixed(5)}, ${restaurantData.longitude?.toFixed(5)}`
                                : 'Not pinned yet — your shop will sort last in "near you" lists.'}
                            </p>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-line bg-[var(--muted)]/30 p-4 sm:p-5">
                        <div className="mb-3">
                          <h4 className="text-sm font-bold text-[var(--ink)]">Account contact</h4>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            These details come from your account profile.
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="min-w-0 rounded-xl border border-line bg-surface p-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Email</p>
                            <p className="mt-1 break-all text-sm font-semibold text-[var(--ink)]">{user?.email || "Not set"}</p>
                          </div>
                          <div className="min-w-0 rounded-xl border border-line bg-surface p-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Phone</p>
                            <p className="mt-1 break-words text-sm font-semibold text-[var(--ink)]">{user?.phone || "Not set"}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                          Change these details in Profile.
                        </p>
                      </section>

                      <section className="rounded-2xl border border-line p-4 sm:p-5">
                        <div className="mb-3">
                          <h4 className="text-sm font-bold text-[var(--ink)]">Delivery details</h4>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Set the estimated time customers see at checkout.
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="store-delivery-time" className={infoLabel}>
                              <Clock className="size-4 text-[var(--primary)]" aria-hidden="true" />
                              Delivery Time
                            </label>
                            <input
                              id="store-delivery-time"
                              type="text"
                              value={restaurantData.deliveryTime}
                              onChange={(e) => setRestaurantData({ ...restaurantData, deliveryTime: e.target.value })}
                              className={infoField}
                              placeholder="15-25 min"
                            />
                          </div>

                          <div>
                            <label htmlFor="store-delivery-fee" className={infoLabel}>
                              <Truck className="size-4 text-[var(--primary)]" aria-hidden="true" />
                              Delivery Fee
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">₱</span>
                              <input
                                id="store-delivery-fee"
                                type="number"
                                value={adminDeliveryFee}
                                readOnly
                                className={`${infoField} pl-7 bg-[var(--muted)] text-[var(--muted-foreground)]`}
                              />
                            </div>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                              Set by the admin. Contact the admin to change it.
                            </p>
                          </div>
                        </div>
                      </section>

                      {/*
                        There used to be a free-text "Hours" box here alongside the
                        schedule below. It was not a second view of the same thing —
                        it was a second thing, and a worse one: saveHours rewrites
                        `operating_hours` from the schedule on every change so the
                        two cannot contradict each other, which meant typing here
                        was undone the next time the schedule was touched. Nothing
                        read the typed value either. One source of truth now.
                      */}

                      {/* Cuisine is what the customer filters match on. It used to be
                          inferred from menu items, which called any shop selling one
                          chicken dish an "Ihawan" -- only the business knows what it
                          is. Only in the editing card: the read-only view never
                          listed it, and adding a row of chips to a summary changes
                          what the summary is. */}
                      <section className="rounded-2xl border border-line p-4 sm:p-5">
                        <div className="mb-3">
                          <h4 className="text-sm font-bold text-[var(--ink)]">What we serve</h4>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Pick everything that describes your shop. Customers filter by this.
                          </p>
                        </div>
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
                      </section>

                      {/*
                        A change left over from the old approval queue. Saving
                        above discards it, which matters: an admin applying that
                        stale request later would overwrite these newer details
                        with the older ones.
                      */}
                      {profile.hasPending && (
                        <div className="rounded-xl border border-[var(--amber-soft)] bg-[var(--amber-soft)] px-3 py-2">
                          <p className="text-xs text-[var(--amber-ink)] break-words">
                            You have a change left over from the old approval queue. Save your
                            details to discard it.
                          </p>
                        </div>
                      )}

                      {/*
                       * Opening hours that actually close the shop.

                       * This is the only place hours are set. It used to sit below a
                       * free-text box saying the same thing, which could not say
                       * which days and was quietly overwritten by this schedule
                       * anyway. Pick the days and the window, and the storefront
                       * stops showing the shop as open outside them. Each change
                       * saves on its own, with no Save button and no admin
                       * approval, because a shop that cannot tell a customer it is
                       * closed is the whole problem.
                       */}
                      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                        <section className="rounded-2xl border border-line p-4 sm:p-5">
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
                        </section>

                      {/*
                        GCash instructions, with a Save of their own.

                        Deliberately not part of the Save button below. That one stages
                        the change for Super Admin review, which is right for the name
                        and the address but wrong here: this is the shop's own payment
                        details, and holding them behind an admin queue would block
                        every order in the meantime -- customers reach checkout, read
                        no number, and cannot pay.

                        So it writes straight to the row and says so, both here and in
                        the confirmation.
                      */}
                        <section className="rounded-2xl border border-line p-4 sm:p-5">
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

                          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
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
                        </section>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 2xl:grid-cols-3">
                      {storeInfoSummary.map(({ label, Icon, value, note, tone, wide }) => (
                        <div
                          key={label}
                          className={`min-w-0 rounded-2xl border border-line bg-[var(--muted)]/30 p-3 sm:p-4 ${
                            wide ? "sm:col-span-2 2xl:col-span-3" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                            <Icon className="size-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                            <span>{label}</span>
                          </div>
                          <p className={`mt-2 break-words font-semibold ${tone || "text-[var(--ink)]"} ${label === "Email" ? "break-all" : ""}`}>
                            {value}
                          </p>
                          {note && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{note}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Save and Cancel live at the bottom of the card rather than in
                      a header, because the fields they act on are the card's whole
                      contents now. Save stages the change for Super Admin review, so
                      it is not a plain "Saved" -- the confirmation below says who
                      sees it and when. */}
                  {showEditInfo ? (
                    <div className="mt-6 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
                      <Button
                        onClick={cancelInfoEdit}
                        variant="outline"
                        className="w-full min-h-11 text-sm"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={() => setShowConfirmSaveInfo(true)}
                        className="w-full min-h-11 text-sm"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Save changes
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={openInfoEditor}
                      variant="outline"
                      className="w-full text-sm mt-3"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Edit Information
                    </Button>
                  )}
                </Card>
              </div>
            </div>

          {/* Desktop rail: storefront snapshot and setup checklist. */}
            <aside aria-label="Storefront and setup" className="hidden min-w-0 space-y-5 2xl:sticky 2xl:top-28 2xl:block">
              <section className="overflow-hidden rounded-3xl border border-line bg-card">
                <div className="border-b border-line px-5 py-4">
                  <h3 className="font-bold text-[var(--ink)]">Storefront</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">How your shop appears to customers right now.</p>
                </div>

                <div className="relative h-32">
                  <ImageWithFallback
                    src={restaurantData.heroImage}
                    alt=""
                    className="size-full object-cover"
                  />
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <Badge className={`absolute right-3 top-3 ${shownOpen ? 'bg-[var(--success)]' : 'bg-[var(--muted-foreground)]'} text-white`}>
                    {shownOpen ? 'Open now' : 'Closed'}
                  </Badge>
                  <div className="absolute inset-x-4 bottom-3 flex min-w-0 items-end gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/40 bg-surface shadow-sm">
                      <StoreLogo logo={restaurantData.logo} emojiClass="text-xl" />
                    </span>
                    <div className="min-w-0 pb-0.5">
                      <p className="truncate text-sm font-bold text-white">{restaurantData.name || 'Your shop'}</p>
                      <p className="truncate text-xs text-white/80">{restaurantData.address || 'Add your shop address'}</p>
                    </div>
                  </div>
                </div>

                <dl className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--muted-foreground)]">Rating</dt>
                    <dd className="min-w-0 truncate text-right font-semibold text-[var(--ink)]">
                      {restaurantData.rating > 0
                        ? `${restaurantData.rating.toFixed(1)} · ${restaurantData.ratingCount} reviews`
                        : 'No ratings yet'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="shrink-0 text-[var(--muted-foreground)]">Delivery</dt>
                    <dd className="min-w-0 truncate text-right font-semibold text-[var(--ink)]">
                      {restaurantData.deliveryTime || 'Not set'} · ₱{adminDeliveryFee}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="shrink-0 text-[var(--muted-foreground)]">Hours</dt>
                    <dd className="min-w-0 truncate text-right font-semibold text-[var(--ink)]">
                      {hoursConfigured
                        ? describeSchedule({ open_time: hours.openTime, close_time: hours.closeTime, open_days: hours.days })
                        : 'Always open'}
                    </dd>
                  </div>
                </dl>

                <div className="px-5 pb-5">
                  <Button
                    onClick={() => {
                      setPreviewMode(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    variant="outline"
                    className="flex min-h-11 w-full items-center justify-center gap-2 text-sm"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    Preview as a customer
                  </Button>
                </div>
              </section>

              <section className="rounded-3xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-[var(--ink)]">Finish your store</h3>
                  <span className="text-xs font-bold tabular-nums text-[var(--muted-foreground)]">
                    {setupDone}/{setupSteps.length}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-[var(--success)] transition-all"
                    style={{ width: `${Math.round((setupDone / setupSteps.length) * 100)}%` }}
                  />
                </div>
                <ul className="mt-4 space-y-1">
                  {setupSteps.map((step) => (
                    <li key={step.label}>
                      <button
                        type="button"
                        onClick={step.open}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-[var(--muted)]"
                      >
                        <span
                          aria-hidden="true"
                          className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${step.done ? 'border-[var(--success)] bg-[var(--success)] text-white' : 'border-[var(--border)]'}`}
                        >
                          {step.done && <Check className="size-3" />}
                        </span>
                        <span className={`min-w-0 flex-1 text-sm ${step.done ? 'text-[var(--muted-foreground)]' : 'font-semibold text-[var(--ink)]'}`}>
                          {step.label}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-[var(--border)]" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
          </div>
        )}

        {/* Edit Banner Modal */}
        {showEditBanner && (
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end justify-center sm:items-center sm:p-6 animate-in slide-in-from-bottom">
            <div role="dialog" aria-modal="true" aria-label="Edit banner and logo" className="bg-card w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[85dvh] overflow-y-auto">
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

        {/* Leftover queue entry. Saving no longer stages anything, so this can only be
            a change queued under the old rule -- still worth surfacing, because
            Withdraw is the one way to clear it and an admin applying it would
            revert the shop to the older details. */}
        {profile.hasPending && !showEditInfo && (
          <div className="mx-auto mt-4 w-full max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border-2 border-[var(--amber-soft)] bg-[var(--amber-soft)] p-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[var(--amber-ink)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--amber-ink)] text-sm">A change is still queued from before</p>
                <p className="text-sm text-[var(--amber-ink)] mt-0.5 break-words">
                  Shop details no longer wait for approval — your edits save straight away. This is an
                  older change still sitting in the queue.
                </p>
                <button
                  type="button"
                  onClick={async () => { await profile.withdraw(); }}
                  className="mt-2 min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--amber)] text-[var(--amber-ink)] font-bold text-xs hover:opacity-90 transition-opacity"
                >
                  Discard queued change
                </button>
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
                Your customers see these as soon as you save.
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

        {/* Full-screen map picker. Opened from the address button in the store
          information card; the card stays on screen underneath so cancelling the
          picker leaves the half-finished edit exactly as it was. */}
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
              <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Saved! ✅</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                Your store details are live. Customers see them now.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
