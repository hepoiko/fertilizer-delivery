# P2P Browser-to-Browser Data Transfer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Share tab that transfers `settings` + `deliveries` from one browser to another over a one-shot WebRTC data channel (PeerJS broker handshake only), with the receiver choosing Replace or Merge semantics.

**Architecture:** A new `peer.ts` service wraps PeerJS behind a small stateful API (create/join session, send snapshot, timeouts, friendly error mapping). A new `transfer.ts` service handles serialization, validation, and applying the payload to the existing stores (`replaceAll` / `mergeByReference`). A new `SharePanel.vue` component exposes sender and receiver flows, wired into `App.vue` as a new tab. Two new service files keep WebRTC concerns and data-format concerns fully separate from the Vue UI.

**Tech Stack:** Vue 3 + Vite 8 + TypeScript 7 (vue-tsc via the `typescript6` bridge — see README), pnpm, `peerjs@^1.5.5` (ships its own types at `dist/types.d.ts`), `vitest@^4.1.10` + `happy-dom@^20.11.2` for the first test suite in this repo.

**Spec:** `docs/superpowers/specs/2026-08-15-p2p-transfer-design.md`

## Global Constraints

- New runtime dependency is `peerjs` only. Test tooling (`vitest`, `happy-dom`) are devDependencies.
- Transfer payload schema is fixed: `version: 1`, `sentAt: string`, `settings: Settings`, `deliveries: Delivery[]` (types from `src/types/index.ts`). `version` must be validated as exactly `1`.
- "Replace" overwrites both settings and deliveries. "Merge" keeps the receiver's settings and imports only deliveries (merging by `reference` via the existing `mergeByReference` in `src/stores/useDeliveriesStore.ts:44`).
- Sender session times out after 60s with no receiver connected.
- User-facing copy is fixed by the spec: "No receiver connected." (sender timeout); "Couldn't find that share code — check it and try again." (invalid/unreachable code); "Connection lost" (mid-transfer drop); "The receiving browser will also receive your Google Maps API key" (privacy warning shown before sending).
- Share tab is visible only when an API key is set (same `hasKey` gate as the other tabs in `src/App.vue`).
- Keep `erasableSyntaxOnly` (no enums — use string literal unions), `noUnusedLocals`, `noUnusedParameters` (tsconfig.app.json).
- Verification commands: `pnpm type-check` (vue-tsc build) and `pnpm build`. New: `pnpm test` (vitest run).
- Commit style: lowercase conventional prefixes (existing log uses `init commit`, `add reference id`, `add firebase deploy github action` — prefer `feat:`/`test:`/`chore:` style with short imperative messages).

---

### Task 1: Test infrastructure + `transfer.ts` (serialize / validate / apply)

Adds the repo's first test runner, then the pure data-format service with full unit coverage, including the Replace-vs-Merge store outcomes.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.node.json`
- Create: `src/services/transfer.ts`
- Test: `src/services/transfer.test.ts`

**Interfaces:**
- Consumes: `Delivery`, `Settings` from `src/types/index.ts`; `useSettingsStore()` from `src/stores/useSettingsStore.ts` (`settings`, `setApiKey`, `setStartingPoint`); `useDeliveriesStore()` from `src/stores/useDeliveriesStore.ts` (`deliveries`, `replaceAll`, `mergeByReference`).
- Produces: `TransferPayload` interface; `serializeSnapshot(): TransferPayload`; `parseSnapshot(raw: string): TransferPayload` (throws with a descriptive `Error` on invalid input); `applySnapshot(payload: TransferPayload, mode: 'replace' | 'merge'): { added: number; updated: number }`. Later tasks use these exact names.

- [ ] **Step 1: Install test tooling**

```bash
pnpm add -D vitest@^4.1.10 happy-dom@^20.11.2
```

- [ ] **Step 2: Add `test` script to `package.json`**

Add to the `"scripts"` block:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Register the config for type-checking in `tsconfig.node.json`**

