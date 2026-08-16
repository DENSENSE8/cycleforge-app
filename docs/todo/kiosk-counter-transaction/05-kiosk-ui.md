# Phase 05 — kiosk UI: the unified intake form

**Lane:** `kiosk-catalog` (reuse) · `topic/kiosk-catalog` · port 3150
**Wave:** C — **do not dispatch until Phase 04 is merged.** *(Exception in §0.)*
**Depends on:** 04 (the route), 02 (local prices), 01 (**hard gate on the `sales: 'live'` flip**)
**Parent:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) §4 + §5 Phase 5 · [`00-INDEX.md`](./00-INDEX.md)

---

## 0. Early-start exception

The **form IA and cart composition** can begin as soon as Phase 03 exports `CounterTransactionInput` / `CounterTransactionResult` (03 §5 lands them in its first commit). Build against those types with the submit handler stubbed. Only the wiring and the `sales: 'live'` flip need 04 merged.

If those types are not yet exported, wait.

## Goal

One 4-step counter form that produces a sale, a repair, or both — replacing the repair-only kiosk flow.

## Form IA

| Step | Content | Notes |
|---|---|---|
| 1 · Identity | Phone → create-or-match. Optional "Have an order number?" | Deterministic only. **No customer list, no search.** |
| 2 · Cart | Repair service + retail items, one catalog | Composes `ProductSelector` + `salesCartStore` |
| 3 · Review & sign | Receipt preview; **signature ONLY if a service line is present** | A retail-only sale must not demand a repair agreement |
| 4 · Payment hand-off | Stage → Terminal, or PIN step-up | Never charges in-app |

## The two composition rules

**Compose `salesCartStore`, do not fork a cart.** `src/components/walk-in/salesCartStore.ts` is a working module-scoped singleton (`useSyncExternalStore`) whose lines already carry either a Square `catalog_object_id` or an ad-hoc manual line — exactly the two shapes this form needs. A second cart implementation is the fork `.claude/rules/pattern-evolution.md` bans.

**Compose `ProductSelector`, do not fork a picker.** `src/components/repair/ProductSelector.tsx` is already parameterized by `apiBasePath` for precisely this reason, plus `hideManualEntry` and `flowInPage` for kiosk density. Grow it if it needs a retail mode; do not copy it.

## This is a FORM, not a Station

`.claude/rules/contextual-display.md` Q1: scanner input ⇒ Station. **Portrait `/kiosk` welcome remains a form without a scan bar.**

**Override (2026-08-12 — attended register on `/kiosk/v2`):** landscape v2 **does** mount `useWedgeScanner` + `classifyKioskScan` so UPC/IMEI/RS# drive the **session cart**. It still must **not** compose `StationWorkbench`, focus-lock loops, or Station chrome. Wedge classification is kiosk-local (do not reuse warehouse `scan-resolver` — 12-digit FedEx vs UPC collide).

Step motion on portrait counter forms still follows `.claude/rules/display/auth-step-panel.md`.

Reuse the existing kiosk chrome: `cornerClass`, `focusRing`, semantic tokens. No page-local hex, no raw `z-[N]`.

## Scope

### 1. The form

Extend `RepairIntakeForm` to the 4-step model **or** extract a shared step shell — decide from the code and say which you chose and why. `kioskMode` already hides tech assignment, customer search, the ticket link, and print; preserve every one of those suppressions.

Signature renders only when a service line exists (`SignaturePad`, `variant="dropoff"`).

### 2. Permission

**No kiosk-scoped sales permission exists.** The registry has only `walk_in.{view,intake,enroll_kiosk}` (`src/lib/auth/permission-registry.ts`). Add one, plus the matching row in `src/lib/auth/route-permission-manifest.test.ts` — the `permission-registry-guard` agent enforces this pairing and `npm run verify` runs the drift check.

### 3. Payment hand-off

Stage the order, then either route to a physical Square Terminal or gate on a staff PIN step-up (`resolveKioskStepUp` already exists). **Never** collect card data in-app.

### 4. Flip the tile — LAST, and only if Phase 01 is merged

`src/app/kiosk/page.tsx` `SERVICES`: `sales: 'wip'` → `'live'`. The array was built for this: *"bringing one online is a one-line `status: 'live'` flip that reuses this exact tile grammar."*

**Check that Phase 01 is merged before flipping.** `square_transactions` without its tenancy contract is a cross-tenant leak. If 01 is not merged: land everything else, leave the tile `'wip'`, and report it.

### 5. Repoint, then delete

Point the kiosk at `/api/kiosk/intake`. Once green, delete `src/app/api/kiosk/repair/submit/route.ts` — **the last commit of this phase** (step 3 of the three-step retirement in 04 §6). Never before the new path is proven.

## Copy rule

Customer-facing copy uses capability nouns or the runtime provider label — "Take payment", "Look up your order" — **never** "Pay with Square" / "Search Ecwid". SoT: `src/lib/integrations/capability-labels.ts`.

## Do NOT

- Fork the cart or the product picker.
- Add a scan bar or Station chrome.
- Show a searchable customer list.
- Collect card data.
- Flip `sales: 'live'` before Phase 01 merges.
- Delete `/api/kiosk/repair/submit` before the new path is verified green.

## Acceptance

- [ ] 4 steps per the table; signature only on a service line
- [ ] `salesCartStore` and `ProductSelector` composed, not forked
- [ ] Repair-only, retail-only, and combined all submit correctly
- [ ] Identity is deterministic; no customer list
- [ ] Kiosk sales permission added + manifest test row
- [ ] Payment stages only
- [ ] Copy carries no vendor nouns
- [ ] Tile flipped **only if** 01 merged; otherwise reported
- [ ] Old route deleted last, after green
- [ ] `npm run verify` green

## Verify

```bash
npm run verify
```

Then verify in the **browser**, not by assertion: `pnpm dev` in this lane (port 3150 — never a raw shell server), walk all three transaction shapes, screenshot each. A hidden preview pane freezes framer-motion at `initial` — screenshot before calling any motion bug. E2E asserts against the **QA org** (`qa-desktop`), never the dogfood tenant.
