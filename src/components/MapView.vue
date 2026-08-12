<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatDistance, haversineKm } from '../services/distance'
import { loadGoogleMaps } from '../services/mapsLoader'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useStartingPointStore } from '../stores/useStartingPointStore'
import { DELIVERY_STATUSES, MARKER_COLORS, STATUS_META } from '../types'
import type { Delivery, DeliveryStatus } from '../types'

const { effectiveApiKey } = useSettingsStore()
const { deliveries, geocoding, progress, stats, geocodeAll, retryFailed, setStatus } =
  useDeliveriesStore()
const { startingPoint, regeocode } = useStartingPointStore()

const mapEl = ref<HTMLDivElement>()
const mapError = ref('')
const loadingMap = ref(true)

let map: google.maps.Map | null = null
let markers: google.maps.Marker[] = []
let infoWindow: google.maps.InfoWindow | null = null
let lastBoundsKey = ''

const labelOf = (s: DeliveryStatus) => STATUS_META[s].label
const pct = () => (progress.value.total === 0 ? 0 : Math.round((progress.value.done / progress.value.total) * 100))

onMounted(async () => {
  try {
    await loadGoogleMaps(effectiveApiKey.value)
    initMap()
    regeocode()
  } catch (err) {
    mapError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loadingMap.value = false
  }
})

function pinSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="6" fill="#ffffff"/></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

function initMap(): void {
  if (!mapEl.value || typeof google === 'undefined') return
  map = new google.maps.Map(mapEl.value, {
    center: { lat: 39.8283, lng: -98.5795 },
    zoom: 4,
    mapTypeId: 'roadmap',
    fullscreenControl: true,
  })
  infoWindow = new google.maps.InfoWindow()
  renderMarkers()
}

function openInfo(d: Delivery, marker: google.maps.Marker): void {
  if (!infoWindow || !map) return
  const distance =
    startingPoint.coords && d.lat != null && d.lng != null
      ? haversineKm(startingPoint.coords.lat, startingPoint.coords.lng, d.lat, d.lng)
      : null

  const select = DELIVERY_STATUSES.map(
    (s) => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${labelOf(s)}</option>`,
  ).join('')

  const content = document.createElement('div')
  content.className = 'infowindow'
  content.innerHTML = `
    <div class="iw-label">${escapeHtml(d.label)}</div>
    <div class="iw-address">${escapeHtml(d.address)}</div>
    <div class="iw-distance">Distance from depot: <strong>${formatDistance(distance)}</strong></div>
    <label class="iw-status" for="iw-status">Status</label>
    <select id="iw-status" class="iw-select">${select}</select>
  `
  content.querySelector('select')?.addEventListener('change', (e) => {
    setStatus(d.id, (e.target as HTMLSelectElement).value as DeliveryStatus)
  })

  infoWindow.setContent(content)
  infoWindow.open(map, marker)
}

function renderMarkers(): void {
  markers.forEach((m) => m.setMap(null))
  markers = []
  if (!map) return

  const placed: google.maps.LatLngLiteral[] = []
  for (const d of deliveries.value) {
    if (d.lat == null || d.lng == null) continue
    const position = { lat: d.lat, lng: d.lng }
    const marker = new google.maps.Marker({
      position,
      map,
      title: d.label,
      icon: {
        url: pinSvg(MARKER_COLORS[d.status]),
        scaledSize: new google.maps.Size(28, 40),
        anchor: new google.maps.Point(14, 40),
      },
    })
    marker.addListener('click', () => openInfo(d, marker))
    markers.push(marker)
    placed.push(position)
  }

  const boundsKey =
    JSON.stringify(
      [...placed]
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .sort()
        .join('|'),
    ) + (startingPoint.coords ? `|start:${startingPoint.coords.lat},${startingPoint.coords.lng}` : '')

  if (boundsKey !== lastBoundsKey && placed.length > 0) {
    lastBoundsKey = boundsKey
    const bounds = new google.maps.LatLngBounds()
    for (const p of placed) bounds.extend(p)
    if (startingPoint.coords) bounds.extend(startingPoint.coords)
    map.fitBounds(bounds)
  }
}

watch(deliveries, () => renderMarkers(), { deep: true })
watch(startingPoint, () => renderMarkers(), { deep: true })

onBeforeUnmount(() => {
  markers.forEach((m) => m.setMap(null))
  markers = []
})
</script>

<template>
  <div class="map-page">
    <div class="map-toolbar">
      <div class="stats">
        <span>{{ stats.total }} stops</span>
        <span class="dot geocoded">{{ stats.geocoded }} mapped</span>
        <span v-if="stats.failed" class="dot failed">{{ stats.failed }} failed</span>
      </div>
      <div class="toolbar-actions">
        <template v-if="geocoding">
          <div class="progress">
            <div class="bar" :style="{ width: pct() + '%' }"></div>
          </div>
          <span class="muted">{{ progress.done }}/{{ progress.total }}</span>
        </template>
        <template v-else>
          <button class="btn" :disabled="stats.pendingCount === 0" @click="geocodeAll">
            Geocode all
          </button>
          <button v-if="stats.failed > 0" class="btn" @click="retryFailed">Retry failed</button>
        </template>
      </div>
    </div>

    <div class="map-wrap">
      <div v-if="mapError" class="map-error card">
        <div>
          <strong>Could not load Google Maps.</strong>
          <p class="muted">{{ mapError }}</p>
        </div>
      </div>
      <div v-else-if="loadingMap" class="map-placeholder">Loading Google Maps…</div>
      <div ref="mapEl" class="map"></div>
    </div>

    <div class="legend">
      <span v-for="s in DELIVERY_STATUSES" :key="s" class="legend-item">
        <span class="swatch" :style="{ background: MARKER_COLORS[s] }"></span>{{ labelOf(s) }}
      </span>
    </div>
  </div>
</template>
