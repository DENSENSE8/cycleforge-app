'use client';

/** `RecordActionStrip` — the ONE place a desk record's verbs paint (owner 2026-09-25, supersedes "actions in the record header / right… */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { claimOverlay } from '@/lib/overlay-stack/store';
import { Button, type ButtonVariant } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardChord } from '@/design-system/primitives/KeyboardKey';
import { hotkeyChord } from '@/lib/keyboard/key-registry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import {
  DangerZoneButton,
  DangerZoneLayer,
  DangerZoneSection,
  type DangerZoneItem,
  type DangerZoneView,
} from '@/design-system/components/danger-zone/DangerZone';
import { Zap } from 'lucide-react';
import { MoreVertical, X } from '@/components/Icons';
import {
  LIQUID_METAL_CHIP_CLASS,
  LIQUID_METAL_GHOST_CLASS,
  LIQUID_METAL_STYLE,
  LIQUID_METAL_TEXT_CLASS,
} from '@/design-system/tokens/liquid-metal';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
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
  /**
   * Paint the verb spelled out with its keycap inline, always — on every face,
   * without `?` (operator 2026-10-08: a shipped order's "Buy replacement label"
   * shows its key so the caller's operator presses it without hunting).
   */
  standingKeycap?: boolean;
  /**
   * `primary` = the solid blue lead CTA (a shipped order's Buy replacement label);
   * `orange` = the vivid escalation fill (Create customer ticket, operator 2026-10-08);
   * `warning` = the amber recoverable fill; `blue` = the tonal blue face.
   */
  tone?: 'default' | 'danger' | 'warning' | 'yellow' | 'blue' | 'success' | 'primary' | 'orange';
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
  /**
   * OR open this form in the centered picker dialog — the ONE shape for "find
   * one thing and commit it" (operator 2026-10-08: Report out of stock picks the
   * short product, Pair SKU to location picks the location; search focused,
   * Enter commits). Titled with the verb's icon and label; `done()` closes it.
   */
  dialog?: (done: () => void) => ReactNode;
  /**
   * `danger` verbs live behind the Danger zone (operator 2026-10-08): a `run`
   * danger verb opens the square confirmation first — this sentence says
   * what happens. Its own key again (or Enter) confirms.
   */
  confirmDetail?: string;
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
   * `dock`: the floating selection dock (operator 2026-10-06) — ONE
   * liquid-metal pill (black, grained) with white controls:
   * `N selected · Actions · [quick] · ×`. Every verb lives
   * in the Actions menu; a verb's `display` opens as a card above the pill.
   * Requires {@link dock}.
   * `panel`: a side column's Actions group (operator 2026-10-08) — vertical:
   * fill-tone verbs first as full-width filled CTAs, then every other verb as
   * a full-width ghost row, then the Danger zone section under a hairline —
   * every danger verb painted in full with its keycap, never folded. No ⋮.
   *
   * On every face a `run` danger verb confirms in the square popover first,
   * and a `dialog` verb opens the centered picker dialog;
   * a menu face lists its danger verbs in full under a "Danger zone" label.
   */
  face?: 'strip' | 'header' | 'inline' | 'dock' | 'panel';
  /** The `dock` face's selection facts: the count, Clear, and an optional one-press icon verb beside Actions. */
  dock?: RecordActionDock;
}

export interface RecordActionDock {
  count: number;
  /** "selected" by default — the word after the count. */
  noun?: string;
  onClear: () => void;
  /** One verb between Actions and Clear: a round icon button (Linear's pointer), or an icon + text pill when {@link quickText} is set. */
  quick?: RecordActionVerb;
  /** Visible text for {@link quick}; turns the round icon into a compact icon + text pill. */
  quickText?: string;
}

/** The dock: a liquid-metal pill (black in every theme); its controls are white chips on it. */
const DOCK_PILL_CLASS = cn('pointer-events-auto flex items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5', LIQUID_METAL_TEXT_CLASS);
const DOCK_CHIP_CLASS = cn('inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold', LIQUID_METAL_CHIP_CLASS);
const DOCK_ROUND_CLASS = cn('inline-flex size-9 items-center justify-center rounded-full', LIQUID_METAL_CHIP_CLASS);
const DOCK_QUICK_PILL_CLASS = cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold', LIQUID_METAL_CHIP_CLASS);
const DOCK_CLEAR_CLASS = cn('inline-flex size-9 items-center justify-center rounded-full', LIQUID_METAL_GHOST_CLASS)

