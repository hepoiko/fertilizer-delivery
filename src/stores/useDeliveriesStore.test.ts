import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const { useDeliveriesStore } = await import('./useDeliveriesStore')
  return { useDeliveriesStore }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('useDeliveriesStore.addOrder', () => {
  it('builds a pending delivery from the order input', async () => {
    const { useDeliveriesStore } = await load()
    const { addOrder, deliveries } = useDeliveriesStore()

    const created = addOrder({
      referenceId: 'REF-001',
      address: ' 123 Main St, Springfield, IL ',
      items: [{ productId: 'NPK-101', quantity: 5 }],
    })

    expect(created.id).toBeTruthy()
    expect(created.reference).toBe('REF-001')
    expect(created.label).toBe('REF-001')
    expect(created.address).toBe('123 Main St, Springfield, IL')
    expect(created.items).toEqual([{ productId: 'NPK-101', quantity: 5 }])
    expect(created.row).toEqual({ Reference: 'REF-001' })
    expect(created.status).toBe('pending')
    expect(created.geocodeState).toBe('pending')
    expect(created.lat).toBeNull()
    expect(created.lng).toBeNull()
    expect(deliveries.value).toHaveLength(1)
  })

  it('appends multiple orders', async () => {
    const { useDeliveriesStore } = await load()
    const { addOrder, deliveries } = useDeliveriesStore()
    addOrder({ referenceId: 'A', address: '1 St', items: [] })
    addOrder({ referenceId: 'B', address: '2 St', items: [] })
    expect(deliveries.value).toHaveLength(2)
  })

  it('persists orders across reloads', async () => {
    const { useDeliveriesStore } = await load()
    useDeliveriesStore().addOrder({
      referenceId: 'REF-001',
      address: '123 Main St',
      items: [{ productId: 'NPK-101', quantity: 2 }],
    })

    const { useDeliveriesStore: reloaded } = await load()
    const list = reloaded().deliveries.value
    expect(list).toHaveLength(1)
    expect(list[0].items).toEqual([{ productId: 'NPK-101', quantity: 2 }])
  })
})
