import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Delivery, Settings } from '../types'

const settings: Settings = { apiKey: 'AIzaFAKEKEY', startingPoint: 'Depot St, Springfield, IL' }

const delivery = (overrides: Partial<Delivery> = {}): Delivery => ({
  id: 'd1',
  row: { Customer: 'Green Acres Farm', Address: '123 Main St, Springfield, IL 62704' },
  reference: 'REF-001',
  address: '123 Main St, Springfield, IL 62704',
  label: 'Green Acres Farm',
  geocodeState: 'geocoded',
  lat: 39.7817,
  lng: -89.6501,
  status: 'pending',
  ...overrides,
})

// Stores are module-level singletons tied to localStorage; reload them fresh per test.
async function load() {
  vi.resetModules()
  localStorage.clear()
  const { useSettingsStore } = await import('../stores/useSettingsStore')
  const { useDeliveriesStore } = await import('../stores/useDeliveriesStore')
  const transfer = await import('./transfer')
  return { useSettingsStore, useDeliveriesStore, transfer }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('serializeSnapshot', () => {
  it('captures current settings and deliveries', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey(settings.apiKey)
    useSettingsStore().setStartingPoint(settings.startingPoint)
    useDeliveriesStore().replaceAll([delivery()])

    const payload = transfer.serializeSnapshot()

    expect(payload.version).toBe(1)
    expect(payload.settings).toEqual(settings)
    expect(typeof payload.sentAt).toBe('string')
    expect(payload.deliveries).toEqual([delivery()])
  })
})

describe('parseSnapshot', () => {
  it('round-trips a serialized payload', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey(settings.apiKey)
    useDeliveriesStore().replaceAll([delivery()])

    const payload = transfer.serializeSnapshot()
    expect(transfer.parseSnapshot(JSON.stringify(payload))).toEqual(payload)
  })

  it('rejects malformed JSON', async () => {
    const { transfer } = await load()
    expect(() => transfer.parseSnapshot('{not json')).toThrow()
  })

  it('rejects an unsupported version', async () => {
    const { transfer } = await load()
    const bad = { version: 2, sentAt: 'x', settings, deliveries: [] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow(/version/i)
  })

  it('rejects payloads with missing settings fields', async () => {
    const { transfer } = await load()
    const bad = { version: 1, sentAt: 'x', settings: { apiKey: 'k' }, deliveries: [] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow()
  })

  it('rejects deliveries missing required fields', async () => {
    const { transfer } = await load()
    const bad = { version: 1, sentAt: 'x', settings, deliveries: [{ id: 'd1' }] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow()
  })
})

describe('applySnapshot', () => {
  it('replace overwrites settings and deliveries', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey('OLD_KEY')
    useDeliveriesStore().replaceAll([delivery({ id: 'old', reference: 'REF-OLD' })])

    transfer.applySnapshot(
      { version: 1, sentAt: 'x', settings, deliveries: [delivery()] },
      'replace',
    )

    expect(useSettingsStore().settings.apiKey).toBe(settings.apiKey)
    const list = useDeliveriesStore().deliveries.value
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('d1')
  })

  it('merge keeps receiver settings and updates matching reference', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey('RECEIVER_KEY')
    useDeliveriesStore().replaceAll([
      delivery({ id: 'existing', reference: 'REF-001', address: 'Old Address', label: 'Old', geocodeState: 'geocoded' }),
    ])

    const result = transfer.applySnapshot(
      { version: 1, sentAt: 'x', settings, deliveries: [delivery()] },
      'merge',
    )

    expect(result).toEqual({ added: 0, updated: 1 })
    expect(useSettingsStore().settings.apiKey).toBe('RECEIVER_KEY')
    const list = useDeliveriesStore().deliveries.value
    expect(list).toHaveLength(1)
    expect(list[0].address).toBe('123 Main St, Springfield, IL 62704')
    expect(list[0].geocodeState).toBe('pending')
    expect(list[0].lat).toBeNull()
  })

  it('merge appends deliveries with new references', async () => {
    const { useDeliveriesStore, transfer } = await load()
    useDeliveriesStore().replaceAll([delivery({ id: 'existing', reference: 'REF-001' })])

    const result = transfer.applySnapshot(
      {
        version: 1,
        sentAt: 'x',
        settings,
        deliveries: [delivery(), delivery({ id: 'd2', reference: 'REF-002', label: 'Sunrise Dairy' })],
      },
      'merge',
    )

    expect(result).toEqual({ added: 1, updated: 1 })
    expect(useDeliveriesStore().deliveries.value).toHaveLength(2)
  })
})
