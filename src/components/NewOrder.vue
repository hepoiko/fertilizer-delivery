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
