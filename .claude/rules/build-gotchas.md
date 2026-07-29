# Build / dev gotchas

Silent-failure traps specific to this stack (Next 16, Turbopack dev, Tailwind). Summarized in root `CLAUDE.md`.

## tailwind.config.ts must import values modules as `.mjs` (z-index, spacing)

- `tailwind.config.ts` imports the z-index and spacing scales from
  `src/design-system/tokens/z-index.mjs` / `spacing.mjs`.
- Use the explicit `.mjs` extension — do **not** import the `.ts` twins here. Node loads
  Tailwind config directly; a `.ts` ESM import triggers `MODULE_TYPELESS_PACKAGE_JSON`
  reparsing (build noise + overhead). App code keeps importing `@/design-system/tokens/*`.
- Values live in the `.mjs` module; the `.ts` twin re-exports with types.
- A bare extensionless import can also fail under Turbopack dev (silent missing `z-*` utilities).

## Tailwind content globs: a class used only in an un-scanned file renders invisible

- A Tailwind class referenced **only** inside a file not covered by the `content` globs (this bit us when logic moved
  into newer `src/lib` paths, e.g. `outbound-state.ts`) is silently not generated — no error, the style just doesn't apply.
- Prefer already-generated shades. If you must add a class in a new path, update `content`/`safelist`
  and **restart the dev server** (glob changes aren't picked up hot).

## Bundle altitude: keep light helpers out of heavy modules (and barrels honest)

Found six live instances in the 2026-07 Lighthouse pass — each silently shipped a
whale (bwip-js ~250 KB gz, the Neon driver) in every consumer's client bundle:

- **Do:** put pure label/format/ref helpers in their own dependency-free module
  (`lib/print/labelHtml.ts`, `lib/receiving/receiving-type-display.ts`,
  `lib/support/ticket-refs.ts`, `lib/photos/image-type-defs.ts`); the heavy
  module re-exports them so server callers keep their import path.
  **Don't:** export a one-line display mapper from a module that also imports a
  print engine or `tenancy/db` — every client consumer inherits the whole graph.
- **Do:** keep feature barrels (`lib/stations/index.ts`,
  `lib/channel-allocation/index.ts`) free of server-only modules; server callers
  import the concrete file. **Don't:** `export * from './x'` a `tenancy/db`
  importer out of a barrel that client components read.
- **Do:** load print/barcode engines inside the user action
  (`await import('@/lib/print/printLabel')` in the `print*Label` entries,
  async SVG fill in `Gs1DataMatrix`). **Don't:** import `bwip-js` (directly or
  transitively) at module top-level in anything a station bundle can reach.
- `src/lib/db.ts` carries `import 'server-only'` — a client-side path to it is a
  **build error** that prints the exact import chain. Fix the chain's altitude
  (split a light module); never remove the guard to make the build pass.
- Perf tooling for this axis: `pnpm lighthouse:audit`
  ([`docs/performance/LIGHTHOUSE.md`](../../docs/performance/LIGHTHOUSE.md)).
- Route-key dispatchers that statically import every branch
  (`SidebarContextPanel` before the fix) put every feature's graph in the shared
  shell chunk — dispatch on `next/dynamic` imports instead.
