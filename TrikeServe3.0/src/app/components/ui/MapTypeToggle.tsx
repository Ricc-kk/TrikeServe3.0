import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGoogleMap } from "@react-google-maps/api";
import MapFullscreenToggle from "./MapFullscreenToggle";

type MapType = "roadmap" | "satellite";

/** Adds the app's map-type switch and optional full-screen control to a GoogleMap. */
export default function MapTypeToggle({ showFullscreenControl = true }: { showFullscreenControl?: boolean }) {
  const map = useGoogleMap();
  const [controlElement, setControlElement] = useState<HTMLDivElement | null>(null);
  const [mapType, setMapType] = useState<MapType>(() =>
    map.getMapTypeId() === "satellite" ? "satellite" : "roadmap",
  );

  useEffect(() => {
    const control = document.createElement("div");
    control.style.margin = "8px";
    control.style.marginTop = "calc(env(safe-area-inset-top, 0px) + 8px)";
    const controls = map.controls[google.maps.ControlPosition.TOP_LEFT];

    // The app supplies its own consistent control, so hide Google's default
    // map-type selector (where it would otherwise be enabled).
    map.setOptions({ mapTypeControl: false });
    controls.push(control);
    setControlElement(control);

    const syncMapType = () => {
      setMapType(map.getMapTypeId() === "satellite" ? "satellite" : "roadmap");
    };
    const listener = map.addListener("maptypeid_changed", syncMapType);
    syncMapType();

    return () => {
      listener.remove();
      const index = controls.getArray().indexOf(control);
      if (index >= 0) controls.removeAt(index);
      setControlElement(current => current === control ? null : current);
    };
  }, [map]);

  const selectMapType = (next: MapType) => map.setMapTypeId(next);

  return (
    <>
      {controlElement && createPortal(
        <div role="group" aria-label="Map type" className="inline-flex overflow-hidden rounded-lg border border-line bg-card p-0.5 shadow-lg">
          <button
            type="button"
            aria-label="Map view"
            aria-pressed={mapType === "roadmap"}
            onClick={() => selectMapType("roadmap")}
            className={`min-h-9 min-w-12 rounded-md px-3 text-xs font-bold transition-colors ${mapType === "roadmap" ? "bg-[var(--primary)] text-white" : "text-[var(--ink)] hover:bg-[var(--muted)]"}`}
          >
            Map
          </button>
          <button
            type="button"
            aria-label="Satellite view"
            aria-pressed={mapType === "satellite"}
            onClick={() => selectMapType("satellite")}
            className={`min-h-9 min-w-12 rounded-md px-3 text-xs font-bold transition-colors ${mapType === "satellite" ? "bg-[var(--primary)] text-white" : "text-[var(--ink)] hover:bg-[var(--muted)]"}`}
          >
            <span className="sm:hidden">Sat</span>
            <span className="hidden sm:inline">Satellite</span>
          </button>
        </div>,
        controlElement,
      )}
      {showFullscreenControl && <MapFullscreenToggle />}
    </>
  );
}
