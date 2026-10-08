import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowUp,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { consumeWelcomeGreeting } from "../../../lib/welcomeGreeting";

import { usePreviousPage } from "../../hooks/usePreviousPage";

import BottomNav from "../ui/BottomNav";
import { ImageWithFallback } from "../figma/ImageWithFallback";


import { useCart } from "../../contexts/CartContext";
import { useFavorites } from "../../contexts/FavoritesContext";
import { useDeliveryAddress } from "../../contexts/useDeliveryAddress";
import { supabase } from "../../../utils/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { fetchRestaurants } from "@/lib/restaurantQueries";
import { cuisineLabels, inferCuisineFromMenu } from "@/lib/foodTaxonomy";
import { formatDistance, haversineMetres, hasCoords } from "@/lib/distance";

import FoodHomeHeader from "./FoodHomeHeader";

import RestaurantCard, { type RestaurantView } from "./RestaurantCard";
import FoodSearchOverlay from "./FoodSearchOverlay";

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


/**
 * The scroll position of a rail, drawn as lines instead of a scrollbar.
 *
 * A horizontal scrollbar on a touch screen is either invisible or an ugly grey
 * strip across the card, and it says nothing about where you are. One line per
 * page, the current one wider and filled, reads as "section 2 of 4" without
 * taking a row of the screen.
 */