Change `"include": ["vite.config.ts"]` to:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 5: Run `pnpm install` and verify the runner boots**

Run: `pnpm test`
Expected: exits 0 with "No test files found" (or similar) — proves vitest resolves config and environment before any tests exist.

- [ ] **Step 6: Commit scaffolding**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tsconfig.node.json
git commit -m "chore: add vitest test runner"
```

- [ ] **Step 7: Write the failing tests for `transfer.ts`**

Create `src/services/transfer.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Delivery, Settings } from '../types'

const settings: Settings = { apiKey: 'AIzaFAKEKEY', startingPoint: 'Depot St, Springfield, IL' }

const delivery = (overrides: Partial<Delivery> = {}): Delivery => ({
  id: 'd1',
  row: { Customer: 'Green Acres Farm', Address: '123 Main St, Springfield, IL 62704' },
  reference: 'REF-001',
  address: '123 Main St, Springfield, IL 62704',
  label: 'Green Acres Farm',
  geocodeState: 'geocoded',
  lat: 39.7817,
  lng: -89.6501,
  status: 'pending',
  ...overrides,
})

// Stores are module-level singletons tied to localStorage; reload them fresh per test.
async function load() {
  vi.resetModules()
  localStorage.clear()
  const { useSettingsStore } = await import('../stores/useSettingsStore')
  const { useDeliveriesStore } = await import('../stores/useDeliveriesStore')
  const transfer = await import('./transfer')
  return { useSettingsStore, useDeliveriesStore, transfer }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('serializeSnapshot', () => {
  it('captures current settings and deliveries', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey(settings.apiKey)
    useSettingsStore().setStartingPoint(settings.startingPoint)
    useDeliveriesStore().replaceAll([delivery()])

    const payload = transfer.serializeSnapshot()

    expect(payload.version).toBe(1)
    expect(payload.settings).toEqual(settings)
    expect(typeof payload.sentAt).toBe('string')
    expect(payload.deliveries).toEqual([delivery()])
  })
})

describe('parseSnapshot', () => {
  it('round-trips a serialized payload', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey(settings.apiKey)
    useDeliveriesStore().replaceAll([delivery()])

    const payload = transfer.serializeSnapshot()
    expect(transfer.parseSnapshot(JSON.stringify(payload))).toEqual(payload)
  })

  it('rejects malformed JSON', async () => {
    const { transfer } = await load()
    expect(() => transfer.parseSnapshot('{not json')).toThrow()
  })

  it('rejects an unsupported version', async () => {
    const { transfer } = await load()
    const bad = { version: 2, sentAt: 'x', settings, deliveries: [] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow(/version/i)
  })

  it('rejects payloads with missing settings fields', async () => {
    const { transfer } = await load()
    const bad = { version: 1, sentAt: 'x', settings: { apiKey: 'k' }, deliveries: [] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow()
  })

  it('rejects deliveries missing required fields', async () => {
    const { transfer } = await load()
    const bad = { version: 1, sentAt: 'x', settings, deliveries: [{ id: 'd1' }] }
    expect(() => transfer.parseSnapshot(JSON.stringify(bad))).toThrow()
  })
})

describe('applySnapshot', () => {
  it('replace overwrites settings and deliveries', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey('OLD_KEY')
    useDeliveriesStore().replaceAll([delivery({ id: 'old', reference: 'REF-OLD' })])

    transfer.applySnapshot(
      { version: 1, sentAt: 'x', settings, deliveries: [delivery()] },
      'replace',
    )

    expect(useSettingsStore().settings.apiKey).toBe(settings.apiKey)
    const list = useDeliveriesStore().deliveries.value
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('d1')
  })

  it('merge keeps receiver settings and updates matching reference', async () => {
    const { useSettingsStore, useDeliveriesStore, transfer } = await load()
    useSettingsStore().setApiKey('RECEIVER_KEY')
    useDeliveriesStore().replaceAll([
      delivery({ id: 'existing', reference: 'REF-001', address: 'Old Address', label: 'Old', geocodeState: 'geocoded' }),
    ])

    const result = transfer.applySnapshot(
      { version: 1, sentAt: 'x', settings, deliveries: [delivery()] },
      'merge',
    )

    expect(result).toEqual({ added: 0, updated: 1 })
    expect(useSettingsStore().settings.apiKey).toBe('RECEIVER_KEY')
    const list = useDeliveriesStore().deliveries.value
    expect(list).toHaveLength(1)
    expect(list[0].address).toBe('123 Main St, Springfield, IL 62704')
    expect(list[0].geocodeState).toBe('pending')
    expect(list[0].lat).toBeNull()
  })

  it('merge appends deliveries with new references', async () => {
    const { useDeliveriesStore, transfer } = await load()
    useDeliveriesStore().replaceAll([delivery({ id: 'existing', reference: 'REF-001' })])

    const result = transfer.applySnapshot(
      {
        version: 1,
        sentAt: 'x',
        settings,
        deliveries: [delivery(), delivery({ id: 'd2', reference: 'REF-002', label: 'Sunrise Dairy' })],
      },
      'merge',
    )

    expect(result).toEqual({ added: 1, updated: 1 })
    expect(useDeliveriesStore().deliveries.value).toHaveLength(2)
  })
})
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `./transfer` module not found (import errors).

