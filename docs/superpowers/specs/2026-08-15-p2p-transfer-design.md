# P2P Browser-to-Browser Data Transfer — Design

**Date:** 2026-08-15
**Status:** Approved

## Overview

Add a **Share** tab to the Delivery Manager app that transfers the current browser's data
(settings + deliveries) to another browser directly over a P2P WebRTC data channel.
Connection is brokered by the PeerJS cloud broker for the handshake only; payload data flows
directly between browsers.

## Goals

- One-shot manual transfer of `settings` + `deliveries` from one browser to another.
- Works across networks (same device/LAN or remote).
- Keeps the app local-first: no self-hosted backend, no cloud storage of user data.
- Receiver chooses **Replace** or **Merge** semantics at accept time.

## Non-goals

- Long-lived bidirectional sync (deltas, reconnect, conflict resolution).
- Cloud/backend storage passthrough.
- Auto-discovery of devices.

## Approach

**Approach A — One-shot share session.** Sender generates a short, expiring connection code
(PeerJS peer ID). Receiver enters the code; the two browsers connect over WebRTC; sender pushes
a one-time snapshot after confirming; receiver previews, chooses Replace or Merge, and imports.
The channel closes after. Chosen over long-lived sync (B) and storage passthrough (C).

## Connection flow

Roles: **Sender** (has the data) and **Receiver** (imports it). Either browser can play either
role from the Share tab.

1. Sender taps **Share** → app creates a PeerJS peer with a short random ID (e.g. `fd-4f7k2`),
   displays it as the connection code, enters "Waiting for receiver…".
2. Receiver taps **Receive**, types the code → PeerJS connects to that peer ID. Both browsers
   have an open WebRTC data channel. PeerJS cloud broker only exchanges the handshake; data flows
   directly between browsers, encrypted by DTLS.
3. On connection: sender shows "Receiver connected — send data?" with a **Send** confirm button
   and a warning that the Google Maps API key will be shared. Receiver shows "Waiting for sender…".
4. Sender confirms → app serializes `settings` + `deliveries` and sends one JSON payload.
5. Receiver shows a preview: delivery count, status breakdown, settings values (with a note that
   the API key will replace theirs on Replace). Buttons: **Replace / Merge / Cancel**.
6. On Replace or Merge, data is written via the existing stores, UI confirms "Imported", channel
   closes.

**Timeout:** sender cancels the session after ~60s with no connection. Receiver errors if the
code is invalid/unreachable.

## Data format & serialization

Payload (single JSON over the channel):

```ts
interface TransferPayload {
  version: 1
  sentAt: string            // ISO timestamp
  settings: Settings        // { apiKey, startingPoint }
  deliveries: Delivery[]    // full array, all fields
}
```

New `src/services/transfer.ts`:

- `serializeSnapshot(): TransferPayload` — reads both stores, builds payload.
- `parseSnapshot(raw: string): TransferPayload` — `JSON.parse` + structural validation
  (checks `version === 1`, arrays/types present). Rejects malformed payloads with a clear
  error instead of importing garbage.
- Reuses existing `Delivery`/`Settings` types from `src/types/index.ts`.

No transformation needed — `Delivery` objects are already JSON-serializable.

**Settings merge rule:** "Replace" overwrites both settings and deliveries. "Merge" keeps the
receiver's settings, imports only deliveries (merging by `reference` via the existing
`mergeByReference`).

## Services & UI

**New dependency:** `peerjs`. PeerJS cloud broker (`0.peerjs.com`) is used for handshake only,
no API key involved.

**New `src/services/peer.ts`** — wraps PeerJS behind a small, UI-agnostic API:

```ts
createShareSession(onState): { code, cancel }   // host / sender
sendSnapshot(payload)
joinSession(code, onState): { cancel }          // guest / receiver
onData(cb)   // callback with raw payload string
onClose(cb)
onError(cb)
```

States: `waiting-for-receiver` → `connected` → `sent` / `received` → `closed` / `error`.
Handles timeouts (60s), invalid code, and connection errors internally, converting PeerJS
errors into friendly messages.

**New `src/components/SharePanel.vue`** — two modes:

- **Share (sender):** "Generate code" → shows code + "Waiting…" → on connect, "Send data?"
  confirm → "Sent ✓".
- **Receive (guest):** input for code → "Connect" → "Waiting for data…" → on payload, preview
  summary → **Replace / Merge / Cancel** → "Imported ✓".

**Wiring in `src/App.vue`:** add a **Share** tab alongside Map/List/Upload/Settings, visible
when an API key is set (same as the others).

**Files touched:** `package.json`, `src/services/peer.ts` (new), `src/services/transfer.ts`
(new), `src/components/SharePanel.vue` (new), `src/App.vue`.

## Error handling & security

- **Malformed payload** → parse fails with a descriptive error in the receiver's panel; nothing
  imported; channel stays open for retry.
- **Timeout / no connection** (sender 60s) → session cancelled, code invalidated, UI shows
  "No receiver connected."
- **Invalid code** (receiver) → PeerJS connection error mapped to "Couldn't find that share code
  — check it and try again."
- **Connection drop mid-transfer** → both sides show "Connection lost"; receiver discards any
  partial payload (atomic import — only written after full parse + user confirm).
- **Duplicate imports** → idempotent: merge-by-reference replaces matching deliveries; replace
  overwrites.
- **Privacy warning:** Share tab shows "The receiving browser will also receive your Google Maps
  API key" before sending; receiver's preview notes the sender's API key will be applied on
  Replace.
- **No storage of codes/keys anywhere** — PeerJS peer IDs are ephemeral per-session; nothing
  written to `localStorage` beyond normal store persistence.

## Testing

- **Unit tests** for `transfer.ts`: serialize→parse round-trip preserves all fields; malformed
  JSON / wrong version / missing fields rejected; merge vs. replace produce correct store
  outcomes.
- **Store tests** for the merge path reuse existing `mergeByReference` behavior.
- **Manual/e2e:** two browser windows on `localhost` — host generates code, guest joins, sends,
  confirms import; verify Replace overwrites and Merge appends. Real cross-device P2P verified
  manually.
- **Type-check + build** via existing `pnpm type-check` / `pnpm build`.
