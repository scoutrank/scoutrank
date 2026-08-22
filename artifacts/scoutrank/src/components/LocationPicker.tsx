import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { loadGoogleMaps } from '@/lib/googleMaps';

interface LocationPickerProps {
  city: string;
  state: string;
  onChange: (city: string, state: string) => void;
}

/**
 * Real Google Places autocomplete for searching suburbs/cities as you
 * type, plus a "use my location" button that reverse-geocodes your
 * actual GPS position into a city/state pair — both write back through
 * the same onChange, so whichever one the person uses, the result ends
 * up in the exact same two fields.
 */
export function LocationPicker({ city, state, onChange }: LocationPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(city);
  const [mapsReady, setMapsReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setInputValue(city); }, [city]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => { if (!cancelled) setMapsReady(true); }).catch(() => { if (!cancelled) setError('Could not load location search.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapsReady || !inputRef.current || autocompleteRef.current) return;
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['(cities)'],
      fields: ['address_components', 'formatted_address'],
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const components = place.address_components ?? [];
      const cityComp = components.find(c => c.types.includes('locality'))
        ?? components.find(c => c.types.includes('postal_town'))
        ?? components.find(c => c.types.includes('sublocality'));
      const stateComp = components.find(c => c.types.includes('administrative_area_level_1'));
      const resolvedCity = cityComp?.long_name ?? place.formatted_address?.split(',')[0] ?? '';
      const resolvedState = stateComp?.short_name ?? '';
      setInputValue(resolvedCity);
      onChange(resolvedCity, resolvedState || state);
    });
    autocompleteRef.current = autocomplete;
  }, [mapsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return; }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await loadGoogleMaps();
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }, (results, status) => {
            setLocating(false);
            if (status !== 'OK' || !results?.[0]) { setError('Could not determine your address from that location.'); return; }
            const components = results[0].address_components;
            const cityComp = components.find(c => c.types.includes('locality')) ?? components.find(c => c.types.includes('postal_town'));
            const stateComp = components.find(c => c.types.includes('administrative_area_level_1'));
            const resolvedCity = cityComp?.long_name ?? '';
            const resolvedState = stateComp?.short_name ?? '';
            setInputValue(resolvedCity);
            onChange(resolvedCity, resolvedState);
          });
        } catch {
          setLocating(false);
          setError('Could not load location lookup.');
        }
      },
      () => { setLocating(false); setError('Location permission denied — you can still search manually above.'); },
    );
  };

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          className="input-dark w-full pr-9"
          placeholder="Search for your suburb or city..."
          value={inputValue}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={e => { setInputValue(e.target.value); onChange(e.target.value, state); }}
        />
        <MapPin className="h-4 w-4 text-sr-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <button type="button" onClick={useMyLocation} disabled={locating}
        className="mt-2 flex items-center gap-1.5 text-xs text-sr-purple-light hover:text-white disabled:opacity-50">
        {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        {locating ? 'Finding your location...' : 'Use my current location'}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
