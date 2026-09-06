'use client';

import { SettingsPanel } from '@/components/settings/SettingsPanel';

/** `/settings/receiving` — ex-inline `?section=receiving` tab (settings routing
 * unification, 2026-09-06). Registry-rendered org policy page. */
export default function ReceivingSettingsPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
          <SettingsPanel page="receiving" />
        </div>
      </main>
    </div>
  );
}
