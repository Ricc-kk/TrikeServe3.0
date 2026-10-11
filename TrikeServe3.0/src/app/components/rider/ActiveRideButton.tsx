import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Navigation } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { readRiderActiveRide, isRiderRideActive, fetchRiderActiveRide } from "../../../lib/riderActiveRide";

/**
 * Floating "Active Ride" button shown on rider screens while a ride is in
 * progress, so the rider can jump straight back to the active-ride screen.
 * Sits above the fixed bottom navigation bar on rider screens.
 */
export default function ActiveRideButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [hasActiveRide, setHasActiveRide] = useState(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const saved = readRiderActiveRide();
      if (saved && isRiderRideActive(saved.status)) {
        if (active) setHasActiveRide(true);
        return;
      }
      // Fall back to the database, so the button still appears on a device that
      // never accepted the ride, or that lost its saved copy.
      if (user?.id) {
        const dbRide = await fetchRiderActiveRide(user.id);
        if (active) setHasActiveRide(!!dbRide);
        return;
      }
      if (active) setHasActiveRide(false);
    };

    check();
    window.addEventListener("storage", check);
    const interval = setInterval(check, 5000);
    return () => {
      active = false;
      window.removeEventListener("storage", check);
      clearInterval(interval);
    };
  }, [user?.id]);

  // Nothing to show without an active ride, or while already on the ride screen.
  if (!hasActiveRide || location.pathname === "/rider/active-ride") return null;

  return (
    <button
      onClick={() => navigate("/rider/active-ride")}
      className="fixed bottom-24 right-6 z-[1100] flex items-center gap-2 px-5 py-3 bg-[var(--primary)] hover:bg-[var(--primary)] text-white font-bold text-sm rounded-2xl shadow-xl shadow-[var(--error-soft)] transition-all active:scale-95"
    >
      <Navigation className="w-5 h-5" />
      Active Ride
    </button>
  );
}