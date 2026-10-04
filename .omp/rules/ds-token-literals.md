---
description: No literal px type sizes, radii, z-indexes, hex colours or inline style objects in feature TSX — use design tokens
condition:
  - '\btext-\[\d+(?:\.\d+)?px\]'
  - '\brounded(?:-[a-z]{1,2})?-\[\d+(?:\.\d+)?px\]'
  - '\bz-\[\d+\]'
  - '\[#[0-9a-fA-F]{3,8}\]'
  - '\b(?:className|style)=.*#[0-9a-fA-F]{3,8}\b'
  - ':\s*["'']#[0-9a-fA-F]{3,8}["'']'
  - 'style=\{\{'
scope:
  - 'tool:write(**/src/**/*.tsx)'
  - 'tool:edit(**/src/**/*.tsx)'
globs:
  - '!{**/src/design-system/**/*,**/src/components/ui/**/*,*}'
interruptMode: never
---
Literal visual values (`text-[Npx]`, `rounded-[Npx]`, `z-[N]`, `#hex` colours, `style={{ … }}`) outside the primitive homes (`src/design-system/**`, `src/components/ui/**`) drift from the token scale. Look up the exact class on the right axis and use it:

`node tools/design-mcp/ds.mjs tokens <axis>` — axes: `typography`, `radius`, `z-index`, `color`, `spacing`, `elevation`, `border`, `focus`.

Inline `style` is only for genuinely dynamic values (computed widths, transforms); static styling belongs in token classes.
