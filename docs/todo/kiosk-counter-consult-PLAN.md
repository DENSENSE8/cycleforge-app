# Front-desk consult — staff-guided iPad (not a kiosk)

**Status:** plan locked for `prod` lane · **Created:** 2026-09-10  
**Surfaces:** `/kiosk/v2` (iPad) · `/counter` (desk) · shared `counter_sessions` cart  
**Compared against:** main work tree `/home/michaelgarisek/Projects/cycleforge-app` @ `7a9a83db3` (plus its uncommitted DS token diffs — **do not port those**)

This is the plan of record for: staff standing with an older customer, showing options on an iPad, verifying the already-selected cart, paying at the Terminal — **no idle timeout, no attract reel, no self-serve kiosk.**

---

## 0. Locked product decisions

| # | Decision | Why |
|---|---|---|
| **C1** | The iPad is a **consult document**, not a self-checkout. Staff drives. The customer watches, confirms names, signs, pays. | Customers cannot operate a catalog kiosk. |
| **C2** | One session, **three consult stances** that must share one cart: **Work** · **Show** · **Verify**. Stance never clears lines, identity, or command. | Modes working *together* is the acceptance bar. |
| **C3** | **No idle prompt. No attract.** An empty cart during conversation is still a visit. Closed-shop lock is an explicit staff action later, not a timer. | Attract is McDonald’s DNA. `idle.ts` already admits “disable attract” is a feature, not a huge timeout. |
| **C4** | Canonical names live on the line (`title` + paperwork identifier: serial / IMEI / SKU). Show and Verify render those — no second label field. | Staff must be able to correct what the customer just read. |
| **C5** | Money stays staff-only (price, void, submit, Terminal). Customer stance never edits price. | Existing D5 / PIN step-up. |
| **C6** | Dual-device is optional: **same iPad** (staff + customer take turns) **or** desk `/counter` + claimed iPad. Same stances, same cart. | Main already built the missing bind CTA; prod did not. |
| **C7** | Do **not** add Exchange, a second cart, Station chrome, standing keycaps, or a cheat sheet from `?`. | Out of scope; Exchange on main is a different job. |

### The three stances (must stay in lockstep)

| Stance | Who looks | What they see | Who writes |
|---|---|---|---|
| **Work** | Staff | Command spine, catalog, line editors, Triage, Paperwork, Cart ledger | Staff (and customer identity/signature when handed the tablet) |
| **Show** | Customer + staff | Large canonical name of the **current proposal** (selected catalog product or focused line): title, type, identifier, price | Staff selected it in Work; Show is display |
| **Verify** | Customer | Full selected cart, identifiers, totals, repair signature, Terminal wait | Signature + confirm only |

Triage stays staff-only. The customer never sees “blocking submit.”

---

## 1. Port audit — main vs this `prod` tree

**Headline:** main does **not** already implement Work/Show/Verify or idle-off. `KioskCustomerFace`, `idle.ts`, and `KioskV2Runtime` attract/prompt are the same idea on both trees. What main *does* have, and prod lacks, is the **desk → this iPad** bind so the customer screen is the same cart.

### Port (Phase 0) — this *is* the consult plumbing

Copy from **committed** main (`cycleforge-app`), not from main’s uncommitted amber→token edits.

| Piece | Main path | Why it matches this use case |
|---|---|---|
| Device picker copy | `src/lib/counter/counter-devices.ts` | “Which iPad is in front of me, and is it free?” — `walk_in.intake`, not enroll |
| Fleet read | `src/app/api/counter/devices/route.ts` | Desk-only list |
| Bind verb | `bindSessionDevice` in `session-store.ts` + `POST …/session/{id}/device` | Puts the open visit on the tablet; `null` hands it back. `DEVICE_BUSY` if another open visit holds it |
| Event | `session.device_bound` in `session-events.ts` (+ test row) | Far screen converges |
| Client | `useCounterSession.bindDevice` | Desk mutation |
| Header CTA | `CounterDeviceAction.tsx` + `CounterWorkspace` mount | Starts a visit **on that tablet** so the customer screen is live before the first line |
| Tenancy exemption | `scripts/tenancy-guard-exemptions.ts` row for `/api/counter/devices::staff` | Verify stays green |

Bring tests with the port: add `counter-devices` unit tests (main has the module, **no** `*.test.ts` for `bindSessionDevice` / `listCounterDevices` — write them here as part of the port). Cover: free+online first, omit enrolled/revoked, `DEVICE_BUSY`, unbind → tablet falls back to local cart, version 409.

### Do not port

| Piece | Why |
|---|---|
| `KioskExchangePane` + `exchange` command | Different job (two-key online order). Extra command fights “triage + implementation.” Revisit later. |
| `kiosk-cart-table-definition.ts` | Slot-table cart binding, not consult UX. |
| Uncommitted main diffs (`shadow-elev-*`, `text-text-warning`, SpineToggle comment) | Token polish, not consult logic. |
| Attract / idle / `KioskCustomerFace` from main | **Same behavior as prod** — still “Are you still there?”. Porting would not implement C3. |
| `kiosk-customer-form-face-PLAN.md` P2–P4 | Soft radius/touch is Phase 6 here; `kiosk-counter-surface.ts` **already exists on prod unused**. |

