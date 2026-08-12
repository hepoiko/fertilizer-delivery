#!/usr/bin/env node
/**
 * vue-tsc launcher for TypeScript 7 projects.
 *
 * TypeScript 7 is the native (Go-based) compiler: its `lib/tsc` is only a thin
 * shim that spawns the native binary, so `vue-tsc` (which drives the full JS
 * compiler API to type-check `.vue` files) cannot use it directly.
 *
 * The supported bridge is `@typescript/typescript6` (a.k.a. `typescript6`),
 * which ships the full TypeScript 6 JS compiler. We keep `typescript@7` as the
 * project's primary compiler and point vue-tsc at the JS bridge here.
 *
 * Usage: node scripts/vue-tsc.cjs [tsc-args...]
 */
const { run } = require('vue-tsc')

// Full JS compiler shipped by the @typescript/typescript6 bridge.
const tscPath = require.resolve('typescript6/lib/tsc')

run(tscPath)
