# Handoff — MasterNav spine PHASE D: Cloudflare-shaped rows, no count badges, hover quick-nav

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-03
**Predecessors:** [`spine-visual-language-HANDOFF.md`](spine-visual-language-HANDOFF.md) (A + C, shipped) ·
[`spine-vocabulary-phase-b-HANDOFF.md`](spine-vocabulary-phase-b-HANDOFF.md) (B, **committed** `e627e3d3e`)
**Status:** ready — but §1 is uncommitted work you are standing on, and §4 carries a measured risk that can sink the whole idea
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**

**Paste for a new session:**

```
Read docs/todo/spine-cloudflare-nav-HANDOFF.md and execute it, then stop and report.

§1 is UNCOMMITTED work already in the tree — read it before you touch a file, and
do not redo it. §4 is the load-bearing risk: two-line rows roughly double row
height, and the map is already 737px against a ~558px port. MEASURE before you
commit to the pattern; if it does not fit, §4.3 is the fallback and it is not a
failure.

§3 (count badges) has a consequence the brief spells out: removing them VACATES
a slot the source-of-truth explicitly cites as taken. Read §3.2 before deleting.

Attach to :3050; never start/restart/kill the dev server. npm run verify before done.
```

---

## 0. Why this exists

The operator looked at the spine and said the trailing numbers "seem like a notification
display — it's distracting," and pointed at Cloudflare's nav as the target shape. Both are
fair readings and both are actionable. This phase is **presentation only** — no registry
changes, no reordering, no renames. Those are done.

---

## 1. ⚠️ You are standing on UNCOMMITTED work — read this first

`e627e3d3e` (Phase B) is committed. Everything below is **in the working tree, green, and
not yet committed.** Do not redo it; do not revert it while "cleaning up."

| Change | Files |
|---|---|
| **Scan Stations moved FIRST** in `SPINE_SECTIONS` | `sidebar-navigation.ts` |
| **`sectionDrawsHeader()`** — a section draws an eyebrow iff it holds >1 page AND no page repeats its label. Yields exactly **Scan Stations** today | `sidebar-navigation.ts`, `SidebarNavList.tsx` |
| **Home/Search/Media/Chat left the spine** → `HeaderTopPins` in the GlobalHeader LEFT cluster | `HeaderTopPins.tsx` (new), `GlobalHeader.tsx`, `SidebarNavList.tsx` |
| **Org band deleted** — `OrgWorkspaceControl.tsx` removed; the 40px band stays EMPTY | `MasterNavView.tsx` |
| `SIDEBAR_MASTER_NAV_MODE_PAD_X` deleted, `…_GAP` → private `SIDEBAR_RAIL_LEADING_GAP` | `header-shell.ts` |
| Guards rewritten for all of the above | 3 guard tests |

**Two of these have reasons that are easy to undo by accident:**

- **The empty 40px band is NOT dead space.** The spine is a flex *sibling* of the
  header+content column (`ResponsiveLayout`), so that face is the only thing putting the
  spine's bottom hairline on the same Y as the GlobalHeader's. Delete it and the header's
  border runs into the spine mid-row. `header-mode.guard.test.ts` pins it.
- **`HeaderTopPins` is in the LEFT cluster, deliberately not the right rail.** The
  far-right rail is ratified at **three icons, one per kind** (find · be told · ask), cut
  from six on 2026-08-01. These are destinations, not actions. Do not move them right.

**Measured now (modeled at 32px rows, ~558px port, 1440×900):** map is **737px**, with
Sales and Support below the fold. Before this pass it was 854px with five sections cut off.

---

## 2. The target pattern (from the operator's Cloudflare screenshot)

What the screenshot actually shows, itemised — build against this list, not against a
memory of "Cloudflare-like":

1. **Two-line rows** — bold destination name, muted second line naming its parent
   (`Records` / `cycleforge.ai / DNS`; `Overview` / `Domains`).
