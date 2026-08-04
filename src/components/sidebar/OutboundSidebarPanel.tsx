'use client';

import { Suspense } from 'react';
import { LabelsModeBody } from '@/components/outbound/labels/LabelsModeBody';
import { ScanOutModeBody } from '@/components/outbound/scan-out/ScanOutModeBody';
import { FbaSidebarPanel } from '@/components/fba/sidebar';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { appChromeClass } from '@/design-system/tokens/app-surface';

/**
 * Outbound sidebar bodies by mode. L2 Shipping modes live in GlobalHeader
 * (`HeaderPageSwitcher` ← SIDEBAR_PAGE_NAV) — no sidebar mode rail twin.
 * Ready is a stage inside FBA (`?fbaMode=ready`), not a sibling shipping mode.
 */
export function OutboundSidebarPanel() {
  const { mode } = useOutboundUrlState();

  // FBA owns Ready · Plan · Combine · Shipped rails + scan bar.
  if (mode === 'fba') {
    return (
      <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className={`h-full w-full ${appChromeClass}`} />}>
            <FbaSidebarPanel />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden ${appChromeClass}`}>
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'scan-out' ? <ScanOutModeBody /> : <LabelsModeBody />}
      </div>
    </div>
  );
}
