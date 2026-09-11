'use client';

/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: src/app/settings/devices/page.tsx.
 * Affected API: none. URL ?view=devices|history via router.replace.
 * Data schemas: KioskDevicesPageView.
 * User (verbatim): "tabs component should not be blocky… friendly apple-like
 * slider. Rewrite the tabs component." + match enroll name/Generate code height.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { KioskDevicesSection } from '@/components/settings/sections/KioskDevicesSection';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import {
  KIOSK_DEVICES_VIEW_PARAM,
  parseKioskDevicesPageView,
  type KioskDevicesPageView,
} from '@/lib/kiosk/kiosk-devices-page-law';

const TABS: { id: KioskDevicesPageView; label: string }[] = [
  { id: 'devices', label: 'Devices' },
  { id: 'history', label: 'Slot history' },
];

export function KioskDevicesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseKioskDevicesPageView(searchParams.get(KIOSK_DEVICES_VIEW_PARAM));

  const setView = useCallback(
    (next: string) => {
      const id = parseKioskDevicesPageView(next);
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'devices') params.delete(KIOSK_DEVICES_VIEW_PARAM);
      else params.set(KIOSK_DEVICES_VIEW_PARAM, id);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const tabs = useMemo(() => TABS.map((t) => ({ id: t.id, label: t.label })), []);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-8 sm:px-10">
      <SettingsSectionHeader
        title="Kiosk devices"
        belowSlot={
          <TabSwitch
            tabs={tabs}
            activeTab={view}
            onTabChange={setView}
            solidTone="accent"
            countStyle="plain"
            fit="hug"
          />
        }
      />

      <KioskDevicesSection view={view} />
    </div>
  );
}
