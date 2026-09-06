'use client';

// No motion import: BootSplash sits on `/signin`'s critical JS graph (the one
// public route), and the motion barrel statically carries the whole engine.
// The two ambient loops here (hammer strike, indeterminate sweep) are CSS
// keyframes in globals.css — transform/opacity only, compositor-safe.

/**
 * Full-screen sign-in splash. Shown by {@link BootGate} from first paint after
 * a fresh sign-in until the dashboard's above-the-fold data has been warmed
 * into the React Query cache — so the page reveals fully painted instead of
 * filling in box-by-box.
 *
 * Visual language matches `RedirectingSplash` in AuthContext (white field,
 * uppercase tracked caption) plus an indeterminate progress sweep, since this
 * moment lasts a beat longer.
 *
 * Paints settled (no entrance fade) so it's seamless across the sign-in → dest
 * hard navigation — see the `initial={false}` note below.
 */
export function BootSplash({ label = 'Loading your workspace' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-splash flex items-center justify-center bg-surface-card">
      {/* faint dotted field — same texture as the sign-in Shell */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      {/*
        Paint settled (opacity 1), never fade the whole panel in. This splash
        brackets a HARD navigation (sign-in → window.location.assign →
        destination), so two separate BootSplash instances exist: one on the
        sign-in page, one on the destination. A mount-entrance (opacity 0 → 1)
        would replay on the second instance, flashing the panel back to
        transparent right after the first one finished — the "Loading your
        workspace appears twice" flicker. Painting settled makes every instance
        identical and idempotent across the document swap, so the handoff is
        seamless. The breathing ring and sweep below stay animated as pure CSS
        loops (an ambient loop restart is imperceptible; a whole-panel re-fade
        is not). The fade-OUT on reveal is owned by BootGate, not here.
      */}
      <div
        className="relative flex flex-col items-center gap-6"
        role="status"
        aria-live="polite"
      >
        {/* brand mark, LOADING state: the hammer strikes 12→3 while the
            status light burns amber (working). The tab favicon is the DONE
            state of the same system — green light. Geometry mirrors
            public/brand/loading-mark.svg (single source: docs/brand/icon.md);
            colors are brand DATA, not theme tokens, so the mark never shifts
            with data-theme. Animation is the CSS keyframes loop below. */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg viewBox="0 0 512 512" className="h-16 w-16" aria-hidden>
            <rect width="512" height="512" rx="118" fill="#2563eb" />
            <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" strokeWidth="44" />
            <g className="cf-boot-strike" transform="rotate(45 256 256)">
              <g fill="#ea580c" stroke="#2563eb" strokeWidth="14" strokeLinejoin="round">
                <rect x="236" y="150" width="40" height="118" rx="20" />
                <rect x="170" y="90" width="172" height="108" rx="28" />
              </g>
              <rect x="170" y="90" width="34" height="108" rx="14" fill="#f97316" />
              <circle cx="256" cy="144" r="32" fill="#ffffff" />
              <circle cx="256" cy="144" r="26" fill="#fbbf24" />
            </g>
          </svg>
        </div>

        {/* indeterminate sweep */}
        <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-sunken">
          <div className="cf-boot-sweep h-full w-1/3 rounded-full bg-surface-inverse" />
        </div>

        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-faint">
          {label}…
        </p>
      </div>
    </div>
  );
}
