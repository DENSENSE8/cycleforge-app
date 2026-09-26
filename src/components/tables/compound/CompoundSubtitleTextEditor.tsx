'use client';

/** Under-title click-to-type, plus the Figma width-field gesture when `edit.scrub` is present: */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from '@/components/ui/input-group';
import { cursorResizeTarget, useCursorScrub } from '@/design-system/motion';
import { Popover } from '@/design-system/primitives/Popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { CompoundSubtitleEdit, CompoundSubtitlePart } from './compound-row-model';
import { PriceKeypad } from './PriceKeypad';
import {
  applyPriceKey,
  priceKeyFromKeyboard,
  type PriceKeypadKey,
} from './price-keypad';
import {
  SUBTITLE_SCRUB_ATTR,
  applyScrubFrame,
  commitScrubIfChanged,
  formatScrubFace,
  formatScrubFigure,
  moneyFigureFromFace,
  nudgeScrubValue,
  parseScrubOrigin,
  scrubPointerMods,
  scrubTravel,
  startScrubFrame,
  subtitleScrubShouldArm,
  type ScrubFrame,
  type ScrubPointerMods,
} from './scrub-number';
import { swallowNextClick } from './useSubtitlePointerReorder';

function MoneyInputGroup({
  toneClass,
  control,
}: {
  toneClass?: string;
  control: ReactNode;
}) {
  return (
    <InputGroup
      className={cn(
        'h-3 min-h-0 w-auto min-w-0 border-0 bg-transparent shadow-none',
        toneClass,
      )}
    >
      <InputGroupAddon align="inline-start" className="h-3 py-0 pl-0 pr-0.5">
        <InputGroupText
          aria-hidden
          data-money-prefix=""
          className="p-0 text-role-caption font-semibold text-text-success"
        >
          $
        </InputGroupText>
      </InputGroupAddon>
      {control}
    </InputGroup>
  );
}

