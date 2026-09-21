import { ChevronRight, MapPin } from "lucide-react";
import { LocationServices, isNativeLocationSupported } from "@/lib/locationServices";

/** Why the device can't hand the app a position right now. */
export type LocationProblem = "permission-denied" | "services-off";

interface LocationBannerProps {
  /** Null while location works. The owning screen decides this from its own GPS calls. */
  problem: LocationProblem | null;
  className?: string;
}

const MESSAGES: Record<LocationProblem, string> = {
  "permission-denied": "Location permission is off — tap to enable",
  "services-off": "Location is off — tap to enable",
};

/**
 * Inline strip shown on the map screens when the device can't provide a position.
 *
 * This replaces the blocking LocationGate modal: it only appears when something is
 * actually wrong, it never covers the map, and tapping it opens the Android screen
 * that fixes that specific problem instead of leaving the user stuck. A blocked
 * permission and switched-off location services live in different settings
 * screens, and re-requesting the permission does nothing once Android has marked
 * it as denied, so the two cases route differently.
 *
 * Deliberately passive: it never requests a position itself, so it can't race the
 * screen's own geolocation call or trigger a permission dialog of its own. The
 * screens set `problem` from the errors they already receive.
 *
 * Native only - the web build renders nothing and stays exactly as it was.
 */
export default function LocationBanner({ problem, className = "" }: LocationBannerProps) {
  if (!problem || !isNativeLocationSupported()) return null;

  const openSettings = async () => {
    try {
      if (problem === "permission-denied") {
        await LocationServices.openAppSettings();
      } else {
        await LocationServices.openLocationSettings();
      }
    } catch (error) {
      console.warn("[LocationBanner] Could not open location settings:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={openSettings}
      className={`flex w-full items-center gap-2.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-left shadow-sm transition-transform active:scale-[0.99] ${className}`}
    >
      <MapPin className="h-4 w-4 shrink-0 text-[#E11D48]" />
      <span className="flex-1 text-xs font-semibold leading-snug text-[#9F1239]">{MESSAGES[problem]}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#E11D48]" />
    </button>
  );
}
