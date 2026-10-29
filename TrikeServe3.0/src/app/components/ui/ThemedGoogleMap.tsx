import { useMemo } from "react";
import { GoogleMap as GoogleMapBase, type GoogleMapProps } from "@react-google-maps/api";
import { useTheme } from "next-themes";

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#182522" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#d2ded8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#14201d" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#455650" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#1d2b27" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#22332e" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9eb3aa" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#344740" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111a17" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#c1d0c9" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#52645b" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#101815" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#293c35" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#a8bcb3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1716" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7ea6a1" }] },
];

/** Shared Google map surface that follows the app's current light or dark theme. */
export default function ThemedGoogleMap({ options, ...props }: GoogleMapProps) {
  const { resolvedTheme } = useTheme();
  const themedOptions = useMemo<google.maps.MapOptions>(
    () => ({
      ...options,
      styles: resolvedTheme === "dark" ? DARK_MAP_STYLES : options?.styles ?? [],
    }),
    [options, resolvedTheme],
  );

  return <GoogleMapBase {...props} options={themedOptions} />;
}
