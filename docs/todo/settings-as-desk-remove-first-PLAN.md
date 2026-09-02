# PLAN — Settings as a desk (remove UI/UX first)

**Written:** 2026-09-02 · **Status:** plan of record for B5  
**Owner lock (this session):** Settings **is a desk**. It wears `DeskPageChrome` / `DeskPageLayout`: fixed stage (`DESK_STAGE_MAX_PX` = 1152), gutters (`DESK_STAGE_GUTTER_CLASS` = `px-4`), floor (`DESK_STAGE_FLOOR_CLASS` = `pb-4`), detachment (`DESK_STAGE_DETACH_CLASS` = `mt-4`), card radius (`DESK_CHROME_STAGE_BODY_CLASS` = `overflow-hidden rounded-lg` — same corner grammar as To-ship). **Not** edge-to-edge. **Not** scan-station flush. **Not** a hand-rolled `max-w-3xl` / `max-w-5xl` column.

**This ruling strikes** the current exception in `DeskPageChrome.tsx` / `pinned.json` (“settings/admin keep `PageHeader`”). That exception is deleted **in the same change that mounts the desk frame** — not before, not as a drive-by. Until then the pin stays true: do not half-port one settings route onto `DeskPageChrome` while siblings still use `PageHeader`.

**Composes, does not fork:**  
[`desk-page-chrome-fixed-width-PLAN.md`](./desk-page-chrome-fixed-width-PLAN.md) · [`desk-page-header-industry-standard-HANDOFF.md`](./desk-page-header-industry-standard-HANDOFF.md) · `src/design-system/tokens/desk-stage.ts` · `docs/partial/HUMAN-TODO.md` §B5.

**Out of scope:** deleting APIs, `src/lib/settings/registry.ts`, permission gates, RLS, billing Stripe portal, integration connectors. Capabilities stay. **Chrome, duplicate navigators, and per-section page shells go first.**

**Lighthouse (do not rewrite the north star):** `/settings` is Tier-2 desktop (floor 94, LCP ~1.55s). Success is **no regression** then ratchet toward 95. Do not pull Admin catalogs or `DataTable` into the personal first-paint graph. Dynamic-import inactive bodies. Measure production + auth cookie + desktop + idle host. Never lower a floor. Never strip Tier-1 density to pay for this.

---

## 0 · Why remove first

The inconsistency is **two houses and three grammars**, not a missing settings feature.

| House | URL | Navigator | Body grammar today |
|---|---|---|---|
| Settings personal | `/settings?section=` | `SettingsSidebar` (360px rail, 20+ rows) | Hand `*Section.tsx` inside `max-w-3xl px-6 py-8` |
| Settings org | `/settings/staff`, `/roles`, `/access`, `/integrations`, `/billing`, `/ai`, `/organization`, `/audit` | Same rail, then drill-in for roles/access | Each route invents `PageHeader` + `maxWidth="5xl"` |
| Admin ops | `/admin?section=` | `AdminContextPanel` → `AdminSidebar` | Mega `page.tsx` switch of `*Tab` components, full-bleed canvas |
| Inventory admin | `/admin/inventory/*` | Third island | More `PageHeader` |

Wrapping that in `DeskPageChrome` **before** deletion would freeze the mess inside a nicer card: two sidebars + desk tabs + leftover `PageHeader` + the old `max-w-3xl` inner pad. That is a fourth grammar.

**The desk frame is Phase D. Phases A–C only delete.**

Already landed (do not redo): `HouseSectionRail` shared by Admin/Settings; settings row icons from `@/components/Icons`; `src/lib/{admin,settings}/*-sections.ts` re-export the live catalogs. Those are **temporary**. The rail itself is on the kill list.

---

## 1 · Locked split (B5 — do not reopen)

| Layer | Job | Surviving URL after teardown | What the operator sees |
|---|---|---|---|
| **Personal** | This staffer, this device | `/settings` (one body, registry groups) | Desk card: Hardware, workstation, appearance, keyboard, receiving policy they own, security, about, legal |
| **Organization** | Tenant config | `/settings/*` as **desk tabs**, not a second product | Team, roles, access, billing, integrations, AI, org policy, sessions, kiosk, audit |
| **Ops catalogs** | Heavy pickers / power tools | Stay `/admin?section=` until a later catalog desk | FBA, locations, reason codes, suppliers, Bose, PO mailbox, logs, goals, quality, schedule, NAS folders, sync tools |
| **Inventory admin** | Unit/SKU admin | `/admin/inventory/*` until Inventory desk owns them | Holds, events, cycle counts, … |
| **Platform** | Cycle Forge staff, not tenant | Does not exist in-app | Out of scope |

