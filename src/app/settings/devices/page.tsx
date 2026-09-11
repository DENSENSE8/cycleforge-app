import { Suspense } from 'react';
import { KioskDevicesWorkspace } from '@/components/settings/kiosk-devices/KioskDevicesWorkspace';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';

/**
 * `/settings/devices` — kiosk fleet + slot history as tabbed PRODUCT_TABLES peers.
 *
 * Title + TabSwitch live in {@link KioskDevicesWorkspace}. Law:
 * `KIOSK_DEVICES_PAGE_LAW` — one DataTable at a time via `?view=`.
 */
export default function DevicesSettingsPage() {
  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col', SETTINGS_FLOOR_CLASS)}>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-text-soft sm:px-10">
              Loading devices…
            </div>
          }
        >
          <KioskDevicesWorkspace />
        </Suspense>
      </main>
    </div>
  );
}
