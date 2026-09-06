import { StationsSection } from '@/components/settings/sections/StationsSection';

/** `/settings/stations` — ex-inline `?section=` tab (settings routing
 * unification, 2026-09-06). Same shell the inline renderer wore. */
export default function StationsSettingsPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
          <StationsSection />
        </div>
      </main>
    </div>
  );
}
