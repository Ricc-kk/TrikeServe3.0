import { useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "./googleMaps";

export function useMapLoader() {
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script-global',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES as unknown as any,
  });

  // If loader indicates loaded but window.google is missing, scripts are blocked
  const blocked = Boolean(isLoaded && !(window as any)?.google);

  return {
    isLoaded,
    loadError,
    blocked,
    apiKeyPresent: Boolean(GOOGLE_MAPS_API_KEY),
  };
}

export default useMapLoader;

