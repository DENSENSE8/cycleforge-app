# Handoff prompt — Kiosk v2 Square / Shopify PoS modernization

**Paste this as the first user message for the next agent.**  
Live law: root `AGENTS.md` + `node scripts/sot-lookup.mjs "<job>"`.  
Do **not** look for `.claude/legacy-rules-archive/` or deleted `*.guard.test.ts` proxies (governance burn).  
Kiosk shell anatomy notes that used to live in `kiosk-shell.md` are summarized below + in [`kiosk-landscape-shell-PLAN.md`](./kiosk-landscape-shell-PLAN.md).

---

## Task (one sentence)

Bring `/kiosk/v2` to a **customer-facing Square / Shopify Register–grade tablet PoS**: one surface plane, denser type on chrome, pill category/issue chips, sticky cart + transaction floor — then add a **PIN-gated History** face for reprinting repair paperwork (Square Transactions pattern). Do **not** silently cut over main `/kiosk`.

---

## Why (product)

Operators compare this tablet to Square Register + Shopify POS. Today the landscape shell still reads as a staff ledger (eyebrow labels, white-on-gray tile islands, inverse issue rows). Customer intake must feel like a short counter ritual; reprint/history is a **staff** job behind PIN, not on the open customer face.

Market anchors (2025–26):

| System | Pattern to steal | Pattern to avoid copying blindly |
|---|---|---|
| Shopify POS v10/v11 | Left vertical nav, cart always visible, side panels for interruptions | Phone-style bottom mode tabs as the only nav |
| Square Kiosk | Photo categories, cart in view, fast first paint | Shrinking body/input type below arm’s-length readability |
| Square Transactions | History → select → New Receipt / Print | Putting reprint on the public customer face without step-up |

---

## Already landed (do not re-do)

### A. Repair customer details (submit unblock)

| Change | Where |
|---|---|
| `CustomerInfoForm` gained `layout?: 'step' \| 'all'` | [`CustomerInfoForm.tsx`](../../src/components/repair/CustomerInfoForm.tsx) |
| Landscape repair uses `layout="all"` (name/phone/email/serial/price/notes) | [`KioskRepairPane.tsx`](../../src/app/kiosk/v2/KioskRepairPane.tsx) |
| Source test pins `layout="all"` and bans extras pin | [`KioskRepairPane.test.ts`](../../src/app/kiosk/v2/KioskRepairPane.test.ts) |

**Root cause that was fixed:** pane pinned `activeField` to `CONTACT_FIELDS[length-1]` (`extras`) so name/phone never rendered and submit stayed disabled.

### B. Catalog browse cleanup

| Change | Where |
|---|---|
| Removed **Categories** eyebrow from kiosk accordion | `ProductSelector` `renderCategoryAccordion` |
| Removed **Pick Your Repair - All Repairs** from kiosk left rail | accordion + stacked only when `!kioskSplit` |
| Root kiosk loads **all products on the right** via `fetchAllProducts` | `fetchCategoryLevel(null)` → `kioskSplit` branch |
| Loading grid dim `opacity-90` (≥90% light) | product grid |
| Sidebar header title always **Catalog** (not Categories) | [`KioskShell.tsx`](../../src/app/kiosk/KioskShell.tsx) |

### C. Paperwork icon (may already be present)

[`kiosk-paperwork-icon-HANDOFF.md`](./kiosk-paperwork-icon-HANDOFF.md) — `RepairPaperworkSheet` in repair detail header. Verify before re-implementing.

### D. Governance context

- `.claude/legacy-rules-archive/` **deleted** — law is `AGENTS.md` only.
- Non-keeper `*.guard.test.ts` purged; CI keepers only: sot-manifest · motion-boundary · frame-budget · region-hosts.
- After editing `AGENTS.md` or SoT hosts: `node scripts/build-sot-manifest.mjs`.

---

## Locked shell anatomy (cart-root shift 2026-08-12)

```
┌─ Command spine ─┬─ Contextual work ─────────┬─ Cart ledger (persistent) ─┐
│ Repair · Retail │ Catalog / repair details  │ Polymorphic line items     │
│ Buyback · Pickup│ buyback / pickup          │ Save · Pay · Customer      │
│ (never clears   │ ProductSelector hideCart  │ KioskCartLedger            │
│  the cart)      │ Tray                      │                            │
└─────────────────┴───────────────────────────┴────────────────────────────┘
```

