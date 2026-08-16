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
