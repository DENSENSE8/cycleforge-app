'use client';

import { useMemo } from 'react';
import { SidebarNavOverlaySlider } from '@/components/sidebar/SidebarNavOverlaySlider';
import { SUPPORT_MODE_ITEMS, type SupportMode } from '@/components/sidebar/support/support-sidebar-shared';
import { useAuth } from '@/contexts/AuthContext';

interface SupportModeToggleProps {
  value: SupportMode;
  onChange: (next: SupportMode) => void;
}

/** Top-level Tickets / Voicemail / Calls / Warranty / Issues switcher for /support. */
export function SupportModeToggle({ value, onChange }: SupportModeToggleProps) {
  const { has, isLoaded } = useAuth();
  const items = useMemo(() => {
    if (!isLoaded) return SUPPORT_MODE_ITEMS;
    return SUPPORT_MODE_ITEMS.filter((item) => {
      if (item.id === 'warranty') return has('warranty.view');
      if (item.id === 'issues') return has('support.issues.view');
      // Tickets / voicemail / calls ride Zendesk (or voice APIs under the same console).
      return has('integrations.zendesk');
    });
  }, [has, isLoaded]);

  return (
    <SidebarNavOverlaySlider
      items={items}
      value={value}
      onChange={(id) => onChange(id as SupportMode)}
      aria-label="Support mode"
    />
  );
}