- [ ] **Step 9: Implement `src/services/transfer.ts`**

```ts
import type { Delivery, Settings } from '../types'
import { useDeliveriesStore } from '../stores/useDeliveriesStore'
import { useSettingsStore } from '../stores/useSettingsStore'

export interface TransferPayload {
  version: 1
  sentAt: string
  settings: Settings
  deliveries: Delivery[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isDelivery(v: unknown): v is Delivery {
  if (!isRecord(v)) return false
  if (typeof v.id !== 'string') return false
  if (typeof v.address !== 'string') return false
  if (typeof v.label !== 'string') return false
  if (typeof v.status !== 'string') return false
  if (!['pending', 'in-transit', 'delivered'].includes(v.status)) return false
  if (typeof v.geocodeState !== 'string') return false
  if (!['pending', 'geocoding', 'geocoded', 'failed'].includes(v.geocodeState)) return false
  if (v.lat !== null && typeof v.lat !== 'number') return false
  if (v.lng !== null && typeof v.lng !== 'number') return false
  if (v.reference !== undefined && typeof v.reference !== 'string') return false
  return true
}

function isValidPayload(v: unknown): v is TransferPayload {
  if (!isRecord(v)) return false
  if (v.version !== 1) return false
  if (typeof v.sentAt !== 'string') return false
  if (!isRecord(v.settings)) return false
  if (typeof v.settings.apiKey !== 'string') return false
  if (typeof v.settings.startingPoint !== 'string') return false
  if (!Array.isArray(v.deliveries)) return false
  return v.deliveries.every(isDelivery)
}

/** Build a transfer payload from the current stores. */
export function serializeSnapshot(): TransferPayload {
  const { settings } = useSettingsStore()
  const { deliveries } = useDeliveriesStore()
  return {
    version: 1,
    sentAt: new Date().toISOString(),
    settings: { apiKey: settings.apiKey, startingPoint: settings.startingPoint },
    deliveries: deliveries.value.map((d) => ({ ...d })),
  }
}

/** Parse and structurally validate an incoming payload string. Throws with a clear message on garbage. */
export function parseSnapshot(raw: string): TransferPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Received data is not valid JSON.')
  }
  if (!isValidPayload(parsed)) {
    throw new Error('Received data is not a valid Delivery Manager snapshot.')
  }
  return parsed
}

/** Write a validated payload into the stores. Replace overwrites everything; merge keeps receiver settings and merges deliveries by reference. */
export function applySnapshot(
  payload: TransferPayload,
  mode: 'replace' | 'merge',
): { added: number; updated: number } {
  const { setApiKey, setStartingPoint } = useSettingsStore()
  const { replaceAll, mergeByReference } = useDeliveriesStore()

  if (mode === 'replace') {
    setApiKey(payload.settings.apiKey)
    setStartingPoint(payload.settings.startingPoint)
    replaceAll(payload.deliveries)
    return { added: payload.deliveries.length, updated: 0 }
  }
  return mergeByReference(payload.deliveries)
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm test`
Expected: all 9 tests PASS.

