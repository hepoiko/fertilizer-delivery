import { computed, reactive } from 'vue'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'
import type { Product } from '../types'
import { uid } from '../utils/id'

interface CatalogState {
  products: Product[]
}

const state = reactive<CatalogState>({
  products: loadJSON<Product[]>(STORAGE_KEYS.catalog, []),
})

const key = (productId: string) => productId.trim().toLowerCase()

function persist(): void {
  saveJSON(STORAGE_KEYS.catalog, state.products)
}

export function useCatalogStore() {
  const products = computed<Product[]>(() => state.products)

  function hasProduct(productId: string): boolean {
    const k = key(productId)
    return state.products.some((p) => key(p.productId) === k)
  }

  function addProduct(productId: string, description: string): boolean {
    if (hasProduct(productId)) return false
    state.products.push({ id: uid(), productId: productId.trim(), description: description.trim() })
    persist()
    return true
  }

  function updateProduct(id: string, patch: { productId?: string; description?: string }): boolean {
    const product = state.products.find((p) => p.id === id)
    if (!product) return false
    if (patch.productId !== undefined) {
      const k = key(patch.productId)
      const collides = state.products.some((p) => p.id !== id && key(p.productId) === k)
      if (collides) return false
      product.productId = patch.productId.trim()
    }
    if (patch.description !== undefined) product.description = patch.description.trim()
    persist()
    return true
  }

  function deleteProduct(id: string): void {
    const idx = state.products.findIndex((p) => p.id === id)
    if (idx !== -1) {
      state.products.splice(idx, 1)
      persist()
    }
  }

  return { products, hasProduct, addProduct, updateProduct, deleteProduct }
}
