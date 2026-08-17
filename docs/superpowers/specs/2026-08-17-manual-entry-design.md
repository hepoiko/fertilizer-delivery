# Manual Entry: Product Catalog and Delivery Orders

## Goal

Allow the user to enter data manually instead of importing from CSV. Two new
capabilities:

1. Product catalog — `productId` + `description`, with add/edit/delete.
2. Delivery orders — `referenceId`, `address`, and a list of products with
   quantity.

CSV import stays available but is no longer required.

## Data model

Add to `src/types/index.ts`:

```ts
export interface Product {
  id: string
  productId: string
  description: string
}

export interface OrderItem {
  productId: string
  quantity: number
}
```

`Delivery` gains an optional `items: OrderItem[]` field (defaults to `[]`).
Orders entered manually go through the same pipeline as CSV deliveries:
pending status, geocoding, map/list display, status tracking.

## Stores

### `useCatalogStore` (new)

- `products` — `Product[]`, persisted to localStorage under a new key.
- `addProduct(productId, description)` — rejects duplicate `productId`
  (case-insensitive).
- `updateProduct(id, patch)` — updates productId/description.
- `deleteProduct(id)` — removes from catalog.

### `useDeliveriesStore` (extend)

- `addOrder({ referenceId, address, items })` — creates a `Delivery` with:
  - `id` via `uid()`
  - `reference` = referenceId
  - `label` = referenceId
  - `address` normalized (reuse existing normalize)
  - `items`
  - `status: 'pending'`, `geocodeState: 'pending'`, `lat/lng: null`
  - appended + persisted, then geocoded like imported rows.

## UI

### Products tab (new)

List products, with add/edit/delete controls:

- Add: `productId` + `description` inputs, save button.
- Edit: inline edit of the selected product's fields.
- Delete: confirm, then remove.

### New Order tab (new)

Form:

- `referenceId` — required text input.
- `address` — required text input.
- Line items — dynamic rows, each with a product dropdown (from catalog) and
  a quantity number input; add/remove row buttons.
- Submit disabled until: referenceId and address non-empty, at least one line
  item, and every line item's `productId` exists in the catalog (enforced).
- On submit: calls `addOrder`, clears form.

## CSV interaction

Unchanged. CSV import produces deliveries without `items`. No CSV column is
used for products or quantities.

## Error handling

- Duplicate productId → inline error, block add.
- Order form with missing/unknown product → blocked with inline message.
- Delete product that is referenced by an existing order → allowed; orders
  keep the stored `productId` text (no referential cleanup).

## Testing

- `useCatalogStore`: add, duplicate rejection, update, delete.
- `addOrder`: builds delivery with correct fields, persists, and triggers
  geocoding.
- Order form validation logic: submit blocked for each invalid condition.