2. **A left vertical rail** spanning a group, instead of relying on indent alone.
3. **A collapsible section header** — icon + label + chevron, on a subtle rounded fill.
4. **No trailing counts. No badges of any kind.**
5. Generous vertical rhythm; the list breathes.

### 2.1 The good news: the data already exists

**Do not build a parent-resolution layer.** `nav-destinations.ts` already computes exactly
the second line this pattern needs — `contextFor(label, parent)` — and it already returns
`null` when the context would merely repeat the label, which is the `Inbound / INBOUND`
defect the flat search ruled on months ago. The resting map simply never used it; only the
search results did.

So the second line is a **render** change over `buildNavDestinations`-shaped data, not a new
derivation. Reuse it. Two derivations of "what is this row's parent" is the exact hazard
every other SoT in this repo exists to prevent.

---

## 3. Remove the trailing counts

`SidebarNavList.tsx`: `showCount = (opts.count ?? 0) > 1` (~line 302), rendered ~line 332,
supplied at ~line 395 (a page's children) and ~line 505 (subgroup members).

### 3.1 The operator's reading is correct

A right-aligned pill of digits is the universal notification affordance. Ours means
"structural cardinality" — how many children exist — which is a fact that never changes and
that the operator learns once. Spending the most attention-grabbing slot in the column on an
immutable number, in a shape that promises unread work, is a bad trade. Delete it.

### 3.2 ⚠️ The consequence nobody will notice until it bites

`source-of-truth.md` → *Per-staff queue depths* rules that queue depths belong in
`InboxQueueLinks`, **not** the spine, and **one of its three arguments is that the trailing
slot is already taken**: *"the spine's trailing count already means structural cardinality
(`> 1`, `aria-hidden`)."*

Removing the count **vacates that slot** and retires that argument. The other two legs still
stand (a section rollup would merge Arrival + Packing + Testing into one meaningless number;
`nav-search.ts` is safe on every keystroke only because the registry does no I/O), and one
leg — "a page badge is invisible until you drill" — is *already* stale, since the drill is
gone.

**So: delete the count, and in the same change amend that SoT row** so it rests on the legs
that survive. Do **not** let a live queue-depth badge move into the vacated slot as part of
this phase; that is a separate ruling with its own cost (per-render I/O in the nav registry),
and it must not ride in on a cosmetic change.

---

## 4. ⚠️ The risk that can sink the two-line pattern: MEASURE FIRST

The map is **737px against a ~558px port** today at ~32px single-line rows. A two-line row
lands somewhere around 44–48px. Naively, ~20 rows × +14px ≈ **+280px**, putting the map near
**1000px** — which would push roughly half the spine below the fold and undo the 854 → 737
win this and the previous phase just bought.

**This is the whole question of the phase. Resolve it with a measurement, not an opinion.**

### 4.1 How to measure honestly

`.claude/rules/verify.md` is explicit: geometry claims come from the real runner, not a
preview pane. Extend `tests/e2e/sidebar-open-close.spec.ts` (it already authenticates and
opens the spine) with a probe that reports, at 1440×900:

- total scrollHeight of the map,
- the port height,
- which rows have `getBoundingClientRect().top > port`.

Report those numbers in your write-up. A modeled estimate is not a result — the numbers in
§1 are modeled and are labelled as such for exactly that reason.

### 4.2 If it fits — build it

Two-line rows, left nesting rail, no counts. The section eyebrow from §1 may become the
Cloudflare-style header (icon + label + chevron on a subtle fill) — but **only for sections
that pass `sectionDrawsHeader`**, which today is Scan Stations alone. A header over `Catalog`
would render `Catalog` twice, which is the defect the 2026-08-02 flatten deleted and which
`main-nav-groups.guard.test.ts` still pins.

### 4.3 If it does not fit — this is the fallback, and it is not a failure

Take the parts that cost nothing vertically:

- **counts removed** (§3 — independent of everything else, ship it either way),
- the **left nesting rail** (a border, not height),
- the section header treatment,
- tighter/quieter type per the existing ladder,

and **leave rows single-line.** The second line is the only expensive part of the pattern.
Cloudflare can afford it because its nav is ~8 rows deep; ours is ~20 and is the primary
navigation of a warehouse floor. Say so plainly in the write-up rather than shipping a map
the operator has to scroll to use.

---

## 5. Open question, NOT yet decided — hover quick-nav on the sidebar toggle

The operator proposed: **hover the sidebar icon → reveal the four quick-nav icons; full click
→ open the whole spine**, citing the Mode / Recents dropdowns as an established pattern.

**Do not build this without settling the objections.** They are real and they are specific:

1. **It would undo the reason the icons moved.** Home/Search/Media/Chat left the spine
   *because* the spine is closed on every cold load (`navOpen` is an unpersisted
   `useState(false)`; `sidebar-open-close.spec.ts` asserts "starts collapsed"). Putting them
   behind a hover puts four primary destinations back behind a gesture.
2. **Hover alone is keyboard-unreachable.** The house ruling on `GridColumnGutter` is
   explicit: reveal on `group-hover` **plus** `focus-within` **plus** `open`, with
   `pointer-events` following visibility.
3. **That corner already has a hover behaviour.** There is a **2-second left-edge dwell**
   with a progress-fill cue that opens the collapsed spine (`ResponsiveLayout` ~line 201,
   E2E-pinned). A second hover, a few pixels away, with a *different* outcome, is two
   answers to one gesture in one corner.

**In its favour, honestly:** the repo does ship hover-peek + click-toggle on one control —
`ScanStationProgressControl` (hover peeks the checklist, click opens/switches). So the
grammar is not foreign. The difference is that the ring peeks *reference information*, while
this would peek *controls you must then travel into* — the classic fragile hover menu.

**Recommendation:** keep the four icons resident (as built in §1) and drop the hover reveal.
If the operator still wants it after using the resident version, revisit it then — with the
edge-dwell collision resolved first, because those two cannot both own that corner.

---

## 6. Verify

```bash
npm run verify
```

```bash
npx playwright test tests/e2e/sidebar-nav-search.spec.ts tests/e2e/sidebar-open-close.spec.ts tests/e2e/cmdk-palette.spec.ts --project=desktop
```

**Red gates that are NOT this work.** As of 2026-08-03 the tree holds another session's
receiving / support / unbox work. Knip showed 8 findings under `src/lib/support/*`,
`src/hooks/useSupportSuggestion.ts`, `src/lib/threads/composer-draft.ts` and
`UnboxStepCue.tsx`; typecheck went red mid-session on `ProcedureDeck.tsx` and Support routes
and recovered on its own. **Re-check what is still live before you start; do not inherit or
fix them** — report which failures are pre-existing.

**A caution learned the expensive way today:** `grep` in this environment is aliased to
**`ugrep`, which serves a stale cache.** It silently returned pre-edit results and fed a
rename script wrong file lists — a whole pass reported success and changed nothing. **Use
`rg`** for anything that drives an edit, and re-verify with a second tool before concluding
that work was lost.

**Do not** raise a ratchet baseline to make a gate pass — baselines only shrink.

---

## 7. Out of scope — say no to these

- **Re-litigating the section ORDER, the vocabulary, or the labels.** Scan Stations first,
  child pages, and the label table are ruled and committed (`e627e3d3e`).
- **Re-adding a section header row, an eyebrow, or a drill for a section that fails
  `sectionDrawsHeader`.** The predicate is the rule; widening it re-creates `Catalog › Catalog`.
- **Moving `HeaderTopPins` to the far-right rail** — three icons, one per kind (§1).
- **Restoring the org band.** Identity lives in the `StaffAccountFooter` ⋯ menu header;
  switching lives in Settings → Organization (`WorkspaceSwitcher`).
- **Putting a live queue-depth badge in the slot the count vacates** (§3.2).
- **Deleting the empty 40px spine band** — it is the top-chrome seam (§1).