const STRIP_CLASS =
  'flex w-full min-w-0 items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1.5';
const HEADER_FACE_CLASS =
  '@container/verbs flex w-full min-w-0 flex-1 items-center gap-1 @min-[64rem]/record-head:!min-w-[28rem]';
const INLINE_FACE_CLASS = 'flex shrink-0 items-center gap-1';
const PANEL_FACE_CLASS = 'flex w-full min-w-0 flex-col gap-0.5 px-2 pb-2';

/** The Button fill each verb tone wears; the tones with a solid fill lead the `panel` face. */
const VERB_TONE_FILL: Record<NonNullable<RecordActionVerb['tone']>, { variant: ButtonVariant | null; panelFill: boolean }> = {
  default: { variant: null, panelFill: false },
  danger: { variant: null, panelFill: false },
  blue: { variant: 'primarySoft', panelFill: false },
  primary: { variant: 'primary', panelFill: true },
  orange: { variant: 'orange', panelFill: true },
  warning: { variant: 'warning', panelFill: true },
  yellow: { variant: 'yellow', panelFill: true },
  success: { variant: 'success', panelFill: true },
};

/**
 * Header actions start as icons and expand in importance order. At most three
 * actions can occupy the strip; every remaining action lives behind ⋮.
 */
const HEADER_EXPAND_TIERS: readonly { button: string; label: string }[] = [
  { button: '@xs/verbs:w-auto @xs/verbs:!px-2.5', label: '@xs/verbs:not-sr-only' },
  { button: '@sm/verbs:w-auto @sm/verbs:!px-2.5', label: '@sm/verbs:not-sr-only' },
  { button: '@lg/verbs:w-auto @lg/verbs:!px-2.5', label: '@lg/verbs:not-sr-only' },
];

// A full-width record has room for all three primary verbs even when flexbox
// gives the nested verbs container a conservative intrinsic width. Split panes
// still follow the progressive tiers above.
const HEADER_FULL_RECORD_BUTTON = '@min-[64rem]/record-head:w-auto @min-[64rem]/record-head:!px-2.5';
const HEADER_FULL_RECORD_LABEL = '@min-[64rem]/record-head:not-sr-only';

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

/**
 * The `panel` face's grouping: fill-tone verbs lead (filled CTAs), the rest
 * follow as rows, danger verbs close the list in the Danger zone section.
 * Source order within each group; nothing overflows.
 */
export function partitionRecordPanelVerbs(verbs: readonly RecordActionVerb[]): {
  filled: RecordActionVerb[];
  rows: RecordActionVerb[];
  danger: RecordActionVerb[];
} {
  const filled: RecordActionVerb[] = [];
  const rows: RecordActionVerb[] = [];
  const danger: RecordActionVerb[] = [];
  for (const verb of verbs) {
    if (verb.tone === 'danger') danger.push(verb);
    else if (VERB_TONE_FILL[verb.tone ?? 'default'].panelFill) filled.push(verb);
    else rows.push(verb);
  }
  return { filled, rows, danger };
}

/** The Button fill a verb wears on the strip, header, inline and panel faces: its tone's fill, else ink when pressed. */
function verbVariant(verb: RecordActionVerb): ButtonVariant {
  return VERB_TONE_FILL[verb.tone ?? 'default'].variant ?? (verb.pressed ? 'ink' : 'secondary');
}

