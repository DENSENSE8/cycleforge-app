'use client';

/**
 * Tile bodies.
 *
 * The SHELL is what this lane ports; a tile's *contents* are the feature
 * modules that will be mounted into it. What is here is the prototype's own
 * placeholder content, kept for exactly one reason: it is what makes the
 * ported frame diffable against the file it came from on sight — the session
 * spine, the pipeline strip, the docked composer, the grid table and the
 * settings tile are all shell chrome that only appears with a body around it.
 *
 * NOT ported from the prototype (demo data with no shell rule behind it, and
 * a real module already owning the job): the staff-activity table, the
 * per-staffer `ops_events` replay, the orders-exceptions queue, and the FBA
 * task-session stepper. See `followUps`.
 */

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCallback } from 'react';
import { HelpTile } from '@/components/tiles/help/HelpTile';
import { OrderDetailTile, OrdersQueueTile } from '@/components/tiles/orders/OrdersTile';
import type { OrderHeaderFacts } from '@/components/tiles/orders/orders-tile-data';
import { ProductTile } from '@/components/tiles/product/ProductTile';
import { SessionsWeekTile, type WeekTileBlock } from '@/components/tiles/sessions/SessionsWeekTile';
import { ACCENTS, DENSITY, TILE_FLOOR_SESSION_PX, TILE_FLOOR_TABLE_PX, blockElapsedSeconds, type AccentKey, type DensityKey, type ShellTile } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/** The chronology's blocks, shaped for the week tile (host adapter half). */
function weekTileBlocks(shell: ShellApi): readonly WeekTileBlock[] {
  const now = Date.now();
  return shell.feed
    .filter((e): e is Extract<(typeof shell.feed)[number], { kind: 'block' }> => e.kind === 'block')
    .map((b) => ({
      id: b.id,
      ref: b.ref,
      title: b.title,
      state: b.state,
      startedAt: b.intervals[0]?.start ?? now,
      elapsedSeconds: blockElapsedSeconds(b.intervals, now),
    }))
    .reverse();
}

/* THE SESSION TILE IS DEAD (operator ruling, 2026-08-25 —
   HANDOFF-session-composer-ux §1/§2). The 2023-prototype placeholder —
   ARMED chip, pipeline strip, "AWAITING SCAN" box, hard-coded
   `C-8842-A · unit 3 of 12` — rendered fake facts in a full-height boxy
   frame. The session's real face (identity · stage · elapsed · verbs) is
   `SessionHeader` in the composer now: the wedge lands in the composer, so
   the session that owns the wedge lives on the composer. `useShell` no
   longer mounts `'session'`-type tabs for scan sessions at all. */

/**
 * What a work queue looks like once it stops being a rail: real columns, a
 * selection column and room for the identity facts the rail's peek card had to
 * hide. PLACEHOLDER ROWS — the real mount is the table host.
 */
const DEMO_ROWS: readonly (readonly [string, string, string, string, string, string, string])[] = [
  ['ok', 'C-8842-A', 'UPS', '1Z999AA10123456784', 'B', 'unbox', '4m'],
  ['ok', 'C-8839-B', 'FedEx', '7742 8891 0021', 'A', 'unbox', '11m'],
  ['warn', 'C-8830-K', 'USPS', '9410 8036 9930 41', 'C', 'triage', '38m'],
  ['err', 'C-8827-D', 'UPS', '1Z999AA10987654321', '—', 'triage', '1h 02m'],
  ['info', 'C-8821-M', 'DHL', 'JVGL0999 8812 34', 'B', 'testing', '2h 14m'],
  ['ok', 'C-8814-P', 'FedEx', '7742 8890 5510', 'A', 'packing', '3h 40m'],
];

