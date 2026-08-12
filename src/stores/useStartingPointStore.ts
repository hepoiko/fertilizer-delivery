import { reactive, watch } from 'vue'
import { geocodeAddress } from '../services/geocoding'
import type { LatLng } from '../types'
import { useSettingsStore } from './useSettingsStore'

interface StartingPointState {
  coords: LatLng | null
  loading: boolean
  error: string
}

const state = reactive<StartingPointState>({ coords: null, loading: false, error: '' })
let initialized = false
let regeocodeFn: (() => Promise<void>) | null = null

async function geocode(addr: string): Promise<void> {
  if (!addr) {
    state.coords = null
    state.loading = false
    state.error = ''
    return
  }
  state.loading = true
  state.error = ''
  try {
    const { coords, error } = await geocodeAddress(addr)
    state.coords = coords
    state.error = coords ? '' : (error ?? 'Could not geocode starting point')
  } catch (err) {
    state.coords = null
    state.error = err instanceof Error ? err.message : String(err)
  } finally {
    state.loading = false
  }
}

/** Geocodes the configured starting point once and shares the result across components. */
export function useStartingPointStore() {
  if (!initialized) {
    const { settings } = useSettingsStore()
    regeocodeFn = () => geocode(settings.startingPoint)
    watch(() => settings.startingPoint, (addr) => geocode(addr), { immediate: true })
    initialized = true
  }
  return { startingPoint: state, regeocode: () => regeocodeFn?.() }
}
