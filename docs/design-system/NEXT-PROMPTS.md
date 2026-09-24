<!-- Plans J and K appended 2026-09-24 (items approved in the interview but not yet in any prompt). -->
# Next plans — paste-ready prompts (2026-09-24)

Every prompt = **SHARED PREAMBLE** + one **PLAN** block. Run one plan per fresh session in the prod
lane (`~/Projects/cycleforge-lanes/prod`). Order and dependencies are at the bottom.

## SHARED PREAMBLE (paste first, every time)

```text
You are an operations mastermind with 15+ years in ecommerce fulfilment software (WMS, OMS, marketplace ops, POS). You favour floor speed over SaaS polish and one source of truth over local fixes, and you make every change triageable. You ship one page or one seam at a time, prove it on the live app, and never sweep the codebase.

Read first, then act: docs/design-system/BRIEF.md (the law — it beats older LAWS.md / SURFACE_LAW.md text), docs/handoff/HANDOFF-cross-client-outbound-foundation.md ("First-principles implementation method" + "Page protocol" = definition of done), AGENTS.md.

Exists already (uncommitted in this tree — build on it): @cycleforge/design-tokens (packages/design-tokens: colours, state tones, modes industrial/triage/counter/assistant, LIFECYCLE ready RDY · urgent URG · packed PKD purple · outOfStock OOS · shipped SHP green; generated tokens.css / DesignTokens.swift / tokens.json; gates pnpm tokens:build / tokens:check); LIFECYCLE_CLASSES + guard (src/design-system/tokens/lifecycle*.ts); ModeRegion/useMode (src/design-system/providers/ModeRegion.tsx); Tailwind bg-mode-*, text-mode-*, rounded-mode, min-h-mode-hit.

Hard rules: dev origin http://localhost:3050 only (never start next dev / bind ports; lane: systemctl --user status cycleforge-lane@prod). About 250 files are already modified by other work — touch only what your plan needs, never revert or reformat anything else, and do NOT commit (the owner commits). Don't use literal hex/px/tone maps: values come from tokens (node tools/design-mcp/ds.mjs tokens <axis>) and status comes from LIFECYCLE. Fix each bug in the lowest layer that owns it: server = facts, token package = meaning, page = layout. Known unrelated reds (report, don't fix): typecheck src/lib/picking/sessions.ts → missing @/lib/picking/tote-scan; color-neutrals bg-white at KioskHistoryDetail.tsx:145; 2 tests in compound-title-strike.

Starting action: report git status count + pnpm tokens:check + lane status in one line; take BEFORE screenshots (phone 390×844 for /m/*, desk 1440×900) via node -e + require('@playwright/test') from repo root, auth tests/.auth/admin.json (if stale, mint into /tmp like tests/shot.mjs); write a 10-line inventory (literals, page-local status maps, sub-target controls, behaviours to keep). Report one status line after every step. If something won't map cleanly, stop and list it as a numbered decision with a recommended default.

Done means: pnpm tokens:check + pnpm verify:fast pass (except the known reds), plus AFTER screenshots, a behaviour checklist verified on the live page, and a final report (files, what was dropped, open decisions).
```

## PLAN A — Foundation 0: promote the V1 contract into prod (server only; run in parallel with the To ship ledger)

```text
PLAN A — Foundation 0 contract. Prod lacks three of the four slice endpoints; they exist only on branch codex/v1-outbound (worktree ~/Projects/cycleforge-lanes/v1-outbound): src/app/api/developer/qa/capabilities, src/app/api/orders/[id]/acknowledge, src/app/api/v1/outbound/work (+ their domain services). Prod docs/openapi/cycleforge-v1.json has 4 paths; V1 has 23. Promote with history (git checkout/cherry-pick of the reviewed commits, not copy-paste): the three routes + services, scripts/generate-v1-openapi.ts + scripts/verify-v1-openapi.ts (wire the verifier into verify:fast as a gate), the OpenAPI paths for these routes, and the outbound-work fixtures (apps/mobile-ios/Tests/**/outbound-work-*.json → a prod fixtures dir). Use the new-route and org-scope skills for any route you touch: withAuth → permission → Zod → domain → audit, with tenant from ctx and never from the body.
Add deterministic QA-org triage fixtures, one per decision: return package, repair intake, support-ticket package, order missing catalog pairing, order missing label (acknowledge must return 409 NOT_READY), on-hold placeholder SKU with stock.
Then WRITE (don't implement) the narrow /api/v1 desktop adapter contract as a markdown spec: QA-capability-gated, idempotent, tenant + actor from the native principal, returns the outbound-work projection, and no general proxy.
Proof: curl at :3050 (signed-in cookie) showing capabilities → POST /api/orders/add with Idempotency-Key (and a replay returning the same order) → the order in GET /api/v1/outbound/work → acknowledge returning 409 NOT_READY for the label-less order. Include audit event IDs. No UI work.
```