export function CompoundSubtitleTextEditor({
  part,
  edit,
  face,
  skipClick,
}: {
  part: CompoundSubtitlePart;
  edit: CompoundSubtitleEdit;
  face: ReactNode;
  skipClick?: () => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(edit.value);
  const [live, setLive] = useState<number | null>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipOpenRef = useRef(false);
  const selectAllRef = useRef(true);
  const replaceNextRef = useRef(true);
  const dragRef = useRef<(
    ScrubFrame & {
      pointerId: number;
      downX: number;
      armed: boolean;
      lastDx: number;
      lastShift: boolean;
      lastCtrl: boolean;
      lastAlt: boolean;
    }
  ) | null>(null);
  const liveRef = useRef<number | null>(null);
  liveRef.current = live;
  const applyDragRef = useRef<(clientX: number, mods: ScrubPointerMods, now?: number) => void>(() => {});

  const scrub = edit.scrub;
  applyDragRef.current = (clientX, mods, now = Date.now()) => {
    const drag = dragRef.current;
    if (!drag || !scrub) return;
    const { frame, live: next } = applyScrubFrame(
      {
        originX: drag.originX,
        originValue: drag.originValue,
        lastX: drag.lastX,
        lastHeldFine: drag.lastHeldFine,
        fineUntil: drag.fineUntil,
        live: liveRef.current ?? drag.live,
      },
      clientX,
      mods,
      scrub,
      now,
    );
    drag.originX = frame.originX;
    drag.originValue = frame.originValue;
    drag.lastX = frame.lastX;
    drag.lastHeldFine = frame.lastHeldFine;
    drag.fineUntil = frame.fineUntil;
    drag.live = frame.live;
    drag.lastDx = frame.lastX - frame.originX;
    drag.lastShift = mods.shift;
    drag.lastCtrl = mods.ctrl;
    drag.lastAlt = Boolean(mods.alt);
    setLive(next);
  };
  const money = Boolean(scrub?.money);
  const keypadOpen = money && editing;
  const scrubbing = live != null;
  const liveFace = scrub && live != null ? formatScrubFace(live, scrub) : null;
  const liveFigure = scrub && live != null ? formatScrubFigure(live, scrub) : null;

  useCursorScrub({
    active: Boolean(scrub) && scrubbing && liveFace != null,
    label: edit.label,
    value: liveFace ?? '',
  });

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editRef = useRef(edit);
  editRef.current = edit;

  const open = (seed?: { draft?: string; selectAll?: boolean }) => {
    const seeded = seed?.draft != null;
    selectAllRef.current = seed?.selectAll !== false;
    replaceNextRef.current = !seeded;
    setDraft(seed?.draft ?? edit.value);
    setEditing(true);
  };

  const abandon = () => {
    setEditing(false);
    setDraft(editRef.current.value);
  };

  const commitTyped = () => {
    setEditing(false);
    const next = draftRef.current.trim();
    if (next === editRef.current.value.trim()) return;
    editRef.current.onCommit(next.length > 0 ? next : null);
  };

  const pressKey = (key: PriceKeypadKey) => {
    if (!scrub) return;
    setDraft((prev) => {
      const next = applyPriceKey(prev, key, {
        decimals: scrub.decimals,
        replace: replaceNextRef.current,
      });
      replaceNextRef.current = false;
      return next;
    });
  };

  useEffect(() => {
    if (!editing || money) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (selectAllRef.current) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, money]);

  useEffect(() => {
    if (!keypadOpen || !scrub) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitTyped();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        abandon();
        return;
      }
      const key = priceKeyFromKeyboard(event.key);
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      pressKey(key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keypadOpen, scrub]);

  useEffect(() => {
    if (!scrubbing || !scrub || keypadOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyDragRef.current(drag.lastX, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
      });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [scrubbing, scrub, keypadOpen]);

  const endScrub = (commit: boolean) => {
    const drag = dragRef.current;
    const next = liveRef.current;
    dragRef.current = null;
    setLive(null);
    if (!commit || !drag?.armed || next == null || !scrub) return;
    skipOpenRef.current = true;
    swallowNextClick();
    commitScrubIfChanged(edit.value, next, scrub.decimals, edit.onCommit);
  };

  const figureInput = (
    <input
      ref={inputRef}
      value={draft}
      inputMode={
        scrub != null && scrub.decimals > 0
          ? 'decimal'
          : edit.kind === 'numeric'
            ? 'numeric'
            : undefined
      }
      placeholder={edit.placeholder}
      aria-label={edit.label}
      size={Math.max(2, part.widthCh ?? 2)}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={commitTyped}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commitTyped();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          abandon();
        }
      }}
      className={cn(
        'm-0 appearance-none border-0 bg-transparent p-0 shadow-none',
        'h-3 min-w-0 tabular-nums leading-none outline-none',
        part.toneClass ?? 'text-text-muted',
      )}
      style={part.widthCh != null ? { width: `${Math.max(2, part.widthCh)}ch` } : { width: '2ch' }}
    />
  );

  if (editing && !money) return figureInput;

  const originNow = parseScrubOrigin(edit.value);
  const moneyFigure = keypadOpen
    ? (draft.length > 0 ? draft : '0')
    : (liveFigure ?? moneyFigureFromFace(part.text));
  const displayFace = money ? (
    <MoneyInputGroup
      toneClass={part.toneClass}
      control={
        <span
          className={cn(
            'inline-flex h-3 items-center leading-none',
            part.widthCh != null && 'overflow-hidden tabular-nums',
          )}
          style={part.widthCh != null ? { width: `${Math.max(2, part.widthCh - 1)}ch` } : undefined}
        >
          {moneyFigure}
        </span>
      }
    />
  ) : liveFace != null ? (
    <span
      className={cn(
        'inline-flex h-3 items-center leading-none',
        part.toneClass,
        part.widthCh != null && 'overflow-hidden tabular-nums',
      )}
      style={part.widthCh != null ? { width: `${part.widthCh}ch` } : undefined}
    >
      {liveFace}
    </span>
  ) : (
    face
  );

  return (
    <>
      <span
        ref={hostRef}
        role={scrub ? 'spinbutton' : 'button'}
        tabIndex={scrub ? 0 : -1}
        aria-haspopup={money ? 'dialog' : undefined}
        aria-expanded={money ? keypadOpen : undefined}
        aria-label={`Edit ${edit.label.toLowerCase()}: ${part.text}`}
        aria-valuenow={scrub ? (live ?? originNow) : undefined}
        aria-valuemin={scrub?.min}
        aria-valuemax={scrub?.max}
        aria-valuetext={scrub ? (liveFace ?? part.text) : undefined}
        {...(scrub ? { [SUBTITLE_SCRUB_ATTR]: '' } : {})}
        {...(scrub && !keypadOpen ? cursorResizeTarget('x') : {})}
        onClick={(event) => {
          event.stopPropagation();
          if (keypadOpen) return;
          if (skipOpenRef.current) {
            skipOpenRef.current = false;
            return;
          }
          if (skipClick?.()) return;
          open();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (keypadOpen || !scrub || event.button !== 0) return;
          const mods = scrubPointerMods(event);
          const originValue = parseScrubOrigin(edit.value);
          dragRef.current = {
            pointerId: event.pointerId,
            downX: event.clientX,
            armed: false,
            lastDx: 0,
            lastShift: mods.shift,
            lastCtrl: mods.ctrl,
            lastAlt: Boolean(mods.alt),
            ...startScrubFrame(event.clientX, originValue, mods, scrub),
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* not a capturing element */
          }
        }}
        onPointerMove={(event) => {
          if (keypadOpen) return;
          const drag = dragRef.current;
          if (!drag || !scrub || event.pointerId !== drag.pointerId) return;
          if (!drag.armed) {
            if (!subtitleScrubShouldArm(event.clientX - drag.downX)) return;
            drag.armed = true;
            event.preventDefault();
          }
          applyDragRef.current(event.clientX, scrubPointerMods(event));
        }}
        onPointerUp={(event) => {
          if (keypadOpen) return;
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            /* already released */
          }
          endScrub(true);
        }}
        onPointerCancel={(event) => {
          if (keypadOpen) return;
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          endScrub(false);
        }}
        onKeyDown={(event) => {
          if (!scrub || keypadOpen) return;
          event.stopPropagation();
          const travel = scrubTravel(scrub, scrubPointerMods(event));
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = nudgeScrubValue(originNow, -1, travel, scrub.decimals, scrub.min, scrub.max);
            commitScrubIfChanged(edit.value, next, scrub.decimals, edit.onCommit);
            return;
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = nudgeScrubValue(originNow, 1, travel, scrub.decimals, scrub.min, scrub.max);
            commitScrubIfChanged(edit.value, next, scrub.decimals, edit.onCommit);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            open();
            return;
          }
          if (event.key.length === 1 && /[0-9.]/.test(event.key) && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            open({ draft: event.key, selectAll: false });
          }
        }}
        className={cn(
          'ds-raw-button inline-flex h-3 min-w-0 items-center leading-none text-left',
          !scrub && 'hover:underline decoration-dotted underline-offset-2',
          money && 'focus-visible:underline decoration-dotted underline-offset-2',
          scrub && !keypadOpen && 'cursor-ew-resize touch-none',
          part.toneClass ?? 'text-text-muted',
          !money && focusRing('control'),
        )}
      >
        {displayFace}
      </span>
      {money ? (
        <Popover
          open={keypadOpen}
          onClose={commitTyped}
          anchorRef={hostRef}
          placement="bottom-start"
          gap={4}
          closeOnEscape={false}
          padded={false}
          role="dialog"
          aria-label={`Edit ${edit.label.toLowerCase()}`}
        >
          <PriceKeypad draft={draft} onKey={pressKey} />
        </Popover>
      ) : null}
    </>
  );
}
