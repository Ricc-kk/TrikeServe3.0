import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Flag,
  LayoutDashboard,
  MapPin,
  Settings,
  Users,
} from "lucide-react";

export type AdminNavItem = {
  path: string;
  label: string;
  /** Short Filipino gloss. Only rendered for Rider Admin. */
  filipino: string;
  Icon: LucideIcon;
};

/** Minimal shape we need from the auth user, to keep this module testable. */
type AdminLikeUser = {
  role?: string;
  adminType?: string | null;
} | null;

/**
 * Super Admin is the business_customer admin type; Rider Admin is 'rider'.
 * Anything else signed in as an admin gets the Rider Admin (reduced) menu,
 * which is the safer of the two.
 */
export function isSuperAdmin(user: AdminLikeUser): boolean {
  return user?.adminType === "business_customer";
}

/**
 * The one place admin destinations are defined.
 *
 * Both the desktop sidebar and any other admin navigation read from this, so a
 * destination can never be reachable on one screen and missing on another.
 */
export function adminNavFor(user: AdminLikeUser): AdminNavItem[] {
  if (isSuperAdmin(user)) {
    return [
      { path: "/admin/dashboard", label: "Overview", filipino: "Buod", Icon: LayoutDashboard },
      { path: "/admin/analytics", label: "Analytics", filipino: "Analitiks", Icon: BarChart3 },
      { path: "/admin/users", label: "Users", filipino: "Mga gumagamit", Icon: Users },
      { path: "/admin/terminals", label: "Terminals", filipino: "Mga terminal", Icon: MapPin },
      { path: "/admin/approvals", label: "Approvals", filipino: "Mga kahiling", Icon: ClipboardCheck },
      { path: "/admin/reports", label: "Reports", filipino: "Mga ulat", Icon: Flag },
      { path: "/admin/audit", label: "Audit Trail", filipino: "Bakas", Icon: ClipboardList },
      { path: "/admin/settings", label: "Settings", filipino: "Mga setting", Icon: Settings },
    ];
  }

  return [
    { path: "/admin/dashboard", label: "Overview", filipino: "Buod", Icon: LayoutDashboard },
    { path: "/admin/terminals", label: "Terminals", filipino: "Mga terminal", Icon: MapPin },
    { path: "/admin/users", label: "Drivers", filipino: "Mga driver", Icon: Users },
    { path: "/admin/settings", label: "Settings", filipino: "Mga setting", Icon: Settings },
  ];
}