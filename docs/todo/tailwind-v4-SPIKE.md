# Tailwind v4 upgrade spike (Cycle Forge)

**Status:** **Done** (2026-07-30) — app on Tailwind `4.3.3` + `@tailwindcss/postcss`.
Parent: [`kinetic-ledger-station-safety-PLAN.md`](./kinetic-ledger-station-safety-PLAN.md) §9 Phase 5.

**Shipped shape (bridge, not full `@theme` rewrite):**

| Piece | Location |
|---|---|
| Engine | `tailwindcss@^4` + `@tailwindcss/postcss` (autoprefixer removed) |
| PostCSS | `postcss.config.mjs` → `@tailwindcss/postcss` only |
| CSS entry | `src/app/globals.css` — `@import "tailwindcss"`, `@config`, `@source` globs + inline safelist |
| JS theme / plugins | `tailwind.config.ts` still owns colors, CF Type `fontSize`, spacing intents, z-index |
| Colors | Plain `'var(--ds-…)'` — **no** v3 `themed()` function colors (unsupported in v4) |

## Exit criteria

- [x] Single Tailwind major in lockfile (v4)
- [x] CF Type roles + spacing intents still emit (compiled CSS smoke)
- [x] `npm run verify -- --fast` + `test:ds-guards` + `next build` green
- [x] `build-gotchas.md` updated for v4
- [ ] Optional follow-up: migrate `theme.extend` into native `@theme` / `@utility` and delete `@config`

## Operator note

PostCSS plugin change requires a **dev server restart** on `:3050` (agent never starts/kills it).

## Non-goals (still)

- Redesigning the token palette
- Renaming semantic `surface-*` / `text-*` utilities
- Full CSS-first `@theme` migration (tracked as optional follow-up above)