- [ ] **Step 11: Verify type-check and build still pass**

Run: `pnpm type-check`
Expected: exits 0 (test file type-checks cleanly under the strict tsconfig).
Run: `pnpm build`
Expected: builds `dist/` without errors.

- [ ] **Step 12: Commit**

```bash
git add src/services/transfer.ts src/services/transfer.test.ts
git commit -m "feat: add transfer snapshot serialization and apply"
```

---

### Task 2: `peer.ts` — PeerJS wrapper service

Wraps PeerJS behind the spec's small API: create/join a session, send the snapshot, timeout handling, and friendly error mapping. Verified by type-check + build (WebRTC is exercised manually per the spec's testing section).

**Files:**
- Create: `src/services/peer.ts`

**Interfaces:**
- Consumes: `TransferPayload` from `./transfer` (Task 1).
- Produces:
  - `type ShareState = 'idle' | 'waiting-for-receiver' | 'connecting' | 'connected' | 'sent' | 'received' | 'imported' | 'closed' | 'error'`
  - `createShareSession(onState: (s: ShareState) => void): { code: string; cancel: () => void }`
  - `joinSession(joinCode: string, onState: (s: ShareState) => void): { cancel: () => void }`
  - `sendSnapshot(payload: TransferPayload): void`
  - `onData(cb: (raw: string) => void): void`
  - `onClose(cb: () => void): void`
  - `onError(cb: (message: string) => void): void`
  - `cancelSession(): void`
  - Task 3 (`SharePanel.vue`) consumes all of these.

- [ ] **Step 1: Install `peerjs`**

```bash
pnpm add peerjs@^1.5.5
```

- [ ] **Step 2: Write `src/services/peer.ts`**

