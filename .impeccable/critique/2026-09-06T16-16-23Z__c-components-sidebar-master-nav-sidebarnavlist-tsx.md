---
target: the left navigation spine
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-06T16-16-23Z
slug: c-components-sidebar-master-nav-sidebarnavlist-tsx
---
# CycleForge spine — design critique

Method: dual-agent (A: reviewer · B: scout). Target: `src/components/sidebar/master-nav/SidebarNavList.tsx` (+ SpineSessionHead, MasterNavPinnedCluster). Mode: Operate. Measured live at 1440×900 as the stored admin (4 pins, 8 recents).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Badges are link counts, not work; default state overflows the fold at 900px (917 vs 872, `Catalog` clipped). |
| 2 | Match system / real world | 2 | Four nouns for one thing: New chat / Current session / New conversation / Switch session. Admin's 17 flat rows mix Bose Models with Sync Activity. |
| 3 | User control & freedom | 3 | Inline 12s unpin Undo, persisted folds, drag-resize; but unpin is pointer-drag only. |
| 4 | Consistency & standards | 1 | `⌘N`/`⌘K` painted while pin rows announce `Ctrl+1` (platform-aware) on the same Linux screen; head shows kbd, pins hide theirs in a tooltip. |
| 5 | Error prevention | 3 | 6px distance activation is right for gloved hands; sloppy reorder >8px below shelf silently unpins (Undo mitigates). |
| 6 | Recognition over recall | 2 | ⌘1–9 tooltip-only; drag-to-unpin taught only by the empty-state sentence; pinned rows vanish from Stations/Desks. |
| 7 | Flexibility & efficiency | 3 | Pins + ⌘1–9, ⌘K, resize/collapse, persisted folds. No keyboard reorder/unpin. |
| 8 | Aesthetic & minimalist | 2 | 31 targets folded / 56 expanded; 3 of 5 count badges sit on OPEN sections; head/Recent duplicate the header. |
| 9 | Error recovery | 3 | Inline worded Undo; Loading / No earlier sessions states exist. |
| 10 | Help & documentation | 2 | One empty-state hint; no unpin/reorder affordance after first pin; chords tooltip-only. |
| **Total** | | **24 / 40** | **Competent but unfocused (20–27)** |

## Design Specificity Verdict

**Confirmed: reads as an AI-app sidebar that happens to contain a warehouse.** The top ~40% (rows 1–5 folded, 1–13 expanded) is the ChatGPT/Claude grammar verbatim: New chat → Search → Current session → a row titled "New conversation" → Recent (titles: hello, hello, hello…). The warehouse only begins at Pinned/Stations — and that half IS authored (Arrival · Unbox · Picker · Packing · Scan out; the Stations/Desks split). Two tells: (a) the only numbers painted are LINK counts (Stations 5, Admin 17) where a warehouse navigator's numbers should be WORK (12 to pack, 3 exceptions); (b) nothing says which bench/shift the operator is at — the head names an AI thread instead.

**Deterministic scan (B):** `detect.mjs --json` on both .tsx files → exit 0, `[]`. Explicitly an UNDERCOUNT: the detector routes .tsx through a regex engine only, so `[]` is not a clean pass. Browser overlay unavailable: dev server 307→signin and the auth/DB pool stalled on the stored session (socket hang up) — fallback signal, no live overlay.

## Click-point inventory (live DOM, admin, 1440×900)

**DEFAULT (Recent + Admin folded) — 31 standing targets:** Head 3 (New chat ⌘N · Search ⌘K · Current session) · Recent trigger 1 · Pinned 4 + 1 conditional (Pin-this-page) · Stations trigger + 5 · Desks trigger + 8 · Operations Studio trigger + 2 · Admin trigger 1 · Footer 3 (avatar · ⋯ · Sign out). Column scrolls 45px in this state.

**FULLY EXPANDED — 56 targets:** default 31 + Recent's 8 + Admin's 17. scrollHeight 1709 vs 872 (~2 viewports).

**>4-option decision points:** Desks (8), Stations (5), Recent (8), Admin (17), footer ⋯ (5); 27 simultaneous choices before Admin, 52 expanded.

**Duplication with GlobalHeader (measured):** header Search == spine Search (same event); header Switch-session popover == spine Current session + New chat + Recent. On `/`, 4 spine groups / 12 expanded targets are second doors to controls 40px above.

