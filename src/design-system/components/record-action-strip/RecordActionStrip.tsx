'use client';

/** `RecordActionStrip` — the ONE place a desk record's verbs paint (owner 2026-09-25, supersedes "actions in the record header / right… */

import { useEffect, useState, type ReactNode } from 'react';
import { claimOverlay } from '@/lib/overlay-stack/store';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { hotkeyChord } from '@/lib/keyboard/key-registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { MoreVertical } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
  /** `warning` = the orange escalation fill (Create customer ticket). */
  tone?: 'default' | 'danger' | 'warning' | 'yellow' | 'blue' | 'success';
  disabled?: boolean;
  disabledReason?: string;
  /** A toggle verb's current state (Select, Mark urgent) — `aria-pressed`. */
  pressed?: boolean;
  /**
   * Which check-sets the verb acts on (Law 5 — the selection bar paints the
   * same verbs in the same order at 1 or N checked): `single` = one record
   * (the lead), `bulk` = two or more, `both` (default) = any. Out of scope, the
   * verb stays in its place, disabled with the reason ({@link scopeRecordVerbs}).
   */
  scope?: RecordVerbScope;
  /** Immediate verb. */
  run?: () => void | Promise<void>;
  /** OR morph the strip into this display; `done()` morphs it back. */
  display?: (done: () => void) => ReactNode;
}

export type RecordVerbScope = 'single' | 'bulk' | 'both';

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
   * `inline`: a shrink-wrapped row of icon+text verbs, no border and no width
   * of its own — sits in a title row.
   */
  face?: 'strip' | 'header' | 'inline';
}

const STRIP_CLASS =
  'flex w-full min-w-0 items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1.5';
const HEADER_FACE_CLASS = '@container/verbs flex w-full min-w-0 flex-1 items-center gap-1';
const INLINE_FACE_CLASS = 'flex shrink-0 items-center gap-1';

/**
 * Header actions start as icons and expand in importance order. At most three
 * actions can occupy the strip; every remaining action lives behind ⋮.
 */
const HEADER_EXPAND_TIERS: readonly { button: string; label: string }[] = [
  { button: '@xs/verbs:w-auto @xs/verbs:!px-2.5', label: '@xs/verbs:not-sr-only' },
  { button: '@sm/verbs:w-auto @sm/verbs:!px-2.5', label: '@sm/verbs:not-sr-only' },
  { button: '@lg/verbs:w-auto @lg/verbs:!px-2.5', label: '@lg/verbs:not-sr-only' },
];

export function partitionRecordActionVerbs(verbs: readonly RecordActionVerb[]): {
  primary: RecordActionVerb[];
  overflow: RecordActionVerb[];
} {
  const primary: RecordActionVerb[] = [];
  const overflow: RecordActionVerb[] = [];
  for (const verb of verbs) {
    if (verb.tone !== 'danger' && primary.length < 3) primary.push(verb);
    else overflow.push(verb);
  }
  return { primary, overflow };
}

