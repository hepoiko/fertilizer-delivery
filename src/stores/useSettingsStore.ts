import { computed, reactive } from 'vue'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'
import type { Settings } from '../types'

const DEFAULTS: Settings = { apiKey: '', startingPoint: '' }

const state = reactive<Settings>(loadJSON<Settings>(STORAGE_KEYS.settings, DEFAULTS))

const ENV_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ''

function persist(): void {
  saveJSON(STORAGE_KEYS.settings, { apiKey: state.apiKey, startingPoint: state.startingPoint })
}

export function useSettingsStore() {
  /** Saved key first, then the build-time env var as a fallback. */
  const effectiveApiKey = computed(() => state.apiKey.trim() || ENV_KEY)

  function setApiKey(key: string): void {
    state.apiKey = key.trim()
    persist()
  }

  function setStartingPoint(point: string): void {
    state.startingPoint = point.trim()
    persist()
  }

  return { settings: state, effectiveApiKey, setApiKey, setStartingPoint }
}
