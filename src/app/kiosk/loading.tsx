/**
 * /kiosk welcome first-paint — heading text so LCP can fire at FCP.
 * Do not paint the v2 catalog rail here; welcome tiles stay the proven floor.
 */

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-canvas px-4 py-5 text-text-default">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Welcome</p>
      <h1 className="mt-2 text-balance text-2xl font-semibold leading-tight tracking-tight">
        How can we help you today?
      </h1>
    </div>
  );
}
