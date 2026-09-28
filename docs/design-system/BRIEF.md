# Cycle Forge design system — task modes brief

Interview with Michael (owner), 2026-09-23 → 2026-09-24. Status on every item:
**Approved** (his yes) · **Changed** (he changed the proposal) · **Open** (not decided).

**This brief is law.** Where it conflicts with older text (`docs/warehouse-os/LAWS.md`
M1/M2/U2/F3/F9, `docs/mobile-first/SURFACE_LAW.md:164`, the "Density modes" table), this brief
wins — owner: *"you are creating new laws on top of it. You are rewriting the system to adhere to
the new laws."* **Rollout law:** *"You cannot sweep over the entire codebase … This needs to be
done page by page."* Tokens change centrally; screens adopt them one page at a time.

---

## 1. Research — how real systems run more than one density / mode

| System | Modes | Who / what picks | Stays constant | Source |
|---|---|---|---|---|
| SAP Fiori | cozy (3 rem controls) / compact (2 rem) | device input: touch → cozy, mouse → compact; user override only on hybrid devices | font size ("the font size remains the same"), colours | [Fiori content density](https://www.sap.com/design-system/fiori-design-web/v1-38/foundations/visual/cozy-compact) |
| IBM Carbon | productive / expressive motion; durations 70–700 ms, micro 90–120 ms | the **moment**: "Reserve expressive motion for occasional, important moments" | easing family | [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/) |
| Salesforce Lightning | Comfy / Cozy / Compact (label position + spacing) | org default; user overrides; "Admins can't override a user's display density"; not the mobile app | tokens, brand | [LWC display density](https://developer.salesforce.com/docs/platform/lwc/guide/data-display-density.html) |
| Material | density 0 … −3 (−4 dp/step); overlays excluded | theme-wide or scoped mixin | colour, shape | [M2 density](https://m2.material.io/develop/web/supporting/density) (search-summarised) |
| Shopify | Admin (Polaris web) vs POS (separate POS UI extension components) | separate component runtime per surface; POS ≥44 px, ≥8 px gap | brand, icons | [POS performance/UX](https://shopify.dev/docs/apps/build/performance/point-of-sale) (search-summarised) |
| Zendesk Garden · Blueprint · Fluent 2 · Atlassian | `isCompact` · `.bp5-small/large` · size small/medium/large · `space.*` | per component prop | brand | scout-reported, not re-verified |
| Grafana · Linear | table cell height sm/md/lg · per-view display options | per panel / per view, saved per user | — | scout-reported |
| Bloomberg Terminal | one mode: maximum density, "religiously consistent" | fixed | everything | [Bloomberg UX](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/) (403 on fetch; search-summarised) |
| DTCG | Resolver Module 2025.10: sets + modifiers{contexts, default} | tool permutations | — | [resolver draft](https://www.designtokens.org/tr/drafts/resolver/) — "preview … do not implement" |

Claims in the pasted brief that did not hold: Polaris does **not** resize one shared `<Button>` for
POS (separate components); Carbon's fastest token **is** 70 ms (guidance 90–120 ms); Salesforce
density is label position + spacing, not one collapsing token.

**Takeaway:** nobody switches the whole look per page. Density follows the **device** (SAP,
Material); expressiveness follows the **moment** (Carbon). Cycle Forge's mode-per-job sits between.

---

## 2. Jobs — **Approved** (Q1, with changes)

- Fast: to-ship queue, pack, scan-out, pick, unbox, label intake, inventory.
- Understand-then-decide: **arrival triage** — "is it a return? Is it a repair service? Is it a
  ticket?" (**Changed** — this is "task triage"); exception triage; test / QC / repair; support.
- Counter / kiosk: staff **and** customers, "a very fast thing to understand and explain".
- AI: high throughput; long jobs show in a pending-jobs list, per staff.
- Reports, studio, settings: **Changed** — behind the AI; reports become live AI notifications.
- Receiving: not built yet — out of the first pass.

## 3. Modes — **Approved** (Q2)

| Mode | Purpose | Jobs |
|---|---|---|
| `industrial` | the person on the floor doing it now — most rows, fastest hands | queue, pick, pack, scan-out, unbox, label intake, inventory |
| `triage` | understand one thing, then decide; managers/overseers change rules that update industrial | arrival + exception triage, QC, repair, support, rule edits |
| `counter` | staff + customer read one screen; Square/Shopify-POS simple | kiosk, counter, walk-in, pickup |
| `assistant` | talking to the AI; job progress; live notifications | AI rail, `/ai-chat` |

Hit size follows the **device** (touch vs pointer), not a mode.

## 4. Dials per mode

### industrial — **Approved** (Q4a) except canvas **Changed** (Q11)
| Dial | Touch / desk |
|---|---|
| Page padding | 0, edge-to-edge; rows separated by 1 px rules |
| Spacing | 4 px base, 8 inside bands, ≤12; **no density multiplier** (Changed) |
| Radius | 0 everywhere |
| Row | touch: 5 pt spine · 108 pt photo · 3 × 36 pt bands. Desk: see §4a and the To-ship handoff. **Row zoom per list (S/M/L) + app zoom per staff** (Changed) |
| Labels | mono 9–10 pt heavy uppercase, 0.08 em |
| Values | IDs/SKUs/serials mono bold 12–13; titles sans bold 15 |
| State | spine + **state icon + state code** `RDY URG PKD OOS SHP` beside it; selection = 2 px ink outline; tint/details on hover or selection. **Approved (owner, 2026-09-25):** each code is led by its `LIFECYCLE` icon — circle-dot · alarm-clock · package · package-x · truck · circle-pause — so state reads by shape as well as colour. **Changed (owner, 2026-09-25): no row wash for any state** — the pink out-of-stock fill is gone (red on pink was 4.41:1); out of stock is carried by the hatched spine + `OOS` code on white |
| Borders | 1 px rules, no shadows |
| Grain | **Approved (owner, 2026-09-25): grain is a depth ladder — rougher = deeper.** SVG noise tile per surface role: well (photo slot, sunken troughs) 3 % coarse · canvas 7 % medium · bar (tabs, toolbar, evidence column, group bands) 7 % fine · ink fills (active tab, pressed segment) 12 %. The white row panel and anything raised over it carry none. Rides both `bg-mode-*` and the remapped `bg-surface-sunken` / `bg-surface-canvas` inside a light region, so every component gets it; zero specificity, so a component's own background image wins. Light scheme only. No amber text on a well. Opacity is capped by contrast (7 % keeps urgent ink ≥ 4.5:1 at a full-black noise pixel); depth is carried by speck size. Guard: `modes.guard.test.ts`. Bar segment labels (tabs, bar actions) are mono **11 px** so light-on-ink text holds up over the grain |
| Imagery | photo fills its square |
| Motion | none, **except the one fixed scan-status spot** (≤150 ms; motion.dev on web, native elsewhere) |
| Hit | touch 48 (bottom sheet for details / exact actions); desk 32 |
| Trailing edge | **Approved (owner, 2026-09-25):** every right-edge glyph of a row or evidence fact (+/−, open ↗, edit ✎, a picker's ⌄) sits centred in one 32 px trailing cell flush with the content edge — one vertical axis. `RECORD_TRAILING_CELL_CLASS` / `RECORD_TRAILING_GLYPH_INSET_CLASS` (`tokens/industrial-record.ts`); facts and sections mount `record-ledger/EvidenceDisclosure`. Pinned in `pinned.json` (`EvidenceDisclosure`, `SearchableSelectField`) |
| Surfaces | **canvas `#fafafa`** (Changed from `#ecece8`), bar `#f8f8f4`, rows `#fff`, ink `#10110f`, muted `#535650`, rule `#cacbc5`, edge `#b7b8b0`, well `#e6e7e1`, urgent text `#8a5f00` |

### triage — **Approved** (Q4b)
> **Changed (owner, 2026-09-24): one language, two densities.** Triage no longer has its own
> identity. It shares industrial's warm greys (`#10110f` / `#cacbc5` …), **radius 0**, warning
> ink and label voice (mono heavy caps for labels and codes, sans for values). Triage differs
> from industrial in **space only** — page padding 12/16, body 14/16, hit, motion. The slate
> palette and the 4px radius below are **superseded** for triage (they remain for `counter` /
> `assistant`, which keep their own identity). Source: `OPERATIONAL_BASE` in
> `packages/design-tokens/src/modes.ts`; CI guard: `src/design-system/modes/modes.guard.test.ts`
> (fails if an operational mode overrides anything but density, if a new mode is neither in the
> family nor exempted by name, or if a triage corner constant rounds).
Padding 12 desk / 16 touch · 4 px base, 8/12/16 · **radius 4** · evidence stack: what it is →
evidence (photos, logs, timeline) → decision bar (2–4 verbs, bottom on touch) · body 14/16,
lh 1.45 · mono labels/IDs · neutral decisions, primary = ink fill · 1 px rules, one shadow level for
sheets · evidence photos full-frame, 2–3 col, tap to zoom · ≤120 ms opacity crossfade; decisions
confirm in the scan-status spot · keys 1–4 fire decisions · surfaces: canvas `#fafafa`, panel
`#fff`, well `#f1f5f9`, hover `#f8fafc`, rule `#e2e8f0`, edge `#cbd5e1`, control border `#7b8aa0`,
ink `#0f172a`, muted `#475569`, faint `#64748b` (never on well), focus `#2563eb`.

### counter — **Approved** (Q4c): kiosk v2 is the baseline
Keep kiosk v2 layout (catalog → one question per screen, Work / Show / Verify, paired tablet),
padding and gap rhythm (12 fields / 16 sections, no dividers). **Radius 12 + pill**, 0 for
full-bleed planes. Fields 16, step titles 26, tile titles 16. Mono/uppercase only in Work. Blue
frame + check dot selection (the one exception). Flat. 100 ms press, 200 ms step crossfade, no hover
lift. Hit 48, CTA 56. **Primary + idle screen = tenant brand** (`settings.brand.primaryColor`,
default `#1f316d`). Fix list: 36 px trail chips, 32/24/22 px pips, ~40 px CTA, 14 px fields,
tile shadows, divider lines, hard-coded `blue-*`/`amber-*`.

### assistant — **Approved as starting point** (Q4d)
Rail 16 / page 720 px column · 12 + pill · flat transcript, user message on `#f1f5f9` · one
composer (delete the private textareas) · body 15/16, lh 1.6 · AI accent colour allowed · motion:
200 ms fade-rise, 1.2 s thinking pulse, Motion+ `Typewriter` for streamed replies · triage palette. **Open (deferred):**
pending-jobs button, AI notifications in Activity Inbox, composer unification — "a later
triageable task".

**Radius ladder across modes — Changed (2026-09-24):** industrial 0 · triage **0** (shared identity) · counter 12 + pill · assistant 12 + pill.

## 5. Invariants — **Approved** with state colours **Changed** (Q5)

Never change by mode or region: brand mark · state meanings · state codes · data vocabulary
(condition, SLA, CopyChip hue per data type) · Lucide icons · error semantics · the scan bar ·
selection outline (counter excepted).

State colours = **prod's existing tokens** (owner: "keep all of the production today token colors
… but for shipped, keep it as just green"): info `#2563eb`, warning `#ea580c`, fulfillment
`#9333ea`, danger `#dc2626`, success `#16a34a`. **Shipped = success/green everywhere** (done).
**Lifecycle source of truth — Approved (2026-09-24):** one `LIFECYCLE` map in
`packages/design-tokens/src/lifecycle.ts` (to pick → neutral/grey `TPK` · picked → info/blue `PIK` ·
urgent → warning `URG` · **packed → fulfillment/purple `PKD`** · out of stock → danger `OOS` · **shipped → success/green
`SHP`**), generated into Swift + JSON; every packed/shipped tone map in `src/` reads it (guard
test). **Text vs fill split — Approved:** success text `#15803d`, warning text `#c2410c` (≥4.5:1);
fills, spines, dots and tints keep `#16a34a` / `#ea580c`.

## 6. Who picks the mode — **Approved** (Q6)

"The mode is decided by the job in the region." Route + region → mode, fixed. Role → which pages
you land on, never a page's mode. Device → hit size, sheet vs rail. User → app zoom, row zoom,
light/dark; **no mode switcher**. AI/automations run in assistant; their effects show in industrial.

**Nesting — Approved (Q3):** by region, one level deep: page mode + right-rail mode (triage for a
record, assistant for the AI; one right-edge slot, detail outranks assistant). Edits: one fact on
one order → inline (industrial); understand one order → rail (triage); rule for many orders →
rules view or AI with a triage-style preview before apply.
*Industrial desks override the rail for records — see §11 "Changed": the record opens in the
desk's evidence column. The rail keeps the assistant.*

## 7. Platforms — **Changed** (Q7, Q7b)

| Device | Built with | Role |
|---|---|---|
| Windows / Linux / macOS | **Tauri**, bundling a pinned copy of the shared React UI (never loads the live site) + Rust services: print queue / raw ZPL, scale, offline outbox, station state + keychain, kiosk/auto-start/hotkeys | stations |
| Web | Next.js (prod) | universal fallback, admin, triage, reports |
| iPhone / iPad | SwiftUI | handheld floor work |
| Android | prod `/m/*` now; Kotlin/Compose end goal | rugged scanners |

Split by **capability**, not page: anything needing hardware/OS is desktop; the web shows "Open in
desktop app" + a degraded download, never hides the action. Retire `apps/desktop-tauri` screens and
their literal `styles.css` / `handset.css`. Test station builds on Linux WebKitGTK.
**Identical everywhere:** token values, state codes, mode per job, row proportions. **May differ:**
navigation, system fonts, haptics, native sheets, Dynamic Type → app zoom, safe areas, camera UI.
**Open:** label-printing-first build (outside this brief).

## 8. Accessibility floor — **Approved** (Q8)

Text 4.5:1 in every mode · non-text 3:1 (amber spine always paired with `URG`) · 9 pt only for
uppercase heavy mono labels; values ≥12; body 13/14/16; touch inputs 16 · usable at 200 % zoom ·
touch 48 + 8 px gaps, desk 32, counter 48/56 · reduced motion = all motion off incl. scan-status
(instant colour change) · haptics on handhelds · full keyboard reach, 2 px focus · state codes read
as full words.

## 9. Token architecture — **Approved** (Q9)

TypeScript registry is the single source → generators → CSS `[data-mode]` vars (web + desktop),
`DesignTokens.swift`, `Tokens.kt` (later), `tokens.json` (design-mcp). Deterministic drift test is
the CI gate; design-mcp review comments, never blocks. **No DTCG.** Layers: primitives → semantic
per mode → component.

```ts
// packages/design-tokens/src/modes.ts (shape)
industrial: { canvas: '#fafafa', ink: '#10110f', rule: '#cacbc5', radius: 0, pagePad: 0,
              hitMin: { touch: 48, desk: 32 }, motion: { feedback: 150 } },
triage:     { canvas: '#fafafa', ink: '#0f172a', rule: '#e2e8f0', radius: 4,
              pagePad: { touch: 16, desk: 12 }, hitMin: { touch: 48, desk: 32 }, motion: { feedback: 120 } },
```

**Built (uncommitted):** `packages/design-tokens` (`@cycleforge/design-tokens`), `pnpm tokens:build`
/ `tokens:check`, "Design tokens" gate in `verify:fast`, `ModeRegion` + `useMode`, `[data-mode]`
CSS injected by `src/app/layout.tsx`, mounts on `/shipping`, `/pack`, `/m/pick`, `/m/work`,
`/triage`, right rail, `/ai-chat`, kiosk; design-mcp `ds_tokens mode`.

## 10. Governance

- New mode: owner approves; the TS type forces a value for every token.
- Screens declare mode with `ModeRegion` (web) / an environment value (SwiftUI).
- design-mcp (`ds_contract`, `ds_tokens`, `ds_critique`) reads the same package; local stdio server
  in Garisek-OS.
- Page by page: each page adoption ships with before/after screenshots at `:3050`.

## 11. First slice — **Approved** (Q10, Q11)

Outbound **To ship** (`/shipping/orders`): replace the slot DataTable with the industrial record
ledger. Spec and prompt: [`HANDOFF-outbound-to-ship-ledger.md`](./HANDOFF-outbound-to-ship-ledger.md).

**Changed (owner, 2026-09-24, after the first slice landed):** on an industrial desk the open
record reads in an **evidence column** beside the ledger (the desktop terminal's
`.evidence-panel`), never in the right rail and never over the rows — "the right rail components
are terrible and not used properly for this use case". **Location** leads the context band (between
the state code and the platform); **condition** sits beside the select box. The desk frame is one
full-width **industrial bar** (modes as flush segments, no page title row). Port spec and prompt:
[`HANDOFF-industrial-record-ledger.md`](./HANDOFF-industrial-record-ledger.md).

**Changed (owner, 2026-09-25):** the desk record's bands regroup by job. Band 1 is context —
state · platform · order # ··· buyer · **listing** (right end, no hairline) · ship-by. Band 3 is
execution — condition · **BIN · SKU** (the physical lookup pair, side by side) ··· pick · pack ·
next step. A key/value fact (`BIN`, `SKU`) prints key and value at ONE size and line box
(`RECORD_FACT_KEY_CLASS`); a 10 px key beside a 13 px value read as two heights.

**Changed (owner, 2026-09-25):** condition is a **solid chip**, like the state badge — tag icon +
short grade (`NEW`, `L-NEW`, `REF`, `A`/`B`/`C`, `PARTS`) in white on a fill of the grade's colour
(`CONDITION_GRADE_TONE[grade].solid`; teal and emerald step to -700 so white clears 4.5:1). One
fixed box (64 × 14 px) on every record so BIN and SKU never shift. No grade → the same chip on the
well in muted ink with `—`. Clicking it opens the existing condition list. Same chip on the ledger
row and the evidence column (`RECORD_CONDITION_CHIP_CLASS`). Icon: tag — **Approved (owner,
2026-09-25)**. L-NEW and A text inks step to -700 everywhere (the -600 read too faint as text).

**Changed (owner, 2026-09-25):** in the evidence column, the next step in the state strip
(`→ PICK`, `→ PACK` …) is a solid badge in the record's state colour (danger when blocked), and the
sale **price** reads one line under the item # in the item block — its only place in the column.

**Changed (owner, 2026-09-25):** the state code is a **solid badge** — icon + code on the tone's
`code` fill in its `codeInk` (`STATE_TONES`; white on the -700 step, near-black on the warning
orange), ≥ 4.5:1 for every tone, one fixed box the size of `NOTE`. **The SKU on band 3 starts
under the buyer on band 1:** both bands share one lead column (`LEDGER_LEAD_CLASS`), so the
columns read straight down the list.

**Measured (2026-09-25, item 6):** the secondary ink is already the playbook's dark grey — every
muted text on the record is `#535650` at 7.46:1; no light-grey or faded text remains. The one
value that was drawn muted, the pick/pack operator's name, now reads in ink (label muted, value
ink). What still reads light is the 9 px stamp, a size problem (item 10), not a colour one.

**Changed (owner, 2026-09-25):** the seed-group band sits on the records' columns (chevron in the
photo lane, then the same lead, buyer/SKU column and pick · pack · next lanes). Staff avatar
initials switch to dark ink on light staff colours. An un-noted record's note slot is a filled grey
**`+ NOTE`** that adds a note in place. Mono labels and IDs are really bold: Plex Mono 700 is
loaded (mono only; Inter stays capped at 600).

**Changed (owner, 2026-09-25, item 8):** an editable box reads **recessed** with rules only — top +
left edge in the control ink, right + bottom in the edge grey, no shadow (`RECORD_RECESS_CLASS`):
the QTY box and the note field.

**Changed (owner, 2026-09-25):** preserve existing `staff.color_hex` values and choose
pure black `#000000` or white `#ffffff` initials by whichever has higher WCAG contrast.
`blackOrWhiteInk` supplies this decision to `IdentityMark` and the staff recipient list.
The square industrial mark keeps its ring-free, mono bold uppercase initials.

**Item 8a reverted (owner, 2026-09-25):** remove the muted/richer palette, colour mapping,
palette restrictions and added Change color controls. Existing colour editors and arbitrary
hex choices remain as before. No staff records were recoloured. Only initials contrast changes;
black or white provides at least 4.5:1 contrast on every valid RGB background.

## 12. Owner rulings 2026-09-26

**Changed — motion and density follow the task context, never the device.** One phone switches
systems as the operator moves between routes (`/m/scan` → `/m/tasks`). Supersedes every motion
line above that is keyed to a device, and the triage (≤120 ms crossfade) and assistant motion
dials in §4. The context is the region's `ModeRegion mode` (`data-mode`); no second prop.

| Context | Modes | Motion | Visuals |
|---|---|---|---|
| Industrial execution — scanning, picking, packing, clearing a physical queue | `industrial` | minimal to zero: no motion.dev layout transitions; a scan or a Pass tap lands the next record in 0 ms | 0 padding, flush grids, rigid high-contrast blocks |
| Detective work and triage — task lists, exception investigation, order-history audit, AI chat | `triage`, `assistant` | expressive: motion.dev `layoutId` for opening sidebars / expanding details, staggered list enter/exit, deliberate AI thinking states, skeleton loaders | generous padding, structured hierarchy, clear type |

Still law: §8 reduced motion turns every animation off in both contexts; touch hit floor 48 is
accessibility, not density. **Approved (owner):** the industrial scan-status spot (≤150 ms, §4)
stays — it is the one discoverable feedback for a scan. **Changed (owner):** `/m/scan` is
`industrial` — scanning an item in or out needs no padding or display methods.

**Changed — AI inference goes through Cloudflare AI Gateway only.** Vercel AI Gateway is
removed completely (`GATEWAY_BASE` in `src/lib/ai/org-provider.ts`, the `ai_gateway` BYOK
credential, the `AI_CHAT_BASE_URL` default). iOS, Android and the desktop app never call a
vendor or the gateway directly; they call CycleForge server routes, which call the gateway.

**Porting from `main`:** the owner cherry-picks one commit at a time into prod and proves each;
no branch merges. **Commits:** the owner directed "commit everything and push" on 2026-09-26.

**Dogfood speed mode (owner 2026-09-26):** "I am in dog food so a work tree per session
doesn't matter, just do everything in the production work tree, face by face, step by
step, it doesn't matter if I commit a non-working design." Commit and push each face as
it lands; red gates are reported, not blockers.

**Changed (owner, 2026-09-26) — industrial on phones, triage on desktop.** "completely dropping
the industrial design system display from desktop and mainly only displaying it on mobile."
Supersedes "motion and density follow the task, never the device" (above) and triage's
"one language, two densities" (§4b, 2026-09-24). Owner picks: **every desktop route = triage**;
triage radius = **shadcn new-york default** (`--radius` 0.625rem: cards 10 px, controls 8 px,
chips pill); triage palette = **shadcn neutral**. Industrial (0 radius, flush, 0 ms) stays the
phone (`/m/*`, coarse pointer) system. **Mode C — hardware mirror:** a desktop view that mirrors
a live phone renders industrial 1:1 (explicit `ModeRegion mode="industrial"`), never triage.
Desktop triage gets motion.dev: row selection + a fixed-width floating selection bar that
reward the action (owner: "high throughput animations and rewarding feedback and building trust").

**Mode D — floor (owner 2026-09-26):** the one user-invoked industrial view on desktop. A desk
whose list offers a floor face (To ship: `OutboundOrdersLedger`) enters it with **⌘/Ctrl+Shift+F**
or the **Floor** button on the table's toolbar row; the stage view becomes `floor` (one enum with
In place / Split, `DeskStageContext`), the page header, tab row and sidebar leave, and the route's
page region paints `industrial` (square, caps, 0 ms). Records open In place. Floor is a session
posture, never remembered; Esc (after closing the record / clearing checks) or **Exit floor**
returns to the view it was entered from. Every other desktop view stays triage — the To-ship
index face included.

**Repo diet (owner 2026-09-26):** dead source files, one-off scripts that already ran,
`docs/todo/` and every screenshot under `docs/` are deleted; proof shots stay local
(`docs/**/screenshots/` is gitignored).

**Order of work:** remove dead code first, so design-system investigation reads only live code.

## 13. Owner rulings 2026-09-27

**Motion rules abolished (owner 2026-09-27):** "Completely abolish any motion.dev animation
rules." Supersedes every motion line in this brief (§4 dials, §11, §12 context matrix, the 0 ms
industrial / floor posture, the ≤120 ms triage crossfade). Any surface may import `motion/react`
(or `@/design-system/motion`, which re-exports the whole engine) and animate as it sees fit;
`motionRole` / `motion-presets` are optional presets, not law. The one thing kept is the OS
"reduce motion" setting (`ReducedMotionProvider`, `MotionConfig reducedMotion="user"`) —
accessibility, not style.

**To-ship triage list = order cards (owner 2026-09-27):** the DataTable index face is replaced by
`OrderCardList` — a fixed-width list of order cards. Each card: slim status rail on the far left;
checkbox top-left with a status icon beneath it; line 1 order number · platform · SLA (right);
line 2 photo + full product title; line 3 qty · condition · stock · bin · price. Multi-product
orders show the first line (out of stock first) plus "+N items", which expands in place; hovering
the status icon lists every line with what is out of stock. ~~One checked card → its actions drop
down from the card's right; two or more → the bar above the list becomes the bulk bar.~~ **Changed
(owner, 2026-09-27):** selection verbs live only in the selection bar above the list — same verbs,
same order, same place for 1 or N checked, disabled with a reason, never hidden; single-card verbs
live only in fixed card spots (⋮ at line 1 far right, identity ↗, stage-chip popovers). No column
header. Floor keeps the industrial ledger.

**Changed (owner, 2026-09-27) — card line 1:** order number · ↗ (always-visible link to the
platform's admin order page). Hovering the NUMBER flies out its menu — "Copy order ID" and "Edit
order ID link" ("Add order ID link" when there is none), the latter opening the link popover
under the number; nothing is reserved beside the number, hovering the ↗ shows nothing, a click
on the number copies · full platform name (`channel.label`, medium-weight ink + brand dot) ·
buyer name (regular, muted, after a faint `·`; the first thing to truncate) ······ **Listing ↗**
(item number, else SKU, via `getExternalUrlByItemNumber`) · SLA. The shipping address stays off
the card — it lives in the Space quick look and the record.

**Changed (owner, 2026-09-27) — card stages: Pick and QC per line, Pack per order.** Default
order everywhere (card, quick look, record rows) is **Pick → QC → Pack**. Pick and QC belong to the
item, Pack to the order: every line row ends in its own Pick and QC chips; one Pack chip sits at the
order level on the last row. Orders with 2+ lines always show their lines — up to 3, out of stock
first — and "+N more" unfolds the rest in place (no empty space between lines and stages). A chip
is icon + word + one short stamp (today → "2:14 PM", older → "Sep 27"): "Picked" / "QC'd" /
"Packed", "Pre-QC'd" (QC passed before the order — backend pending), "Out of stock" (danger), or
faint "Pick" / "QC" / "Pack". **No staff name inline.** A click opens the stage: who (or "Assigned
to X" / "Not assigned"), the full stamp, and for Pick / Pack the record's `LedgerStageAssign`
(pick assigns that line; pack assigns every line). Icons: Pick `PackageSearch` info blue, QC
`ShieldCheck` success green, Pack `PackageCheck` Packed purple. "Details ▾" on card hover opens the
quick look. Every fact sits in one 24 px line box (`CARD_FACT_BOX_CLASS`, `tokens/desk-stage.ts`).
Data truth depends on the QC / Pick split (`HANDOFF-qc-pick-split.md`).

**Changed (owner, 2026-09-27, later) — multi-line display language; stages off the card face.**
Supersedes the stage chips and the "up to 3 lines" rule above. The card face carries **no Pick /
QC / Pack** — no chips, no stage words; stages, who and when live in the Space quick look and the
record only. Every card wears ONE face: the lead line (out of stock first) — big photo, title, then
its facts in one fixed order, **qty · condition · stock · SKU · bin · price**
(`LINE_FACT_ORDER`, `OrderCard.tsx`), with "Details ▾" always at the far right of that facts row
and nowhere else. A 2+ line order adds one disclosure row: "+N items ▾" (plus "· N more out of
stock" in danger when hidden lines are short). Unfolded, the other lines are columns — small photo
· title · the same facts in the same order — so every fact sits under the same fact on every row;
SKU and price give way below the `label` width tier.

**Changed (owner, 2026-09-27) — card width disclosure:** the card is a container
(`@container/card`); line 1 and the stage disclose by the card's OWN width, through the
`CARD_DISCLOSE` tiers in `tokens/desk-stage.ts` — `brand` (@md: platform name; below it the brand
dot only, *pending owner* — phase 1 asked for the full name at every desktop width), `label` (@xl:
"Listing", the stage word), `detail` (@2xl: buyer name, stage time). Hidden
facts stay reachable: a `HoverTooltip` on each (platform, buyer, SLA, note, Listing,
admin ↗), the stage popover, and the Space quick look (Customer, Platform, Ship to, Ordered,
Tracking, QC, Pick, Pack — with names).

**One stage source (2026-09-27):** the card, the quick look and the record's QC by / Picked by /
Packed by rows all read `orderStage` (`src/lib/orders/order-stages.ts`). Done → the actor
(staff directory first, then the wire name) and the PST stamp; not done → the work assignee.

## Resolved 2026-09-24 (all six approved as written)

1. **Packed = purple** via the `LIFECYCLE` map (§5).
2. **Green/orange text** one step darker; fills unchanged (§5).
3. **`/m/consult` stays counter intake** (kiosk v2). The AI is `/ai-chat` on desk and a mobile
   **Assistant** tab at `/m/assistant` (built with item 4).
4. **Assistant queue**, one page each, in order: (a) one main composer replaces both private
   textareas, (b) top-right pending-jobs button with Mine / Everyone, (c) AI status items as a new
   Activity Inbox kind.
5. **iOS** adopts generated `DesignTokens.swift` via `pnpm tokens:sync-ios`, screen by screen,
   starting with `ToShipRowView` in the To ship slice. **Desktop** takes tokens when it bundles the
   shared prod UI; the old Tauri screens are not touched.
6. **"Please wait" / "Skip"** are real seeded reason codes → soft-retired in
   `src/lib/migrations/2026-09-24_retire_placeholder_repair_reasons.sql` (not yet applied — run
   `/db-migrate`) and removed from `src/lib/repair/repair-failure-reasons.ts`.

## Still open

- Label-printing-first desktop build (outside this brief).
