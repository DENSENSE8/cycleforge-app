# CycleForge frontend boundaries

## Package split

```text
apps/
├── web/                         # Next.js desktop package boundary
│   ├── package.json
│   └── README.md                # staged extraction map; current source is root src/
└── mobile/                      # Expo + React Navigation native app
    ├── App.tsx
    ├── app.json
    ├── package.json
    ├── src/navigation/          # L1-L4 native route tree
    ├── src/hooks/               # mobile-only native subscriptions
    └── src/scanner/             # platform-neutral scanner payload parsing
packages/
└── shared/                      # platform-neutral API client, query hooks, types
    └── src/
src/                             # existing Next.js implementation (web app)
```

## Component split (binding)

Mobile and desktop never share rendered components. The shared surface is
primitives, logic, and data — nothing that paints a feature.

| Layer | Who may import it | Web examples |
|---|---|---|
| **Platform primitives** | every web surface | `src/design-system/**`, `src/components/ui/**`, `src/components/Icons`, `components/identity` (StaffAvatar etc. — primitives by shape, consumed by both surfaces; amended 2026-09-14 at C1), `components/providers`, `components/error` |
| **Surface components** | only the owning surface | `src/components/mobile/**` + `src/app/m/**` on one side; desktop feature dirs (`station/`, `receiving/`, `shipped/`, `packing/`, `outbound/`, `inventory/`, `search/`, `identification/`, `kiosk/`, `auth/`, `qr/`, `barcode/`, desk routes) on the other. **Imports across this line are forbidden, both directions.** |
| **Logic** | everything | `src/lib/**`, `src/hooks/**`, `src/contexts/**`, `src/utils/**`. The platform-neutral subset graduates to `packages/shared` when Expo needs it. |

Rules:

1. `apps/mobile` imports only itself and `@cycleforge/shared` — never `src/**`,
   never `apps/web`.
2. Web surface components do not cross: `components/mobile/**` and `app/m/**`
   never import desktop feature-component dirs, and non-mobile components
   never import `components/mobile/**`. Desktop consumes the mobile SoT by
   embedding the `/m` frame (SURFACE_LAW §4), not by importing mobile internals.
   A component in the mobile tree that desktop needs (`ScanAgainBar`,
   `NetworkChip`, `ScanSurface` today) is a platform primitive misplaced —
   promote it to `components/ui/**` or fork it; it does not stay shared.
3. Shared domain vocabulary, types, and hooks move to `src/lib/**` (or
   `packages/shared`) — a component file is not a home for another surface's
   types. Type-only imports across the line are still crossings: move the type.
4. Mobile components live under `src/components/mobile/**` or colocated in
   `/m` (e.g. `_picker/`). Scatter is judged by what renders on the phone
   surface, never by a Mobile-prefixed name — admin's
   `cards/MobileDisplayCard.tsx` *configures* mobile display for a staff
   member via `lib/auth/mobile-display-config` and is correctly an
   admin-surface card (the right pattern: desktop configures mobile behavior
   through shared logic, no component crossing). Known scatter to move in
   (2026-09-14 baseline): `components/repair/mobile/` (2 files),
   `components/layout/MobileRouteShell.tsx`.
5. The only sanctioned rendered-component shares are explicitly listed in the
   boundary exemption file (shrink-only; every entry must eventually split or
   be ratified as a shared job face). Unlisted shares fail the gate.

Enforcement: dependency-cruiser gate wired into `verify`, following the house
exemption pattern (`scripts/tenancy-guard-exemptions.ts`) — a visible,
shrink-only list, never a silent allow.
