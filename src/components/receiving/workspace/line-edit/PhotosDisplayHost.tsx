'use client';

/**
 * Unbox Displays → Photos leaf — armed rows + drill-down bodies (no nested tabs).
 *
 * Nest altitude (`UNBOX_PHOTO_ACTION_ORDER`): Actions (default) → Link · Move ·
 * Send → Compare. Default (`photos` leaf / absent `photoAction`): keyboard-armed
 * verb list ({@link PhotosActionsArmedList}). Drill-downs via local nest:
 * `photoAction` link|move|send|compare (legacy `browse` → Actions list).
 *
 * **Chunk split:** Actions rides this host module (default face). Link · Move ·
 * Send · Compare are `dynamic()` so opening Photos does not download those panels.
 *
 * Drill trail reports via {@link useDisplaysLeafChrome} so sticky Back / Esc
 * pops Compare|Move|Send|Link → Actions → index (never a second LeafHeader).
 *
 * Identity Photos pill: click = send-to-phone; hover = PhotoLauncher dropdown
 * (Move / Send open this leaf's drills); double-click = open this leaf's
 * Actions list. Column `→|` / Esc own dismiss; Back from a drill-down returns
 * to the row list.
 */

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useDisplaysLeafChrome } from '@/components/station/displays/displays-leaf-chrome';
import { PhotosActionsArmedList } from './PhotosActionsArmedList';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { UnboxPhotoAction } from './unbox-side-tabs';

const PhotoLinkDisplay = dynamic(
  () => import('./PhotoLinkDisplay').then((m) => m.PhotoLinkDisplay),
  { loading: () => null },
);
const MovePhotosBetweenPoPanel = dynamic(
  () =>
    import('./MovePhotosBetweenPoPanel').then((m) => m.MovePhotosBetweenPoPanel),
  { loading: () => null },
);
const SendPhotoNotePanel = dynamic(
  () => import('../SendPhotoNotePanel').then((m) => m.SendPhotoNotePanel),
  { loading: () => null },
);
const ListingPhotoCompareHost = dynamic(
  () =>
    import('./ListingPhotoCompareHost').then((m) => m.ListingPhotoCompareHost),
  { loading: () => null },
);

const PHOTO_DRILL_LABEL: Record<Exclude<UnboxPhotoAction, 'actions'>, string> = {
  link: 'Link',
  move: 'Move',
  send: 'Send',
  compare: 'Compare',
};

function isPhotoDrill(action: UnboxPhotoAction): action is Exclude<UnboxPhotoAction, 'actions'> {
  return action === 'link' || action === 'move' || action === 'send' || action === 'compare';
}

export function PhotosDisplayHost({
  row,
  staffId,
  action,
  onActionChange,
  linkTargetLineId,
  linkTargetCartonAspect = null,
  linkFocusRequestId = 0,
}: {
  row: ReceivingLineRow;
  /** Desk staff id — Phone verb publishes the carton capture request. */
  staffId: number;
  action: UnboxPhotoAction;
  onActionChange: (action: UnboxPhotoAction) => void;
  /** `link` drill: which PO item the "Link to" combobox defaults to (else this row). */
  linkTargetLineId?: number | null;
  /** `link` drill: carton aspect handoff from Arrival / bench dock Link. */
  linkTargetCartonAspect?: PhotoAspect | null;
  /** Bump to re-default the "Link to" target from a fresh handoff. */
  linkFocusRequestId?: number;
}) {
  const verb: UnboxPhotoAction = isPhotoDrill(action) ? action : 'actions';
  const { setTrail, setOnNestedPop, setOnNestedRestore } = useDisplaysLeafChrome();

  // Sticky Back / Esc: Actions = leaf root; drill = Photos → Link|Move|Send|Compare.
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
            onOpenLink={() => onActionChange('link')}
            onOpenCompare={() => onActionChange('compare')}
            onOpenMove={() => onActionChange('move')}
            onOpenSend={() => onActionChange('send')}
          />
        ) : null}
        {verb === 'link' ? (
          <PhotoLinkDisplay
            key={`link-${row.receiving_id ?? row.id}`}
            receivingId={row.receiving_id ?? 0}
            defaultTargetLineId={linkTargetLineId ?? row.id}
            defaultCartonAspect={linkTargetCartonAspect}
            focusRequestId={linkFocusRequestId}
            onClose={() => onActionChange('actions')}
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
