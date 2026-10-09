import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Store, Package, TrendingUp, PhilippinePeso, ChevronRight, 
  Users, MessageSquare, BarChart3, Settings, ShoppingBag,
  Clock, Eye, Edit2, Bell, User as UserIcon, Search, Menu, X, Star, Check
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { consumeWelcomeGreeting } from "../../../lib/welcomeGreeting";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import AppHeader from "../ui/AppHeader";
import AppShell from "../ui/AppShell";
import BusinessSidebar from "./BusinessSidebar";
import { AnalyticsLineChart, AnalyticsSparkline } from "../ui/AnalyticsCharts";
import {
  buildSeries,
  RANGE_OPTIONS,
  RANGE_HEADLINE,
  type RangeKey,
} from "@/lib/salesSeries";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";
import { supabaseHelpers } from "@/lib/supabase";
import { useRestaurantProfile } from "@/lib/restaurantProfile";
import { cuisineLabels } from "@/lib/foodTaxonomy";

/**
 * Popular dishes across two rows that scroll as one.
 *
 * The rows are two separate overflow containers rather than one grid, because a
 * grid cannot "fill the first row then continue into the second" -- and that
 * wrapping is the behaviour wanted here: dishes read left to right along the
 * top row, spill onto the bottom row, and the whole set moves sideways as one.
 * Whichever row the finger is on drives the other, so the two never drift
 * apart, and the cards size themselves with a flex basis rather than a fixed
 * grid column, so a narrower phone simply fits fewer per row.
 */
/**
 * Stand-in photo for a dish that has none.
 *
 * The same default the menu editor and the storefront use, so one dish looks the
 * same everywhere in the app. Deliberately not a placeholder.com URL: that
 * service is gone, and pointing at it turned "no photo" into "broken image".
 */
const DEFAULT_MENU_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";