Deep links and existing redirects **stay** (`/admin?section=staff` → schedule, `/admin?section=integrations` → `/settings/integrations`, `LEGACY_REDIRECTS` on `/settings?section=`). Do not invent `/org-admin`.

Mixed personas: org tabs keep `requires:` on `SIDEBAR_PAGE_NAV` children. Catalogs stay behind `admin.view` + per-row perms. Personal `/settings` stays ungated for signed-in staff (today’s law at `sidebar-navigation.ts`).

---

## 2 · Kill list (UI / UX / components)

Delete **paint and navigators**. Keep the domain modules they called (tables, APIs, registry rows) until a later phase re-homes them.

### 2.1 Dual house chrome (delete in Phase A)

| Kill | Path | Why |
|---|---|---|
| Settings context rail | `src/components/sidebar/SettingsSidebarPanel.tsx` | 20-row Personal/Organization list is a second product map. Desks tab; they do not keep a 360px section encyclopedia. Pattern E (Home, Media Library, Search). |
| Admin context rail | `src/components/sidebar/AdminContextPanel.tsx` + `src/components/admin/AdminSidebar.tsx` | Same job as the settings rail, different house. Overview list + drill-in header is the Admin product. |
| Shared rail shell | `src/components/sidebar/HouseSectionRail.tsx` | Only those two tenants. After both rails die, this file has zero callers — delete it. |
| Route-key reservation | `'settings'` and `'admin'` in `CONTEXT_PANEL_ROUTE_KEYS` | Removing the key **collapses the column**. Empty rail is not the kill. |
| Dispatcher branches | `SidebarContextPanel.tsx` `routeKey === 'settings' \| 'admin'` | Dead dynamic imports. |
| Settings drill panels in the rail | `RolesSidebarPanel` / `AccessSidebarPanel` mounts **inside** the settings rail | Roles/Access already have dedicated routes. The rail drill is a second navigator onto the same URLs. |
| Admin drill panels as **section pickers** | `GoalsSidebarPanel`, `StaffScheduleSidebarPanel`, `FbaCatalogSidebarPanel`, `LogsSidebarPanel`, `NasPhotosSidebarPanel`, sourcing `*SidebarPanel` **as Admin overview children** | Each catalog’s **filter/search rail** may survive **on that catalog’s own desk later**. What dies is “pick FBA from a nested Admin sidebar.” |

Do **not** delete `AdminSidebarShell` until catalog pages no longer use it as a **filter well** (FBA/suppliers). That shell is a picker layout, not the house list. Phase A only stops **house navigation** from using it.

### 2.2 Hand page chrome (delete in Phase B)

Every settings/org route that paints its own title + max-width is a fork of `DeskPageChrome`. **Remove those headers and width wrappers** so the body is a naked domain widget. The desk frame (Phase D) is the only title/CTA/measure.

| Kill | Typical files |
|---|---|
| `PageHeader` on settings org routes | `src/app/settings/integrations/page.tsx`, `[provider]/page.tsx`, `billing/page.tsx`, `ai/page.tsx`, and any sibling that passes `eyebrow="Settings"` / `maxWidth="5xl"` |
| `PageHeader` on `/admin/inventory/*` | Leave until Inventory is its own desk **or** until that island is explicitly in a later wave. **This plan’s desk is `/settings`.** Do not “unify” inventory headers in Phase B. |
| Hand stage on `/settings` | `max-w-3xl px-6 py-8 sm:px-10` in `src/app/settings/page.tsx` |
| `bg-surface-canvas` full-bleed flex shells | Settings page wrapper; Admin page `h-full w-full bg-surface-canvas` with no stage |
| Duplicate identity strings | “Settings” as `PageHeader` eyebrow **and** spine label **and** rail title |

### 2.3 Personal section **pages** (delete in Phase B)

`SETTING_PAGES` is still only `'receiving'`. Everything else is a custom section component pretending to be a product page.

