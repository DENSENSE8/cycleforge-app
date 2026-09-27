# HANDOFF — Contextual sidebar, next phase: flip the gap-free pages, the phone drawer, then hover-disclosed view hotkeys

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27, after
`HANDOFF-chat-sidebar.md` shipped. Related: `HANDOFF-sidebar-foundations.md`
(roots), `HANDOFF-outbound-sidebar-verify.md` (sign-in + Playwright probe recipe,
"Read first" §4), `PARITY.md` (per-page rows), `parity.ts` (the machine gate).

---

You are taking the contextual left sidebar from "two pages" to "every desk page",
and then onto the phone-width drawer. The repo's sidebar rule still holds:
**upgrade the root, then every page follows.** A page only DECLARES data
(`NAV_PAGE_DECLS`, `SIDEBAR_PAGE_NAV`, the recents surface registry). It never
gets a sidebar component, row renderer or styles of its own.

Probe only `http://localhost:3050` (`AGENTS.md`). Other sessions own
`src/components/session/**`, `src/components/ai/**`, `src/components/composer/**`
and the ⌘K **search behaviour** (queries, results, empty states) — do not edit
them. ⌘K **navigation** (the empty-query page map) is sidebar work and yours.

## 0. Read first (10 minutes, not optional)

1. `node tools/design-mcp/ds.mjs contract "left sidebar"`, `… "sidebar head order"`,
   `… "sidebar recents"`, `… "command palette"`, `… "keyboard keycap"`,
   `… "view hotkey"`. The laws
   live in `src/design-system/pinned.json` (`ContextualSidebar`, `NavFind`,
   `FindField`, `NavSectionList`, `NavRecentsList`, `KeyboardKey`, `command`).
   When code and law disagree, the law wins — fix the code, or ask the operator.
2. `src/lib/nav/context/{build,resolve,parity,rollout,pages}.ts` — the one
   contract. `resolve.ts` clamps a page to `legacy` while `parityGaps(page)` is
   non-empty or it is a scan station.
3. `src/components/sidebar/contextual/ContextualSidebar.tsx` — the ONE desktop
   host (map for legacy pages, panel for contextual ones).

## 1. Where things stand (measured 2026-09-27)

`parityGaps` per page (all permissions, no org override):

| Page | Rollout | Gaps |
|---|---|---|
| `ai-chat`, `incoming` | **contextual** | none |
| `outbound`, `fba`, `label-intake` | legacy (Michael dogfoods `outbound` via `nav.contextual.outbound`) | none |
| `products`, `inventory`, `sourcing`, `sales`, `support`, `reports` | legacy | none |
| `studio` | legacy | `action:studio.library` |
| `home` | legacy | `view:all/checklist/task/ticket/task_ticket`, `param:tab` |
| `operations` | legacy | `param:goalView, search, staffView, logKind, actorStaffId, eventId`, `savedViews:operations` |
| stations (`triage`, `receive`, `pickup`, `repair`, `testing`, `ready-to-pack`, `scan-out`, `packer`, `receiving`, `tech`) | **pinned legacy** (operator 2026-09-26) | n/a — do not port |

Re-run before you start (the table goes stale the moment someone edits a panel):

```sh
cat > scripts/.tmp-gaps.ts <<'EOF'
import { parityGaps } from '@/lib/nav/context/parity';
import { NAV_CONTEXT_ROLLOUT, NAV_CONTEXT_PINNED_LEGACY } from '@/lib/nav/context/rollout';
for (const [id, s] of Object.entries(NAV_CONTEXT_ROLLOUT))
  console.log(id, s, NAV_CONTEXT_PINNED_LEGACY.has(id) ? 'station' : '', parityGaps(id).map((g) => `${g.kind}:${g.id}`).join(' ') || 'none');
EOF
node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/.tmp-gaps.ts; rm scripts/.tmp-gaps.ts
```

Shipped in the last phase (do not rebuild): Chat as a view-less `recentsPanel`
page (`‹ Chat [+]`, ⌥1…⌥0 recent threads); the recents root (`NavRecentsList`:
recency groups, lit row, Load more, row verbs, live row, chords); hover-disclosed
keycaps + paste key on Find / ⌘K (`FindField` `HoverKeycaps` / `PasteKey`,
per-line hint roll); the header search as the same sunken well; ⌘K's empty query
reading the sidebar contract (`CommandBarPageMap`); sentence-case palette +
identity-coloured method pills; soft sentence-case `KeyboardKey`.

## 2. Phase A — flip the gap-free pages (one PR per page or lane)

`rollout.ts`: *"A page flips to `contextual` in the same PR that deletes its old
panel and tab row."* A flip without the deletion is not done.

Order (each builds on the last):

1. **Outbound lane** — `outbound`, `fba`, `label-intake` together (one lane door,
   one mode switcher). Already verified row-by-row in
   `HANDOFF-outbound-sidebar-verify.md`; re-run its checklist, then flip all
   three and delete their legacy panels / desk tab rows.
