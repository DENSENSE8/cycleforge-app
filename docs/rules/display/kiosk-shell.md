# Kiosk Shell — landscape counter tablet

Deep dive on the **landscape front-desk kiosk** (region **contract**): the always-on attract loop, the far-left **mode spine**, the catalog product/category rail, and the split-pane transaction intake (Repair, Buy/Sell, Pickup).

House identity: **Kinetic Ledger**. Inherits: `../ui-design-system.md` (tokens, density, presentation kinds, one-row anatomy, chips, HoverTooltip, icons).

> The discriminator (from `../contextual-display.md`): **The counter is a form, not a scanner station.** It inherits auth-step/welcome-stage grammar, but is elevated into a native-feeling landscape tablet app.

**Rollout:** Proven `/kiosk` (welcome tiles + full-screen forms) stays the default. The landscape shell lives at **`/kiosk/v2`** until E2E is green, then cut over.

---

## 1. When to choose Kiosk Shell

- **If the surface is customer-facing, runs on a tablet, and blends self-service with attended staff help.**
- **The anti-mix guard:** Do **not** apply Station contracts here. There is no focus-locked scan bar. Do not apply `StationWorkbench`. Do not use ambient wash copy intended for back-of-house. Do **not** mount staff `MasterNav` / `APP_SIDEBAR_NAV` — chromeless page owns the shell.

---

## 2. Anatomy of the Shell

| Zone | Rule |
|---|---|
| **Attract / Idle** (Full bleed) | After 60s idle → 10s "Are you still there?" → attract. Org `attractMediaUrl` (URL paste MVP) or brand name/logo fallback. Tap-to-wake. |
| **Mode spine** (Far left) | `KioskModeSpine` — always-visible icon column for Repair · Buy/Sell · Pickup from `KIOSK_SERVICES`; expand shows labels (push, snap, no motion tween — MasterNav geometry, kiosk-only host). **Destinations only** — no spine header / no open-close control inside the column. WIP modes disabled, not fake-live. Portrait: keep on the **left** — never relocate module nav to the bottom. |
| **Catalog rail** (Next left) | Persistent product/category navigation **after** the mode spine. Hosts `ProductSelector` with **mode-aware** `apiBasePath` (`/api/kiosk/repair` vs `/api/kiosk/sales`). Hidden for Pickup. Portrait: may collapse to a top band (`max-h-[40vh]`). **Spine open/close** lives here as the leading control on `KIOSK_PANE_HEADER_BAND` (`KioskSpineToggle` — same placement grammar as staff `SidebarCollapseControl` in GlobalHeader). Pickup (no Catalog) puts the toggle on the detail header band instead. |
| **Main Detail Pane** (Right) | Active transaction context — issue/customer/sign for repair; cart/identity for sales; lookup for pickup. |

**Never a bottom mode dock.** Bottom pills / floating `rounded-full` tab bars / in-flow bottom mode segments are banned on the customer tablet — the bottom bezel is a palm/wrist/personal-item hazard zone on a mounted iPad (index-finger reach, standing/leaning). Module selection lives only in the mode spine.

## 2a. The counter scale — radius, touch, rhythm

**Ratified 2026-08-20.** The counter face is the ONE surface exempt from the zero-radius ops
law (`kinetic-ledger.md`). It is customer-facing, single-use, untrained, on a mounted tablet —
the discriminator above ("a form, not a scanner station") in pixels rather than prose. Scope is
the **whole `/kiosk/**` shell**, rails included: a half-industrial surface reads as a bug, not
as a hierarchy.

**Resolve through `counterCorner()` / `COUNTER_*` (`src/app/kiosk/kiosk-counter-surface.ts`),
never `cornerClass()`.** `cornerClass` renders `rounded-none` for every non-`pill` role
app-wide; remapping a role there would silently re-round every ops surface in the product.
The counter module is a *sibling scale over the same role vocabulary* — same colors, same type
roles, same motion. Nothing else changes.

| Role | Ops `cornerClass` | Counter `counterCorner` | On the kiosk |
|---|---|---|---|
| `chip` | `rounded-none` | `rounded-lg` (8) | issue pills, badges, count badges |
| `row` | `rounded-none` | `rounded-lg` (8) | list rows, cart lines |
| `control` | `rounded-none` | `rounded-xl` (12) | selects, toggles, spine + rail cells |
| `field` | `rounded-none` | `rounded-xl` (12) | every text input |
| `card` | `rounded-none` | `rounded-2xl` (16) | form sections, product tiles |
| `canvas` | `rounded-none` | `rounded-3xl` (24) | panel / stage shells |
| `cta` | *(n/a)* | `rounded-2xl` (16) | Save · Pay · Look up |
| `pill` | `rounded-full` | `rounded-full` | dots, avatars, switch tracks |
| `flush` | `rounded-none` | `rounded-none` | column seams — see below |