export function RecordActionStrip({
  verbs,
  label,
  testId = 'record-action-strip',
  onDismiss,
  face = 'strip',
}: RecordActionStripProps) {
  const shellClass = face === 'header' ? HEADER_FACE_CLASS : face === 'inline' ? INLINE_FACE_CLASS : STRIP_CLASS;
  const [activeId, setActiveId] = useState<string | null>(null);
  // The ⋮ menu holds the keyboard while open, like any overlay: its Escape
  // closes the menu — not this strip, and not the host's check-set.
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const claim = claimOverlay();
    return () => claim.release();
  }, [moreOpen]);
  const showHotkeys = useSelectionInlineHotkeysRevealed();

  const active = activeId == null ? null : (verbs.find((verb) => verb.id === activeId && verb.display) ?? null);
  const idle = verbs.length === 0;

  const done = () => {
    setActiveId(null);
  };

  const press = (verb: RecordActionVerb) => {
    if (verb.disabled) return;
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

  const { primary, overflow } = partitionRecordActionVerbs(verbs);

  /** `expand` = the header face's rung for this verb; without one a header verb stays a 24px icon. */
  const verbButton = (verb: RecordActionVerb, expand?: (typeof HEADER_EXPAND_TIERS)[number]) => {
    const warning = verb.tone === 'warning';
    const yellow = verb.tone === 'yellow';
    const blue = verb.tone === 'blue';
    const success = verb.tone === 'success';
    return (
      <HoverTooltip
        key={verb.id}
        label={verb.disabled ? (verb.disabledReason ?? verb.label) : verb.label}
        shortcut={verb.hotkey ? hotkeyChord(verb.hotkey) : undefined}
        asChild
        placement="above"
      >
        <Button
          type="button"
          size="sm"
          radius="pill"
          variant={
            warning
              ? 'warning'
              : yellow
                ? 'yellow'
                : blue
                  ? 'primarySoft'
                  : success
                    ? 'success'
                    : verb.pressed
                      ? 'ink'
                      : 'secondary'
          }
          icon={verb.icon}
          ariaLabel={verb.label}
          disabled={verb.disabled}
          aria-pressed={verb.pressed}
          aria-haspopup={verb.display ? 'true' : undefined}
          data-testid={`${testId}-${verb.id}`}
          // A record header spends its width on identity first: a verb is a
          // 24px icon, spelled out only once the header has room for it
          // (HEADER_EXPAND_TIERS); the tooltip and accessible name carry it until then.
          className={face === 'header' ? cn('h-6 w-6 shrink-0 whitespace-nowrap !px-0', expand?.button) : undefined}
          onClick={() => press(verb)}
        >
          <span className={face === 'header' ? cn('sr-only', expand?.label) : undefined}>
            {verb.label}
          </span>
          {face !== 'header' && showHotkeys && verb.hotkey ? (
            <KeyboardChord chord={hotkeyChord(verb.hotkey)} size="sm" tone="default" className="ml-1" />
          ) : null}
        </Button>
      </HoverTooltip>
    );
  };

  return (
    <div
      role="toolbar"
      aria-label={label}
      data-testid={testId}
      data-view="verbs"
      className={cn(shellClass, face === 'strip' ? 'flex-wrap' : 'flex-nowrap')}
      // A size container has no content width of its own, so the header face
      // declares its collapsed row (24px icons, gap-1) as its floor.
      style={
        face === 'header'
          ? { minWidth: `${(primary.length + (overflow.length > 0 ? 1 : 0)) * 1.75}rem` }
          : undefined
      }
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-1',
          face === 'inline' ? 'shrink-0 flex-nowrap' : 'flex-1',
          face === 'header'
            ? 'flex-nowrap [&>*:first-child]:ml-auto'
            : face === 'inline'
              ? 'flex-nowrap'
              : 'flex-wrap',
        )}
      >
        {primary.map((verb, index) => verbButton(verb, HEADER_EXPAND_TIERS[index]))}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {overflow.length > 0 ? (
          <DropdownMenu modal={false} open={moreOpen} onOpenChange={setMoreOpen}>
            <HoverTooltip label="More actions" asChild placement="above">
              <DropdownMenuTrigger asChild>
                <IconButton
                  type="button"
                  size={face === 'header' ? 'xs' : 'sm'}
                  radius="pill"
                  tone="neutral"
                  icon={<MoreVertical className="h-3.5 w-3.5" />}
                  ariaLabel="More actions"
                  data-testid={`${testId}-more`}
                />
              </DropdownMenuTrigger>
            </HoverTooltip>
            <DropdownMenuContent align="end" side="bottom">
              {overflow.map((verb) => (
                // Hotkeys are disclosed on hover, never painted inline (owner 2026-10-03); `?` still reveals them.
                <HoverTooltip
                  key={verb.id}
                  label={verb.disabled ? (verb.disabledReason ?? verb.label) : verb.label}
                  shortcut={verb.hotkey ? hotkeyChord(verb.hotkey) : undefined}
                  asChild
                  placement="left"
                  focusable={false}
                >
                  <DropdownMenuItem
                    disabled={verb.disabled}
                    title={verb.disabled ? verb.disabledReason : undefined}
                    data-testid={`${testId}-${verb.id}`}
                    tone={verb.tone === 'danger' ? 'danger' : 'default'}
                    onSelect={() => press(verb)}
                  >
                    {verb.icon}
                    {verb.label}
                    {showHotkeys && verb.hotkey ? (
                      <KeyboardChord chord={hotkeyChord(verb.hotkey)} size="sm" tone="default" className="ml-auto" />
                    ) : null}
                  </DropdownMenuItem>
                </HoverTooltip>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
