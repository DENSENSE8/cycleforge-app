# HANDOFF — Kiosk design-system unification (Phase 0/1 + Add-reason CTA landed; Phase 1 next)

**Date:** 2026-09-14 · **Lane:** `cycleforge-lanes/prod` · **Surface:** `/kiosk`, `/kiosk/v2`

---

## 0. How to run the thing (read first — this burned an hour)

- **View at `http://localhost:3050/kiosk/v2`.** Port 3050 is NOT a Next server — it is the
  Garisek-OS switchboard proxy (`scripts/switchboard/server.ts`). It forwards to the port named
  in `~/.config/cycleforge/switch` (currently `3077`), served by the systemd unit
  `cycleforge-lane@prod`.
- **NEVER hand-start `next dev` in this checkout.** Next 16 holds `.next/dev/lock`; a manual
  server makes the systemd unit crash-loop into `start-limit-hit`. If the lane is down:
  ```
  systemctl --user reset-failed cycleforge-lane@prod
  systemctl --user start cycleforge-lane@prod          # or: curl -X POST localhost:3050/__switch/start
  ```
  A bare `next dev` launched from a shell also misses the unit's EnvironmentFile and dies on the
  `[db] Database DSNs name 2 different Neon branches` guard.
- **Playwright:** bundled chromium works; `--project=desktop` / `qa-desktop` only. The `mobile`
  project cannot launch on this machine (missing WebKit system libs — needs
  `sudo npx playwright install-deps`).
- **Chrome-devtools MCP and the eval `browser` object both fail here** (no system Chrome, relay
  extension never connects). Use Playwright, or `/usr/bin/chromium` via
  `chromium.launch({ executablePath })`. Import from `@playwright/test`, not `playwright`.