2. **`products`** — this is the first page where another recents surface
   (`labels.prints` on `products.labels`) paints through the upgraded root.
   Acceptance includes a screenshot of Labels recents grouped by recency.
3. `inventory`, `sourcing`, `sales`, `support`, `reports` — one PR each.

Per flip:
- Delete the page's legacy context panel (find it through `SidebarContextPanel.tsx`
  / `hasSidebarContextPanel`, `sidebar-navigation.ts`) and any desk tab row the
  sidebar now carries. Grep for the panel's imports; leave nothing orphaned.
- Page verbs stay in the desk header (`NavPageActions`) — only view-less
  `recentsPanel` pages carry verbs on the `‹` row.
- `NAV_CONTEXT_ROLLOUT[page] = 'contextual'`; the resolver test
  (`the parity gate…`) must stay green.
- Probe on `:3050`: panel head order (⌘K → Find → `‹` → modes), views + counts,
  filters, recents if declared, ⌘K "This page" group shows the same views.

## 3. Phase B — close the three gapped pages

Each gap is a `PARITY.md` row the contract does not carry yet. Close it in the
contract (decl, route spec, facet group, saved-views decl), never by deleting the
parity row.

- **`studio`** — `action:studio.library` (node palette · templates · issues,
  `StudioLibrary.tsx:55-205`). Declare the verb; decide with the operator whether
  it is a header verb (`NavPageActions`) or a view.
- **`home` (Daily)** — its lens tabs (All / Checklist / Tasks / Tickets /
  Task+ticket) are views the registry does not declare, and `?tab=` is not in
  `HOME_ROUTE_PARAMS`. Add the children + `resolveChild` + route param; the
  `every mode round-trips` test in `sidebar-navigation.test.ts` will hold you to it.
- **`operations`** — seven params missing from the view routes' specs, plus the
  history saved views. Add them to the `/operations` route spec
  (`query-mode-routes.ts`), pinned to the view that reads each (`parity.ts` row
  `view`), and declare `savedViews` for `history`.

## 4. Phase C — the phone drawer runs `ContextualSidebar`

Today the desktop column is ONE host, but the phone-width drawer
(`DesktopRouteShell.tsx:279`, `DashboardSidebar inDrawer`) still mounts MasterNav.
That is why `ChatSessionsNav` and the Chat branches in
`src/components/sidebar/master-nav/SidebarNavList.tsx` (`:547-571`) survive.

- Mount `ContextualSidebar` in the drawer (it already renders the map for every
  legacy page), with the drawer's close-on-navigate (`onNavigate`) behaviour.
- Then delete `ChatSessionsNav.tsx`, the Chat branches in `SidebarNavList`, and
  everything under `master-nav/` that no longer has a mount — check with
  `find_symbol` → `impact_analysis` first. Update the allowlist in
  `src/components/sidebar/contextual/chat-session-rows.test.ts` to empty.
- Mobile-first law (`docs/mobile-first/SURFACE_LAW.md`): `/m/*` has its own
  shell; this drawer is the desktop routes at phone width. Do not touch `/m/*`.
- Touch targets: the drawer is coarse-pointer; the mode tokens raise hit sizes
  (`--mode-hit`). Verify rows are ≥44px under `pointer: coarse` in the probe.

## 5. Phase D — modes and views behind switchers (shipped 2026-09-27; keep, don't rebuild)

Operator 2026-09-27: the lane's modes (Shipping · FBA · Label intake) and a page's
views (Exceptions · PO paired · Pick list · To ship · Shipped) change rarely, so
each sits behind one block in the pinned head. What changes often (saved views,
filters) is the body's buttons, never behind a menu. Hotkeys are taught in the
open menu, not painted on rows.

Shipped:
- `NavSwitcherMenu.tsx`: the one switcher. At rest it is one block (glyph · label
  · count · `›`). Hover or Enter opens a Radix menu (`modal={false}`) to the
  RIGHT of the sidebar, starting at the column's edge
  (`sideOffset = column.right − block.right`), so the pointer can travel the
  sidebar freely. Timing comes from `useHoverSurface` (0ms open, 150ms close).
  - Menu rows: glyph → label → count → keys (far right). The current choice
    sits pressed into the surface (`NAV_CHOICE_SELECTED_CLASS`), with no check
    and no dark outline. Keys hold their width and fade in on hover or
    keyboard highlight, so the label never moves.
  - Two tiers: PARENT (mode) = raised card, plain lane icon, semibold, ⇅;
    CHILD (view) = hairline block, bare state glyph, count, ›.
  - Hover never opens it while a field (Find) has focus, because the menu would
    take focus.
  - Pressing the hover-opened trigger keeps it open.
  - While another view's `alertCount` total is > 0, the closed block carries that
    view's amber alert chip (e.g. ⚠ 397 for Exceptions).
