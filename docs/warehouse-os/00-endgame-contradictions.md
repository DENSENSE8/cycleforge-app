# 00-endgame — the full contradictions appendix

Generated 2026-08-24 by the scope-interview sweep (9 agents over every doc in
`docs/warehouse-os/`, the worktree and main `AGENTS.md`, and `docs/performance/LIGHTHOUSE.md`),
then reviewed. Each row: the contradicted text, verbatim · the decision that
contradicts it (see [`00-endgame.md`](00-endgame.md)) · what it should say now.
**Severity**: `struck` = the ruling is overturned · `amend` = wording/status/scope
now wrong · `note` = real tension to resolve when the file is next opened.
Do not bulk-edit the source docs from this list; schedule them (X3: supersession
is explicit, struck-through with the replacement and a date).

**146 findings** — 37 struck · 58 amend · 51 note.


## docs/warehouse-os/LAWS.md — 43

- **[struck]** `LAWS.md:152` — “**Orchestration is the LAUNCHER, not a second input.**”
  - *Contradicted by D2, D3.* Natural-language orchestration lives in the permanent composer — the one field, a genuine model loop — while the launcher keeps ⌘K as the keyboard index of tools and destinations only.
- **[struck]** `LAWS.md:157` — “Once anything is open it recedes to its rail band.”
  - *Contradicted by D2.* The composer never recedes anywhere — it is permanent and unremovable, and may only shrink to a corner dock (show mode) while the tiling canvas is the screen.
- **[struck]** `LAWS.md:159` — “**offline as a first-class state** rather than an IndexedDB queue draining on reconnect”
  - *Contradicted by D3.* Offline is a non-goal — always-on internet is a hard prerequisite of the composer loop, so this justification is struck from T30's native case (the rest of T30 stands via D4).
