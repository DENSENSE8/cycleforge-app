'use client';

/**
 * RepairServiceIdentify — single SoT host for linking a carton to an Ecwid
 * repair-service (-RS) / store order.
 *
 * Mounted from:
 *   • Arrival Pairing / Unbox Linkage — {@link CartonMatchHub} Store avenue
 *   • Unbox Classify — when Arrival never paired (same module, no fork)
 *
 * Compose {@link EcwidProductSearchInline} `popoverMode="repair_service"`;
 * the host owns layout chrome only. Success writes go through the caller's
 * `onSelect` → {@link addUnmatchedLine} (items accordion or Classify identify)
 * → POST add-unmatched-line (carton Order # + type REPAIR + repair_service upsert).
 */

import { EcwidProductSearchInline } from '@/components/receiving/unfound/EcwidProductSearchInline';
import type { EcwidProductSelection } from '@/components/receiving/unfound/ecwid-search/ecwid-search-shared';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

type RepairServiceIdentifyChrome = 'bare' | 'card';

interface RepairServiceIdentifyProps {
  receivingId: number;
  onSelect: (selection: EcwidProductSelection) => void | Promise<void>;
  /** Optional — Store tab often switches avenue on dismiss; Classify may omit. */
  onClose?: () => void;
  chrome?: RepairServiceIdentifyChrome;
  autoFocusSearch?: boolean;
  /** Starting order list scope — Classify defaults to repair-only; Pairing uses all. */
  initialOrderScope?: 'repair_rs' | 'all';
  className?: string;
}

export function RepairServiceIdentify({
  receivingId,
  onSelect,
  onClose,
  chrome = 'bare',
  autoFocusSearch = true,
  initialOrderScope = 'all',
  className,
}: RepairServiceIdentifyProps) {
  return (
    <div
      data-testid="repair-service-identify"
      className={cn('min-w-0 max-w-full', cornerClass('flush'), className)}
    >
      <EcwidProductSearchInline
        receivingId={receivingId}
        popoverMode="repair_service"
        initialOrderScope={initialOrderScope}
        chrome={chrome}
        autoFocusSearch={autoFocusSearch}
        onSelect={onSelect}
        onClose={onClose ?? (() => undefined)}
      />
    </div>
  );
}
