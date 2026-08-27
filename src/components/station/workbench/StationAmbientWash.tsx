/**
 * Ambient wash — the Unbox-family depth backdrop (soft tonal blobs behind the
 * glass cards). **SoT for the 3-blob recipe**: never re-type the
 * `bg-blue-400/[0.08]` / `bg-violet-400/[0.06]` / `bg-emerald-400/[0.06]` trio
 * in a station panel — compose this (or {@link StationPanelRoot}, which renders
 * it) so every bench shares one gradient and it can be tuned in one place.
 *
 * Renders an `aria-hidden`, pointer-events-none `-z-10` layer that covers the
 * whole panel (identity + body) so the gradient isn't clipped under a separate
 * chrome band. Guard: `station-workbench-chrome.guard.test.ts` (Guard B keeps
 * the fingerprint count at 1 — here).
 */
export function StationAmbientWash() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-visible">
      <div className="absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-blue-400/[0.08] blur-3xl" />
      <div className="absolute right-[-7rem] top-1/3 h-80 w-80 rounded-full bg-violet-400/[0.06] blur-3xl" />
      <div className="absolute bottom-[-5rem] left-[-5rem] h-80 w-80 rounded-full bg-emerald-400/[0.06] blur-3xl" />
    </div>
  );
}