| Zone | SoT / files |
|---|---|
| Commands | `KIOSK_SERVICES` · [`services.ts`](../../src/lib/kiosk/services.ts) · `KioskModeSpine` |
| Session cart | [`kiosk-session-store.ts`](../../src/lib/kiosk/kiosk-session-store.ts) · [`cart-line.ts`](../../src/lib/kiosk/cart-line.ts) |
| Chrome bands | [`kiosk-chrome.ts`](../../src/app/kiosk/kiosk-chrome.ts) — header / footer / `KIOSK_CART_FACE` |
| Catalog | `ProductSelector` `layout="kiosk-split"` · `hideCartTray` · flush [`kiosk-pos-surface`](../../src/app/kiosk/kiosk-pos-surface.ts) |
| Repair details | `KioskRepairPane` → saves REPAIR line to session (Pay via ledger → `/api/kiosk/intake`) |
| Buyback | `KioskBuybackPane` · negative BUYBACK line |
| Pickup | `KioskPickupPane` · `/api/kiosk/pickup/*` (command, does not clear cart) |
| Customer face | `KioskCustomerFace` · orientation 180 / Customer toggle |
| Wedge | `useWedgeScanner` + [`scan-classify.ts`](../../src/lib/kiosk/scan-classify.ts) |
| Attract / idle | [`v2/page.tsx`](../../src/app/kiosk/v2/page.tsx) · `AttractLoop` — **only when cart empty** |

**Hard constraints (do not violate without an explicit product decision):**

1. **Cart is the session root.** Commands never clear lines. No bottom mode dock (palm hazard). Action floor = Save / Pay / Customer only.
2. Products stay on the **browse stage**, never stacked under categories in the left rail. Cart lives on the **right** ledger.
3. Gate incomplete work on `/kiosk/v2` — never silent-swap main `/kiosk`.
4. Radius: Kinetic Ledger flush everywhere except `'pill'` issue chips.
5. No invented catalog prices.
6. Never start/kill the dev server — attach to `:3050`.
7. HID wedge on the kiosk form is allowed (attended register) — still **not** Station chrome.
---

## Detailed improvement plan (phased)

### Phase 1 — One PoS plane (customer face polish)

**Goal:** Screenshot no longer shows white tiles on gray + sunken search + meta eyebrows.

1. **Single surface token** across kiosk-split:
   - Catalog aside, browse stage, checkout bodies → `bg-surface-card` (same as header/footer bands).
   - Drop browse `bg-surface-canvas` and search `bg-surface-sunken` islands in kiosk-split only.
2. **Remove remaining meta labels** on kiosk-split:
   - Browse header **Products** → current category name or “All repairs” (E2E today asserts `/products/i` in [`kiosk-intake-flow.spec.ts`](../../tests/e2e/kiosk-intake-flow.spec.ts) — update assertions).
   - Product grid eyebrow **Products** / loading copy — remove or replace with quiet status.
3. **Type density (chrome vs fields):**
   - Shrink: eyebrows, SKU, category row labels, section micro labels (`text-role-caption` / `text-role-micro`).
   - Keep: product titles + form `TextField`s at tablet-readable size (≥ ~16px body) so iOS doesn’t zoom and customers can read at arm’s length.
   - Put shared kiosk type tokens on [`kiosk-chrome.ts`](../../src/app/kiosk/kiosk-chrome.ts) (`KIOSK_META`, `KIOSK_TILE_TITLE`, …) — no page-local hex.
4. **Square product tiles (kiosk-split):**
   - Gutter between tiles (not flush spreadsheet).
   - Photo well `bg-surface-sunken`; caption on **same** card plane (no white footer slab).
   - Selected = ring + `cornerClass('pill')` check — not full blue caption wash.
5. **Strip nested card islands** in [`KioskCounterPane.tsx`](../../src/app/kiosk/v2/KioskCounterPane.tsx) (`rounded-xl border bg-surface-card` wrappers) so sales checkout matches repair’s one plane.

**Done when:** one continuous card plane; no Categories/Products meta; denser chrome type; tiles feel Register-like; staff `layout="stacked"` unchanged.

### Phase 2 — Pills SoT (categories + issues)

**Goal:** Highlight selectable choices like Square chips, not inverse ledger rows.

1. Add to [`kiosk-chrome.ts`](../../src/app/kiosk/kiosk-chrome.ts):
   - `KIOSK_PILL` / `KIOSK_PILL_ACTIVE` / `KIOSK_PILL_IDLE` using `cornerClass('pill')` + semantic surfaces.
2. **Category accordion (kiosk-split):** pill stack with inset gap; selected = inverse or accent wash + check; “All” is implicit via root + right-stage products (no left-rail All row — already removed).
3. Grow [`ReasonSelector`](../../src/components/repair/ReasonSelector.tsx) with `appearance="pills"` for kiosk; keep staff `default` / existing `flush`.
4. Wire `KioskRepairPane` to `appearance="pills"`.

**Done when:** categories + repair issues share one pill SoT; selected issues visually pop (warning/accent tokens).

### Phase 3 — Checkout ritual (customer)

**Goal:** Short, obvious path: pick → cart → details → sign → done.

1. Keep sticky left cart + **Continue** / **Submit** on `KIOSK_PANE_FOOTER_BAND`.
2. Repair stack order: Issue pills → `CustomerInfoForm layout="all"` → Signature → Submit.
3. Success: keep paperwork canvas + **Done / Next Customer**; ensure print path is obvious.
4. Sales: phone/name/email + Pay at register (PIN) / Save — same plane, no nested cards.
5. Optional: post-submit “Print again” on the success screen (current ticket only) — not full history.