**`flush` stays flush on purpose.** The seams where shell columns meet (command spine ↔ stage ↔
utility rail) are structure, not components. Rounding those would float the columns and
re-introduce the banned **floating column islands**. Softness lives in the content, not in the
frame.

**Touch + rhythm** (same module):

- `COUNTER_TOUCH.control` ≥ 48px, `COUNTER_TOUCH.cta` ≥ 56px — thumb targets, not mouse targets.
- `COUNTER_TEXT.field` is ≥ 16px. Below 16px iOS Safari zooms the page on focus and the customer
  has to pinch back — the single most "not-native" thing a web form can do.
- `COUNTER_RHYTHM` — `section` gap between blocks, `field` gap inside one, `panel` padding.
  Sections are separated by **gap**, never by a hairline on a full-bleed band (that is the ops
  density grammar).

Concentric nesting still uses `nestedCorner(outer, padStep)` — **inner = outer − padding**.
Under the flushed ops ladder that math was a no-op; on the counter it is load-bearing again.

Adoption is staged (`docs/todo/kiosk-customer-form-face-PLAN.md`): P1 is the token layer only.
An existing `rounded-none` on a kiosk surface is not yet a bug — it is un-migrated.

---

## 3. The Idle Loop (Attract)

- **60s → 10s prompt → attract.** Ignoring the prompt discards the in-shell draft (shell remounts on wake).
- **Tenant media:** `organizations.settings.brand.attractMediaUrl` via device-authed `GET /api/kiosk/settings` (must stay on the kiosk host allowlist).
- **URL paste is the MVP** — Blob upload is a follow-on; any public HTTPS URL works.
- **Accessibility:** High-contrast "Tap to start". `prefers-reduced-motion` pauses video and disables pulse.

---

## 4. Split-Pane Transaction Flow

- Product lives exclusively in the catalog rail (not the mode spine).
- Right pane stacks issue / customer / signature (repair) or cart / identity / conditional signature (sales).
- **Pricing:** Catalog projection supplies display price. No invented `130` default — empty price blocks submit.
- **Cart SoT:** `CounterDraft.retailLines` only (the deleted `salesCartStore` must not return).
- **Pay step-up:** `GET /api/kiosk/staff-for-stepup` + `StaffPinPad` — never card data on tablet.
- **Order Pickup:** two-key lookup (`orderNumber` + phone) via `/api/kiosk/pickup/*`; not staff LCPU `/pickup`.
- **Writes:** Repair → `/api/kiosk/repair/submit`. Sales → `/api/kiosk/intake` (`buildKioskSalesIntakeBody` + `Idempotency-Key`).

---

## 5. Mode Switching & The Spine

- Mode spine always mounted in the ready shell; dirty-draft confirm before switch.
- Icon tap switches mode when collapsed; expanded shows labels (+ optional blurb).
- Open/close control = `KioskSpineToggle` in the Catalog pane header (Pickup detail header when Catalog is hidden) — never a second header inside the spine.
- Service list SoT: `src/lib/kiosk/services.ts` — shared with welcome tiles.

---

## 6. Always / Never

**Always**
- Compose `ProductSelector` with a mode-specific `apiBasePath`.
- Keep `/api/kiosk/settings`, `/api/kiosk/sales/*`, `/api/kiosk/staff-for-stepup`, and `/api/kiosk/pickup/*` on the kiosk host allowlist.
- Gate incomplete shell work on `/kiosk/v2` (or a flag) — never silent-swap main `/kiosk`.
- Own module nav in `KioskModeSpine` (push sibling left of Catalog).

**Never**
- Focus-locked scan bar / `StationWorkbench` / Unbox ambient wash.
- Bottom pills, floating mode docks, or any bottom tab bar for kiosk services (including portrait).
- Staff `MasterNav` / `DashboardSidebar` on the kiosk host.
- Hardcoded default prices.
- A second catalog picker fork.
- Dual-display pairing in v1 (Phase 2 after single-tablet shell is green).
