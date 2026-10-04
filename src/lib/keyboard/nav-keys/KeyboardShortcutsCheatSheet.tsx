'use client';

/** Global `?` keyboard shortcuts cheat sheet — staff overview when no selection CTA strip owns the key. */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { pushOverlay } from '@/lib/overlay-stack/store';
import {
  closeShortcutOverview,
  getServerShortcutOverviewGroups,
  getServerShortcutOverviewOpen,
  getShortcutOverviewOpen,
  listShortcutOverviewGroups,
  subscribeShortcutOverview,
  subscribeShortcutOverviewGroups,
  toggleShortcutOverview,
} from '@/lib/keyboard/shortcut-overview';
import {
  isSelectionInlineHotkeySurfaceActive,
} from '@/hooks/useSelectionStatusBarHotkeys';
import { DISPLAY_LEAF_NAV_KEY } from '@/components/station/displays/display-index';
import { UNBOX_BAND3_NAV_KEY } from '@/lib/receiving/unbox-band3-nav-keys';
import { UNBOX_MIDDLE_CARTON_NAV_KEY } from '@/lib/receiving/unbox-middle-carton-nav-keys';
import { PHOTO_VERB_NAV_KEY } from '@/components/receiving/workspace/line-edit/photo-verb-nav-keys';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { NAV_REGIONS } from './nav-regions';
import { getHotkey } from '@/lib/scan-hotkey/store';
import { hotkeyKeys, PASTE_LIST_HOTKEY } from '@/lib/keyboard/key-registry';

interface ShortcutRow {
  keys: string[];
  label: string;
}

function ShortcutList({ title, rows }: { title: string; rows: ShortcutRow[] }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow text-text-soft">
        {title}
      </p>
      <ul className="divide-y divide-border-hairline">
        {rows.map((row) => (
          <li
            key={`${title}-${row.label}`}
            className="flex items-center justify-between gap-4 py-1.5"
          >
            <span className="truncate text-role-caption text-text-muted">
              {row.label}
            </span>
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

function buildGroups(): { title: string; rows: ShortcutRow[] }[] {
  const scanLabel = typeof window !== 'undefined' ? getHotkey() : 'Insert';

  return [
    {
      title: 'Global',
      rows: [
        { keys: ['⌘', ';'], label: 'Arm nav-keys (then region · letter)' },
        { keys: ['?'], label: 'Reveal hotkeys on buttons (or this sheet)' },
        { keys: ['⌘', '⇧', '?'], label: 'This sheet — anywhere, even while typing' },
        { keys: ['⌘', 'K'], label: 'Command palette' },
        { keys: hotkeyKeys(PASTE_LIST_HOTKEY), label: 'Paste a list into Find — check each number' },
        { keys: ['⌘', ']'], label: 'Open / close Station Displays' },
        { keys: ['⌘', '.'], label: 'Next scan — clear + focus station scan bar' },
        { keys: [scanLabel], label: 'Focus scan bar (reclaim, keep text)' },
        { keys: ['Esc'], label: 'Disarm / close innermost overlay' },
      ],
    },
    {
      title: 'Station scan bar (input focused, field empty)',
      rows: [
        { keys: ['Esc'], label: 'Dismiss preview card, then release type to Auto' },
      ],
    },
    {
      title: 'Regions (after ⌘;)',
      rows: NAV_REGIONS.map((r) => ({
        keys: [r.key],
        label: r.label,
      })),
    },
    {
      title: 'Middle · browse (Band 3)',
      rows: [
        { keys: [UNBOX_BAND3_NAV_KEY.find], label: 'Find' },
        { keys: [UNBOX_BAND3_NAV_KEY.refine], label: 'Refine' },
      ],
    },
    {
      title: 'Middle · carton open',
      rows: [
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.scan], label: 'Focus scan' },
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.serial], label: 'Serial step' },
        {
          keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.condition],
          label: 'Condition step',
        },
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.photos], label: 'Photos step' },
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.cta], label: 'Act (dock CTA)' },
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.print], label: 'Print' },
        { keys: [UNBOX_MIDDLE_CARTON_NAV_KEY.receive], label: 'Receive' },
        { keys: ['←', '→'], label: 'Procedure pager' },
      ],
    },
    {
      title: 'Right · Displays leaves',
      rows: Object.entries(DISPLAY_LEAF_NAV_KEY).map(([id, key]) => ({
        keys: [key],
        label: id,
      })),
    },
    {
      title: 'Right · Photos verbs',
      rows: Object.entries(PHOTO_VERB_NAV_KEY).map(([id, key]) => ({
        keys: [key],
        label: id,
      })),
    },
  ];
}

export function KeyboardShortcutsCheatSheet() {
  const pathname = usePathname() ?? '';
  const enabled = !pathname.startsWith('/photos');
  const open = useSyncExternalStore(
    subscribeShortcutOverview,
    getShortcutOverviewOpen,
    getServerShortcutOverviewOpen,
  );
  const extraGroups = useSyncExternalStore(
    subscribeShortcutOverviewGroups,
    listShortcutOverviewGroups,
    getServerShortcutOverviewGroups,
  );

  const close = useCallback(() => closeShortcutOverview(), []);

  useEffect(() => {
    if (!enabled) closeShortcutOverview();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // ⌘⇧? / Ctrl+Shift+? — the sheet from anywhere, text fields included
      // (physical Slash, so it holds on layouts where `?` moves).
      if (e.code === 'Slash' && e.shiftKey && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleShortcutOverview();
        return;
      }
      if (e.key !== '?') return;
      // Holding `?` (key-repeat) must not open / toggle the cheat sheet —
      // selection CTA reveal already ignores repeat; stay aligned.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Selection CTAs own `?` while mounted — useSelectionStatusBarHotkeys toggles overlays (including from Filter-orders INPUT).
      if (isSelectionInlineHotkeySurfaceActive()) return;
      if (isEditableKeyTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      toggleShortcutOverview();
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    return pushOverlay();
  }, [open]);

  if (!enabled) return null;

  const staticGroups = buildGroups();
  const groups = [
    staticGroups[0],
    ...extraGroups.map((g) => ({ title: g.title, rows: [...g.rows] })),
    ...staticGroups.slice(1),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-role-caption font-semibold">
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-role-caption text-text-muted">
            On scan stations, letters fire only after ⌘; arms a region — wedges
            cannot arm the leader.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-testid="keyboard-shortcuts-cheat-sheet">
          {groups.map((g) => (
            <ShortcutList key={g.title} title={g.title} rows={g.rows} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
