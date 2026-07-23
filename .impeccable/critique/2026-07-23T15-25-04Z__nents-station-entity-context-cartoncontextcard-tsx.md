---
timestamp: 2026-07-23T15-25-04Z
slug: nents-station-entity-context-cartoncontextcard-tsx
---
---
score: 6
p0: 0
p1: 1
target: src/components/station/entity-context/CartonContextCard.tsx
---

# Critique — Unbox classify pills

## Anti-Patterns Verdict
**Pass** (soft tell: variable-width uppercase pill row).

## Recommendation
Banner: `collapsedFace="icon"` (locked h-8 w-8). Do not min-w lock iconLabel.

## Priority Issues
1. Size-shifting iconLabel chrome on carton bar
2. Banner over-communicates vs Classify tab
3. Hit-box mismatch with HEADER_ICON_WRAP chevron

## Detector
exit 0, [] findings. Browser skipped (auth).
