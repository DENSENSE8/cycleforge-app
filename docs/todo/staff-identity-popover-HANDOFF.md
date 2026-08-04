# Handoff — staff identity popover: fix scale, diagnose anchoring

**Copy the section below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · stay on the checkout's branch · attach to the user's dev
server on `:3050` (never start / restart / kill it).

**Prior art — this session's work so far:** `src/components/identity/StaffAvatarEditor.tsx`
gained an inline name-edit (click-to-edit, Enter/blur commit, Escape revert), a
new self-service write path (`PATCH /api/staff/[id]/name`, `src/lib/schemas/staff-name.ts`,
`AUDIT_ACTION.STAFF_NAME_SET`), and a trailing pencil affordance. The trailing
"Remove photo" button was dropped (Settings → Appearance still owns it). Full
narrative in this session's transcript if you need it; the code is the source
of truth.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

Close two open items on the staff identity popover — the small card that opens
from the avatar in the MasterNav spine footer (`StaffAccountFooter.tsx` mounts
`StaffAvatarEditor`, near the bottom-left of the viewport when the spine is
open). Read `src/components/identity/StaffAvatarEditor.tsx` in full before
touching anything; it's ~360 lines and self-contained.

1. **Fix the type-scale mismatch** — a design-review finding, concrete and
   ready to implement.
2. **Diagnose the anchoring complaint** — the user said the popover "should be
   pinned top left" and it currently isn't. This needs live reproduction, not
   a blind fix.

## 1 — Type scale (do this first; it's unambiguous)

**The finding.** The inline-editable name currently renders at `role-display`
(24px, 600 weight) — the single largest role in the whole type scale, normally
reserved for page titles and kiosk hero numbers (`ui-design-system.md` → Type).
The avatar beside it was bumped `md` (36px) → `lg` (44px) specifically to "hold
its own" next to that name. Both choices were justified by each other, with
nothing external anchoring either — that's how scale creep happens.

**Why it's wrong for this popover.** The card is 220px wide and its actual job
is "change my color" (the common case) and "change my photo" (the rare heavy
action) — the name-rename is a minor third action, not the point of the
component. Display-scale type tells the eye "this is the important content,"
which crowds out the COLOR and PHOTO sections below and makes the popover feel
top-heavy relative to what it's actually for. The 12px `COLOR`/`PHOTO`
section-label eyebrows now sit at a 2.4:1 ratio to the hero name — a jump this
component's density doesn't support (`ui-design-system.md`: *emphasis from
contrast and tracking, not size*).

**Do:**

- Drop the name to `role-title` (18px) or `role-body` (14px) semibold — both
  live at `src/components/identity/StaffAvatarEditor.tsx` in **two** places:
  the display `<button>` and the `<input>` it swaps to when editing (keep them
  identical so the field doesn't resize on entering edit mode — that's already
  the pattern, just at the wrong size).
- Return the avatar to `size="md"` (36px) once the name shrinks — it was only
  bumped to `lg` to match the oversized name; if that justification goes away,
  so should the avatar size. **Re-check the pair visually** (Playwright
  screenshot or the browser pane) rather than assuming it still balances.
- Re-check whether the pencil `IconButton` still needs to be its own dedicated
  hit target at the smaller name size, or whether the whole name row can share
  one hover affordance. Not required — just worth a look; don't over-engineer
  this into a bigger refactor than it is.
- After the resize, sanity-check the 220px card width still comfortably fits
  `avatar + name + pencil` on one row without truncating "Michael"-length
  names. If it's now cramped in the other direction (too much dead space),
  that's fine to leave — don't chase a pixel-perfect width in the same pass.

**Verify:**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/identity/StaffAvatarEditor.tsx
npx tsx --test src/components/ui/typography-tokens.guard.test.ts src/components/ui/control-size-tokens.guard.test.ts
```

Then open the popover in the browser (see §3) and eyeball it against the
critique above — the name should read as the most prominent thing in the card
without dominating the two sections below it.

## 2 — Anchoring: "should be pinned top left"

**Do not guess-fix this.** The current wiring already reads as top-left
semantics:

```tsx
<AnchoredLayer
  open={open}
  onClose={() => setOpen(false)}
  anchorRef={triggerRef}
  placement="top-start"   // opens ABOVE the trigger, LEFT-aligned to it
  gap={4}
/>
```

`AnchoredPlacement` (`src/design-system/primitives/AnchoredLayer.tsx`) is one
of `top-start | top-end | top-center | top-stretch | bottom-*`. `top-start` is
the correct choice for a footer-bottom trigger opening upward and staying
left-aligned — so either:

- **(a)** `AnchoredLayer`'s collision/flip logic is repositioning the panel
  away from that placement when the trigger is near a viewport edge (the spine
  footer is exactly that case), and the popover is landing somewhere other
  than intended; or
- **(b)** the user means something more specific than "top-start relative to
  trigger" — e.g. the popover's own top-left *corner* should sit exactly on
  the trigger's top-left corner (no gap, no offset), which `gap={4}` and the
  library's own corner math may not currently produce; or
- **(c)** something about the spine's own layout (collapsed vs. expanded
  width, `StaffAccountFooter`'s row padding) is putting the trigger somewhere
  unexpected, and the popover is anchoring correctly to the *wrong* point.

**Do:**

1. Reproduce live. Attach to `:3050`, sign in, open the spine (it's closed by
   default — `navOpen` is unpersisted `useState(false)` in `SidebarNavColumn`),
   scroll to the footer, click the avatar.
2. Screenshot the result and compare against where the trigger actually sits.
   Measure both rects (`getBoundingClientRect()` via the browser pane's
   `javascript_tool`, or a quick Playwright script against
   `tests/.auth/admin.json`) — don't eyeball pixel offsets.
3. Only then decide whether this is an `AnchoredLayer` collision bug (fix in
   the shared primitive — check first whether other `AnchoredLayer` consumers
   near a viewport edge have the same issue, since a primitive fix has a wider
   blast radius than a local one), a missing prop on this call site, or a
   misread of "top left" that needs a product decision rather than a code fix.
4. If it turns out to be an `AnchoredLayer` primitive bug, **ask first** before
   changing shared collision logic — it's consumed by every anchored menu in
   the app (`pattern-evolution.md`: public API changes to a shared primitive
   used by many call sites are ask-first).

## Non-goals

- Don't re-litigate whether the rename belongs in this popover at all (raised
  as an open question in the critique, not a decision).
- Don't touch the COLOR or PHOTO sections — out of scope for this handoff.
- Don't widen the 220px card to "solve" any residual crowding — resize the
  type first, then decide if width is still a problem in a follow-up.

## Verification

```bash
npm run verify
```

**The tree routinely holds another session's in-flight work.** Attribute any
red gate to a file you touched before acting on it —
`git status --porcelain <path>` is the fastest check. Report pre-existing
failures rather than fixing or inheriting them.

## Definition of done

- Name renders at `role-title` or `role-body`, not `role-display`, in both the
  display button and the edit input.
- Avatar is back to `size="md"` (or a size you've re-justified in a comment,
  if `lg` still reads right at the smaller name — don't assume, check).
- The anchoring complaint is either fixed with a documented root cause, or
  written up as a clear, reproducible finding (with measured rects) for the
  next session if it turns out to need a product decision or an ask-first
  primitive change.
- `npm run verify` green on your own files; work-log appended (`pnpm worklog`).
