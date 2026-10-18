import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle, Clock3, RefreshCw, Store, TrendingUp, Package, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { TerminalIconGlyph } from "../ui/TerminalIcon";
import { Card } from "../ui/card";
import {
  AnalyticsBarChart,
  AnalyticsDonutChart,
  type BarDatum,
  type DonutDatum,
} from "../ui/AnalyticsCharts";
import { supabase } from "../../../utils/supabase";

interface RideRow {
  driver_id?: string | null;
  driver_name?: string | null;
  amount?: number | string | null;
  ride_type?: string | null;
  pickup_location?: string | null;
  status?: string | null;
}

interface OrderRow {
  restaurant_name?: string | null;
  restaurant_email?: string | null;
  total?: number | string | null;
  status?: string | null;
  created_at?: string | null;
}

// Literal class strings so Tailwind can statically pick up the arbitrary values.
const TONE_CLASSES = {
  primary: { bg: "bg-[var(--primary-soft)]", text: "text-[var(--primary)]" },
  info: { bg: "bg-[var(--info-soft)]", text: "text-[var(--info)]" },
  success: { bg: "bg-[var(--success-soft)]", text: "text-[var(--success-ink)]" },
  violet: { bg: "bg-[var(--violet-soft)]", text: "text-[var(--violet)]" },
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card className="min-w-0 gap-0 rounded-2xl border-line bg-card p-4 sm:p-5">
      <span className={`mb-4 grid size-9 shrink-0 place-items-center rounded-xl ${TONE_CLASSES[tone].bg}`}>
        <Icon className={`size-[18px] ${TONE_CLASSES[tone].text}`} aria-hidden="true" />
      </span>
      <p className="break-all text-2xl font-extrabold leading-none tracking-tight text-[var(--ink)] tabular-nums sm:text-3xl">{value}</p>
      <h3 className="mt-2 text-xs font-semibold leading-relaxed text-[var(--muted-foreground)] sm:text-sm">{label}</h3>
    </Card>
  );
}

