import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const { useCatalogStore } = await import('./useCatalogStore')
  return { useCatalogStore }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('useCatalogStore', () => {
  it('addProduct stores a product', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    expect(s.addProduct('NPK-101', 'N-P-K 10-10-10')).toBe(true)
    expect(s.products.value).toHaveLength(1)
    expect(s.products.value[0]).toMatchObject({ productId: 'NPK-101', description: 'N-P-K 10-10-10' })
  })

  it('rejects a duplicate productId case-insensitively', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    s.addProduct('NPK-101', 'First')
    expect(s.addProduct('npk-101', 'Second')).toBe(false)
    expect(s.products.value).toHaveLength(1)
  })

  it('updateProduct edits fields', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    s.addProduct('NPK-101', 'Old desc')
    const id = s.products.value[0].id
    expect(s.updateProduct(id, { description: 'New desc' })).toBe(true)
    expect(s.products.value[0].description).toBe('New desc')
  })

  it('updateProduct rejects a productId collision with another product', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    s.addProduct('NPK-101', 'A')
    s.addProduct('UREA-46', 'B')
    const urea = s.products.value.find((p) => p.productId === 'UREA-46')!
    expect(s.updateProduct(urea.id, { productId: 'NPK-101' })).toBe(false)
    expect(s.products.value.find((p) => p.id === urea.id)!.productId).toBe('UREA-46')
  })

  it('updateProduct returns false for a missing id', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    expect(s.updateProduct('nope', { description: 'x' })).toBe(false)
  })

  it('deleteProduct removes the product', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    s.addProduct('NPK-101', 'A')
    const id = s.products.value[0].id
    s.deleteProduct(id)
    expect(s.products.value).toHaveLength(0)
  })

  it('hasProduct matches case-insensitively', async () => {
    const { useCatalogStore } = await load()
    const s = useCatalogStore()
    s.addProduct('NPK-101', 'A')
    expect(s.hasProduct('npk-101')).toBe(true)
    expect(s.hasProduct('UREA-46')).toBe(false)
  })

  it('persists across reloads', async () => {
    const { useCatalogStore } = await load()
    useCatalogStore().addProduct('NPK-101', 'A')

    const { useCatalogStore: reloaded } = await load()
    expect(reloaded().products.value).toHaveLength(1)
    expect(reloaded().products.value[0].productId).toBe('NPK-101')
  })
})
