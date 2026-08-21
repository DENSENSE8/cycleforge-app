# Kiosk counter face — customer-facing form treatment

**Status:** plan only. Nothing below is built.
**Surface:** `/kiosk/v2` — every form a customer sees or touches.
**Ask:** bubble/rounded corners, real spacing between components, native-app form feel.

---

## 1. This is not a law break — it is a law that was never applied here

`docs/rules/display/kiosk-shell.md` already states the discriminator, in its own words:

> **The counter is a form, not a scanner station.** … elevated into a native-feeling landscape tablet app.

The zero-radius law it appears to contradict is scoped to **ops chrome** — `kinetic-ledger.md`
says "**Ops** chrome is zero-radius industrial", about desk surfaces an operator lives in
8 hours a day. The kiosk is the one surface in this product that a **customer** touches, once,
without training. Those are different jobs, and the house rule for that is explicit:

> A genuinely different job / region contract earns a **new sibling that composes the shared
> primitive** — that is growth (Always), not a fork. (`pattern-evolution.md`)

So this is not "soften the design system". It is: the counter face gets its own radius +
touch scale, the ops surfaces keep theirs, and both resolve from one token module.

**What actually happened in the code:** the DS field primitive is *already* soft —
`TextField` renders `rounded-xl border` by default. The kiosk deliberately overrides it back
to square at **18 call sites** (`inputClassName="rounded-none"`) plus `appearance="flush"` in
the panes. Most of Phase 2 is deleting overrides, not adding styles.

---

## 2. The one decision to ratify first

**Do not change `cornerClass()`.** Every non-`pill` role renders `rounded-none` app-wide
(Waves 0b–0e); remapping a role would silently re-round ~every surface in the product and
break `radius.test.ts`, which pins the flushed ladder.

Instead: a **kiosk-scoped resolver** that maps the same role vocabulary to the counter scale.

| Role | Ops (`cornerClass`) | Counter (`counterCorner`) | What it is on the kiosk |
|---|---|---|---|
| `chip` | `rounded-none` | `rounded-lg` (8) | issue pills, badges |
| `control` | `rounded-none` | `rounded-xl` (12) | selects, toggles, spine cells |
| `field` | `rounded-none` | `rounded-xl` (12) | every text input |
| `card` | `rounded-none` | `rounded-2xl` (16) | form sections, product tiles |
| `canvas` | `rounded-none` | `rounded-3xl` (24) | the panel shell itself |
| `cta` (new) | — | `rounded-2xl` (16) | Save / Pay / Look up |
| `pill` | `rounded-full` | `rounded-full` | dots, avatars, switches |

Nesting still uses `nestedCorner(outer, padStep)` — **inner = outer − padding** — so a
`rounded-2xl` section with `p-3` takes `rounded-lg` fields and the corners stay concentric.
That math already exists and is tested; it just becomes non-trivial again once radii are
non-zero.

**Ask before building:** does the softened face apply to the **whole** `/kiosk/v2` shell
(including the left command spine and the right utility rail, which staff drive), or only to
the customer-touched forms and the catalog? The plan below assumes **whole shell** — one
surface should not be half industrial — but the rails are the arguable half.

---

## 3. What "native form feel" means concretely

Not decoration. Six behaviours, each checkable:

1. **Touch targets ≥ 48px** — fields, buttons, category rows, tiles. Today `TextField`
   `appearance="flush"` is `h-11` (44px), and the flush kiosk rows are 44–56.
2. **Input font ≥ 16px** — under 16px, iOS Safari zooms the page on focus and the operator
   has to pinch back. Kiosk fields are `text-sm` (14px) today. This is the single most
   "not-native" thing on the surface.
3. **Right keyboard, first time** — `inputMode` + `autoComplete` + `enterKeyHint` on every
   field. Partly done (`tel` / `email` / `name`); `enterKeyHint` is nowhere yet, so the
   customer gets a generic Return key instead of `next` / `done` / `search`.
4. **One field per row.** The line editor currently puts Qty + Price side by side; at counter
   distance with a thumb, that is a mis-tap.
5. **Breathing room** — sections separated by *gap*, not by hairline dividers on a full-bleed
   band. Today every kiosk section is `border-b border-border-hairline` + `px-4 py-4`, which
   is the ops-density grammar.
6. **Errors and required state on the field**, not only as one sentence in the footer. The
   triage model (`visit-triage.ts`) already knows per-field problems — the field can read it.

---

## 4. Phases

### P0 — ratify (docs only, ~30 min)

- One paragraph in `kinetic-ledger.md`: the counter face is a named sub-identity, same tokens,
  different radius + touch scale, and the ONLY surface exempt from flush-square.
