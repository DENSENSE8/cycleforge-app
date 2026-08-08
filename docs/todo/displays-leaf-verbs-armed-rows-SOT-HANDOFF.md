# Handoff — Displays leaf verbs: armed rows (no parent TabDisplay)

**Status:** SoT locked 2026-08-08 (Photos golden). Linkage · Units are named debt.
**Lane:** Station Displays nested-leaf grammar
**Do not** add new parent-underline Displays leaves.

---

## Ruling (SoT)

Leaf-level **action verbs** under Station Displays use:

1. **Armed-row list** (`useArmedCursorList`) as the default leaf body
2. **URL drill-downs** for tools / evidence (`?photoAction=` pattern)
3. **Trail via `useDisplaysLeafChrome`** so Back / Esc pops drill → Actions → index

**Never** a nested parent `TabDisplay appearance="underline"` for those verbs.

Legal siblings:

| Shape | When | Golden |
|---|---|---|
| Armed rows + URL drills | Leaf-level action verbs | Photos |
| Secondary vertical | Reference sections | Inventory |
| Child `segment` | Mode **inside** a tool | Move To·From · Prebox mode · Claim New·Link · Support Team·Activity |
| Presence-exclusive | Mutually exclusive bodies | Ticket Chat vs Claim |

Detail: `.claude/rules/source-of-truth.md` → Station Displays navigation · Nested-leaf grammar.  
Recipe: `.claude/rules/display/station-workbench.md` → Displays Root Index / layer 3.

---

## Violations (debt allowlist — shrink-only)

| Host | Nested strip | Migrate to |
|---|---|---|
| [`LinkageDisplayHost.tsx`](../../src/components/receiving/workspace/line-edit/LinkageDisplayHost.tsx) | Link · Note underline | Armed rows + `?linkageAction=` drill (default Link) |
| [`UnitsDisplayHost.tsx`](../../src/components/receiving/workspace/line-edit/UnitsDisplayHost.tsx) | Units · Prebox underline | Armed rows + `?unitsAction=` drill (default Units); keep Prebox **child segment** for One master · One per unit |

Guard that names them: `station-displays-nested-grammar.guard.test.ts` (`UNDERLINE_PARENT_HOSTS`).
Migrating a host **removes** it from that list — never add another Displays leaf.

### Not violations

- `MovePhotosBetweenPoPanel` — child `segment` (To · From)
- `PreboxWizard` — child `segment` (mode inside Prebox)
- `ClaimWizardNav` — child `segment`
- `SupportContextSegments` — child `segment`
- Desk `ShippedDetailsBody` / Order inspector — different region (not Station Displays)

---

## Photos polish (done this pass)

- `PhotosDisplayHost` reports drill trail via `useDisplaysLeafChrome` (Compare · Move · Send → Actions on Back / Esc).

---

## Agent prompt (Linkage / Units migrate)

```
Migrate LinkageDisplayHost and/or UnitsDisplayHost from parent TabDisplay
underline to armed-row + URL drill (Photos pattern).

Compose PhotosActionsArmedList / PhotosDisplayHost + useDisplaysLeafChrome.
Keep child segment for Prebox mode / Move To·From / Claim.
Remove migrated host from UNDERLINE_PARENT_HOSTS (shrink-only).
Never re-add parent underline under Photos.
npm run verify -- --fast + station-displays-nested-grammar + photos-actions-armed.
```
