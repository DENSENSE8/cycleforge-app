# MasterNav section-drill spine — handoff

> **⚠️ SUPERSEDED 2026-08-01 → [`sidebar-spine-validation-simplification-HANDOFF.md`](sidebar-spine-validation-simplification-HANDOFF.md).**
> The spine it describes shipped, then moved on. **Do not follow the symbols or the map below** —
> they no longer match the code:
>
> | This doc says | Reality |
> |---|---|
> | `SPINE_DRILLS` / `spineDrillIdForPage` | **Deleted symbols** — now `SPINE_SECTIONS` / `spineSectionIdForPage` |
> | Root = Overview / Library / Floor / Desk / Stock | Overview → **Scan Stations** → Desk → Stock → **Labels** → **Products** → Library (Library is last) |
> | “Floor” | **Scan Stations** (the `id` is still `floor`) |
> | Stock drill = Products → Inventory → Warehouse | Stock = **Sourcing → Inventory → Warehouse**; Products is its own spine section |
> | (no Receiving subgroup) | Scan Stations nests a **Receiving** page-style subgroup header (icon + count; 4 members) |
>
> Kept only as lineage for *why* the drill grammar exists (opacity-only `spineDrill`, no
> horizontal slide on a push spine; auto-drill must not steal focus) — those decisions still hold.

**Paste into a new session:**

```
Read docs/todo/master-nav-spine-display-HANDOFF.md and start at §2.
Compose from SPINE_DRILLS + spineDrill SoT — do not invent a second spine grammar.
GlobalHeaderSearch + AI stay in GlobalHeader only — never pin those controls in the spine.
Search + Media page rows are kind:'top' pins above drills.
Attach to :3050; never start/restart/kill the dev server. User owns commits.
```

**Lane:** current checkout. User owns commits. Attach to `:3050`.

---

## 1. Shipped (keep)

| Piece | Where |
|---|---|
| Section drills | `SPINE_DRILLS` + `spineDrillIdForPage` in `sidebar-navigation.ts` |
| Root = buttons | Overview / Library / Floor / Desk / Stock → drill → back + pages |
| Top pin | Search → Media (`kind: 'top'`) above drill body |
| Motion | Opacity-only `framerPresence.spineDrill` / `framerTransition.spineDrill` |
| Auto-enter | `MasterNav.tsx` — cross-section nav enters drill; manual Back stays on root |
| Name-of-now | `MasterNavHeader` — left, `text-role-body font-semibold leading-tight`, no chevron |
| Search + AI controls | `GlobalHeaderSearch` in `GlobalHeaderActions` only |
| Guards | `main-nav-groups.guard.test.ts`, `station-nav-groups.guard.test.ts`, `header-mode.guard.test.ts` |
| Law | `.claude/rules/display/workbench.md` (section drills) |

**Do not regress:** modes = accordion + GlobalHeader Mode; Search/Media top pin;
Settings/Admin footer pin; no GlobalHeaderSearch/AI twin in the spine; no `x` slide
on drill swap.

---

## 2. Start here

Eyeball on `:3050` (open spine via header Show sidebar):

| Check | Expect |
|---|---|
| Top pin | Search above Media; visible on root and while drilled |
| Root | Overview / Library / Floor / Desk / Stock buttons; Settings/Admin pin |
| Floor drill | Centered **Floor** back; Receiving → … → Shipping; mode accordion |
| Stock drill | Centered **Stock** back; Products → Inventory → Warehouse |
| `/inventory` | Auto-enters Stock; focus not stolen to Back |
| `/search` or Media | Root map (no section drill); pin row active |
| Manual Back | Root map; URL unchanged |
| Header | Search + AI icons still in GlobalHeader rail |

Fix only token-legal type/spacing drift. Then `npm run verify -- --fast`.

Optional (Ask-first): extract `useSpineNavState` if MasterNavView is still a pure
pass-through with ≥6 expand/drill props — no React context.

---

## 3. Out of scope

- GlobalHeaderSearch / AI controls in the spine
- Mode drill altitude / Mode or Recents in the spine
- URL param for drill level
- Raising DS / knip baselines
- Unrelated WIP (print-bundle, route-perm, `StationPacking` typecheck)

---

## 4. Done when

- [ ] §2 eyeball table green on `:3050`
- [ ] Guards green; `npm run verify -- --fast` green
- [ ] No GlobalHeaderSearch / AI twin in `MasterNavView` (Search/Media page pins OK)
