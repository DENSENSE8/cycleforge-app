---
description: How identifiers are shortened, painted and matched
globs:
  - 'src/**'
---
Operator ruling (verbatim, 2026-10-04): "there is also a rule that I need to implement within the OMP coding harness for the identifiers to use the last eight of the identification number."

## Ruling B1 (operator 2026-10-04, binding)

- **In a list, an identifier shows its last 8** — rows, cards, chips, scan tape; any identifier kind (tracking, order #, serial, ticket, PO, carton).
- **Record bodies keep the full id** (the 2026-09-30 ruling stands: on a record body, order # / tracking # are always full — `RecordFullId`).
- **Copy is always the full value**, whatever the face shows.
- **Matching** a scan or a typed tail uses `normalizeTrackingLast8` / `orderTrackingMatchKeys`.
- The last-8 face and the last-8 match each come from ONE helper. Never `slice(-8)`, `substring(len - 8)`, `padStart(8…)` or a local `last8` / `trackingTail` / `getLastEightDigits` by hand outside the helper homes.

## One source of truth per job

| Job | Canonical helper | File |
|---|---|---|
| **Display** an identifier's short face | `getLast8`, `getLast8Serial`, `formatOrderIdDisplay`, `CHIP_DISPLAY_LEN = 8` (`abbreviateIdentifier` strips prefixes / leading punctuation before cutting) | `src/lib/copy-chip-format.ts:5,38,57,65,76` |
| **Paint** it (copy-on-click, full value copied) | `CopyChip` family (`displayWidth="last8"`), `OperationalIdentityChip` | `src/components/ui/CopyChip.tsx`, `src/design-system/components/OperationalIdentityChip.tsx` |
| **Match** a scan / typed tail to a record | `normalizeTrackingLast8`, `orderTrackingMatchKeys` | `src/lib/tracking-format.ts:127,140` |
| Order / PO identity model | `OperationalIdentity` | `src/lib/operational-identity.ts` (ledger entry `operational-identity`) |

## SQL

`RIGHT(col, 8)` in SQL sits behind the `idx_stn_*_last8` indexes — keep the SQL shape; route the *input* through `normalizeTrackingLast8` / `orderTrackingMatchKeys` (never cut the parameter by hand).

## Helper homes (the only places a raw last-8 cut may live)

`src/lib/copy-chip-format.ts`, `src/lib/tracking-format.ts`, `src/lib/operational-identity.ts`; tests (`**/*.test.*`); SQL migrations (`src/lib/migrations/**`). A missing helper shape (e.g. digits-only order tail) is added to one of these homes and exported — never forked locally.
