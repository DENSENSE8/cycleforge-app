'use client';

/** `RecordActionStrip` — the ONE place a desk record's verbs paint (owner 2026-09-25, supersedes "actions in the record header / right… */

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

interface RecordActionStripProps {
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
  /**
   * `strip` (default): its own bordered row. `header`: bare, inside a table
   * header that became the bulk bar (the header owns the rule and the fill).
   */
  face?: 'strip' | 'header';
}

const STRIP_CLASS = 'flex w-full min-w-0 items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1.5';
const HEADER_FACE_CLASS = 'flex min-w-0 items-center gap-1';

export function RecordActionStrip({
  verbs,
  label,
  testId = 'record-action-strip',
  onDismiss,
  face = 'strip',
}: RecordActionStripProps) {
  const shellClass = face === 'header' ? HEADER_FACE_CLASS : STRIP_CLASS;
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
        className={cn(shellClass, 'flex-nowrap')}
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
        // The header face sits in a 28px chrome row: 24px pills, not 32px.
        className={face === 'header' ? 'h-6' : undefined}
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
      className={cn(shellClass, face === 'header' ? 'flex-nowrap' : 'flex-wrap')}
    >
      <div className={cn('flex min-w-0 flex-1 items-center gap-1', face === 'header' ? 'flex-nowrap' : 'flex-wrap')}>
        {primary.map(verbButton)}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {overflow.length > 0 ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton
                type="button"
                size={face === 'header' ? 'xs' : 'sm'}
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
