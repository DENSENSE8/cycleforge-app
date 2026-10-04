'use client';

/** Print-run integer field — same Figma delta-X gesture as DataTable price. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { cursorResizeTarget, useCursorScrub } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  applyScrubFrame,
  nudgeScrubValue,
  parseScrubOrigin,
  scrubPointerMods,
  scrubShouldArm,
  scrubTravel,
  startScrubFrame,
  type ScrubFrame,
  type ScrubPointerMods,
  type ScrubSpec,
} from '@/components/labels/scrub-number';

const PRINT_RUN_INT_SCRUB: ScrubSpec = {
  step: 1,
  coarseStep: 10,
  fineStep: 1,
  min: 1,
  max: 99,
  decimals: 0,
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function LabelPrintRunNumField({
  label,
  value,
  onChange,
  disabled,
  min = 1,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  /** Inclusive floor. Pair **Bay from** with `max={bayThrough}`. */
  min?: number;
  /** Inclusive ceiling. Pair **Bay through** with `min={bayFrom}`. */
  max?: number;
}) {
  const lo = clampInt(min, 1, 99);
  const hi = Math.max(lo, clampInt(max, 1, 99));
  const scrub: ScrubSpec = useMemo(
    () => ({ ...PRINT_RUN_INT_SCRUB, min: lo, max: hi }),
    [lo, hi],
  );
  const originRaw = String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(originRaw);
  const [live, setLive] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipOpenRef = useRef(false);
  const dragRef = useRef<
    (ScrubFrame & {
      pointerId: number;
      downX: number;
      armed: boolean;
    }) | null
  >(null);
  const liveRef = useRef<number | null>(null);
  liveRef.current = live;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const applyDragRef = useRef<(clientX: number, mods: ScrubPointerMods, now?: number) => void>(
    () => {},
  );

  applyDragRef.current = (clientX, mods, now = Date.now()) => {
    const drag = dragRef.current;
    if (!drag) return;
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
    setLive(next);
    onChangeRef.current(clampInt(next, lo, hi));
  };

  const shown = live ?? value;
  const liveFace = live != null ? live.toFixed(scrub.decimals) : null;
  const originNow = parseScrubOrigin(originRaw);

  useCursorScrub({
    active: !disabled && live != null && liveFace != null,
    label,
    value: liveFace ?? '',
  });

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  useEffect(() => {
    if (live == null || disabled) return;
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
  }, [live, disabled]);

  const endScrub = (commit: boolean) => {
    const drag = dragRef.current;
    const next = liveRef.current;
    dragRef.current = null;
    setLive(null);
    if (!commit || !drag?.armed || next == null) return;
    skipOpenRef.current = true;
    onChange(clampInt(next, lo, hi));
  };

  const commitTyped = () => {
    setEditing(false);
    onChange(clampInt(Number(draft), lo, hi));
  };

  if (editing && !disabled) {
    return (
      <div className="w-[4.75rem]">
        <span className="text-role-micro font-semibold text-text-soft">
          {label}
        </span>
        <input
          ref={inputRef}
          inputMode="numeric"
          aria-label={label}
          disabled={disabled}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTyped();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
              setDraft(originRaw);
            }
          }}
          className={cn(
            'mt-0.5 h-7 w-full border border-border-default bg-surface-card px-1.5 text-center text-role-caption font-semibold tabular-nums text-text-default',
            cornerClass('control'),
            focusRing('field', 'accent'),
          )}
        />
      </div>
    );
  }

  return (
    <div className="w-[4.75rem]">
      <span className="text-role-micro font-semibold text-text-soft">
        {label}
      </span>
      <div
        ref={hostRef}
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={shown}
        aria-valuemin={scrub.min}
        aria-valuemax={scrub.max}
        aria-valuetext={String(shown)}
        aria-disabled={disabled || undefined}
        {...(disabled ? {} : cursorResizeTarget('x'))}
        onClick={() => {
          if (disabled) return;
          if (skipOpenRef.current) {
            skipOpenRef.current = false;
            return;
          }
          setDraft(originRaw);
          setEditing(true);
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          const mods = scrubPointerMods(event);
          dragRef.current = {
            pointerId: event.pointerId,
            downX: event.clientX,
            armed: false,
            ...startScrubFrame(event.clientX, originNow, mods, scrub),
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* not a capturing element */
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || disabled || event.pointerId !== drag.pointerId) return;
          if (!drag.armed) {
            if (!scrubShouldArm(event.clientX - drag.downX)) return;
            drag.armed = true;
            event.preventDefault();
          }
          applyDragRef.current(event.clientX, scrubPointerMods(event));
        }}
        onPointerUp={(event) => {
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
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId) return;
          endScrub(false);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const travel = scrubTravel(scrub, scrubPointerMods(event));
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            onChange(nudgeScrubValue(originNow, -1, travel, scrub.decimals, scrub.min, scrub.max));
            return;
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            onChange(nudgeScrubValue(originNow, 1, travel, scrub.decimals, scrub.min, scrub.max));
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            setDraft(originRaw);
            setEditing(true);
            return;
          }
          if (event.key.length === 1 && /[0-9]/.test(event.key) && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            setDraft(event.key);
            setEditing(true);
          }
        }}
        className={cn(
          'mt-0.5 flex h-7 w-full items-center justify-center border border-border-default bg-surface-canvas text-center text-role-caption font-semibold tabular-nums text-text-default',
          cornerClass('control'),
          focusRing('control'),
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-ew-resize touch-none hover:bg-surface-hover',
        )}
      >
        {shown}
      </div>
    </div>
  );
}
