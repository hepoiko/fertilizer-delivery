import type { Delivery, Settings } from '../types'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import { useSettingsStore } from '../stores/useSettingsStore'

export interface TransferPayload {
  version: 1
  sentAt: string
  settings: Settings
  deliveries: Delivery[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isDelivery(v: unknown): v is Delivery {
  if (!isRecord(v)) return false
  if (typeof v.id !== 'string') return false
  if (typeof v.address !== 'string') return false
  if (typeof v.label !== 'string') return false
  if (typeof v.status !== 'string') return false
  if (!['pending', 'in-transit', 'delivered'].includes(v.status)) return false
  if (typeof v.geocodeState !== 'string') return false
  if (!['pending', 'geocoding', 'geocoded', 'failed'].includes(v.geocodeState)) return false
  if (v.lat !== null && typeof v.lat !== 'number') return false
  if (v.lng !== null && typeof v.lng !== 'number') return false
  if (v.reference !== undefined && typeof v.reference !== 'string') return false
  return true
}

function isValidPayload(v: unknown): v is TransferPayload {
  if (!isRecord(v)) return false
  if (v.version !== 1) return false
  if (typeof v.sentAt !== 'string') return false
  if (!isRecord(v.settings)) return false
  if (typeof v.settings.apiKey !== 'string') return false
  if (typeof v.settings.startingPoint !== 'string') return false
  if (!Array.isArray(v.deliveries)) return false
  return v.deliveries.every(isDelivery)
}

/** Build a transfer payload from the current stores. */
export function serializeSnapshot(): TransferPayload {
  const { settings } = useSettingsStore()
  const { deliveries } = useDeliveriesStore()
  return {
    version: 1,
    sentAt: new Date().toISOString(),
    settings: { apiKey: settings.apiKey, startingPoint: settings.startingPoint },
    deliveries: deliveries.value.map((d) => ({ ...d })),
  }
}

/** Parse and structurally validate an incoming payload string. Throws with a clear message on garbage. */
export function parseSnapshot(raw: string): TransferPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Received data is not valid JSON.')
  }
  if (!isValidPayload(parsed)) {
    if (isRecord(parsed) && parsed.version !== undefined && parsed.version !== 1) {
      throw new Error(`Unsupported snapshot version: ${String(parsed.version)}. Expected version 1.`)
    }
    throw new Error('Received data is not a valid Delivery Manager snapshot.')
  }
  return parsed
}

/** Write a validated payload into the stores. Replace overwrites everything; merge keeps receiver settings and merges deliveries by reference. */
export function applySnapshot(
  payload: TransferPayload,
  mode: 'replace' | 'merge',
): { added: number; updated: number } {
  const { setApiKey, setStartingPoint } = useSettingsStore()
  const { replaceAll, mergeByReference } = useDeliveriesStore()

  if (mode === 'replace') {
    setApiKey(payload.settings.apiKey)
    setStartingPoint(payload.settings.startingPoint)
    replaceAll(payload.deliveries)
    return { added: payload.deliveries.length, updated: 0 }
  }
  return mergeByReference(payload.deliveries)
}