function RailIndicator({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;

  return (
    <div
      className="mt-3 flex items-center justify-center gap-1.5"
      role="status"
      aria-label={`Page ${page + 1} of ${pages}`}
    >
      {Array.from({ length: pages }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-1 rounded-full transition-all duration-200 ${
            i === page ? "w-6 bg-[var(--success)]" : "w-2.5 bg-[var(--line)]"
          }`}
        />
      ))}
    </div>
  );
}

// TrikeServe Food Delivery Home - Gen T Deleon, Valenzuela
export default function FoodHome() {
  const navigate = useNavigate();
  
  const { getTotalItems } = useCart();
  const { toggleFavorite, isFavorite, getTotalFavorites } = useFavorites();
  const delivery = useDeliveryAddress();

  const [restaurants, setRestaurants] = useState<RawRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuCategories, setMenuCategories] = useState<Record<string, string[]>>({});
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [adminDeliveryFee, setAdminDeliveryFee] = useState<number>(35);

  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortId>("rating");
  const [showFilters, setShowFilters] = useState(false);
  
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  // True once the page has moved past the search bar, so the filter row can
  // take over as the only pinned control.
  const [condensed, setCondensed] = useState(false);
  // Horizontal position of the Top rated rail, in pages, for the line indicator.
  const [featuredPage, setFeaturedPage] = useState(0);
  const [featuredPages, setFeaturedPages] = useState(1);
  const featuredRailRef = useRef<HTMLDivElement | null>(null);
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
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 600);
      setCondensed(window.scrollY > 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    // In-memory, not sessionStorage: only a real sign-in arms this, and a reload
    // must not replay it. See welcomeGreeting.ts.
    const name = consumeWelcomeGreeting();
    if (name === null) return;
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

  const results = useMemo(() => {
    const filtered = views.filter((v) => {
      if (minRating > 0 && v.rating < minRating) return false;

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
  }, [views, minRating, sortBy, delivery.origin]);

  const featured = useMemo(
    () =>
      views
        .filter((v) => v.isOpen)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6),
    [views],
  );

  const hasFilters = searchQuery.trim() !== "" || minRating > 0;
  const cartCount = getTotalItems();

  const clearFilters = () => {
    setSearchQuery("");
    setMinRating(0);
  };

  // Back means "wherever I came from", which is not always the hub: this
  // screen is reached from the home feed, from search and from the address
  // flow, and hardcoding the hub dropped people out of the flow they were
  // standing in. The fallback is only for the case where there is genuinely
  // nothing to pop, which is what a cold deep link looks like.
  const goBack = usePreviousPage("/customer");

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

  // The address, and nothing else. It used to lead with the place's own
  // label ("My address · 257, Tagalag Road…"), but the label only means
  // something inside the address list — out here it is a prefix restating what
  // the next screen already says, and it eats the width the address itself
  // needs. On this bar the address is the headline.
  // Falls back to the device position through the hook, so the food header and the
  // search header cannot name two different destinations for the same order.
  const addressLabel = delivery.address?.address ?? null;

  /**
   * What is narrowing the list right now, shown beside the filter icon.
   *
   * The filter sheet is where filters get set; this row is where you can see
   * what you already set without reopening it, which is the whole point once
   * the sheet is a tap away rather than the page's primary control.
   */
  /**
   * What is narrowing the list right now, shown as chips beside the filter.
   *
   * The filter sheet is where filters get set; these are how you see what you
   * already set without reopening it, which is the whole point once the sheet
   * is a tap away rather than the page's primary control.
   */
  const activeFilterChips = [
    {
      key: "sort",
      label: "Sort",
      value: SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? "Top rated",
    },
    ...(minRating > 0 ? [{ key: "rating", label: "Rating", value: `${minRating}+` }] : []),
  ];

  /**
   * How many Top rated cards fit across the rail.
   *
   * A fixed `grid-rows-2` put one card in each row when only two restaurants
   * existed, which read as a broken layout rather than a deliberate one. The
   * rail now asks the DOM how many fit, and stays on a single row until the
   * first one is genuinely full.
   */
  const [perRow, setPerRow] = useState(0);

  const measurePerRow = () => {
    const rail = featuredRailRef.current;
    if (!rail) return;

    const styles = window.getComputedStyle(rail);
    const gap = parseFloat(styles.columnGap || "0") || 0;
    const padding = parseFloat(styles.paddingLeft || "0") || 0;
    const cardWidth = parseFloat(styles.gridAutoColumns || "0") || 0;
    if (!cardWidth) return;

    const usable = rail.clientWidth - padding;
    setPerRow(Math.max(1, Math.floor((usable + gap) / (cardWidth + gap))));
  };

  // One row until there are more cards than fit; only then use the second row.
  const featuredRows = perRow > 0 && featured.length > perRow ? 2 : 1;

  /**
   * Track which page of the Top rated rail is on screen.
   *
   * Measured from the rail's own scroll offset rather than the window's, so it
   * stays correct when the rail is resized or the restaurant count changes.
   */
  const onFeaturedScroll = () => {
    const rail = featuredRailRef.current;
    if (!rail) return;

    // One "page" is however far the rail moves under snap scrolling.
    const pageWidth = rail.clientWidth - 32;
    const pages = Math.max(1, Math.ceil(rail.scrollWidth / pageWidth));

    setFeaturedPages(pages);
    setFeaturedPage(
      Math.min(pages - 1, Math.max(0, Math.round(rail.scrollLeft / pageWidth))),
    );
  };

  // Measure on mount and resize so the indicator is correct before the first
  // scroll rather than appearing only once the rail has been touched.
  useEffect(() => {
    onFeaturedScroll();
    measurePerRow();
    window.addEventListener("resize", onFeaturedScroll);
    window.addEventListener("resize", measurePerRow);
    return () => {
      window.removeEventListener("resize", onFeaturedScroll);
      window.removeEventListener("resize", measurePerRow);
    };
  }, [featured.length]);

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24">
      <FoodHomeHeader
        unreadCount={unreadNotifications}
        favoritesCount={getTotalFavorites()}
        onBack={goBack}
        addressLabel={addressLabel}
        onOpenAddress={() => navigate("/customer/delivery-address")}
      />

      {/* Search opens a full-page overlay rather than filtering in place, so the
          results never appear above the fold with no search context.

          The block pins to the top of the page. At rest it is just the centred
          search field straddling the dark header. Once the page scrolls, the
          dark header has gone by, so this becomes its own white bar carrying
          everything needed mid-scroll: where the food is going, how to search,
          and the filter — the four controls, on a surface of their own rather
          than floating over the list with no edge under it. */}
      <div
        className={`sticky top-0 z-[900] px-3 sm:px-5 ${
          condensed
            ? "border-b border-line bg-[var(--surface)] py-2 shadow-sm"
            : ""
        }`}
      >
        <div className="mx-auto max-w-3xl">
          {condensed ? (
            /* Three rows, not one. Back, a two-line address, a search field and
               a filter icon on a single 390px line leaves the address about
               60px, which is worse than useless — it is the one thing on this
               bar that needs to be readable. Stacked, each control gets the
               width it deserves.

               The filter sits under the search field rather than beside the
               address: it belongs to the list, not to the address, and giving
               it its own line is what makes room for the chips beside it.

               Notifications and favourites are deliberately absent: they are
               destinations, not controls for what is already on screen. */
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Back"
                  className="grid size-10 flex-shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--ink)] transition-colors hover:bg-[var(--border)]"
                >
                  <ChevronRight className="size-5 rotate-180" aria-hidden="true" />
                </button>

                {/* Same two-line "Your location" shape as the dark header, so
                    the fact does not change shape as the bar swaps. */}
                <button
                  type="button"
                  onClick={() => navigate("/customer/delivery-address")}
                  aria-label={`Deliver to ${addressLabel || "no address set"}. Change delivery address`}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Deliver to
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">
                      {addressLabel || "Add delivery address"}
                    </span>
                    <ChevronDown
                      className="size-4 flex-shrink-0 text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>

              {/* Literal colours, not tokens: this field is white in both
                  themes now that it sits on a light bar, so --ink would flip to
                  cream in dark mode and put cream on white. */}
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-[#d6d3ca] bg-white px-4 text-left transition-colors hover:brightness-[0.98]"
              >
                <Search className="size-4 flex-shrink-0 text-[#5c6b68]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-[#122724]">
                  {searchQuery || "Search food or restaurant"}
                </span>
              </button>

              {/* Filter, then whatever is currently narrowing the list. The
                  chip rail scrolls sideways rather than wrapping, so the bar
                  keeps a fixed height however many filters are active — a
                  wrapping rail would push the list down every time a filter was
                  added. `scroll-smooth` because a filtered list is short and
                  the rail can be flung sideways. */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  aria-label="Sort and filter restaurants"
                  className="grid size-9 flex-shrink-0 place-items-center rounded-full border border-line text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                </button>

                <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setShowFilters(true)}
                      className="flex min-h-9 flex-shrink-0 snap-start items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--border)]"
                    >
                      <span className="text-[var(--muted-foreground)]">{chip.label}</span>
                      <span className="max-w-[9rem] truncate">{chip.value}</span>
                    </button>
                  ))}

                  {activeFilterChips.length === 0 && (
                    <span className="self-center text-xs text-[var(--muted-foreground)]">
                      No filters applied
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* -mt-6 is half the field height (min-h-12 = 48px), so the field
                straddles the bottom edge of the dark header instead of
                sitting under it, the way the reference shows. It is negative
                space rather than an overlay, so the header keeps its full
                height and the field still scrolls away with the page. */
            <div className="-mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="flex min-h-12 w-full max-w-xl items-center gap-2 rounded-lg border border-line bg-white px-5 text-left shadow-lg transition-colors hover:brightness-[0.98]"
              >
                <Search
                  className="size-5 flex-shrink-0 text-[var(--muted-foreground)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-base text-[var(--ink)]">
                  {searchQuery || "Search food or restaurant"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5 sm:px-5">
        {/* Featured — two compact rows that scroll sideways as one page, so a
            customer sees more than four shops without leaving the screen. Logo
            and name only: everything else is already on the card below. */}
        {!hasFilters && featured.length > 0 && (
          <section aria-label="Most loved near you">
            <h2 className="mb-2 text-lg font-bold text-[var(--ink)]">
              Most Loved
            </h2>
            <div
              ref={featuredRailRef}
              onScroll={onFeaturedScroll}
              className={`-mx-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[4rem] gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden ${
                featuredRows === 2 ? "grid-rows-2" : "grid-rows-1"
              }`}
              tabIndex={0}
            >
              {featured.map((r) => (
                <Link
                  key={r.id}
                  to={`/customer/restaurant-detail?id=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}`}
                  className="flex snap-start flex-col items-center gap-1.5"
                >
                  <div className="size-16 overflow-hidden rounded-xl">
                    <ImageWithFallback
                      src={r.image}
                      alt={r.name}
                      className="size-full object-cover"
                    />
                  </div>
                  {/* `w-16` matches the `size-16` picture above it, so the name can never run
                      wider than the photo it labels. Left to the rail column it
                      was free to spread to 127px and the tile stopped reading as
                      one object. `line-clamp-2` still caps it at two lines. */}
                  <p className="line-clamp-2 w-16 text-center text-xs font-bold leading-tight text-[var(--ink)]">
                    {r.name}
                  </p>
                </Link>
              ))}
            </div>

            <RailIndicator page={featuredPage} pages={featuredPages} />
          </section>
        )}

        {/* List */}
        <section aria-label="Restaurants">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-[var(--ink)]">
              All restaurants
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

      {/* Back to top only. The floating "Book a Ride" tricycle button that used
          to sit here is gone: it duplicated the app bar's job and covered the
          right-hand edge of the restaurant cards while scrolling, which is the
          one thing a food list cannot afford. The button below is the whole
          cluster now, so the wrapper only carries positioning. */}
      {showBackToTop && (
        <div className="fixed bottom-24 right-4 z-[1500]">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          >
            <ArrowUp className="size-5 text-[var(--primary)]" aria-hidden="true" />
          </button>
        </div>
      )}

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

      {/* Food has no tab of its own any more, so the Home tab is what covers
          this screen — tapping it returns to the hub. */}
      <BottomNav active="home" />

      {/* Full-page search */}
      {showSearch && (
        <FoodSearchOverlay
          onClose={() => setShowSearch(false)}
          restaurants={views}
          initialQuery={searchQuery}
          onSearchCommitted={setSearchQuery}
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
        // Tap anywhere to dismiss — a greeting shouldn't hold up the menu.
        <div
          onClick={() => setShowWelcomeBack(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowWelcomeBack(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Welcome message. Tap to close."
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 cursor-pointer"
        >
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