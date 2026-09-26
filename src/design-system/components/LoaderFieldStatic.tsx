import { latticeStyle } from './universal-loader-field';

/** Zero-JS loading field — the same dot lattice {@link UniversalLoader} paints before its canvas hydrates, as a server-renderable standalone. */
export function LoaderFieldStatic({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      // ds-allow-raw-neutral: loader field plane is pinned white in every theme (operator 2026-08-21)
      className="relative h-full min-h-24 w-full flex-1 bg-white"
      style={latticeStyle(16)}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}
