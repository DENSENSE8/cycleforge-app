'use client';

/**
 * The Media Library's selection dock — the house bottom bar the Live feed uses
 * (`RecordActionStrip` face `dock`: `N selected · Actions · Open · ×`). It floats
 * over the library's bottom edge while photos are selected; there is no right
 * rail. Every verb comes from {@link usePhotoVerbs}, the same set the
 * right-click menu reads, so the two surfaces never disagree. Delete is last
 * (RecordActionStrip law) and confirms before it writes.
 */

import { useMemo, type ReactNode } from 'react';
import { CheckSquare, Maximize2, Trash2 } from '@/components/Icons';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { ACTION_DOCK_LIFT } from '@/design-system/tokens/dock-clearance';
import { resolveSelectionAction } from '@/lib/selection/selection-actions';
import type { LibraryPhoto } from './photo-library-types';
import type { PhotoVerb } from './usePhotoVerbs';

/**
 * Letter keys for the selection's verbs — bound and painted by RecordActionStrip
 * (`?` reveals them on the dock). Open is the dock's quick button, not a menu row.
 */
const VERB_HOTKEY: Record<string, string> = {
  download: 'd',
  'copy-link': 'l',
  'share-page': 's',
  'attach-ticket': 'k',
  tag: 't',
};

export function PhotoSelectionDock({
  count,
  rows,
  verbs,
  onDelete,
  onClear,
  shownCount,
  onSelectAll,
}: {
  /** Selection size. */
  count: number;
  /** The loaded rows among the selection. */
  rows: LibraryPhoto[];
  /** The selection's verbs from {@link usePhotoVerbs}. */
  verbs: readonly PhotoVerb[];
  /** Confirm + delete the selection — omitted when it cannot be deleted. */
  onDelete?: () => void;
  onClear: () => void;
  /** Photos painted in the stream, for "Select all N". */
  shownCount: number;
  onSelectAll: () => void;
}): ReactNode {
  const open = verbs.find((verb) => verb.key === 'open');

  const dockVerbs = useMemo<RecordActionVerb[]>(() => {
    const out: RecordActionVerb[] = [];
    if (count < shownCount) {
      out.push({
        id: 'select-all',
        label: `Select all ${shownCount}`,
        icon: <CheckSquare className="h-4 w-4" />,
        run: onSelectAll,
      });
    }
    for (const verb of verbs) {
      if (verb.key === 'open') continue;
      const resolved = resolveSelectionAction(verb, rows);
      out.push({
        id: verb.key,
        hotkey: VERB_HOTKEY[verb.key],
        label: resolved.label,
        icon: verb.icon,
        disabled: resolved.disabled,
        disabledReason: resolved.reason,
        run: () => verb.run(rows),
      });
    }
    if (onDelete) {
      out.push({
        id: 'delete',
        hotkey: 'mod+backspace',
        label: count === 1 ? 'Delete photo' : `Delete ${count} photos`,
        icon: <Trash2 className="h-4 w-4" />,
        tone: 'danger',
        run: onDelete,
      });
    }
    return out;
  }, [count, onDelete, onSelectAll, rows, shownCount, verbs]);

  const quick = useMemo<RecordActionVerb | undefined>(() => {
    if (!open) return undefined;
    const resolved = resolveSelectionAction(open, rows);
    return {
      id: 'open',
      hotkey: 'o',
      label: count === 1 ? 'Open photo' : `Open ${count} photos`,
      icon: <Maximize2 className="size-4" />,
      disabled: resolved.disabled,
      disabledReason: resolved.reason,
      run: () => open.run(rows),
    };
  }, [count, open, rows]);

  if (count === 0) return null;

  const noun = count === 1 ? 'photo' : 'photos';
  return (
    <div
      data-testid="photo-selection-dock"
      className={`pointer-events-none absolute inset-x-0 bottom-full z-sticky flex justify-center px-3 ${ACTION_DOCK_LIFT}`}
    >
      <div role="region" aria-label={`${count} selected ${noun}`} className="pointer-events-auto">
        <RecordActionStrip
          verbs={dockVerbs}
          label={`${count} selected ${noun} actions`}
          testId="photo-selection-dock-actions"
          face="dock"
          onDismiss={onClear}
          dock={{
            count,
            onClear,
            quick,
            quickText: quick ? 'Open' : undefined,
          }}
        />
      </div>
    </div>
  );
}
