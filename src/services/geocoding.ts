import type { LatLng } from '../types'

export interface GeocodeResult {
  coords: LatLng | null
  error?: string
}

/** Geocode a single address using the client-side Google Maps Geocoder. */
export function geocodeAddress(address: string): Promise<GeocodeResult> {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
      resolve({ coords: null, error: 'Google Maps is not loaded.' })
      return
    }
    const geocoder = new google.maps.Geocoder()

    // Guard against the callback never firing (e.g. a bad API key).
    const timer = setTimeout(() => {
      resolve({ coords: null, error: 'Geocoding timed out.' })
    }, 10_000)

    geocoder.geocode({ address }, (results, status) => {
      clearTimeout(timer)
      if (status === 'OK' && results && results.length > 0) {
        const loc = results[0].geometry.location
        resolve({ coords: { lat: loc.lat(), lng: loc.lng() } })
      } else if (status === 'ZERO_RESULTS') {
        resolve({ coords: null, error: 'No results for this address.' })
      } else {
        resolve({ coords: null, error: `Geocoding failed: ${status}` })
      }
    })
  })
}
