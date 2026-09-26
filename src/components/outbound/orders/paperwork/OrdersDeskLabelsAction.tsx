'use client';

/** To-ship Labels CTA — `role="leading"`, immediately left of Sync ShipStation. */

import { useEffect, useMemo, useRef } from 'react';
import { FileText } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';

export function OrdersDeskLabelsAction({
  incompleteCount,
  walkOpen,
  disabled,
  onToggle,
}: {
  incompleteCount: number;
  walkOpen: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    return registerShortcutOverviewGroup({
      id: 'to-ship-labels',
      title: 'To-ship',
      rows: [{ keys: ['L'], label: 'Labels display' }],
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'l') return;
      if (isEditableKeyTarget(e.target)) return;
      if (hasOpenOverlay()) return;
      if (disabled && !walkOpen) return;
      e.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, walkOpen]);

  const label =
    incompleteCount > 0 ? `Labels · ${incompleteCount}` : 'Labels';

  const control = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant={walkOpen ? 'primarySoft' : 'secondary'}
        size="sm"
        icon={<FileText aria-hidden />}
        onClick={() => onToggleRef.current()}
        disabled={disabled && !walkOpen}
        aria-pressed={walkOpen}
        aria-keyshortcuts="l"
        data-testid="orders-desk-labels"
        ariaLabel={
          walkOpen
            ? 'Close Labels display'
            : incompleteCount > 0
              ? `Labels display, ${incompleteCount} orders still need paperwork`
              : 'Labels display'
        }
      >
        {label}
      </DeskHeaderAction>
    ),
    [disabled, incompleteCount, label, walkOpen],
  );

  return (
    <DeskActionSlotRegistrar role="leading">{control}</DeskActionSlotRegistrar>
  );
}
