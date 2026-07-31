'use client';

/**
 * Arrival Package Pairing — thin wrapper over {@link CartonMatchHub}
 * (`tabSet="arrival"`, never autofocus). Prefer CartonMatchHub for new call sites.
 */

import {
  CartonMatchHub,
  type CartonMatchHubProps,
} from '@/components/receiving/workspace/line-edit/CartonMatchHub';

export function TriageLineMatchingSection({
  row,
  staffId,
  showOpenInUnbox = true,
  embedded = false,
  collapsed = false,
  onToggleCollapsed,
  showTopRule = false,
}: Omit<CartonMatchHubProps, 'tabSet' | 'autoFocusSearch' | 'autoMatch'>) {
  return (
    <CartonMatchHub
      row={row}
      staffId={staffId}
      tabSet="arrival"
      autoFocusSearch={false}
      showOpenInUnbox={showOpenInUnbox}
      embedded={embedded}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      showTopRule={showTopRule}
    />
  );
}
