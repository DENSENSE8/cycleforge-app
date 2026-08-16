'use client';

/**
 * Flush armed-row stand-in for P3 `dynamic()` Displays leaf bodies.
 *
 * Cold `import()` used to paint the leaf ← header over an empty body
 * (`loading: () => null`) — reads as lag on Index→leaf. This skeleton matches
 * armed-row density (`py-3` · icon + label gutters · hairline dividers) so ← +
 * body plane cut in one frame while the chunk lands. No soft radius, no pulse
 * juice — WMS binary-cut placeholder only.
 */

const DEFAULT_ROWS = 9;

export function DisplaysLeafBodySkeleton({
  rows = DEFAULT_ROWS,
}: {
  /** Row count — Photos Actions has 9 verbs; peers may pass fewer. */
  rows?: number;
}) {
  const n = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : DEFAULT_ROWS;
  return (
    <div
      className="min-h-0 flex-1 overflow-hidden"
      data-testid="station-displays-leaf-skeleton"
      aria-busy="true"
      aria-label="Loading display"
    >
      <ul className="divide-y divide-border-hairline border-y border-border-hairline">
        {Array.from({ length: n }, (_, i) => (
          <li
            key={i}
            className="flex items-center gap-2 py-3 pl-3 pr-3"
            aria-hidden
          >
            <span className="h-4 w-4 shrink-0 bg-surface-sunken" />
            <span className="h-3 w-28 max-w-[55%] bg-surface-sunken" />
          </li>
        ))}
      </ul>
    </div>
  );
}