- Same in `docs/rules/display/kiosk-shell.md` §2, with the table from §2 above.
- Without this, the next agent "fixes" the rounding back to flush and cites the law correctly.

### P1 — the token layer

`src/app/kiosk/kiosk-counter-surface.ts`:

- `counterCorner(role)` — the table above.
- `COUNTER_TOUCH` — `min-h-12` (48) standard, `min-h-14` (56) for primary CTAs.
- `COUNTER_RHYTHM` — section gap `gap-4`, in-section field gap `gap-3`, panel padding `p-4`.
- `COUNTER_FIELD` / `COUNTER_SECTION` / `COUNTER_CTA` composed from those.
- Unit test: every role differs from `cornerClass(role)` (i.e. the resolver is doing work),
  `pill` still matches, and the ladder is monotonic.

### P2 — fields (the visible win)

- Delete the **18** `inputClassName="rounded-none"` overrides and the kiosk
  `appearance="flush"` usages; the DS default (`rounded-xl border`) is already right.
- Grow `TextField` with `size?: 'default' | 'touch'` — `h-14`, `text-base` (16px), larger
  floating label. A prop on the primitive, never a kiosk `className` hack (house law:
  do not paint over primitives).
- Audit `inputMode` / `autoComplete` / `enterKeyHint` on all **27** kiosk `TextField`s
  (`KioskCartLineEditor` 8 · `KioskBuybackPane` 5 · `KioskCounterPane` 4 ·
  `KioskCustomerIntake` 4 · `KioskRepairPane` 4 · `KioskPickupPane` 2). Only **11** hints
  exist across all of them today, and `enterKeyHint` appears zero times.
- `KioskCustomerIntake` and `KioskCartLineEditor` go one-field-per-row.

### P3 — sections and panels

- Kiosk sections become spaced cards (`counterCorner('card')` + gap) instead of hairline bands.
- Panel shells (`KIOSK_UTILITY_PANEL_FACE`, the panes) take `canvas` radius with inner padding,
  so the center stage reads as a sheet, not a table.
- Keep the flush **seam** between shell columns — the rails still meet the stage edge-to-edge;
  it is the content inside that softens. (Otherwise the whole shell floats and we have
  re-introduced the "floating column islands" ban.)

### P4 — CTAs

- `KIOSK_PANE_FOOTER_BAND`'s edge-to-edge square buttons become spaced `cta`-radius buttons
  with a real gap and a safe-area inset. Save/Pay stop looking like a spreadsheet toolbar.
- Grow `button-variants.ts` with the counter size rather than `className` overrides.

### P5 — catalog + selection

- Product tiles: `card` radius, real gutters (the grid is `gap-0` + per-cell hairlines today —
  that was the fix for the grey gutter panel; with radius it becomes `gap-3` on a white host).
- Keep the selection grammar exactly as it is — full blue border + circular top-left dot. It is
  already the most customer-legible thing on the screen.
- Category rows: `control` radius with inset, so the selected row reads as a pill-ish tab.

### P6 — proof

- Extend the existing Playwright spec (`rail glyphs swap the CENTER stage …`) with a
  **computed-style** pass: every kiosk input/button has `border-radius ≥ 8px`, `height ≥ 48px`,
  `font-size ≥ 16px`. Assert on `getComputedStyle`, not on class strings — the class is not the
  pixel.
- Screenshots per phase into `docs/screenshots/kiosk/` (`test-results/` is wiped each run).

---

## 5. Guards that will fail — and must be rewritten, not deleted

These currently encode the *opposite* law for this surface. Each needs its assertion inverted
to the counter scale in the same commit that changes the tokens, or the flush law silently
stops being enforced everywhere else too:

| File | Assertion |
|---|---|
| `kiosk-pos-surface.test.ts:68` | `KIOSK_MODE_SPINE_ROW` has no `rounded-xl` |
| `kiosk-pos-surface.test.ts:170–171` | `KIOSK_POS_CARD` has no `rounded-2xl` / `rounded-xl` |
| `kiosk-pos-surface.test.ts:169` | "strips floating rounded cards — flush cells + hairline grid" |
| `kiosk-pos-surface.test.ts:228–229` | `KIOSK_POS_CATEGORY` has no `rounded-xl` / `rounded-full` |

`radius.test.ts` and `app-surface.test.ts` stay untouched — the ops ladder does not move.
If a change makes *those* fail, the change is wrong.

---

## 6. Sequencing note

P1 + P2 alone deliver most of what the ask is about (rounded fields, real touch size, native
keyboards) and are reversible in one commit. P3–P5 are the taste pass. Do not start P3 before
seeing P2 on the tablet — the section rhythm reads completely differently once the fields
themselves have height and radius.