```ts
import Peer, { type DataConnection } from 'peerjs'
import type { TransferPayload } from './transfer'

export type ShareState =
  | 'idle'
  | 'waiting-for-receiver'
  | 'connecting'
  | 'connected'
  | 'sent'
  | 'received'
  | 'imported'
  | 'closed'
  | 'error'

type StateCb = (state: ShareState) => void

const TIMEOUT_MS = 60_000
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

let peer: Peer | null = null
let conn: DataConnection | null = null
let role: 'sender' | 'receiver' | null = null
let onStateCb: StateCb = () => {}
let onDataCb: ((raw: string) => void) | null = null
let onCloseCb: (() => void) | null = null
let onErrorCb: ((message: string) => void) | null = null
let timeoutId: ReturnType<typeof setTimeout> | null = null

function emit(state: ShareState): void {
  onStateCb(state)
}

function clearTimer(): void {
  if (timeoutId) clearTimeout(timeoutId)
  timeoutId = null
}

function teardown(): void {
  clearTimer()
  if (conn && conn.open) conn.close()
  conn = null
  if (peer && !peer.destroyed) peer.destroy()
  peer = null
  role = null
}

function friendlyError(err: Error & { type?: string }): string {
  switch (err.type) {
    case 'peer-unavailable':
      return "Couldn't find that share code — check it and try again."
    case 'unavailable-id':
      return 'That share code is already in use — try again.'
    case 'network':
      return 'Network error — check your connection and try again.'
    case 'browser-incompatible':
      return 'This browser does not support peer-to-peer transfers.'
    case 'socket-error':
    case 'socket-closed':
    case 'server-error':
      return 'Connection broker unreachable — try again shortly.'
    default:
      return err.message || 'Something went wrong with the connection.'
  }
}

function randomCode(): string {
  let s = 'fd-'
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

function wireConn(c: DataConnection): void {
  conn = c
  c.on('open', () => {
    clearTimer()
    emit(role === 'sender' ? 'connected' : 'connected')
  })
  c.on('data', (raw: unknown) => {
    if (typeof raw === 'string') onDataCb?.(raw)
  })
  c.on('close', () => {
    clearTimer()
    onCloseCb?.()
    teardown()
  })
  c.on('error', () => {
    clearTimer()
    onCloseCb?.()
    teardown()
  })
}

/** Host a session. Returns the share code and a cancel handle. Auto-cancels after 60s with no receiver. */
export function createShareSession(onState: StateCb): { code: string; cancel: () => void } {
  teardown()
  role = 'sender'
  onStateCb = onState
  const code = randomCode()

  peer = new Peer(code)
  peer.on('open', () => {
    emit('waiting-for-receiver')
    timeoutId = setTimeout(() => {
      emit('error')
      onErrorCb?.('No receiver connected.')
      teardown()
    }, TIMEOUT_MS)
  })
  peer.on('connection', (c) => wireConn(c))
  peer.on('error', (err) => {
    onErrorCb?.(friendlyError(err))
    teardown()
  })

  return {
    code,
    cancel: () => {
      emit('closed')
      teardown()
    },
  }
}

/** Join a session by code. Returns a cancel handle. */
export function joinSession(joinCode: string, onState: StateCb): { cancel: () => void } {
  teardown()
  role = 'receiver'
  onStateCb = onState

  peer = new Peer()
  peer.on('open', () => {
    emit('connecting')
    const c = peer!.connect(joinCode, { reliable: true })
    wireConn(c)
    timeoutId = setTimeout(() => {
      emit('error')
      onErrorCb?.(`Couldn't find that share code — check it and try again.`)
      teardown()
    }, TIMEOUT_MS)
  })
  peer.on('error', (err) => {
    onErrorCb?.(friendlyError(err))
    teardown()
  })

  return {
    cancel: () => {
      emit('closed')
      teardown()
    },
  }
}

/** Send the serialized payload over the open channel. */
export function sendSnapshot(payload: TransferPayload): void {
  if (!conn || !conn.open) {
    onErrorCb?.('Connection lost — nothing was sent.')
    return
  }
  conn.send(JSON.stringify(payload))
  emit('sent')
}

export function onData(cb: (raw: string) => void): void {
  onDataCb = cb
}

export function onClose(cb: () => void): void {
  onCloseCb = cb
}

export function onError(cb: (message: string) => void): void {
  onErrorCb = cb
}

export function cancelSession(): void {
  teardown()
}
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0. (`peerjs` ships types at `dist/types.d.ts`; no `@types/peerjs` needed.)

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: builds `dist/` without errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/services/peer.ts
git commit -m "feat: add peerjs session wrapper service"
```

---

### Task 3: `SharePanel.vue`

The Share tab UI: sender flow (generate code → waiting → confirm send) and receiver flow (enter code → preview → Replace/Merge/Cancel → imported).

**Files:**
- Create: `src/components/SharePanel.vue`

**Interfaces:**
- Consumes: `src/services/peer.ts` API (Task 2) and `src/services/transfer.ts` (`serializeSnapshot`, `parseSnapshot`, `applySnapshot`, `TransferPayload`) (Task 1); `useDeliveriesStore()` for the live delivery count.
- Produces: default-exported Vue SFC with no props/emits. Task 4 mounts it as `<SharePanel />`.

- [ ] **Step 1: Write `src/components/SharePanel.vue`**

```vue
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
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: builds `dist/` without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/SharePanel.vue
git commit -m "feat: add share panel sender and receiver flows"
```

---

### Task 4: Wire Share tab into `App.vue`

**Files:**
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `SharePanel.vue` default export (Task 3).

- [ ] **Step 1: Add the import and tab**

In `src/App.vue`:

1. Add to the import block:

```ts
import SharePanel from './components/SharePanel.vue'
```

2. Change the `Tab` union type:

```ts
type Tab = 'map' | 'list' | 'upload' | 'share' | 'settings'
```

3. Add a tab button between Upload and Settings:

```html
<button :class="{ active: tab === 'share' }" @click="tab = 'share'">Share</button>
```

4. Add the component next to the other tab panels:

```html
<SharePanel v-if="tab === 'share'" />
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: builds `dist/` without errors.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: add share tab to app"
```

---

### Task 5: Manual end-to-end verification

Per the spec's Testing section, cross-browser P2P is verified manually. Run the app and exercise both flows.

**Files:**
- None (verification only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: serves on `http://localhost:5173`.

