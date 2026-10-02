import AdminAnalytics from "./AdminAnalytics";
import AdminShell from "./AdminShell";

/**
 * Standalone Analytics page.
 *
 * `AdminAnalytics` is also embedded directly inside AdminDashboard, so it stays
 * a bare content fragment; this wrapper supplies the shared shell for the
 * dedicated /admin/analytics route.
 */
export default function AdminAnalyticsPage() {
  return (
    <AdminShell
      title="Analytics"
      subtitle="Driver and business performance at a glance"
    >
      <AdminAnalytics />
    </AdminShell>
  );
}