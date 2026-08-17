# Manual Entry (Product Catalog + Delivery Orders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow manual entry of a product catalog (productId + description) and delivery orders (referenceId, address, line items with quantity), alongside the existing CSV import.

**Architecture:** Two new stores (`useCatalogStore` for products, `addOrder` on the existing `useDeliveriesStore`), a pure `validateOrder` function for form enforcement, and two new tabs (`Products`, `New Order`). Manual orders reuse the existing delivery pipeline: pending status, geocoding, map/list display. CSV import is untouched.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, Pinia-less reactive stores (existing `useXStore` module-singleton pattern), vitest + happy-dom, localStorage via `src/services/storage.ts`.

**Spec:** `docs/superpowers/specs/2026-08-17-manual-entry-design.md`

## Global Constraints

- All storage through `src/services/storage.ts` (`loadJSON`/`saveJSON`) — never touch `localStorage` directly.
- Store pattern must mirror existing stores: module-level `reactive` state, `persist()` calls, `computed` getters, plain functions returned from `useXStore()`.
- `Delivery.items` is **optional** (`items?: OrderItem[]`) — CSV/transfer paths must keep working without it.
- IDs via `uid()` from `src/utils/id.ts`.
- Duplicate `productId` detection is case-insensitive.
- Tests use vitest; store tests must `vi.resetModules()` + `localStorage.clear()` before each test (see `src/services/transfer.test.ts` pattern).
- Run `pnpm test`, `pnpm type-check`, and `pnpm build` before finishing.

---

### Task 1: Data model types + catalog storage key

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/storage.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface Product { id: string; productId: string; description: string }`
  - `interface OrderItem { productId: string; quantity: number }`
  - `Delivery` gains `items?: OrderItem[]`
  - `STORAGE_KEYS.catalog` (value `'catalog'`)

- [ ] **Step 1: Add `Product` and `OrderItem` types and extend `Delivery`**

In `src/types/index.ts`, after the `LatLng` interface:

```ts
export interface Product {
  id: string
  productId: string
  description: string
}

export interface OrderItem {
  productId: string
  quantity: number
}
```

Add `items?: OrderItem[]` to the `Delivery` interface (after `status`, before `geocodeError`):

```ts
  status: DeliveryStatus
  items?: OrderItem[]
  geocodeError?: string
```

- [ ] **Step 2: Add the catalog storage key**

In `src/services/storage.ts`:

```ts
export const STORAGE_KEYS = {
  settings: 'settings',
  deliveries: 'deliveries',
  catalog: 'catalog',
} as const
```

- [ ] **Step 3: Verify type-check passes**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/storage.ts
git commit -m "feat: add product and order-item types"
```

---

### Task 2: Order validation service

**Files:**
- Create: `src/services/order.ts`
- Create: `src/services/order.test.ts`

**Interfaces:**
- Consumes: `OrderItem` type from `../types`.
- Produces: `validateOrder(input: { referenceId: string; address: string; items: OrderItem[] }, products: Product[]): string[]` — returns a list of error strings; empty array means valid.

- [ ] **Step 1: Write the failing test**

Create `src/services/order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { OrderItem, Product } from '../types'
import { validateOrder } from './order'

const products: Product[] = [
  { id: 'p1', productId: 'NPK-101', description: 'N-P-K 10-10-10' },
  { id: 'p2', productId: 'UREA-46', description: 'Urea 46%' },
]

const item = (productId: string, quantity = 1): OrderItem => ({ productId, quantity })

describe('validateOrder', () => {
  it('returns no errors for a valid order', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101', 5)] }, products)).toEqual([])
  })

  it('rejects an empty referenceId', () => {
    expect(validateOrder({ referenceId: '  ', address: '123 Main St', items: [item('NPK-101')] }, products)).toEqual(['referenceId is required'])
  })

  it('rejects an empty address', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '', items: [item('NPK-101')] }, products)).toEqual(['address is required'])
  })

  it('rejects an order with no line items', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [] }, products)).toEqual(['at least one product is required'])
  })

  it('rejects line items whose productId is not in the catalog', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101'), item('UNKNOWN')] }, products)).toEqual(['Unknown product: UNKNOWN'])
  })

  it('rejects a line item with quantity less than 1', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101', 0)] }, products)).toEqual(['quantity must be at least 1'])
  })

  it('matches productId case-insensitively', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('npk-101')] }, products)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/services/order.test.ts`
