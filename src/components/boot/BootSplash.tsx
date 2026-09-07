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
        {/* brand mark, LOADING state ("The Iron", Revision 3 —
            docs/brand/decision-strike-the-flow.md): the soldering iron
            sweeps its pass 12→3 to the flow node; the joint heats AMBER
            while working — the only color on the splash (color = state).
            The tab favicon is the DONE state: schematic white.
            Geometry mirrors public/brand/loading-mark.svg, derived from
            #cf-loading in public/brand/icon.master.svg via `pnpm icon:sync`;
            colors are brand DATA, not theme tokens, so the mark never shifts
            with data-theme. Animation is the CSS keyframes loop below. */}
        <div className="relative flex h-16 w-16 items-center justify-center">
          <svg viewBox="0 0 512 512" className="h-16 w-16" aria-hidden>
            <rect width="512" height="512" rx="118" fill="#0A0A0B" />
            <g className="cf-boot-strike" transform="rotate(45 256 256)">
              <g fill="#ffffff" stroke="#0A0A0B" strokeWidth="10" strokeLinejoin="round">
                <rect x="240" y="60" width="32" height="24" rx="8" />
                <rect x="222" y="84" width="68" height="104" rx="16" />
                <rect x="222" y="112" width="68" height="8" fill="#0A0A0B" />
                <path d="M232 188 h48 l20 18 -20 18 h-48 l-20 -18 z" />
                <rect x="243" y="224" width="26" height="44" />
                <path d="M243 268 h26 l6 46 h-38 z" />
              </g>
            </g>
            <path d="M400 326 V396" stroke="#ffffff" strokeWidth="24" strokeLinecap="round" />
            <path d="M438 262 L486 300" stroke="#ffffff" strokeWidth="24" strokeLinecap="round" />
            <circle cx="400" cy="256" r="60" fill="none" stroke="#ffffff" strokeWidth="24" />
            <circle cx="400" cy="256" r="26" fill="#FBBF24" />
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
