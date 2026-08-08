# Handoff — MasterNav spine: box-to-box padding, section color, repair conflict, motion audit

**For:** the next implementing agent (Grok / Codex / Cursor / Claude Code)
**From:** this session
**Date:** 2026-08-07
**Status:** **Code complete, guards green, `npm run verify` PASSED.** One item left, and it is
not a code item: a live visual/geometry confirmation, blocked the entire session by a dev-server
auth outage that is not this session's to fix.
**Lane:** `main` checkout, no ad-hoc branch. Attach to `:3050` — **never start/restart/kill the dev
server.** **User owns commits — nothing below is committed.**

**Paste for a new session:**

```
Read docs/todo/masternav-spine-color-and-motion-HANDOFF.md and execute §5 first
(the live visual pass), then stop and report.

Everything else in this doc is DONE and UNCOMMITTED — code complete, guards
green, npm run verify PASSED. Do not redo the padding removal, the color
reinstatement, the repair conflict fix, or the guard tests; §1-§4 are a
record of what shipped, not a to-do list.

Attach to :3050; never start/restart/kill the dev server. If §5 also hits
`account signin failed (401): INVALID_CREDENTIALS`, the outage is still live —
report that plainly rather than retrying more than once or trying to sign in
manually.
```

---

## 0. What this session did, in the order it happened

1. Removed every top/bottom margin and padding in the MasterNav spine (`SidebarNavList.tsx`,
   `StaffAccountFooter.tsx`) — rows now sit box-to-box flush, matching the app's own
   flush-square ops chrome, per an explicit user request.
2. User asked how to add color back to the spine, referencing an existing "repair is orange"
   convention. Built an HTML color-validation reference (published as a Claude Artifact) auditing
   every color-per-label system already shipping in this codebase, plus web research on WMS
   color-coding convention, plus the deleted historical `SPINE_SECTION_ACCENTS` map recovered
   from git history.
3. That audit surfaced a real, live inconsistency: **three registries assigned "repair" a color,
   and two disagreed** (`receiving-type-meta.ts` used violet; the functional-hue table /
   `TicketChip` used orange). User directed: resolve to orange, and reinstate spine section color.
4. Shipped: repair → orange; `SPINE_SECTION_ACCENTS` reinstated (9 sections, each own hue);
   `REPAIR_ICON_TINT` gives the Repair *station* its own orange icon distinct from Scan Stations'
   amber section wash; stale rule docs updated; guard tests rewritten to assert the new state.
