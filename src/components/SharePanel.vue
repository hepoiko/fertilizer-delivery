<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  cancelSession,
  createShareSession,
  joinSession,
  onClose,
  onData,
  onError,
  sendSnapshot,
  type ShareState,
} from '../services/peer'
import {
  applySnapshot,
  parseSnapshot,
  serializeSnapshot,
  type TransferPayload,
} from '../services/transfer'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import type { DeliveryStatus } from '../types'

type PanelMode = 'idle' | 'share' | 'receive'

const { stats } = useDeliveriesStore()

const mode = ref<PanelMode>('idle')
const state = ref<ShareState>('idle')
const code = ref('')
const codeInput = ref('')
const error = ref('')
const incoming = ref<TransferPayload | null>(null)
const notice = ref('')

onData((raw) => {
  try {
    incoming.value = parseSnapshot(raw)
    state.value = 'received'
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not read the received data.'
  }
})
onError((message) => {
  error.value = message
})
onClose(() => {
  if (state.value !== 'imported') {
    if (state.value === 'connected' || state.value === 'connecting' || state.value === 'received') {
      error.value = 'Connection lost.'
    }
    state.value = 'closed'
  }
})

const preview = computed(() => {
  const byStatus: Record<DeliveryStatus, number> = { pending: 0, 'in-transit': 0, delivered: 0 }
  for (const d of incoming.value?.deliveries ?? []) byStatus[d.status]++
  return {
    total: incoming.value?.deliveries.length ?? 0,
    ...byStatus,
  }
})

function reset(): void {
  cancelSession()
  mode.value = 'idle'
  state.value = 'idle'
  code.value = ''
  codeInput.value = ''
  error.value = ''
  incoming.value = null
  notice.value = ''
}

function startShare(): void {
  reset()
  mode.value = 'share'
  const session = createShareSession((s) => {
    state.value = s
    if (s === 'error') {
      code.value = ''
      error.value = error.value || 'Session could not be started.'
    }
  })
  code.value = session.code
}

function confirmSend(): void {
  sendSnapshot(serializeSnapshot())
  notice.value = ''
}

function startReceive(): void {
  const trimmed = codeInput.value.trim()
  if (!trimmed) return
  reset()
  mode.value = 'receive'
  codeInput.value = trimmed
  joinSession(trimmed, (s) => {
    state.value = s
  })
}

function doImport(m: 'replace' | 'merge'): void {
  if (!incoming.value) return
  if (m === 'replace' && !confirm('Replace all current deliveries and settings?')) return
  const { added, updated } = applySnapshot(incoming.value, m)
  notice.value = m === 'replace' ? `Imported ${added} deliveries (replaced).` : `Merged: ${added} added, ${updated} updated.`
  state.value = 'imported'
  cancelSession()
}

function maskKey(key: string): string {
  if (!key) return '(none)'
  if (key.length <= 6) return '••••••'
  return `${key.slice(0, 3)}…${key.slice(-3)}`
}
</script>

<template>
  <div class="share">
    <div class="card">
      <h2>Transfer data to another browser</h2>
      <p class="muted">
        Send this browser's settings + deliveries directly to another browser — no server
        stores anything. The other browser must open this same page.
      </p>

      <p class="warn">
        <strong>Privacy:</strong> the receiving browser will also receive your Google Maps API key.
      </p>

      <div v-if="mode === 'idle'" class="row">
        <button class="btn primary" @click="startShare">Share this browser's data</button>
        <button class="btn" @click="mode = 'receive'; codeInput = ''">Receive data</button>
      </div>

      <!-- Sender flow -->
      <template v-else-if="mode === 'share'">
        <template v-if="state === 'waiting-for-receiver'">
          <p class="muted">Waiting for receiver… share this code:</p>
          <div class="share-code">{{ code }}</div>
          <p class="muted">Auto-cancels in 60 seconds.</p>
          <div class="row">
            <button class="btn ghost" @click="reset">Cancel</button>
          </div>
        </template>

        <template v-else-if="state === 'connected'">
          <p class="ok">Receiver connected.</p>
          <p class="muted">Send this browser's {{ stats.total }} deliveries and settings?</p>
          <div class="row">
            <button class="btn primary" @click="confirmSend">Send data</button>
            <button class="btn ghost" @click="reset">Cancel</button>
          </div>
        </template>

        <template v-else-if="state === 'sent'">
          <p class="ok">Sent ✓</p>
          <div class="row">
            <button class="btn ghost" @click="reset">Done</button>
          </div>
        </template>

        <template v-else-if="state === 'error' || state === 'closed'">
          <p class="warn">{{ error || (state === 'error' ? 'Session failed.' : 'Session closed.') }}</p>
          <div class="row">
            <button class="btn" @click="startShare">Try again</button>
            <button class="btn ghost" @click="reset">Close</button>
          </div>
        </template>
      </template>

      <!-- Receiver flow -->
      <template v-else-if="mode === 'receive'">
        <template v-if="state === 'idle' || state === 'closed'">
          <label for="share-code">Share code from the sending browser</label>
          <input
            id="share-code"
            v-model="codeInput"
            type="text"
            placeholder="e.g. fd-4f7k2"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="startReceive"
          />
          <div class="row">
            <button class="btn primary" :disabled="!codeInput.trim()" @click="startReceive">
              Connect
            </button>
          </div>
          <p v-if="error" class="warn">{{ error }}</p>
        </template>

        <template v-else-if="state === 'connecting' || state === 'connected'">
          <p class="muted">Waiting for sender…</p>
          <div class="row">
            <button class="btn ghost" @click="reset">Cancel</button>
          </div>
        </template>

        <template v-else-if="state === 'received' && incoming">
          <h3>Preview</h3>
          <p class="muted">
            {{ preview.total }} deliveries · {{ preview.pending }} pending ·
            {{ preview['in-transit'] }} in transit · {{ preview.delivered }} delivered
          </p>
          <p class="muted">
            Sender settings: starting point
            <code>{{ incoming.settings.startingPoint || '(none)' }}</code>
            · API key <code>{{ maskKey(incoming.settings.apiKey) }}</code>
          </p>
          <p class="warn">
            <strong>Replace</strong> overwrites everything here with the sender's data (including
            their API key). <strong>Merge</strong> keeps this browser's settings and imports only
            deliveries.
          </p>
          <div class="row">
            <button class="btn primary" @click="doImport('replace')">Replace</button>
            <button class="btn" @click="doImport('merge')">Merge</button>
            <button class="btn ghost" @click="reset">Cancel</button>
          </div>
        </template>

        <template v-else-if="state === 'imported'">
          <p class="ok">Imported ✓ {{ notice }}</p>
          <div class="row">
            <button class="btn ghost" @click="reset">Done</button>
          </div>
        </template>

        <template v-else-if="state === 'error'">
          <p class="warn">{{ error || 'Connection failed.' }}</p>
          <div class="row">
            <button class="btn" @click="state = 'idle'">Try again</button>
            <button class="btn ghost" @click="reset">Close</button>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.share-code {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--primary);
  margin: 12px 0;
}
</style>
