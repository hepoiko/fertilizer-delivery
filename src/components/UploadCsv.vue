<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseCsvFile, rowsToDeliveries, type CsvParseResult } from '../services/csv'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'

const { stats, replaceAll, append, geocodeAll } = useDeliveriesStore()

const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const fileName = ref('')
const parseResult = ref<CsvParseResult | null>(null)
const error = ref('')
const importing = ref(false)

const previewRows = computed(() => parseResult.value?.rows.slice(0, 10) ?? [])

function handleFile(file: File | undefined | null): void {
  if (!file) return
  error.value = ''
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    try {
      parseResult.value = parseCsvFile(String(reader.result ?? ''))
    } catch (e) {
      parseResult.value = null
      error.value = e instanceof Error ? e.message : 'Could not parse the CSV file.'
    }
  }
  reader.onerror = () => {
    error.value = 'Could not read the file.'
  }
  reader.readAsText(file)
}

function onDrop(e: DragEvent): void {
  dragging.value = false
  handleFile(e.dataTransfer?.files?.[0])
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement
  handleFile(input.files?.[0])
  input.value = ''
}

async function runImport(mode: 'replace' | 'append'): Promise<void> {
  if (!parseResult.value) return
  if (mode === 'replace' && stats.value.total > 0 && !confirm('Replace the current deliveries?')) {
    return
  }
  importing.value = true
  const items = rowsToDeliveries(parseResult.value.rows)
  if (mode === 'replace') replaceAll(items)
  else append(items)
  await geocodeAll()
  importing.value = false
}

function downloadSample(): void {
  const rows = [
    ['Green Acres Farm', '123 Main Street, Springfield, IL 62704'],
    ['Sunrise Dairy', '456 Oak Avenue, Bloomington, IL 61701'],
    ['Maple Hill Orchard', '789 Cedar Lane, Champaign, IL 61820'],
    ['Riverbend Produce', '321 Willow Drive, Peoria, IL 61602'],
    ['Golden Fields Grain', '654 Pine Road, Decatur, IL 62521'],
    ['Cedar Creek Ranch', '987 Birch Boulevard, Normal, IL 61761'],
  ]
  const csv =
    'Customer,Address\n' +
    rows.map(([customer, address]) => `"${customer}","${address}"`).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sample-deliveries.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="upload">
    <div class="card">
      <h2>Upload delivery addresses</h2>
      <p class="muted">
        Drop a <strong>.csv</strong> file with an address column (e.g. <code>address</code>,
        <code>street</code>, or separate <code>street</code> + <code>city</code> +
        <code>zip</code> columns). A customer/name column is detected automatically too.
      </p>

      <div
        class="dropzone"
        :class="{ dragging }"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="dz-title">{{ fileName || 'Drag & drop your CSV here' }}</div>
        <div class="dz-hint">or click to browse files</div>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          style="display: none"
          @change="onPick"
        />
        <div class="upload-actions">
          <button class="btn" type="button" @click.stop="downloadSample">
            Download sample CSV
          </button>
        </div>
      </div>

      <p v-if="error" class="warn">{{ error }}</p>
    </div>

    <div v-if="parseResult" class="card preview-card">
      <h3>
        <span>Preview</span>
        <span class="muted">{{ parseResult.rows.length }} rows</span>
      </h3>
      <p class="muted">
        Detected address column:
        <code>{{ parseResult.addressColumn ?? 'combined (street/city/zip)' }}</code>
      </p>

      <div v-for="(w, i) in parseResult.warnings" :key="i" class="warn" style="margin-top: 8px">
        {{ w }}
      </div>

      <div v-if="parseResult.rows.length > 0" class="table-wrap preview-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Customer</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in previewRows" :key="i">
              <td>{{ i + 1 }}</td>
              <td class="label">{{ r.label }}</td>
              <td class="addr">{{ r.address }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="import-bar">
        <button class="btn primary" :disabled="importing || parseResult.rows.length === 0" @click="runImport('replace')">
          {{ importing ? 'Importing…' : stats.total > 0 ? `Replace current (${stats.total})` : 'Import deliveries' }}
        </button>
        <button class="btn" :disabled="importing || parseResult.rows.length === 0" @click="runImport('append')">
          Append to current
        </button>
        <span v-if="importing" class="muted">Geocoding addresses…</span>
      </div>
    </div>
  </div>
</template>
