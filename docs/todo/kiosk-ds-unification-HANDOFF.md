# HANDOFF — Kiosk design-system unification (Phase 0–2 landed; Phase 3 motion next)

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
npx tsx --test src/components/kiosk/kiosk-pane-frame.test.ts              # 4 pass
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
First tokenless kiosk API call auto-binds org #1's dogfood device (same row
`/api/kiosk/dev-autopair` issues for this client) and pins `cf_kiosk` on the response.
Production keeps the 401 `KIOSK_UNPAIRED` enrollment contract, so a revoked tablet stays dead
there. Injectable `devAutobind(clientId)`/`isProduction` deps; unit tests pin both postures.

### One dogfood device PER CLIENT (`cf_kiosk_client`, 2026-09-15)
`kiosk_devices` holds ONE `device_token_hash` per row, and issuing rotates it — so while every
dogfood surface shared the row labeled `Dogfood auto-bind`, each bind killed every other surface:
production stole localhost's device, localhost stole it back, and both painted `KIOSK_UNPAIRED`
in turn (reproduced with two cookie jars against `app.cycleforge.ai` + `:3077`).
The durable httpOnly `cf_kiosk_client` cookie now keys the label
(`dogfoodKioskDeviceLabel(clientId)` → `Dogfood auto-bind · <id>`), so a browser/tablet owns its
own row — which is what the table models. Client ids are shape-checked before they reach a label
(the 120-char `kiosk_devices_label_len` CHECK). `revokeStaleDogfoodKioskDevices` retires
auto-bind rows idle 14+ days (revoke, not delete — `kiosk_slot_events.kiosk_device_id` is NOT NULL
FK), so E2E contexts and incognito windows cannot grow the live credential set without bound.
Legacy shared row survives untouched; a surface still on it moves to its own row on its next
re-bind. Every device-authed client fetch now goes through `kioskFetchHealed` (path-aware: kiosk
URLs only), because production has no server-side re-bind.

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

### Phase 1 — `KioskPaneForm` extracted (landed)

`src/components/kiosk/KioskPaneForm.tsx` (130 lines) is now THE frame every center pane wears:
optional step band → scrolling body in one measure (or a full-height hero) → action floor. All
three panes mount it; none assembles a column, a scroll region or a footer any more.

**The double-band bug is now structurally impossible: the frame has no title face.**
`progress` present → the pane owns its header and it is `StepProgressHeader`. Absent → the SHELL
painted the header and the pane paints nothing. The per-pane `hideHeader` prop is gone from
`KioskBuybackPane` / `KioskPickupPane`, and `KioskRepairPane`'s dead titled-band branch went with
it (`onBack` is now REQUIRED — the optional form is what left that branch behind).

**The footer face follows the header, not a flag.** A step flow floats its key (repair); a
shell-titled pane carries the floor hairline (buyback / pickup). Derived from `progress` inside
the frame, so the two can never disagree per pane again — that drift is why the repair footer had
quietly lost its hairline.

Also landed:
- `src/components/repair/KioskReasonStep.tsx` — step 0 (header + Add CTA + entry + pills) is now
  self-contained, owning its own entry state and the `useKioskSkuReasons` hook. `KioskRepairPane`
  483 → **370 lines**; buyback 131 → 116; pickup 258 → 237.
- **The last three spine tokens are retired.** `KIOSK_MODE_SPINE_ROW` / `_ROW_IDLE` / `_ICON` are
  deleted with a dated ledger comment in `kiosk-chrome.ts`. Their only consumer — ProductSelector's
  hand-rolled trail back `<button>` — is now an `IconButton` in the trail icon family
  (`HEADER_ICON_BTN_CLASS` + `KIOSK_POS_TRAIL_ICON`, `data-testid="kiosk-catalog-back"`), the same
  vocabulary as the search toggle beside it. Phase 0's deletions are complete.
- `src/components/kiosk/kiosk-pane-frame.test.ts` — 4 law tests: every pane mounts the frame and
  hand-rolls no column/scroll; no pane may name `KIOSK_PANE_HEADER_BAND` / `_TITLE` / `hideHeader`;
  the frame has no title face and no footer flag; the spine tokens stay deleted. Structural rather
  than render-based on purpose — this repo has no React test renderer, and "which component owns
  the band" is the invariant.