**Done when:** a new customer can complete repair drop-off without staff explaining missing fields; submit enables when gates are met.

### Phase 4 — History + reprint (staff face on device)

**Goal:** Square Transactions on the tablet — reprint repair paperwork after the fact.

1. New mode or spine destination: **History** (label TBD) — **PIN-gated** via existing step-up (`KioskPaymentStepUpSheet` / `/api/kiosk/staff-for-stepup`).
2. List today’s device/org kiosk submissions: ticket #, customer name, phone last-4, SKU/model, time, mode (repair/sales).
3. Row → preview `RepairServiceForm` / receipt props (reuse `buildRepairIntakeReceiptProps` + stored payload or rehydrate from ticket/repair row).
4. Actions: **Reprint paperwork**, optional resend digital.
5. Search: phone / ticket / last-4.
6. API: prefer extending existing kiosk-authed routes; `orgId` from device ctx; never body. Audit reprint events.
7. Do **not** expose History on the attract/open customer face without PIN.

**Done when:** staff can reprint today’s repair agreement from the tablet without leaving kiosk MDM URL.

### Phase 5 — Hardening + cutover readiness

1. E2E [`kiosk-intake-flow.spec.ts`](../../tests/e2e/kiosk-intake-flow.spec.ts):
   - Update headings (Catalog / category title — not Products/Categories).
   - Add repair fill: name + phone + serial + sign + submit on `/kiosk/v2` (closes the gap that let the extras-pin bug ship).
   - Optional: History PIN → reprint smoke.
2. Source tests (regular `*.test.ts`, **not** new `*.guard.test.ts` unless growing a keeper):
   - kiosk-split does not render Categories eyebrow / Pick Your Repair.
   - `KioskRepairPane` stays on `layout="all"`.
3. Attract multi-slide (table `kiosk_attract_slides` already applied, still inert) — only if in scope.
4. Cutover checklist remains in [`kiosk-landscape-shell-PLAN.md`](./kiosk-landscape-shell-PLAN.md) §4 — separate decision after E2E green.

---

## Compose — do not invent

| Need | Use |
|---|---|
| Mode list | `KIOSK_SERVICES` |
| Pane chrome | `kiosk-chrome.ts` bands + new pill tokens |
| Catalog | `ProductSelector` `kiosk-split` / `flush` |
| Customer fields | `CustomerInfoForm` `layout="all"` |
| Issues | grow `ReasonSelector` |
| Signature | `SignaturePad` |
| Paperwork | `RepairPaperworkSheet` / `RepairPaperworkCanvas` / `RepairServiceForm` |
| Sales payload | `buildKioskSalesIntakeBody` |
| PIN | `KioskPaymentStepUpSheet` |
| Frames / tokens | `@/design-system/tokens` · `cornerClass('pill')` |
| Job lookup | `node scripts/sot-lookup.mjs "…"` |

---

## Suggested agent prompt (copy-paste)

```text
Implement Phase 1 of docs/todo/kiosk-pos-modernization-HANDOFF.md on /kiosk/v2:
one surface plane, remove Products meta, denser chrome type, Square-style tiles,
strip sales nested cards. Keep staff ProductSelector stacked unchanged.
Do not add bottom mode dock. Do not cut over /kiosk. Run npm run verify before done.
Regenerate sot-manifest if you touch AGENTS.md. No new *.guard.test.ts files.
```

Then for Phase 2:

```text
Continue docs/todo/kiosk-pos-modernization-HANDOFF.md Phase 2:
KIOSK_PILL* on kiosk-chrome.ts; category pills; ReasonSelector appearance="pills"
on KioskRepairPane. npm run verify.
```

Then Phase 4 (History) only after Phases 1–3 feel right on the tablet.

---

## Out of scope (unless user expands)

- Capacitor / native wrapper  
- Dual-display pairing  
- Card data on tablet  
- Silent `/kiosk` cutover  
- Recreating deleted legacy rule archives or non-keeper guard proxies  
- Staff existing-customer lookup on kiosk (stays `!kioskMode` on `RepairIntakeForm`)

---

## Done when (whole initiative)

- [ ] Customer face: one DS plane, pill categories/issues, denser chrome, readable fields  
- [ ] Repair/sales/pickup flows complete without missing-field traps  
- [ ] History + reprint behind staff PIN  
- [ ] E2E covers v2 repair fill + submit  
- [ ] `npm run verify` green  
- [ ] Main `/kiosk` still proven welcome tiles until explicit cutover  

## Verify

```bash
npm run verify
# mid-loop:
npm run verify -- --fast
npx tsx --test src/app/kiosk/v2/KioskRepairPane.test.ts
```

## Related docs

- [`kiosk-landscape-shell-PLAN.md`](./kiosk-landscape-shell-PLAN.md)  
- [`kiosk-paperwork-icon-HANDOFF.md`](./kiosk-paperwork-icon-HANDOFF.md)  
- [`kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md)  
- [`docs/security/kiosk-device-lockdown.md`](../security/kiosk-device-lockdown.md)  
