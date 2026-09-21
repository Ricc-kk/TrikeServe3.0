import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { LocationServices, isNativeLocationSupported } from "@/lib/locationServices";

/**
 * Simple "please allow location" prompt, shown when the app opens.
 *
 * It only appears when the app does not already have the permission, and tapping
 * Allow runs Android's own runtime permission dialog - this is just the polite
 * ask in front of it. Declining dismisses it for that launch rather than blocking
 * anything; the inline LocationBanner on the map screens is the way back once
 * location is genuinely needed.
 *
 * Native only: in a browser this never renders, so the web build is unchanged.
 */
export default function LocationPermissionPrompt() {
  const isNative = isNativeLocationSupported();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasCheckedRef = useRef(false);

  // Check once per launch so a granted permission never flashes the prompt.
  useEffect(() => {
    if (!isNative || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    LocationServices.checkPermission()
      .then(({ location }) => setShow(location !== "granted"))
      .catch((error) => console.warn("[LocationPermissionPrompt] Permission check failed:", error));
  }, [isNative]);

  const handleAllow = async () => {
    setBusy(true);
    try {
      const { location } = await LocationServices.requestPermission();
      if (location === "granted") setShow(false);
    } catch (error) {
      console.warn("[LocationPermissionPrompt] Permission request failed:", error);
    } finally {
      setBusy(false);
    }
  };

  if (!isNative || !show) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF1F2]">
          <MapPin className="h-8 w-8 text-[#E11D48]" />
        </div>

        <h2 className="mb-2 text-xl font-bold text-[#121212]">Allow Location</h2>

        <p className="mb-6 text-sm text-[#64748B]">
          TrikeServe needs your location to set your pickup point and track your ride.
        </p>

        <button
          type="button"
          onClick={handleAllow}
          disabled={busy}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E11D48] px-5 py-3.5 font-bold uppercase text-white shadow-lg transition-all hover:bg-[#BE123C] active:scale-95 disabled:opacity-60"
        >
          <Navigation className="h-5 w-5" />
          Allow Location
        </button>

        <button
          type="button"
          onClick={() => setShow(false)}
          disabled={busy}
          className="w-full text-xs font-medium text-[#94A3B8] underline-offset-2 hover:underline disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