function TableTile() {
  return (
    <>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-12" />
            <th className="w-20">carton</th>
            <th>carrier</th>
            <th className="w-32">tracking</th>
            <th className="w-12">gr</th>
            <th className="w-20">stage</th>
            <th className="w-20">age</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_ROWS.map((r) => (
            <tr key={r[1]}>
              <td>
                <span className={`status-dot ${r[0]}`} />
              </td>
              <td className="mono">{r[1]}</td>
              <td>{r[2]}</td>
              <td className="mono">{r[3]}</td>
              <td className="mono">{r[4]}</td>
              <td>{r[5]}</td>
              <td className="mono">{r[6]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs leading-relaxed text-muted-foreground">Placeholder rows — the table host mounts here.</div>
    </>
  );
}

/**
 * SETTINGS IS A TILE, not a modal and not a page. It is a view of data you
 * edit, so it tiles beside the thing you are adjusting and you watch the
 * change land live.
 */
function SettingsTile({ shell }: { shell: ShellApi }) {
  const floorScale = DENSITY[shell.prefs.density].floorScale;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Arrangement — yours, unrestricted</div>
        <div className="text-xs leading-relaxed text-muted-foreground">
          Tabs, pins, tools, canvas layout, saved workspaces, keybindings, the header readout.
          Per staff, per org. Nothing here is bounded, because none of it changes what anything{' '}
          <b>means</b>.
        </div>
      </div>

      <div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Comfort — yours, bounded</div>

        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">Density</span>
          <ToggleGroup aria-label="Density">
            {(['compact', 'default', 'roomy'] as DensityKey[]).map((d) => (
              <ToggleGroupItem
                key={d}
                active={shell.prefs.density === d}
                onClick={() => shell.setPref('density', d)}
              >
                {d}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="mono text-xs text-muted-foreground">floors ×{floorScale.toFixed(2)}</span>
        </div>
        <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
          One scale, not separate padding knobs. The tile floors were measured against a density,
          so they scale with it — session {Math.round(TILE_FLOOR_SESSION_PX * floorScale)}px, table{' '}
          {Math.round(TILE_FLOOR_TABLE_PX * floorScale)}px. Separate knobs would be an untested
          combination with silently wrong floors.
        </div>

        <div className="flex items-center justify-between gap-3 py-1.5">
          <label className="shrink-0 text-xs text-muted-foreground" htmlFor="pref-radius">
            Frame radius
          </label>
          <input
            id="pref-radius"
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-high accent-[var(--border-accent)]"
            type="range"
            min={0}
            max={16}
            step={1}
            value={shell.prefs.radius}
            onChange={(e) => shell.setPref('radius', Number(e.target.value))}
          />
          <span className="mono">{shell.prefs.radius}px</span>
        </div>
        <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Comfort radius is the control / surface / pane ladder in{' '}
          <code>tokens.css</code> — not a second scale. This slider still
          writes <code>--r-hud</code> (orphaned since the canvas deletion);
          structural planes stay square against the viewport.
        </div>

        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">Accent</span>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(ACCENTS) as AccentKey[]).map((name) => (
              <button
                type="button"
                key={name}
                className="btn btn-sm"
                style={{
                  borderColor: ACCENTS[name].light,
                  color: ACCENTS[name].light,
                  fontWeight: shell.prefs.accent === name ? 700 : undefined,
                }}
                aria-pressed={shell.prefs.accent === name}
                onClick={() => shell.setPref('accent', name)}
              >
                {name}
                {shell.prefs.accent === name ? ' ·' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Meaning — locked</div>
        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
          {(
            [
              ['ok', 'packed / on target'],
              ['warn', 'pending / near limit'],
              ['err', 'damaged / over'],
              ['info', 'received'],
            ] as const
          ).map(([k, l]) => (
            <span className="inline-flex items-center gap-1" key={k}>
              <span className={`status-dot ${k}`} />
              {l}
            </span>
          ))}
        </div>
        <div className="text-xs leading-relaxed text-muted-foreground">
          Not a preference. Semantic colour is a <b>shared vocabulary</b>: if two staff recolour
          their own, they read the same screen differently, and a lead walking the floor cannot
          read anyone&apos;s. Org-level only, and only for accessibility — never taste.
        </div>
      </div>
    </div>
  );
}

function OrderDetailHost({ tile, shell }: { tile: ShellTile; shell: ShellApi }) {
  const tileId = tile.id;
  const setHeaderPayload = shell.setHeaderPayload;
  const onHeaderFacts = useCallback(
    (facts: OrderHeaderFacts | null) => setHeaderPayload(tileId, facts),
    [setHeaderPayload, tileId],
  );
  return (
    <OrderDetailTile
      orderKey={tile.ref.slice('order:'.length)}
      onOpenProduct={shell.openProductTile}
      narrate={shell.narrate}
      onFocusResolved={shell.setOrdersWriteTarget}
      onReleased={shell.releaseOrdersWriteTarget}
      onHeaderFacts={onHeaderFacts}
    />
  );
}

export function TileBody({ tile, shell }: { tile: ShellTile; shell: ShellApi }) {
  if (tile.ref === 'settings') return <SettingsTile shell={shell} />;
  // The first REAL data tiles (HANDOFF-orders-first). This mapping is the
  // whole host adapter — the tiles themselves import nothing from the shell,
  // so the D2 canvas rebuild re-parents them by moving these lines. Hard
  // rule (2026-08-24): the queue tile and an order's detail tile are
  // SEPARATE tiles — a display never overrides another tile's surface.
  if (tile.ref === 'orders') {
    // The narrowing text is SET THROUGH THE MAIN COMPOSER (`filter: …`,
    // I8 as amended 2026-08-24) — `useShell.tileFilters` is its one home.
    return (
      <OrdersQueueTile
        onOpenOrder={shell.openOrderDetailTile}
        filter={shell.tileFilters[tile.ref] ?? ''}
      />
    );
  }
  if (tile.ref === 'help') return <HelpTile />;
  if (tile.ref === 'sessions-week') {
    return <SessionsWeekTile blocks={weekTileBlocks(shell)} onResume={shell.resumeBlock} />;
  }
  if (tile.ref.startsWith('order:')) {
    return <OrderDetailHost tile={tile} shell={shell} />;
  }
  if (tile.ref.startsWith('product:')) {
    return <ProductTile sku={tile.ref.slice('product:'.length)} />;
  }
  if (tile.type === 'table') return <TableTile />;
  return <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">Tile content</div>;
}