Expected: FAIL — module `./order` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/order.ts`:

```ts
import type { OrderItem, Product } from '../types'

export interface OrderInput {
  referenceId: string
  address: string
  items: OrderItem[]
}

/** Validate a manual order form. Returns a list of error strings; empty means valid. */
export function validateOrder(input: OrderInput, products: Product[]): string[] {
  const errors: string[] = []
  if (!input.referenceId.trim()) errors.push('referenceId is required')
  if (!input.address.trim()) errors.push('address is required')
  if (input.items.length === 0) {
    errors.push('at least one product is required')
    return errors
  }
  const known = new Set(products.map((p) => p.productId.toLowerCase()))
  for (const item of input.items) {
    if (!known.has(item.productId.trim().toLowerCase())) {
      errors.push(`Unknown product: ${item.productId}`)
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      errors.push('quantity must be at least 1')
    }
  }
  return errors
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/services/order.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/order.ts src/services/order.test.ts
git commit -m "feat: add order validation service"
```

---

### Task 3: Product catalog store

**Files:**
- Create: `src/stores/useCatalogStore.ts`
- Create: `src/stores/useCatalogStore.test.ts`

**Interfaces:**
- Consumes: `STORAGE_KEYS.catalog`, `loadJSON`, `saveJSON` from `../services/storage`; `uid` from `../utils/id`; `Product` type from `../types`.
- Produces:
  - `products: ComputedRef<Product[]>`
  - `addProduct(productId: string, description: string): boolean` — returns `false` (no mutation) on case-insensitive duplicate `productId`
  - `updateProduct(id: string, patch: { productId?: string; description?: string }): boolean` — returns `false` if id not found or the new `productId` collides with a *different* product
  - `deleteProduct(id: string): void`
  - `hasProduct(productId: string): boolean` — case-insensitive existence check

- [ ] **Step 1: Write the failing test**

Create `src/stores/useCatalogStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  localStorage.clear()
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/stores/useCatalogStore.test.ts`
Expected: FAIL — module `./useCatalogStore` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/stores/useCatalogStore.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/stores/useCatalogStore.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/useCatalogStore.ts src/stores/useCatalogStore.test.ts
git commit -m "feat: add product catalog store"
```

---

### Task 4: Manual order creation in deliveries store

**Files:**
- Modify: `src/services/csv.ts` (export `normalizeAddress`)
- Modify: `src/stores/useDeliveriesStore.ts`
- Create: `src/stores/useDeliveriesStore.test.ts`

**Interfaces:**
- Consumes: `normalizeAddress` from `../services/csv`; `uid` from `../utils/id`; `OrderItem`, `Delivery` from `../types`.
- Produces: `addOrder(input: { referenceId: string; address: string; items: OrderItem[] }): Delivery` — appends a `pending`/`geocodeState: 'pending'` delivery with `reference`/`label` = referenceId, `row: { Reference: referenceId }`, normalized address, and the given `items`, then persists. Returns the created delivery.

- [ ] **Step 1: Export `normalizeAddress` from csv.ts**

In `src/services/csv.ts`, change:

```ts
const normalizeAddress = (raw: string): string =>
```

to:

```ts
export const normalizeAddress = (raw: string): string =>
```

- [ ] **Step 2: Write the failing test**

Create `src/stores/useDeliveriesStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  localStorage.clear()
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/stores/useDeliveriesStore.test.ts`
Expected: FAIL — `addOrder` is not a function.

- [ ] **Step 4: Implement `addOrder`**

In `src/stores/useDeliveriesStore.ts`:
- Add imports: `normalizeAddress` from `../services/csv`, `uid` from `../utils/id`, and `OrderItem` from `../types`.
- Add the function (after `mergeByReference`):

```ts
  /** Create a delivery from a manually-entered order. */
  function addOrder(input: { referenceId: string; address: string; items: OrderItem[] }): Delivery {
    const delivery: Delivery = {
      id: uid(),
      row: { Reference: input.referenceId },
      reference: input.referenceId,
      address: normalizeAddress(input.address),
      label: input.referenceId,
      items: input.items,
      geocodeState: 'pending',
      lat: null,
      lng: null,
      status: 'pending',
    }
    state.deliveries.push(delivery)
    persist()
    return delivery
  }
```

- Add `addOrder` to the returned object (after `append`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/stores/useDeliveriesStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the existing suite still passes**

Run: `pnpm test`
Expected: all tests pass, including `src/services/transfer.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/services/csv.ts src/stores/useDeliveriesStore.ts src/stores/useDeliveriesStore.test.ts
git commit -m "feat: add manual order creation to deliveries store"
```

---

### Task 5: Products tab

**Files:**
- Create: `src/components/ProductCatalog.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `useCatalogStore` from `../stores/useCatalogStore`.
- Produces: a `ProductCatalog` component (default export, no props) wired into `App.vue` under a new `products` tab; `Tab` union extended with `'products'`.

- [ ] **Step 1: Write the component**

Create `src/components/ProductCatalog.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useCatalogStore } from '../stores/useCatalogStore'

const { products, addProduct, updateProduct, deleteProduct } = useCatalogStore()

const productId = ref('')
const description = ref('')
const error = ref('')
const editingId = ref<string | null>(null)
const editProductId = ref('')
const editDescription = ref('')

function onAdd(): void {
  error.value = ''
  if (!productId.value.trim() || !description.value.trim()) {
    error.value = 'productId and description are required'
    return
  }
  if (!addProduct(productId.value, description.value)) {
    error.value = `Product "${productId.value}" already exists`
    return
  }
  productId.value = ''
  description.value = ''
}

function startEdit(id: string): void {
  const p = products.value.find((x) => x.id === id)
  if (!p) return
  editingId.value = id
  editProductId.value = p.productId
  editDescription.value = p.description
  error.value = ''
}

function onSaveEdit(id: string): void {
  error.value = ''
  if (!updateProduct(id, { productId: editProductId.value, description: editDescription.value })) {
    error.value = 'productId already exists or is invalid'
    return
  }
  editingId.value = null
}

function onDelete(id: string): void {
  const p = products.value.find((x) => x.id === id)
  if (p && confirm(`Delete product "${p.productId}"?`)) {
    deleteProduct(id)
  }
}
</script>

<template>
  <div class="card">
    <h2>Product catalog</h2>

    <div class="add-form">
      <input v-model="productId" class="search" placeholder="productId" />
      <input v-model="description" class="search" placeholder="description" />
      <button class="btn primary" type="button" @click="onAdd">Add product</button>
    </div>
    <p v-if="error" class="warn">{{ error }}</p>

    <div v-if="products.length === 0" class="muted" style="margin-top: 12px">
      No products yet. Add your first product above.
    </div>

    <div class="table-wrap" v-else style="margin-top: 12px">
      <table>
        <thead>
          <tr>
            <th>productId</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in products" :key="p.id">
            <template v-if="editingId === p.id">
              <td><input v-model="editProductId" class="search" /></td>
              <td><input v-model="editDescription" class="search" /></td>
              <td>
                <button class="btn" type="button" @click="onSaveEdit(p.id)">Save</button>
                <button class="btn" type="button" @click="editingId = null">Cancel</button>
              </td>
            </template>
            <template v-else>
              <td class="ref">{{ p.productId }}</td>
              <td>{{ p.description }}</td>
              <td>
                <button class="btn" type="button" @click="startEdit(p.id)">Edit</button>
                <button class="btn ghost danger" type="button" @click="onDelete(p.id)">Delete</button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Wire the tab into App.vue**

In `src/App.vue`:
- Change the `Tab` union: `type Tab = 'map' | 'list' | 'upload' | 'products' | 'new-order' | 'settings'`
- Add import: `import ProductCatalog from './components/ProductCatalog.vue'`
- Add a nav button after Upload:

```html
        <button :class="{ active: tab === 'products' }" @click="tab = 'products'">Products</button>
```

- Add to the main content (after UploadCsv):

```html
        <ProductCatalog v-if="tab === 'products'" />
```

- [ ] **Step 3: Verify type-check + build**

Run: `pnpm type-check`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductCatalog.vue src/App.vue
git commit -m "feat: add product catalog tab"
```

---

### Task 6: New Order tab

**Files:**
- Create: `src/components/NewOrder.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `useCatalogStore` (`products`, `hasProduct`) from `../stores/useCatalogStore`; `useDeliveriesStore` (`addOrder`, `geocodeAll`) from `../stores/useDeliveriesStore`; `validateOrder` from `../services/order`; `OrderItem` type from `../types`.
- Produces: a `NewOrder` component (default export, no props) wired into `App.vue` under a new `new-order` tab. `Tab` union already includes `'new-order'` from Task 5.

- [ ] **Step 1: Write the component**

Create `src/components/NewOrder.vue`:

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useCatalogStore } from '../stores/useCatalogStore'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import { validateOrder } from '../services/order'
import type { OrderItem } from '../types'

