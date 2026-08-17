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
