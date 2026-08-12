<script setup lang="ts">
import { computed, ref } from 'vue'
import DeliveryList from './components/DeliveryList.vue'
import MapView from './components/MapView.vue'
import SetupPanel from './components/SetupPanel.vue'
import UploadCsv from './components/UploadCsv.vue'
import { useDeliveriesStore } from './stores/useDeliveriesStore'
import { useSettingsStore } from './stores/useSettingsStore'

const { effectiveApiKey } = useSettingsStore()
const { stats, clearAll } = useDeliveriesStore()

type Tab = 'map' | 'list' | 'upload' | 'settings'
const tab = ref<Tab>('map')
const hasKey = computed(() => effectiveApiKey.value.length > 0)

function onClearAll(): void {
  if (confirm('Delete all deliveries from this browser? This cannot be undone.')) {
    clearAll()
    tab.value = 'upload'
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">📍</span>
        <div>
          <strong>Delivery Manager</strong>
          <span class="tagline">Local-first · Google Maps</span>
        </div>
      </div>

      <nav v-if="hasKey" class="tabs">
        <button :class="{ active: tab === 'map' }" @click="tab = 'map'">Map</button>
        <button :class="{ active: tab === 'list' }" @click="tab = 'list'">
          List <span class="count">{{ stats.total }}</span>
        </button>
        <button :class="{ active: tab === 'upload' }" @click="tab = 'upload'">Upload</button>
        <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">Settings</button>
      </nav>

      <div v-if="hasKey && stats.total > 0" class="topbar-right">
        <button class="btn ghost danger" @click="onClearAll">Clear all</button>
      </div>
    </header>

    <main class="content">
      <SetupPanel v-if="!hasKey" />
      <template v-else>
        <MapView v-show="tab === 'map'" />
        <DeliveryList v-if="tab === 'list'" />
        <UploadCsv v-if="tab === 'upload'" />
        <SetupPanel v-if="tab === 'settings'" />
      </template>
    </main>
  </div>
</template>