**Keep the capability; delete the page shell.** Destination: **one** `SettingsPanel` (or grouped registry pages) inside the desk card.

| Kill as a route-level UI | File | Fold into |
|---|---|---|
| Hardware page | `sections/HardwareSection.tsx` (+ `PrintPreferences.tsx` if only used there) | registry groups `hardware` / existing print prefs as controls |
| Workstation | `WorkstationSection.tsx` | registry + existing station/role pickers as **controls**, not a page |
| Quick Access | `QuickAccessSection.tsx` | registry or a single card inside Personal |
| Appearance | `AppearanceSection.tsx` | registry (`AppearanceApplier` stays as a **runtime applier**, not a page) |
| Keyboard | `KeyboardSection.tsx` | registry |
| Security | `SecuritySection.tsx` | registry / existing PIN-passkey widgets as controls |
| Sessions | `SessionsSection.tsx` | Organization tab body (list), not a personal `?section=` |
| Kiosk devices | `KioskDevicesSection.tsx` | Organization tab |
| Catalog (platforms & types) | `CatalogSection.tsx` | Organization tab **or** ops catalog later — not a personal section |
| Stations nicknames | `StationsSection.tsx` | Organization tab |
| About | `AboutSection.tsx` | footer of Personal card or a registry group — not a nav row |
| Legal | `LegalSection.tsx` | links in Personal footer |
| Receiving as a **fake section page** | `/settings?section=receiving` switch | already `SettingsPanel page="receiving"` — keep the **panel**, drop it from the 14-way `INLINE_SECTIONS` map by making receiving a **group on the one Personal panel** |

`src/app/settings/page.tsx` `INLINE_SECTIONS` map **dies** when there is one Personal body.

`settings-sections.ts` as a **20-id sidebar catalog** dies with the rail. Replace with `SIDEBAR_PAGE_NAV` children (desk tabs) + registry `SETTING_PAGES`.

### 2.4 Admin mega-page switchboard (delete in Phase C)

`src/app/admin/page.tsx` `renderTab()` + `getAdminSection` is a second app router. **Do not** port it onto desk tabs as 16 modes. That recreates the Admin product inside `DeskPageChrome`.

Phase C:

1. Stop using `?section=` as the Admin **information architecture**.
2. Each **surviving** catalog gets **its own route** (or an existing desk): e.g. FBA already has `/fba`; locations should live with Inventory/Warehouse; PO mailbox with Incoming; logs with audit. **Redirect** `/admin?section=fba` → the real desk.
3. What has **no** real desk yet stays on `/admin` **temporarily** as a **stub index of links** — not a switchboard that mounts 16 tab modules in one file. `AdminOverviewTab` quick-links that duplicate MasterNav **die**.
4. Delete `ADMIN_SECTION_OPTIONS` as a **UI catalog** once every row redirects. Keep aliases **only** as redirect tables.

Do **not** in Phase C: merge Queue/Viewed/History, touch overlay `visibility` / `zIndex.panel`, invent Operator verdict, mount `FilterRefinementBar`, hunt tiles.

### 2.5 Explicit keep (not chrome)

| Keep | Why |
|---|---|
| `src/lib/settings/registry.ts` + `SettingsPanel` + `SettingControl` | The only declarative settings renderer. Expand `SettingPage` beyond `'receiving'`. |
| `AppearanceApplier` | Theme/density runtime. |
| Org **workbench** bodies | `StaffTable`, roles editor, access matrix, integrations vault, billing portal — they are the product. They lose **their** `PageHeader`/max-width, not their tables. |
| Catalog **domain** tabs | `FBAManagementTab`, `LocationsManagementTab`, … as **bodies of other desks**, not as Admin `?section=` faces. |
| APIs, permissions, `requirePermission` | Untouched. |
| `/studio` | Full-canvas; never this frame. |
| Scan stations | Stay `bleed` / edge-to-edge. Settings must not import `StationComposerHost` or `station-skins`. |

---

## 3 · Sequence (do not skip)

### Phase A — Collapse the spine (chrome only)

**Status: done 2026-09-02.** `/settings` and `/admin` are off `CONTEXT_PANEL_ROUTE_KEYS`. House rails deleted (`SettingsSidebarPanel`, `AdminContextPanel`, `AdminSidebar`, `HouseSectionRail`).

