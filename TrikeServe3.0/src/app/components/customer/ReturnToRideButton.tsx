import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Navigation } from "lucide-react";

/**
 * Floating "Return to Ride" button shown while a driver has an active ride,
 * so they can jump straight back to the active-ride screen. This component was
 * referenced by Root.tsx but missing from the repo, which broke the app build.
 */
export default function ReturnToRideButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasActiveRide, setHasActiveRide] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setHasActiveRide(!!localStorage.getItem("trikeserve_active_ride"));
      } catch {
        setHasActiveRide(false);
      }
    };

    check();
    window.addEventListener("storage", check);
    const interval = setInterval(check, 3000);
    return () => {
      window.removeEventListener("storage", check);
      clearInterval(interval);
    };
  }, []);

  // Nothing to show without an active ride, or while already on the ride screen.
  if (!hasActiveRide || location.pathname === "/rider/active-ride") return null;

  return (
    <button
      onClick={() => navigate("/rider/active-ride")}
      className="fixed bottom-6 right-6 z-[999] flex items-center gap-2 px-5 py-3 bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm rounded-2xl shadow-xl shadow-red-200 transition-all active:scale-95"
    >
      <Navigation className="w-5 h-5" />
      Return to Ride
    </button>
  );
}