Verified at runtime on the live lane, all three panes: pane paints 0 headings while the shell
shows exactly 1 title (buyback, pickup), exactly one `[data-kiosk-footer-band]` each, repair's
step band reads 0/3 → 1/3 as a reason is added, add-reason still works from the extracted step,
step 2 keeps its own bold header plus a Back key. `ds_critique`: frame clean, 0 arbitrary
literals anywhere. 28 kiosk unit tests pass. eslint 0 errors; Boundary at baseline (95/95).

Two harness notes for the next session, neither a product bug:
- The **PWA "Add to Home Screen" banner floats over the bottom-centred Continue key** and eats
  Playwright clicks. Dismiss it (`getByRole('button', { name: /^dismiss$/i })`) before driving the
  catalog, or a tile→Continue flow times out looking like a dead CTA.
- A kiosk spec must SELECT the command first (`kiosk-command-repair`); the session persists the
  last command across reloads, so a bare tile click can land on retail.

Unblocked on the way past (foreign, but it broke the whole dev build):
`src/components/fba/sidebar/index.ts` still re-exported `AdminFbaSidebarPanel`, which
`FbaSidebar.tsx` had deleted with the admin console — a Build Error overlay on every route,
including `/kiosk/v2`. The stale barrel entry is removed; there were no other consumers.

**Not green in the tree right now, and not kiosk:** `tsc` fails in
`src/components/mobile/daily/MobileDailyChecklist.tsx`, `src/features/daily-checks/DailyCheckItemInspector.tsx`
and `src/features/home/HomeDailyMode.tsx` — the concurrent daily-checks workstream (same files as
the staged `useDailyChecks → use-daily-checks` renames). No kiosk/repair file appears in the error
list.

### Phase 2 — one chip family + the cart is CARDS, not a table (landed)

Operator 2026-09-14: *"the cart icon brings up a full width popover component. This is a wrong
display. It should display a mobile-like chip display component with a rounded corner radius and
kind of pills and buttons where the current codebase is displaying that feel throughout the kiosk
v2."*

Two real faults behind that, both now fixed:

**1. The cart mounted the DESK COMPOUND TABLE.** `CompoundRow` + `CART_COMPOUND_COLUMNS` — the
7-track grid Unbox / Incoming / To-Ship / Tasks share, complete with a select gutter and a dots
menu — was painting a spreadsheet across the glass. `SURFACE_LAW` §5 already forbids it: *lists on
a phone-shaped surface are cards, never a DataTable*. Now `KioskCartLineCard`: a rounded touch card
(`MOBILE_SCAN_ROW_CORNER`, soft lift) with title + amount on the top line and the facts as chips.
The customer face (`KioskCustomerFace`) mounts the SAME card `readOnly`, so the two screens cannot
describe a line differently. Bulk line selection is deleted — nothing ever read `selectedLineIds`;
it existed because `CompoundRow` offers a gutter, not because the cart had a bulk verb.

**2. The panel face was `h-full w-full`.** `KIOSK_UTILITY_PANEL_FACE` is replaced by
`KIOSK_UTILITY_SHEET`: a bounded, rounded, floating sheet (`max-w-2xl` · `MOBILE_SCAN_CARD_CORNER`
· `elevationClass('overlay')`). Corner comes from the MOBILE token, not a kiosk invention — the
`/m` surface is the SoT for this feel. Cart, paperwork AND triage all inherit it, so all three
utility slots stopped being full-width slabs in one move.

**The sheet REPLACES the work surface; the stage around it is intentionally empty.** `KioskShell`
marks the work surface `hidden` + `aria-hidden` whenever a utility slot is open (the Phase 0
stage-swap ruling), so the margin beside the sheet is a full-attention checkout, not missing
layout. Do not "fix" it into an overlay drawer over a live catalog — that is a different product
decision, logged in §5 for the operator.

**The chip family:** `src/components/kiosk/KioskChip.tsx` is the TOUCH tier beside the pinned desk
`badge` (which is square/`rounded-none`/18px — right for a grid, wrong for a thumb). Two faces —
`row` (the full-width selectable pill) and `meta` (inline fact chip) — seven tones, and `onClick`
decides the element: a chip that does something is a `<button>` (annotated `ds-raw-button`, with
the reason), a chip that states a fact is a `<span>`. `ReasonSelector`'s pills ported onto it,
deleting the hand-composed `KIOSK_PILL` + tone + positioned-`Check` stack at that call site.
`cart-card-view.ts` holds the pure line derivations, and `cart-compound-view.ts` now imports them,
so the tablet card and any desk row state the same facts.

Nothing else in the kiosk hand-rolls a pill — `ConsultStanceControls` is already a combobox, and
the command menu is `IntakeCombobox`. The Phase 2 plan's "port the hand-rolled chip faces" list was
mostly already clean; the fork was `ReasonSelector` plus the cart's desk table.

