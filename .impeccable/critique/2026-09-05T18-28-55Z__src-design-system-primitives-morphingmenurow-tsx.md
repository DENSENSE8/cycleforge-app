---
target: Morphing / row-action menu
total_score: 36
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 0
timestamp: 2026-09-05T18-28-55Z
slug: src-design-system-primitives-morphingmenurow-tsx
---
# Critique — Morphing / row-action menu (shared wrapper)

**Target:** `src/design-system/primitives/MorphingMenuRow.tsx` (+ `menu-tone.ts`, DropdownMenu, ContextMenu, Popover)
**Mode:** Operate
**Hop:** 2 (after danger-wash and caption-contrast fixes)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Status pills filled at rest; highlight is ring-2; verbs wash via hover / focus / data-[highlighted] |
| 2 | Match System / Real World | 4 | Commits read as chips; verbs stay ink; Cancel is a status, Delete is a verb |
| 3 | User Control and Freedom | 4 | Radix dismiss; Cancel is a commit pill; danger is not a second filled state |
| 4 | Consistency and Standards | 4 | One MENU_ITEM_TONE_CLASS on Dropdown / Context / menuItemClass |
| 5 | Error Prevention | 4 | Armed Delete = text-text-danger + bg-surface-hover; idle Cancel = bg-surface-danger triad |
| 6 | Recognition Rather Than Recall | 4 | Hint under the verb; no keycap fork |
| 7 | Flexibility and Efficiency | 4 | Hold-F + mouse keeps data-[highlighted] on every tone |
| 8 | Aesthetic and Minimalist Design | 4 | Hierarchy is size + font-medium / font-normal; caption is text-current |
| 9 | Error Recovery | n/a | Row primitive does not diagnose runtime errors |
| 10 | Help and Documentation | 4 | Caption slot is contextual help; KeyboardKey correctly refused |
| **Total** | | **36/36** | **Excellent** |

## Design Specificity Verdict

**LLM:** Authored for Cycle Forge Operate. Status owns fill; verbs rest as ink; hold-F then mouse is a first-class paint path. An unrelated SaaS could not drop this in without inheriting the house status grammar.

**Deterministic scan:** detect.mjs exit 0, 0 findings on five files.

**Visual overlays:** skipped — source-only primitives, no demo URL.

## Overall Impression

Color + hierarchy on the shared wrapper is **10/10**. Fill means status commit; ink means verb; caption sits under the verb in current ink; pointer highlight never goes dark.

## What's Working

1. Two jobs, one map — commits are chips (`my-0.5` + inset ring); verbs are ink until armed.
2. Armed Delete ≠ idle Cancel — danger stays ink + surface-hover wash.
3. Caption hierarchy without a fade — text-role-caption + font-normal + text-current.

## Priority Issues

None P0–P2 on the shared wrapper.

P3 (nits, not wrapper-blocking): SubTrigger chevron size/ink drift between Dropdown and Context; raw `[&>svg]` siblings lack MorphingMenuRow's `mt-0.5`. Optional checked-state API. House success/warning triad contrast (~3.1:1) lives in theme files, not this map.

## Persona Red Flags

Warehouse operator: pills-at-rest are findable with a gun in hand; Delete no longer lights up as a second red pill. Expert: hold-F + mouse wash matches dense ops menus; no trailing keycap (correct).

## Minor Observations

Popover shell chrome differs from Dropdown/Context (out of row-tone scope). `transition-colors` is Operate-scale. `cursor-default` is platform-correct.