export function RecordActionStrip({
  verbs,
  label,
  testId = 'record-action-strip',
  onDismiss,
  face = 'strip',
  dock,
}: RecordActionStripProps) {
  const shellClass =
    face === 'header'
      ? HEADER_FACE_CLASS
      : face === 'inline'
        ? INLINE_FACE_CLASS
        : face === 'panel'
          ? PANEL_FACE_CLASS
          : STRIP_CLASS;
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

  // A `dialog` verb's centered form, held as pressed: its write may change the
  // verb itself (Report → Mark not out of stock) while the form shows its done
  // face. It holds the keyboard like any overlay.
  const [dialogVerb, setDialogVerb] = useState<RecordActionVerb | null>(null);
  useEffect(() => {
    if (!dialogVerb) return;
    const claim = claimOverlay();
    return () => claim.release();
  }, [dialogVerb]);

  // A danger verb's square confirmation — anchored to the verb's own button,
  // else to the menu trigger it was picked from.
  const [layerView, setLayerView] = useState<DangerZoneView>(null);
  const layerAnchorRef = useRef<HTMLElement | null>(null);
  /** The ⋮ or the dock's Actions chip: the anchor for a verb picked from a menu. */
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const verbButtonRefs = useRef(new Map<string, HTMLElement>());
  const verbRef = (id: string) => (node: HTMLElement | null) => {
    if (node) verbButtonRefs.current.set(id, node);
    else verbButtonRefs.current.delete(id);
  };

  const active = activeId == null ? null : (verbs.find((verb) => verb.id === activeId && verb.display) ?? null);
  const idle = verbs.length === 0;
  const danger = verbs.filter((verb) => verb.tone === 'danger');

  const done = () => {
    setActiveId(null);
  };

  const press = (verb: RecordActionVerb) => {
    if (verb.disabled) return;
    if (verb.dialog) {
      setDialogVerb(verb);
      return;
    }
    if (verb.tone === 'danger' && !verb.display) {
      layerAnchorRef.current = verbButtonRefs.current.get(verb.id) ?? menuTriggerRef.current;
      setLayerView({ id: verb.id });
      return;
    }
    if (verb.display) {
      setActiveId(verb.id);
      return;
    }
    void verb.run?.();
  };

  const layerItems: DangerZoneItem[] = verbs
    .filter((verb) => verb.tone === 'danger' && !verb.display && !verb.dialog)
    .map((verb) => ({
      id: verb.id,
      label: verb.label,
      icon: verb.icon,
      hotkey: verb.hotkey,
      disabled: verb.disabled,
      disabledReason: verb.disabledReason,
      confirmDetail: verb.confirmDetail,
      run: verb.run,
    }));
  const closeDialog = () => setDialogVerb(null);
  const dialog = (
    <Dialog
      open={dialogVerb != null}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      {dialogVerb?.dialog ? (
        <DialogContent
          aria-describedby={undefined}
          // The picker shape (operator 2026-10-08): command-palette width, tall list — never page-wide.
          className="flex h-[min(70vh,40rem)] w-[calc(100vw-2rem)] max-w-xl flex-col"
          data-testid={`${testId}-${dialogVerb.id}-dialog`}
        >
          <DialogTitle className="flex items-center gap-2 [&_svg]:size-5">
            {dialogVerb.icon}
            {dialogVerb.label}
          </DialogTitle>
          <div className="min-h-0 flex-1">{dialogVerb.dialog(closeDialog)}</div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
  const layer = (
    <>
      {dialog}
      <DangerZoneLayer
        items={layerItems}
        view={layerView}
        onViewChange={setLayerView}
        anchorRef={layerAnchorRef}
        placement={face === 'dock' ? 'top-center' : 'bottom-end'}
        testId={testId}
      />
    </>
  );

  /** A menu face's items: the ordinary verbs, then every danger verb in full (key painted) under "Danger zone". */
  const menuItems = (menuVerbs: readonly RecordActionVerb[], withTooltip: boolean) => {
    const ordinary = menuVerbs.filter((verb) => verb.tone !== 'danger');
    const dangerous = menuVerbs.filter((verb) => verb.tone === 'danger');
    const item = (verb: RecordActionVerb) => (
      <DropdownMenuItem
        key={verb.id}
        disabled={verb.disabled}
        title={verb.disabled ? verb.disabledReason : undefined}
        data-testid={`${testId}-${verb.id}`}
        tone={verb.tone === 'danger' ? 'danger' : 'default'}
        onSelect={() => press(verb)}
      >
        {verb.icon}
        {verb.label}
        {verb.hotkey && (showHotkeys || verb.tone === 'danger') ? (
          <KeyboardChord chord={hotkeyChord(verb.hotkey)} size="sm" tone="default" className="ml-auto" />
        ) : null}
      </DropdownMenuItem>
    );
    return (
      <>
        {ordinary.map((verb) =>
          withTooltip ? (
            // Hotkeys are disclosed on hover, never painted inline (owner 2026-10-03); `?` still reveals them.
            <HoverTooltip
              key={verb.id}
              label={verb.disabled ? (verb.disabledReason ?? verb.label) : verb.label}
              shortcut={verb.hotkey ? hotkeyChord(verb.hotkey) : undefined}
              asChild
              placement="left"
              focusable={false}
            >
              {item(verb)}
            </HoverTooltip>
          ) : (
            item(verb)
          ),
        )}
        {dangerous.length > 0 ? (
          <>
            {ordinary.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-text-danger">Danger zone</DropdownMenuLabel>
            {dangerous.map(item)}
          </>
        ) : null}
      </>
    );
  };
  /** The menu closing must not pull focus back from the layer it just opened. */
  const keepLayerFocus = (event: Event) => {
    if (layerAnchorRef.current && menuTriggerRef.current === layerAnchorRef.current) event.preventDefault();
  };

  const displayOpen = active != null;
  // The dock's quick verb sits outside the Actions menu; its hotkey still fires and lists under `?`.
  const keyedVerbs = face === 'dock' && dock?.quick ? [...verbs, dock.quick] : verbs;
  useRecordActionStripKeys({ verbs: keyedVerbs, displayOpen, press, done, onDismiss });

  if (face === 'dock' && dock) {
    return (
      <div className="relative" data-testid={testId} data-view={active ? active.id : 'verbs'}>
        {active?.display ? (
          // A verb's own display opens as a card ABOVE the pill; the pill stays put.
          <div
            role="group"
            aria-label={`${label}: ${active.label}`}
            className="pointer-events-auto absolute bottom-full left-1/2 mb-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-surface-card p-2 text-text-default shadow-xl ring-1 ring-inset ring-border-soft"
            data-testid={`${testId}-display`}
          >
            {active.display(done)}
          </div>
        ) : null}
        <div role="toolbar" aria-label={label} className={DOCK_PILL_CLASS} style={LIQUID_METAL_STYLE}>
          <span className="whitespace-nowrap pr-1 text-sm font-medium tabular-nums" data-testid={`${testId}-count`}>
            {dock.count} {dock.noun ?? 'selected'}
          </span>
          {idle ? null : (
            <DropdownMenu modal={false} open={moreOpen} onOpenChange={setMoreOpen}>
              <DropdownMenuTrigger asChild>
                <button ref={menuTriggerRef} type="button" className={DOCK_CHIP_CLASS} data-testid={`${testId}-menu`}>
                  <Zap className="size-4" strokeWidth={2.25} />
                  Actions
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" sideOffset={10} onCloseAutoFocus={keepLayerFocus}>
                {menuItems(verbs, false)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {dock.quick ? (
            <HoverTooltip
              label={dock.quick.disabled ? (dock.quick.disabledReason ?? dock.quick.label) : dock.quick.label}
              shortcut={dock.quick.hotkey ? hotkeyChord(dock.quick.hotkey) : undefined}
              asChild
              placement="above"
            >
              <button
                ref={verbRef(dock.quick.id)}
                type="button"
                className={dock.quickText ? DOCK_QUICK_PILL_CLASS : DOCK_ROUND_CLASS}
                aria-label={dock.quick.label}
                disabled={dock.quick.disabled}
                data-testid={`${testId}-${dock.quick.id}`}
                onClick={() => press(dock.quick!)}
              >
                {dock.quick.icon}
                {dock.quickText ? <span>{dock.quickText}</span> : null}
              </button>
            </HoverTooltip>
          ) : null}
          <HoverTooltip label="Clear selection" shortcut="Esc" asChild placement="above">
            <button type="button" className={DOCK_CLEAR_CLASS} aria-label="Clear selection" onClick={dock.onClear} data-testid={`${testId}-clear`}>
              <X className="size-4" />
            </button>
          </HoverTooltip>
        </div>
        {layer}
      </div>
    );
  }

  if (idle) return null;

  if (active?.display) {
    return (
      <div
        role="group"
        aria-label={`${label}: ${active.label}`}
        data-testid={testId}
        data-view={active.id}
        className={cn(shellClass, face === 'panel' ? undefined : 'flex-nowrap')}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={face === 'panel' ? 'self-start' : undefined}
          onClick={done}
          data-testid={`${testId}-back`}
        >
          Back
        </Button>
        <div
          className={face === 'panel' ? 'flex min-w-0 flex-col gap-1' : 'flex min-w-0 flex-1 flex-nowrap items-center gap-1'}
          data-testid={`${testId}-display`}
        >
          {active.display(done)}
        </div>
      </div>
    );
  }

  if (face === 'panel') {
    const { filled, rows } = partitionRecordPanelVerbs(verbs);
    // Spelled out, key always painted (operator 2026-10-08): the side column has the room the header never did.
    const panelVerb = (verb: RecordActionVerb, fill: boolean) => (
      <Button
        key={verb.id}
        ref={verbRef(verb.id)}
        type="button"
        size={fill ? 'md' : 'sm'}
        variant={fill ? verbVariant(verb) : 'ghost'}
        icon={verb.icon}
        disabled={verb.disabled}
        title={verb.disabled ? verb.disabledReason : undefined}
        aria-pressed={verb.pressed}
        aria-haspopup={verb.dialog ? 'dialog' : verb.display ? 'true' : undefined}
        data-testid={`${testId}-${verb.id}`}
        className={cn('w-full justify-start', !fill && 'font-medium')}
        onClick={() => press(verb)}
      >
        <span className="min-w-0 flex-1 truncate text-left">{verb.label}</span>
        {verb.hotkey ? (
          <KeyboardChord chord={hotkeyChord(verb.hotkey)} size="sm" tone={fill ? 'inverse' : 'default'} />
        ) : null}
      </Button>
    );
    return (
      <div role="toolbar" aria-label={label} aria-orientation="vertical" data-testid={testId} data-view="verbs" className={shellClass}>
        {filled.length > 0 ? (
          <div className={cn('flex flex-col gap-1.5', rows.length > 0 || danger.length > 0 ? 'pb-1.5' : undefined)}>
            {filled.map((verb) => panelVerb(verb, true))}
          </div>
        ) : null}
        {rows.map((verb) => panelVerb(verb, false))}
        {danger.length > 0 ? (
          <DangerZoneSection testId={testId}>
            {danger.map((verb) => (
              <DangerZoneButton key={verb.id} item={verb} testId={testId} buttonRef={verbRef(verb.id)} onPress={() => press(verb)} />
            ))}
          </DangerZoneSection>
        ) : null}
        {layer}
      </div>
    );
  }

  const { primary, overflow } = partitionRecordActionVerbs(verbs);

  /** `expand` = the header face's rung for this verb; without one a header verb stays a 24px icon. */
  const verbButton = (verb: RecordActionVerb, expand?: (typeof HEADER_EXPAND_TIERS)[number]) => {
    return (
      <HoverTooltip
        key={verb.id}
        label={verb.disabled ? (verb.disabledReason ?? verb.label) : verb.label}
        shortcut={verb.hotkey ? hotkeyChord(verb.hotkey) : undefined}
        asChild
        placement="above"
      >
        <Button
          ref={verbRef(verb.id)}
          type="button"
          size="sm"
          radius="pill"
          variant={verbVariant(verb)}
          icon={verb.icon}
          ariaLabel={verb.label}
          disabled={verb.disabled}
          aria-pressed={verb.pressed}
          aria-haspopup={verb.dialog ? 'dialog' : verb.display ? 'true' : undefined}
          data-testid={`${testId}-${verb.id}`}
          // A record header spends its width on identity first: a verb is a
          // 24px icon, spelled out only once the header has room for it
          // (HEADER_EXPAND_TIERS); the tooltip and accessible name carry it until then.
          className={
            face === 'header'
              ? verb.standingKeycap
                ? 'h-6 shrink-0 whitespace-nowrap !px-2.5'
                : cn('h-6 w-6 shrink-0 whitespace-nowrap !px-0', expand?.button, HEADER_FULL_RECORD_BUTTON)
              : undefined
          }
          onClick={() => press(verb)}
        >
          <span className={face === 'header' && !verb.standingKeycap ? cn('sr-only', expand?.label, HEADER_FULL_RECORD_LABEL) : undefined}>
            {verb.label}
          </span>
          {verb.hotkey && (verb.standingKeycap || (face !== 'header' && showHotkeys)) ? (
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
                  ref={menuTriggerRef}
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
            <DropdownMenuContent align="end" side="bottom" onCloseAutoFocus={keepLayerFocus}>
              {menuItems(overflow, true)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {layer}
    </div>
  );
}
