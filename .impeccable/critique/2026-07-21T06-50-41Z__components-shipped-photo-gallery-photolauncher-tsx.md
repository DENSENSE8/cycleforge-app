---
target: photo hover peek toolbar (PhotoLauncher + ReceivingPhotoButton)
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-07-21T06-50-41Z
slug: components-shipped-photo-gallery-photolauncher-tsx
---
# Critique — Photo hover peek toolbar (`PhotoLauncher` + `ReceivingPhotoButton`)

Method: dual-agent (A: e63e67a2-f122-4b4d-822d-c6eafc03baf4 · B: df0bbc47-a2db-4a23-8453-c3886679416c)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Peek hides loading/error (`toolbarShowLabel={false}`) |
| 2 | Match System / Real World | 2 | Pill click = send-to-phone; gallery needs hover hunt |
| 3 | User Control and Freedom | 3 | Overlay pin + leave delay good; hover-only still fragile |
| 4 | Consistency and Standards | 2 | L-layout unique; diverges from labeled gallery launcher |
| 5 | Error Prevention | 2 | Move PO / ticket one tap, no de-emphasis |
| 6 | Recognition Rather Than Recall | 1 | Seven icon-only actions |
| 7 | Flexibility and Efficiency | 3 | Full matrix without leaving identity row |
| 8 | Aesthetic and Minimalist Design | 2 | Empty L-corner + nested gradient chrome |
| 9 | Error Recovery | 2 | Failed-photo state suppressed in compact peek |
| 10 | Help and Documentation | 3 | Per-icon tooltips; collide with pill tooltip |
| **Total** | | **22/40** | **Needs work** |

## Anti-Patterns Verdict

**LLM**: Conditional fail on product-trust test. Not purple-glow AI slop; Kinetic Ledger blue evidence chrome is in-family. Failures are invention without earned familiarity: L-layout dead space, nested card-in-card chrome, seven equal-weight icons, tooltip+peek stacking.

**Deterministic scan**: 0 findings on both files (`detect.mjs --json` → `[]`). No detector-caught issues.

**Visual overlays**: Skipped — `/ops/receiving` redirects to sign-in; no authenticated session for live injection.

## Overall Impression

Progressive disclosure intent is right for station identity-row density. Execution fights itself: empty L-corner, simultaneous tooltip+peek, and seven same-weight icons force a hesitation valley on every hover. Biggest opportunity: one horizontal strip with clear open vs mutate tiers (viewer primary; move/ticket in overflow) and click-to-pin instead of hover-only.

## What's Working

1. Progressive disclosure keeps photo actions off the identity row until needed.
2. Hover-host engineering (gap bridge, 140ms leave, pin while upload/move open) shows real ops awareness.
3. Action completeness from the carton anchor (view/upload/download/reassign/ticket/library).

## Priority Issues

### [P1] L-layout dead space + weak scan path
**What**: Bottom row `self-end` + vertical right rail leaves ~40% empty top-left.
**Why**: Floor scan L→T; empty quadrant reads broken; actions sit far from the pill.
**Fix**: Single horizontal strip or left=view / right=mutate clusters in one row — not an L.
**Suggested command**: `/impeccable layout` or `/impeccable arrange`

### [P1] Tooltip collision with peek
**What**: Pill tooltip (“7 photos · send to phone”) fires while peek is open.
**Why**: Two floating layers compete; blocks header context.
**Fix**: Suppress pill tooltip when `showGalleryPeek`; put micro copy inside peek header.
**Suggested command**: `/impeccable clarify`

### [P1] Seven equal-weight icons — no open/mutate hierarchy
**What**: Info/Upload/Download/Move/Ticket/Image/ExternalLink share size, color, chrome.
**Why**: Violates “preserve actions; make secondary quiet”; mutate competes with view.
**Fix**: Primary = View; secondary = Info/Upload/Download; overflow = Move/Ticket/Library.
**Suggested command**: `/impeccable distill` then `/impeccable quieter`

### [P2] Pill click vs peek discoverability mismatch
**What**: Click = send-to-phone; view requires hover + icon hunt.
**Why**: Camera mental model = photos, not Ably phone request.
**Fix**: Click opens/pins peek or viewer; phone on `+` segment or inside capture menu.
**Suggested command**: `/impeccable clarify`

### [P2] Hover-only on a floor surface
**What**: Sustained hover required for 7 actions.
**Why**: `density: floor` — gloves, trackpad jitter, no touch path.
**Fix**: Click-to-pin peek; hover as accelerator only; Escape closes.
**Suggested command**: `/impeccable harden`

## Persona Red Flags

**Floor Operator (project)**: Icon-only ×7 under scan load; accidental send-to-phone; hover fragility on compact targets; Move/Ticket one-tap without peek guard.

**Alex (Power User)**: No keyboard path into peek actions beyond focus-open; Escape/arrow contract unclear; high-stakes mutations lack confirm in peek.

**Jordan (First-Timer)**: Image vs Info both open viewer variants; ticket icon unrecognized; tooltip+peek stacks → abandon at first hover.

## Minor Observations

- Image + Info duplicate viewer entry points without differentiated prominence.
- External library permanent chrome for lowest-frequency action.
- Compact peek drops photo count once eyes leave the pill.
- Blue evidence palette adds a third color story beside Claim orange.
- Right-aligned peek may clip on narrow viewports.

## Questions to Consider

1. Is hover the right contract for 7 actions + 2 high-stakes mutations?
2. Should send-to-phone be pill primary, or live inside capture/upload?
3. Is the L-layout solving a real constraint, or decorating overflow?
4. Do Move PO / Send to ticket belong in the photo peek at all?
5. If view + upload are 80% of use, why show seven at parity?