- [ ] **Step 2: Open two browser windows on `localhost`**

Open `http://localhost:5173` in two browser windows (or a normal window + incognito). Ensure the settings tab shows an API key is configured in at least the sending window.

- [ ] **Step 3: Sender flow**

In window A (with data), open the **Share** tab → **Share this browser's data** → confirm a 5-char code like `fd-4f7k2` appears and it shows "Waiting for receiver…".

- [ ] **Step 4: Receiver flow — merge**

In window B, open **Share** → **Receive data**, type window A's code, **Connect**. Window A should flip to "Receiver connected."; window B shows "Waiting for sender…". In window A click **Send data**. Window B should show the preview (counts + settings), then click **Merge**. Confirm "Imported ✓ Merged: …" and that window B's deliveries now include window A's data while window B kept its own settings.

- [ ] **Step 5: Receiver flow — replace**

Repeat with a fresh code from A; in window B choose **Replace** (accept the confirm). Confirm window B's deliveries match window A exactly and its settings (API key, starting point) were overwritten by window A's.

- [ ] **Step 6: Timeout**

Start a Share in window A, do NOT connect; confirm it shows "No receiver connected." after ~60s.

- [ ] **Step 7: Bad code**

In window B **Receive**, enter a bogus code like `fd-zzzzz`, **Connect**; confirm the message "Couldn't find that share code — check it and try again." appears and the session resets to the code input.

- [ ] **Step 8: Malformed payload resilience**

In the receiver preview flow, use the devtools console on window B to call `parseSnapshot('garbage')` and confirm it throws "Received data is not valid JSON." (or confirm the normal path never imports a partial payload).

---

## Self-Review

**Spec coverage:**

- Connection flow (roles, code, handshake via PeerJS broker, DTLS direct transfer, confirm-send, preview, replace/merge, channel closes after) → Tasks 2 + 3.
- Timeout (60s sender) → Task 2 `createShareSession`.
- Invalid/unreachable code error copy → Task 2 `joinSession` timeout + `friendlyError` `peer-unavailable`.
- Data format & serialization (`TransferPayload` v1, `serializeSnapshot`, `parseSnapshot`, structural validation, reuses `Delivery`/`Settings`) → Task 1.
- Settings merge rule (Replace overwrites both; Merge keeps receiver settings, imports deliveries by `mergeByReference`) → Task 1 `applySnapshot` + tests.
- Services & UI (peer.ts API, SharePanel modes, App.vue tab gated by `hasKey`) → Tasks 2, 3, 4.
- Error handling & security (malformed payload, timeout, invalid code, mid-transfer drop atomicity, duplicate import idempotency, privacy warning, no persistence of codes) → Tasks 1, 2, 3.
- Testing (unit tests for transfer.ts incl. merge vs replace; manual/e2e two windows) → Tasks 1 + 5. Store merge-path behavior is covered by the `applySnapshot` merge tests which drive the real `mergeByReference`.

**Placeholder scan:** No TBD/TODO; every code step contains full file contents.

**Type consistency:** `TransferPayload`, `serializeSnapshot`, `parseSnapshot`, `applySnapshot(payload, mode)` and the `ShareState` union + `createShareSession`/`joinSession`/`sendSnapshot`/`onData`/`onClose`/`onError`/`cancelSession` names are identical across Tasks 1–4. `state` is used consistently (never a renamed variant) in SharePanel.
