# 📍 Delivery Manager

A **local-first** delivery management web app: upload delivery addresses via CSV, plot every location on Google Maps, track delivery status, and see distances from your starting point — **no backend**. All data lives in your browser's `localStorage`.

Built with **Vue 3** + **Vite** + **TypeScript 7** (native compiler) + **pnpm**.

## Features

- **CSV upload** — drag & drop a `.csv`; the address column is auto-detected (`address`, `street`, or separate `street`+`city`+`zip` columns), with a preview before importing.
- **Google Maps plotting** — every address is geocoded client-side and shown as a color-coded marker (color = delivery status).
- **Delivery status tracking** — `Pending` / `In transit` / `Delivered`, changeable from the map popup or the list; persisted across reloads.
- **List + search + filter** — searchable, filterable table with inline status controls.
- **Distance** — great-circle (Haversine) distance from your depot/starting point to each stop.
- **Private by design** — nothing is uploaded to any server except geocoding requests to Google Maps.

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev server
pnpm dev        # → http://localhost:5173
```

### Google Maps API key

The app needs a Google Maps API key to load the map and geocode addresses:

1. Go to the [Google Maps Platform](https://console.cloud.google.com/google/maps-apis/start), create a project, and enable billing.
2. Enable the **Maps JavaScript API**.
3. Create an API key under *Credentials*.
4. Restrict the key to your domain (e.g. `localhost:5173` while developing).

Enter the key in the app's **Settings** screen (stored in your browser's `localStorage`). You can also provide it at build time via a `.env` file:

```bash
cp .env.example .env   # then fill in VITE_GOOGLE_MAPS_API_KEY
```

## CSV format

Any CSV with an address column works. Recommended:

```csv
Customer,Address
"Green Acres Farm","123 Main Street, Springfield, IL 62704"
"Sunrise Dairy","456 Oak Avenue, Bloomington, IL 61701"
```

Address column detection (in order): a column named `address` / `street` / `delivery address` / … → separate `street`+`city`+`zip` columns → fall back to the first column. A `customer`/`name`/`client`/… column is used as the marker label.

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check + production build (outputs to `dist/`) |
| `pnpm type-check` | Type-check only |
| `pnpm preview` | Preview the production build |

## Notes on TypeScript 7

TypeScript 7 is the new native (Go-based) compiler. Its `tsc` is a thin wrapper around a native binary, so tools that need the full JS compiler API (like `vue-tsc` for type-checking `.vue` files) can't drive it directly. This project therefore:

- keeps **`typescript@7`** as the primary compiler (`tsc`),
- uses the official **`@typescript/typescript6`** bridge (`typescript6` in `devDependencies`) so `vue-tsc` can type-check Vue SFCs,
- runs `vue-tsc` through a tiny launcher: `scripts/vue-tsc.cjs`.

## Project structure

```
src/
  components/        Vue components (map, list, upload, settings, badges)
  services/          storage, csv parsing, geocoding, maps loader, distance
  stores/            reactive stores synced to localStorage (composables)
  types/             shared TypeScript types
  utils/             small helpers
scripts/vue-tsc.cjs  vue-tsc launcher for the TypeScript 6 bridge
```

## How data is stored

Everything is kept in `localStorage` under the `fertilizer-delivery:` prefix:

- `fertilizer-delivery:settings` — API key + starting point
- `fertilizer-delivery:deliveries` — your imported deliveries and their statuses

Use **Clear all** in the app to wipe your data.

