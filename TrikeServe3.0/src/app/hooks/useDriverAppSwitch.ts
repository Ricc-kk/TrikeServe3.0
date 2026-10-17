import { useCallback } from "react";
import { useNavigate } from "react-router";
import { Shield, ShoppingBag, type LucideIcon } from "lucide-react";
import { TerminalIconGlyph } from "../components/ui/TerminalIcon";
import { useAuth, type UserRole } from "../contexts/AuthContext";

/**
 * The apps a driver can move between.
 *
 * A driver's role is not a fixed identity in this app -- `switchUiRole` rewrites
 * `users.role` to whichever app they are standing in, so a driver who opened the
 * customer app reads as role = 'customer' and one who opened this admin app
 * reads as role = 'admin'. These are the three destinations any of those states
 * can mean, and they are named in one place so the Driver profile and the Admin
 * shell cannot drift into offering different ones.
 */
export type DriverAppKey = "driver" | "customer" | "admin";

export type DriverApp = {
  key: DriverAppKey;
  /** What `users.role` has to be for this app to be the active one. */
  role: UserRole;
  label: string;
  blurb: string;
  path: string;
  Icon: LucideIcon;
};

export const DRIVER_APPS: DriverApp[] = [
  {
    key: "driver",
    role: "rider",
    label: "Driver App",
    blurb: "Drive, take rides and check your earnings",
    path: "/rider",
    // The terminal mark, the same one the map draws: this platform's
    // terminals are tricycle terminals, so the Driver App leads with the sign
    // rather than a side view of one vehicle. `TerminalIconGlyph` rather than
    // `TerminalIcon` so it inherits the row's text colour and takes the size
    // and class props like a lucide icon.
    Icon: TerminalIconGlyph,
  },
  {
    key: "customer",
    role: "customer",
    label: "Customer App",
    blurb: "Book rides and order food as a passenger",
    path: "/customer",
    Icon: ShoppingBag,
  },
  {
    key: "admin",
    role: "admin",
    label: "Admin App",
    blurb: "Run your terminal, its drivers and its settings",
    path: "/admin",
    Icon: Shield,
  },
];

/**
 * Moving between a driver's three apps, from wherever they currently are.
 *
 * Exists as a hook rather than a helper because the Admin shell and the Driver
 * profile both need it, and they are never on screen together -- so the way back
 * out of the admin app has to be written twice unless it lives in one module.
 * Duplicated, it drifts, and the copy that breaks is the one trapping somebody
 * inside an app they wanted to leave.
 */
export function useDriverAppSwitch() {
  const { user, switchUiRole } = useAuth();
  const navigate = useNavigate();

  /**
   * Switch to one of the driver's apps.
   *
   * The role is set outright rather than going through `restoreOriginalRole`,
   * which only remembers one "where I came from" slot. Driver -> customer ->
   * admin -> back would otherwise restore them to the *customer* app, because
   * that is what the slot last held. The slot is pinned to 'rider' instead,
   * which is both what "back" should mean for a driver and what makes the
   * Customer app's own "Switch back to Driver App" button appear at all -- it
   * only renders for a remembered rider.
   *
   * The await matters: `switchUiRole` writes the role to the database before it
   * updates the session, and navigating before that lands would bounce straight
   * back off ProtectedRoute on the stale role.
   */
  const goToApp = useCallback(
    async (key: DriverAppKey) => {
      const app = DRIVER_APPS.find(a => a.key === key);
      if (!app || !user) return;

      localStorage.setItem("trikeserve_original_role", "rider");
      localStorage.setItem("trikeserve_post_switch_route", app.path);
      if (user.role !== app.role) {
        await switchUiRole?.(app.role);
      }
      navigate(app.path);
    },
    [user, switchUiRole, navigate]
  );

  /** Which of the three apps the session is currently in, if any. */
  const currentAppKey: DriverAppKey | null =
    user?.role === "rider"
      ? "driver"
      : user?.role === "customer"
        ? "customer"
        : user?.role === "admin"
          ? "admin"
          : null;

  return { goToApp, currentAppKey };
}
