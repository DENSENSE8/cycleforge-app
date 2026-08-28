import { latticeStyle } from './universal-loader-field';

/**
 * Zero-JS loading field — the same dot lattice {@link UniversalLoader} paints
 * before its canvas hydrates, as a server-renderable standalone.
 *
 * For loading boundaries on THROTTLED profiles (`/signin`, `/m/*`): the live
 * canvas field integrates springs on the main thread exactly while a phone is
 * hydrating the shell (2026-08-27 sweep: TBT ~340–395ms across the mobile
 * tree, `/m/scan` 76 → 63 after the field landed there), and a loading
 * boundary lives a couple of seconds — the static lattice is what the canvas
 * shows pre-paint anyway, so the visual is identical until the moment the
 * live field would start moving. Desk loading boundaries keep
 * {@link UniversalLoader}; this is the Band 0/1 face of the same chrome.
 */
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
