import { describe, expect, it } from 'vitest'
import type { OrderItem, Product } from '../types'
import { validateOrder } from './order'

const products: Product[] = [
  { id: 'p1', productId: 'NPK-101', description: 'N-P-K 10-10-10' },
  { id: 'p2', productId: 'UREA-46', description: 'Urea 46%' },
]

const item = (productId: string, quantity = 1): OrderItem => ({ productId, quantity })

describe('validateOrder', () => {
  it('returns no errors for a valid order', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101', 5)] }, products)).toEqual([])
  })

  it('rejects an empty referenceId', () => {
    expect(validateOrder({ referenceId: '  ', address: '123 Main St', items: [item('NPK-101')] }, products)).toEqual(['referenceId is required'])
  })

  it('rejects an empty address', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '', items: [item('NPK-101')] }, products)).toEqual(['address is required'])
  })

  it('rejects an order with no line items', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [] }, products)).toEqual(['at least one product is required'])
  })

  it('rejects line items whose productId is not in the catalog', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101'), item('UNKNOWN')] }, products)).toEqual(['Unknown product: UNKNOWN'])
  })

  it('rejects a line item with quantity less than 1', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('NPK-101', 0)] }, products)).toEqual(['quantity must be at least 1'])
  })

  it('matches productId case-insensitively', () => {
    expect(validateOrder({ referenceId: 'REF-1', address: '123 Main St', items: [item('npk-101')] }, products)).toEqual([])
  })
})