**Done when:** `/settings` and `/admin` paint **no** left context panel. Master nav still has Settings (⋯ / `spineBand: false`) and Admin (until Phase C redirects empty the house).

1. Drop `'settings'` and `'admin'` from `CONTEXT_PANEL_ROUTE_KEYS`.
2. Remove `SidebarContextPanel` branches; delete `SettingsSidebarPanel.tsx`, `AdminContextPanel.tsx`, then `AdminSidebar.tsx` if it has no remaining importer, then `HouseSectionRail.tsx`.
3. Roles/Access: landing is the **route** (`/settings/roles`, `/settings/access`). No rail drill.
4. Snapshot eval: `verify:fast` only. No paint on tables. No cohort overlay.

**Do not** mount `DeskPageChrome` in this phase. The body will look worse (full-bleed form, no rail). That is intentional — it proves the navigator is gone.

### Phase B — One Personal body, naked org bodies

**Done when:** `/settings` has **no** `?section=` switchboard and **no** `INLINE_SECTIONS`. Personal is one scroll of `SettingsPanel` (multiple `SettingPage` ids or groups). Org routes render **only** their workbench (table/form), no `PageHeader`, no `max-w-*`.

1. Extend `SettingPage` / `SETTING_PAGES` for personal groups (hardware, appearance, keyboard, security, receiving). Port controls from hand sections **row by row**. Delete each `*Section.tsx` when its last control has a registry row.
2. Move sessions / devices / catalog / stations **off** `/settings?section=` onto org routes (or the org tab that will exist in Phase D). Redirect old `?section=` keys.
3. Strip `PageHeader` + width wrappers from `/settings/integrations`, `billing`, `ai`, `organization`, `staff`, `roles`, `access`, `audit`.
4. `getActiveSettingsSection` / `SETTINGS_SECTION_OPTIONS` shrink to **redirect tables** then die.

**Lighthouse:** dynamic-import org workbenches; Personal first paint is registry HTML only.

### Phase C — Empty `/admin` as a house

**Done when:** `admin/page.tsx` no longer imports 16 tab components. Every former `ADMIN_SECTION_OPTIONS` row is a **redirect** to a real desk or a **single leftover** “Catalogs” index that is a list of links (no mounted tabs).

Redirect map (illustrative — confirm against live `href`s before coding):

| Old | New (prefer existing desks) |
|---|---|
| `fba` | `/fba` (or Shipping Amazon Prep tab) |
| `locations` | Inventory / warehouse locations desk |
| `po_mailbox` | Incoming / unbox intake |
| `logs` | `/settings/audit` or `/audit-log` (one audit, not two) |
| `staff_schedule` | keep until a Schedule desk exists — **last** Admin body |
| `goals` / `quality` | Operations or leave as last Admin stubs |
| `connections` / `system_sync` | `/settings/integrations` diagnostics |

Duplicate audit (Admin logs vs Settings audit vs `/audit-log`) is **UX to delete**: one audit surface.

### Phase D — Settings wears the desk (only after A–C)

**Done when:** `/settings` and `/settings/*` sit in a **route group** that mounts `DeskPageLayout`. `deskChrome: true` on the Settings `SIDEBAR_PAGE_NAV` entry. Children are **in-page `DeskTab`s**, not a rail.

1. **Strike the pin.** Edit `DeskPageChrome` file header + `pinned.json` `doNot`: settings **is** an operator desk. Inventory-admin and Studio remain excluded until their own plans. Detail panels still use `PageHeader`.
2. Add `src/app/(desk)/settings/layout.tsx` (or the existing desk route-group pattern) wrapping settings segments: `<DeskPageLayout>{children}</DeskPageLayout>`.
3. Declare `children` + `resolveChild` on Settings nav: e.g. Personal · Team · Roles · Access · Integrations · Billing · AI · Organization · Audit. **Few tabs.** Do not resurrect 20 Personal rows as tabs.
4. Title comes from `SIDEBAR_PAGE_NAV` via `DeskPageLayout` — **no title literal**.
5. Body is the **detached card**: `DESK_CHROME_STAGE_BODY_CLASS` + `DESK_STAGE_FIXED_CLASS` + `DESK_STAGE_GUTTER_CLASS` + `DESK_STAGE_FLOOR_CLASS`. Personal = `SettingsPanel` inside the card. Org tabs = existing workbenches inside the **same** card (they already know `DataTable`; the table’s toolbar stays on the table).
6. Fullscreen: only org **table** tabs need `DataTableFullscreenToggle`. Personal form does not grow a fake ⤢.
7. CTA slot: Integrations “Add connector” / Team “Invite” register via `DeskActionSlotRegistrar` — **not** a settings-only header button.
8. `ds_contract` / `ds_tokens` (`radius` → `cornerClass('surface')` for any inner form cards; desk stage tokens for the frame) / `ds_critique` on every file that still paints. Do not guess `rounded-*`.
9. Eval: `cursor-eval --fast`. If `DataTable` / slot layout is touched on org tabs, `pnpm run eval:cohort slot-table`. No overlay cohort. No funnel fold.

