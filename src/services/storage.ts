const PREFIX = 'fertilizer-delivery:'

export const STORAGE_KEYS = {
  settings: 'settings',
  deliveries: 'deliveries',
  catalog: 'catalog',
} as const

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`Failed to load "${key}" from localStorage`, err)
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (err) {
    console.error(`Failed to save "${key}" to localStorage`, err)
  }
}

export function removeKey(key: string): void {
  localStorage.removeItem(PREFIX + key)
}
