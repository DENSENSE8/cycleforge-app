'use client';

import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';

interface ShortcutRow {
  keys: string[];
  label: string;
}

/** Grid/page shortcuts (useMediaLibraryShortcuts). */
const GRID_SHORTCUTS: ShortcutRow[] = [
  { keys: ['←', '→', '↑', '↓'], label: 'Move between photos' },
  { keys: ['Enter'], label: 'Open focused photo' },
  { keys: ['Space'], label: 'Select / deselect focused photo' },
  { keys: ['Home', 'End'], label: 'First / last photo' },
  { keys: ['1'], label: 'List' },
  { keys: ['⌘', 'A'], label: 'Select all loaded (while selecting)' },
  { keys: ['Esc'], label: 'Exit selection' },
  { keys: ['?'], label: 'Show this help' },
];

/** Viewer shortcuts (owned by usePhotoGallery). */
const VIEWER_SHORTCUTS: ShortcutRow[] = [
  { keys: ['←', '→'], label: 'Previous / next photo' },
  { keys: ['+', '−'], label: 'Zoom in / out' },
  { keys: ['0'], label: 'Reset zoom' },
  { keys: ['R'], label: 'Rotate' },
  { keys: ['I'], label: 'Toggle details panel' },
  { keys: ['Esc'], label: 'Close viewer' },
];

function ShortcutList({ title, rows }: { title: string; rows: ShortcutRow[] }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{title}</p>
      <ul className="divide-y divide-border-hairline">
        {rows.map((row) => (
          <li key={`${title}-${row.label}`} className="flex items-center justify-between gap-4 py-1.5">
            <span className="truncate text-role-caption text-text-muted">{row.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((k, i) => (
                <KeyboardKey key={i} size="md">
                  {k}
                </KeyboardKey>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Keyboard shortcut cheat sheet for the media library (toggled with `?`). */
export function MediaLibraryShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // `?` toggles help closed (Escape is handled by Dialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-role-caption font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Grid and photo viewer keyboard shortcuts for the media library.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ShortcutList title="Grid" rows={GRID_SHORTCUTS} />
          <ShortcutList title="Photo viewer" rows={VIEWER_SHORTCUTS} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
