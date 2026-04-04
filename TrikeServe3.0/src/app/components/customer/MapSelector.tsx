import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { ArrowLeft, ChevronDown, MapPin, Navigation, Menu } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom icon for the main location marker
const mainIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapSelectorProps {
  onClose: () => void;
  onSelectLocation: (location: { name: string; full: string; lat: number; lng: number }) => void;
  currentLocation: { name: string; full: string };
}

// Component to handle map centering
function MapCenterController({ center }: { center: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  
  return null;
}

export default function MapSelector({ onClose, onSelectLocation, currentLocation }: MapSelectorProps) {
  // Tagalag, Valenzuela City coordinates
  const [mapCenter, setMapCenter] = useState<[number, number]>([14.7244, 120.9668]);
  const [selectedMarker, setSelectedMarker] = useState<number | null>(0);
  const [showAddressList, setShowAddressList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  const suggestedLocations = [
    {
      id: 0,
      name: "257, Tagalag Road, Tagalag",
      full: "Tagalag Road, Tagalag, Valenzuela City, Metro Manila, 1445",
      lat: 14.7244,
      lng: 120.9668,
      icon: "🏠",
      label: "Home",
    },
    {
      id: 1,
      name: "SM City North EDSA",
      full: "North Avenue - cor EDSA, Quezon City, Metro Manila",
      lat: 14.6564,
      lng: 121.0293,
      icon: "🏢",
      label: "Work",
    },
    {
      id: 2,
      name: "Tagalag Terminal",
      full: "Main Road, Tagalag, Valenzuela City, Metro Manila",
      lat: 14.7254,
      lng: 120.9658,
      icon: "📍",
      label: "Saved",
    },
    {
      id: 3,
      name: "Barangay Hall",
      full: "Tagalag Center, Valenzuela City, Metro Manila",
      lat: 14.7234,
      lng: 120.9678,
      icon: "🏛️",
      label: "Saved",
    },
  ];

  const handleMarkerClick = (location: any) => {
    setSelectedMarker(location.id);
    setMapCenter([location.lat, location.lng]);
    setShowAddressList(true);
  };

  const handleChooseLocation = () => {
    const selected = suggestedLocations.find(loc => loc.id === selectedMarker);
    if (selected) {
      onSelectLocation({
        name: selected.name,
        full: selected.full,
        lat: selected.lat,
        lng: selected.lng,
      });
    }
  };

  const handleRecenterMap = () => {
    const selected = suggestedLocations.find(loc => loc.id === selectedMarker);
    if (selected) {
      setMapCenter([selected.lat, selected.lng]);
    }
  };

  // Filter locations based on search query
  const filteredLocations = suggestedLocations.filter(location =>
    location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    location.full.toLowerCase().includes(searchQuery.toLowerCase()) ||
    location.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearchResultClick = (location: any) => {
    setSelectedMarker(location.id);
    setMapCenter([location.lat, location.lng]);
    setSearchQuery(location.name);
    setShowSearchResults(false);
    setShowAddressList(true);
  };

  return (
    <div className="fixed inset-0 bg-white z-[4000]">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-white/95 backdrop-blur-sm z-[4002] px-4 py-3 border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="active:scale-90 transition-transform"
          >
            <ArrowLeft className="w-6 h-6 text-[#121212]" />
          </button>
          
          <div className="flex-1 mx-3 relative">
            <div className="w-full flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#E2E8F0] rounded-full">
              <MapPin className="w-4 h-4 text-[#E11D48] flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(e.target.value.length > 0);
                  if (e.target.value.length === 0) {
                    setShowAddressList(true);
                  }
                }}
                onFocus={() => {
                  if (searchQuery.length > 0) {
                    setShowSearchResults(true);
                  }
                }}
                placeholder="Search for location..."
                className="flex-1 text-sm font-semibold text-[#121212] placeholder:text-[#94A3B8] placeholder:font-normal outline-none bg-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setShowSearchResults(false);
                    setShowAddressList(true);
                  }}
                  className="flex-shrink-0 active:scale-90 transition-transform"
                >
                  <svg className="w-4 h-4 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && filteredLocations.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-[#E2E8F0] rounded-2xl shadow-xl max-h-80 overflow-y-auto">
                {filteredLocations.map((location) => (
                  <button
                    key={location.id}
                    onClick={() => handleSearchResultClick(location)}
                    className="w-full p-4 border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8F9FA] active:bg-[#F1F5F9] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#F8F9FA] rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{location.icon}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-[#121212]">{location.name}</p>
                          <span className="text-xs px-2 py-0.5 bg-[#F8F9FA] text-[#64748B] rounded-full">
                            {location.label}
                          </span>
                        </div>
                        <p className="text-sm text-[#64748B]">{location.full}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && filteredLocations.length === 0 && searchQuery.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-[#E2E8F0] rounded-2xl shadow-xl p-4">
                <p className="text-sm text-[#64748B] text-center">No locations found</p>
              </div>
            )}
          </div>

          <button className="active:scale-90 transition-transform">
            <Menu className="w-6 h-6 text-[#121212]" />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="absolute inset-0 z-[4001]">
        <MapContainer
          center={mapCenter}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapCenterController center={mapCenter} />
          
          {suggestedLocations.map((location) => (
            <Marker
              key={location.id}
              position={[location.lat, location.lng]}
              icon={mainIcon}
              eventHandlers={{
                click: () => handleMarkerClick(location),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{location.name}</p>
                  <p className="text-[#64748B] text-xs">{location.label}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Recenter Button */}
        <button
          onClick={handleRecenterMap}
          className="absolute bottom-40 right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-[4003]"
        >
          <Navigation className="w-5 h-5 text-[#E11D48]" />
        </button>
      </div>

      {/* Bottom Panel - Address Suggestions */}
      {showAddressList && (
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[4004] max-h-[50vh] flex flex-col">
          {/* Drag Handle */}
          <div className="flex justify-center py-3 border-b border-[#E2E8F0]">
            <div className="w-12 h-1 bg-[#CBD5E1] rounded-full"></div>
          </div>

          {/* Address List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <h3 className="font-bold text-[#121212] mb-2">Suggested addresses</h3>
            {suggestedLocations.map((location) => (
              <button
                key={location.id}
                onClick={() => {
                  setSelectedMarker(location.id);
                  setMapCenter([location.lat, location.lng]);
                }}
                className={`w-full p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${
                  selectedMarker === location.id
                    ? 'border-[#10B981] bg-[#10B981]/5'
                    : 'border-[#E2E8F0] bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F8F9FA] rounded-full flex items-center justify-center">
                    <span className="text-lg">{location.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-[#121212]">{location.name}</p>
                      <span className="text-xs px-2 py-0.5 bg-[#F8F9FA] text-[#64748B] rounded-full">
                        {location.label}
                      </span>
                    </div>
                    <p className="text-sm text-[#64748B]">{location.full}</p>
                  </div>
                  {selectedMarker === location.id && (
                    <div className="w-6 h-6 bg-[#10B981] rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Choose Location Button */}
          <div className="px-5 py-4 border-t border-[#E2E8F0]">
            <button
              onClick={handleChooseLocation}
              className="w-full py-4 bg-[#10B981] hover:bg-[#059669] text-white font-bold rounded-2xl uppercase active:scale-95 transition-all shadow-lg"
            >
              Choose This Location
            </button>
          </div>
        </div>
      )}
    </div>
  );
}