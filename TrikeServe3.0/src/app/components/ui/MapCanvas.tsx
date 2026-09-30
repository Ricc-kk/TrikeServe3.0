import type { ReactNode } from "react";
import { GoogleMap } from "@react-google-maps/api";
import { Loader2, MapPinOff, RefreshCw } from "lucide-react";

import useMapLoader from "@/lib/mapLoader";
import { cn } from "./utils";

export type MapPoint = { lat: number; lng: number };

type MapCanvasProps = {
  center: MapPoint;
  zoom?: number;
  /** Markers, polylines and other map children. */
  children?: ReactNode;
  /** Floating content rendered over the map (status card, legend, controls). */
  overlay?: ReactNode;
  /** Accessible name describing what the map shows. */
  label: string;
  /** Whether to show the Google zoom control (gestures are always enabled). */
  zoomControl?: boolean;
  /** Retry action offered when the map cannot load. */
  onRetry?: () => void;
  className?: string;
};

/**
 * Shared Google Map surface for every role.
 *
 * Wraps the app's existing map loader (no map logic changes) and always renders
 * something usable: a warm skeleton while loading, and a plain-language,
 * bilingual fallback when the API key is missing or the script is blocked —
 * never a blank rectangle. Overlay content is positioned above the map for the
 * "map with a sheet" pattern used by ride booking and live tracking.
 */
export default function MapCanvas({
  center,
  zoom = 15,
  children,
  overlay,
  label,
  zoomControl = true,
  onRetry,
  className,
}: MapCanvasProps) {
  const { isLoaded, loadError, blocked, apiKeyPresent } = useMapLoader();
  const unavailable = !apiKeyPresent || blocked || Boolean(loadError);

  if (unavailable) {
    return (
      <div
        role="region"
        aria-label={label}
        className={cn(
          "flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-soft px-6 text-center sm:h-72",
          className,
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-surface text-teal">
          <MapPinOff className="size-6" aria-hidden="true" />
        </span>
        <p className="text-lg font-bold text-ink">Map is unavailable</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Address search and nearby places still work. Hindi maipakita ang mapa
          ngayon.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-ink px-5 font-bold text-white transition-colors hover:bg-teal"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        role="status"
        aria-label={label}
        className={cn(
          "flex h-64 animate-pulse items-center justify-center gap-3 rounded-3xl border border-line bg-soft text-muted-foreground sm:h-72",
          className,
        )}
      >
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="text-sm font-semibold">Loading map / Naglo-load…</span>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        "relative h-64 overflow-hidden rounded-3xl border border-line bg-soft sm:h-72",
        className,
      )}
    >
      <GoogleMap
        mapContainerClassName="h-full w-full"
        center={center}
        zoom={zoom}
        options={{
          disableDefaultUI: true,
          zoomControl,
          clickableIcons: false,
          gestureHandling: "greedy",
        }}
      >
        {children}
      </GoogleMap>

      {overlay ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500]">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      ) : null}
    </div>
  );
}
