---
description: Identifier last-8 face and match come from one helper — never slice(-8) / RIGHT($1, 8) on the input / a local last8 by hand
condition:
  - '\.slice\(\s*-\s*8\s*\)'
  - '\.substr\(\s*-\s*8\s*\)'
  - '\.substring\([^)]*length\s*-\s*8'
  - '\b(?:RIGHT|right)\(\s*(?:\$\d+|\?)(?:::\w+)?\s*,\s*8\s*\)'
  - '\.padStart\(\s*8'
  - '\b(?:function\s+(?:last8|lastEight|trackingTail|getLastEightDigits|getOrderIdLast8)\b|(?:const|let)\s+(?:last8|lastEight|trackingTail|getLastEightDigits|getOrderIdLast8)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>))'
scope:
  - 'tool:write(**/src/**/*.ts)'
  - 'tool:write(**/src/**/*.tsx)'
  - 'tool:edit(**/src/**/*.ts)'
  - 'tool:edit(**/src/**/*.tsx)'
globs:
  - '!{**/src/lib/copy-chip-format.ts,**/src/lib/tracking-format.ts,**/src/lib/operational-identity.ts,**/*.test.*,**/src/lib/migrations/**/*,**/*.sql,*}'
interruptMode: always
---
STOP — this hand-rolls an identifier's last 8. One helper per job (read `rule://identifier-last8-contract`):

- **Display** the short face: `getLast8` / `getLast8Serial` / `formatOrderIdDisplay` from `@/lib/copy-chip-format` (`CHIP_DISPLAY_LEN = 8`; strips prefixes before cutting).
- **Paint** it: `CopyChip` with `displayWidth="last8"` (`@/components/ui/CopyChip`) or `OperationalIdentityChip` (`@/design-system/components/OperationalIdentityChip`). Copy the FULL value — the face is last 8, the clipboard is never cut.
- **Match** a scan / typed tail: `normalizeTrackingLast8` / `orderTrackingMatchKeys` from `@/lib/tracking-format`. SQL `RIGHT(col, 8)` on a COLUMN stays (the `idx_stn_*_last8` indexes depend on it); never `RIGHT($1, 8)` on the bound input — pass the helper's output as the parameter.

Where (operator ruling B1, 2026-10-04): last 8 when the identifier is in a LIST (rows, cards, chips, scan tape — any identifier kind); record bodies keep the full id; copy is always the full value.

A shape the helpers lack (e.g. digits-only order tail) is added to `src/lib/copy-chip-format.ts` or `src/lib/tracking-format.ts` and exported — never a local `last8` / `trackingTail` / `getLastEightDigits` / `getOrderIdLast8`.
