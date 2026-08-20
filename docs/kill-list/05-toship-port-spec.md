# Port spec — `/shipping/orders` → the Unbox frame

The first port. Operator: *"the two shipped page is good, but needs updates."*

## Current composition (verified)

```
src/app/shipping/orders/page.tsx
  └─ OutboundOrdersDeskShell            src/components/outbound/orders/OutboundOrdersDeskShell.tsx
      └─ OutboundOrdersDesk             src/components/outbound/orders/OutboundOrdersDesk.tsx
          └─ ToShipWmsShell             to-ship/ToShipWmsShell.tsx        (42 lines)
              ├─ ToShipRecentRail       to-ship/ToShipRecentRail.tsx      (102 lines)
              └─ ToShipDeskGridHost     to-ship/ToShipDeskGridHost.tsx    (24 lines)
                  └─ OrdersGridHost     dashboard/orders-queue/OrdersGridHost.tsx
                      └─ NonlinearTableHost ✅
```

RSC seeds via `seedUnshippedQueue()` into a `HydrationBoundary`, with `OrdersQueueFirstPaint`
as the `sr-only` LCP stand-in — the Packer golden paint order. **Keep this; it is correct.**

## Gap 1 — no right-edge inspector ✅ CONFIRMED

`ToShipWmsShell` does not appear in the `RightRailHost` census. Order detail has no pushing
right edge; `/unbox` gets one through `UnboxWorkspaceView`.

**Fix:** register the order-detail occupant via `useRegisterRightPanel`, mounted through the
host-owned `RightRailHost` (`modal={false}`). Hard constraints from `AGENTS.md`:

- **ONE control, ONE closer.** `RightRailHost` paints the single `X` (top-**right**);
  `closeRightPanel()` unmounts, caches `draftData`, toasts Resume, and runs the occupant's own
  `onClose`. The occupant must **not** mount a second close — not a header twin, not a `→|`
  beside a submit CTA.
- Esc and `Mod+Shift+R` are already handled in `handlePanelStoreKeydown` — do not re-bind.
- Frame budget: `MIN_WORK_SURFACE_PX` (784) for the desk center; gutters `0`.

`UnshippedDetailsPanel` / `ShippedDetailsPanel` already exist — audit whether they can be the
occupant rather than writing a third.

## Gap 2 — rail is a page-local fork ✅ CONFIRMED

`ToShipRecentRail.tsx:7` states it plainly: *"Scoped to the desk body — not the global
ContextPanelLayout rail (Pattern E)."* It imports `SidebarShell` from
`@/components/layout/SidebarShell` and renders `useRecentDetailStacks` itself.

**Fix:** move the desk onto the global `ContextPanelLayout` occupant, the way `/unbox` does
(`ResponsiveLayout` renders `<ContextPanelLayout>{children}</ContextPanelLayout>` — the rail is a
*sibling* of the page, not a child). Note the structural consequence documented in
`src/app/unbox/page.tsx`: **the seed cannot live in the page**, because the rail renders *before*
the page tree. Unbox hydrates it above the shell via `maybeSeedUnboxShell` from the root layout —
the ToShip port needs the equivalent, or the rail will server-render empty.

Retire `ToShipRecentRail` once the global rail serves the desk.

## Gap 3 — "grid isn't the registry host" ❌ DISPROVEN

This one is already correct in the code. `ToShipDeskGridHost` → `OrdersGridHost` →
`NonlinearTableHost` over `LedgerGridSurface`, with a registry binding
(`to-ship-desk-table-definition.ts`, registered in `src/components/tables/registered-bindings.ts`).

**No work here.** Flagging rather than building a port task on a wrong premise.

The adjacent real issue is different: `ToShipDeskTable` is imported by *both*
`DashboardOrdersView` and `registered-bindings.ts` — two doors into one table. Per
`pattern-evolution.md` law 6, knip cannot see a fork whose doors are both imported. Confirm
`/dashboard`'s outbound view is the 308-redirect path and not a live second mount.

## Gap 4 — no scan / keyboard-first floor ✅ CONFIRMED

`createWedgeKeyListener` has 5 consumers, none on the outbound desk.

**Fix:** mount the wedge via `useWedgeScanner` (native capture `keydown`, yield-before-React).
Hard law: **never** a React synthetic `onKeyDown` for scanner input, never drop focus, never run
scan side-effects on the keydown stack. The `feat(to-ship)` commit
(`add6eb8e0`, keyboard-first Add/Import on the ingest index rail) is the partial precedent —
extend `OrderIngestRail`, do not fork beside it.

## Verification

- `npm run verify` green — lint · typecheck · unit · knip · **jscpd** · depcruise · route-auth · schema.
  jscpd matters here: collapsing a twin should make the clone gate *happier*, never worse.
- E2E against the **QA org** (`--project=qa-desktop`), never the dogfood tenant.
  `to-ship-pending-grid.spec.ts` already asserts `[data-col="stock"]` count 0 — keep it green.
- Frame geometry claims get measured in Playwright, not the preview pane.

## Not in scope for this port

`/tech` is the operator's next target ([`04`](04-parked-surfaces.md)). Do not migrate other
call sites in this pass — `pattern-evolution.md` says recommend first, expand later.
