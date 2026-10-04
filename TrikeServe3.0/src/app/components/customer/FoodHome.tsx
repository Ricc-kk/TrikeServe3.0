import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  CheckCircle,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

import BottomNav from "../ui/BottomNav";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import tricycleIcon from "../../../assets/0b76d1aa56b8ad6e15dd4efc8a0100b0ca5762a1.png";
import { useAuth } from "../../contexts/AuthContext";
import { useCart } from "../../contexts/CartContext";
import { useFavorites } from "../../contexts/FavoritesContext";
import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurantQueries";
import { cuisineLabels, inferCuisineFromMenu, CUISINES } from "@/lib/foodTaxonomy";
import { formatDistance, haversineMetres, hasCoords } from "@/lib/distance";

import FoodHomeHeader from "./FoodHomeHeader";
import FoodCategoryRail, { type FoodCategoryId } from "./FoodCategoryRail";
import RestaurantCard, { type RestaurantView } from "./RestaurantCard";
import FoodSearchOverlay from "./FoodSearchOverlay";
import DeliveryAddressSheet from "./DeliveryAddressSheet";

const SORT_OPTIONS = [
  { id: "name", label: "Name" },
  { id: "rating", label: "Top rated" },
  { id: "time", label: "Fastest" },
  { id: "distance", label: "Nearest" },
] as const;

type SortId = (typeof SORT_OPTIONS)[number]["id"];

