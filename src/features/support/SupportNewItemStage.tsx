'use client';

/**
 * New Support item, INLINE over the desk stage (owner 2026-10-04: "If I am on
 * support and press N, it must show a form inline … not a popover"): the
 * house `DeskStageOverlay` at `fill="stage"` (Back top-left, Esc closes; a
 * stray click never eats a half-typed form) around `NewSupportItemForm`.
 * Focus inside the form owns the list keys, so J / K never walk the cards
 * behind it.
 */

import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { NewSupportItemForm } from './NewSupportItemForm';

export const NEW_SUPPORT_ITEM_LABEL = 'New Support item';

export function SupportNewItemStage({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The created item's record href (`supportHref({ item })`). */
  onCreated: (href: string) => void;
}) {
  return (
    <DeskStageOverlay open={open} onClose={onClose} title={NEW_SUPPORT_ITEM_LABEL} fill="stage" closeOnScrim={false} testId="support-new-item">
      <div {...{ [LIST_KEY_OWNER_ATTR]: '' }} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl pb-6">
          <NewSupportItemForm onCreated={onCreated} onCancel={onClose} />
        </div>
      </div>
    </DeskStageOverlay>
  );
}
