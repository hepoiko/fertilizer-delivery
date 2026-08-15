import { computed, reactive } from 'vue'
import { geocodeAddress } from '../services/geocoding'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'
import type { Delivery, DeliveryStatus } from '../types'

interface DeliveriesState {
  deliveries: Delivery[]
  geocoding: boolean
  progress: { done: number; total: number }
}

const state = reactive<DeliveriesState>({
  deliveries: loadJSON<Delivery[]>(STORAGE_KEYS.deliveries, []),
  geocoding: false,
  progress: { done: 0, total: 0 },
})

const CONCURRENCY = 5
const GAP_MS = 120
const coordCache = new Map<string, { lat: number; lng: number }>()

const normalizeKey = (address: string) => address.trim().toLowerCase().replace(/\s+/g, ' ')

function persist(): void {
  saveJSON(STORAGE_KEYS.deliveries, state.deliveries)
}

export function useDeliveriesStore() {
  const deliveries = computed<Delivery[]>(() => state.deliveries)
  const geocoding = computed(() => state.geocoding)
  const progress = computed(() => state.progress)

  function replaceAll(items: Delivery[]): void {
    state.deliveries = items
    persist()
  }

  function append(items: Delivery[]): void {
    state.deliveries.push(...items)
    persist()
  }

  /** Update existing deliveries by reference; unmatched items are appended. Returns added/updated counts. */
  function mergeByReference(items: Delivery[]): { added: number; updated: number } {
    let updated = 0
    const byRef = new Map<string, Delivery>()
    for (const d of state.deliveries) {
      if (d.reference) byRef.set(normalizeKey(d.reference), d)
    }

    const added: Delivery[] = []
    for (const item of items) {
      const ref = item.reference
      if (!ref) {
        added.push(item)
        continue
      }
      const existing = byRef.get(normalizeKey(ref))
      if (!existing) {
        byRef.set(normalizeKey(ref), item)
        added.push(item)
        continue
      }
      existing.reference = ref
      existing.row = item.row
      existing.label = item.label
      if (existing.address !== item.address) {
        existing.address = item.address
        existing.geocodeState = 'pending'
        existing.lat = null
        existing.lng = null
        existing.geocodeError = undefined
      }
      updated++
    }

    state.deliveries.push(...added)
    persist()
    return { added: added.length, updated }
  }

  function setStatus(id: string, status: DeliveryStatus): void {
    const d = state.deliveries.find((x) => x.id === id)
    if (d) {
      d.status = status
      persist()
    }
  }

  function clearAll(): void {
    state.deliveries = []
    state.progress = { done: 0, total: 0 }
    state.geocoding = false
    persist()
  }

  function resetGeocodeState(): void {
    for (const d of state.deliveries) {
      d.geocodeState = 'pending'
      d.lat = null
      d.lng = null
      d.geocodeError = undefined
    }
    persist()
  }

  async function geocodeAll(): Promise<void> {
    const pending = state.deliveries.filter((d) => d.geocodeState === 'pending')
    if (pending.length === 0 || state.geocoding) return

    state.geocoding = true
    state.progress = { done: 0, total: pending.length }

    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < pending.length) {
        const d = pending[cursor++]
        d.geocodeState = 'geocoding'
        try {
          const key = normalizeKey(d.address)
          const cached = coordCache.get(key)
          if (cached) {
            d.lat = cached.lat
            d.lng = cached.lng
            d.geocodeState = 'geocoded'
          } else {
            const { coords, error } = await geocodeAddress(d.address)
            if (coords) {
              coordCache.set(key, coords)
              d.lat = coords.lat
              d.lng = coords.lng
              d.geocodeState = 'geocoded'
            } else {
              d.geocodeState = 'failed'
              d.geocodeError = error ?? 'Unable to geocode'
            }
          }
        } catch (err) {
          d.geocodeState = 'failed'
          d.geocodeError = err instanceof Error ? err.message : String(err)
        } finally {
          state.progress.done++
          persist()
          await new Promise((r) => setTimeout(r, GAP_MS))
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    state.geocoding = false
  }

  function retryFailed(): Promise<void> {
    for (const d of state.deliveries) {
      if (d.geocodeState === 'failed') {
        d.geocodeState = 'pending'
        d.geocodeError = undefined
      }
    }
    persist()
    return geocodeAll()
  }

  const stats = computed(() => {
    const total = state.deliveries.length
    return {
      total,
      geocoded: state.deliveries.filter((d) => d.geocodeState === 'geocoded').length,
      failed: state.deliveries.filter((d) => d.geocodeState === 'failed').length,
      pendingCount: state.deliveries.filter((d) => d.geocodeState === 'pending').length,
      byStatus: {
        pending: state.deliveries.filter((d) => d.status === 'pending').length,
        'in-transit': state.deliveries.filter((d) => d.status === 'in-transit').length,
        delivered: state.deliveries.filter((d) => d.status === 'delivered').length,
      } as Record<DeliveryStatus, number>,
    }
  })

  return {
    deliveries,
    geocoding,
    progress,
    stats,
    replaceAll,
    append,
    mergeByReference,
    setStatus,
    clearAll,
    resetGeocodeState,
    geocodeAll,
    retryFailed,
  }
}
