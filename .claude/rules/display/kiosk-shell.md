# Kiosk Shell — landscape counter tablet

Deep dive on the **landscape front-desk kiosk** (region **contract**): the always-on attract loop, the left-rail product/category navigation, the persistent bottom mode dock, and the split-pane transaction intake (Repair, Buy/Sell, Pickup).

House identity: **Kinetic Ledger**. Inherits: `../ui-design-system.md` (tokens, density, presentation kinds, one-row anatomy, chips, HoverTooltip, icons).

> The discriminator (from `../contextual-display.md`): **The counter is a form, not a scanner station.** It inherits auth-step/welcome-stage grammar, but is elevated into a native-feeling landscape tablet app.

**Rollout:** Proven `/kiosk` (welcome tiles + full-screen forms) stays the default. The landscape shell lives at **`/kiosk/v2`** until E2E is green, then cut over.

---

## 1. When to choose Kiosk Shell

- **If the surface is customer-facing, runs on a tablet, and blends self-service with attended staff help.**
- **The anti-mix guard:** Do **not** apply Station contracts here. There is no focus-locked scan bar. Do not apply `StationWorkbench`. Do not use ambient wash copy intended for back-of-house.

---

## 2. Anatomy of the Shell

| Zone | Rule |
|---|---|
| **Attract / Idle** (Full bleed) | After 60s idle → 10s "Are you still there?" → attract. Org `attractMediaUrl` (URL paste MVP) or brand name/logo fallback. Tap-to-wake. |
| **Left Rail** (Catalog/Nav) | Persistent product/category navigation. Hosts `ProductSelector` with **mode-aware** `apiBasePath` (`/api/kiosk/repair` vs `/api/kiosk/sales`). Portrait: collapses to a top band (`max-h-[40vh]`). |
| **Main Detail Pane** (Right) | Active transaction context — issue/customer/sign for repair; cart/identity for sales. |
| **Bottom Dock** (Modes) | Floating `[ Repair ] [ Buy / Sell ] [ Pickup ]` from `KIOSK_SERVICES`. WIP modes are disabled, not fake-live. Hide only for true full-bleed focus (future signature takeover). |

---

## 3. The Idle Loop (Attract)

- **60s → 10s prompt → attract.** Ignoring the prompt discards the in-shell draft (shell remounts on wake).
- **Tenant media:** `organizations.settings.brand.attractMediaUrl` via device-authed `GET /api/kiosk/settings` (must stay on the kiosk host allowlist).
- **URL paste is the MVP** — Blob upload is a follow-on; any public HTTPS URL works.
- **Accessibility:** High-contrast "Tap to start". `prefers-reduced-motion` pauses video and disables pulse.

---

## 4. Split-Pane Transaction Flow

- Product lives exclusively in the left rail.
- Right pane stacks issue / customer / signature (repair) or cart / identity / conditional signature (sales).
- **Pricing:** Catalog projection supplies display price. No invented `130` default — empty price blocks submit.
- **Cart SoT:** `CounterDraft.retailLines` only (the deleted `salesCartStore` must not return).
- **Pay step-up:** `GET /api/kiosk/staff-for-stepup` + `StaffPinPad` — never card data on tablet.
- **Order Pickup:** two-key lookup (`orderNumber` + phone) via `/api/kiosk/pickup/*`; not staff LCPU `/pickup`.
- **Writes:** Repair → `/api/kiosk/repair/submit`. Sales → `/api/kiosk/intake` (`buildKioskSalesIntakeBody` + `Idempotency-Key`).

---

## 5. Mode Switching & The Dock

- Persistent dock; dirty-draft confirm before switch.
- Service list SoT: `src/lib/kiosk/services.ts` — shared with welcome tiles.

---

## 6. Always / Never

**Always**
- Compose `ProductSelector` with a mode-specific `apiBasePath`.
- Keep `/api/kiosk/settings`, `/api/kiosk/sales/*`, `/api/kiosk/staff-for-stepup`, and `/api/kiosk/pickup/*` on the kiosk host allowlist.
- Gate incomplete shell work on `/kiosk/v2` (or a flag) — never silent-swap main `/kiosk`.

**Never**
- Focus-locked scan bar / `StationWorkbench` / Unbox ambient wash.
- Full-bleed form swaps that destroy the dock (except intentional signature/payment focus).
- Hardcoded default prices.
- A second catalog picker fork.
- Dual-display pairing in v1 (Phase 2 after single-tablet shell is green).
