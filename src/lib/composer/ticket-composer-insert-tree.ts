/**
 * The Ticket-mode `+` tree.
 *
 *   Browse library
 *   Upload file
 *
 * FLAT, and it has no panel title. `+` on a ticket composer means one thing —
 * put a photo on this message — and a header over two rows is a label for a
 * question nobody asked.
 *
 * It briefly also offered “This item” and “What happened” (structured product /
 * timeline sentences folded into the draft). Both were **removed at the
 * operator's instruction on 2026-08-30**: they attached chips the operator did
 * not want above the field, and each one cost a fetch (`/api/support/context`
 * + the shipped-order lookup) on every ticket line just to populate a menu.
 * `buildWhatHappenedFacts` and its test are still in this directory if that
 * feature comes back — do not re-wire it here without being asked.
 *
 * Flat rather than a `Photos ›` submenu on purpose: one row that drills into
 * two rows costs the operator an interaction and buys nothing. The stack in
 * {@link ComposerDrillMenu} is still there for the day a third photo source
 * makes a submenu worth its tap.
 *
 * Nothing here knows about React — {@link ComposerDrillMenu} renders it, and
 * icons are handed in by the host so this module stays free of JSX.
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
