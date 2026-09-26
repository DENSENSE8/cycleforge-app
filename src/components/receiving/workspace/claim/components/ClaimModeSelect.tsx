'use client';

import { useCallback, useMemo, useRef } from 'react';
import { SearchableSelectField } from '@/design-system/components';
import { useSegmentChords } from '@/lib/keyboard/useSegmentChords';
import type { ClaimModalMode } from '../claim-types';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

const CLAIM_MODE_TAB_IDS = ['create', 'link'] as const;

const MODE_OPTIONS = [
  {
    value: 'create',
    label: 'Create',
    meta: 'File a new ticket',
    group: 'Claim mode',
  },
  {
    value: 'link',
    label: 'Link',
    meta: 'Attach an existing ticket',
    group: 'Claim mode',
  },
] as const;

/** Create | Link mode — flush combobox at the top of the Claim body (same grammar as Claim type). */
export function ClaimModeSelect({ c }: { c: ReceivingClaimController }) {
  const modeChangeRef = useRef(c.handleModeChange);
  modeChangeRef.current = c.handleModeChange;

  const onTabChange = useCallback((id: string) => {
    modeChangeRef.current(id as ClaimModalMode);
  }, []);

  useSegmentChords({
    enabled: true,
    tabIds: CLAIM_MODE_TAB_IDS,
    onTabChange,
  });

  const options = useMemo(
    () =>
      MODE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        meta: o.meta,
        group: o.group,
      })),
    [],
  );

  return (
    <div
      className="pt-2"
      data-testid="claim-mode-select"
      data-claim-wizard-nav="body"
    >
      {/* Flush select owns the bottom hairline — no wrapper pb / border-b. */}
      <SearchableSelectField
        appearance="flush"
        value={c.mode}
        onChange={(id) => {
          if (id == null) return;
          c.handleModeChange(id as ClaimModalMode);
        }}
        options={options}
        placeholder="Create or Link…"
        searchPlaceholder="Type to filter…"
        emptyMessage="No modes match"
        ariaLabel="Claim mode"
      />
    </div>
  );
}
