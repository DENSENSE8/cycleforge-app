# Handoff — Rail peek identity: catalog-resolved faces (not padding)

**Status:** LANDED on Unbox / Receiving peek (paired rows + empty→platform face).  
**Next:** sibling surfaces below — same prompt, swap host.  
**Lane:** stay on the checkout branch. No ad-hoc branch, no worktree, never `git stash`.  
**Commits:** user manages. Stage only files you touch.  
**Dev server:** attach to `:3050` — never start / restart / kill.

**Supersedes:** ad-hoc “nudge chip padding” passes that left tracking on the far right and SKU/serial on different vertical rhythms.

---

## 0. False diagnosis vs real root

| Symptom | What it looks like | False diagnosis | Real root |
|---|---|---|---|
| Tracking “padding too high” | Tracking sits **top-right**; big empty air under it | “TrackingChip has extra `pt-*`” | **Two-column header with `ml-auto` tracking** — empty right column *reads* as padding. |
| SKU vs serial gap differs | Order→SKU air ≫ SKU→serial | “Section `gap-y` is uneven” | **Chip face footprint mismatch** — Order/Tracking use `last8` + `fitDisplayWidth`; Sku/Serial must share `PEEK_FACE`. |
| Empty order looks broken | Quiet `—` or slug on face | “Need a louder placeholder” | **Empty policy fork** — `keepEmpty` order must paint **catalog `platformLabel`** (same name as order-chip hover prefix), not `—` / raw slug. |
| Icons / text not on one rail | Label x starts at different columns | “Need more icon CSS” | Flush host + shared face width; broken when chips disagree on face props. |

**Prior attempts failed** because they treated symptoms (`p-*` / `gap-y` / flush) while layout, face footprint, or resolve still forked.

---

## 1. SoT (do not fork)

| Module | Job |
|---|---|
| `src/components/sidebar/rail-shell/RailPeekIdentityFacts.tsx` | Identity chip ladder + pair stack + empty→platform face |
| `src/components/sidebar/rail-shell/rail-peek-chrome.ts` | Pad / seam / chip-stack / pair / face-flush tokens |
| `src/components/ui/CopyChip.tsx` | Typed chips (`OrderIdChip` · `TrackingChip` · `SkuScanRefChip` · `SerialChip` …) |
| `src/lib/source-platform.ts` + `usePlatformMeta` | Catalog platform label + icon tone |
| `src/components/ui/CarrierMark.tsx` | Carrier paint inside `TrackingChip` (`footprint="chip"`) |
| Guard | `rail-peek-identity.guard.test.ts` + `source-platform-identity.guard.test.ts` |

Hosts only pass **raw facts** (`value`, `platformValue`, `carrierHint`). Never paint chips in Labels / Pack / Shipping / Receiving popover.

---

## 2. Locked decisions (landed — do not re-litigate)

| # | Decision |
|---|---|
| **L1** | Peek identity = **paired rows** with air in the middle: `order·trk` → `sku·sn` → `ticket` → `bin`. Equal `gap-y-1` between rows; pair rows use `justify-between`. |
| **L2** | Tracking is **never** `ml-auto` beside order. `ml-auto` exists only for Receiving **pickup pill** when tracking is absent (`showOrderWithPill`). |
| **L3** | Platform color on order/PO via `usePlatformMeta` + `platformMetaIconTone`. Tracking color = **carrier** (`CarrierMark`), not marketplace. |
| **L4** | Face parity: Order / PO / Tracking / SKU / Serial spread `PEEK_FACE` (`displayWidth="last8"` + `fitDisplayWidth`). Serial also `width="w-fit max-w-full shrink-0"`. **Exception:** empty order with platform-name face uses content width + `fitDisplayWidth` only (variable catalog label). |
| **L5** | Empty policy: **serial omit** (never `keepEmpty` placeholder); **order keepEmpty** → face = catalog `platformLabel` (hover-prefix parity). Unknown platform → quiet `—`. |
| **L6** | Compact activity **row face** stays chip-free — chips live only on the hover peek. |
| **L7** | Hard refresh / DevTools proof required — HMR has lied about this stack before. |

