'use client';

/** Desk page-header split CTA — a primary verb plus a chevron menu (To-ship's Add manual order, Incoming's Add purchase order). */

import { SlicedActionDock, type SlicedActionDockProps } from '../primitives/SlicedActionDock';
import { useDeskHeaderFace } from './DeskActionSlot';

type DeskHeaderSplitActionProps = Omit<
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
