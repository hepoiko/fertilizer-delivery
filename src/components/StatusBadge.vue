<script setup lang="ts">
import { STATUS_META } from '../types'
import type { DeliveryStatus } from '../types'

defineProps<{ status: DeliveryStatus }>()
</script>

<template>
  <span
    class="status-badge"
    :style="{ color: STATUS_META[status].color, background: STATUS_META[status].bg }"
  >
    {{ STATUS_META[status].label }}
  </span>
</template>
