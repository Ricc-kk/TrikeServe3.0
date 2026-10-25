import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Navigation } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { writeRiderActiveRide, clearRiderActiveRide, checkRiderActiveRide } from "../../../lib/riderActiveRide";

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
      if (!user?.id) {
        if (active) setHasActiveRide(false);
        return;
      }

      // The database is authoritative. A local ride can still say "on-the-way"
      // after the passenger cancels it, so never let that stale copy keep the
      // button visible.
      const { ride, error } = await checkRiderActiveRide(user.id);
      if (!active || error) return;

      if (ride) {
        writeRiderActiveRide(ride);
        setHasActiveRide(true);
        return;
      }

      clearRiderActiveRide();
      setHasActiveRide(false);
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
