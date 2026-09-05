---
target: the mobile universal scan screen (/m/scan)
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-05T17-56-35Z
slug: src-components-mobile-redesign-universalscan-tsx
---
Method: dual-agent (A: ad4cdf9b72817a3bf · B: a6f590f13fd626589)

# Critique — /m/scan (UniversalScan.tsx), Operate mode

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | status glyphs (network chip, resolving spinner) are 10–12px at the top, opposite the thumb |
| 2 | Match system / real world | 1 | "Carton logged for triage — not_found" leaks an enum; Prioritize / EXPECTED / MATCHED are desk-rail words |
| 3 | User control and freedom | 1 | "+ New" wipes verdict, photos and mode with no undo and no Stack to recover from |
| 4 | Consistency and standards | 2 | plan says top-left = Stack, Field = bottom; screen ships hamburger drawer + Field at top; desk scan bar reused verbatim |
| 5 | Error prevention | 1 | a non-carrier string on Arrival runs the door lookup in `auto` and can mint a carton |
| 6 | Recognition over recall | 2 | three icon-only mode tabs; operator must recall truck / shield / box |
| 7 | Flexibility and efficiency | 2 | the primary gesture (camera) is a 24px glyph inside the field, not a thumb target |
| 8 | Aesthetic and minimalist | 1 | six strata before content: header, mode row, field, banner, dropdown, list |
| 9 | Error recovery | 1 | UNFOUND offers only a chevron; no re-scan, wrong-mode, or photograph-label path |
| 10 | Help and documentation | 1 | the placeholder is the only instruction |
| **Total** | | **14/40** | **Poor** |

## Design Specificity Verdict
LLM: category-interchangeable list app with a scanner bolted on top. Strip the truck glyph and it is any CRUD template: hamburger + title + "+ New", segmented control, search-shaped field, filter dropdown, chevron list. Nothing says "held in one hand at a dock door over a carton". The one authored element (ArrivalCard) is not on screen because the door lookup minted an Unfound and the verdict banner took its place.
Deterministic scan: 0 findings across the four files, but the detector ran DEGRADED (HTML parser modules missing) so zero is an undercount. Static measurements: the text input sits at y≈150–178 of 844 (top fifth); no app-owned bottom-anchored control; no safe-area inset anywhere; 0 fixed/bottom classes; the last list row is clipped by the viewport; the only bottom element is the Next dev badge overlapping the list.
Visual overlays: not available (no mutable browser injection in this session).

## Overall impression
The screen is a desk rail squeezed to 390px with the input where a desktop search box goes. The biggest opportunity is inversion: Field at the bottom, one Card in the middle, the queue behind the Stack.

## What's working
- `announce()` couples the banner tone to audio/haptic from one source, so cues cannot disagree.
- `verdict.seq` remounts the banner on identical rescans, so a re-read never looks like a missed read.
- The carrier-overrides-mode rule in `dispatch` and the preview-before-mint path are the plan's resolver model, correctly placed.

## Priority issues
- [P0] Field at the top, not bottom-anchored. A gloved thumb cannot reach y≈320 while holding a carton. Fix: fixed bottom dock with safe-area padding; viewfinder opens upward from it; camera becomes a full-height 56px thumb cell at the right of the Field; placeholder names the destination ("Scan → Arrival"). /impeccable adapt
- [P0] The Card is not one. Verdict banner + Prioritize + receiving list share the stage. Fix: after a scan the stage shows only the Card (ArrivalCard for never-seen; carton Card for known/unfound with the same object → facts → one preselected verb shape). The list lives in the Stack. /impeccable distill
- [P1] Top-left is a hamburger drawer, not the Stack. Fix: the control opens the Stack sheet (Now · Earlier today · Queues · Find); drop "+ New" — the next scan is the new scan; Rescan is the Card's secondary verb. /impeccable shape
- [P1] Mode row of three icon-only tabs. The dispatch table chooses the mode, not the operator. Fix: remove the segmented control from the primary surface; show the resolved mode as a word in the Card header. /impeccable distill
- [P2] Raw enum and desk vocabulary in the answer. Fix: map not_found → "Not on any inbound" with the next verb. /impeccable clarify

## Persona red flags
- Gloved, one-handed at the door: every needed control is in the top 40%; camera toggle 24px and chevron 20px are below the ~48px glove minimum; no way to advance without re-gripping.
- First-day temp: three unlabelled icons, "Prioritize" with no object, "MATCHED 0/1" — nothing says what to do; no preselected verb.
- Lead walking the floor: wants what came in and what is stuck; that is the Stack, fused onto the scan surface where a stray scan mints a carton; no session title on the header.

## Minor observations
Amber for both UNFOUND and EXPECTED; hover tooltip on a touch control; truncated titles on every row; flush-square segmented indicator against rounded header buttons.

## Questions to consider
1. If the phone showed only the Card and the Field, what would an operator miss during a shift?
2. Why does the operator ever choose a mode when dispatch overrides it the moment a tracking number arrives?
3. What is the cost of a scan that mints a carton by accident versus one that only previews, and which default does a first-day temp deserve?