function PopularMenuRows({ items }: { items: any[] }) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const syncing = useRef(false);

  const rowOf = (offset: number) => {
    const rest = items.slice(offset);
    // A row on a phone holds fewer, so the split is measured rather than fixed.
    const perRow = window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 3 : 4;
    return rest.slice(0, perRow);
  };

  // Read the refs inside the handler, not while rendering. A ref is only
  // populated during commit, so capturing `.current` in the render pass binds
  // null and the two rows silently never scroll together -- with no error to
  // notice, because the handler just quietly does nothing.
  const link = (driver: "top" | "bottom") => () => {
    const from = driver === "top" ? topRef.current : bottomRef.current;
    const to = driver === "top" ? bottomRef.current : topRef.current;
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    // Released on the next frame, after the scroll event this caused settles.
    requestAnimationFrame(() => { syncing.current = false; });
  };

  const rowClass =
    "flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const renderCard = (item: any) => (
    <Card
      key={item.id}
      className="w-[46%] shrink-0 snap-start p-3 border border-line bg-surface group transition-colors hover:border-[var(--primary)] sm:w-[30%] lg:w-[23%]"
    >
      <div className="relative mb-3 h-24 overflow-hidden rounded-xl sm:h-28 lg:h-32">
        <ImageWithFallback
          src={item.image}
          alt={item.name}
          className="size-full object-cover transition-transform group-hover:scale-110"
        />
        {item.sold > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
            {item.sold} sold
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="mb-1 truncate text-sm font-bold text-[var(--ink)] lg:text-base">
            {item.name}
          </h3>
          <p className="text-base font-bold text-[var(--primary)] lg:text-lg">₱{item.price}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-[var(--primary)] lg:size-5" />
      </div>
    </Card>
  );

  const top = rowOf(0);
  const bottom = rowOf(top.length);

  return (
    <div className="space-y-1">
      {top.length > 0 && (
        <div
          ref={topRef}
          onScroll={link("top")}
          className={rowClass}
        >
          {top.map(renderCard)}
        </div>
      )}
      {bottom.length > 0 && (
        <div
          ref={bottomRef}
          onScroll={link("bottom")}
          className={rowClass}
        >
          {bottom.map(renderCard)}
        </div>
      )}
    </div>
  );
}

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useRestaurantProfile();
  const profileCuisineLabels = cuisineLabels(profile.restaurant?.cuisine);
  const profileLocation = profile.restaurant;
  const [activeNav, setActiveNav] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    rating: 0,
    ratingCount: 0
  });
  const [popularMenu, setPopularMenu] = useState<any[]>([]);
  /*
   * The orders this shop has, kept raw.
   *
   * The charts used to be pre-bucketed into state by a second set of loops over
   * the same rows, which meant changing the range needed a refetch to re-bucket.
   * Holding the rows and deriving the series means switching Today/Week/Month is a
   * pure recomputation, so the filter responds on the spot.
   */
  const [loadedOrders, setLoadedOrders] = useState<any[]>([]);
  const [range, setRange] = useState<RangeKey>('week');
  const [isLoading, setIsLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const messages: any[] = [];
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeUserName, setWelcomeUserName] = useState('');

  // Show welcome back popup after login
  useEffect(() => {
    // In-memory, not sessionStorage: only a real sign-in arms this, and a reload
    // must not replay it. See welcomeGreeting.ts.
    const name = consumeWelcomeGreeting();
    if (name === null) return;
    setWelcomeUserName(name || 'there');
    const timer = setTimeout(() => setShowWelcomeBack(true), 500);
    const hideTimer = setTimeout(() => setShowWelcomeBack(false), 3000);
    return () => { clearTimeout(timer); clearTimeout(hideTimer); };
  }, []);

  // Load delivery status notifications (driver updates) for this business.
  useEffect(() => {
    if (!user?.id) return;
    const loadNotifications = async () => {
      const { data } = await supabaseHelpers.getDeliveryNotifications(user.id);
      const mapped = (data || []).map((n: any) => ({
        id: n.id,
        // The real type, not a hardcoded 'delivery'. The icon and tint below are
        // chosen by type, and pinning every row to 'delivery' made an order
        // notification render as a delivery one.
        type: n.type || 'delivery',
        title: n.title || 'Delivery update',
        message: n.message || '',
        read: !!n.read,
        time: formatNotificationTime(n.created_at),
        /*
         * Carried through so a notification can be tapped through to its order.
         * These were dropped here, and the row had nothing left to navigate with --
         * which is why tapping a notification did nothing.
         */
        orderId: n.order_id ?? null,
        orderNumber: n.order_number ?? null,
      }));

      /*
       * One row per order, showing its latest state.
       *
       * Every status change writes its own row, so a single order produced a pile of
       * them: "new order received", "preparing", "ready", "on the way", "delivery
       * completed" -- five rows, all about one order, pushing everything else off
       * the panel. The older ones are not information; they are the same order
       * earlier in time, and the detail modal carries the full status workflow.
       *
       * `data` is already ordered created_at desc, so the first row seen for an
       * order is its newest and every later one is superseded.
       *
       * Rows with no order id are always kept. They are system notices, not status
       * updates, and collapsing them by some other key would throw away unrelated
       * messages.
       */
      const seenOrders = new Set<string>();
      setNotifications(
        mapped.filter((n) => {
          if (!n.orderId) return true;
          if (seenOrders.has(n.orderId)) return false;
          seenOrders.add(n.orderId);
          return true;
        }),
      );
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
    // Re-reads when the signed-in user changes, so the totals never outlive the
    // account they were loaded for.
  }, [user?.id]);

  const loadDashboardData = async () => {
    try {
      /*
       * Identity from the auth context, not from `trikeserve_current_user`.
       *
       * That key is in localStorage, which every tab on this origin shares, so it
       * names whoever signed in last anywhere. Re-reading it here meant a
       * business tab could resolve a different account's restaurant and totals
       * the moment another tab signed in, and this screen reported them as
       * "yours". The context user is this tab's own account, and it is also the
       * one `ProtectedRoute` admitted this screen for.
       */
      const currentUser = user;
      if (!currentUser?.id) {
        setIsLoading(false);
        return;
      }

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

      // The header leads with the restaurant's own profile picture, so it has
      // to be fetched here rather than inherited from the customer header.
      const { data: restaurantRow } = await supabase
        .from('restaurants')
        .select('logo_image')
        .eq('id', businessRestaurantId)
        .maybeSingle();
      if (restaurantRow?.logo_image) setRestaurantLogo(restaurantRow.logo_image);

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
          rating,
          ratingCount
        });

        // Held raw; the charts bucket from this on every range change.
        setLoadedOrders(orders);
      }

      // Every menu item, because ranking by what actually sells needs the whole
      // menu to rank, not the first page of it.
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', businessRestaurantId)
        .order('created_at', { ascending: false });

      if (menuItems) {

        // Popular means most ordered, not most recently added. Orders keep
        // their line items as a JSON string, so the counts come from walking
        // them rather than from a column on the item.
        const sold = new Map<string, number>();
        for (const order of orders ?? []) {
          let lines: any[] = [];
          try {
            const raw = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            if (Array.isArray(raw)) lines = raw;
          } catch {
            // A malformed line-item blob costs us this order's counts only.
          }
          for (const line of lines) {
            const id = String(line?.id ?? '');
            if (!id) continue;
            sold.set(id, (sold.get(id) ?? 0) + Number(line?.quantity ?? 1));
          }
        }

        const ranked = [...menuItems]
          .sort((a: any, b: any) => {
            const diff = (sold.get(String(b.id)) ?? 0) - (sold.get(String(a.id)) ?? 0);
            // Ties fall back to newest first so the order is still stable.
            return diff !== 0 ? diff : 0;
          })
          .slice(0, 12);

        setPopularMenu(ranked.map((item: any) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          // image_url, not image. The column is named image_url everywhere else
          // in this app, so reading `image` here always found nothing and every
          // dish fell through to the fallback -- which was via.placeholder.com, a
          // service that has since been shut down, so the cards rendered a broken
          // image glyph even for dishes that do have a photo uploaded.
          image: item.image_url || DEFAULT_MENU_IMAGE,
          sold: sold.get(String(item.id)) ?? 0
        })));
      }

      setIsLoading(false);
    } catch (error) {
      console.error('[BusinessDashboard] Error loading data:', error);
      setIsLoading(false);
    }
  };

  /*
 * The two chart series, derived rather than stored.
 *
 * Both read the same rows and differ only in what they add up — money for sales,
 * one per order for volume — so `buildSeries` takes the measure as a callback and
 * there is one bucketing implementation rather than two that can disagree about
 * where a day ends.
 *
 * Memoised on the range, so switching it is instant and does not refetch.
 */