const { products } = useCatalogStore()
const { addOrder, geocodeAll } = useDeliveriesStore()

const referenceId = ref('')
const address = ref('')
const items = reactive<OrderItem[]>([])
const message = ref('')

const errors = computed(() =>
  validateOrder({ referenceId: referenceId.value, address: address.value, items: [...items] }, products.value),
)

const canSubmit = computed(() => errors.value.length === 0)

function addItem(): void {
  items.push({ productId: products.value[0]?.productId ?? '', quantity: 1 })
}

function removeItem(index: number): void {
  items.splice(index, 1)
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return
  addOrder({ referenceId: referenceId.value, address: address.value, items: [...items] })
  await geocodeAll()
  referenceId.value = ''
  address.value = ''
  items.splice(0, items.length)
  message.value = 'Order added.'
}
</script>

<template>
  <div class="card">
    <h2>New delivery order</h2>

    <div v-if="products.length === 0" class="warn">
      No products in the catalog yet. Add products first, then create an order.
    </div>

    <div class="add-form">
      <input v-model="referenceId" class="search" placeholder="referenceId" />
      <input v-model="address" class="search" placeholder="delivery address" />
    </div>

    <div v-for="(item, i) in items" :key="i" class="add-form">
      <select v-model="item.productId" class="search">
        <option v-for="p in products" :key="p.id" :value="p.productId">
          {{ p.productId }} — {{ p.description }}
        </option>
      </select>
      <input v-model.number="item.quantity" class="search" type="number" min="1" placeholder="quantity" />
      <button class="btn ghost danger" type="button" @click="removeItem(i)">Remove</button>
    </div>

    <div class="import-bar">
      <button class="btn" type="button" :disabled="products.length === 0" @click="addItem">
        Add product
      </button>
      <button class="btn primary" type="button" :disabled="!canSubmit" @click="onSubmit">
        Add order
      </button>
      <span v-if="message" class="ok">{{ message }}</span>
    </div>

    <div v-for="(err, i) in errors" :key="i" class="warn" style="margin-top: 8px">{{ err }}</div>
  </div>
