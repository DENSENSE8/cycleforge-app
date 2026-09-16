'use client';

// No motion import: BootSplash sits on `/signin`'s critical JS graph (the one
// public route), and the motion barrel statically carries the whole engine.
// The indeterminate sweep is a CSS keyframe in globals.css — transform-only,
// compositor-safe.

/**
 * Full-screen sign-in splash. Shown by {@link BootGate} from first paint after
 * a fresh sign-in until the dashboard's above-the-fold data has been warmed
 * into the React Query cache — so the page reveals fully painted instead of
 * filling in box-by-box.
 *
 * Paints settled (no entrance fade) so it's seamless across the sign-in → dest
 * hard navigation.
 */
export function BootSplash({ label = 'Loading your workspace' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-splash flex items-center justify-center bg-surface-card">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <div
        className="relative flex flex-col items-center gap-6"
        role="status"
        aria-live="polite"
      >
        <span className="text-role-display font-semibold tracking-tight text-text-default">
          Cycle Forge
        </span>

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
