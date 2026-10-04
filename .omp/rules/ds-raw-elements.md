---
description: No raw <button>/<input>/<textarea>/<select> in feature TSX — compose the design-system primitives
condition:
  - '<button\b'
  - '<textarea\b'
  - '<select\b'
  - '<input\b(?![^>]*\btype=\{?["''](?:checkbox|radio|file|hidden)["''])'
scope:
  - 'tool:write(**/src/**/*.tsx)'
  - 'tool:edit(**/src/**/*.tsx)'
globs:
  - '!{**/src/design-system/**/*,**/src/components/ui/**/*,*}'
---
Raw form controls outside the primitive homes (`src/design-system/**`, `src/components/ui/**`) fork the house look and a11y. Compose the primitive instead:

- buttons → `Button` / `IconButton` from `@/design-system/primitives/Button` / `@/design-system/primitives/IconButton`
- text inputs / textareas → `TextField` from `@/design-system/primitives/TextField`
- selects / pick-one menus → `DropdownMenu` from `@/design-system/primitives/DropdownMenu`
- mobile bottom verbs (`src/components/mobile/**`, `src/app/m/**`) → `DetailDock` from `@/design-system/components/DetailDock`

Not sure which one fits: `node tools/design-mcp/ds.mjs contract '<job>'`. Mobile vs desktop split: mobile = `src/components/mobile/**` + `src/app/m/**`; never import across that line. A raw element that is genuinely required carries a `ds-raw-button: <reason>` comment on/above it.
