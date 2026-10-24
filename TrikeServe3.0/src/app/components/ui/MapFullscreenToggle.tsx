import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGoogleMap } from "@react-google-maps/api";
import { Maximize2, Minimize2 } from "lucide-react";

function resizeMapPreservingCenter(map: google.maps.Map) {
  const center = map.getCenter();
  requestAnimationFrame(() => {
    google.maps.event.trigger(map, "resize");
    if (center) map.setCenter(center);
  });
}

/** Adds the app-styled fullscreen control to a Google map. */
export default function MapFullscreenToggle() {
  const map = useGoogleMap();
  const [controlElement, setControlElement] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fallbackStyleRef = useRef<string | null>(null);

  useEffect(() => {
    const control = document.createElement("div");
    control.style.margin = "8px";
    control.style.marginTop = "calc(env(safe-area-inset-top, 0px) + 8px)";
    const controls = map.controls[google.maps.ControlPosition.TOP_RIGHT];
    controls.push(control);
    setControlElement(control);

    const syncFullscreenState = () => {
      const active = document.fullscreenElement === map.getDiv()
        || map.getDiv().dataset.mapFullscreen === "true";
      setIsFullscreen(active);
      resizeMapPreservingCenter(map);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || map.getDiv().dataset.mapFullscreen !== "true") return;
      const mapElement = map.getDiv();
      if (fallbackStyleRef.current !== null) {
        mapElement.setAttribute("style", fallbackStyleRef.current);
        fallbackStyleRef.current = null;
      }
      delete mapElement.dataset.mapFullscreen;
      setIsFullscreen(false);
      resizeMapPreservingCenter(map);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("keydown", handleKeyDown);
      const index = controls.getArray().indexOf(control);
      if (index >= 0) controls.removeAt(index);
      if (fallbackStyleRef.current !== null) {
        map.getDiv().setAttribute("style", fallbackStyleRef.current);
        delete map.getDiv().dataset.mapFullscreen;
        fallbackStyleRef.current = null;
      }
      setControlElement(current => current === control ? null : current);
    };
  }, [map]);

  if (!controlElement) return null;

  const toggleFullscreen = async () => {
    const mapElement = map.getDiv();
    if (document.fullscreenElement === mapElement) {
      await document.exitFullscreen?.();
      return;
    }

    if (mapElement.dataset.mapFullscreen === "true") {
      if (fallbackStyleRef.current !== null) {
        mapElement.setAttribute("style", fallbackStyleRef.current);
        fallbackStyleRef.current = null;
      }
      delete mapElement.dataset.mapFullscreen;
      setIsFullscreen(false);
      resizeMapPreservingCenter(map);
      return;
    }

    if (mapElement.requestFullscreen) {
      try {
        await mapElement.requestFullscreen();
        setIsFullscreen(true);
        return;
      } catch {
        // Embedded browsers can reject Fullscreen API requests; use the in-app
        // fixed-position fallback below so the control still works there.
      }
    }

    fallbackStyleRef.current = mapElement.getAttribute("style") || "";
    mapElement.dataset.mapFullscreen = "true";
    Object.assign(mapElement.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100dvh",
      maxWidth: "none",
      maxHeight: "none",
      zIndex: "5000",
      borderRadius: "0",
    });
    setIsFullscreen(true);
    resizeMapPreservingCenter(map);
  };

  return createPortal(
    <button
      type="button"
      aria-label={isFullscreen ? "Exit full-screen map" : "View map full screen"}
      title={isFullscreen ? "Exit full screen" : "Full screen map"}
      aria-pressed={isFullscreen}
      onClick={() => void toggleFullscreen()}
      className="grid size-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-md transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {isFullscreen ? <Minimize2 className="size-5" aria-hidden="true" /> : <Maximize2 className="size-5" aria-hidden="true" />}
    </button>,
    controlElement,
  );
}
