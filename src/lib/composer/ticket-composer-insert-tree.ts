/**
 * The Ticket-mode `+` tree.
 * operator's instruction on 2026-08-30**: they attached chips the operator did
 */

import type { ComposerDrillNode } from '@/components/composer/ComposerDrillMenu';

export type TicketInsertTreeIcons = {
  browse?: ComposerDrillNode['icon'];
  upload?: ComposerDrillNode['icon'];
};

export type TicketInsertTreeInput = {
  photos?: {
    onBrowse?: () => void;
    onUpload?: () => void;
    /** Both rows render disabled when the staging pipeline is unavailable. */
    disabled?: boolean;
  };
  icons?: TicketInsertTreeIcons;
};

export function buildTicketComposerInsertTree(
  input: TicketInsertTreeInput,
): ComposerDrillNode[] {
  if (!input.photos) return [];
  const { onBrowse, onUpload, disabled } = input.photos;
  const icons = input.icons ?? {};
  return [
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
  ];
}