### Already on prod (compose, do not rebuild)

- Session cart: `kioskSessionStore` + `useKioskSharedSession` mirror
- Staff Work: `KioskShell` + Repair/Retail/Buyback/Pickup panes + `ProductSelector`
- Staff Triage: `visit-triage.ts` + `KioskTriagePanel` (utility spine)
- Exact names on paperwork: `lineIdentification` in `KioskPaperworkPanel`
- Verify skeleton: `KioskCustomerFace` (titles + type + price + sign + Terminal wait) — **too thin**, orientation/Esc only, copy still says “hand the tablet back”
- Counter tokens: `counterCorner` / `COUNTER_TOUCH` in `kiosk-counter-surface.ts` (nothing consumes them yet)
- Payment: stage + Terminal / PIN step-up (`KioskPaymentStepUpSheet`)

---

## 2. Phases (each must leave prior stances green)

Rule: **do not start phase N+1 until phase N’s checklist is ticked in the browser and tests.** Cross-mode invariants (§3) are re-run at the end of every phase.

### Phase 0 — Port bind from main (desk + iPad are one visit)

**Goal:** Choosing the iPad at `/counter` paints this visit on `/kiosk/v2` before any line exists.

**Files (port + tests):** list in §1 Port table.

**You check:**

- [ ] `/counter` header has one tablet CTA in every state, including “no visit yet”
- [ ] Start visit **on a named iPad** → iPad `GET /api/kiosk/session` returns that session (not a local empty cart)
- [ ] Add a line on the desk → iPad cart shows the **same title** within one poll/frame
- [ ] Bind a tablet already on another open visit → `DEVICE_BUSY`, spoken copy (“On another visit”), no silent steal
- [ ] Unbind → iPad local cart; desk visit stays; next customer does not see the last basket (existing detach rule)
- [ ] `npx tsx --test` on new/updated counter-device + session-store tests green
- [ ] `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast` green

**Does not yet:** hide attract, add Show/Verify buttons.

---

### Phase 1 — Kill kiosk timeout (C3)

**Goal:** The consult surface never asks “are you still there?” and never falls to `AttractLoop` on idle.

**Files:** `src/lib/kiosk/idle.ts` (explicit off, not a 3600s clamp), `KioskV2Runtime.tsx`, Settings copy that still describes “after idle” (`KioskAttractMediaCard` — stop advertising a screensaver as default counter behavior). Attract media upload may remain for a **future explicit lock screen**; it must not auto-play.

**You check:**

- [ ] Pair the iPad, leave it on Work with **empty cart**, wait > 70s: **no** prompt overlay, **no** attract
- [ ] Same with a full cart
- [ ] Same on customer Verify face
- [ ] Settings cannot re-enable idle by typing a number (or the only setting is an explicit “attract: off \| staff-lock-only” flag — number timeout is gone)
- [ ] Existing `idle.test.ts` rewritten for off-by-default; no floor of 15s
- [ ] Verify `--fast` green

**Cross-mode:** Work still opens; Phase 0 bind still converges.

---

### Phase 2 — Stance in the session (modes wired, same cart)

**Goal:** One field on the session snapshot, e.g. `consultStance: 'work' | 'show' | 'verify'`, stored locally and mirrored when bound (`session.face_changed` already exists — extend it or add `session.stance_changed`; do not fork a second face enum that disagrees with `staff`/`customer`).

Recommended mapping (keep `face` for projection, add stance for Show vs Verify):

- Work → `face: staff`
- Show / Verify → `face: customer` + `consultStance`

**Staff chrome:** explicit **Show** and **Verify** (not 180° rotation as the only path). Orientation may still *enter* Verify; it must not be the only way. Esc or a staff control returns to Work without clearing the cart.

**You check:**

- [ ] Work → Show → Work: same lines, same phone, same `activeCommand`
- [ ] Work → Verify → Work: same
- [ ] Show → Verify → Show: same cart; Show still focused on the same proposal if one was set
- [ ] Command switch (Repair ↔ Retail) in Work does **not** reset stance to attract and does **not** clear lines (existing shell rule)
- [ ] Bound dual-device: stance change on desk **or** tablet converges on the other
- [ ] Unit: store tests for stance transitions; no line mutation on stance-only writes
- [ ] `data-testid` on shell: `kiosk-consult-stance={work\|show\|verify}` for E2E

**Does not yet:** rich Show canvas (may reuse current customer face as a stub).

---

### Phase 3 — Show (options + exact names)

**Goal:** Staff picks a catalog row or cart line in Work; Show paints that proposal huge: **exact title**, type (Repair/Retail/… ), identifier (`lineIdentification`), price. Customer does not browse the catalog.

