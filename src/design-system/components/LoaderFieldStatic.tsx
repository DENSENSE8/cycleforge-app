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
      // ds-allow-raw-neutral: loader field plane is pinned white in every theme (operator 2026-08-21)
      className="relative flex h-full min-h-24 w-full flex-1 items-center justify-center bg-white"
      style={latticeStyle(16)}
    >
      {/*
        VISIBLE, not sr-only (2026-09-02). First Contentful Paint counts text,
        images, canvas and SVG — a CSS background gradient is none of those, so
        while this label was `sr-only` the loading boundary painted a field with
        NOTHING contentful in it and FCP could not fire until the app hydrated
        and revealed the route.

        Measured on the Vercel preview, mobile profile, 4x CPU: `/m/home`
        first-paint 912ms but first-CONTENTFUL-paint 1412ms — a 500ms gap that
        is exactly this. Routes whose own SSR chrome carries visible text
        (`/m/unbox`, `/incoming`) hit FP == FCP == ~560ms and score 89-93.

        This is also why deleting a `loading.tsx` never helped: the boundary
        just fell through to the root one, which renders this same component.
        Keep the label rendered. `aria-label` is dropped because the visible
        text now names the region.
      */}
      <span className="text-role-caption font-semibold uppercase tracking-widest text-text-faint">
        {label}
      </span>
    </div>
  );
}
