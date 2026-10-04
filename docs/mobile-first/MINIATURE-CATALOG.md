# MINIATURE-CATALOG — mobile compact display primitives (UI/UX SoT inventory)

**Date:** 2026-10-01 · **Track:** Mobile V2
**Operator directive (verbatim):** "what's most important for mobile is miniature and small detailed
display logic" · "this plan is mainly focused on the UI and UX of the mobile app."
**Laws:** [`SURFACE_LAW.md`](./SURFACE_LAW.md) §5–§6 · design-mcp pins
(`ds_tokens({ axis: 'item-record' })` for item-record faces).
**Scope:** the small-detail vocabulary — atoms (badges, dots, tones, thumbs) and molecules (compact
rows, tape items) that phone surfaces compose. NOT shells, sheets, or cameras.

---

## 1. Atoms

| Component | Home | Responsibility | Tests | Gaps / law notes |
|---|---|---|---|---|
| `MobilePhotoCountBadge` | `mobile/receiving/` | camera + `xN` count; links to gallery when count>0 | ✅ `MobilePhotoCountBadge.test.tsx` (6 render contracts, 2026-09-14) | law pinned: **x0 is never a door** (plain ink even when href/onClick supplied); negative clamp; tabular figures; sm/md rungs. Comment drift fixed |
| `ProgressDots` | `mobile/` | step rail: done/current/pending, ellipsis-compresses past `maxVisible` (default 7) | ✅ `ProgressDots.test.tsx` (11 contracts on `buildDotRail` + a11y face, 2026-09-14) | **token violation (B4):** `bg-emerald-500` / `bg-blue-500` raw Tailwind literals instead of semantic status tokens. Compression trade pinned: current hidden when in the compressed middle |
| `ItemRecordThumb` | `design-system/components/item-record/` | DS-pinned thumbnail | — | DS law (pinned) — consume, never fork |
| `StaffAvatar` | `components/identity/` | staff color/initials avatar | — | used by tape item for scan attribution |
| `CopyChip` family (`OrderIdChip`, `TrackingChip`, `SkuScanRefChip`, `getLast8`) | `components/ui/` | copy-on-tap identity chips (last-8) | — | shared ui-kit primitive (platform layer, sanctioned) |
| `STATE_TONE_CLASSES` | `design-system/tokens/lifecycle.ts` | cross-platform outcome→tone vocabulary | ✅ lifecycle token contracts | V2 scan rows consume semantic dot/text faces; no station-local color map |

## 2. Molecules (compact rows)

| Component | Home | Responsibility | Tests | Gaps / law notes |
|---|---|---|---|---|
| `MobileV2ScanRecentList` | `mobile/v2/scan/` | newest-first scan history: state rail, title, identifier, outcome and relative time; tap opens V2 detail sheet | ✅ `v2-scan-recent.test.ts` | flat DTO maps directly to SwiftUI; no reversed tape or forced bottom scroll |
| `MobileReceivingUnitRow` | `mobile/receiving/` | photo-first per-unit row: qty·price·ticket meta face (`chipText` — one size law), identity chips, expand-only-newest rule (`expanded`), package-header dedup (`headerSharesPoTracking`) | **none** | **boundary crossings:** `station/receiving-constants` (vocab), `receiving/ReceivingIdentityChips` (forward share) — close in C8/C9. **UX flag:** mounts `HoverTooltip` — hover-only affordance on a touch surface (SURFACE_LAW R5 review) |
| `ScanResultRow` | `mobile/feed/rows/` | scan outcome row in feeds | **none** | composes `CaptureStackRow` (DS) + Icons |
| `PendingOrderRow` | `mobile/feed/rows/` | to-ship order row (chips + days-late tone) | **none** | days-late tone from `lib/condition-tone` (logic layer, correct) |
| `MobileV2FulfillmentOrders` row | `mobile/v2/fulfillment/` | compact Allocate queue row with progressive detail | status/layout contracts | V2 is the only mobile fulfillment presentation root |

## 3. DS-pinned laws (consume, never fork)

| Face | Law (from `ds_contract`) |
|---|---|
| `ItemRecordMobileMeta` | ONE cluster under the title (qty · condition · notes). Never split into independent chips; never mount the desk five-track `ItemRecordMetaGrid` on phone |
| `ItemRecordMobileStage` | staff assignment = color mark + catalog verb (Pick/Packed) — **never the person's name on the card**; name lives on the sheet; fill is `staff.color_hex`, never a name hash |

## 4. Ranked worklist (feeds increments B2…Bn)

1. **B2 — scan tone contracts** ✅: V2 now consumes `STATE_TONE_CLASSES`; the station-local tone map and its test were deleted.
2. **B3 — badge + dots contracts** ✅ *(2026-09-14)*: 17 contracts across `MobilePhotoCountBadge.test.tsx` (render-markup pattern per `tracking-chip-last8.test.tsx`) + `ProgressDots.test.tsx` (`buildDotRail` exported as the seam). Badge comment drift fixed. *(The earlier "in-flight badge state" note was a catalog error — the badge has no in-flight concept; that belongs to `PhotoUploadQueue`.)*
3. **B4 — ProgressDots token fix:** `bg-emerald-500`/`bg-blue-500` → semantic status tokens (`ds_tokens({ axis: 'color' })`: `var(--ds-color-surface-success)` / info equivalents). One file, visual-verify.
4. **B5 — UnitRow hover audit:** resolve `HoverTooltip` on touch (tap-to-reveal or move to sheet per SURFACE_LAW R5). Needs UX ruling: operator call.
5. **B6+ — one face per increment** thereafter, priority: `ScanResultRow` → `PendingOrderRow` → V2 fulfillment row.

## 5. Rules for new miniatures

- Semantic tokens only — no raw hex, no bare Tailwind palette classes (`grep -rn "bg-emerald\|bg-blue-\|#[0-9a-f]\{6\}"` on touched files must return nothing new).
- Key display variants off `nav-registry` destination ids, never ad-hoc strings.
- Absence wording belongs to the caller (station's word), tones belong to the vocabulary map.
- One size law per meta cluster (`chipText` for figure faces).
- Touch-first: no hover-only affordances; ≥44px hit via DS sizing.