- **Unit tests:** runner differs per file. `src/lib/auth/withKioskAuth.test.ts` needs
  `NODE_OPTIONS='--conditions react-server' npx tsx --test …` (it pulls `server-only` via db.ts).
  `src/components/repair/repair-step-gates.test.ts` needs the PLAIN `npx tsx --test …` (the
  react-server condition breaks lucide-react's `createContext`).

### The gate battery (run all before claiming done)

```
npx tsc --noEmit -p tsconfig.json
npx tsx --test src/app/kiosk/kiosk-pos-surface.test.ts                    # 9 pass
npx tsx --test src/components/repair/repair-step-gates.test.ts            # 6 pass
npx tsx --test src/lib/repair/sku-reasons.test.ts                         # 9 pass
timeout 300 npx playwright test tests/e2e/kiosk-intake-flow.spec.ts -g "landscape shell" \
  --project=desktop --retries=0 --workers=1 --reporter=list                # 2 pass
node /home/michaelgarisek/Projects/Garisek-OS/tools/eval-engineering/cursor-eval.mjs --root . --fast
```

`GARISEK_OS_ROOT` is unset in this shell — use the absolute path above.

---

## 1. Repo laws that constrain this work

- **Design MCP is mandatory for UI writes.** `ds_contract` BEFORE writing a component,
  `ds_tokens <axis>` for any value (never invent a hex/px/`text-[Npx]`), `ds_critique <file>`
  after. Hooks deny `src/**/*.{tsx,jsx,css}` writes without a fresh
  `.cursor/design-mcp-session.json` stamp — any `ds.mjs` call refreshes it.
  CLI: `node tools/design-mcp/ds.mjs {contract|tokens|critique} …`
- **Pins are hand-curated prose in `src/design-system/pinned.json`** — entries carry ONLY
  `useWhen`/`doNot`/`law` (59 entries). The `cohort`/`evalCommand`/`refuse` fields visible in
  `ds_contract` output come from Garisek's shared rule module; **this repo has no visual
  adjudicator** — the server's own header says "ESLint and the Boundary gate are this repo's
  machines." So a `refuse` key written here enforces NOTHING. Enforce with a real test instead.
- **Mobile-first surface law** (`docs/mobile-first/SURFACE_LAW.md`): every operator verb must be
  completable on `/m/*` first; desks/kiosks consume that SoT.
- **PG6 (progression law)** — `docs/warehouse-os/PROGRESSION-INTERVIEW-LEDGER.md`: progress is a
  COUNT of satisfied required units, NEVER a pointer position. Paging to step 3 of an empty form
  reads 0/3, not 3/3.
- **M1 / PG12 (motion law)**: progress fills are `scaleX` + `transformOrigin:'left'`, duration
  `framerDuration.progressFill`, gated by `useReducedMotion`. Never animate width/height/position.
- **Motion MCP is a required first step** before writing any animation/transition:
  `search-motion-docs { platform: "react", searchTerm: "…" }`.
- **One header band per pane.** KioskShell renders `KioskTopChrome` only when
  `utilitySlot !== null`; the buyback/pickup branches render their own titled band. Rendering both
  stacked two chromes on the pickup screen (fixed 2026-09-14).
- **One SoT background.** `KIOSK_POS_CANVAS = 'bg-surface-card'` — no page-local hex anywhere in
  kiosk scope (`bg-[#FAFAFA]` repealed 2026-09-14; pinned by `kiosk-pos-surface.test.ts`).

---

## 2. What landed in this session (all verified green)

### Kiosk trail row (`src/components/repair/ProductSelector.tsx`, `kiosk-split` branch ~1300-1460)
Order is now `[command dropdown] [search glyph] [back] [categories nav] … [stance · 📄 · 🛒]`.
The search glyph is a **press-to-toggle** (`aria-pressed`, `HEADER_ICON_BTN_OPEN_CLASS` applied
AFTER `KIOSK_POS_TRAIL_ICON` so twMerge doesn't drop the open fill), with a wired in-field X
(`closeCatalogSearch` was defined but never bound — dead button, fixed) and Escape parity.
`KioskTopChrome` deliberately has **no** search glyph — comment in-file explains why (single
search state, no fork).

### Unpaired state removed outside production (`src/lib/auth/withKioskAuth.ts`)
First tokenless kiosk API call auto-binds org #1's dogfood device (same stable row as
`/api/kiosk/dev-autopair`, so no row churn) and pins `cf_kiosk` on the response. Production keeps
the 401 `KIOSK_UNPAIRED` enrollment contract. Injectable `devAutobind`/`isProduction` deps;
7 unit tests pin both postures.

### SoT white ground (`src/app/kiosk/kiosk-pos-surface.ts`)
`KIOSK_POS_CANVAS = 'bg-surface-card'`, dock glass `bg-surface-card/70 backdrop-blur-lg`.
Verified at runtime: canvas computes `rgb(255,255,255)` = `--ds-color-background-surface`.
**Side effect to know:** product cards now separate by whitespace + hairline only (no visible
shadow at md+) against the white ground.

### Realtime 405 fixed (`src/app/api/realtime/kiosk-token/route.ts`)
`AblyProvider authUrl` GETs; route was POST-only → every kiosk load 405'd and the session mirror
never attached. Added `export const GET = POST;`.

### Phase 0 deletions (`src/app/kiosk/kiosk-chrome.ts`, 267 → ~180 lines)
Eleven zero-consumer exports deleted with dated ledger comments (all `KIOSK_MODE_SPINE_*` except
`_ROW`/`_ROW_IDLE`/`_ICON`, plus `KIOSK_BAND_SEARCH_ROW`, `KIOSK_UTILITY_SPINE_FACE`,
`KIOSK_CART_FACE`, `KIOSK_CART_COL`/`_PX`, `kioskSpineShortLabel`).
**The three survivors are ProductSelector's trail back button** — they retire when Phase 1's
`KioskPaneForm` absorbs that affordance.

### Progress SoT (the Duolingo header)
- `src/design-system/primitives/ProgressBar.tsx` — new `segments?: number` face: N increments,
  per-segment `scaleX` fill under the existing M1/PG12 law, `role="progressbar"` + aria values.
  (The pin's law had specified segmented squares since the ledger work; only the continuous face
  was built. Extended, not forked.)
- `src/design-system/primitives/StepProgressHeader.tsx` — **new**: `[X] [segments] [n/N]` in one
  `h-14` hairline band. Count is COMPLETED units (PG6).
- `src/app/kiosk/v2/KioskRepairPane.tsx` — first mount, replacing the old `‹ Repair details` band.
- `src/components/repair/repair-intake-logic.ts` — `repairStepGates(data, hasSignature)`: one
  gate table feeding both the per-step Continue key and the header count.
- `src/components/repair/repair-step-gates.test.ts` — 6 behavior tests defending PG6.
- `pinned.json` — `StepProgressHeader` added, `ProgressBar` amended (57 → 59 pins).

### Dead Continue on Sales (`KioskShell.tsx` + `ProductSelector.tsx`)
`onContinue` was passed for both commands but `catalogPhase` is pinned to `'browse'` and
`stageContent` is null for retail → the key rendered, enabled, and **did nothing**. Now
command-aware: Repair → details stage; Retail → opens the cart ledger, labeled via the new
`continueLabel` prop ("Review cart · N items"). Verified: click opens `kiosk-cart-ledger`.

### Repair step form polish (latest)
Paperwork sheet removed from the pane (still reachable from the header cluster's 📄 glyph);
`ReasonSelector`'s duplicate "Reason for repair" section label deleted; one bold display header
per step, top-left — `STEP_HEADERS = ['Reason for repair','Contact information','Review & sign']`
rendered as `text-role-display font-bold text-text-default` (computed 700 / 24px / rgb(15,23,42)
/ left).

### Add-reason CTA (latest — landed, all gates green)
Operator ask: *"there should be an add button top right as a CTA button so you would be able to
add a reason for repair for that SKU specifically."* Step 0 now paints
`[Reason for repair]…………[+ Add]` on ONE row inside `KIOSK_POS_FORM_MEASURE`, and the kiosk can
read AND write the per-SKU reason vocabulary as a device principal.

The trap named in the last handoff was real: `useRepairIntakeData(null, true)` returned
`skuIssues: []` by design (the staff `/api/repair/issues` is `withAuth` and 401s on a device), so
the kiosk only ever showed the built-in fallback registry. What landed:

- **`src/lib/repair/sku-reasons.ts`** — the domain layer both principals share.
  `listSkuReasons` / `addSkuReason` take `orgId` + injected `deps` (no DB in the rules), so
  tenant scoping is a thing a test asserts. `addSkuReason` REFUSES a SKU-less create (a tablet
  must not be able to add a row every repair on the floor then shows), dedupes case-insensitively
  against the SKU's own + the org's global rows, and writes `sort_order = 100` so an added reason
  lands where the optimistic paint put it (bottom) instead of above the seeded globals.
  Also owns `mergeReasonLabel` + `visibleReasonBase` + `isMissingRelationError` (the staff route
  now imports the last one instead of keeping its own copy).
- **`src/lib/favorites/sku-favorites.ts`** — `findFavoriteSkuIdBySku` +
  `ensureFavoriteSkuAnchor`. `repair_issue_templates.favorite_sku_id` FKs to `favorite_skus`, but
  the kiosk catalog is the whole Ecwid repair tree, so most picked SKUs were never favorited. The
  anchor inserts a `favorite_skus` IDENTITY row with **no `favorite_sku_workspaces` membership** —
  `listFavoriteSkus` INNER JOINs workspaces, so an anchor never appears in a staff quick-pick
  (verified at runtime: `/api/kiosk/repair/favorites` count unchanged). No `ON CONFLICT` clause
  on purpose (the natural key moved global → per-org in
  `2026-06-16_favorite_skus_per_org_unique.sql`; naming either breaks on DBs with the other) —
  a lost race catches 23505 and re-reads.
- **`src/app/api/kiosk/repair/issues/route.ts`** — `withKioskAuth` GET + POST, zod-validated,
  SKU named by STRING (`?sku=`, `{sku,label,productLabel}`). Read-only sibling of the staff route
  for edit/delete (those stay staff-only). `/api/kiosk/repair(?:$|\/)` already covers it in
  `KIOSK_HOST_ALLOWED_PATHS` — no allowlist change was needed.
- **`src/components/repair/useKioskSkuReasons.ts`** — the kiosk-side hook (sibling of
  `useRepairIntakeData`, which stays on the staff path). `useOptimisticMutation` is NOT used and
  should not be: the kiosk tree mounts no `QueryClientProvider`, and per the pin a create with no
  cached row is not its job. Same law by hand — paint, persist, roll back + `toast.error`.
  A `addedRef` replays local adds onto every load result, because the mount fetch (doubled by
  React's dev StrictMode) can land AFTER an add and would otherwise erase a saved reason.
- **`KioskRepairPane`** — CTA (`Button variant="secondary"`, `icon={<Plus />}`, disabled with a
  title when the selection has no `sourceSku`), an inline `<form>` + `KioskEntryField` entry row
  (a form so the tablet keyboard's Go key commits), and `submitReason`, which selects the new
  reason in the SAME frame as the pill. Selecting after the round trip left the pill unselected
  for ~1.5s and read as a missed tap — the e2e caught exactly that.

`ds_contract` said `DeskActionSlot` (desk header registry — not a kiosk affordance) or the ops
`Button`; the CTA is the `Button`, `secondary` so the step keeps ONE primary (footer Continue).
`ds_adjudicate` on the new markup: `allowed`, no violations.

Verified: 9 new domain tests; `verify:fast` PASSED (lint + typecheck + boundary); `landscape
shell` e2e 2/2; throwaway Playwright run drove the real tablet surface (CTA geometry top-right of
the header, add → selected pill, survives reload, zero `/api/kiosk/*` 401s) and a device
principal with an EMPTY cookie jar got 201 + read-back over HTTP. Smoke rows and anchors written
during verification were deleted again (only the 6 seeded globals remain).

One leftover fixed on the way past: `ReasonSelector`'s `KIOSK_SECTION_LABEL` import was dead
since the last session deleted that label — it was failing `eslint src` as an error.

### Command ink on the mode selector (latest — landed)
Operator 2026-09-14: *"color in icons… repair, sales, buyback, pickup icons in the modes selector
top left — repair orange and sales green and more colors for other."*

The ink lives in the command SoT, not the call site: `KioskServiceTile.iconTone`
(`src/lib/kiosk/services.ts`) carries ONE semantic text token per command, so the glyph reads as
that command wherever it mounts. `KioskTopChrome`'s `KioskCommandMenu` is the only mount today
(`liveKioskServices` / `welcomeKioskServices` have no consumers since the welcome tiles came
down), and the same class paints BOTH faces — the dropdown option row and the trigger's selected
glyph, because `IntakeCombobox` wraps glyphs in a `text-text-soft` span and a colour ON the svg
beats inherited ink.

| command | token | computed (light) |
|---|---|---|
| Repair | `text-text-warning` | `rgb(234,88,12)` orange — same ink `StatCard` gives the repair lane |
| Sales | `text-text-success` | `rgb(22,163,74)` green |
| Buyback | `text-text-info` | `rgb(37,99,235)` blue |
| Pickup | `text-text-fulfillment` | `rgb(147,51,234)` violet — the outbound/ready ink |

Semantic tokens, not raw palette (`ds_tokens color`), so the commands stay legible on dark /
ember / cyberpunk. Exit stays neutral. Verified at runtime: computed `color` read off all four
option glyphs + the trigger, screenshot checked; `ds_critique` on `KioskTopChrome.tsx` clean
(0 arbitrary literals); tsc + eslint clean; `landscape shell` e2e 2/2; 24 kiosk unit tests pass.

---

## 4. NEXT TASK — Phase 1: extract `KioskPaneForm`

Extract the pane frame — header band (X/back + measure) + scroll body + footer key. Port
`KioskRepairPane` first, then `KioskBuybackPane` and `KioskPickupPane`. This retires the last
three `KIOSK_MODE_SPINE_*` tokens (ProductSelector's trail back button is their only consumer)
and kills the double-band class of bug structurally. It also cuts `KioskRepairPane`, now
**483 lines** — `ds_critique` flags it at 340 counted lines ("past the point reviewers read");
the step-0 header row + add-reason entry are the obvious leaf to lift out with the frame.

Start by reading §1 (repo laws) and `KioskRepairPane`'s three step branches; the add-reason
entry row and its CTA must land in the extracted header slot, not be re-hand-rolled per pane.

## 5. The remaining plan (agreed with the operator)

- **Phase 2:** pill/chip family. `KIOSK_PILL*` is a parallel system beside the pinned `badge`
  ("never hand-roll a rounded-full span"). Promote the kiosk pill as the TOUCH tier of one chip
  family; port to cart line status, command-menu options, stance options, pickup order state,
  buyback grade. (The operator explicitly likes the pills/chips and wants them spread.)
- **Phase 3:** motion — exactly three kiosk roles: pane push (`motionRole.push.rail` grammar),
  chip press (`TACTILE_PRESS_TRAVEL_CLASS`, exists), selection wash (150ms colour). Query the
  motion MCP first.
- **Phase 4:** pour into the MCP server — pins per phase (prose only), a `kiosk-skin` tokens axis
  mirroring the `station-skin` precedent, and law tests as the enforcement machine.

## 6. Known open items (reported, not fixed)

- Kiosk page fires staff-authed `/api/staff?active=false` and `/api/catalog/platforms` → 401s in
  console. Caller is outside the kiosk tree (layout-reachable); cosmetic today.
- `repair-failure-reasons.ts` contains "Please wait" and "Skip" as repair reasons (codes
  `PLEASE_WAIT`, `SKIP`) — look like seed leftovers on the operator's floor.
- The kiosk still fires the staff-authed `/api/reason-codes?flowContext=repair_failure` (from
  `useReasonVocabulary` inside `ReasonSelector`) → 401 on a device principal; the pills fall back
  to the built-in registry, and the kiosk's own `/api/kiosk/repair/issues` already returns the
  org's DB globals, so the call buys nothing there. Either give it a `withKioskAuth` sibling or
  skip it when `appearance="pills"`. Cosmetic today (one console 401), but it is the last kiosk
  401 inside the repair pane's own tree.
- Product cards on the white ground separate by whitespace/hairline only (see §2).
- `mobile` Playwright project unrunnable on this machine (system libs).
