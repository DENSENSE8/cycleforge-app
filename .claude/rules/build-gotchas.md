# Build / dev gotchas

Silent-failure traps specific to this stack (Next 16, Turbopack dev, Tailwind). Summarized in root `CLAUDE.md`.

## tailwind.config.ts must import the z-index token from `z-index.mjs`

- `tailwind.config.ts` imports the z-index scale from `src/design-system/tokens/z-index.mjs`.
- Use the explicit `.mjs` extension — do **not** import `z-index.ts` here. Node loads
  Tailwind config directly; a `.ts` ESM import triggers `MODULE_TYPELESS_PACKAGE_JSON`
  reparsing (build noise + overhead). App code keeps importing `@/design-system/tokens/z-index`.
- Values live in `z-index.mjs`; `z-index.ts` re-exports with types.
- A bare extensionless import can also fail under Turbopack dev (silent missing `z-*` utilities).

## Tailwind content globs: a class used only in an un-scanned file renders invisible

- A Tailwind class referenced **only** inside a file not covered by the `content` globs (this bit us when logic moved
  into newer `src/lib` paths, e.g. `outbound-state.ts`) is silently not generated — no error, the style just doesn't apply.
- Prefer already-generated shades. If you must add a class in a new path, update `content`/`safelist`
  and **restart the dev server** (glob changes aren't picked up hot).