const salesSeries = useMemo(
  () => buildSeries(loadedOrders, range, (order) => Number(order.total) || 0),
  [loadedOrders, range],
);

const orderSeries = useMemo(
  () => buildSeries(loadedOrders, range, () => 1),
  [loadedOrders, range],
);

/** Both charts read the same window, so one label covers them. */
const rangeHeadline = RANGE_HEADLINE[range];

  /**
   * Change against the previous window, as a badge.
   *
   * Null when there is no previous window to compare — a shop's first day has
   * nothing behind it, and a percentage against zero is not information.
   */
const trend = (series: { changePct: number | null; previousTotal: number | null }) => {
  if (series.changePct == null) return null;
  const up = series.changePct >= 0;
  return {
    up,
    text: `${up ? '+' : ''}${series.changePct.toFixed(0)}%`,
    tone: up ? 'text-[var(--success)] bg-[var(--success-soft)]' : 'text-[var(--error)] bg-[var(--error-soft)]',
  };
};

const salesTrend = trend(salesSeries);
const orderTrend = trend(orderSeries);

  // Check if user is not verified
  if (!user?.isVerified) {
    return (
      <div className="min-h-screen bg-[var(--muted)] flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center border border-line">
          <div className="w-20 h-20 bg-[var(--amber-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-[var(--amber)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--ink)] mb-3">Pending Verification</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            Please visit the TrikeServe Admin Office at Barangay Hall to complete your face-to-face verification.
          </p>
          <div className="bg-[var(--muted)] rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold text-[var(--ink)] mb-2">Required Documents:</p>
            <ul className="text-sm text-[var(--muted-foreground)] space-y-1 text-left">
              <li>• Business Permit</li>
              <li>• Sanitary Permit</li>
              <li>• Valid ID</li>
              <li>• Proof of Address</li>
            </ul>
          </div>
          <Link to="/">
            <button className="w-full py-3 bg-[var(--primary)] text-white font-bold rounded-xl">
              Back to Login
            </button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <BusinessSidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
      {/* Main Content */}
      <div className="flex-1 lg:ml-64 w-full min-w-0">
      <AppShell
      wide
      header={
        <AppHeader
          notificationCount={notifications.filter((n: any) => !n.read).length}
          onNotificationsClick={() => setShowNotifications(true)}
          avatarSrc={restaurantLogo || undefined}
          avatarAlt={restaurantLogo ? "Your restaurant profile" : undefined}
          onMenuClick={() => setIsMobileMenuOpen(true)}
        />
      }
    >
      <div className="space-y-6">
          {/* Range filter. Sits above the charts *and* the period figure, because both
              answer the same question — "how am I doing over what window". */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Overview</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Sales and orders for the range you pick.
              </p>
            </div>
            <div
              role="group"
              aria-label="Chart range"
              className="inline-flex rounded-xl border border-line bg-[var(--muted)] p-1"
            >
              {RANGE_OPTIONS.map((option) => {
                const selected = range === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setRange(option.key)}
                    aria-pressed={selected}
                    className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                      selected
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4 mb-6 lg:mb-8">
            {/* Total Orders */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Total Orders</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.totalOrders}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--primary-soft)] rounded-xl flex shrink-0 items-center justify-center">
                  <ShoppingBag className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--primary)]" />
                </div>
              </div>
              <AnalyticsSparkline
                data={orderSeries.points}
                color="var(--primary)"
                height={32}
              />
            </Card>

            {/* Total Revenue */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Total Revenue</p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">₱{(stats.totalRevenue >= 1000 ? (stats.totalRevenue / 1000).toFixed(1) : stats.totalRevenue.toFixed(0))}{stats.totalRevenue >= 1000 ? 'k' : ''}</h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--amber-soft)] rounded-xl flex shrink-0 items-center justify-center">
                  <PhilippinePeso className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--amber)]" aria-hidden="true" />
                </div>
              </div>
              <AnalyticsSparkline
                data={salesSeries.points}
                color="var(--amber)"
                height={32}
              />
            </Card>

            {/* Earnings — the figure the range filter applies to */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">
                    {rangeHeadline} Earnings
                  </p>
                  <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">
                    ₱{(salesSeries.total >= 1000 ? (salesSeries.total / 1000).toFixed(1) : salesSeries.total.toFixed(0))}
                    {salesSeries.total >= 1000 ? 'k' : ''}
                  </h2>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--info-soft)] rounded-xl flex shrink-0 items-center justify-center">
                  <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--info)]" />
                </div>
              </div>
              <AnalyticsSparkline
                data={salesSeries.points}
                color="var(--info)"
                height={32}
              />
            </Card>

            {/* Rating */}
            <Card className="p-4 lg:p-6 border border-line bg-surface">
              <div className="flex items-start justify-between mb-3 lg:mb-4">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-[var(--muted-foreground)] mb-1">Rating</p>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl lg:text-4xl font-bold text-[var(--ink)]">{stats.rating > 0 ? stats.rating.toFixed(1) : '—'}</h2>
                    <Star className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--amber)] fill-[var(--amber)]" />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">{stats.ratingCount > 0 ? `${stats.ratingCount} rating${stats.ratingCount !== 1 ? 's' : ''}` : 'No ratings yet'}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-[var(--amber-soft)] rounded-xl flex shrink-0 items-center justify-center">
                  <Star className="w-5 h-5 lg:w-6 lg:h-6 text-[var(--amber)]" />
                </div>
              </div>
              {/* Star bar */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-3 h-3 lg:w-4 lg:h-4 ${
                      stats.rating > 0 && star <= Math.round(stats.rating)
                        ? 'text-[var(--amber)] fill-[var(--amber)]'
                        : 'text-[var(--border)] fill-[var(--border)]'
                    }`}
                  />
                ))}
              </div>
            </Card>
          </div>

          {/* What customers actually filter on, and where they think the shop
              is. Both were editable in two other screens and visible in none,
              so a shop that never found them looked broken. */}
          <Card className="p-4 lg:p-6 border border-line bg-surface mb-6 lg:mb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Your shop listing</h2>
              {/* Straight into the editor. This used to link to the Shop page, so tapping
                  Edit on the Overview dropped you on the storefront preview and
                  made you hunt for the edit form yourself. */}
              <Link
                to="/business/home?edit=info"
                className="text-[var(--primary)] font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all"
              >
                Edit
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  What we serve
                </p>
                {profileCuisineLabels.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {profileCuisineLabels.map((label) => (
                      <li
                        key={label}
                        className="rounded-lg bg-[var(--primary-soft)] px-2 py-1 text-xs font-semibold text-[var(--primary)]"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Not set. Customers filtering by food type will not find this shop.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Pickup location
                </p>
                <p className="mt-2 text-sm text-[var(--ink)] break-words">
                  {profileLocation?.address || "No address set"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)] break-words">
                  {profileLocation?.latitude != null && profileLocation?.longitude != null
                    ? `Pinned at ${profileLocation.latitude.toFixed(5)}, ${profileLocation.longitude.toFixed(5)}`
                    : 'Not pinned — this shop sorts last in "near you" lists'}
                </p>
              </div>
            </div>

            {profile.hasPending && (
              <p className="mt-4 rounded-xl border border-[var(--amber-soft)] bg-[var(--amber-soft)] px-3 py-2 text-xs text-[var(--amber-ink)] break-words">
                You have a shop details change waiting for Super Admin approval. The values above are
                what customers see until it is approved.
              </p>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-6 lg:mb-8">
            {/* Popular Menu */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)]">Popular Menu</h2>
                <Link to="/business/menu">
                  <button className="text-[var(--primary)] font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                    View All
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
              {popularMenu.length === 0 ? (
                <Card className="p-12 border-2 border-dashed border-[var(--border)] text-center">
                  <Package className="w-16 h-16 text-[var(--border)] mx-auto mb-4" />
                  <p className="text-[var(--muted-foreground)] text-sm mb-2">No menu items yet</p>
                  <p className="text-[var(--muted-foreground)] text-xs mb-4">Add items to your menu to start selling</p>
                  <Link to="/business/menu">
                    <button className="px-6 py-2 bg-[var(--primary)] text-white font-bold rounded-xl text-sm">
                      ADD MENU ITEMS
                    </button>
                  </Link>
                </Card>
              ) : (
                <PopularMenuRows items={popularMenu} />
              )}
            </div>

            {/* Sales */}
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Sales</h2>
              <Card className="p-5 lg:p-6 border border-line bg-surface">
                <div className="mb-5">
                  <p className="text-sm text-[var(--muted-foreground)] mb-1">{rangeHeadline}</p>
                  <h3 className="text-2xl lg:text-3xl font-bold text-[var(--ink)]">
                    {salesSeries.total >= 1000
                      ? `₱${(salesSeries.total / 1000).toFixed(1)}k`
                      : `₱${salesSeries.total.toFixed(0)}`}
                  </h3>
                </div>

                <AnalyticsLineChart
                  data={salesSeries.points}
                  hoverLabels={salesSeries.points.map((p) => p.fullLabel)}
                  color="var(--primary)"
                  valuePrefix="₱"
                  height={200}
                  emptyHint="Start receiving orders to see your sales trend"
                />

                {/* Real change against the window before this one. Was the
                    literal text "+20%", which never moved whatever the data
                    did. Hidden when there is no previous window to compare. */}
                {salesTrend && (
                  <span className={`mt-4 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${salesTrend.tone}`}>
                    {salesTrend.text} vs previous {range === 'today' ? 'day' : range}
                  </span>
                )}
              </Card>
            </div>
          </div>

          {/* Orders */}
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Orders</h2>
            <Card className="p-5 lg:p-6 border border-line bg-surface">
              <div className="mb-5">
                <p className="text-sm text-[var(--muted-foreground)] mb-1">{rangeHeadline}</p>
                <h3 className="text-2xl lg:text-3xl font-bold text-[var(--ink)]">
                  {orderSeries.count} order{orderSeries.count !== 1 ? 's' : ''}
                </h3>
              </div>

              <AnalyticsLineChart
                data={orderSeries.points}
                hoverLabels={orderSeries.points.map((p) => p.fullLabel)}
                color="var(--info)"
                height={200}
                emptyHint="Start receiving orders to see your order trend"
              />

              {orderTrend && (
                <span className={`mt-4 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${orderTrend.tone}`}>
                  {orderTrend.text} vs previous {range === 'today' ? 'day' : range}
                </span>
              )}
            </Card>
          </div>
        </div>

      {/* Notifications Panel */}
      {showNotifications && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[2000]"
            onClick={() => setShowNotifications(false)}
          />
          <div className="fixed top-0 right-0 h-full w-full lg:w-[400px] bg-surface z-[2001] shadow-2xl overflow-y-auto">
            <div className="p-5 border-b-2 border-[var(--border)] sticky top-0 bg-surface z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--ink)]">Notifications</h2>
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="p-2 hover:bg-[var(--muted)] rounded-xl transition-all"
                >
                  <X className="w-6 h-6 text-[var(--muted-foreground)]" />
                </button>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                {notifications.filter(n => !n.read).length} unread notifications
              </p>
            </div>
            <div className="p-5 space-y-3">
              {notifications.map((notification) => (
                <Card 
                  key={notification.id}
                  className={`p-4 border transition-all cursor-pointer hover:border-[var(--primary)] ${
                    notification.read ? 'border-[var(--border)] bg-surface' : 'border-[var(--border)] bg-surface'
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    notification.orderNumber
                      ? `Open order ${notification.orderNumber}`
                      : 'Open notifications'
                  }
                  onClick={() => {
                    setShowNotifications(false);
                    /*
                     * The orders screen is the business's only order view -- there is
                     * no per-order route -- so "open order details" means going there
                     * with the id attached. The id travels as router state, so a
                     * BusinessOrders that does not read it is unaffected; one that does
                     * can open and highlight that order.
                     */
                    navigate('/business/orders', {
                      state: {
                        focusOrderId: notification.orderId ?? undefined,
                        focusOrderNumber: notification.orderNumber ?? undefined,
                      },
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      notification.type === 'order' || notification.type === 'new_order' ? 'bg-[var(--primary-soft)]' :
                      notification.type === 'delivery' || notification.type === 'delivery_completed' ? 'bg-[var(--success-soft)]' :
                      notification.type === 'system' ? 'bg-[var(--info-soft)]' :
                      'bg-[var(--muted)]'
                    }`}>
                      {(notification.type === 'order' || notification.type === 'new_order') && <ShoppingBag className="w-5 h-5 text-[var(--primary)]" />}
                      {(notification.type === 'delivery' || notification.type === 'delivery_completed') && <Clock className="w-5 h-5 text-[var(--success)]" />}
                      {notification.type === 'system' && <Settings className="w-5 h-5 text-[var(--info)]" />}
                      {notification.type === 'review' && <Star className="w-5 h-5 text-[var(--amber)]" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[var(--ink)]">{notification.title}</h3>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-[var(--primary)] rounded-full mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)] mb-2">{notification.message}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{notification.time}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Welcome Back Popup */}
      {showWelcomeBack && (
        // Tap anywhere to dismiss. It is a greeting, not a decision, so making
        // someone wait out the bar before reaching their dashboard is pure cost.
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
          className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="bg-surface rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[var(--success)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Welcome Back!</h3>
            <p className="text-[var(--muted-foreground)] text-sm">Good to see you again, <span className="font-semibold text-[var(--ink)]">{welcomeUserName}</span></p>
            <div className="mt-6">
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div className="bg-[var(--success)] h-1.5 rounded-full" style={{ width: '100%', animation: 'shrink 2.5s linear forwards' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
      </div>
    </div>
  );
}