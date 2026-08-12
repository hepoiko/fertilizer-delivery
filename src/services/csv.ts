import Papa from 'papaparse'
import { uid } from '../utils/id'
import type { Delivery } from '../types'

export interface ParsedRow {
  row: Record<string, string>
  address: string
  label: string
}

export interface CsvParseResult {
  headers: string[]
  rows: ParsedRow[]
  addressColumn: string | null
  dropped: number
  warnings: string[]
}

const ADDRESS_PATTERNS = [
  /^full\s*address$/i,
  /^delivery\s*address$/i,
  /^street\s*address$/i,
  /^address$/i,
  /^address\s*\d+$/i,
  /^street$/i,
  /^location$/i,
  /^destination$/i,
  /^place$/i,
]

const CUSTOMER_PATTERNS = [
  /^customer\s*name$/i,
  /^customer$/i,
  /^client$/i,
  /^recipient$/i,
  /^receiver$/i,
  /^contact$/i,
  /^company$/i,
  /^farm$/i,
  /^name$/i,
]

const CITY_PATTERNS = [/^city$/i, /^town$/i, /^municipality$/i]
const STATE_PATTERNS = [/^(state|province|region)(\s*\/?\s*code)?$/i]
const ZIP_PATTERNS = [/^(zip|postal)\s*(code)?$/i, /^pincode$/i, /^pin\b/i]

const matchHeader = (header: string, patterns: RegExp[]): boolean =>
  patterns.some((p) => p.test(header.trim()))

const normalizeAddress = (raw: string): string =>
  raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,(\S)/g, ', $1')
    .replace(/,+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Parse CSV text, auto-detect the address column(s), and normalize each row. */
export function parseCsvFile(text: string): CsvParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers: string[] = result.meta.fields ?? []
  const rawRows = (result.data as Record<string, string>[]).map((row) => {
    const out: Record<string, string> = {}
    for (const h of headers) out[h] = (row[h] ?? '').trim()
    return out
  })

  const warnings: string[] = []
  if (result.errors.length > 0) {
    warnings.push(`${result.errors.length} parse warning(s) from PapaParse (e.g. inconsistent columns).`)
  }

  // 1) A dedicated address column
  let addressColumn = headers.find((h) => matchHeader(h, ADDRESS_PATTERNS)) ?? null
  let usedColumns: string[] = addressColumn ? [addressColumn] : []

  // 2) Or combine street / city / state / zip columns
  if (!addressColumn) {
    const street = headers.find((h) => matchHeader(h, [/^street$/i, /^address/i, /^address\s*\d+$/i]))
    const city = headers.find((h) => matchHeader(h, CITY_PATTERNS))
    const state = headers.find((h) => matchHeader(h, STATE_PATTERNS))
    const zip = headers.find((h) => matchHeader(h, ZIP_PATTERNS))
    const parts = [street, city, state, zip].filter((c): c is string => Boolean(c))
    if (parts.length > 0) {
      addressColumn = street ?? parts[0]
      usedColumns = parts
    }
  }

  // 3) Fall back to the first column
  if (!addressColumn && headers.length > 0) {
    addressColumn = headers[0]
    usedColumns = [headers[0]]
  }

  const customerColumn = headers.find((h) => matchHeader(h, CUSTOMER_PATTERNS)) ?? null

  const rows: ParsedRow[] = []
  let dropped = 0

  for (const row of rawRows) {
    const address = addressColumn
      ? usedColumns.length > 1
        ? usedColumns.map((c) => row[c]).filter(Boolean).join(', ')
        : row[addressColumn]
      : headers.map((h) => row[h]).filter(Boolean).join(', ')

    const normalized = normalizeAddress(address)
    if (!normalized) {
      dropped++
      continue
    }
    const label = customerColumn && row[customerColumn] ? row[customerColumn] : normalized
    rows.push({ row, address: normalized, label })
  }

  if (dropped > 0) {
    warnings.push(`${dropped} row(s) dropped because they had no usable address.`)
  }
  if (headers.length === 0) {
    warnings.push('No columns detected — the file may be empty or not a CSV.')
  }

  return { headers, rows, addressColumn, dropped, warnings }
}

/** Turn parsed rows into delivery records (with status pending + no coordinates). */
export function rowsToDeliveries(rows: ParsedRow[]): Delivery[] {
  return rows.map(({ row, address, label }) => ({
    id: uid(),
    row,
    address,
    label,
    geocodeState: 'pending' as const,
    lat: null,
    lng: null,
    status: 'pending' as const,
  }))
}
