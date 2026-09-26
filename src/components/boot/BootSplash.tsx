'use client';

// No motion import:

/** Full-screen sign-in splash. */
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