**Tab vs rail:** Settings becomes **railless** (`railless: true` **or** simply absent from `CONTEXT_PANEL_ROUTE_KEYS` — same as Media Library). The tab row **is** the navigator.

### Phase E — Registry completeness (no new chrome)

Expand `docs/settings-registry.md` as personal groups land. Guard test `registry.test.ts`. Org **policy** that is a toggle belongs in the registry; org **workbenches** stay tables.

---

## 4 · What the operator sees (after D, not after A)

```text
┌ stage: DESK_STAGE_MAX_PX, centred, px-4 gutters, pb-4 floor ─────────────┐
│                                                                          │
│  Settings                                      [ Invite / Add / … ]      │  ← DeskPageChrome header
│                                                                          │
│  Personal   Team   Integrations   Billing   …                            │  ← DeskTab row
│  ────────                                                                │
│                             ↕ mt-4 detachment                            │
│  ┌ rounded-lg card, overflow-hidden, bg-surface-card ─────────────────┐  │
│  │  SettingsPanel groups  OR  DataTable / vault                      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

No left encyclopedia. No `?section=` personal map. No Admin second house in the spine once Phase C redirects are complete (Admin row **removed** from `APP_SIDEBAR_NAV` when `/admin` is only redirects).

---

## 5 · Laws this plan may not break

- **One desk frame.** No `max-w-3xl` inside the card “because settings is a form.” Inner forms use `TriageScrollLayout` / `cornerClass('surface')` if they need cards; the **page** measure is `DESK_STAGE_*`.
- **Scan stations stay edge-to-edge.** Settings never `bleed`.
- **Slot-table paint law** on any org tab that is a `DataTable`: every DATA header click-sorts; `DataTableFilterMenu` always mounted; no `FilterRefinementBar`; ship-by is `DateRangePickerField variant="compact"`.
- **Shortcuts:** staff `?` paints letters on desk CTAs; no cheat sheet from the table-foot `?`.
- **Do not** delete overlay `visibility` / `zIndex.panel`.
- **Do not** fold Unbox Queue/Viewed/History into a settings funnel.

---

## 6 · Acceptance

| Gate | Passes when |
|---|---|
| Chrome | Zero settings/admin **context rails**. `HouseSectionRail` gone. |
| Personal | One `/settings` body. `INLINE_SECTIONS` gone. Hand `*Section.tsx` page shells gone. |
| Org | No `PageHeader` on `/settings/*`. Workbenches live in the desk card. |
| Admin house | `admin/page.tsx` is redirects + at most a link stub. Spine Admin row gone or points at Settings. |
| Desk | `DeskPageLayout` on settings route group. Pin updated. Gutters + radius + non-bleed visible on a 13" laptop (stage < canvas). |
| Verify | `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast` green. Slot-table cohort if org tables moved. |
| Lighthouse | `/settings` floor not lowered. Personal LCP still a short form, not Integrations + StaffTable. |

---

## 7 · Suggested session slices (one kill each)

1. Drop context keys + delete settings/admin rails (`HouseSectionRail` last).  
2. Strip `PageHeader`/max-width from all `/settings/*` org pages (bodies only).  
3. Collapse Personal to `SettingsPanel`; delete `INLINE_SECTIONS` + unused `*Section.tsx`.  
4. Redirect the first unblocked Admin `?section=` (FBA or logs — pick one).  
5. Mount `DeskPageLayout` + strike the pin.  
6. Remove Admin spine row when `/admin` is empty.

Do not combine slice 5 with 1–4 in one PR.