`src/components/kiosk/kiosk-chip-family.test.ts` — 5 law tests: chip surfaces mount `KioskChip` and
never compose the tone tokens; no kiosk view carries `rounded-full`; the cart never mounts
`CompoundRow` or `role="table"`; the panels are the bounded sheet and `KIOSK_UTILITY_PANEL_FACE`
stays deleted.

Verified at runtime (iPad landscape, 1080×810): cart sheet **672px wide of 1080**, radius **16px**,
overlay shadow present, bottom edge 798/810 with the Pay key at 758–802 (reachable, not clipped);
line card radius **12px** with `Retail` + SKU + id chips; **zero** `[data-grid-row]` and zero
`role="table"` inside the cart; paperwork panel identical geometry. 33 kiosk unit tests pass, tsc
clean, eslint 0 errors, `ds_critique` 0 arbitrary literals in every touched file.

**Left alone deliberately:** `cart-compound-view.ts` / `cart-grid-layout.ts` are now unused by the
cart but NOT deleted — `slot-table-discover.ts` lists `engine:CART_COMPOUND_COLUMNS` as a KEEP id
("keep until kiosk is in PRODUCT_TABLES"), and KEEP ids are never deleted from this lane. Their
`cart-compound-view.test.ts` is currently red 6/8 from the concurrent slot-table amount-column
work — verified pre-existing by stashing this session's edit and re-running (identical 2/6). The
slot-table owner should decide whether that discover entry retires now.

---

## 3. NEXT TASK — Phase 3: kiosk motion

Exactly three motion roles, no more:

1. **Pane push** — the `motionRole.push.rail` grammar for a command swapping the centre stage.
2. **Chip press** — `TACTILE_PRESS_TRAVEL_CLASS` already exists; wire it into `KioskChip` (the row
   face especially) rather than a per-call-site scale.
3. **Selection wash** — 150ms colour on a chip becoming selected.

Query the motion MCP FIRST (`search-motion-docs`), per repo law. M1/PG12 stand: `scaleX` +
`transformOrigin:'left'` for fills, never width/height/position, always gated by
`useReducedMotion`. The new sheet is the obvious fourth candidate (a sheet that appears instantly
reads as a jump-cut) — decide with the operator before adding a role.

## 4. The remaining plan (agreed with the operator)

- **Phase 4 (last):** pour into the MCP server — pins per phase (prose only: `KioskPaneForm`,
  `KioskChip`, `KioskCartLineCard`, `KIOSK_UTILITY_SHEET`), a `kiosk-skin` tokens axis mirroring
  the `station-skin` precedent, and the law tests as the enforcement machine.

## 5. Known open items (reported, not fixed)

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
- **The PWA "Add to Home Screen" banner floats over the kiosk's bottom-centred action floor** and
  swallowed a Playwright click on Continue. That is a PRODUCT risk, not just harness noise: a real
  counter tablet in Chrome gets the same prompt over the same key. Either the kiosk shell should
  capture/stash `beforeinstallprompt` (it is a full-screen tablet app; the browser's own install
  nag has no place over the till), or the banner belongs ABOVE `KIOSK_PANE_FOOTER_BAND`.
  Operator's call — it changes what a customer can tap.
- **Sheet vs side drawer — an operator decision Phase 2 did NOT make.** The cart sheet is CENTRED
  on a stage that hides the work surface (`KioskShell`: `utilitySlot !== null && 'hidden'` +
  `aria-hidden`), which is why it needs no backdrop and cannot trap. The alternative shape is a
  right-anchored drawer with the catalog still live behind it — a clerk could keep browsing while
  the cart is open. That REVERSES the Phase 0 "a rail glyph swaps the centre" ruling rather than
  just narrowing it, so it was not taken unilaterally; the reversal that WAS taken (full-bleed →
  bounded) is date-stamped in `kiosk-chrome.ts`. Ask before changing the swap semantics.
  Note: `BottomSheet` is the wrong primitive either way — its modal backdrop is a phone
  drill-in contract, not a persistent POS surface.
- `AttractLoop.tsx` still carries a hand-rolled `rounded-full` scrim pill. Left alone on purpose:
  it is pre-interaction marketing chrome on the idle screen, not an operational chip, and the
  Phase 2 law test scopes itself to kiosk VIEW files rather than exempting it silently. Port it to
  `KioskChip face="meta"` if the attract screen ever grows a second one.
