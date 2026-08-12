import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let loadPromise: Promise<void> | null = null
let currentKey = ''

/**
 * Load the Google Maps JavaScript API once per key using the new functional
 * loader API. Resolves once `google.maps` (including the Geocoder) is ready.
 */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (!apiKey) return Promise.reject(new Error('A Google Maps API key is required.'))
  if (loadPromise && currentKey === apiKey) return loadPromise

  currentKey = apiKey
  setOptions({ key: apiKey, v: 'weekly' })

  loadPromise = Promise.all([
    importLibrary('core'),
    importLibrary('maps'),
    importLibrary('geocoding'),
  ])
    .then(() => undefined)
    .catch((err: unknown) => {
      loadPromise = null
      currentKey = ''
      throw err
    })
  return loadPromise
}
