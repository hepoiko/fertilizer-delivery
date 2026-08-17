export type DeliveryStatus = 'pending' | 'in-transit' | 'delivered'

export type GeocodeState = 'pending' | 'geocoding' | 'geocoded' | 'failed'

export interface LatLng {
  lat: number
  lng: number
}

export interface Product {
  id: string
  productId: string
  description: string
}

export interface OrderItem {
  productId: string
  quantity: number
}

export interface Delivery {
  id: string
  /** Full original CSV row keyed by header name */
  row: Record<string, string>
  /** Optional external reference ID, used to update existing deliveries on re-import */
  reference?: string
  /** Normalized address used for geocoding */
  address: string
  /** Human-friendly label (customer name when available, otherwise the address) */
  label: string
  geocodeState: GeocodeState
  lat: number | null
  lng: number | null
  status: DeliveryStatus
  items?: OrderItem[]
  geocodeError?: string
}

export interface Settings {
  apiKey: string
  startingPoint: string
}

export const DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'in-transit', 'delivered']

export const STATUS_META: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#b45309', bg: '#fef3c7' },
  'in-transit': { label: 'In transit', color: '#1d4ed8', bg: '#dbeafe' },
  delivered: { label: 'Delivered', color: '#15803d', bg: '#dcfce7' },
}

export const MARKER_COLORS: Record<DeliveryStatus, string> = {
  pending: '#f59e0b',
  'in-transit': '#3b82f6',
  delivered: '#22c55e',
}
