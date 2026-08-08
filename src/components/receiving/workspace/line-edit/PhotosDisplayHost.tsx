'use client';

/**
 * Unbox Displays → Photos leaf — armed rows + drill-down bodies (no nested tabs).
 *
 * Nest altitude (`UNBOX_PHOTO_ACTION_ORDER`): Actions (default) → Move · Send →
 * Compare. Default (`?display=photos` / absent `photoAction`): keyboard-armed
 * verb list ({@link PhotosActionsArmedList}). Drill-downs via URL:
 * `?photoAction=move|send|compare` (legacy `browse` → Actions list).
 *
 * Drill trail reports via {@link useDisplaysLeafChrome} so sticky Back / Esc
 * pops Compare|Move|Send → Actions → index (never a second LeafHeader).
 *
 * Identity Photos pill click stays send-to-phone (hover toolbar suppressed).
 * Column `→|` / Esc own dismiss; Back from a drill-down returns to the row list.
 */

import { useEffect } from 'react';
import { useDisplaysLeafChrome } from '@/components/station/displays/displays-leaf-chrome';
import { MovePhotosBetweenPoPanel } from './MovePhotosBetweenPoPanel';
import { SendPhotoNotePanel } from '../SendPhotoNotePanel';
import { ListingPhotoCompareHost } from './ListingPhotoCompareHost';
import { PhotosActionsArmedList } from './PhotosActionsArmedList';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxPhotoAction } from './unbox-side-tabs';

const PHOTO_DRILL_LABEL: Record<Exclude<UnboxPhotoAction, 'actions'>, string> = {
  move: 'Move',
  send: 'Send',
  compare: 'Compare',
};

function isPhotoDrill(action: UnboxPhotoAction): action is Exclude<UnboxPhotoAction, 'actions'> {
  return action === 'move' || action === 'send' || action === 'compare';
}

export function PhotosDisplayHost({
  row,
  staffId,
  action,
  onActionChange,
}: {
  row: ReceivingLineRow;
  /** Desk staff id — Phone verb publishes the carton capture request. */
  staffId: number;
  action: UnboxPhotoAction;
  onActionChange: (action: UnboxPhotoAction) => void;
}) {
  const verb: UnboxPhotoAction = isPhotoDrill(action) ? action : 'actions';
  const { setTrail, setOnNestedPop, setOnNestedRestore } = useDisplaysLeafChrome();

  // Sticky Back / Esc: Actions = leaf root; drill = Photos → Move|Send|Compare.
  useEffect(() => {
    if (verb === 'actions') {
      setTrail([{ id: 'photos', label: 'Photos' }]);
    } else {
      setTrail([
        { id: 'photos', label: 'Photos' },
        { id: verb, label: PHOTO_DRILL_LABEL[verb] },
      ]);
    }
  }, [verb, setTrail]);

  useEffect(() => {
    setOnNestedPop(() => onActionChange('actions'));
    return () => setOnNestedPop(null);
  }, [setOnNestedPop, onActionChange]);

  useEffect(() => {
    setOnNestedRestore((segmentId) => {
      if (isPhotoDrill(segmentId as UnboxPhotoAction)) {
        onActionChange(segmentId as UnboxPhotoAction);
      }
    });
    return () => setOnNestedRestore(null);
  }, [setOnNestedRestore, onActionChange]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-0" data-testid="unbox-photos-display">
      {/* Flush bodies — rows are the subject list (no nested underline strip). */}
      <div className="min-h-0 flex-1">
        {verb === 'actions' ? (
          <PhotosActionsArmedList
            row={row}
            staffId={staffId}
            onOpenCompare={() => onActionChange('compare')}
            onOpenMove={() => onActionChange('move')}
            onOpenSend={() => onActionChange('send')}
          />
        ) : null}
        {verb === 'compare' ? <ListingPhotoCompareHost row={row} /> : null}
        {verb === 'move' ? (
          <MovePhotosBetweenPoPanel
            key={`move-${row.receiving_id ?? row.id}`}
            open
            receivingId={row.receiving_id}
            onClose={() => onActionChange('actions')}
            chrome="display"
          />
        ) : null}
        {verb === 'send' ? (
          <SendPhotoNotePanel
            key={`note-${row.id}`}
            open
            row={row}
            onClose={() => onActionChange('actions')}
            chrome="display"
          />
        ) : null}
      </div>
    </div>
  );
}
