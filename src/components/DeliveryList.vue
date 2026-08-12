<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDistance, haversineKm } from '../services/distance'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import { useStartingPointStore } from '../stores/useStartingPointStore'
import { DELIVERY_STATUSES, STATUS_META } from '../types'
import type { DeliveryStatus } from '../types'
import StatusBadge from './StatusBadge.vue'

const { deliveries, stats, setStatus } = useDeliveriesStore()
const { startingPoint } = useStartingPointStore()

const search = ref('')
const filter = ref<DeliveryStatus | 'all'>('all')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return deliveries.value.filter((d) => {
    if (filter.value !== 'all' && d.status !== filter.value) return false
    if (!q) return true
    return (
      d.address.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      d.row.Customer?.toLowerCase().includes(q)
    )
  })
})

function distanceFor(lat: number | null, lng: number | null): number | null {
  if (lat == null || lng == null || !startingPoint.coords) return null
  return haversineKm(startingPoint.coords.lat, startingPoint.coords.lng, lat, lng)
}
</script>

<template>
  <div class="card list-page">
    <div class="list-toolbar">
      <input
        v-model="search"
        class="search"
        type="search"
        placeholder="Search by customer or address…"
      />
      <div class="chips">
        <button class="chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">
          All ({{ stats.total }})
        </button>
        <button
          v-for="s in DELIVERY_STATUSES"
          :key="s"
          class="chip"
          :class="{ active: filter === s }"
          @click="filter = s"
        >
          {{ STATUS_META[s].label }} ({{ stats.byStatus[s] }})
        </button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Customer</th>
            <th>Address</th>
            <th>Status</th>
            <th>Distance</th>
            <th>Map</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in filtered" :key="d.id">
            <td>{{ i + 1 }}</td>
            <td class="label">{{ d.label }}</td>
            <td class="addr">{{ d.address }}</td>
            <td>
              <div class="status-cell">
                <StatusBadge :status="d.status" />
                <select
                  class="status-select"
                  :value="d.status"
                  @change="
                    setStatus(d.id, ($event.target as HTMLSelectElement).value as DeliveryStatus)
                  "
                >
                  <option v-for="s in DELIVERY_STATUSES" :key="s" :value="s">
                    {{ STATUS_META[s].label }}
                  </option>
                </select>
              </div>
            </td>
            <td>{{ formatDistance(distanceFor(d.lat, d.lng)) }}</td>
            <td>
              <span v-if="d.geocodeState === 'geocoded'" class="ok" title="Plotted on the map">✓</span>
              <span
                v-else-if="d.geocodeState === 'failed'"
                class="badge-failed"
                :title="d.geocodeError ?? 'Geocoding failed'"
                >Failed</span
              >
              <span v-else-if="d.geocodeState === 'geocoding'" class="muted">…</span>
              <span v-else class="muted">—</span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" class="empty">No deliveries match.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
