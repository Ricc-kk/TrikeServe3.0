import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import PlaceSearch from "../ui/PlaceSearch";
import { VALENZUELA_BIAS } from "@/lib/googleMaps";
import ActiveRideButton from "./ActiveRideButton";

// Get Google Maps API Key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function MyDestination() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const handleSetDestination = () => {
    navigate('/rider');
  };
  const handleSelectDestination = (place: any) => {
    if (!place) return;
    setDestination(place.formatted_address || place.name || '');
    console.log('✅ Destination selected:', place);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
          My Destination
        </h1>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-sm text-[#64748B] mb-3">
          Set your preferred destination to receive relevant trip requests
        </p>

        {!GOOGLE_MAPS_API_KEY ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-700">
              ⚠️ Google Maps API key is not configured. Please add it to .env.local to enable address/location search.
            </p>
          </div>
        ) : (
          <PlaceSearch
            value={destination}
            onChange={setDestination}
            onSelect={handleSelectDestination}
            placeholder="Search for an address, landmark, or destination (e.g., Gen T Deleon Valenzuela City)"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#E11D48] focus:outline-none"
            locationBias={VALENZUELA_BIAS}
            restrictToCity="Valenzuela"
          />
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
          <p className="text-sm text-blue-700">
            💡 Start typing an address, landmark, or location name. Select a suggestion to populate the field.
          </p>
        </div>

        <Button 
          onClick={handleSetDestination}
          className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase mt-4"
        >
          Set Destination
        </Button>
      </div>
      <ActiveRideButton />
    </div>
  );
}