function RankingCard({ title, description, data, tone, loading, currency = false }: {
  title: string;
  description: string;
  data: BarDatum[];
  tone: "info" | "violet";
  loading: boolean;
  currency?: boolean;
}) {
  const max = Math.max(...data.map(item => item.value), 1);
  return (
    <Card className="min-w-0 gap-5 rounded-3xl border-line bg-card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[var(--ink)]">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        </div>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${TONE_CLASSES[tone].bg} ${TONE_CLASSES[tone].text}`}>Top 6</span>
      </div>
      {loading ? (
        <div role="status" aria-label={`Loading ${title}`} className="space-y-4 py-2">
          {[1, 2, 3].map(item => <div key={item} className="h-12 animate-pulse rounded-xl bg-soft" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="grid min-h-52 place-content-center justify-items-center gap-3 text-center">
          <BarChart3 className="size-9 text-[var(--muted-foreground)]" aria-hidden="true" />
          <p className="text-sm font-bold text-[var(--ink)]">No activity yet</p>
          <p className="max-w-xs text-xs text-[var(--muted-foreground)]">{currency ? "Businesses will appear here when orders are placed." : "Drivers will appear here after their first completed ride."}</p>
        </div>
      ) : (
        <ol className="space-y-5">
          {data.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-start gap-3">
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums ${index === 0 ? `${TONE_CLASSES[tone].bg} ${TONE_CLASSES[tone].text}` : "bg-soft text-[var(--muted-foreground)]"}`}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words text-sm font-bold text-[var(--ink)]">{item.label}</span>
                  <span className="text-xs font-bold text-[var(--muted-foreground)] tabular-nums">{currency ? `₱${item.value.toLocaleString("en-PH")}` : `${item.value.toLocaleString()} ${item.value === 1 ? "ride" : "rides"}`}</span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-soft">
                  <div className={`h-full rounded-full ${tone === "info" ? "bg-[var(--info)]" : "bg-[var(--violet)]"}`} style={{ width: `${Math.max(0, item.value / max * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Super Admin analytics: how drivers are performing (completed rides) and how
 * partner businesses are performing (non-cancelled orders). Reads the platform-wide
 * tables directly, so it works for the Super Admin regardless of terminal scope.
 */
export default function AdminAnalytics({ compact = false, refreshToken = 0 }: { compact?: boolean; refreshToken?: number } = {}) {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [ridesRes, ordersRes] = await Promise.all([
          supabase
            .from("ride_requests")
            .select("*")
            .eq("status", "completed"),
          supabase.from("orders").select("*"),
        ]);
        if (!active) return;
        if (ridesRes.error || ordersRes.error) {
          setLoadError('Performance data could not be loaded. Refresh to try again.');
        }
        setRides((ridesRes.data as RideRow[]) || []);
        // Canceled orders shouldn't count toward business performance.
        setOrders(((ordersRes.data as OrderRow[]) || []).filter((o) => o.status !== "cancelled"));
        if (!ridesRes.error && !ordersRes.error) setLastUpdated(new Date());
      } catch (error) {
        console.error("[AdminAnalytics] Failed to load analytics:", error);
        if (active) setLoadError('Performance data could not be loaded. Refresh to try again.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshToken, reload]);

  // ---- Driver performance -------------------------------------------------

  const driverStats = useMemo(() => {
    const map = new Map<string, { name: string; trips: number; earnings: number }>();
    rides.forEach((ride) => {
      const key = ride.driver_id || ride.driver_name || "unassigned";
      const entry = map.get(key) || { name: ride.driver_name || "Driver", trips: 0, earnings: 0 };
      entry.trips += 1;
      entry.earnings += Number(ride.amount) || 0;
      if (ride.driver_name) entry.name = ride.driver_name;
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [rides]);

  const topDrivers = useMemo<BarDatum[]>(
    () =>
      [...driverStats]
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 6)
        .map((d) => ({ label: d.name, value: d.trips })),
    [driverStats]
  );

  const rideTypeDonut = useMemo<DonutDatum[]>(() => {
    let privateCount = 0;
    let shareCount = 0;
    let deliveryCount = 0;
    rides.forEach((ride) => {
      const type = (ride.ride_type || "").toLowerCase();
      const isDelivery =
        type === "delivery" || String(ride.pickup_location || "").startsWith("DELIVERY|");
      if (isDelivery) deliveryCount += 1;
      else if (type === "share" || type === "shared") shareCount += 1;
      else privateCount += 1;
    });
    return [
      { label: "Private Ride", value: privateCount, color: "var(--success)" },
      { label: "Share Ride", value: shareCount, color: "var(--amber)" },
      { label: "Delivery", value: deliveryCount, color: "var(--info)" },
    ];
  }, [rides]);

  const totalTrips = rides.length;
  const activeDrivers = driverStats.filter((d) => d.trips > 0).length;
  const totalDriverEarnings = driverStats.reduce((sum, d) => sum + d.earnings, 0);
  const avgPerTrip = totalTrips > 0 ? totalDriverEarnings / totalTrips : 0;

  // ---- Business performance ----------------------------------------------

  const businessStats = useMemo(() => {
    const map = new Map<string, { name: string; orders: number; revenue: number }>();
    orders.forEach((order) => {
      const key = order.restaurant_name || order.restaurant_email || "Unknown business";
      const entry = map.get(key) || { name: key, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += Number(order.total) || 0;
      map.set(key, entry);
    });
    return Array.from(map.values());
  }, [orders]);

  const topBusinesses = useMemo<BarDatum[]>(
    () =>
      [...businessStats]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6)
        .map((b) => ({ label: b.name, value: Math.round(b.revenue) })),
    [businessStats]
  );

  const ordersPerDay = useMemo<BarDatum[]>(() => {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const out: BarDatum[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const count = orders.filter((order) => {
        const created = new Date(order.created_at || 0);
        return created >= date && created < nextDate;
      }).length;
      out.push({ label: labels[date.getDay()], value: count });
    }
    return out;
  }, [orders]);

  const totalOrders = orders.length;
  const grossRevenue = businessStats.reduce((sum, b) => sum + b.revenue, 0);
  const avgOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;

  const peso = (value: number) =>
    `₱${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`;

  if (compact) {
    const metrics = [
      { label: "Completed rides", value: String(totalTrips) },
      { label: "Orders", value: String(totalOrders) },
      { label: "Driver earnings", value: peso(totalDriverEarnings) },
      { label: "Order value", value: peso(grossRevenue) },
    ];

    return (
      <section aria-labelledby="overview-performance-title" className="@container min-w-0 space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" aria-busy={isLoading}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="overview-performance-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Platform performance</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">All-time totals · Cancelled orders excluded</p>
          </div>
          <Link to="/admin/analytics" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[var(--teal)] transition-colors hover:bg-[var(--teal-soft)] sm:text-sm">
            View analytics <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {loadError ? (
          <div role="alert" className="rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-5 text-sm text-[var(--amber-ink)]">{loadError}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 @min-[35rem]:grid-cols-4">
              {metrics.map(metric => (
                <div key={metric.label} className="min-w-0 rounded-xl bg-soft p-3 sm:p-4">
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{metric.label}</p>
                  <p className="mt-2 break-words text-xl font-extrabold text-[var(--ink)] tabular-nums">{isLoading ? "—" : metric.value}</p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 @min-[38rem]:grid-cols-2">
              <Card className="min-w-0 gap-5 rounded-2xl border-line bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ink)]">Order activity</h3>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Orders placed over the last 7 days</p>
                  </div>
                  <span className="rounded-lg bg-[var(--primary-soft)] px-2 py-1 text-[11px] font-bold text-[var(--coral-dark)]">Last 7 days</span>
                </div>
                {isLoading ? (
                  <div role="status" aria-label="Loading order activity" className="h-52 animate-pulse rounded-xl bg-soft" />
                ) : (
                  <div role="img" aria-label={`Orders in the last 7 days: ${ordersPerDay.map(day => `${day.label} ${day.value}`).join(', ')}`}>
                    <AnalyticsBarChart data={ordersPerDay} color="var(--primary)" height={190} emptyHint="No orders in the last 7 days" />
                  </div>
                )}
              </Card>

              <Card className="min-w-0 gap-5 rounded-2xl border-line bg-card p-4 sm:p-5">
                <div>
                  <h3 className="text-base font-bold text-[var(--ink)]">Service mix</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">Completed rides by service type</p>
                </div>
                {isLoading ? (
                  <div role="status" aria-label="Loading service mix" className="h-52 animate-pulse rounded-xl bg-soft" />
                ) : (
                  <div role="img" aria-label={rideTypeDonut.map(service => `${service.label}: ${service.value}`).join(', ')}>
                    <AnalyticsDonutChart data={rideTypeDonut} centerLabel="Completed" centerValue={String(totalTrips)} emptyHint="No completed rides yet" />
                  </div>
                )}
                {!isLoading && <p className="mt-auto border-t border-line pt-3 text-xs text-[var(--muted-foreground)]">{activeDrivers} {activeDrivers === 1 ? "driver has" : "drivers have"} completed rides.</p>}
              </Card>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-6 sm:space-y-8">
      <section aria-labelledby="analytics-summary-title" className="relative isolate overflow-hidden rounded-3xl bg-[var(--ink-solid)] p-5 text-white sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 size-80 rounded-full border-[3rem] border-white/5" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mint)] sm:text-xs">TrikeServe · Platform insights</p>
            <h2 id="analytics-summary-title" className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">See what moves your community.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">Explore driver activity, business performance, and the services your community uses.</p>
          </div>
          <div className="shrink-0 space-y-2 sm:text-right">
            <button type="button" disabled={isLoading} onClick={() => setReload(value => value + 1)} aria-label="Refresh analytics" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60">
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
              {isLoading ? "Refreshing…" : "Refresh data"}
            </button>
            <p role="status" className="flex items-center gap-1.5 text-xs text-white/70 sm:justify-end">
              <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
              {isLoading ? "Loading platform data…" : loadError ? "Update unavailable" : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : "Not yet updated"}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Analytics sections" className="flex flex-wrap gap-2">
          <a href="#analytics-drivers" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-[var(--info)] hover:bg-[var(--info-soft)]"><TerminalIconGlyph className="size-4" aria-hidden="true" /> Drivers</a>
          <a href="#analytics-businesses" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-[var(--violet)] hover:bg-[var(--violet-soft)]"><Store className="size-4" aria-hidden="true" /> Businesses</a>
        </nav>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"><Clock3 className="size-3.5" aria-hidden="true" /> All-time data · Unless noted</span>
      </div>

      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-5 text-sm text-[var(--amber-ink)]">
          <p className="min-w-0 flex-1">{loadError}</p>
          <button type="button" disabled={isLoading} onClick={() => setReload(value => value + 1)} className="min-h-11 rounded-xl border border-current px-4 text-xs font-bold disabled:opacity-50">Try again</button>
        </div>
      ) : (
      <>
      {/* Driver Performance */}
      <section id="analytics-drivers" aria-labelledby="analytics-drivers-title" aria-busy={isLoading} className="@container min-w-0 scroll-mt-32 space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--info-soft)] text-[var(--info)]"><TerminalIconGlyph className="size-5" aria-hidden="true" /></span>
          <div><h2 id="analytics-drivers-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Driver performance</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Completed rides and driver earnings</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 @min-[38rem]:grid-cols-4">
          <StatCard
            label="Completed Trips"
            value={isLoading ? "—" : String(totalTrips)}
            tone="info"
            icon={TerminalIconGlyph}
          />
          <StatCard
            label="Drivers with trips"
            value={isLoading ? "—" : String(activeDrivers)}
            tone="success"
            icon={Users}
          />
          <StatCard
            label="Driver Earnings"
            value={isLoading ? "—" : peso(totalDriverEarnings)}
            tone="primary"
            icon={TrendingUp}
          />
          <StatCard
            label="Avg / Trip"
            value={isLoading ? "—" : `₱${avgPerTrip.toFixed(0)}`}
            tone="violet"
            icon={TrendingUp}
          />
        </div>

        <div className="grid items-start gap-4 @min-[46rem]:grid-cols-2 sm:gap-5">
          <RankingCard title="Top drivers" description="Ranked by completed rides · All time" data={topDrivers} tone="info" loading={isLoading} />
          <Card className="min-w-0 gap-5 rounded-3xl border-line bg-card p-4 sm:p-6">
            <div><h3 className="text-base font-bold text-[var(--ink)]">Service mix</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">How completed rides are distributed</p></div>
            {isLoading ? <div role="status" aria-label="Loading service mix" className="h-60 animate-pulse rounded-xl bg-soft" /> : (
              <div role="img" aria-label={rideTypeDonut.map(service => `${service.label}: ${service.value}`).join(', ')}>
                <AnalyticsDonutChart data={rideTypeDonut} centerLabel="Completed" centerValue={String(totalTrips)} emptyHint="No completed rides yet" />
              </div>
            )}
            <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-[var(--muted-foreground)]"><CheckCircle className="size-4 shrink-0 text-[var(--success-ink)]" aria-hidden="true" /> Only completed rides are included in driver performance.</p>
          </Card>
        </div>
      </section>

      {/* Business Performance */}
      <section id="analytics-businesses" aria-labelledby="analytics-businesses-title" aria-busy={isLoading} className="@container min-w-0 scroll-mt-32 space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--violet-soft)] text-[var(--violet)]"><Store className="size-5" aria-hidden="true" /></span>
          <div><h2 id="analytics-businesses-title" className="text-lg font-bold tracking-tight text-[var(--ink)] sm:text-xl">Business performance</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Order activity · Cancelled orders excluded</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 @min-[38rem]:grid-cols-4">
          <StatCard
            label="Orders"
            value={isLoading ? "—" : String(totalOrders)}
            tone="primary"
            icon={Package}
          />
          <StatCard
            label="Businesses with orders"
            value={isLoading ? "—" : String(businessStats.length)}
            tone="violet"
            icon={Store}
          />
          <StatCard
            label="Gross order value"
            value={isLoading ? "—" : peso(grossRevenue)}
            tone="success"
            icon={TrendingUp}
          />
          <StatCard
            label="Avg Order Value"
            value={isLoading ? "—" : `₱${avgOrderValue.toFixed(0)}`}
            tone="info"
            icon={TrendingUp}
          />
        </div>

        <div className="grid items-start gap-4 @min-[46rem]:grid-cols-2 sm:gap-5">
          <RankingCard title="Top businesses" description="Ranked by gross order value · All time" data={topBusinesses} tone="violet" loading={isLoading} currency />
          <Card className="min-w-0 gap-5 rounded-3xl border-line bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-base font-bold text-[var(--ink)]">Order activity</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">Platform-wide orders placed per day</p></div>
              <span className="rounded-lg bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--coral-dark)]">Last 7 days</span>
            </div>
            {isLoading ? <div role="status" aria-label="Loading order activity" className="h-60 animate-pulse rounded-xl bg-soft" /> : (
              <div role="img" aria-label={`Orders in the last 7 days: ${ordersPerDay.map(day => `${day.label} ${day.value}`).join(', ')}`}>
                <AnalyticsBarChart data={ordersPerDay} color="var(--primary)" height={210} emptyHint="No orders in the last 7 days" />
              </div>
            )}
            <p className="border-t border-line pt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">Order value includes all non-cancelled orders, not just delivered orders.</p>
          </Card>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