/** Shape the two loaders agree on before it becomes a RestaurantView. */
type RawRestaurant = {
  id: string;
  name: string;
  subtitle: string;
  logo: string;
  image: string;
  time: string;
  rating: number;
  ratingCount: number;
  verified: boolean;
  address: string;
  hasMenu: boolean;
  isOpen: boolean;
  /** Business-declared cuisine, per ADD_RESTAURANT_CUISINE_AND_LOCATION.sql. */
  cuisine: string[];
  latitude: number | null;
  longitude: number | null;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800";

/** "25-35 min" -> 25, so "Fastest" has something numeric to sort on. */
function deliveryMinutes(time: string): number {
  const match = String(time || "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Collapses listings that share a name and address into one entry.
 *
 * Whichever record carries a real image, an address and a delivery time wins,
 * because that is the one that reads as complete; ties fall back to rating.
 */
function dedupeRestaurants(list: RawRestaurant[]): RawRestaurant[] {
  const best = new Map<string, RawRestaurant>();

  const completeness = (r: RawRestaurant) => {
    let score = 0;
    if (r.image && r.image !== FALLBACK_IMAGE) score += 4;
    if (r.address) score += 2;
    if (r.rating > 0) score += 2;
    if (r.isOpen) score += 1;
    // A pinned shop is more useful than an identical unpinned one.
    if (hasCoords({ lat: r.latitude, lng: r.longitude })) score += 3;
    if (r.cuisine?.length) score += 2;
    return score;
  };

  for (const r of list) {
    const key = `${r.name} ${r.address}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const existing = best.get(key);
    if (!existing || completeness(r) > completeness(existing)) {
      best.set(key, r);
    }
  }

  return Array.from(best.values());
}

// TrikeServe Food Delivery Home - Gen T Deleon, Valenzuela
export default function FoodHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getTotalItems } = useCart();
  const { toggleFavorite, isFavorite, getTotalFavorites } = useFavorites();
  const delivery = useDeliveryAddress();

  const [restaurants, setRestaurants] = useState<RawRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuCategories, setMenuCategories] = useState<Record<string, string[]>>({});
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [adminDeliveryFee, setAdminDeliveryFee] = useState<number>(35);

  const [activeCategory, setActiveCategory] = useState<FoodCategoryId>("all");
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortId>("rating");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeUserName, setWelcomeUserName] = useState("");

  const getUnreadNotificationsCount = useCallback(() => {
    try {
      const raw = localStorage.getItem("trikeserve_delivery_notifications");
      if (!raw) return 0;
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((n: any) => !n.read).length : 0;
    } catch {
      return 0;
    }
  }, []);

  /**
   * Fallback categories, for shops that have not declared a cuisine yet.
   *
   * This used to be the *only* source of a shop's category, which is what made
   * "Ihawan" mean "sells one item under chicken". It is now strictly a fallback:
   * a declared `cuisine` always wins, and this only decides where an undeclared
   * shop appears so it does not vanish from every filter.
   */
  const loadMenuCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("restaurant_id, category");
      if (error || !data) return;
      const map: Record<string, string[]> = {};
      for (const row of data as any[]) {
        if (!row.restaurant_id || !row.category) continue;
        (map[row.restaurant_id] ||= []).push(String(row.category).toLowerCase());
      }
      setMenuCategories(map);
    } catch {
      // Categories stay empty; every restaurant remains visible under "All".
    }
  }, []);

  const loadRestaurantsFromSupabase = useCallback(async () => {
    try {
      // Falls back to the legacy columns when the cuisine/location migration has
      // not been applied, so the food list never goes blank because of a schema
      // mismatch.
      const { rows } = await fetchRestaurants();

      if (!rows || rows.length === 0) {
        loadRestaurantsFromLocalStorage();
        return;
      }

      const withRatings = await Promise.all(
        rows.map(async (restaurant) => {
          let rating = restaurant.rating || 0;
          let ratingCount = 0;
          if (restaurant.business_user_id) {
            const res = await supabaseHelpers.getBusinessRating(
              restaurant.business_user_id,
            );
            if (res && res.average != null) {
              rating = Number(Number(res.average).toFixed(1));
              ratingCount = res.count;
            }
          }
          return { ...restaurant, rating, ratingCount };
        }),
      );

      const mapped: RawRestaurant[] = withRatings.map((r: any) => ({
        id: r.id,
        name: r.name || "Restaurant",
        subtitle: r.subtitle || "",
        logo: r.logo_image || "🍽️",
        image: r.banner_image || FALLBACK_IMAGE,
        time: r.delivery_time || "25-35 min",
        rating: Number(r.rating) || 0,
        ratingCount: r.ratingCount || 0,
        verified: true,
        address: r.address || r.subtitle || "Gen T Deleon, Valenzuela",
        hasMenu: true,
        isOpen: r.is_open !== false,
        cuisine: Array.isArray(r.cuisine) ? r.cuisine : [],
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
      }));

      setRestaurants(dedupeRestaurants(mapped));
    } catch (error) {
      console.error("[FoodHome] Error loading from Supabase:", error);
      loadRestaurantsFromLocalStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRestaurantsFromLocalStorage = useCallback(() => {
    try {
      const usersData = localStorage.getItem("trikeserve_users");
      if (!usersData) {
        setRestaurants([]);
        return;
      }
      const users = JSON.parse(usersData);
      const businessUsers = users.filter((u: any) => u.role === "business");

      const mapped: RawRestaurant[] = businessUsers.map((business: any) => {
        const saved = localStorage.getItem(`restaurantData_${business.email}`);
        const restaurantData = saved ? JSON.parse(saved) : {};
        const menuRaw = localStorage.getItem(`menuItems_${business.email}`);
        const menuItems: any[] = menuRaw ? JSON.parse(menuRaw) : [];

        return {
          id: business.email,
          name: restaurantData.name || business.businessName || business.name || "Restaurant",
          subtitle: "",
          logo: restaurantData.logo || "🍽️",
          image: restaurantData.heroImage || FALLBACK_IMAGE,
          time: restaurantData.deliveryTime || "25-35 min",
          rating: Number(restaurantData.rating) || 0,
          ratingCount: Number(restaurantData.ratingCount) || 0,
          verified: Boolean(business.isVerified),
          address: restaurantData.address || business.businessAddress || "Gen T Deleon",
          hasMenu: menuItems.length > 0,
          isOpen: restaurantData.isOpen !== false,
          cuisine: Array.isArray(restaurantData.cuisine) ? restaurantData.cuisine : [],
          latitude: restaurantData.latitude ?? null,
          longitude: restaurantData.longitude ?? null,
        };
      });

      setRestaurants(dedupeRestaurants(mapped));
    } catch (error) {
      console.error("[FoodHome] Error loading from localStorage:", error);
      setRestaurants([]);
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    let count = getUnreadNotificationsCount();
    try {
      const currentUserData = localStorage.getItem("trikeserve_current_user");
      if (currentUserData) {
        const currentUser = JSON.parse(currentUserData);
        if (currentUser?.id) {
          const { data } = await supabaseHelpers.getDeliveryNotifications(currentUser.id);
          count += (data || []).filter((n: any) => !n.read).length;
        }
      }
    } catch {
      // keep the localStorage count
    }
    setUnreadNotifications(count);
  }, [getUnreadNotificationsCount]);

  const loadAll = useCallback(() => {
    setLoading(true);
    loadRestaurantsFromSupabase().finally(() => setLoading(false));
    loadUnreadCount();
  }, [loadRestaurantsFromSupabase, loadUnreadCount]);

  useEffect(() => {
    loadAll();
    loadMenuCategories();
  }, [loadAll, loadMenuCategories]);

  // Refresh so a newly verified business shows up without a manual reload.
  useEffect(() => {
    const interval = setInterval(loadRestaurantsFromSupabase, 15000);
    return () => clearInterval(interval);
  }, [loadRestaurantsFromSupabase]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadRestaurantsFromSupabase();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadRestaurantsFromSupabase]);

  useEffect(() => {
    supabaseHelpers.getAdminDeliveryFee().then(setAdminDeliveryFee);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setIsScrolling(true);
      setShowBackToTop(window.scrollY > 600);
      clearTimeout(timer);
      timer = setTimeout(() => setIsScrolling(false), 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const flag = sessionStorage.getItem("trikeserve_show_welcome");
    const name = sessionStorage.getItem("trikeserve_welcome_name");
    if (flag !== "true") return;
    sessionStorage.removeItem("trikeserve_show_welcome");
    sessionStorage.removeItem("trikeserve_welcome_name");
    setWelcomeUserName(name || "there");
    const show = setTimeout(() => setShowWelcomeBack(true), 500);
    const hide = setTimeout(() => setShowWelcomeBack(false), 3000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  /** Restaurants projected into the card shape, with cuisine and distance. */
  const views: RestaurantView[] = useMemo(() => {
    const origin = delivery.origin;

    return restaurants.map((r) => {
      // Declared cuisine wins; the menu-derived guess is only for shops that
      // have not declared anything yet.
      const declared = cuisineLabels(r.cuisine);
      const inferred = declared.length
        ? declared
        : cuisineLabels(inferCuisineFromMenu(menuCategories[r.id]));

      let distanceLabel: string | null = null;
      if (origin && hasCoords({ lat: r.latitude, lng: r.longitude })) {
        distanceLabel = formatDistance(
          haversineMetres(origin, {
            lat: Number(r.latitude),
            lng: Number(r.longitude),
          }),
        );
      }

      return { ...r, cuisineLabels: inferred, distanceLabel };
    });
  }, [restaurants, menuCategories, delivery.origin]);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<FoodCategoryId, number>> = { all: views.length };
    for (const c of CUISINES) {
      counts[c.id] = views.filter((v) => v.cuisineLabels.includes(c.label)).length;
    }
    return counts;
  }, [views]);

  const results = useMemo(() => {
    const filtered = views.filter((v) => {
      if (minRating > 0 && v.rating < minRating) return false;

      if (activeCategory !== "all") {
        const meta = CUISINES.find((c) => c.id === activeCategory);
        if (!meta || !v.cuisineLabels.includes(meta.label)) return false;
      }

      return true;
    });

    // Nearest needs an origin; without one it falls back to top rated rather
    // than an arbitrary order.
    if (sortBy === "distance" && delivery.origin) {
      return [...filtered].sort((a, b) => {
        if (a.distanceLabel === null) return 1;
        if (b.distanceLabel === null) return -1;
        return a.distanceLabel.localeCompare(b.distanceLabel, undefined, { numeric: true });
      });
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "time") {
        return deliveryMinutes(a.time) - deliveryMinutes(b.time);
      }
      return a.name.localeCompare(b.name);
    });
  }, [views, activeCategory, minRating, sortBy, delivery.origin]);

  const featured = useMemo(
    () =>
      views
        .filter((v) => v.isOpen)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6),
    [views],
  );

  const hasFilters =
    searchQuery.trim() !== "" || activeCategory !== "all" || minRating > 0;
  const cartCount = getTotalItems();

  const clearFilters = () => {
    setSearchQuery("");
    setActiveCategory("all");
    setMinRating(0);
  };

  // A back button on a bottom-nav tab has no history to pop, so fall back to
  // the customer hub rather than leaving the app.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/customer");
  };

  const onToggleFavorite = (restaurant: RestaurantView) => {
    toggleFavorite({
      id: restaurant.id,
      name: restaurant.name,
      image: restaurant.image,
      rating: restaurant.rating,
      reviews: restaurant.ratingCount,
      distance: restaurant.distanceLabel ?? restaurant.address,
      estimatedTime: restaurant.time,
      category: restaurant.cuisineLabels[0] || "restaurant",
      priceRange: `₱${adminDeliveryFee}`,
    });
  };

  const addressLabel = delivery.address
    ? `${delivery.address.label} · ${delivery.address.address}`
    : null;

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <FoodHomeHeader
        userName={user?.name}
        avatarUrl={user?.avatarUrl}
        unreadCount={unreadNotifications}
        favoritesCount={getTotalFavorites()}
        onBack={goBack}
        addressLabel={addressLabel}
        onOpenAddress={() => setShowAddressSheet(true)}
      />

      {/* Search opens a full-page overlay rather than filtering in place, so the
          results never appear above the fold with no search context. */}
      <div className="bg-[var(--ink-solid)] px-4 pb-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 text-left"
          >
            <Search className="size-5 flex-shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-base text-[var(--muted-foreground)]">
              {searchQuery || "Search food or restaurant"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            aria-label="Sort and filter restaurants"
            className="grid size-12 flex-shrink-0 place-items-center rounded-2xl bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5 sm:px-5">
        {/* Category rail */}
        <FoodCategoryRail
          value={activeCategory}
          onChange={setActiveCategory}
          counts={categoryCounts}
        />

        {/* Featured — a manual scroll rail, not an autoplaying carousel, so it
            stays keyboard-reachable and does not move under the reader. */}
        {!hasFilters && featured.length > 0 && (
          <section aria-label="Top rated near you">
            <h2 className="mb-2 text-lg font-bold text-[var(--ink)]">
              Top rated
              <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                Mataas ang rating
              </span>
            </h2>
            <div
              className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5"
              tabIndex={0}
            >
              {featured.map((r) => (
                <Link
                  key={r.id}
                  to={`/customer/restaurant-detail?id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`}
                  className="flex w-44 flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-[var(--surface)] shadow-sm"
                >
                  <div className="relative h-24 w-full">
                    <ImageWithFallback
                      src={r.image}
                      alt={r.name}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 p-2.5">
                    <p className="line-clamp-2 text-sm font-bold leading-tight text-[var(--ink)]">
                      {r.name}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <Star
                        className="size-3 flex-shrink-0 fill-[var(--amber)] text-[var(--amber)]"
                        aria-hidden="true"
                      />
                      {r.rating ? Number(r.rating).toFixed(1) : "New"}
                      <span className="min-w-0 truncate">{r.distanceLabel ?? r.time}</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* List */}
        <section aria-label="Restaurants">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-[var(--ink)]">
              {activeCategory === "all"
                ? "All restaurants"
                : CUISINES.find((c) => c.id === activeCategory)?.label}
              <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                {results.length} · {results.length === 1 ? "tindahan" : "mga tindahan"}
              </span>
            </h2>
            {results.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort by">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={sortBy === opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition-colors ${
                      sortBy === opt.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--coral-dark)]"
                        : "border-line text-[var(--muted-foreground)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && restaurants.length === 0 ? (
            <div role="status" aria-busy="true" aria-live="polite" className="space-y-3">
              <span className="sr-only">Loading restaurants…</span>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-3xl bg-[var(--muted)]" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-[var(--surface)] px-6 py-10 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--muted)]">
                <Store className="size-6 text-[var(--muted-foreground)]" aria-hidden="true" />
              </div>
              <p className="mt-4 text-lg font-bold text-[var(--ink)]">
                {hasFilters ? "No matches" : "No restaurants yet"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {hasFilters
                  ? "Try a different search or filter."
                  : "Verified restaurants in Gen T Deleon will appear here."}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 min-h-11 rounded-xl bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((r) => (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  deliveryFee={adminDeliveryFee}
                  isFavorite={isFavorite(r.id)}
                  onToggleFavorite={() => onToggleFavorite(r)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Floating cluster — kept to one right-hand column so the centred order
          CTAs stay readable, and the list's bottom padding clears the last card. */}
      <div className="fixed bottom-24 right-4 z-[1500] flex flex-col items-end gap-3">
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          >
            <ArrowUp className="size-5 text-[var(--primary)]" aria-hidden="true" />
          </button>
        )}

        <Link
          to="/customer"
          className={`flex items-center justify-center rounded-full bg-[var(--primary)] shadow-xl transition-all ${
            isScrolling ? "gap-2 px-4 py-3" : "size-14"
          }`}
          aria-label="Book a Ride"
        >
          <img
            src={tricycleIcon}
            alt=""
            className={isScrolling ? "size-7" : "size-9"}
          />
          {isScrolling && (
            <span className="whitespace-nowrap text-sm font-bold text-white">
              Book a Ride
            </span>
          )}
        </Link>
      </div>

      {/* Cart summary — appears only when there is something in it */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-[1400] px-4">
          <button
            type="button"
            onClick={() => navigate("/customer/cart")}
            className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between gap-3 rounded-2xl bg-[var(--ink-solid)] px-5 text-white shadow-xl"
          >
            <span className="font-bold">
              {cartCount} {cartCount === 1 ? "item" : "items"} in cart
            </span>
            <span className="rounded-xl bg-[var(--primary)] px-4 py-2 font-bold">
              View cart · Tingnan
            </span>
          </button>
        </div>
      )}

      <BottomNav active="food" />

      {/* Full-page search */}
      {showSearch && (
        <FoodSearchOverlay
          onClose={() => setShowSearch(false)}
          restaurants={views}
          initialQuery={searchQuery}
          onSearchCommitted={setSearchQuery}
        />
      )}

      {/* Delivery address */}
      {showAddressSheet && (
        <DeliveryAddressSheet
          onClose={() => setShowAddressSheet(false)}
          store={delivery}
        />
      )}

      {/* Sort + filter sheet */}
      {showFilters && (
        <div
          className="fixed inset-0 z-[2000] flex items-end bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Sort and filter"
        >
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--ink)]">Sort &amp; filter</h2>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
                className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]"
              >
                <X className="size-5 text-[var(--muted-foreground)]" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
              <div>
                <h3 className="mb-3 text-sm font-bold text-[var(--ink)]">Rating</h3>
                <div className="flex flex-wrap gap-2">
                  {[0, 4, 4.5, 4.8].map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={minRating === r}
                      onClick={() => setMinRating(r)}
                      className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-semibold transition-colors ${
                        minRating === r
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--coral-dark)]"
                          : "border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {r === 0 ? (
                        "Any"
                      ) : (
                        <>
                          <Star
                            className="size-4 fill-[var(--amber)] text-[var(--amber)]"
                            aria-hidden="true"
                          />
                          {r}+
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-[var(--ink)]">Sort by</h3>
                <div className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={sortBy === opt.id}
                      onClick={() => setSortBy(opt.id)}
                      className={`min-h-11 rounded-full border px-4 font-semibold transition-colors ${
                        sortBy === opt.id
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--coral-dark)]"
                          : "border-line text-[var(--muted-foreground)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-[var(--border)] px-5 py-4">
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-12 flex-1 rounded-2xl border border-line bg-[var(--muted)] font-bold text-[var(--ink)]"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="min-h-12 flex-1 rounded-2xl bg-[var(--primary)] font-bold text-[var(--primary-foreground)]"
              >
                Show {results.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome back */}
      {showWelcomeBack && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-8 text-center shadow-xl">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--success-soft)]">
              <CheckCircle className="size-8 text-[var(--success)]" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-[var(--ink)]">Welcome back!</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Good to see you again,{" "}
              <span className="font-semibold text-[var(--ink)]">{welcomeUserName}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}