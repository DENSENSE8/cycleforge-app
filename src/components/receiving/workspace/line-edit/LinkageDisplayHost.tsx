'use client';

/**
 * Unbox Displays → Linkage topic — Pairing (CartonMatchHub) + Zoho PO note.
 *
 * Condenses the retired `pairing` and `po-note` strip cells. Nested:
 * `?display=linkage&linkageAction=link|note`.
 */

import { FileText, Link2 } from '@/components/Icons';
import { TabDisplay } from '@/design-system/components';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import { CartonMatchHub } from './CartonMatchHub';
import { LinePoNoteCard } from './LinePoNoteCard';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { PoNoteTabState } from './terminal/usePoNoteTabState';
import type { UnboxLinkageAction } from './unbox-side-tabs';

function providerStripLabel(providerKey: string): string {
  const full = providerCatalogLabel(providerKey);
  const brand = full.split(/\s+/)[0]?.trim();
  return brand || full;
}

export function LinkageDisplayHost({
  row,
  staffId,
  action,
  onActionChange,
  hasPoNote,
  poNote,
  pairingFocusTab,
  pairingFocusRequestId,
  autoMatch,
}: {
  row: ReceivingLineRow;
  staffId: string;
  action: UnboxLinkageAction;
  onActionChange: (action: UnboxLinkageAction) => void;
  hasPoNote: boolean;
  poNote: PoNoteTabState;
  pairingFocusTab?: 'zoho_po' | null;
  pairingFocusRequestId?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape as CartonMatchHub autoMatch
  autoMatch: any;
}) {
  const tabs = [
    { id: 'link', label: 'Link', icon: Link2 },
    ...(hasPoNote
      ? [
          {
            id: 'note',
            label: providerStripLabel('zoho'),
            icon: FileText,
          },
        ]
      : []),
  ];

  const resolved: UnboxLinkageAction =
    action === 'note' && hasPoNote ? 'note' : 'link';

  return (
    <div className="flex min-h-0 flex-col gap-0" data-testid="unbox-linkage-display">
      {tabs.length > 1 ? (
        <div className="shrink-0">
          <TabDisplay
            tabs={tabs}
            activeTab={resolved}
            onTabChange={(id) => onActionChange(id as UnboxLinkageAction)}
            density="nested"
            fit="fill"
            appearance="underline"
            aria-label="Linkage actions"
          />
        </div>
      ) : null}
      <div className={cn('min-h-0 flex-1 pt-3', DISPLAYS_BODY_INSET)}>
        {resolved === 'link' ? (
          <CartonMatchHub
            row={row}
            staffId={staffId}
            tabSet="unbox"
            chrome="bare"
            showOpenInUnbox={false}
            autoFocusSearch={false}
            focusTab={pairingFocusTab}
            focusRequestId={pairingFocusRequestId}
            autoMatch={autoMatch}
          />
        ) : (
          <LinePoNoteCard
            draft={poNote.draft}
            onDraftChange={poNote.setDraft}
            loading={poNote.loading}
            dirty={poNote.dirty}
            saving={poNote.saving}
            onSave={() => void poNote.save()}
            onSyncFromInventory={() => void poNote.syncFromInventory()}
          />
        )}
      </div>
    </div>
  );
}
