# Handoff — nested tabs inside the Station Displays column

**Surface:** the right-edge **Displays** push column (`src/components/station/displays/`) on Unbox · Arrival · Testing · Pack · Shipping · Packer review · Support orders.
**Not in scope:** desk `RightRailHost` inspectors (`components/right-rail/`) — different region, different noun.
**Created:** 2026-08-07 · **Status: DONE 2026-08-08**

## Ruling (locked)

Root Index is the only **subject** lateral layer. Inside a leaf, choose **exactly one**:

| Kind | When | Mechanism |
|---|---|---|
| Parent underline | Distinct **action verbs** | ≤1 `TabDisplay appearance="underline"` |
| Secondary vertical | **Reference sections** | Vertical rows + `useDisplaysLeafChrome` trail |
| Child segment | Perspective under a parent / claim | `TabDisplay appearance="segment"` |

**Never both** parent underline and secondary vertical in the same leaf. **Never** a second `StationDisplayLeafHeader`. Soft `TabSwitch` / `rounded-full` pills banned.

**Deferred (do not invent until this guard stays green):** contextual leaf search, `/` command actions in the footer bar, Alt+1/2 w1/w2 branding.

## Inventory (post-ruling)

| Leaf | Nested switcher | Notes |
|---|---|---|
| Photos | Armed-row Actions (default) + URL drills Move·Send·Compare; Move To·From = child segment | `PhotosDisplayHost` · `PhotosActionsArmedList` · `MovePhotosBetweenPoPanel` |
| Linkage | Parent underline Link·Note; avenue dropdown under Link | `LinkageDisplayHost` |
| Units | Parent underline Units·Prebox; Prebox mode = child segment | `UnitsDisplayHost` · `PreboxWizard` |
| Inventory | Secondary vertical Information·Lines·PO notes·Activity | `InventoryDisplayHost` + `useDisplaysLeafChrome` |
| Ticket | Presence-exclusive; Claim New·Link = child segment | `TicketDisplayHost` · `ClaimWizardNav` |
| Support (hub) | Child segment Team·Activity (Customer hidden when Ticket owns it) | `SupportContextSegments` → TabDisplay segment |
| Listings / Timeline | One underline via `SectionTabsSlider` when ≥2 spines | Not a second subject layer |
| Arrival Pairing | Avenue dropdown only | No parent TabDisplay |
| Classify · Tracking · Pack photos · … | none | Single body |

## Files / guards

- Law: `.claude/rules/source-of-truth.md` → Station Displays navigation · `.claude/rules/display/station-workbench.md` → Displays Root Index
- Guard: `src/components/station/displays/station-displays-nested-grammar.guard.test.ts`
- Hosts: `PhotosDisplayHost` · `LinkageDisplayHost` · `UnitsDisplayHost` · `InventoryDisplayHost` · `TicketDisplayHost` · `SupportContextSegments`

## Definition of done

- [x] Enumerated nested switchers
- [x] One ruled grammar written into SoT + station-workbench
- [x] Applied (Prebox → segment; Support soft pills → TabDisplay segment)
- [x] Guard green
- [x] Inventory “stacked dossier” stale prose corrected
