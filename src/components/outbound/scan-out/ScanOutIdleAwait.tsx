'use client';

/** Idle center for `/shipping/scan-out` — white station plane until first confirm. */

import { useCallback, useEffect, useState } from 'react';
import { Barcode } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
} from '@/components/station/workbench';
import { STATION_SCAN_WELL_CLASS } from '@/components/station/scan-depth';
import {
  StationDisplaysParkedRail,
  StationDisplaysPushStack,
  StationDisplaysUtilityRail,
  STATION_DISPLAY_INDEX,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';
import type { SectionTab } from '@/design-system/components';
import {
  SCAN_OUT_CLOSE_DISPLAYS_EVENT,
  SCAN_OUT_OPEN_DISPLAYS_EVENT,
  dispatchScanOutDisplaysChanged,
} from '@/components/outbound/scan-out/scan-out-active';

export function ScanOutIdleAwait({
  listenDisplays = true,
}: {
  /** When the focused overlay is up, idle stays mounted (visibility hide) — do not steal ring events. */
  listenDisplays?: boolean;
} = {}) {
  const [activeSideTab, setActiveSideTab] = useState<string | null>(null);
  const closeDisplays = useCallback(() => setActiveSideTab(null), []);
  const openDisplaysIndex = useCallback(
    () => setActiveSideTab(STATION_DISPLAY_INDEX),
    [],
  );
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  useEffect(() => {
    if (!listenDisplays) {
      setActiveSideTab(null);
      dispatchScanOutDisplaysChanged(false);
      return;
    }
    const onOpen = () => openDisplaysIndex();
    const onClose = () => closeDisplays();
    window.addEventListener(SCAN_OUT_OPEN_DISPLAYS_EVENT, onOpen);
    window.addEventListener(SCAN_OUT_CLOSE_DISPLAYS_EVENT, onClose);
    return () => {
      window.removeEventListener(SCAN_OUT_OPEN_DISPLAYS_EVENT, onOpen);
      window.removeEventListener(SCAN_OUT_CLOSE_DISPLAYS_EVENT, onClose);
    };
  }, [listenDisplays, openDisplaysIndex, closeDisplays]);

  useEffect(() => {
    if (!listenDisplays) return;
    dispatchScanOutDisplaysChanged(activeSideTab != null);
  }, [activeSideTab, listenDisplays]);

  const displayTabs: SectionTab[] = [];
  const displayIndexRows: DisplayIndexRow[] = [];
  const resolvedSideTab = resolveDisplaysActiveTab(activeSideTab, []);

  const utilityRailBody = !resolvedSideTab ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab}
          onOpenLeaf={(id) => setActiveSideTab(id)}
        />
      }
    />
  ) : null;

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col bg-surface-card"
      data-testid="scan-out-idle-await"
    >
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        hostDataAttrs={{ 'data-scan-out-idle-host': true }}
        centerTestId="scan-out-idle-center"
        utilityRail={utilityRailBody}
        center={
          <StationPanelRoot surface="card">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible bg-surface-card">
              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                reserveIdentityClearance={false}
                bodyGap="none"
              >
                <div
                  className={cn(
                    STATION_SCAN_WELL_CLASS,
                    'flex min-h-0 flex-1 flex-col items-center justify-center inset-empty text-center',
                  )}
                >
                  <div className="flex max-w-sm flex-col items-center gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center bg-surface-success text-text-success ring-1 ring-inset ring-border-success',
                        cornerClass('surface'),
                      )}
                    >
                      <Barcode className="h-6 w-6" aria-hidden />
                    </div>
                    <p className="text-role-title font-semibold text-text-primary">
                      Scan a label to ship out
                    </p>
                    <p className="text-role-caption text-text-muted">
                      Same station composer as Unbox (notes only — no Unbox | Ticket). Carton
                      header appears after the first confirm.
                    </p>
                  </div>
                </div>
              </StationWorkbench>
            </div>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel="Scan-out displays"
              storageKey="scan-out-displays-push-width"
              testId="scan-out-idle-displays-push"
              resizeTestId="scan-out-idle-displays-push-resize"
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={setActiveSideTab}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </div>
  );
}
