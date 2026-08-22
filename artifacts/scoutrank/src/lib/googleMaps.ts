/**
 * Loads the Google Maps JavaScript API (with the Places library) exactly
 * once, no matter how many components ask for it — subsequent calls
 * just resolve against the same in-flight/already-loaded promise
 * instead of injecting duplicate script tags.
 *
 * Uses Google's actual required pattern for &loading=async: a named
 * global callback that Google itself calls once everything (including
 * the places library) is truly ready — script.onload alone fires too
 * early under async loading and was causing "Cannot read properties of
 * undefined (reading 'Autocomplete')" a fraction of a second before the
 * library had actually finished initializing.
 */
let loadPromise: Promise<void> | null = null;

const GOOGLE_MAPS_API_KEY = 'AIzaSyB9EXXvLVWfrX97e7oG4kn5KpjrrLYODjU';
const CALLBACK_NAME = '__scoutRankGoogleMapsReady';

export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('Not in a browser environment.')); return; }
    const w = window as unknown as { google?: unknown; [key: string]: unknown };
    if (w.google) { resolve(); return; }

    w[CALLBACK_NAME] = () => resolve();

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => { loadPromise = null; reject(new Error('Failed to load Google Maps.')); };
    document.head.appendChild(script);
  });

  return loadPromise;
}