- `NavModeSwitcher.tsx` and the new `NavViewSwitcher.tsx` (view counts plus bare
  `1`–`9` on `VIEW_HOTKEY_PAGES`, moved here from `NavSectionList`) both render
  through it. `NavSectionList` is now the page map only.
- `NavGoKeys.tsx` + `src/lib/keyboard/go-keys.ts` (pure, tested) +
  `src/lib/nav/go-keys.ts`: `G` then `S` / `F` / `L` opens Shipping / FBA /
  Label intake; while `G` is armed a card right of the sidebar lists the
  letters. The `?` and ⌘⇧? / Ctrl+Shift+? cheat sheet lists go keys and view
  digits while mounted.
- `NavFilters`: saved views first, then the Reset hairline, then Sort (the
  chosen order pressed in), one row per staff ROLE, one row per date range (Shipped
  takes a time at each end), then the facet rows. All declared as
  `NavControls` (`staff[]`, `dateRanges[]`, `sort`) in `NAV_PAGE_DECLS`, with
  `navControlParams()` as the one param list for Reset, route declaration and
  tests.
- Server: `pickedBy` / `packedBy` / `pickerId` (ORDER/PICK assignee) / `shipByFrom|To` /
  `orderFrom|To` narrow the queue lists AND their facet counts through
  `sqlDeskRefinementClauses`. Shipped takes `pickedBy` and `timeFrom|To` (exact
  PT instants). The `picker` sort column exists.
- Laws: `pinned.json` entries `NavSwitcherMenu`, `NavGoKeys`, `NavModeSwitcher`,
  `NavSectionList` and the `ContextualSidebar` body order.
- Next data phase: `HANDOFF-shortage-lens.md` (one Out-of-stock lens; retires
  PO paired).

Left for you:
- The phone drawer (Phase C) has no hover. The switcher opens on tap through
  Radix; check that the menu still lands right of the drawer column at phone
  width, and that its rows are ≥44px under `pointer: coarse`.
- Report line, not this phase: the in-row hover-keycap slot is still duplicated in
  `FindField` `HoverKeycaps`, `NavRecentsList.tsx:343-359` and `NavPanelActions`.

## 6. Small follow-ups (each a line in the report)

- **Real keyboard check:** press ⌥1 on `/ai-chat` in the operator's Chrome on
  Arch. Some Linux browsers bind Alt+digit to tabs; Playwright cannot tell.
- **Look at the other `IdentifierToggle` users** now in sentence case:
  `OrderTimelineSection.tsx`, `OperationsHistoryView.tsx`. Screenshot both.
- **Dead class:** `ComposerModeRow.tsx:54` paints `text-hue-orange-ink`, which
  no config defines — the ticket glyph is not actually orange. The real ticket
  orange is the warning state (`text-text-warning`). Composer is another
  session's; report it, do not edit.
- **Pill labels:** the operator floated renaming the ⌘K method pills. The
  one-word law is pinned in `src/lib/search/search-by.test.ts` ("no number, no
  hash"). Ask before changing it; change law, labels and test together.
- **For the search session (do not fix here):** with no match, "No order number
  found in the system" renders twice — `CommandEmpty` plus the
  `showIdentifierMiss` paragraph in `CommandBar.tsx`.

## 7. Guards

- Keep green: `src/lib/nav/context/resolve.test.ts`, `src/lib/nav/recents/*.test.ts`,
  `src/lib/sidebar-navigation.test.ts`, `src/lib/nav/*.test.ts`,
  `src/lib/keyboard/chord-keys.test.ts`,
  `src/components/sidebar/contextual/chat-session-rows.test.ts`.
- Add per flip only what a consumer could break: a flipped page resolves
  `contextual` with every declared view present (the resolver tests already cover
  most of this — extend, don't duplicate).
- Run with
  `node --import tsx --import ./scripts/register-server-only-shim.cjs --test <files>`.

## 8. Done means

1. Every page in Phase A is `contextual`, its legacy panel and tab row deleted,
   probed on `:3050` with screenshots (sidebar clipped x 0–420, plus ⌘K empty
   query on that page).
2. Phase B gaps closed or explicitly handed back to the operator with the
   decision needed.
3. Phase C: the drawer runs `ContextualSidebar`; `ChatSessionsNav` and the
   MasterNav Chat branches are gone; guard allowlist empty.
4. `npx tsc --noEmit -p .` = 0 (report foreign-file errors separately, with
   `git status` proof they are not yours), `pnpm verify:fast` green.
5. Phase D: `1`–`9` still open the Shipping views; no digit painted inside a view
   row; one passive `RailPopover`-placed flyout right of the sidebar lists every
   view + digit on list hover/focus and never covers a row; §5 acceptance
   screenshots; the operator has answered the "behind the drop down" question.
6. `pinned.json` laws updated in the same change as any behaviour they describe.
7. Report: files per phase, the §1 table re-run after your work, probe evidence,
   screenshots, and every §6 item answered.