5. User asked two follow-up design questions (should Scan Stations get per-bench color detail
   beyond Repair's exception; should the selected row pulse for feedback) and asked for a
   `GEMINI-RESEARCH-BRIEFING` doc — written and handed off for external research
   (`docs/todo/masternav-scan-station-detail-and-selection-pulse-GEMINI-RESEARCH-BRIEFING.md`).
6. User pasted back a Gemini Pro research response (after one false start pasting the wrong,
   already-resolved brief's response — caught and corrected before acting on it). The real
   response **ratified the shipped defaults**: no per-bench color beyond Repair's exception, no
   continuous/looping selection pulse, one-shot settle only — plus a responsiveness question about
   `spineActiveWash`'s timing.
7. Executed that ratification as a 5-phase plan: documented both rulings in code, audited and
   documented `spineActiveWash`'s 150ms timing (kept as-is — already well-tuned), and added two new
   regression guards so neither ruling can silently drift back.

**Every step above is done.** This doc exists because the only remaining step —
looking at it — has been blocked all session by an environment issue outside this thread's
control.

---

## 1. Exact file-by-file change list

| File | What changed |
|---|---|
| `src/components/sidebar/master-nav/SidebarNavList.tsx` | Removed all inter-row `mt-*`/`mb-*` margins and the `mb-1`/`mt-0.5` gaps between sections/subgroups; converted `renderChildLikeRow`'s `py-1` padding-derived height to an explicit `h-6` box; added `iconClassOverride?: string` to the child-row + staggered-nest types, wired `REPAIR_ICON_TINT` onto the Repair member only; rewrote three stale docblocks (padding rationale, "neutral" → "colored" accent description, inter-section gap rationale) |
| `src/components/sidebar/master-nav/StaffAccountFooter.tsx` | Footer identity row: `py-0.5` → `h-9` fixed box, no vertical padding |
| `src/lib/nav/spine-section-accent.ts` | Rewrote from the neutral-only shape back to a total `Record<SpineSectionId, SpineAccentClasses>` (`SPINE_SECTION_ACCENTS`) — one hue per section (amber/indigo/green/teal/sky/orange/violet/emerald/cyan); kept `SPINE_NEUTRAL_ACCENT` unchanged for top pins/footer (the 2026-08-03 sunken-wash ladder was NOT reopened); added `REPAIR_ICON_TINT` export; added the ratified "one hue per section, no per-bench" RULE docblock |
| `src/lib/receiving/receiving-type-meta.ts` | REPAIR entry: violet → orange (matches `functional.repair` / `TicketChip`) |
| `src/design-system/foundations/motion-framer.ts` | Documented `spineActiveWash`'s 150ms timing decision (audited, kept as-is) directly on the constant |
| `src/components/sidebar/master-nav/main-nav-groups.guard.test.ts` | Rewrote the two guards that asserted color ABSENCE (now assert every section has a distinct hue, none collide, neutral fallback stays hue-free); added a Repair-tint test; added two NEW tests: exactly one `iconClassOverride:` assignment site exists anywhere in the file, and `spineActiveWash`'s transition/presence blocks never carry `repeat`/`Infinity`/a transform |
| `src/components/sidebar/master-nav/station-nav-groups.guard.test.ts` | Updated the inter-section-gap test to assert absence (was: presence) of the `mt-1` spacing, matching the box-to-box padding removal |
| `.claude/rules/source-of-truth.md` | Rewrote the "MasterNav spine accent" row — was "neutral, must not return"; now documents the reinstated per-section palette, the repair-conflict reasoning, and `REPAIR_ICON_TINT` |
| `.claude/rules/display/workbench-master-detail.md` | Fixed one stale sentence that still said "one NEUTRAL treatment… must not return" |
| `docs/todo/masternav-scan-station-detail-and-selection-pulse-GEMINI-RESEARCH-BRIEFING.md` **(new)** | The research brief — now answered; kept as the paper trail for D1–D4 |

Not touched, on purpose: `src/lib/inventory/serial-status-display.ts` — a *different* violet, meaning "post-sale lifecycle stage" (Returned/RMA/In repair/Repaired share one color as a stage family), not a repair identity color. Changing it would silently split a deliberate grouping; flagged, not fixed.

---

## 2. The two design rulings (Gemini-ratified 2026-08-07)

| # | Ruling | Status |
|---|---|---|
| D1 | Scan Stations stays ONE section hue (amber) + Repair's earned exception — no other bench gets its own color | **RATIFIED, shipped, guarded** |
| D2 | No continuous/looping selection pulse | **RATIFIED, shipped, guarded** |
| D3 | Selection feedback stays a one-shot settle (`spineActiveWash`, already existed) | **RATIFIED — timing audited (150ms, kept as-is), documented** |
| D4 | AA-shade discipline (700 where 600 fails contrast) | **Locked house law, unchanged** |

Full research + citations: `docs/todo/masternav-scan-station-detail-and-selection-pulse-GEMINI-RESEARCH-BRIEFING.md`.
**Do not re-litigate either ruling without new named-product evidence** — that was the explicit
overturn bar Gemini set, not a preference.

---

## 3. Section → hue map (for quick reference, no need to open the file)

| Section | Hue |
|---|---|
| Scan Stations | amber-700 |
| Shipping | indigo-600 |
| Sales | green-700 |
| Inbound | teal-700 |
| Operations | sky-600 |
| Support | orange-700 |
| Sourcing | violet-600 (new — freed by the repair fix) |
| Products | emerald-600 |
| Inventory | cyan-700 |
| **Repair** (station, not section) | **orange-600 icon only** — everything else on that row stays Scan Stations' amber |

---

## 4. Verification already done — do not re-run unless something looks wrong

- `npx tsc --noEmit -p tsconfig.json` — clean
- `npx eslint` on every touched file — clean
- Guard suite (`main-nav-groups.guard.test.ts` + `station-nav-groups.guard.test.ts`) — **55/55 pass**
- `npx tsx --test` on `motion-major.guard.test.ts`, `command-bar-nav-groups.test.ts`,
  `receiving-type-meta.test.ts` — all green (confirms the color/repair change didn't ripple)
- `npm run verify` — **PASSED, matches CI, safe to push** (6414/6414 unit+guard tests, 0 new knip
  findings, lint/typecheck/route-auth/schema all green; the one advisory-only tenancy-isolation
  warning is pre-existing and unrelated)

---

## 5. ⚠️ THE ONE OPEN ITEM — do this first

**Every attempt this session to run `tests/e2e/sidebar-open-close.spec.ts` (or get an
authenticated screenshot in the Browser pane) failed at the exact same step:**

```
[global-setup] USAV session not minted for "Michael" — default/desktop projects will be
unauthenticated (qa-desktop is unaffected). account signin failed (401): INVALID_CREDENTIALS
```

This happened identically across **six separate attempts**, spanning the whole session — it is
not flaky, it is not a stall, it is a live outage on the test account's credentials. Nothing in
this session's changes touches auth, sign-in, or test fixtures.

**What "done" looks like once this is fixed:**

1. `npx playwright test tests/e2e/sidebar-open-close.spec.ts --project=desktop` — all 12 tests
   pass, including the two `MEASURE` geometry tests (floor + ceiling, both should report **0 rows
   below the fold** — the box-to-box padding removal made this comfortably better than the
   previous ratchet budget, not worse; if either reports rows below fold, STOP and report — that
   would mean something regressed).
2. Open the spine, click a colored domain (Sales or Shipping are good picks — distinct hues,
   easy to eyeball against the table in §3) and screenshot it: confirm the active row shows a
   solid hue fill + white text + inset ring, settling once with no residual motion.
3. Open Scan Stations → Receiving and confirm Repair's icon reads distinctly orange against its
   amber siblings (Arrival/Unbox/Local Pickup), which should all read plain amber/muted.
4. Report the screenshot + geometry numbers. That closes this thread out completely.

**Do not** try to fix the credentials yourself, sign in manually, or route around the auth gate —
report the outage if it's still live and stop there, same as every attempt this session.

---

## 6. Out of scope — say no to these

- Re-opening whether the spine should be colored at all, or whether Repair should be orange —
  both were explicit, deliberate user decisions this session, not open questions.
- Giving any bench besides Repair its own hue (D1, ratified).
- Adding any continuous/looping motion to the selected row (D2, ratified).
- Touching `serial-status-display.ts`'s violet post-sale family.
- The unrelated, still-open documentation/code mismatch flagged earlier this session (the
  Scan Stations "collapsible section header" description in an older handoff doesn't match the
  live drill-based code) — noted, not part of this thread, do not conflate the two.
