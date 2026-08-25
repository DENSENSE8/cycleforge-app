'use client';

/**
 * THE HELP TILE (operator, 2026-08-24) — opened by the `?` pinned at the
 * bottom of the left rail (the Linear pattern). A TILE, not a modal or a
 * popover (C8: a display is always its own tile), and the host places it
 * LEFTMOST so it is the most prominent thing on the canvas while open.
 *
 * Static by design: this is the legend for what already works, not a
 * settings surface. HOST-AGNOSTIC — no shell imports. Tailwind + shadcn
 * only (operator, 2026-08-25).
 */

const KEYS: readonly { keys: string; what: string }[] = [
  { keys: '⌘K', what: 'Launcher — every session, table, and tool by name' },
  { keys: '⌘N', what: 'New session — parks the current one losslessly, elapsed freezes' },
  { keys: '⌘⇧B', what: 'Toggle the right rail' },
  { keys: 'Ctrl+W', what: 'Close the focused tile' },
  { keys: 'Esc', what: 'Dismiss launcher, menus, and popovers' },
];

const GRAMMAR: readonly { token: string; what: string }[] = [
  { token: '#1234…', what: 'Order number — resolves to a chip and opens the order as its own tile' },
  { token: '/pack', what: 'Action — same index as ⌘K: sessions, tables, tools' },
  { token: 'filter: bose', what: 'Narrow the focused queue tile; "filter:" alone clears it' },
  { token: 'plain words', what: 'Talk to the assistant — or, with a write-target set, an internal note on that order' },
  { token: '(scan)', what: 'The gun lands here too — no click first, the wedge always wins' },
];

const BAND_LABEL =
  'font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground';
const TRAIL =
  'flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2';
const META = 'block text-technical text-muted-foreground';

export function HelpTile() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="flex flex-col gap-1">
          <div className={BAND_LABEL}>The one field</div>
          <ul className={TRAIL}>
            {GRAMMAR.map((g) => (
              <li key={g.token}>
                <span className="mono">{g.token}</span>
                <span className={META}>{g.what}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <div className={BAND_LABEL}>Keys</div>
          <ul className={TRAIL}>
            {KEYS.map((k) => (
              <li key={k.keys}>
                <span className="mono">{k.keys}</span>
                <span className={META}>{k.what}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1">
          <div className={BAND_LABEL}>The rules of the room</div>
          <ul className={TRAIL}>
            <li>
              One composer — everything you type enters at the bottom left; tiles never grow
              their own inputs.
            </li>
            <li>
              A display never replaces a tile — orders, products, and help each open as their
              own tile beside what you were reading.
            </li>
            <li>
              Scans land in the armed session no matter what else is focused — parking a
              session is one keystroke and loses nothing.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
