# Speed Index + INP — scan / PO triage

Execution plan for green Lighthouse SI and INP on Incoming / Unbox / Unshipped
during continuous HID wedge scanning and live NDJSON / Ably paints.

Constraints honored: no Server Actions for live data, no storage webhooks,
no CSS bounce/scale/glow, no dropped focus, native wedge keydown, orthogonal
exception dimensions stay on the row (`SCANNED + PROBLEM` is not a pass/fail).

## A. Main-thread yielding & INP (wedge)

**Problem.** A Zebra / Tera wedge hammers 20 printable keys + Enter at <50ms
gaps, then the next label starts immediately. React synthetic `onKeyDown` and
synchronous `setState` / `router.push` on the Enter stack delay the next
keydown — that is the INP cliff.

**SoT (shipped).**

| Layer | Module |
|---|---|
| Pure classifier | `src/lib/keyboard/wedge-scan-machine.ts` |
| Native listener + yield-before-React | `src/lib/keyboard/wedge-scan-listener.ts` |
| Scan queue | `src/lib/perf/scan-commit-queue.ts` |
| Yield primitive | `src/lib/perf/yield-to-input.ts` |
| React mount adapter | `src/hooks/useWedgeScanner.ts` |
| App-root dispatch | `src/hooks/useGlobalWedgeScanner.ts` |

**Rules.**

1. One capture-phase `window` `keydown`. Never React synthetic events.
2. The handler is O(1): classify → buffer → maybe `preventDefault` on Enter/Tab.
3. `onScan` runs only after `yieldToInput()` (`scheduler.yield` or MessageChannel).
4. Consecutive scans serialize on the queue; a slow sink cannot block the next char.
5. Editable focus (`isEditableKeyTarget`) and modifier chords reset the buffer.
6. Focus is never read-for-steal and never written (`focus()` / `blur()`).
7. URL navigation after an unclaimed scan is a `startTransition`.
8. Action-plane sinks stay a module `Map` (`dispatchScanToActiveSink`) — no Context.

```ts
// keydown stack — no React
listener.onKeyDown(event);          // buffer / commit into the queue
// after yieldToInput()
onScan(value);                      // CustomEvent → sink → startTransition(router.push)
```

## B. High-density DOM (Speed Index)

**Problem.** PO triage grids are zero-padding, flush-square, dense. Painting
every incoming row on first paint, or letting a cell mutation reflow the
sheet, wrecks SI and INP.

**SoT (shipped).**

| Layer | Module |
|---|---|
| Always-virtualized body | `LedgerGrid` → `VirtualGroupedSections` |
| Overscan / estimates | `LEDGER_GRID_OVERSCAN` · `src/design-system/components/grid/grid-paint.ts` |
| Row layout isolation | `LEDGER_GRID_ROW_CONTAIN` = `[contain:layout_style]` on `ledgerGridRowShellClass` |

**Rules.**

1. Every triage / PO sheet mounts `NonlinearTableHost` → `LedgerGrid`. No `*GridView` twin.
2. Overscan is a named budget (~240px/side), not a magic `10`.
3. `contain: layout style` on the desktop row shell. **Never** `contain: paint` —
   frozen sticky identity cells must paint across the scrolling pane.
4. Do **not** put `content-visibility: auto` on virtualized rows — TanStack
   unmounts them; `content-visibility` fights `measureElement`.
5. Shared row width via `--cf-orders-grid-w`. Never `w-max` per product title.
6. No CSS animation for liveness. Decaying timestamp labels only.
7. First paint uses `rowEstimate` (40px Receiving golden). `measureElement`
   corrects after.

## C. Stream processing (NDJSON + Ably)

**Problem.** `streamNdjson` used to `onEvent` → `setState` per line. A 400-row
exceptions stream or an Ably reconnect flood of `order.changed` locks the
main thread for the whole burst.

**SoT (shipped).**

| Layer | Module |
|---|---|
| Parse | `consumeNdjsonBuffer` · `src/lib/orders-sync/parse-ndjson.ts` |
| Client | `streamNdjson` · `src/lib/orders-sync/client.ts` (`onBatch` + yield) |
| Budgeted apply | `applyStreamBudget` · `src/lib/perf/stream-apply.ts` |
| Ably frame coalesce | `createFrameCoalescer` · `src/lib/perf/coalesce-frame.ts` |
| Invalidate-only subscribers | `useRealtimeInvalidation` (`coalesce: 'frame'`) |

**Rules.**

1. Still NDJSON fetch streams. No Server Actions. No storage webhooks — Ably
   is the live bridge.
2. Control events (`phase` / `result` / `error`) flush immediately so the
   decaying-timestamp status label stays honest.
3. Row events (`detail` / `exception`) batch to `STREAM_APPLY_BATCH_SIZE`
   (16) or `STREAM_APPLY_TIME_BUDGET_MS` (8ms), then yield.
4. React callers use `onBatch` — one `setState` per window. Legacy `onEvent`
   still works and still yields between windows.
5. Ably invalidate-only handlers use `coalesce: 'frame'` (last-wins). Payload
   patchers stay `coalesce: 'none'` (default).
6. Orthogonal flags on a line (`SCANNED + PROBLEM`) ride the row payload.
   The budgeter never collapses them to pass/fail.

```ts
await streamNdjson(url, init, {
  onBatch: (events) => {
    for (const event of events) applyRow(event); // mutate accumulators
    setTask((prev) => paintOnce(prev, acc));    // one React paint
  },
});
```

## Verify

```bash
npm run test:perf
npx tsx --test src/design-system/components/grid/grid-cell-chrome.test.ts
```

## Lab results (2026-08-12)

Desktop Lighthouse (`--desktop`, simulated, production `NEXT_DIST_DIR=.next-perf-si` on `:3101`). Median of 3 after warmup.

| Route | Before (TTFB-bound) | After (streamed first paint) |
|---|---|---|
| `/incoming` SI | **9525 ms** (TTFB 6430 ms) | **3003 ms** (warm TTFB ~800 ms) |
| `/incoming` LCP | 4810 ms | 5875 ms |
| `/triage` SI | 1654–3771 ms (high variance) | same build ~3 s floor |

Incoming Speed Index dropped **9.5 s → 3.0 s** by not awaiting the full-list seed and painting `IncomingFirstPaint` in the first HTML. The 2.0 s target is not yet green: FCP sits at ~1.35 s (auth + 258 KB document) and the settled empty rail still becomes LCP after hydrate. Next lever is a shell-level incoming-rail seed (Unbox `maybeSeedShell` pattern) so "No packages yet" is in the first HTML rather than a client empty state.
