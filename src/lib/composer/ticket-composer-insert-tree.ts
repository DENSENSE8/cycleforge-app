/**
 * The Ticket-mode `+` tree.
 *
 * The product / "what happened" inserts were removed on the **operator's
 * instruction on 2026-08-30**: they attached chips the operator did not want
 * above the field. One product door came back on the **owner's ruling
 * 2026-10-03** ("behind an add, bottom left Plus icon"): "Product sent to
 * customer" opens a picker and logs what we shipped (task-principles P7). The
 * other removed inserts stay removed.
 */

import type { ComposerDrillNode } from '@/components/composer/ComposerDrillMenu';

type TicketInsertTreeIcons = {
  browse?: ComposerDrillNode['icon'];
  upload?: ComposerDrillNode['icon'];
  product?: ComposerDrillNode['icon'];
};

type TicketInsertTreeInput = {
  photos?: {
    onBrowse?: () => void;
    onUpload?: () => void;
    /** Both rows render disabled when the staging pipeline is unavailable. */
    disabled?: boolean;
  };
  /** "Product sent to customer" — opens the product picker. Absent off a live ticket. */
  product?: { onPick?: () => void };
  icons?: TicketInsertTreeIcons;
};

export function buildTicketComposerInsertTree(
  input: TicketInsertTreeInput,
): ComposerDrillNode[] {
  const icons = input.icons ?? {};
  const nodes: ComposerDrillNode[] = [];
  if (input.photos) {
    const { onBrowse, onUpload, disabled } = input.photos;
    nodes.push(
      {
        type: 'action',
        id: 'photos-browse',
        label: 'Browse library',
        icon: icons.browse,
        // A path with no handler goes inert rather than absent — a missing
        // permission should read as "not for you", not as "does not exist".
        disabled: Boolean(disabled) || !onBrowse,
        onSelect: () => onBrowse?.(),
      },
      {
        type: 'action',
        id: 'photos-upload',
        label: 'Upload file',
        icon: icons.upload,
        disabled: Boolean(disabled) || !onUpload,
        onSelect: () => onUpload?.(),
      },
    );
  }
  if (input.product) {
    const { onPick } = input.product;
    nodes.push({
      type: 'action',
      id: 'product-sent',
      label: 'Product sent to customer',
      icon: icons.product,
      disabled: !onPick,
      onSelect: () => onPick?.(),
    });
  }
  return nodes;
}