## PLAN B — Mobile triage, page by page (start with /m/scan)

```text
PLAN B — Mobile triage. Triage mode is already declared on /m/scan, /m/exceptions, /m/exceptions/[orderId], /m/on-hold, /m/on-hold/[sku], /m/inbox (ModeRegion mode="triage"). Do ONE page per session, in this order: /m/scan → /m/exceptions (+detail) → /m/on-hold (+merge) → /m/inbox → desk /triage + record rail. The target is BRIEF §4 triage:
- layout: evidence stack (what it is + state code → evidence photos/logs/timeline → decision bar with 2–4 verbs pinned at the bottom);
- geometry: radius 4, 16 px padding on touch, body 16 at line-height 1.45, hit 48 with 8 px gaps;
- decisions: primary decision filled with ink;
- selection: 2 px ink outline (never a coloured outline);
- photos: full-frame evidence photos;
- motion: a ≤120 ms opacity crossfade only.
Known gaps (from the 2026-09-24 screenshots):
- /m/scan: rounded thumbnail placeholders, a green-outlined selected row, no state codes;
- /m/exceptions: industrial rows on a triage page, a pink spine with no code, a truncated "NO SLA ASSIGNED";
- /m/on-hold: pill-shaped raw-blue Merge buttons, an ON HOLD chip outside LIFECYCLE;
- /m/inbox: a raw "support_ticket #450" slug, every row "Handed to you" with no state or decision.
Use the Plan A QA fixtures when they exist. Test on the owner's phone at http://100.72.226.55:3050 (Tailscale) with a QA-org login.
```

## PLAN C — /m/work on the industrial ledger row (after the To ship ledger lands)

```text
PLAN C — /m/work. After the desk To ship ledger (OutboundOrdersLedger) has landed, make /m/work (RedesignedMobileAssignedOrders → MobileToShipQueue → MobileToShipRow → ItemCardRow, tokens item-record-mobile.ts) render the SAME industrial row component in its touch form: 5 pt spine + LIFECYCLE code, 108 pt full-bleed photo, three 36 pt bands, 48 pt targets, bottom sheet for details and exact actions, S/M/L row zoom. Keep one row component with desk and touch geometry from tokens, never a second fork. Keep all /m/work data hooks and tabs. It is also the Android acceptance surface: verify at 390×844 and on the owner's phone.
```

## PLAN D — Pack + scan-out stations (industrial) + the scan-status feedback spot

```text
PLAN D — /pack and /shipping/scan-out. Both are already inside ModeRegion industrial. Apply BRIEF §4 industrial to each page, one per session: #fafafa canvas, white rows, 1 px rules, radius 0, mono uppercase labels, LIFECYCLE codes, no motion. Build the ONE allowed industrial animation: a fixed scan-status spot at a constant position where the eye already is, with success/fail feedback ≤150 ms (motion via src/design-system/motion/framer.ts on web; duration from the mode token `duration-mode-feedback`; reduced motion = instant colour change; plus haptic on handhelds where supported). Reuse the To ship ledger row where the data is an order row. Don't change StationScanBar scan routing (the scan bar is invariant).
```

## PLAN E — Counter (kiosk v2) fix list

