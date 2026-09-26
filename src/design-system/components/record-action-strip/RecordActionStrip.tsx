'use client';

/**
 * `RecordActionStrip` — the ONE place a desk record's verbs paint (owner
 * 2026-09-25, supersedes "actions in the record header / right column").
 *
 * ## Where it paints
 *
 * Under the list's search row, inside the element the list marks with
 * `DESK_RECORD_ANCHOR_ATTR` (search row + strip together). In place, the open
 * record opens BELOW that anchor, so the search row and this strip stay
 * visible and live over it; in split, the strip sits under the list's search
 * bar beside the record pane. The record header and the record's own columns
 * carry no verbs. Lists host it through their strip slot: `DataTable`
 * `actionStrip`, `RecordLedger` `actionStrip`, the outbound ledger's own row.
 * Idle (no verbs — nothing open, nothing checked) it paints nothing.
 *
 * ## Chrome
 *
 * Primary verbs left, in the order given. `overflow` verbs behind one ⋮ menu.
 * `isolated` verbs (Delete) on the far right, and they take a SECOND press:
 * the same button re-labels ("Delete — press again"), so an irreversible verb
 * cannot fire on a mis-click without adding a confirm control. Any other
 * press disarms it.
 *
 * ## Morph
 *
 * A verb with `display` morphs the strip into that display (the OOS product
 * picker, the scan-out staff picker, the notes composer, the task composer),
 * with a Back control before it; `done()` morphs it back. The swap is instant
 * — no geometry tween (repo motion law: never animate layout size; the record
 * below re-measures its top edge off this strip).
 *
 * ## Keys
 *
 * Each verb's `hotkey` runs it from the verbs view (not while typing, not
 * while a popover / menu owns the keyboard). `?` reveals the letters with
 * {@link KeyboardKey} (the shared selection-hotkey reveal store). Escape
 * ladder: an open popover inside a display → the display (back to the verbs)
 * → `onDismiss` when the host passes one (a row-anchored bulk strip) →
 * otherwise the key passes on (the record plane closes the record, then
 * fullscreen).
 *
 * Key the strip by the record it acts on (`key={record.id}`) so walking to
 * the next record resets an open display and an armed second press.
 *
 * Precedent: `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx`
 * (orders is consumer #1 — its row-anchored bulk strip and the open-record
 * strip both render through this primitive).
 */

import { useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { MoreHorizontal } from '@/components/Icons';
import { useSelectionInlineHotkeysRevealed } from '@/hooks/useSelectionStatusBarHotkeys';
import { useRecordActionStripKeys } from './useRecordActionStripKeys';
import { cn } from '@/utils/_cn';

export interface RecordActionVerb {
  id: string;
  /** A verb ("Out of stock", "Scan out") — from the record's current state ("Clear urgent"). */
  label: string;
  icon?: ReactNode;
  /** Single key, shown via KeyboardKey on `?`. */
  hotkey?: string;
  tone?: 'default' | 'danger';
  /** `isolated` = far right, second press (Delete). Default `primary`. */
  placement?: 'primary' | 'overflow' | 'isolated';
  disabled?: boolean;
  disabledReason?: string;
  /** A toggle verb's current state (Select, Mark urgent) — `aria-pressed`. */
  pressed?: boolean;
  /** Immediate verb. */
  run?: () => void | Promise<void>;
  /** OR morph the strip into this display; `done()` morphs it back. */
  display?: (done: () => void) => ReactNode;
}

export interface RecordActionStripProps {
  verbs: readonly RecordActionVerb[];
  /** Accessible name of the toolbar (`Order 113-0586702 actions`). */
  label: string;
  /** On the strip; each verb carries `<testId>-<verb id>`. */
  testId?: string;
  /**
   * Escape on the verbs view dismisses the strip (a row-anchored bulk strip
   * that owns its own open state). Omit for an open-record strip: Escape then
   * passes on to the record plane.
   */
  onDismiss?: () => void;
}

const STRIP_CLASS = 'flex w-full min-w-0 items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1.5';

export function RecordActionStrip({
  verbs,
  label,
  testId = 'record-action-strip',
  onDismiss,
}: RecordActionStripProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const showHotkeys = useSelectionInlineHotkeysRevealed();

  const active = activeId == null ? null : (verbs.find((verb) => verb.id === activeId && verb.display) ?? null);
  const idle = verbs.length === 0;

  const done = () => {
    setActiveId(null);
    setArmedId(null);
  };

  const press = (verb: RecordActionVerb) => {
    if (verb.disabled) return;
    if (verb.placement === 'isolated' && armedId !== verb.id) {
      setArmedId(verb.id);
      return;
    }
    setArmedId(null);
    if (verb.display) {
      setActiveId(verb.id);
      return;
    }
    void verb.run?.();
  };

  const displayOpen = active != null;
  useRecordActionStripKeys({ verbs, displayOpen, press, done, onDismiss });

  if (idle) return null;

  if (active?.display) {
    return (
      <div
        role="group"
        aria-label={`${label}: ${active.label}`}
        data-testid={testId}
        data-view={active.id}
        className={cn(STRIP_CLASS, 'flex-nowrap')}
      >
        <Button type="button" variant="ghost" size="sm" onClick={done} data-testid={`${testId}-back`}>
          Back
        </Button>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1" data-testid={`${testId}-display`}>
          {active.display(done)}
        </div>
      </div>
    );
  }

  const primary = verbs.filter((verb) => (verb.placement ?? 'primary') === 'primary');
  const overflow = verbs.filter((verb) => verb.placement === 'overflow');
  const isolated = verbs.filter((verb) => verb.placement === 'isolated');

  const verbButton = (verb: RecordActionVerb) => {
    const armed = armedId === verb.id;
    const danger = verb.tone === 'danger';
    return (
      <Button
        key={verb.id}
        type="button"
        size="sm"
        radius="pill"
        variant={danger ? (armed || verb.placement !== 'isolated' ? 'danger' : 'dangerSoft') : verb.pressed ? 'ink' : 'secondary'}
        icon={verb.icon}
        disabled={verb.disabled}
        title={verb.disabled ? verb.disabledReason : undefined}
        aria-pressed={verb.pressed}
        aria-haspopup={verb.display ? 'true' : undefined}
        data-testid={`${testId}-${verb.id}`}
        data-armed={armed ? '' : undefined}
        onClick={() => press(verb)}
      >
        {armed ? `${verb.label} — press again` : verb.label}
        {showHotkeys && verb.hotkey ? (
          <KeyboardKey aria-hidden size="sm" className="ml-1">
            {verb.hotkey.toUpperCase()}
          </KeyboardKey>
        ) : null}
      </Button>
    );
  };

  return (
    <div
      role="toolbar"
      aria-label={label}
      data-testid={testId}
      data-view="verbs"
      className={cn(STRIP_CLASS, 'flex-wrap')}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{primary.map(verbButton)}</div>
      <div className="flex shrink-0 items-center gap-1">
        {overflow.length > 0 ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton
                type="button"
                size="sm"
                radius="pill"
                tone="neutral"
                icon={<MoreHorizontal className="h-3.5 w-3.5" />}
                ariaLabel="More actions"
                data-testid={`${testId}-more`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              {overflow.map((verb) => (
                <DropdownMenuItem
                  key={verb.id}
                  disabled={verb.disabled}
                  title={verb.disabled ? verb.disabledReason : undefined}
                  data-testid={`${testId}-${verb.id}`}
                  className={verb.tone === 'danger' ? 'text-text-danger' : undefined}
                  onSelect={() => press(verb)}
                >
                  {verb.icon}
                  {verb.label}
                  {showHotkeys && verb.hotkey ? (
                    <KeyboardKey aria-hidden size="sm" className="ml-auto">
                      {verb.hotkey.toUpperCase()}
                    </KeyboardKey>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {isolated.map(verbButton)}
      </div>
    </div>
  );
}
