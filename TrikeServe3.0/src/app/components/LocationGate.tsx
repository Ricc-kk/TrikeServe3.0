import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import {
  LocationServices,
  isNativeLocationSupported,
  type LocationPermissionState,
} from "@/lib/locationServices";

type GateStatus = "checking" | "granted" | "permission-denied" | "services-off" | "unavailable";

/**
 * Runs once when the app opens (mounted at the root) and:
 *  1. asks for the OS location permission,
 *  2. checks whether the device's location services (GPS) are switched on,
 *  3. prompts the user to open location services when they are off.
 *
 * It re-checks whenever the app returns to the foreground (e.g. after the user
 * toggles location on from the settings screen we send them to).
 */
export default function LocationGate() {
  const [status, setStatus] = useState<GateStatus>("checking");
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPromptedRef = useRef(false);

  const checkWebLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setStatus("granted");
          resolve();
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setStatus("permission-denied");
          } else {
            // POSITION_UNAVAILABLE / TIMEOUT usually means location services are off.
            setStatus("services-off");
          }
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const checkNativeLocation = useCallback(async (requestIfNeeded: boolean) => {
    try {
      let permission: LocationPermissionState = "prompt";

      const initial = await LocationServices.checkPermission();
      permission = initial?.location ?? "prompt";

      if (permission !== "granted" && requestIfNeeded) {
        const requested = await LocationServices.requestPermission();
        permission = requested?.location ?? permission;
      }

      if (permission !== "granted") {
        setStatus("permission-denied");
        return;
      }

      const { enabled } = await LocationServices.isLocationEnabled();
      setStatus(enabled ? "granted" : "services-off");
    } catch (error) {
      console.warn("[LocationGate] Native location check failed:", error);
      // Fall back to the web flow so the user still gets a prompt.
      await checkWebLocation();
    }
  }, [checkWebLocation]);

  const runCheck = useCallback(
    async (requestIfNeeded: boolean) => {
      if (isNativeLocationSupported()) {
        await checkNativeLocation(requestIfNeeded);
      } else {
        await checkWebLocation();
      }
    },
    [checkNativeLocation, checkWebLocation]
  );

  // Initial check when the app opens.
  useEffect(() => {
    if (hasPromptedRef.current) return;
    hasPromptedRef.current = true;
    void runCheck(true);
  }, [runCheck]);

  // Re-check when the app comes back to the foreground (e.g. after enabling
  // location in the Android settings screen).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runCheck(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [runCheck]);

  const handleOpenSettings = async () => {
    setBusy(true);
    try {
      if (isNativeLocationSupported()) {
        await LocationServices.openLocationSettings();
      } else {
        await runCheck(true);
      }
    } catch (error) {
      console.warn("[LocationGate] Could not open location settings:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      await runCheck(true);
    } finally {
      setBusy(false);
    }
  };

  const isBlocking = status === "permission-denied" || status === "services-off";
  if (!isBlocking || dismissed) return null;

  const isServicesOff = status === "services-off";

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl sm:max-w-md">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF1F2]">
          <MapPin className="h-8 w-8 text-[#E11D48]" />
        </div>

        <h2 className="mb-2 text-xl font-bold text-[#121212] sm:text-2xl">
          {isServicesOff ? "Turn On Location Services" : "Location Permission Needed"}
        </h2>

        <p className="mb-6 text-sm text-[#64748B] sm:text-base">
          {isServicesOff
            ? "TrikeServe needs your device location services turned on so we can set your pickup point and track your ride. Please enable location in your phone settings."
            : "TrikeServe needs permission to access your location so we can set your pickup point and track your ride."}
        </p>

        <button
          type="button"
          onClick={handleOpenSettings}
          disabled={busy}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E11D48] px-5 py-3.5 font-bold uppercase text-white shadow-lg transition-all hover:bg-[#BE123C] active:scale-95 disabled:opacity-60"
        >
          <Navigation className="h-5 w-5" />
          {isServicesOff ? "Open Location Settings" : "Allow Location"}
        </button>

        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          className="w-full rounded-2xl border-2 border-[#E2E8F0] px-5 py-3 text-sm font-semibold text-[#64748B] transition-colors hover:bg-[#F8F9FA] disabled:opacity-60"
        >
          I&apos;ve turned it on — Retry
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-3 w-full text-xs font-medium text-[#94A3B8] underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
