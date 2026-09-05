'use client';

/**
 * Desk pointer-cursor — Chrome-style KIND glyphs, staff-color, glued to the
 * pointer. The cursor stays small. It does not wear the control's box unless
 * the control opts into `data-cursor="morph"` (scrub tracks).
 *
 * Kinds: idle dot · click (pointer) · resize-x/y · grab / grabbing · morph.
 *
 * MOUNT ONCE. Desk only (`usePointerFine`). Reduced motion → native cursor.
 *
 * Law: Pick a ROLE, not a literal (`motionRole.cursor.follow` / `.morph`).
 */

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { getStaffColorHex } from '@/utils/staff-colors';
import {
  frame,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from './framer';
import { motionRole } from './roles';
import { usePointerFine } from './use-pointer-fine';
import {
  canRideCursor,
  readCursorLabel,
  readCursorLabelServer,
  setCursorLabelHost,
  subscribeCursorLabel,
} from './cursor-label';
import {
  CURSOR_KIND_SELECTOR,
  type CursorKind,
  readCursorScrub,
  readCursorScrubServer,
  subscribeCursorScrub,
} from './cursor-scrub';

const DOT = 12;
const GLYPH = 18;
/** Tooltip chip seat: just below-right of the hotspot, clear of the glyph. */
const LABEL_DX = 14;
const LABEL_DY = 18;
/** Viewport breathing room — same margin the anchored bubble keeps. */
const LABEL_MARGIN = 8;

function useHideOsCursor(enabled: boolean) {
  useInsertionEffect(() => {
    if (!enabled) return;
    const style = document.createElement('style');
    style.setAttribute('data-cf-morph-cursor', '');
    style.textContent = `
      *, *::before, *::after {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [enabled]);
}

function CursorGlyph({ kind, color }: { kind: CursorKind; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.75, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'click') {
    return (
      <svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M4 3.5 4 18.5 9.2 13.8 12.8 21.2 15.4 20.1 11.7 12.6 19 12.6 Z"
          fill={color}
          stroke="#fff"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'resize-x') {
    return (
      <svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" aria-hidden>
        <path d="M3 12h18M7 8 3 12l4 4M17 8l4 4-4 4" {...stroke} />
      </svg>
    );
  }
  if (kind === 'resize-y') {
    return (
      <svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" {...stroke} />
      </svg>
    );
  }
  if (kind === 'grab' || kind === 'grabbing') {
    return (
      <svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" aria-hidden>
        <path
          d={kind === 'grabbing'
            ? 'M8 11v5M11 10v6M14 10v6M17 11v5M7 11c0-1.5 1-2.5 2.2-2.5.4-1.4 1.6-2.3 3-2.3 1.2 0 2.2.6 2.7 1.6.5-.4 1.2-.6 1.9-.6 1.5 0 2.7 1.2 2.7 2.7V16a3 3 0 0 1-3 3h-6.5A3.5 3.5 0 0 1 7 15.5V11Z'
            : 'M8 13V8.5M11 13V7M14 13V7.5M17 13V9M7 13c0-1.5 1-2.5 2.2-2.5.4-1.4 1.6-2.3 3-2.3 1.2 0 2.2.6 2.7 1.6.5-.4 1.2-.6 1.9-.6 1.5 0 2.7 1.2 2.7 2.7V16a3 3 0 0 1-3 3h-6.5A3.5 3.5 0 0 1 7 15.5V13Z'}
          {...stroke}
        />
      </svg>
    );
  }
  return null;
}

export function MorphCursorLayer() {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const enabled = fine && !reduceMotion;
  const { user } = useAuth();
  useStaffColorVersion();
  const staffHex = getStaffColorHex({ id: user?.staffId ?? null });

  useHideOsCursor(enabled);

  const scrub = useSyncExternalStore(subscribeCursorScrub, readCursorScrub, readCursorScrubServer);
  const cursorLabel = useSyncExternalStore(
    subscribeCursorLabel,
    readCursorLabel,
    readCursorLabelServer,
  );

  // Tell triggers a cursor exists to carry their label. Off → they fall back
  // to the anchored HoverTooltip bubble (floor, touch, reduced motion).
  useEffect(() => {
    setCursorLabelHost(enabled);
    return () => setCursorLabelHost(false);
  }, [enabled]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useSpring(DOT, motionRole.cursor.morph.transition);
  const height = useSpring(DOT, motionRole.cursor.morph.transition);
  const marginLeft = useTransform(width, (value) => -value / 2);
  const marginTop = useTransform(height, (value) => -value / 2);

  const [kind, setKind] = useState<CursorKind | 'idle'>('idle');
  const [label, setLabel] = useState<string | null>(null);
  // Native `title` lifted onto the chip. While hovered the attribute is parked
  // on `data-cf-title` so the browser's own slow grey tip cannot double it;
  // it is put back the moment the pointer moves off (or the layer unmounts).
  const [nativeTitle, setNativeTitle] = useState<string | null>(null);
  const titleHostRef = useRef<HTMLElement | null>(null);
  const [awake, setAwake] = useState(false);

  // Priority: a HoverTooltip label, then a control's kind label, then the
  // native title the pointer is over. A scrub value outranks all of them and
  // keeps the light value chip.
  const tooltip = scrub ? null : (cursorLabel?.text ?? label ?? nativeTitle);

  // Tooltip chip offset from the hotspot. Re-seated on every pointer frame and
  // whenever the chip is re-measured: flips left of the pointer when it would
  // clip the right edge, above it when it would clip the bottom.
  const labelX = useMotionValue(LABEL_DX);
  const labelY = useMotionValue(LABEL_DY);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const chipSizeRef = useRef({ w: 0, h: 0 });
  const lastPointRef = useRef({ x: 0, y: 0 });
  const seatLabel = useCallback(
    (clientX: number, clientY: number) => {
      lastPointRef.current = { x: clientX, y: clientY };
      const { w, h } = chipSizeRef.current;
      if (!w || !h) return;
      const fitsRight = clientX + LABEL_DX + w <= window.innerWidth - LABEL_MARGIN;
      const fitsBelow = clientY + LABEL_DY + h <= window.innerHeight - LABEL_MARGIN;
      labelX.set(fitsRight ? LABEL_DX : -(w + LABEL_MARGIN));
      labelY.set(fitsBelow ? LABEL_DY : -(h + LABEL_MARGIN));
    },
    [labelX, labelY],
  );
  useLayoutEffect(() => {
    const chip = chipRef.current;
    if (!chip) {
      chipSizeRef.current = { w: 0, h: 0 };
      return;
    }
    const box = chip.getBoundingClientRect();
    chipSizeRef.current = { w: box.width, h: box.height };
    seatLabel(lastPointRef.current.x, lastPointRef.current.y);
    // Keyed on the painted TEXT — a title or kind-label chip must be measured
    // too, or the edge flip has no size to work with.
  }, [tooltip, seatLabel]);


  const targetRef = useRef<HTMLElement | null>(null);
  const kindRef = useRef<CursorKind | 'idle'>('idle');
  const awakeRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const paintIdle = (clientX: number, clientY: number) => {
      x.set(clientX);
      y.set(clientY);
      width.set(DOT);
      height.set(DOT);
      seatLabel(clientX, clientY);
    };

    const paintGlyph = (clientX: number, clientY: number) => {
      x.set(clientX);
      y.set(clientY);
      width.set(GLYPH);
      height.set(GLYPH);
      seatLabel(clientX, clientY);
    };

    const paintMorph = (clientX: number, clientY: number) => {
      frame.read(() => {
        const target = targetRef.current;
        if (!target) {
          paintIdle(clientX, clientY);
          return;
        }
        const box = target.getBoundingClientRect();
        x.set(box.left + box.width / 2);
        y.set(box.top + box.height / 2);
        width.set(box.width);
        height.set(box.height);
        seatLabel(box.left + box.width / 2, box.top + box.height / 2);
      });
    };

    const restoreTitle = () => {
      const host = titleHostRef.current;
      if (!host) return;
      const parked = host.dataset.cfTitle;
      if (parked != null) {
        host.setAttribute('title', parked);
        delete host.dataset.cfTitle;
      }
      titleHostRef.current = null;
    };

    const resolveTitle = (node: Element | null) => {
      const host = node?.closest<HTMLElement>('[title], [data-cf-title]') ?? null;
      if (host && host === titleHostRef.current) return;
      restoreTitle();
      const text = host?.getAttribute('title') ?? host?.dataset.cfTitle ?? null;
      if (host && text && canRideCursor(text)) {
        host.dataset.cfTitle = text;
        host.removeAttribute('title');
        titleHostRef.current = host;
        setNativeTitle(text);
        return;
      }
      // Long titles keep the native tip — a paragraph does not read while moving.
      setNativeTitle(null);
    };

    const resolveHit = (event: PointerEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      resolveTitle(node);
      const hit = node?.closest<HTMLElement>(CURSOR_KIND_SELECTOR) ?? null;
      const nextKind = (hit?.dataset.cursor as CursorKind | undefined) ?? 'idle';
      if (hit !== targetRef.current || nextKind !== kindRef.current) {
        targetRef.current = hit;
        kindRef.current = nextKind;
        setKind(nextKind);
        setLabel(hit?.dataset.cursorLabel ?? null);
      }
      return nextKind;
    };

    const paint = (event: PointerEvent, nextKind: CursorKind | 'idle') => {
      if (nextKind === 'morph') paintMorph(event.clientX, event.clientY);
      else if (nextKind === 'idle') paintIdle(event.clientX, event.clientY);
      else paintGlyph(event.clientX, event.clientY);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      if (!awakeRef.current) {
        awakeRef.current = true;
        setAwake(true);
      }
      paint(event, resolveHit(event));
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      paint(event, resolveHit(event));
    };

    const onLeave = () => {
      restoreTitle();
      setNativeTitle(null);
      targetRef.current = null;
      kindRef.current = 'idle';
      awakeRef.current = false;
      setKind('idle');
      setLabel(null);
      setAwake(false);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      restoreTitle();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, x, y, width, height, seatLabel]);

  if (!enabled) return null;

  const boxWear = kind === 'morph';
  const glyphKind = kind !== 'idle' && kind !== 'morph' ? kind : null;
  // A scrub value outranks any label — mid-drag the hand wants the number, and
  // it keeps the light value chip. Every plain hover label (a HoverTooltip that
  // handed its text over, or a control's `data-cursor-label`) is the SAME black
  // tooltip chip — one skin for "what is this", never two chips on one pointer.
  const readout = scrub;

  return (
    <motion.div
      aria-hidden
      data-testid="morph-cursor"
      data-cursor-state={scrub ? 'scrub' : kind}
      className="pointer-events-none fixed left-0 top-0 z-tooltip"
      style={{ x, y, opacity: awake ? 1 : 0, willChange: 'transform' }}
    >
      {glyphKind ? (
        <div
          className="absolute"
          style={{
            width: GLYPH,
            height: GLYPH,
            // Pointer tip sits on the hotspot; resize/grab stay centered.
            transform: glyphKind === 'click' ? 'translate(0, 0)' : 'translate(-50%, -50%)',
          }}
        >
          <CursorGlyph kind={glyphKind} color={staffHex} />
        </div>
      ) : (
        <motion.div
          className={cn('border', boxWear ? cornerClass('control') : cornerClass('pill'))}
          style={{
            width,
            height,
            marginLeft,
            marginTop,
            borderColor: staffHex,
            backgroundColor: boxWear ? `${staffHex}33` : staffHex,
          }}
          transition={motionRole.cursor.morph.transition}
        />
      )}
      {readout ? (
        <span
          data-testid="morph-cursor-readout"
          className={cn(
            cornerClass('chip'),
            'absolute left-3 top-3 whitespace-nowrap border border-border-soft bg-surface-card px-1.5 py-0.5 text-role-micro text-text-default shadow-sm',
          )}
        >
          <span className="text-text-faint">{readout.label}</span>
          {readout.value ? <span className="ml-1 tabular-nums">{readout.value}</span> : null}
        </span>
      ) : null}
      {tooltip ? (
        <motion.span
          ref={chipRef}
          data-testid="morph-cursor-tooltip"
          style={{ x: labelX, y: labelY }}
          className={cn(
            cornerClass('control'),
            'absolute left-0 top-0 whitespace-nowrap bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-snug text-white shadow-lg',
          )}
        >
          {tooltip}
        </motion.span>
      ) : null}
    </motion.div>
  );
}