## Reduction plan (fewer touch/click points)

| # | Merge / remove | Saved (default/expanded) | Cost |
|---|---|---|---|
| R1 | Collapse the 3-row head into ONE: current-session row opens the same SessionSwitcher popover; drop the New chat + Search rows. | −2 / −2 | Pointer New chat → 2 clicks (⌘N unchanged); Search is one header click. |
| R2 | Delete the Recent section (header switcher + ⌘K already hold it). | −1 / −9 | Recents ⌘K-only off `/`. |
| R3 | Paint count badges ONLY while folded (their stated purpose). | −3 visible numbers | None. |
| R4 | Flatten Operations Studio (a disclosure over 2 rows) into 2 loose rows or fold into Desks. | −1 / −1 | Loses one collapsible. |
| R5 | Admin: group 17 into 3–4 labelled sub-runs, or top-5 + "All admin…". | 0 / −12 | One extra click for rare items. |
| R6 | Footer: move Sign out into ⋯; promote Change staff to the standing slot. | −1 / −1 | Sign-out → 2 clicks. |
| R7 | Hover/focus-reveal chevrons on the two always-open shift sections. | −2 glyphs | Minor fold discoverability. |
| R8 | One chord law: use `pinHotkeyLabel` platform logic for ⌘/Ctrl everywhere; either paint faint `<kbd>` on pins too or drop head hints. | 0 | None. |
| R9 | Mark the vacated home section when a row is pinned away (restore spatial memory). | 0 | Slight per-row chrome. |

**After R1+R2+R4+R6: default 31 → 26; with R5, expanded 56 → 31.**

## What's Working

- Current-location system is genuinely solved: 17:1 ink bar + wash, and a folded section owning the current route still shows a `data-owns-current` mark.
- Pointer sensor is 6px DISTANCE not delay (gloved/slow clicks always navigate); dnd `attributes` omitted so SR isn't promised a pickup that doesn't ship.
- Floor vocabulary and the Stations/Desks split are warehouse-authored, not generic.

## Priority Issues

- **[P0] Pins cannot be unpinned/reordered by keyboard (WCAG 2.1.1).** The per-row X and the KeyboardSensor were both removed; the remaining comment still claims "row's own controls" that no longer exist. Fix: ⌘K `Unpin <page>` / `Move pin up/down` and/or a pin-row context menu; keep drag as the pointer path. → `/impeccable harden`
- **[P1] Head/Recent duplicate the header.** 12 of 56 targets are second doors; the AI-chat grammar holds the premium slots. Fix: R1+R2. → `/impeccable distill`
- **[P1] Default state overflows the fold at 900px** (917 vs 872; Catalog clipped) despite a zero-below-fold ratchet. Fix: R1/R2/R4 recover ~100px. → `/impeccable layout`
- **[P1] Platform/label inconsistency.** `⌘N`/`⌘K` painted while `Ctrl+1` announced; chat/session/conversation triad; a live thread titled "New conversation" reads as a second verb under "Current session." Fix: R8 + one noun; AI-summary titles (shipped this session). → `/impeccable clarify`
- **[P2] Count badges on open sections; 2-row disclosure; 17 flat Admin rows.** Fix: R3, R4, R5. → `/impeccable layout`
- **[P2] Pinned rows vanish from Stations/Desks** (Stations shows 5 of 8). Fix: R9.

## Persona Red Flags

- **Floor operator (gloved, bench monitor):** 28px pointer rows (touch-40px only in the mobile drawer); drag is the only unpin path (hostile on a trackball); standing Sign out beside the name on a shared station; a packer sees an AI verb before "Packing"; badges give link counts, not queue depth.
- **Keyboard power user:** no keyboard unpin/reorder (P0); 31 tab stops before content by default; ⌘B toggles the context rail not this nav; chord hints tooltip-only for pins and platform-wrong for the head.

## Minor Observations

- `title="Search (⌘K)"` now duplicates the painted `<kbd>` — one channel is enough.
- A possible green dot beside a hovered/clicked row appears in two screenshots; unconfirmed. If real, it is hue on a column whose law bans hue on ink — worth a 2-minute check.
- Recent shows `hello` ×4 untitled sessions — addressed this session by AI-summary session titling.