---

## 3. Acceptance (golden = Receiving / Unbox recent rail)

On a row with **order + tracking + sku + serial** (and on an **unfound / empty order** with platform):

- [x] Paired rows: `order · trk` / `sku · sn` / optional ticket — `justify-between`, not far-right `ml-auto` tracking alone.
- [x] Vertical gap equal (`gap-y-1`); shared face footprint via `PEEK_FACE`.
- [x] DOM: `data-rail-peek-identity="stack"` + `<ul role="list">` of `<li>` pair rows.
- [x] Empty order face = catalog platform name (e.g. `eBay`) — same string as order-chip hover prefix.
- [x] Empty serial omitted.
- [ ] Guard green + `npm run verify` before calling done (re-run after sibling work).

**Must not:** reintroduce tracking `ml-auto`; asymmetric `mt-*`/`pt-*` per chip; page-local chip strip / slug map; raise DS ratchet baselines.

---

## 4. Sibling surfaces to migrate next (same prompt, swap host)

| Surface | Notes |
|---|---|
| `StackedRowIdentity` consumers | Layout shell is fine — audit **keys** for local resolve / slug faces |
| Search order feedback | Already passes `platformLabel` from `usePlatformMeta` — audit empty/omit + face parity |
| `CartonContextCard` | Already resolves platform — audit empty order face if any |
| Labels / Pack / Shipping peeks | Already `RailPeekCard` hosts — **audit facts only** (`platformValue` · `carrierHint` when the feed has them; TechRecord has no `carrier` today) |

---

## 5. Files you may touch

| Path | Why |
|---|---|
| `RailPeekIdentityFacts.tsx` / `rail-peek-chrome.ts` | Stack + face + empty policy |
| `rail-peek-identity.guard.test.ts` / `source-platform-identity.guard.test.ts` | Ratchet |
| `CopyChip.tsx` / `CarrierMark.tsx` | Forward face props / chip footprint |
| Hosts (`LabelsRecentRail`, `PackRecentPacksRail`, `ShippingStaffScanHistoryRail`, `RecentActivityRailBase`) | Raw facts only |
| Sibling surface under §4 | Same grammar — no twin strip |

---

## 6. Prompt for the next agent (copy/paste)

```
# Handoff — <surface> identity: catalog-resolved faces (not padding)

## 0. False diagnosis vs real root
| Symptom | False | Real |
|---|---|---|
| … | nudge p-*/gap | face footprint / empty policy / resolve fork |

## 1. SoT (do not fork)
| Module | Job |
| RailPeekIdentityFacts / CopyChip / source-platform / CarrierMark | … |

## 2. Locked decisions
- Hosts pass raw facts only (value · platformValue · carrierHint)
- Empty policy: serial omit · order keepEmpty → platformLabel face
- Face parity: PEEK_FACE last8+fit (except platform-name empty face = content width)
- Platform from usePlatformMeta; tracking from CarrierMark
- Never page-local chip strip / slug map / ml-auto twin

## 3. Acceptance
- Hover proof on :3050 (hard refresh)
- Empty order shows catalog platform name (same as order-chip hover prefix)
- Guard: rail-peek-identity + source-platform-identity
- npm run verify before done

## 4. Sibling surfaces to migrate next (same prompt, swap host)
- StackedRowIdentity consumers
- Search order feedback
- CartonContextCard
- Labels/Pack/Shipping peeks (already hosts — audit facts only)
```

**One-liner:**

> Upgrade `<surface>` identity to the RailPeekIdentityFacts grammar: raw facts in, catalog platform / carrier resolve in the SoT, CopyChip PEEK_FACE parity, empty-order paints `usePlatformMeta().label` (hover-prefix parity), empty serial omits. No padding twins. Guard + hard-refresh proof on :3050.