- **[struck]** `LAWS.md:159` — “**files** (real paths, direct NAS writes, bulk import/export, label templates, photo capture straight to disk”
  - *Contradicted by D3, D15.* The database is the workplace — files upload into the system and NAS is backup/import-source only, so direct NAS writes and capture-straight-to-disk are struck from T30's native justification.
- **[struck]** `LAWS.md:159` — “**offline as a first-class state** rather than an IndexedDB queue draining on reconnect”
  - *Contradicted by D3.* Offline is a non-goal — always-on internet is a hard prerequisite of the composer's model loop, so this justification bullet is deleted from T30's case for native.
- **[struck]** `LAWS.md:159` — “real paths, direct NAS writes, bulk import/export, label templates, photo capture straight to disk”
  - *Contradicted by D3, D15.* The database is the workplace and files upload into the system — NAS is backup/import-source only, so direct-NAS-writes is deleted from T30's justification (the remaining file arguments must stand without it).
- **[struck]** `LAWS.md:341` — “Payload budgets ratchet down, never up. Fix a regression; do not re-seed around it. | **`TOOLING`** — `npm run perf:budget`”
  - *Contradicted by D4.* The web operator app is dead and bundle budgets are dead as v1 gates — at most the kiosk route and the public GS1 resolvers keep a web-perf budget.
- **[struck]** `LAWS.md:341` — “Payload budgets ratchet down, never up. Fix a regression; do not re-seed around it.”
  - *Contradicted by D4.* The bundle-budget ratchet dies with the web operator app as a v1 gate — web-perf budgets retain meaning only for the kiosk route and the public GS1 resolvers.
- **[amend]** `LAWS.md:64` — “The well's own exception is retired now that it runs flush to the display's own edges (chrome inset, zero padding — see B-section/HANDOFF-ai-centre)”
  - *Contradicted by D2.* The sunken well/feed this justification cites is overturned (tiling canvas is the screen), so the radius-nowhere ruling must stand on its layout-independent grounds (Safari appearance:none) and be re-argued against the canvas.
- **[amend]** `LAWS.md:64` — “`TileBody.tsx`'s prefs radius slider is dead code (unreachable since the Phase 1 canvas deletion), not a live exception”
  - *Contradicted by D2.* The tiling canvas returns, so the slider is no longer safely unreachable — it must be actually removed rather than relied on as dead code.
- **[amend]** `LAWS.md:64` — “The well's own exception is retired now that it runs flush to the display's own edges (chrome inset, zero padding — see B-section/HANDOFF-ai-centre)”
  - *Contradicted by D2.* The well-flush-to-viewport geometry belongs to the overturned AI-centre inversion — with the tiling canvas restored as the screen the chrome/work boundary returns, so the radius-nowhere ruling must be re-justified (or re-examined) against tiles, not the well.
- **[amend]** `LAWS.md:64` — “`TileBody.tsx`'s prefs radius slider is dead code (unreachable since the Phase 1 canvas deletion), not a live exception”
  - *Contradicted by D2.* The canvas deletion is overturned and tiles return, so the slider can no longer be written off as unreachable — it must be removed or explicitly re-ruled.
- **[amend]** `LAWS.md:113` — “Anything with a text input opens as a rail panel, never a dropdown or popover.”
  - *Contradicted by D2, D3.* The law needs an explicit carve-out: the permanent composer is a text-owning surface that lives on the canvas (corner dock in show mode) and never opens as a rail panel, while the barcode-trap rule continues to bind ordinary instruments.
- **[amend]** `LAWS.md:122` — “**Exactly one *armed* scan session per org**, app-wide. | ... **`DB`** — `ux_work_sessions_armed_scan`, partial unique index over the tenant column alone”
  - *Contradicted by D9.* Exactly one armed scan session per STAFF (or per device) — the partial unique index must include the staff/device column, because per-org arming breaks under 8-10 concurrent scanning staff and shared sessions.
- **[amend]** `LAWS.md:122` — “**Exactly one *armed* scan session per org**, app-wide.”
  - *Contradicted by D9.* Exactly one armed scan session per STAFF (or per device) — the partial unique index over the tenant column alone must be rebuilt over (org, staff) or (org, device), because per-org exclusivity breaks under 8-10 concurrent scanning staff and shared sessions.
- **[amend]** `LAWS.md:151` — “and its own rail band at the top of the right rail”
  - *Contradicted by D2.* Agent-as-its-own-scope survives, but the assistant's home is the permanent composer on the canvas (shrinkable to a corner dock), not a right-rail band.
- **[amend]** `LAWS.md:153` — “A queued proposal badges the rail icon.”
  - *Contradicted by D14.* AI proposals ARE queued work orders — one surface with the work-order queue, routed by role subscription and grouped in a triage tile — so the always-legible count belongs on that surface, not the assistant's rail icon.
- **[amend]** `LAWS.md:153` — “**A queued proposal badges the rail icon.** The count must be legible without opening the panel.”
  - *Contradicted by D14, D2.* AI proposals ARE queued work orders in the one role-routed triage tile (the T28 approval queue and the work-order queue are one surface) — the count-visible-without-opening principle survives but must attach to that surface, not an assistant rail icon that no longer exists.
- **[amend]** `LAWS.md:157` — “Once anything is open it recedes to its rail band.”
  - *Contradicted by D2.* The composer is permanent and unremovable — it shrinks at most to a corner dock (show mode), never receding into a rail band; the starts-in-the-canvas half of T15 is revived by the canvas's return.
- **[amend]** `LAWS.md:159` — “an Ollama box on the same machine, with model files measured in GB, pairing with the BYOK chain”
  - *Contradicted by D3, D11.* The v1 AI seam is BYO cloud key via OAuth with always-on internet; the local-model/Ollama path is explicitly later, so it cannot be cited as a v1 justification for native.
- **[amend]** `LAWS.md:164` — “**The assistant is the rail's FIXED HEAD, not a pin.**”
  - *Contradicted by D2.* The unremovable/not-reorderable substance is confirmed, but the fixed placement is the permanent composer (corner-dockable) on the canvas, not the head of the right rail.
- **[amend]** `LAWS.md:203` — “Right: assistant → global tools → session tools.”
  - *Contradicted by D2.* The assistant's home is the permanent composer (corner-dockable in show mode), not a right-rail top band, so the right rail's ordering needs re-ruling.
- **[amend]** `LAWS.md:203` — “Right: assistant → global tools → session tools.”
  - *Contradicted by D2.* The right rail's permanence ordering starts at global tools — the assistant no longer occupies a rail band, since the composer is permanent on the canvas.
- **[amend]** `LAWS.md:259` — “a parked session is resumed from its own block in the well (its "Resume" control) ... the well itself carries the chronology”
  - *Contradicted by D2.* The well/feed no longer exists to carry the chronology, so H1a's session-scoped-recents overrule of H1 must be re-justified (or re-opened) against the tiling canvas, including where a parked session's Resume control now lives.
- **[note]** `LAWS.md:50` — “**Nothing animates geometry.**”
  - *Contradicted by D2.* The law stands, but the returning canvas's Hyprland-style super+drag must be implemented as instant reflow (drag is direct manipulation) — no tweened window moves imported with the style.
- **[note]** `LAWS.md:109` — “it needs a timing-based wedge detector”
  - *Contradicted by D4.* In the installed Electron app raw HID reads the scanner as a device and the timing heuristic is only the fallback for the two surviving browser surfaces (kiosk iPad, basic mobile).
- **[note]** `LAWS.md:125` — “the claim lease exists so *"a lead resumes someone else's parked session."*”
  - *Contradicted by D7, D16.* Pull sovereignty rules that sessions are never switched by anyone but the staffer, and cross-staff continuation is a queued handoff work order (D16), so the lease's stated purpose needs restating.
- **[note]** `LAWS.md:125` — “the claim lease exists so *"a lead resumes someone else's parked session."*”
  - *Contradicted by D7, D16.* Cross-staff continuation happens by handing the session off as a queued work order with urgency markers, not by a lead unilaterally resuming it — sessions are never assigned, interrupted, or switched by anyone but the staffer.
- **[note]** `LAWS.md:129` — “`claim_expires_at` is a lease on who is editing, not a TTL.”
  - *Contradicted by D12, D16.* A singular who-is-editing lease cannot represent v1 session sharing (2+ staff in one session with per-staff attribution) or kiosk sessions that belong to the session rather than a staff member — the lease model needs restating for plural participants.
- **[note]** `LAWS.md:133` — “a parked block collapses to one line (title · state · elapsed) and resumes IN PLACE”
  - *Contradicted by D2, D8.* Blocks now render on the restored canvas rather than the feed, and per D8 the UI twin (`useShell.cutSession` / `SessionBlock.intervals`) must write durable work_sessions/work_session_intervals rows — evaporate-on-refresh is not shippable.
- **[note]** `LAWS.md:133` — “a parked block collapses to one line (title · state · elapsed) and resumes IN PLACE.”
  - *Contradicted by D2.* The interval math and park-on-⌘N semantics stand, but 'in place' was the well of the overturned AI-centre (HANDOFF-ai-centre §2) — where a parked block renders and resumes must be restated for the restored tiling canvas and the corner-docked composer.
- **[note]** `LAWS.md:133` — “the UI twin of `work_session_intervals`”
  - *Contradicted by D8.* Durable sessions are v1 — the shell must actually write work_sessions / work_session_intervals / ops_events at ship, so a client-store twin that evaporates on refresh cannot remain the only implementation.
- **[note]** `LAWS.md:151` — “and its own rail band at the top of the right rail”
  - *Contradicted by D2.* The `agent`-scope-of-one classification survives, but the assistant's placement is the permanent composer on the screen, not (only) a rail band — placement needs re-ruling.
- **[note]** `LAWS.md:152` — “Orchestration is the LAUNCHER, not a second input.”
  - *Contradicted by D2, D3.* The permanent composer is a genuine model loop and the primary orchestration surface; the launcher keeps Ctrl/⌘K as the exact-match index — the fallback direction of this law is inverted.
- **[note]** `LAWS.md:159` — “an Ollama box on the same machine, with model files measured in GB”
  - *Contradicted by D3, D11, D12.* The v1 AI seam is BYO cloud key over always-on internet; the local-model/Ollama path is explicitly later, so it cannot carry weight in the v1 native justification.
- **[note]** `LAWS.md:195` — “Warehouse tablets get the desktop layout and report `(hover: none)`.”
  - *Contradicted by D4, D5.* The shell ships as an installed Electron desktop app and v1 tablets are only the kiosk browser surface (native port later), so the hover-independence argument should no longer be premised on tablets running the desktop web layout.
- **[note]** `LAWS.md:259` — “a parked session is resumed from its own block in the well (its "Resume" control)”
  - *Contradicted by D2.* The session-scoped-recents ruling stands, but its justification leans on the well carrying the chronology — with the feed-as-ground overturned, the Resume path and the session chronology must be re-homed (canvas block or composer dock) and H1a's why restated.
- **[note]** `LAWS.md:286` — “Ably is the realtime transport. Do not build a second one.”
  - *Contradicted by D16.* Kiosk sessions drivable from a desktop "over WebSockets" must ride Ably or this law must be amended — record which, so nobody promotes `ws` into a second transport by accident.
- **[note]** `LAWS.md:286` — “**Ably is the realtime transport. Do not build a second one.**”
  - *Contradicted by D16.* Driving the kiosk from a desktop 'over WebSockets' must either ride Ably or A4 gets an explicit amendment naming the second transport — the ws package must not be quietly promoted.
- **[note]** `LAWS.md:297` — “A procedure is not a new surface.”
  - *Contradicted by D7.* The operation specialist authors SOPs in an "operation studio", so whether authoring stays a Procedures-table tile or becomes a dedicated studio surface needs re-ruling.
- **[note]** `LAWS.md:297` — “**A procedure is not a new surface.**”
  - *Contradicted by D7.* The operation specialist authors SOPs in an 'operation studio' — either the studio is the Procedures-table altitude under an operator name, or P1 must be amended to admit a dedicated authoring surface.
- **[note]** `LAWS.md:358` — “The composer in all four modes (docked · flush · in-cell · expandable). Only docked exists.”
  - *Contradicted by D2.* The open question's mode vocabulary is partly feed-premised ("in-cell"); D2 fixes permanence plus a corner-dock "show mode", so the mode set must be re-enumerated against the restored canvas.
- **[note]** `LAWS.md:358` — “The composer in all four modes (docked · flush · in-cell · expandable). Only docked exists.”
  - *Contradicted by D2, D12.* This open question is now partly ruled: the composer is permanent and unremovable with a corner-dock 'show mode' (whose polish may slip) — O6 should be re-scoped to whatever mode questions remain under the restored canvas.

## docs/warehouse-os/HANDOFF-ai-centre.md — 18

- **[struck]** `HANDOFF-ai-centre.md:10` — “the screen is no longer built from a tiles perspective at all”
  - *Contradicted by D2.* The 2026-08-24 ruling reinstates the tiles perspective: the tiling canvas is the screen, with Hyprland-style super+drag window moves.
- **[struck]** `HANDOFF-ai-centre.md:19` — “Not a tile that shows the assistant — the assistant IS the surface.”
  - *Contradicted by D2.* The centre is data, not the feed: the assistant is a permanent, unremovable composer that may shrink to a corner dock (show mode), not the surface itself.
- **[struck]** `HANDOFF-ai-centre.md:24` — “The conversation is the workspace, and work renders as blocks of time inside it — never as pages.”
  - *Contradicted by D2, D8.* The tiling canvas is the workspace; sessions survive as durable event capture (work_sessions/intervals/ops_events), not as the feed-chronology that organizes the screen.
- **[struck]** `HANDOFF-ai-centre.md:61` — “**always mounted, always the AI**. It never unmounts, never yields the centre to a tile, never navigates away”
  - *Contradicted by D2.* The feed does yield the centre — the canvas is the screen; only the composer is permanent, and it may shrink to a corner dock.
- **[struck]** `HANDOFF-ai-centre.md:70` — “The canvas/tile layer is **not the screen anymore**.”
  - *Contradicted by D2.* The canvas/tile layer IS the screen again; tiles are legitimate surfaces (the '976px block is a tile wearing a block's name' ban falls with it).
- **[struck]** `HANDOFF-ai-centre.md:137` — “The feed — THE SURFACE (inverted 2026-08-23) | **permanent centre** inside the sunken well”
  - *Contradicted by D2.* Accurate as a record of the 08-23 tree, but the inversion it asserts was overturned 2026-08-24 — the canvas returns as the screen and this row's status claim is void.
- **[struck]** `HANDOFF-ai-centre.md:151` — “**The inversion.** The feed becomes the permanent centre — sunken well, no tile chrome, no backdrop; canvas demoted out of the default screen”
  - *Contradicted by D2.* Phase 1's direction is reversed: the canvas is re-promoted to the default screen and the feed-as-permanent-centre work is superseded (the done-record stands as history).
- **[struck]** `HANDOFF-ai-centre.md:162` — “`Canvas.tsx` deleted; split (⌘\ and the context-menu item) died with the canvas.”
  - *Contradicted by D2.* The canvas (and window-splitting/moving, now Hyprland-style super+drag) must come back — the deletion is to be reversed, not carried forward.
- **[struck]** `HANDOFF-ai-centre.md:218` — “Ruling: **the well carries the chronology, not the database.**”
  - *Contradicted by D2.* Overturned: the centre is data — a summoned queue may render as a full table in a canvas window; the measured column floors survive only as window min-width facts.
- **[struck]** `HANDOFF-ai-centre.md:274` — “The well never yields the **centre** (geometry).”
  - *Contradicted by D2.* The well does yield the centre: the tiling canvas holds the geometry and the composer may dock to a corner in show mode.
- **[amend]** `HANDOFF-ai-centre.md:39` — “The order's block renders **immediately, in the feed**”
  - *Contradicted by D2.* The order renders as a window/tile on the canvas (detail no longer confined to the right panel); the one-composer, no-navigation spirit of the scenario stands.
- **[amend]** `HANDOFF-ai-centre.md:53` — “That is the whole product.”
  - *Contradicted by D1.* The v1 product is the location/provenance spine (scan any QR -> where it is, where it came from, what's been pulled), and this phone-call scenario is one secondary test of the shell, not the whole product.
- **[amend]** `HANDOFF-ai-centre.md:188` — “5. **AI-proposed keybinds.** The proposal loop, gated writes into keybinding overrides”
  - *Contradicted by D12.* AI-proposed keybinds are explicitly 'slipped without pain' — this drops out of the in-scope order of work to post-v1 (the T28-queued mechanism itself stays ruled).
- **[amend]** `HANDOFF-ai-centre.md:196` — “**S1/S2/S3** — one armed scan session (DB), parking is a work event and is lossless. ⌘N leans on this; never weaken it to make the demo smoother.”
  - *Contradicted by D9, D12.* S1's org-wide armed-unique breaks under 8-10 concurrent scanning staff and shared sessions — it must be amended to per-staff (or per-device) uniqueness; S2/S3 lossless parking stand.
- **[amend]** `HANDOFF-ai-centre.md:227` — “the manager replay and settings: both are blocks or right-panel detail under this model”
  - *Contradicted by D2.* The 'always display the AI' premise is gone — replay and settings may be windows on the canvas; the fight's resolution is void.
- **[amend]** `HANDOFF-ai-centre.md:244` — “the manual settings surface is right-panel detail. The well never unmounts.”
  - *Contradicted by D2.* The composer never unmounts (that part survives), but the well is no longer the permanent centre and settings need not live only in the right panel.
- **[note]** `HANDOFF-ai-centre.md:110` — “*Create ticket*, *Print label*, *Send to seller* — never a generic Send”
  - *Contradicted by D10, D11.* The morphing-button ruling stands, but 'Send to seller' has no v1 pipe (eBay/Amazon are order READS; customer messaging is draft-only with no send pipe) — the verb becomes 'File claim' as a queued draft the unboxer approves.
- **[note]** `HANDOFF-ai-centre.md:181` — “`SessionBlock.intervals` is the UI twin of `work_session_intervals`”
  - *Contradicted by D8.* A client-state twin in useShell.ts is not enough at ship — sessions must be raw durable event capture written by the shell (work_sessions/work_session_intervals/ops_events); evaporate-on-refresh is unacceptable.

## docs/warehouse-os/HANDOFF-ai-first.md — 13

- **[struck]** `HANDOFF-ai-first.md:168` — “8. Direct NAS writes from the local process.”
  - *Contradicted by D3, D15.* Struck: the database is the workplace — files upload into the system and the NAS is backup/import-source only, so N2's direct-NAS-writes (and step 9's photo capture straight to disk) are not the plan.
- **[struck]** `HANDOFF-ai-first.md:171` — “10. **Offline becomes a state, not a queue.**”
  - *Contradicted by D3.* Struck: always-on internet is a hard prerequisite and offline is a non-goal — offline-as-first-class-state is off the plan.
- **[struck]** `HANDOFF-ai-first.md:272` — “**Files.** Real paths. Direct NAS writes, bulk import/export, label templates, photo capture straight to disk.”
  - *Contradicted by D15, D3.* Struck: files upload into the system, the database is the workplace, and the NAS is backup/import-source only — T30's files bullet loses its direct-NAS/disk justification.
- **[struck]** `HANDOFF-ai-first.md:279` — “**Offline** is a first-class state, not an IndexedDB queue draining on reconnect”
  - *Contradicted by D3.* Struck: offline is a non-goal and always-on internet is a hard prerequisite — this T30 justification is removed.
- **[amend]** `HANDOFF-ai-first.md:10` — “Everything else is inline. There are no pages to navigate to.”
  - *Contradicted by D2.* 'No pages' survives, but everything else is now a window/tile on the tiling canvas rather than inline in a conversation (same amendment applies to line 27's 'Everything lands inline or in the right panel').
- **[amend]** `HANDOFF-ai-first.md:145` — “Under **T31** the answer is: the GS1 resolvers (`/01`, `/414`, `/l`, `/p`, `/s`, `/q`) and nothing else.”
  - *Contradicted by D4.* The web build keeps three surfaces, not one: the GS1 resolvers, the front-desk iPad kiosk browser, and the basic mobile-browser surface (photos, arrival scans, put-away double-scan, session switch/share, composer chat).
- **[amend]** `HANDOFF-ai-first.md:200` — “One field, docked to the **bottom of the screen**, never unmounted, never moved by content above it.”
  - *Contradicted by D2.* One field and permanence survive, but the composer may shrink to a corner dock in show mode — fixed bottom-of-screen geometry is no longer absolute.
- **[amend]** `HANDOFF-ai-first.md:262` — “The application is installed and owns the filesystem, the input stack and the model.”
  - *Contradicted by D3, D11, D15.* Native-installed stands, and it owns the input stack — but the model is a cloud loop (BYO key; local later) and files live in the database, not an app-owned filesystem/NAS.
- **[amend]** `HANDOFF-ai-first.md:276` — “**Model.** Ollama on the same box.”
  - *Contradicted by D11, D12.* The v1 AI seam is BYO cloud key via OAuth; the Ollama/local-model path is explicitly later, so this bullet and phase N3 (lines 175-179) drop out of the v1 order of work.
- **[amend]** `HANDOFF-ai-first.md:339` — “The single carve-out is **T31**, the sticker resolvers.”
  - *Contradicted by D4.* There are three web carve-outs, not one: the T31 resolvers (which stand forever), the front-desk iPad kiosk browser, and the basic mobile-browser surface.
- **[note]** `HANDOFF-ai-first.md:14` — “**Language is the on-ramp. The keybind is the destination.**”
  - *Contradicted by D3.* Worth recording that the composer is a genuine model loop with up to 3s per utterance accepted, not a command palette to be escaped — keybinds accelerate it but do not replace the loop.
- **[note]** `HANDOFF-ai-first.md:206` — “"Send to seller" — never a generic "Send"”
  - *Resolved by the 2026-09-26 AI-first ruling.* The morph ruling stands; `send` mode ships — customer and seller messages are approval-first sends through the platform send pipe, auto-approve eligible.
- **[note]** `HANDOFF-ai-first.md:256` — “that rate is the input to widening a kind's trust class, so the model **earns** autonomy from evidence”
  - *Confirmed by the 2026-09-26 AI-first ruling.* Every kind — including location moves, listing edits and refunds — is approval-first with a per-automation auto-approve setting; acceptance rate is the evidence shown when the operator enables auto-approve.

## docs/warehouse-os/HANDOFF-kimi-ux.md — 10

- **[struck]** `HANDOFF-kimi-ux.md:539` — “Offline matters: this warehouse loses connectivity.”
  - *Contradicted by D3.* Always-on internet is a hard prerequisite and offline is a non-goal — design connectivity loss as a blocking error state, not a supported working state to specify.
- **[amend]** `HANDOFF-kimi-ux.md:29` — “**Cycle Forge** is multi-tenant SaaS for **reseller operations**”
  - *Contradicted by D6, D4.* v1 is a single-tenant, installed (Electron-delivered) warehouse OS for the operator's own company — 'B2B' is retracted, org-to-org linkage is an explicitly deferred later plan, and tenancy scaffolding is kept only as insurance.
- **[amend]** `HANDOFF-kimi-ux.md:40` — “**Manager / owner** | Anywhere, including phone | Reads throughput, checks who did what, unblocks”
  - *Contradicted by D12, D5, D4.* CEO mission control is deliberately the first post-v1 build, and the v1 mobile-browser surface covers only unbox photos, arrival scans, put-away double-scan, session switch/share, and composer chat — not manager throughput reads on a phone.
- **[amend]** `HANDOFF-kimi-ux.md:71` — “a panel opened by hotkey or by an assistant **cannot** trigger the pairing dialog, because the browser's user-activation does not survive a programmatic open”
  - *Contradicted by D4.* Under Electron delivery the shell has native device access, so the browser user-activation constraint binds only the kiosk browser surface, not the operator app.
- **[amend]** `HANDOFF-kimi-ux.md:152` — “Exactly one scan session is armed at a time, application-wide.”
  - *Contradicted by D9.* Exactly one armed scan session per staffer (or per device); the application-wide singleton breaks under 8-10 concurrent scanning staff and shared sessions.
- **[amend]** `HANDOFF-kimi-ux.md:448` — “The internal-versus-public control's failure mode is emailing a customer a note meant to be private.”
  - *Contradicted by D10.* The system holds no customer send pipe — customer messages are draft-only and a human copy-pastes them into Outlook or the platform — so the failure mode is a mislabeled draft handed to a human, never an auto-sent email.
- **[amend]** `HANDOFF-kimi-ux.md:504` — “Exactly one scan session is armed application-wide.”
  - *Contradicted by D9.* A scan must never be stolen within a staffer's shell: exactly one armed scan session per staff (or device), not application-wide.
- **[note]** `HANDOFF-kimi-ux.md:31` — “receiving cartons off a truck, unboxing them, testing units, grading condition, packing, shipping, handling returns and warranty claims”
  - *Contradicted by D1, ALSO (business-model correction).* The flow centres on purchased used/refurb electronics (Goodwill, eBay sellers, AliExpress) verified against listings, seller claims on mismatch, QC bounce-backs to the unboxer, and disassembly into parts-only bins — bins being first-class scannable objects in the location/provenance spine.
- **[note]** `HANDOFF-kimi-ux.md:34` — “Who is on the screen, and where:”
  - *Contradicted by D7, D6.* The roster is 8-10 multi-role staff across eleven roles — including remote/overseas staff, the accountant, an operation specialist, customer support, and a front-desk kiosk — several of whom are real v1 users who never stand at a bench.
- **[note]** `HANDOFF-kimi-ux.md:62` — “Warehouse tablets receive the desktop layout, not a mobile one.”
  - *Contradicted by D4.* Staff run an installed Electron app; the surviving browser tablet is the front-desk kiosk iPad, so the hover/coarse-pointer constraint stands on the kiosk, not on floor tablets loading the operator web app.

## docs/warehouse-os/HANDOFF-sessions.md — 10

- **[struck]** `HANDOFF-sessions.md:229` — “Offline is a first-class path, not an error.”
  - *Contradicted by D3.* Always-on internet is a hard prerequisite and offline is a non-goal; keep fail-open idempotent retries for transient blips, but do not build offline-first queue-and-drain machinery for session writes.
- **[amend]** `HANDOFF-sessions.md:64` — “UNIQUE partial index on `(organization_id) WHERE kind='scan' AND armed=true`”
  - *Contradicted by D9.* The armed-uniqueness index must be keyed per staff (or per device) within the org — the org-only key breaks under 8-10 concurrent scanning staff and shared sessions.
- **[amend]** `HANDOFF-sessions.md:67` — “Exactly one armed scan session per org is a database guarantee, not application logic”
  - *Contradicted by D9.* Keep the DB-level guarantee but restate it as exactly one armed scan session per staffer (or device); per-org scope is overturned.
- **[amend]** `HANDOFF-sessions.md:96` — “arming one disarms every other in the org, in the same transaction”
  - *Contradicted by D9.* Arming disarms only that staffer's (or device's) other scan sessions; another staffer's armed session is untouched.
- **[amend]** `HANDOFF-sessions.md:294` — “at most one open interval per session — `UNIQUE (session_id) WHERE ended_at IS NULL`”
  - *Contradicted by D12.* Shared sessions (2+ staff working one session concurrently with per-staff attribution) require one open interval per (session, staff) or a membership model, not one per session.
- **[amend]** `HANDOFF-sessions.md:369` — “arming a second scan session disarms the first *(already covered — keep it passing)*”
  - *Contradicted by D9.* The test must change with the amended law: a staffer arming a second session disarms their own first, and a different staffer's armed session stays armed — the org-wide disarm behavior may not be kept passing.
- **[amend]** `HANDOFF-sessions.md:390` — “an offline scan queues and drains correctly on reconnect”
  - *Contradicted by D3.* Shrink this requirement to idempotent retry on transient failure; the offline scan-queue-drain scenario is a non-goal.
- **[note]** `HANDOFF-sessions.md:76` — “SCAN_SESSION_TYPES = ['unbox', 'triage', 'pickup', 'test', 'pack', 'outbound']”
  - *Contradicted by D1, D13.* The v1 spine and the ship-gate shift centre on arrival scans and put-away double-scans, which have no scan-session type in this closed set — the vocabulary needs receive/put-away entries.
- **[note]** `HANDOFF-sessions.md:101` — “Nothing yet answers the three questions the operator actually asked.”
  - *Contradicted by D1.* The operator's primary v1 ask is now the location/provenance spine (scan any QR -> location and history); attribution feeds that spine, while duration/gap analytics and rollups are secondary.
- **[note]** `HANDOFF-sessions.md:300` — “a lead can resume someone else's parked session”
  - *Contradicted by D7, D16.* Sessions are never switched by anyone but the staffer; cross-staff continuation happens by handing the session off as a queued work order (with urgency markers) or via shared-session membership, not by a lead grabbing it.

## docs/performance/LIGHTHOUSE.md — 10

- **[struck]** `LIGHTHOUSE.md:9` — “The goal is 90 in every category on every route.”
  - *Contradicted by D4.* The goal applies only to the web surfaces that survive D4 — the kiosk route(s) and the public GS1 resolvers — because every other route ships inside the Electron app.
- **[struck]** `LIGHTHOUSE.md:23` — “It is **one** problem: the data-heavy workbenches (`/dashboard`, `/unbox`, `/triage`, `/search`, `/test`) ... Streaming that first payload server-side is the single lever that moves all five.”
  - *Contradicted by D4.* These five workbenches are Electron-delivered, not web-audited surfaces, so the streaming-first-payload lever is no longer a v1 program at all.
- **[struck]** `LIGHTHOUSE.md:52` — “Tier 1 = operator-critical floors (`/signin`, `/dashboard`, `/receiving`, `/triage`, `/packer`, `/tech`, `/search`, `/m/receive`, `/m/scan`, `/m/home`).”
  - *Contradicted by D4.* None of these routes are gated web surfaces any more; the tiering should be rebuilt around the kiosk route(s) and public resolvers, with the mobile-basic surface ungated, and the Tier-3 caveat about not chasing scores versus "Tier-1 floors" retargeted accordingly.
- **[struck]** `LIGHTHOUSE.md:116` — “A preview deployment has the database next to the server and is the honest environment for anything LCP-shaped.”
  - *Contradicted by D4.* The Vercel deploy is dead as a v1 concern, so the whole "Auditing a Vercel preview (and why you should)" section (including `npx vercel deploy --yes` and the bypass-secret workflow) no longer describes a sanctioned measurement path.
- **[struck]** `LIGHTHOUSE.md:181` — “A route with no baseline entry now fails too: an unpinned surface is a coverage hole, not a pass.”
  - *Contradicted by D4.* This inverts under D4 — most routes should carry no baseline because they are not web surfaces; only kiosk and resolver routes need floors, and an unpinned Electron-delivered route is correct, not a coverage hole.
- **[struck]** `LIGHTHOUSE.md:187` — “## CI (`.github/workflows/performance.yml`) ... `bundle-budget` | every PR + push to main | one build | per-route First Load JS vs `bundle-budget.json`”
  - *Contradicted by D4.* The continuous perf gates are dead as v1 gates, and the section is doubly stale because commit 2f6dcd784 already removed all GitHub Actions workflows, so `performance.yml` (and its `PERF_DATABASE_URL` / `update_baseline` dispatch instructions) no longer exists.
- **[amend]** `LIGHTHOUSE.md:18` — “SEO | ≥ 90 public routes (`/signin`, `/signup`, `/share/photos/*`)”
  - *Contradicted by D4.* `/signin` and `/signup` are dead web surfaces (staff authenticate in the Electron app); the SEO target should name only the public GS1 resolvers (T31) and any surviving public share pages.
- **[amend]** `LIGHTHOUSE.md:33` — “the dense sheet/grid workbenches run on workstations on the warehouse LAN ... Scoring a desk workbench as a budget phone on simulated slow-4G measures a scenario that never happens.”
  - *Contradicted by D4.* The deeper version is now true: the desk workbenches run in the installed Electron app, so web-Lighthouse-auditing them under any profile measures a scenario that never happens.
- **[amend]** `LIGHTHOUSE.md:104` — “`/kiosk` and `/kiosk/v2` are Tier-2 desktop (tablet landscape).”
  - *Contradicted by D4.* The kiosk is now one of only two web surfaces where performance carries any meaning, so its ungated Tier-2 status undersells it — it should hold the top web-perf floor.
- **[note]** `LIGHTHOUSE.md:165` — “`/m/*` ships ~848KB across ~60 chunks; until that number moves, the mobile routes cannot score above the low 70s”
  - *Contradicted by D4, D5.* The mobile-basic browser surface survives but its Lighthouse score is not a gate and the native mobile app comes after desktop v1, so this reads as a pending bundle hunt that should not be resumed.

## AGENTS.md — 8

- **[struck]** `AGENTS.md:62` — “Target: Lighthouse ≥ 90 in every category, every route.”
  - *Contradicted by D4.* Web-perf targets survive only for the front-desk kiosk route and the public GS1 resolvers; delivery is an installed Electron app, so the every-route Lighthouse program is no longer a v1 gate.
- **[struck]** `AGENTS.md:69` — “Streaming that first payload server-side moves all five.”
  - *Contradicted by D4.* The workbench LCP hunt (/dashboard, /unbox, /triage, /search, /test) is retired — those surfaces ship inside Electron, not as web routes, so streaming their first payload is no longer a v1 objective.
- **[struck]** `AGENTS.md:72` — “Payload budgets ratchet down, never up.”
  - *Contradicted by D4.* Bundle budgets are dead as v1 gates; if kept at all, bundle-budget.json binds only the kiosk route and the resolvers.
- **[struck]** `AGENTS.md:74` — “Target: Lighthouse ≥ 90 in every category, every route.”
  - *Contradicted by D4.* The web operator app is dead; Lighthouse targets survive only for the kiosk route(s) and the public GS1 resolvers, not "every route".
- **[struck]** `AGENTS.md:78` — “the data-heavy workbenches (`/dashboard`, `/unbox`, `/triage`, `/search`, `/test`) render a shell, hydrate, and only then fetch their first collection, so LCP waits on a post-hydration round trip. Streaming that first payload server-side moves all five.”
  - *Contradicted by D4.* The LCP hunt on the desk workbenches is dead as a v1 gate — those surfaces ship in the installed Electron app, so this diagnosis and its "single lever" no longer drive any work.
- **[struck]** `AGENTS.md:84` — “Payload budgets ratchet down, never up. `bundle-budget.json` holds the per-route First Load JS ceiling; `npm run perf:budget` checks a build log against it. Fix a regression, don't re-seed around it.”
  - *Contradicted by D4.* Per-route bundle budgets are no longer a v1 gate; at most the kiosk route and resolvers keep a budget, and the ratchet-never-up rule applies only there if kept at all.
- **[amend]** `AGENTS.md:76` — “Desk workbenches are `desktop` (LAN workstation), `/m/*` is `mobile`, `/kiosk*` is a mounted tablet. Do not repin a route to make a number move.”
  - *Contradicted by D4.* The ROUTES manifest shrinks to the kiosk route and the resolvers; desk-workbench rows describe surfaces that now ship in Electron and no longer gate anything.
- **[amend]** `AGENTS.md:87` — “`formFactor` in the `ROUTES` manifest is a claim about hardware ... Desk workbenches are `desktop` (LAN workstation), `/m/*` is `mobile`, `/kiosk*` is a mounted tablet. Do not repin a route to make a number move.”
  - *Contradicted by D4, D5.* The ROUTES manifest is dead as a v1 gate and should shrink to the surviving web surfaces (kiosk = mounted tablet, mobile-basic browser surface, public resolvers); the hardware-claim principle survives only for those.

## docs/warehouse-os/HANDOFF-ux-ui.md — 7

- **[amend]** `HANDOFF-ux-ui.md:446` — “Exactly one scan session armed app-wide at a time”
  - *Contradicted by D9.* Arming is per staff (or per device): the org-wide singleton breaks under 8-10 concurrent scanning staff and shared sessions, and the law is to be amended accordingly.
- **[amend]** `HANDOFF-ux-ui.md:468` — “exactly 1 per org, from any code path, forever | `ux_work_sessions_armed_scan` — a partial unique index over the tenant column alone”
  - *Contradicted by D9.* The partial unique index must be re-keyed per staff (or per device), not over the tenant column alone — 'forever' is withdrawn.
- **[note]** `HANDOFF-ux-ui.md:409` — “Warehouse tablets get the desktop layout.”
  - *Contradicted by D4.* Staff run an installed Electron app; the surviving browser tablet is the front-desk kiosk iPad, so the no-hover-only rule now rests on the kiosk and gloves, not on floor tablets receiving the desktop web layout.
- **[note]** `HANDOFF-ux-ui.md:530` — “free `ux_work_sessions_armed_scan` — an unarmed window is a race for any other shell waiting to arm”
  - *Contradicted by D9.* Under per-staff arming no other staffer's shell contends for this slot, so this supporting argument dissolves even though the searching-does-not-park conclusion still stands.
- **[note]** `HANDOFF-ux-ui.md:595` — “Do NOT build a websocket”
  - *Contradicted by D16.* Kiosk sessions are now specified as drivable from a desktop over WebSockets, so this rule needs either the kiosk-driving path to ride Ably or an explicit carve-out.
- **[note]** `HANDOFF-ux-ui.md:648` — “The manager surface — per staff, two table tiles”
  - *Contradicted by D1, D12.* This staff-activity/replay surface is CEO mission-control territory, now explicitly the first post-v1 build over settled data and secondary to the location/provenance spine — keep the design, restate the sequencing.
- **[note]** `HANDOFF-ux-ui.md:914` — “The composer in all four modes (docked · flush · in-cell · expandable) — only docked exists”
  - *Contradicted by D2, D3.* The still-to-design list must absorb the ruled shell-composer facts: permanent and unremovable, a genuine model loop (≤3s per utterance, internet-required), and shrinkable to a corner dock ('show mode') — not only a text-entry face.

## docs/warehouse-os/HANDOFF-phases-4-9.md — 7

- **[amend]** `HANDOFF-phases-4-9.md:15` — “That is the plan of record and it is accurate”
  - *Contradicted by D2, D3, D4, D9.* The 2026-08-24 operator decision set is now the plan of record; docs/warehouse-os/ must be read through it and yields wherever they conflict.
- **[amend]** `HANDOFF-phases-4-9.md:40` — “Exactly one scan session is armed app-wide at a time.”
  - *Contradicted by D9.* Exactly one armed scan session per staffer (or device) — the app-wide/org-wide scope was relitigated and amended by the operator on 2026-08-24, so this bullet may no longer be listed as unrelitigable law.
- **[amend]** `HANDOFF-phases-4-9.md:191` — “"One composer" still fans out to an external provider for tickets.”
  - *Contradicted by D10, D11.* Ticket replies are draft-only: the composer produces a draft the human pastes into Zendesk; the system sends nothing to customers, so there is no send fan-out to the provider.
- **[note]** `HANDOFF-phases-4-9.md:105` — “warehouse tablets get the *desktop* shell”
  - *Contradicted by D4.* Under Electron-first delivery, floor tablets get the kiosk browser or the basic mobile-browser surface rather than the desktop web shell; the click-toggle-not-hover ruling still stands on its other three legs.
- **[note]** `HANDOFF-phases-4-9.md:183` — “the failure mode is emailing a customer a note meant to be private”
  - *Contradicted by D10.* The system holds no customer send pipe — customer messages are draft-only and a human copy-pastes them into Outlook/the platform — so the visibility fork's failure mode becomes leaking a private note into an outbound draft, not sending an email.
- **[note]** `HANDOFF-phases-4-9.md:206` — “Build the Process tool: list this session's actions, undo/delete.”
  - *Contradicted by D10, D1.* Exclude location records from undo/inverse-writes — a location is a fact created by a scan and only a scan, so a mistaken move is corrected by re-scan or a queued reconciliation check, never by an inverse write.
- **[note]** `HANDOFF-phases-4-9.md:226` — “`start_session`, `focus_session`, `set_layout`, `split_pane`”
  - *Contradicted by D7.* start_session/focus_session may fire only as the staffer's own composer request — sessions are never started, switched, or interrupted by anyone but the staffer, so the AI queues work orders instead of driving sessions autonomously.

## docs/warehouse-os/02-target-architecture.md — 6

- **[amend]** `02-target-architecture.md:24` — “kind: 'scan'   → has scanType.  EXACTLY ONE armed at a time, app-wide.”
  - *Contradicted by D9.* Exactly one armed scan session per staffer (or per device) — app-wide/org-wide single-arming breaks under 8-10 concurrent scanning staff and shared sessions, and the downstream wedge-routing paragraph must be read per-device.
- **[amend]** `02-target-architecture.md:159` — “armed               BOOLEAN                -- partial unique index: one armed scan per org”
  - *Contradicted by D9.* The partial unique index must be per (organization_id, staff_id) or per device — an index over the tenant column alone allows only one scanning staffer in the whole company.
- **[note]** `02-target-architecture.md:8` — “Four independent object types. **Nothing owns anything else.**”
  - *Contradicted by D1.* The core-object census should add the v1 capstone object — the location/provenance record (scan any QR -> where it is, where it came from, what has been pulled from it) — as first-class alongside Session/Table/Tool/Tab, since that spine, not session machinery, is the v1 product.
- **[note]** `02-target-architecture.md:12` — “a scan session also carries a `scanType` (Unbox, Arrival, Testing, Packing, Pickup, Triage)”
  - *Contradicted by D1, D13.* The closed scanType list must include put-away — the double-scan that pairs a QR to a location is the scan that creates the capstone fact and is a named step of the D13 full-shift ship gate, yet no session type covers it.
- **[note]** `02-target-architecture.md:67` — “the universal input: **scan ⇄ search ⇄ preview**, mode-switched, collapsed by default, detail on hover”
  - *Contradicted by D2, D3.* The one surviving field is a permanent, unremovable composer running a genuine model loop (<=3s per utterance, may shrink to a corner dock in show mode), so the mode set must include the composer and the default posture is permanent-docked, not a collapsed scan/search palette.
- **[note]** `02-target-architecture.md:164` — “claimed_by_staff_id / claim_expires_at     -- lease, for park/resume + co-editing”
  - *Contradicted by D12.* A single-holder lease covers park/resume but cannot represent shared sessions (2+ staff in one session with per-staff attribution, in the 90-day scope), which need a membership/attribution model rather than one claimant slot.

## docs/warehouse-os/07-configurability.md — 4

- **[amend]** `07-configurability.md:122` — “exactly one armed session owns the wedge (S1/S2)”
  - *Contradicted by D9.* The invariant is per staffer/device — each operator's wedge is owned by their one armed session — and the citation of org-wide S1 is stale pending its amendment.
- **[amend]** `07-configurability.md:174` — “wider than both machines this app ships on”
  - *Contradicted by D4.* Delivery is now an installed Electron app for every staff role including remote/overseas staff and the accountant, so the shipped-viewport set is the whole fleet and the floor arithmetic must be stated per-viewport rather than proven against two machines.
- **[note]** `07-configurability.md:312` — “an API outage cannot stop the warehouse”
  - *Contradicted by D3.* Always-on internet is a hard prerequisite and offline is a non-goal, so the boundary should rest on latency alone — the scan path never waits on a model round-trip — not on outage-resilience as a design justification.
- **[note]** `07-configurability.md:550` — “the frame button is what makes the switcher reachable on kiosk/tablet, where there is no ⌘K to press”
  - *Contradicted by D4, D16.* The kiosk is a front-desk web surface whose sessions belong to the session (not a staff member) and are drivable from a desktop over WebSockets, so on-kiosk workspace switching needs re-justifying rather than assuming the full canvas shell runs there.

## docs/warehouse-os/03-decisions.md — 3

- **[amend]** `03-decisions.md:145` — “kind: 'scan'  → carries a scanType.  EXACTLY ONE scan session armed at a time.”
  - *Contradicted by D9 (with D7 shared-staff reality, D12/D16 shared sessions).* The D7 ruling's scan/task split survives, but the armed-session singleton must be per staff member (or per device), not app/org-wide — 8-10 concurrent scanning staff and shared sessions break the org-keyed partial unique index (the same amendment applies to line 149's "routes every scan to the one armed scan session").
- **[note]** `03-decisions.md:54` — “A tile registry carries **no** permission field until a second tenant exists. Revisit before the first outside tenant, not before.”
  - *Contradicted by D7, D10, D14 (D6 keeps single-tenant, so the ruling's trigger never fires).* The revisit trigger is stale: single tenant stands (D6), but v1 now has eleven differentiated roles, a role-routed approval/work-order queue (D14), and role-scoped AI write authority (D10), so role-based surface visibility is a v1 concern inside one tenant — the ruling should be re-examined against roles, not tenants.
- **[note]** `03-decisions.md:100` — “**Warehouse tablets get the desktop shell.** `proxy.ts` deliberately excludes iPad/Android tablets from the mobile rewrite”
  - *Contradicted by D4 (with D5).* Under D4 the browser-delivered desktop operator shell is dead — the desktop shell ships as an installed Electron app and tablets get only the kiosk browser or the basic mobile-browser surface — so the touch-tablet-runs-the-desktop-shell premise no longer drives the rail-reveal decision (the click-toggle recommendation likely still stands on scanning-has-no-pointer grounds).

## docs/warehouse-os/04-roadmap.md — 3

- **[amend]** `04-roadmap.md:80` — “D7 settled scan ownership as ONE armed session app-wide, read from `getArmedScanSession()`”
  - *Contradicted by D9.* Should say the armed-scan-session rule is re-scoped per staff (or per device) — `getArmedScanSession()` and the tenant-only partial unique index behind it need re-keying for 8-10 concurrent scanning staff (the no-scanFocusTileId conclusion itself still holds).
- **[note]** `04-roadmap.md:3` — “Nine phases. Each is shippable alone and reversible.”
  - *Contradicted by D1, D11, D13.* The phase plan needs re-cutting around the ruled v1 deliverable — no phase currently names the scan-any-QR location/provenance spine (the v1 product), the day-90 external integrations (eBay/Amazon order reads, ShipStation, Square, Zendesk, the AI-provider seam), or the pre-Black-Friday full-real-shift ship gate the nine shell phases must serve.
- **[note]** `04-roadmap.md:176` — “one `VisibilityToggle` (5 forks today — its failure mode is emailing a customer a note meant to be private)”
  - *Contradicted by D10.* Under D10 the system holds no customer-send pipe (customer messages are draft-only, copy-pasted out by a human), so the emailing-a-customer failure mode should be retired and the one-VisibilityToggle consolidation justified on internal-visibility grounds instead.

## docs/warehouse-os/README.md — 2

- **[struck]** `README.md:25` — “**The current rewrite prompt** (2026-08-23). The AI pinned centre as a SUNKEN feed — no tile, no backdrop”
  - *Contradicted by D2.* HANDOFF-ai-centre is superseded 2026-08-24: the feed-as-permanent-sunken-centre framing is overturned, the tiling canvas returns as the screen with Hyprland-style window moves, and only "one field" (the permanent, corner-dockable composer) survives.
- **[amend]** `README.md:46` — “**Phase 0 — deciding.** No refactor code has been written.”
  - *Contradicted by D1–D16 (the 2026-08-24 scope interview), esp. D13.* Status should record that the 2026-08-24 scope interview closed the deciding phase — endgame (the location/provenance spine), Electron delivery, single tenant, durable sessions and the pre-Black-Friday ship gate are ruled — and building toward the D13 gate is underway (the workspace store shipped 2026-08-21 per 04-roadmap).

## docs/warehouse-os/HANDOFF-continue.md — 2

- **[amend]** `HANDOFF-continue.md:15` — “This is the index — read it before proposing anything”
  - *Contradicted by D2, D3, D9.* LAWS.md must be read through the 2026-08-24 operator decision set, which supersedes it on conflict — S1 is amended, T30's offline justification is struck, and the 08-23 centre rulings are overturned.
- **[note]** `HANDOFF-continue.md:53` — “the assistant with a review queue”
  - *Contradicted by D14.* The assistant's review queue and the work-order queue are one surface, routed by subscription to the responsible role and grouped in a triage tile — not a standalone assistant panel.