</template>
```

- [ ] **Step 2: Wire the tab into App.vue**

In `src/App.vue`:
- Add import: `import NewOrder from './components/NewOrder.vue'`
- Add a nav button (before Upload):

```html
        <button :class="{ active: tab === 'new-order' }" @click="tab = 'new-order'">New Order</button>
```

- Add to the main content (before UploadCsv):

```html
        <NewOrder v-if="tab === 'new-order'" />
```

- [ ] **Step 3: Verify type-check + build + full tests**

Run: `pnpm type-check`
Expected: no errors.

Run: `pnpm test`
Expected: all tests pass.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke check**

Run: `pnpm dev`, open the app, confirm:
- Add a product in the Products tab, then reload — it persists.
- Create an order in the New Order tab — it appears on the List and Map tabs, gets geocoded.
- The Add order button is disabled until referenceId, address, and ≥1 valid catalog item are present.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewOrder.vue src/App.vue
git commit -m "feat: add manual delivery order entry tab"
```

---

## Self-Review

**Spec coverage:**
- Product type + catalog add/edit/delete → Tasks 1, 3, 5
- Order with referenceId/address/line items → Tasks 1, 4, 6
- Catalog enforcement on order form → Tasks 2, 6
- Same pipeline (geocode/map/status) → Task 4 (`addOrder` builds standard `Delivery`), Task 6 calls `geocodeAll`
- CSV unchanged → no CSV task; verified in Task 4 Step 6
- Duplicate productId rejection (case-insensitive) → Task 3 tests
- Delete product referenced by order → allowed; no task needed (no referential cleanup per spec)

**Placeholder scan:** no TBD/TODO; every step has concrete code.

**Type consistency:** `Product`, `OrderItem`, `Delivery.items?`, `addOrder`, `validateOrder`, `hasProduct`, `updateProduct` signatures are identical across all task Interfaces blocks.
