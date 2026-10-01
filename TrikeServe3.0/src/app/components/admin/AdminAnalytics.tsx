import { useEffect, useMemo, useState } from "react";
import { Bike, Store, TrendingUp, Package, type LucideIcon } from "lucide-react";
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

function firstName(name?: string | null): string {
  return (name || "Driver").trim().split(/\s+/)[0] || "Driver";
}

function shortName(name?: string | null): string {
  const value = (name || "Unknown").trim();
  return value.length > 12 ? `${value.slice(0, 11)}…` : value;
}

// Literal class strings so Tailwind can statically pick up the arbitrary values.
const TONE_CLASSES = {
  primary: { bg: "bg-[var(--primary-soft)]", text: "text-[var(--primary)]" },
  info: { bg: "bg-[var(--info-soft)]", text: "text-[var(--info)]" },
  success: { bg: "bg-[var(--success-soft)]", text: "text-[var(--success)]" },
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
    <Card className="p-4 border border-line bg-surface">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-[var(--muted-foreground)] mb-1 truncate">{label}</p>
          <h3 className="text-xl lg:text-2xl font-bold text-[var(--ink)] truncate">{value}</h3>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE_CLASSES[tone].bg}`}>
          <Icon className={`w-5 h-5 ${TONE_CLASSES[tone].text}`} />
        </div>
      </div>
    </Card>
  );
}

/**
 * Super Admin analytics: how drivers are performing (completed rides) and how
 * partner businesses are performing (delivered orders). Reads the platform-wide
 * tables directly, so it works for the Super Admin regardless of terminal scope.
 */
export default function AdminAnalytics() {
  const [rides, setRides] = useState<RideRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [ridesRes, ordersRes] = await Promise.all([
          supabase
            .from("ride_requests")
            .select("*")
            .eq("status", "completed"),
          supabase.from("orders").select("*"),
        ]);
        if (!active) return;
        setRides((ridesRes.data as RideRow[]) || []);
        // Canceled orders shouldn't count toward business performance.
        setOrders(((ordersRes.data as OrderRow[]) || []).filter((o) => o.status !== "cancelled"));
      } catch (error) {
        console.error("[AdminAnalytics] Failed to load analytics:", error);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
        .map((d) => ({ label: firstName(d.name), value: d.trips })),
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
        .map((b) => ({ label: shortName(b.name), value: Math.round(b.revenue) })),
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

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Driver Performance */}
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Driver Performance</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
          <StatCard
            label="Completed Trips"
            value={isLoading ? "—" : String(totalTrips)}
            tone="info"
            icon={Bike}
          />
          <StatCard
            label="Active Drivers"
            value={isLoading ? "—" : String(activeDrivers)}
            tone="success"
            icon={Bike}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <Card className="lg:col-span-2 p-5 lg:p-6 border border-line bg-surface">
            <h3 className="font-bold text-[var(--ink)] mb-1">Top Drivers by Trips</h3>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">Completed rides per driver</p>
            <AnalyticsBarChart
              data={topDrivers}
              color="var(--info)"
              height={180}
              emptyHint="No completed rides yet"
            />
          </Card>

          <Card className="p-5 lg:p-6 border border-line bg-surface">
            <h3 className="font-bold text-[var(--ink)] mb-4">Trips by Service Type</h3>
            <AnalyticsDonutChart
              data={rideTypeDonut}
              centerLabel="Trips"
              centerValue={String(totalTrips)}
              emptyHint="No completed rides yet"
            />
          </Card>
        </div>
      </div>

      {/* Business Performance */}
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-[var(--ink)] mb-4">Business Performance</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
          <StatCard
            label="Orders"
            value={isLoading ? "—" : String(totalOrders)}
            tone="primary"
            icon={Package}
          />
          <StatCard
            label="Partner Businesses"
            value={isLoading ? "—" : String(businessStats.length)}
            tone="violet"
            icon={Store}
          />
          <StatCard
            label="Gross Revenue"
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <Card className="p-5 lg:p-6 border border-line bg-surface">
            <h3 className="font-bold text-[var(--ink)] mb-1">Top Businesses by Revenue</h3>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">Gross order value per business</p>
            <AnalyticsBarChart
              data={topBusinesses}
              color="var(--violet)"
              valuePrefix="₱"
              height={180}
              emptyHint="No orders yet"
            />
          </Card>

          <Card className="p-5 lg:p-6 border border-line bg-surface">
            <h3 className="font-bold text-[var(--ink)] mb-1">Orders by Day</h3>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">Platform-wide, last 7 days</p>
            <AnalyticsBarChart
              data={ordersPerDay}
              color="var(--primary)"
              height={180}
              emptyHint="No orders yet"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
