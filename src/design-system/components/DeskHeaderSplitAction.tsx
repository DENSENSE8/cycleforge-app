'use client';

/**
 * Desk page-header split CTA — a primary verb plus a chevron menu (To-ship's
 * Sync Google Sheet, Incoming's Add purchase order).
 *
 * The desk hands over the verb and the menu; the BAR decides the face through
 * {@link useDeskHeaderFace}: the pill capsule on a card desk, the industrial
 * segment on a `stage="flush"` bar — where it sits flush against its
 * neighbours and works like the mode tabs on the bar's left end. Lives apart
 * from `DeskActionSlot` so the motion-backed dock stays off that module's
 * graph (every desk route imports it).
 */

import { SlicedActionDock, type SlicedActionDockProps } from '../primitives/SlicedActionDock';
import { useDeskHeaderFace } from './DeskActionSlot';

export type DeskHeaderSplitActionProps = Omit<
  SlicedActionDockProps,
  'embedded' | 'embeddedChrome' | 'docked' | 'edge' | 'align' | 'maxWidth' | 'fullWidth'
>;

export function DeskHeaderSplitAction(props: DeskHeaderSplitActionProps) {
  const face = useDeskHeaderFace();
  return (
    <SlicedActionDock
      {...props}
      embedded
      embeddedChrome={face === 'segment' ? 'segment' : 'header'}
    />
  );
}
