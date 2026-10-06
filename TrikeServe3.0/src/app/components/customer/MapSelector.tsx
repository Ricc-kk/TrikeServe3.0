import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, MarkerF, InfoWindow } from "@react-google-maps/api";
import { ArrowLeft, MapPin, Navigation, Search, X, Loader2 } from "lucide-react";
import useMapLoader from "@/lib/mapLoader";
import {
  autocompletePlacesNew,
  createPlacesSessionToken,
  fetchPlaceDetailsNew,
} from "@/lib/placesApi";

// Google Maps API key (used for Places search + reverse geocoding)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

interface MapSelectorProps {
  onClose: () => void;
  onSelectLocation: (location: { name: string; full: string; lat: number; lng: number }) => void;
  currentLocation: { name: string; full: string; lat?: number; lng?: number };
}

// Red app-branded pin for the location the customer placed on the map
const createSelectedPinIcon = () => {
  const google = (window as any)?.google;
  if (!google?.maps?.Size || !google?.maps?.Point) return undefined;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--primary)" stroke="white" stroke-width="1">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 4.95 6.1 11.53 6.36 11.81.36.39.92.39 1.28 0C13.9 20.53 20 13.95 20 9c0-3.87-3.13-7-8-7z"/>
    <circle cx="12" cy="9" r="2.4" fill="#FFFFFF" stroke="none"/>
  </svg>`;

  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(42, 42),
    anchor: new google.maps.Point(21, 42),
  } as any;
};

export default function MapSelector({ onClose, onSelectLocation, currentLocation }: MapSelectorProps) {
  const { isLoaded, loadError, blocked, apiKeyPresent } = useMapLoader();

  // Gen T Deleon, Valenzuela City coordinates (also used as the default map center)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.7244, lng: 120.9668 });
  const [pickedPin, setPickedPin] = useState<{ lat: number; lng: number; name: string; full: string } | null>(null);
  const [showPinInfo, setShowPinInfo] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showAddressList, setShowAddressList] = useState(true);
  const [locating, setLocating] = useState(false);
  // The device's own position, resolved to an address and shown as the first
  // row of the address list. Most delivery pins are the customer's own
  // doorstep, so offering it up front beats making them search or guess pins.
  const [deviceLocation, setDeviceLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
    full: string;
  } | null>(null);
  const deviceLocatedRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocodeRequestIdRef = useRef(0);
  const [placesSessionToken, setPlacesSessionToken] = useState<string>(() => createPlacesSessionToken());
  // Ask the customer to confirm before the chosen pin is committed.
  const [showConfirm, setShowConfirm] = useState(false);

  // Pan the map when the center changes (pin placement or search selection)
  useEffect(() => {
    mapRef.current?.panTo(mapCenter);
  }, [mapCenter]);

  // Center the map on the customer's current location on first load if available
  useEffect(() => {
    if (typeof currentLocation?.lat === "number" && typeof currentLocation?.lng === "number") {
      setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lng });
    }
  }, [currentLocation?.lat, currentLocation?.lng]);

  // Reverse geocode a lat/lng pair into a readable address using the Google Geocoding API
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!GOOGLE_MAPS_API_KEY) return null;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      if (data?.status === "OK" && data.results?.[0]?.formatted_address) {
        const result = data.results[0];
        const full = result.formatted_address;
        // Build a short name from street number + road if available
        const streetNumber = result.address_components?.find((c: any) => c.types.includes("street_number"))?.long_name;
        const route = result.address_components?.find((c: any) => c.types.includes("route"))?.long_name;
        const neighborhood = result.address_components?.find((c: any) => c.types.includes("neighborhood"))?.long_name;
        const locality = result.address_components?.find((c: any) => c.types.includes("locality"))?.long_name;
        const name = [streetNumber, route].filter(Boolean).join(" ") || neighborhood || locality || full.split(",")[0] || full;
        return { name, full };
      }
    } catch (err) {
      console.warn("[MapSelector] Reverse geocode failed:", err);
    }
    return null;
  }, []);

  // Resolve the device position once on open to back the "Current location"
  // row. Denial or timeout is not an error: the row is omitted and search /
  // tap-to-place still work.
  useEffect(() => {
    if (deviceLocatedRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    deviceLocatedRef.current = true;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const address = await reverseGeocode(lat, lng);
        setDeviceLocation(
          address
            ? { lat, lng, name: address.name, full: address.full }
            : { lat, lng, name: 'Your current location', full: 'Your current location' },
        );
        setLocating(false);
      },
      () => {
        // Denied or unavailable — leave the map where it is.
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [reverseGeocode]);

  // Tapping the "Current location" row is the same as tapping that point on
  // the map: drop the pin there, pan to it, show its bubble.
  const handleUseDeviceLocation = useCallback(() => {
    if (!deviceLocation) return;
    setPickedPin({ ...deviceLocation });
    setMapCenter({ lat: deviceLocation.lat, lng: deviceLocation.lng });
    setShowPinInfo(true);
    setShowAddressList(true);
    setShowSearchDropdown(false);
  }, [deviceLocation]);

  // When the customer taps on the map, drop a pin and look up the address
  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      const requestId = ++geocodeRequestIdRef.current;
      setPickedPin({ lat, lng, name: 'Loading address...', full: 'Loading address...' });
      setMapCenter({ lat, lng });
      setShowSearchDropdown(false);
      setShowAddressList(true);
      setShowPinInfo(true);
      setIsGeocoding(true);
      const address = await reverseGeocode(lat, lng);
      // Ignore stale responses if the user tapped somewhere else meanwhile
      if (requestId !== geocodeRequestIdRef.current) return;
      setIsGeocoding(false);
      if (address) {
        setPickedPin({ lat, lng, name: address.name, full: address.full });
      } else {
        setPickedPin({ lat, lng, name: 'Selected Location', full: 'Selected Location' });
      }
    },
    [reverseGeocode]
  );

  // Debounced Places autocomplete search as the customer types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) {
      // No key configured: let the customer know search isn't available
      setSearchResults([]);
      setShowSearchDropdown(true);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const suggestions = await autocompletePlacesNew({
          input: searchQuery.trim(),
          apiKey: GOOGLE_MAPS_API_KEY,
          locationBias: mapCenter,
          restrictToCountry: "ph",
          sessionToken: placesSessionToken,
        });
        setSearchResults(suggestions || []);
        setShowSearchDropdown(true);
      } catch (err) {
        console.warn("[MapSelector] Autocomplete failed:", err);
        setSearchResults([]);
        setShowSearchDropdown(true);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, mapCenter, GOOGLE_MAPS_API_KEY]);

  // When a search result is chosen, resolve its coordinates and drop the pin there
  const handleSearchResultPick = async (suggestion: any) => {
    setSearchQuery(suggestion.displayName);
    setShowSearchDropdown(false);

    if (!GOOGLE_MAPS_API_KEY || !suggestion.place_id) return;
    try {
      const place = await fetchPlaceDetailsNew({
        placeId: suggestion.place_id,
        apiKey: GOOGLE_MAPS_API_KEY,
        sessionToken: placesSessionToken,
      });

      const lat = place?.lat;
      const lng = place?.lng;
      const full = place?.formatted_address || suggestion.fullText || suggestion.displayName;
      const name = place?.name || suggestion.displayName || full;

      if (typeof lat === "number" && typeof lng === "number") {
        setPickedPin({ lat, lng, name, full });
        setMapCenter({ lat, lng });
        setShowPinInfo(true);
        setShowAddressList(true);
      }
    } catch (err) {
      console.warn("[MapSelector] Place details failed:", err);
    } finally {
      // Rotate the session token after a completed search selection
      setPlacesSessionToken(createPlacesSessionToken());
    }
  };

  const handleChooseLocation = () => {
    if (!pickedPin) return;
    setShowConfirm(true);
  };

  const confirmSelectedLocation = () => {
    if (!pickedPin) return;
    onSelectLocation({
      name: pickedPin.name,
      full: pickedPin.full,
      lat: pickedPin.lat,
      lng: pickedPin.lng,
    });
  };

  const handleRecenterMap = () => {
    if (pickedPin) {
      setMapCenter({ lat: pickedPin.lat, lng: pickedPin.lng });
    }
  };

  // Renders loading / error states, then the Google Map itself
  const renderMap = () => {
    if (!apiKeyPresent) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--muted)] px-6">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--ink)] mb-2">⚠️ Google Maps API key missing</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Add VITE_GOOGLE_MAPS_API_KEY to your .env.local file to enable the map.
            </p>
          </div>
        </div>
      );
    }
    if (blocked) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--muted)] px-6">
          <p className="text-sm text-[var(--muted-foreground)] text-center">
            Unable to load Google Maps (scripts may be blocked). Check your connection and try again.
          </p>
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--muted)] px-6">
          <p className="text-sm text-[var(--muted-foreground)] text-center">
            Failed to load Google Maps. Please check your API key and try again.
          </p>
        </div>
      );
    }
    if (!isLoaded) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin" />
            <p className="text-sm text-[var(--muted-foreground)]">Loading map...</p>
          </div>
        </div>
      );
    }

    return (
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={mapCenter}
        zoom={15}
        options={{
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        }}
        onClick={(e) => {
          if (e?.latLng) handleMapClick(e.latLng.lat(), e.latLng.lng());
        }}
        onLoad={(map) => {
          mapRef.current = map;
        }}
      >
        {/* Pin the customer placed (click or search) */}
        {pickedPin && (
          <MarkerF
            position={{ lat: pickedPin.lat, lng: pickedPin.lng }}
            icon={createSelectedPinIcon()}
            onClick={() => setShowPinInfo(true)}
          />
        )}

        {/* Address bubble for the placed pin */}
        {pickedPin && showPinInfo && (
          <InfoWindow
            position={{ lat: pickedPin.lat, lng: pickedPin.lng }}
            onCloseClick={() => setShowPinInfo(false)}
          >
            <div className="text-sm">
              <p className="font-semibold">{pickedPin.name}</p>
              <p className="text-[var(--muted-foreground)] text-xs">{pickedPin.full}</p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    );
  };

  return (
    <div className="fixed inset-0 bg-surface z-[4000]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-[4002] px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="active:scale-90 transition-transform">
            <ArrowLeft className="w-6 h-6 text-[var(--ink)]" />
          </button>

          <div className="flex-1 mx-3 relative">
            <div className="w-full flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-full">
              <MapPin className="w-4 h-4 text-[var(--primary)] flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length === 0) {
                    setShowAddressList(true);
                    setShowSearchDropdown(false);
                  } else {
                    // Hide the bottom panel so it can't cover the search results
                    setShowAddressList(false);
                  }
                }}
                onFocus={() => {
                  if (searchQuery.trim().length > 0) {
                    setShowSearchDropdown(true);
                    setShowAddressList(false);
                  }
                }}
                placeholder="Search for a place or address..."
                className="flex-1 text-sm font-semibold text-[var(--ink)] placeholder:text-[var(--muted-foreground)] placeholder:font-normal outline-none bg-transparent"
              />
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-[var(--muted-foreground)] animate-spin flex-shrink-0" />
              ) : (
                searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setShowSearchDropdown(false);
                      setShowAddressList(true);
                    }}
                    className="flex-shrink-0 active:scale-90 transition-transform"
                  >
                    <X className="w-4 h-4 text-[var(--muted-foreground)]" />
                  </button>
                )
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-line rounded-2xl shadow-xl max-h-80 overflow-y-auto">
                {searchResults.length > 0 ? (
                  searchResults.map((result, index) => (
                    <button
                      key={result.place_id || index}
                      onClick={() => handleSearchResultPick(result)}
                      className="w-full p-4 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)] active:bg-[var(--muted)] transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[var(--muted)] rounded-full flex items-center justify-center flex-shrink-0">
                          <Search className="w-5 h-5 text-[var(--muted-foreground)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--ink)]">{result.displayName}</p>
                          {result.secondaryText && (
                            <p className="text-sm text-[var(--muted-foreground)] truncate">{result.secondaryText}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-4">
                    <p className="text-sm text-[var(--muted-foreground)] text-center">
                      {isSearching ? "Searching..." : !GOOGLE_MAPS_API_KEY ? "Location search is unavailable" : "No locations found"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="absolute inset-0 z-[4001]">
        {renderMap()}

        {/* Hint chip for tap-to-place */}
        {!pickedPin && (
          <div className="absolute top-20 left-0 right-0 flex justify-center z-[4003] pointer-events-none">
            <div className="bg-white/95 backdrop-blur-sm border border-[var(--border)] shadow-lg rounded-full px-4 py-2 text-xs font-semibold text-[var(--ink)]">
              📍 Tap anywhere on the map to set your delivery location
            </div>
          </div>
        )}

        {/* Recenter Button */}
        <button
          onClick={handleRecenterMap}
          className="absolute bottom-44 right-4 w-12 h-12 bg-surface rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-[4003]"
        >
          <Navigation className="w-5 h-5 text-[var(--primary)]" />
        </button>
      </div>

      {/* Bottom Panel - Selected Address */}
      {showAddressList && (
        <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-2xl z-[4004] max-h-[50vh] flex flex-col">
          {/* Drag Handle */}
          <div className="flex justify-center py-3 border-b border-[var(--border)]">
            <div className="w-12 h-1 bg-[var(--border)] rounded-full"></div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* Device position — first, so the customer's own doorstep is
                already offered before they search or tap anything. */}
            {locating && !deviceLocation && (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                <Loader2 className="w-5 h-5 text-[var(--primary)] animate-spin flex-shrink-0" aria-hidden="true" />
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Finding your current location...
                </p>
              </div>
            )}

            {deviceLocation && (
              <button
                type="button"
                onClick={handleUseDeviceLocation}
                className="w-full flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-left hover:border-[var(--primary)] active:scale-[0.99] transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--primary-soft)] flex items-center justify-center flex-shrink-0">
                  <Navigation className="w-5 h-5 text-[var(--primary)]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-1">
                    Current Location
                  </p>
                  <p className="font-semibold text-[var(--ink)] text-sm">{deviceLocation.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{deviceLocation.full}</p>
                </div>
                <span className="text-xs font-semibold text-[var(--primary)] flex-shrink-0">Use</span>
              </button>
            )}

            {/* Selected pin preview */}
            {pickedPin && (
              <div className="rounded-xl border-2 border-[var(--success)] bg-[var(--success)]/5 p-4">
                <p className="text-xs font-bold text-[var(--success)] uppercase tracking-widest mb-1">
                  {isGeocoding ? "Looking up address..." : "Selected Location"}
                </p>
                <p className="font-bold text-[var(--ink)]">{pickedPin.name}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{pickedPin.full}</p>
              </div>
            )}
          </div>

          {/* Choose Location Button */}
          <div className="px-5 py-4 border-t border-[var(--border)]">
            <button
              onClick={handleChooseLocation}
              disabled={!pickedPin}
              className={`w-full py-4 font-bold rounded-2xl active:scale-95 transition-all shadow-lg ${
                pickedPin
                  ? "bg-[var(--success)] hover:bg-[var(--success)] text-white"
                  : "bg-[var(--border)] text-[var(--muted-foreground)] cursor-not-allowed"
              }`}
            >
              {pickedPin ? "Choose This Location" : "Tap the map to select a location"}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Selected Address */}
      {showConfirm && pickedPin && (
        <div className="fixed inset-0 z-[4010] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="w-14 h-14 bg-[var(--success)]/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <MapPin className="w-7 h-7 text-[var(--success)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--ink)] text-center">Use this address?</h3>
            <div className="mt-4 p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--ink)] text-center">{pickedPin.name}</p>
              <p className="text-xs text-[var(--muted-foreground)] text-center mt-1">{pickedPin.full}</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 text-sm font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={confirmSelectedLocation}
                className="flex-1 py-3 text-sm font-semibold text-white bg-[var(--success)] rounded-xl active:scale-95 transition-transform"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
