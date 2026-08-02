# Claude Code prompt — Carton read display polish (`/carton/[id]`)

**For:** Claude Code / Cursor Agent
**From:** carton photo-triage build, 2026-08-02 (post-ship display pass)
**Status:** BUILD — no research gate. The IA questions below are open; the ones in §5 are **closed** and must not be reopened.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Read first (do not reopen):**

| Doc | Role |
|---|---|
| `.claude/rules/display/carton-read.md` | The surface contract — anatomy, bans |
| [`carton-photo-triage-RESEARCH-RULING.md`](./carton-photo-triage-RESEARCH-RULING.md) | Photo lanes / placement / API, with the measured data behind them |
| `.claude/rules/ui-design-system.md` | One-row anatomy, density, tokens |
| `.claude/rules/pattern-evolution.md` | Compose → grow the SoT → compound |

**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts` (15 tests). Every ban in it is load-bearing. You may re-point an assertion at moved intent; you may not delete one.

---

## 0. One-sentence goal

**Make the two-column carton read hold its weight at 1440 — the left column currently empties out while the right runs long — without reopening the photo, disposition, or work-escape rulings.**

---

## 1. The problem, as observed

After the 2026-08-02 layout pass (Activity moved to col 2, Contents left-aligned), a
typical single-line carton at 1440×900 looks like this:

```
┌ Col 1 ──────────────────┬ Col 2 ─────────────────────┐
│ CONTENTS   (1 card)     │ PROGRESS   (pipeline)      │
│ RECORD     (facts panel)│ ACTIVITY   (2 events)      │
│                         │ HISTORY    (unit journeys, │
│   ~2/3 of the column    │             photo thumbs)  │
│   is empty canvas       │ FINDINGS   (exceptions)    │
│                         │                            │
└─────────────────────────┴────────────────────────────┘
```

CSS grid stretches both cells to equal height, so the *cells* match — but col 1's
**content** ends roughly a third of the way down while col 2 runs past the fold.
The median carton is one line and seven photos, so this is the common case, not
the edge case.

**Do not "fix" this by moving Activity back.** That was just decided
(`carton-read.md` — col 1 = what is in the box, col 2 = what happened to it), and
the event streams belong together. The imbalance is a *sizing and ordering*
problem, not an assignment problem.

---

## 2. Work items

### 2.1 Column weight — pick ONE and argue it

Candidates, roughly in order of how much they change:

1. **Asymmetric tracks.** `xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]` — give the
   timeline the space it actually uses. Cheapest, keeps both columns.
2. **Let contents grow.** Col 1 is thin because a single line renders one 44px
   card. Consider surfacing per-line detail that today only exists in Unbox
   (serial list, per-line photo count, per-line exception) — **read-only**, shared
   atoms only, never `PoLineRow` / `PoLinesAccordion`.
3. **Single column below a threshold.** If a carton has ≤1 line and no notes,
   two columns may be the wrong shape entirely — stack and let the timeline breathe.
4. **Move RECORD.** The facts panel (intake type · carrier · QA status · carton ·
   shipment · source · pairing · created · updated) is reference data nobody scans
   first. It could sit at the BOTTOM full-width, freeing col 1 for contents.

Measure before and after with a Playwright probe (§4). A screenshot is not a
measurement — CSS grid equalizes cell heights, so measure the **last child's
bottom relative to the column top**, per column.

### 2.2 FINDINGS is last, and it is the most urgent thing on the page

Exceptions currently render at the bottom of col 2, below the unit-journey
history. `carton-read.md` already rules that **exceptions outrank
`lifecycle.done`** for the disposition header — the same logic says an unresolved
finding should not be the last thing an operator scrolls to.

Options: hoist to the top of col 2; hoist to a full-width band under the
DispositionBar (beside/below the photo band); or surface a count on the header.
**Whatever you pick, the disposition truth rule stays** — the header must never
read settled while exceptions hold.

### 2.3 There are now three photo surfaces on this page

1. The `Photos · N` CTA band (`CartonPhotoTriage`) — the browse surface.
2. Unit-journey thumbs inside HISTORY (`StationUnitJourneys`) — "3 photos" /
   "6 photos" strips with a `+3` overflow tile.
3. The shared `PhotoViewerPortal` drill-in, reached from both.

(2) is arguably correct — those thumbs are *evidence attached to a journey event*,
not a second browser. But it is currently undocumented and the two surfaces can
disagree about what they show. **Deliverable: a one-paragraph ruling in
`carton-read.md`** — either "journey thumbs are event context and stay", or
"journey thumbs deep-link into the triage band's matching bucket". Do not build a
third browse UI either way, and do not fork the viewer.

### 2.4 Contents at N lines

Every measurement behind the current layout came from single-line cartons. Check a
multi-line PO carton (`purchase_orders.length > 1` renders an extra list) and
confirm: does the left column still need help at 4+ lines? Does the PO list
duplicate what CONTENTS already says? Should CONTENTS group by PO when there are
several?

### 2.5 Narrow + mobile

The `xl:` breakpoint means everything stacks below 1280. Verify at 1024 and 768:
photo band, Contents, Activity, History, Findings order after stacking. The photo
band opens above both columns — confirm that is still right when there is only one
column (it may want to sit under Contents).

---

## 3. Hard Always / Never

### Always

- Compose `Panel` / shared atoms / `text-role-*` / spacing intents / `focusRing`.
- Keep every existing guard assertion green; re-point, never delete.
- Contents rows stay **left-aligned**, title → meta, shared atoms only.
- `npm run verify` green before done.
- Measure geometry in Playwright, not in the preview pane.

### Never

- Move Activity back to col 1 (§1).
- Mount `PoLineMetaGrid` here (it is the Unbox fixed-track grid — see
  `carton-read.md`), or `PoLineRow` / `PoLinesAccordion` / `ReceivingDetailsStack`
  / `StationWorkbench` / `CartonContextCard`.
- Add a write. This surface reads; the work escape is one quiet `openInUnboxHref`.
- Add a second lightbox, an `EvidenceStage`, or a `role="dialog"` photo UI.
- Reintroduce a mid-rail photo launcher card — the CTA owns the entry.
- Raise a DS ratchet baseline or `--no-verify`.
- Start / restart / kill the dev server.

---

## 4. Verification

```bash
npx playwright test <spec> --project=qa-desktop   # QA org — the default
```

QA-org fixtures worth knowing (measured 2026-08-01):

| Carton | Org | Shape |
|---|---|---|
| 50377 · 50375 · 50376 · 50378 · 50379 | QA Sandbox | 2 box + 1 item photo |
| 50354 | USAV (dogfood) | 9 photos, all `claim_evidence`, 0 item |

**The QA org has zero `claim_evidence` links**, so anything claim-shaped needs a
dogfood-only spec with a header comment saying why (`verify.md` exception) and
shape-based assertions, never counts.

Column-extent probe shape:

```ts
const extent = (col: HTMLElement) => {
  const top = col.getBoundingClientRect().top;
  const last = col.children[col.children.length - 1] as HTMLElement;
  return last ? last.getBoundingClientRect().bottom - top : 0;
};
```

---

## 5. Settled — do not reopen

| Decision | Where it was ruled |
|---|---|
| Photos = DispositionBar primary CTA + in-flow band, `?photos=1` durable | ruling §4 |
| `Exact \| Investigative` on the SCOPE axis (not aspect-completeness, not `claim_evidence`) | ruling §1, with the 3-of-538 measurement |
| No Damaged bucket — `photo_analysis` is empty and unwritten | ruling §3 |
| `photo_type AS caption` stays; `photoType` ships beside it | ruling §5.1 |
| Secondary link roles via `EXISTS`, never `l.link_role` | ruling §5.2 |
| One shared `useReceivingPhotos` cache entry, number-keyed | ruling §6.1 |
| `/carton` owns its params (`carries: []`) | `routing/receiving-routes.ts` |
| Activity lives in col 2 | `carton-read.md` |
| Read surface cannot upload / delete / reassign | guard |

---

## 6. Acceptance

- [ ] Left column carries real weight at 1440 on a single-line carton — measured before/after
- [ ] A chosen, argued answer for §2.1 recorded in `carton-read.md`
- [ ] Findings reachable without scrolling past the full history
- [ ] Journey-thumb ruling written into `carton-read.md`
- [ ] Multi-line and multi-PO cartons checked
- [ ] 1024 / 768 stacking order verified
- [ ] Guard still 15+ green; no assertion deleted
- [ ] `npm run verify` green; no baseline raised

---

## End of prompt
