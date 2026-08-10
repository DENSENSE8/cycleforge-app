'use client';

/**
 * Unbox Displays → Linkage topic — Pairing (CartonMatchHub) + Zoho PO note.
 *
 * Armed-row verbs + URL drills (Photos twin):
 * `?display=linkage` → Actions list · `?linkageAction=link|note` → bodies.
 */

import { useEffect, useMemo } from 'react';
import { FileText, Link2 } from '@/components/Icons';
import { useDisplaysLeafChrome } from '@/components/station/displays/displays-leaf-chrome';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
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

const LINKAGE_DRILL_LABEL: Record<'link' | 'note', string> = {
  link: 'Link',
  note: 'Note',
};

function isLinkageDrill(
  action: UnboxLinkageAction,
): action is 'link' | 'note' {
  return action === 'link' || action === 'note';
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
  const { setTrail, setOnNestedPop, setOnNestedRestore } = useDisplaysLeafChrome();

  const verbs = useMemo<StationArmedVerb[]>(() => {
    const rows: StationArmedVerb[] = [
      {
        id: 'link',
        label: 'Link',
        preferredKey: 'k',
        icon: (p) => <Link2 className={p.className} />,
      },
    ];
    if (hasPoNote) {
      rows.push({
        id: 'note',
        label: providerStripLabel('zoho'),
        preferredKey: 'n',
        icon: (p) => <FileText className={p.className} />,
      });
    }
    return rows;
  }, [hasPoNote]);

  const verb: UnboxLinkageAction = isLinkageDrill(action)
    ? action === 'note' && !hasPoNote
      ? 'actions'
      : action
    : 'actions';

  useEffect(() => {
    if (verb === 'actions') {
      setTrail([{ id: 'linkage', label: 'Linkage' }]);
    } else {
      setTrail([
        { id: 'linkage', label: 'Linkage' },
        { id: verb, label: LINKAGE_DRILL_LABEL[verb] },
      ]);
    }
  }, [verb, setTrail]);

  useEffect(() => {
    setOnNestedPop(() => onActionChange('actions'));
    return () => setOnNestedPop(null);
  }, [setOnNestedPop, onActionChange]);

  useEffect(() => {
    setOnNestedRestore((segmentId) => {
      if (isLinkageDrill(segmentId as UnboxLinkageAction)) {
        onActionChange(segmentId as UnboxLinkageAction);
      }
    });
    return () => setOnNestedRestore(null);
  }, [setOnNestedRestore, onActionChange]);

  return (
    <div className="flex min-h-0 flex-col gap-0" data-testid="unbox-linkage-display">
      {verb === 'actions' ? (
        <StationArmedVerbList
          verbs={verbs}
          listLabel="Linkage actions"
          testId="unbox-linkage-actions"
          onCommit={(id) => onActionChange(id as UnboxLinkageAction)}
        />
      ) : null}
      {verb === 'link' ? (
        <div className={cn('min-h-0 flex-1 pt-3', DISPLAYS_BODY_INSET)}>
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
        </div>
      ) : null}
      {verb === 'note' && hasPoNote ? (
        <div className={cn('min-h-0 flex-1 pt-3', DISPLAYS_BODY_INSET)}>
          <LinePoNoteCard
            draft={poNote.draft}
            onDraftChange={poNote.setDraft}
            loading={poNote.loading}
            dirty={poNote.dirty}
            saving={poNote.saving}
            onSave={() => void poNote.save()}
            onSyncFromInventory={() => void poNote.syncFromInventory()}
          />
        </div>
      ) : null}
    </div>
  );
}