```text
PLAN E — Counter. kiosk v2 (/kiosk/v2, KioskShell, src/app/kiosk/kiosk-counter-surface.ts, kiosk-pos-surface.ts, kiosk-chrome.ts) is the counter baseline, already in ModeRegion counter. Promote kiosk-counter-surface.ts values into packages/design-tokens (mode counter) with no visual change, then fix, page by page:
- top-bar controls 36 px → 48 px hit area (icons may stay small);
- favourite star 32 px / select dot 24 px / history edit button 22 px → 48 px hit areas;
- Continue CTA renders ~40 px → 56 px;
- entry fields 14 px text → 16 px (iOS zoom);
- remove tile shadow + hover lift (keep press feedback ~100 ms);
- replace divider lines with gaps;
- replace hard-coded blue-*/amber-* with tokens;
- radius ladder 12 + pill (0 for full-bleed planes).
Primary action + idle screen use the tenant brand (settings.brand.primaryColor, default #1f316d). Add a 200 ms step crossfade (reduced motion: instant). Verify at 1180×820 (iPad landscape) and 390×844, Work / Show / Verify stances.
```

## PLAN F — Assistant queue (one task per session, in order)

```text
PLAN F — Assistant. Assistant mode is mounted on the right-rail assistant occupant and /ai-chat. Do these IN ORDER, one per session:
(F1) One composer: delete the private <textarea> forks in src/components/assistant/AssistantDock.tsx and src/components/ai/AiChatConversation.tsx and route both through StationComposerHost / OmnichannelComposerDock (radius → mode radius 12). Also remove the rail's inner close button (RightRailHost owns the single X), make the transcript flat (user message on #f1f5f9), and drop shadow-sm.
(F2) Pending-jobs button: top-right of GlobalHeader with a count badge. It opens a list, one row per long AI job: name · started by · segmented progress with counts ("1,240 / 5,000") · LIFECYCLE code · time left. Mine / Everyone filter. Needs a server job model — design it with the owner first if none exists (propose it and stop).
(F3) Live AI notifications: a new Activity Inbox kind (ActivityInboxButton / ActivityInboxPopover / /m/inbox) with one line + one suggested action ("Packing is 20% behind pace → Text Maria"). No new feed, no report pages.
(F4) Mobile Assistant tab at /m/assistant (/m/consult stays kiosk counter intake).
Motion: 200 ms fade-rise for messages, 1.2 s thinking pulse, no typing effect, no AI accent colour.
```

## PLAN G — iOS into prod + ToShipRowView (needs owner decision first)

```text
PLAN G — iOS. PRECONDITION: the owner has approved moving apps/mobile-ios into prod (open decision). Promote apps/mobile-ios from codex/v1-outbound into prod with history. Point packages/design-tokens/scripts/generate.ts Swift output directly at the right target inside apps/mobile-ios (lowest target both CycleForgeFloor and CycleForgeClient can import), so tokens:check guards it. Then rewire ToShipRowView.swift + the FloorPalette colours it uses to DesignTokens (Mode.industrial surfaces, Lifecycle codes/tones by meaning), keeping 5 pt spine / 108 pt photo / 3×36 pt bands, and raise PICK + listing buttons from 36 to 48 pt. Map the undocumented spines needsLabel (~#7d8594) and tested (~#0f8f80) to LIFECYCLE or ask. No SSH Xcode builds and no file copies between checkouts: hand off to the owner to build and run on the MacBook / iPhone Air and return the build result + a screenshot.
```

## PLAN H — Desktop: shared ledger package + Tauri bundle + print service

```text
PLAN H — Desktop. Only after the web To ship ledger, /m/work and pack/scan-out are proven. (1) Extract the proven industrial ledger + row into a shared React package (packages/, same wiring as packages/design-tokens) that prod imports with zero visual change (prove with before/after screenshots). (2) apps/desktop-tauri (promote from v1-outbound with history) bundles that package locally. It never loads app.cycleforge.ai. Retire its literal styles.css/handset.css screens. (3) Rust service layer, one service per session: print service first (local queue, printer status, retries, paper-out/offline detection, per-station printer profile, raw ZPL to port 9100 / Windows RAW spooler / CUPS), then scale, offline outbox, station state + keychain (device_store.rs exists), kiosk/auto-start/hotkeys. (4) Capability registry: each action declares requires: ['print.raw'|'scale'|'station']; the web shows "Open in desktop app" (cycleforge://) + a degraded PDF/ZPL download instead of hiding the action. Test every build on Linux WebKitGTK. Verify with pnpm desktop:v1:dev and the desktop package checks.
```

