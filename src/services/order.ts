import type { OrderItem, Product } from '../types'

export interface OrderInput {
  referenceId: string
  address: string
  items: OrderItem[]
}

/** Validate a manual order form. Returns a list of error strings; empty means valid. */
export function validateOrder(input: OrderInput, products: Product[]): string[] {
  const errors: string[] = []
  if (!input.referenceId.trim()) errors.push('referenceId is required')
  if (!input.address.trim()) errors.push('address is required')
  if (input.items.length === 0) {
    errors.push('at least one product is required')
    return errors
  }
  const known = new Set(products.map((p) => p.productId.toLowerCase()))
  for (const item of input.items) {
    if (!known.has(item.productId.trim().toLowerCase())) {
      errors.push(`Unknown product: ${item.productId}`)
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      errors.push('quantity must be at least 1')
    }
  }
  return errors
}
