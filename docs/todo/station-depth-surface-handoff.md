# Handoff: App surface SoT + station three-depth stack

**Lane:** `main` (WS-DOGFOOD)  
**When:** 2026-07-18/19  
**Status:** Implemented; verify green. Not committed unless user asked.

---

## Goal

1. One SoT for chrome / canvas / page-wash backgrounds + Appearance picker.
2. Soft TL radius join at master-nav × global header.
3. Three-depth Unbox stack: **work canvas (1) > chrome/scan (2) > wash (3)** — fix scan-bar vs canvas competing elevation.

---

## Decisions locked

| Topic | Decision |
|---|---|
| Backgrounds | Shell + primary page washes pin to DS; **Page background** in Appearance (device-local `cf.appearance.pageWash`) |
| Unbox gradient | Named wash preset `mint` (default) |
| Master-nav hairlines | Strip all top horizontal + vertical chip dividers |
| Sidebar edge | No hard `border-r`; canvas left hairline is the join |
| Depth | Elevate **only** work canvas; scan band stays flush chrome; canvas edge uses readable `border-border-soft` (not near-invisible hairline) |
| Scope of depth pass | Unbox-first + Triage twin; Labels/etc. adopt later |

---

## Architecture (current)

```
Depth 3  appWashClass          ReceivingSurfacePage / ReceivingDashboard
Depth 2  appChromeClass        header, master nav, sidebar, scan band (flat)
Depth 1  appWorkCanvasClass    UnboxLineWorkspace / TriageLineWorkspace
                                 rounded-tl-2xl + border-border-soft + shadow-sm
```

- Outer `<main>` [`appContentShellClass`](../../src/components/layout/header-shell.ts): **cutout only** (`rounded-tl-2xl`, **no border**) — does not compete with canvas stroke.
- GlobalHeader: **no** `border-b` (canvas owns separator).
- Band hairlines: `appChromeBandHairlineClass` (theme `border-default` inset) via `receivingHeaderHairlineClass`.
- Wash host: **one** per stack (`ReceivingSurfacePage` / admin tabs) — not nested on `ReceivingDashboard`.

---

## SoT module

[`src/design-system/tokens/app-surface.ts`](../../src/design-system/tokens/app-surface.ts)

| Export | Role |
|---|---|
| `appChromeClass` | Flat chrome fill |
| `appChromeMutedClass` | `bg-surface-card/95` header frost |
| `appCanvasClass` | Flat canvas hosts |
| `appWashClass` | `.app-wash` + `data-app-wash` CSS vars |
| `appWorkCanvasClass` | Elevated station work plane (`border-border-soft` depth edge) |
| `appWorkCanvasEdgeClass` | Readable plane stroke (not `border-hairline`) |
| `appChromeBandHairlineClass` | Inset band rule (theme `border-default`) |
| `WASH_PRESETS` | mint · cool · slate · dawn · flat |

CSS: [`src/styles/globals.css`](../../src/styles/globals.css) — `html[data-app-wash=*]` + `.app-wash`  
Apply: [`src/lib/settings/appearance.ts`](../../src/lib/settings/appearance.ts) → `AppearanceApplier`  
UI: Appearance → **Page background** ([`AppearanceSection.tsx`](../../src/components/settings/sections/AppearanceSection.tsx))  
Tests: [`app-surface.test.ts`](../../src/design-system/tokens/app-surface.test.ts)

---

## Key files touched

**Shell / join:** `ResponsiveLayout.tsx`, `GlobalHeader.tsx`, `header-shell.ts`, `SidebarShell.tsx`, `DesktopShell.tsx`, `layout.tsx`  
**Master nav:** `MasterNavView.tsx`, `MasterNavHeader.tsx`, `ModeRail.tsx`, `HorizontalButtonSlider.tsx` (flush: no hairline)  
**Depth 1:** `UnboxLineWorkspace.tsx`, `TriageLineWorkspace.tsx`, `UnboxWorkspaceView.tsx`, `TriageWorkspaceView.tsx` (removed nested feed well)  
**Scan chrome:** `ReceivingScanBands.tsx`, `station/scan-bar/tokens.ts` (float rail: ring, no drop shadow)  
**Wash hosts:** `ReceivingSurfacePage.tsx`, `ReceivingDashboard.tsx`, admin `*ManagementTab` / `StaffScheduleTab`  
**Sidebar roots:** many `*SidebarPanel.tsx` + `RouteShell.tsx` → `appChromeClass`

---

## What still competes / next (not done)

1. **Labels / Shipping scan hosts** — still can look like elevated cards vs canvas; apply same flush-band + `appWorkCanvasClass` pattern.
2. **Other stations** (Testing, Packer, FBA) — SoT ready; not migrated.
3. Visual QA: Unbox TL edge readable on mint wash + dark themes; open line overlay stays inside elevated host.

---

## Verify / worklog

- `npm run verify` passed after depth stack.
- Worklog: *App surface SoT…* and *Station depth stack: Unbox/Triage appWorkCanvasClass…*

---

## Compound note for next agent

Do **not** elevate scan band and work canvas together. Prefer growing `appWorkCanvasClass` / wash SoT over page-local shadows. Unbox is the golden path; Triage already mirrors the host.
