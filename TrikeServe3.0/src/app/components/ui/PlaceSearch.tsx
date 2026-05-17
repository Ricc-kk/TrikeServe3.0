import { useEffect, useRef, useState } from 'react';
import {
  autocompletePlacesNew,
  createPlacesSessionToken,
  fetchPlaceDetailsNew,
  isWithinCityOrArea,
  type PlaceResult,
  type PlacesAutocompleteSuggestion,
} from '@/lib/placesApi';

interface PlaceSearchProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  // Bias suggestions around a location and optionally restrict to a city name
  locationBias?: { lat: number; lng: number; radius?: number };
  restrictToCity?: string; // e.g., "Valenzuela"
}

export default function PlaceSearch({ value, onChange, onSelect, placeholder, className, locationBias, restrictToCity }: PlaceSearchProps) {
  const [predictions, setPredictions] = useState<PlacesAutocompleteSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionTokenRef = useRef<string>(createPlacesSessionToken());
  const debounceTimer = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setPredictions([]);
      setErrorMessage(null);
      sessionTokenRef.current = createPlacesSessionToken();
      abortControllerRef.current?.abort();
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
        if (!apiKey) {
          setPredictions([]);
          setErrorMessage('Google Maps API key is not configured.');
          return;
        }

        const suggestions = await autocompletePlacesNew({
          input: trimmed,
          apiKey,
          locationBias,
          restrictToCountry: 'ph',
          sessionToken: sessionTokenRef.current,
        });

        const normalized = restrictToCity
          ? suggestions.filter((item) => {
              const cityLower = restrictToCity.toLowerCase();
              return (
                item.displayName.toLowerCase().includes(cityLower) ||
                (item.secondaryText || '').toLowerCase().includes(cityLower) ||
                (item.fullText || '').toLowerCase().includes(cityLower)
              );
            })
          : suggestions;

        setPredictions(normalized);
        setErrorMessage(null);
      } catch (error: any) {
        if (abortControllerRef.current?.signal.aborted) return;
        console.warn('Places autocomplete failed:', error);
        setPredictions([]);
        setErrorMessage(error?.message || 'Unable to load location suggestions.');
      }
    }, 250);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [value, locationBias, restrictToCity]);

  const handleSelectPrediction = async (prediction: PlacesAutocompleteSuggestion) => {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
      if (!apiKey) return;

      const place = await fetchPlaceDetailsNew({
        placeId: prediction.place_id,
        apiKey,
        sessionToken: sessionTokenRef.current,
      });

      if (!place) return;

      if (restrictToCity && restrictToCity.length > 0 && !isWithinCityOrArea(place, restrictToCity)) {
        console.warn('Selected place is not within', restrictToCity, place.formatted_address);
        setPredictions([]);
        setErrorMessage(`Please choose a location within ${restrictToCity}.`);
        return;
      }

      onSelect(place);
      setPredictions([]);
      setErrorMessage(null);
      sessionTokenRef.current = createPlacesSessionToken();
    } catch (error: any) {
      console.warn('Place details lookup failed:', error);
      setErrorMessage(error?.message || 'Unable to load place details.');
    }
  };

  return (
	<div className="relative">
	  <input
		className={className || 'w-full px-4 py-2 border-2 border-gray-200 rounded-lg'}
		placeholder={placeholder || 'Search location'}
		value={value}
		onChange={(e) => onChange(e.target.value)}
		autoComplete="off"
	  />

	  {errorMessage && (
		<div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
		  {errorMessage}
		</div>
	  )}

	  {predictions && predictions.length > 0 && (
		<div className="absolute left-0 right-0 bg-white border border-gray-200 mt-1 rounded shadow-lg z-[3000] max-h-60 overflow-auto">
		  {predictions.map((p) => (
			<button
			  key={p.place_id}
			  onClick={() => handleSelectPrediction(p)}
			  className="w-full text-left p-3 hover:bg-gray-50"
			>
			  <div className="text-sm font-medium">{p.displayName}</div>
			  <div className="text-xs text-gray-500">{p.secondaryText || p.fullText}</div>
			</button>
		  ))}
		</div>
	  )}
	</div>
  );
}



