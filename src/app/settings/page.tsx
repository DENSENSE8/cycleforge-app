'use client';

import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardwareSection } from '@/components/settings/sections/HardwareSection';
import { WorkstationSection } from '@/components/settings/sections/WorkstationSection';
import { QuickAccessSection } from '@/components/settings/sections/QuickAccessSection';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';
import { KeyboardSection } from '@/components/settings/sections/KeyboardSection';
import { AboutSection } from '@/components/settings/sections/AboutSection';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';
import { SessionsSection } from '@/components/settings/sections/SessionsSection';
import { KioskDevicesSection } from '@/components/settings/sections/KioskDevicesSection';
import { CatalogSection } from '@/components/settings/sections/CatalogSection';
import { StationsSection } from '@/components/settings/sections/StationsSection';
import { LegalSection } from '@/components/settings/sections/LegalSection';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import {
  getActiveSettingsSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

function ReceivingSettingsSection() {
  return <SettingsPanel page="receiving" />;
}

const LEGACY_REDIRECTS: Record<string, string> = {
  staff: '/settings/staff',
  team: '/settings/staff',
  billing: '/settings/billing',
  integrations: '/settings/integrations',
  audit: '/settings/audit',
  organization: '/settings/organization',
  roles: '/settings/roles',
  access: '/settings/access',
  'operations-log': '/admin?section=logs',
};

const INLINE_SECTIONS: Partial<Record<SettingsSection, ComponentType>> = {
  hardware: HardwareSection,
  workstation: WorkstationSection,
  'quick-access': QuickAccessSection,
  appearance: AppearanceSection,
  keyboard: KeyboardSection,
  receiving: ReceivingSettingsSection,
  security: SecuritySection,
  sessions: SessionsSection,
  devices: KioskDevicesSection,
  catalog: CatalogSection,
  stations: StationsSection,
  about: AboutSection,
  legal: LegalSection,
};

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSection = searchParams?.get('section');
  const active = getActiveSettingsSection(rawSection);

  useEffect(() => {
    if (!rawSection) return;
    const target = LEGACY_REDIRECTS[rawSection.toLowerCase()];
    if (target) router.replace(target);
  }, [rawSection, router]);

  if (rawSection && LEGACY_REDIRECTS[rawSection.toLowerCase()]) {
    return null;
  }

  const Section = INLINE_SECTIONS[active] ?? HardwareSection;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
          <Section />
        </div>
      </main>
    </div>
  );
}