**Files:** new `KioskShowFace` (or stance branch inside a renamed customer host), `KioskShell` selection → `presentedLineId` / `presentedCatalogRef` on the session. Dual-device: presentation is a session field so the iPad shows what the desk highlighted.

**You check:**

- [ ] Work: select a repair SKU → Show: customer sees that SKU’s **catalog title**, not an internal id
- [ ] Work: focus a cart line → Show: same `title` as ledger + serial/IMEI/SKU from paperwork helper
- [ ] Staff edits the title/price in Work (price = step-up) → Show updates; Verify list matches
- [ ] Empty presentation: Show says the consult is in progress, **not** “No items yet” as a failed kiosk
- [ ] Show has no spine, no triage, no void, no catalog search
- [ ] Type ≥ 16px / touch ≥ 48px (`COUNTER_TOUCH` / `counterCorner`) on Show
- [ ] Graph: impact `KioskCustomerFace` / `kioskSessionStore` before shipping; no second cart store

---

### Phase 4 — Verify (pay-ready cart)

**Goal:** Grow today’s `KioskCustomerFace` into Verify: every selected line with canonical name + identifier + line total; visit total; signature only if a repair line needs it; Terminal wait. Copy is consult (“We’ll take payment at the terminal”), not “hand the tablet back.”

**You check:**

- [ ] Lines added only in Work appear on Verify without the customer adding anything
- [ ] Voided lines: desk still sees them; Verify does **not** (existing projection)
- [ ] Mixed cart (repair + retail): both named; signature only for unsigned repair
- [ ] Staff can return to Work, fix a name, flip Verify — customer sees the new name
- [ ] Esc / staff control → Work; cart intact
- [ ] Payment: PIN/Terminal still staff; card data never on the iPad
- [ ] E2E: `tests/e2e/kiosk-intake-flow.spec.ts` — update any “still there” / attract assumptions; add stance path

---

### Phase 5 — Dual-device + commands working together

**Goal:** Same three stances when staff is on `/counter` and the customer holds the iPad.

**You check:**

- [ ] Phase 0 bind + Phase 2 stance: desk **Show** / **Verify** controls drive the iPad
- [ ] Desk types a line → Show (if presenting that line) and Verify both update
- [ ] Tablet cannot price/void/submit (existing kiosk door); can sign / set identity
- [ ] `tests/e2e/counter-session-two-device.spec.ts` (qa-desktop): add stance rows; keep the seven existing bind/security rows green
- [ ] Channel down: 3s poll still converges (D7); no idle overlay while degraded

---

### Phase 6 — Readability (optional, after 1–5)

**Goal:** Consume existing `kiosk-counter-surface.ts` on Show + Verify (and Work fields the customer might type: phone). Follow `kiosk-customer-form-face-PLAN.md` P2 only for those faces — do not re-round ops `/counter`.

**You check:**

- [ ] No `input type=date`; no guessed radii (design-mcp `ds_contract` / `ds_tokens` / `ds_critique` before UI writes)
- [ ] iPad landscape + portrait: Show/Verify still readable at arm’s length
- [ ] `pnpm run eval:cohort slot-table` **not** required unless cart is forced onto `PRODUCT_TABLES` (it must not be)

---

## 3. Cross-mode invariants (re-run every phase)

Tick all five after **each** phase:

1. **One cart.** Line count and titles on Work ledger = Verify list = (if presenting a line) Show title. Dual-device: desk ledger = iPad.
2. **Stance is not a reset.** Changing Work/Show/Verify never calls session reset, never opens attract, never clears phone.
3. **Commands are panes, not sessions.** Repair/Retail/Buyback/Pickup only swap center Work; cart persists.
4. **Triage is staff.** Blocker count on utility spine; customer faces have zero triage copy.
5. **No timer.** No prompt, no attract, no lease expiry that wipes an open consult (lease/heartbeat is desk claim — do not turn it into a customer timeout).

---

## 4. Verify commands (from this repo)

```bash
# After every phase
npx tsx --test src/lib/kiosk/*.test.ts src/lib/counter/session-store.test.ts src/lib/counter/session-events.test.ts
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast

# After Phase 0 / 5 (two-device)
npx playwright test tests/e2e/counter-session-two-device.spec.ts --project=qa-desktop

# After Phase 4 (intake + stance)
npx playwright test tests/e2e/kiosk-intake-flow.spec.ts --project=qa-desktop
```

Browser (required for UI phases): `/kiosk/v2` paired iPad + `/counter` — empty wait, Show a SKU, Verify cart, pay path, back to Work.

Design-mcp before any `src/**/*.tsx` write: `ds_contract`, `ds_tokens`, `ds_critique`.

---

## 5. Out of scope (refuse if asked mid-stream)

- Attract as default empty state; “still there?” overlay
- Customer-operated catalog on Show
- Searchable customer list on the device principal (keep deterministic phone; lookup on `/counter` or PIN)
- Exchange command from main
- History/reprint on the open customer face without step-up
- Native Swift shell