## PLAN I — Cleanup sweep of known leftovers (small, one session)

```text
PLAN I — Leftovers.
(1) StatusBadge draws the "fulfillment" CATEGORY (a channel, not a lifecycle state) with --color-status-shipped, which is now green: give the category its own meaning-mapped colour.
(2) KpiDetailsModal PACK_SCAN is bg-purple-500, the same colour as PACK_COMPLETED: map it through LIFECYCLE or a neutral tone.
(3) Delete the unused stale theme copy src/lib/design/themes/* (confirm zero importers with lsp references first).
(4) Fix the pre-existing reds only if they are one-line and clearly ours to own: the bg-white in KioskHistoryDetail.tsx:145, and investigate the compound-title-strike failure (it fails at HEAD too; report the cause before changing anything).
(5) Remind the owner to apply src/lib/migrations/2026-09-24_retire_placeholder_repair_reasons.sql via /db-migrate (never apply it yourself), then verify "Please wait" / "Skip" are gone from /kiosk/v2 → Repair → Reason for repair.
```

## Order and dependencies

```text
To ship ledger ─┬─> C /m/work ─> D pack + scan-out ─> H desktop
A Foundation 0 ─┘ (parallel; server only; its fixtures feed B)
B mobile triage (independent; one page per session; can start now)
E counter, F assistant, I leftovers — independent, any time
G iOS — after the owner's decision on moving apps/mobile-ios into prod
```

## PLAN J — App zoom per staff (replaces the old density scale)

```text
PLAN J — App zoom. BRIEF §4/§8 approved TWO zoom levels:
- a per-staff APP zoom that scales type, bands, photos and spacing together;
- a per-list ROW zoom S/M/L (the To ship ledger owns that one).
This replaces LAWS U2's compact/default/roomy `--cf-density` multiplier (0.92/1.00/1.14), which industrial must no longer use for spacing ("remove the scaling"). Find how --cf-density / data-density is set today (src/styles/globals.css, staff_preferences, the settings tile) and replace it with one app-zoom preference: steps 90/100/115/130 %, saved in staff_preferences, applied at the root. Touch targets must never go below 48 pt on touch at any step. Every mode must stay usable at 200 % browser zoom. Keep data-density="floor" behaviour (44/48 px control floor) until each station page is ported. Define the SwiftUI mapping (Dynamic Type drives app zoom) in the package docs only; no iOS code. Prove with /m/work and /shipping/orders screenshots at each step.
```

## PLAN K — Laws cleanup + one rule file for CI and design-mcp

```text
PLAN K — Governance.
(1) Old law text still contradicts BRIEF.md. Mark superseded sections in place, don't delete history: add a one-line "Superseded by docs/design-system/BRIEF.md §x (2026-09-24)" note under the conflicting rows (LAWS.md M1, M2, U2, F3, F9; SURFACE_LAW.md:164 if the To ship session has not already amended it; DESIGN_SYSTEM.md zero-radius-everywhere wording vs the 0/4/12+pill ladder; the old "Density modes" mentions). List each change.
(2) BRIEF §9: the deterministic CI gate and the non-blocking design-mcp review must read the SAME rule file. Create one rule source (JSON) holding at least: no hex/rgb literals outside packages/design-tokens and generated files; no page-local packed/shipped tone maps (fold in lifecycle.guard.test.ts logic); no motion duration inside an industrial ModeRegion except the scan-status spot; touch targets ≥48 in /m/*. Wire it into (a) a verify:fast gate and (b) tools/design-mcp (ds_critique reads it via design-mcp.profile.json). Start the gate as a ratchet: record the current count and fail only on increases, so existing pages aren't blocked before their turn.
(3) Extend the literal guard to Swift (`Color(red:` outside DesignTokens.swift) once apps/mobile-ios is in prod (Plan G); until then, just note it.
```

Also (not code — the owner does these): commit the uncommitted design-system work as a checkpoint before starting new sessions; apply the reason-code migration via /db-migrate; decide on moving apps/mobile-ios into prod; read BRIEF.md back section by section (items marked "implicit" still need an explicit yes).
