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
| State | spine + **state code** `RDY URG PKD OOS SHP` beside it; tint fill only for red; selection = 2 px ink outline; tint/details on hover or selection |
| Borders | 1 px rules, no shadows |
| Imagery | photo fills its square |
| Motion | none, **except the one fixed scan-status spot** (≤150 ms; motion.dev on web, native elsewhere) |
| Hit | touch 48 (bottom sheet for details / exact actions); desk 32 |
| Surfaces | **canvas `#fafafa`** (Changed from `#ecece8`), bar `#f8f8f4`, rows `#fff`, ink `#10110f`, muted `#535650`, rule `#cacbc5`, edge `#b7b8b0`, well `#e6e7e1`, urgent text `#8a5f00` |

### triage — **Approved** (Q4b)
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
composer (delete the private textareas) · body 15/16, lh 1.6 · no AI accent colour · motion:
200 ms fade-rise, 1.2 s thinking pulse, no typing effect · triage palette. **Open (deferred):**
pending-jobs button, AI notifications in Activity Inbox, composer unification — "a later
triageable task".

**Radius ladder across modes — Approved:** industrial 0 · triage 4 · counter 12 + pill · assistant 12 + pill.

## 5. Invariants — **Approved** with state colours **Changed** (Q5)

Never change by mode or region: brand mark · state meanings · state codes · data vocabulary
(condition, SLA, CopyChip hue per data type) · Lucide icons · error semantics · the scan bar ·
selection outline (counter excepted).

State colours = **prod's existing tokens** (owner: "keep all of the production today token colors
… but for shipped, keep it as just green"): info `#2563eb`, warning `#ea580c`, fulfillment
`#9333ea`, danger `#dc2626`, success `#16a34a`. **Shipped = success/green everywhere** (done).
**Lifecycle source of truth — Approved (2026-09-24):** one `LIFECYCLE` map in
`packages/design-tokens/src/lifecycle.ts` (ready → info `RDY` · urgent → warning `URG` ·
**packed → fulfillment/purple `PKD`** · out of stock → danger `OOS` · **shipped → success/green
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
