'use client';

import { Suspense } from 'react';
import { LabelsModeBody } from '@/components/outbound/labels/LabelsModeBody';
import { ScanOutModeBody } from '@/components/outbound/scan-out/ScanOutModeBody';
import { ReadyModeBody } from '@/components/outbound/ready/ReadyModeBody';
import { FbaSidebarPanel } from '@/components/fba/sidebar';
import {
  OUTBOUND_MODE_ITEMS,
  type OutboundMode,
} from '@/components/outbound/outbound-sidebar-shared';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav';

export function OutboundSidebarPanel() {
  const { mode, updateMode } = useOutboundUrlState();
  const masterNavEnabled = useMasterNavEnabled();

  // FBA mode owns plan/combine/shipped rails + scan bar; keep Outbound mode
  // switcher above it when master nav is off so operators can leave FBA mode.
  if (mode === 'fba') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-card">
        {!masterNavEnabled && (
          <div className={sidebarHeaderPillRowClass}>
            <HorizontalButtonSlider
              items={OUTBOUND_MODE_ITEMS}
              value={mode}
              onChange={(id) => updateMode(id as OutboundMode)}
              variant="nav"
              dense
              className="w-full"
              aria-label="Outbound mode"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className="h-full w-full bg-surface-card" />}>
            <FbaSidebarPanel />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      {!masterNavEnabled && (
        <div className={sidebarHeaderPillRowClass}>
          <HorizontalButtonSlider
            items={OUTBOUND_MODE_ITEMS}
            value={mode}
            onChange={(id) => updateMode(id as OutboundMode)}
            variant="nav"
            dense
            className="w-full"
            aria-label="Outbound mode"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'scan-out' ? (
          <ScanOutModeBody />
        ) : mode === 'ready' ? (
          <ReadyModeBody />
        ) : (
          <LabelsModeBody />
        )}
      </div>
    </div>
  );
}
