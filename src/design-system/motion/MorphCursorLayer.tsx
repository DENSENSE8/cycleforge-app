'use client';

/**
 * Desk pointer-cursor — the one ENGINE, plus whichever SKIN the desk picked.
 * Hit-testing, device-pixel snapping, labels, scrub readouts and morph box
 * measure live HERE; `cursor-skins.tsx` owns how the mark paints. The cursor
 * stays small. It does not wear the control's box unless the control opts
 * into `data-cursor="morph"` (scrub tracks).
 *
 * States: idle · click · pressed (any kind) · resize-x/y · grab / grabbing ·
 * morph — plus the scrub readout chip, which is skin-independent.
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
import { TooltipChipBody, tooltipChipClass } from '@/design-system/primitives/TooltipChip';
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
  CURSOR_GLYPH_SIZE,
  CURSOR_KIND_SELECTOR,
  type CursorKind,
  readCursorScrub,
  readCursorScrubServer,
  subscribeCursorScrub,
} from './cursor-scrub';
import { CURSOR_SKINS } from './cursor-skins';
import {
  readCursorSkin,
  readCursorSkinServer,
  subscribeCursorSkin,
} from './cursor-skin';

const DOT = 12;
const GLYPH = CURSOR_GLYPH_SIZE;
/** Tooltip chip seat: just below-right of the hotspot, clear of the glyph. */
const LABEL_DX = 14;
const LABEL_DY = 18;
/** Viewport breathing room — same margin the anchored bubble keeps. */
const LABEL_MARGIN = 8;

/**
 * The FIND-ME HALO — a white outline around the mark, nothing else. Without
 * it a staff-green dot hovering a staff-green control returns ZERO deviating
 * pixels (measured) — the cursor vanishes exactly where the operator looks
 * hardest. The rim is sub-pixel `drop-shadow` passes stacked to full density
 * (one pass is a faint wash; four read as a crisp ~1px outline), and
 * `drop-shadow` follows the painted silhouette — chevrons, brackets and the
 * flare included — so every skin and every state wears it from this one site.
 *
 * Operator ruling 2026-09-06: outline ONLY — no dark drop shadow under the
 * mark; it read as a smudge trailing the cursor. The trade is accepted and
 * known: white is ~21:1 on dark surfaces but only ~1.7:1 against mid-tones
 * like emerald (physics — no lighter edge exists), so on a same-color
 * mid-tone surface the rim is visible but does not clear WCAG 3:1.
 */
const CURSOR_HALO =
  'drop-shadow(0 0 0.66px #fff) drop-shadow(0 0 0.66px #fff) drop-shadow(0 0 0.66px #fff) drop-shadow(0 0 0.66px #fff)';

/**
 * The halo HOST — a zero-size anchor pinned to the hotspot. A CSS `filter`
 * makes this box the containing block for every absolutely positioned
 * descendant, so it must sit EXACTLY at the pointer origin, never in flow:
 * in flow, the dot's −half-size negative margins dragged the box 9px above
 * the hand and every glyph anchored to that — the "cursor rides crooked"
 * bug, measured as a constant +9px on every kind. Absolute + 0×0 also
 * establishes a block formatting context, so nothing painted inside can
 * pull the anchor off the hotspot.
 */
const HALO_ANCHOR = {
  filter: CURSOR_HALO,
  position: 'absolute',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
} as const;

/**
 * Snap a CSS-px offset onto the DEVICE-pixel grid.
 *
 * This layer carries TEXT — the tooltip chip — and it is promoted with
 * `will-change: transform`, so the compositor rasterizes that text once and
 * then re-uses the raster at whatever offset the transform names. When the
 * offset is not a whole device pixel the glyphs are RESAMPLED rather than
 * re-rasterized, and small white-on-dark text is where that reads worst.
 *
 * Both inputs are fractional by nature: pointer coordinates arrive with
 * sub-pixel precision, and a morph target's centre is `left + width / 2`.
 * Rounding to whole CSS px is NOT enough — at the 1.25 DPR this desk runs,
 * 14 CSS px is 17.5 device px, still half a pixel off the grid. Round in
 * device space and convert back.
 */
function snapToDevicePixel(value: number): number {
  const dpr = (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1;
  return Math.round(value * dpr) / dpr;
}

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


export function MorphCursorLayer() {
  const fine = usePointerFine();
  const reduceMotion = useReducedMotion();
  const enabled = fine && !reduceMotion;
  const { user } = useAuth();
  useStaffColorVersion();
  const staffHex = getStaffColorHex({ id: user?.staffId ?? null });
  // The desk's chosen design family — engine above, paint in cursor-skins.
  const skinId = useSyncExternalStore(subscribeCursorSkin, readCursorSkin, readCursorSkinServer);
  const skin = CURSOR_SKINS[skinId];

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

  // The SHELL speed. The hotspot (x/y) stays glued — duration 0, `cursorFollow`
  // law. The shell chases it on the travelling-marker spring (`cursorMorph` —
  // the same physics a morph box wears resizing), so the mark reads as one
  // liquid object in motion. Two speeds, one role set; the law bans lag on
  // the FOLLOW, and the follow still never lags.
  const shellX = useSpring(x, motionRole.cursor.morph.transition);
  const shellY = useSpring(y, motionRole.cursor.morph.transition);

  const [kind, setKind] = useState<CursorKind | 'idle'>('idle');
  const [label, setLabel] = useState<string | null>(null);
  const [labelKeys, setLabelKeys] = useState<string | null>(null);
  // Native `title` lifted onto the chip. While hovered the attribute is parked
  // on `data-cf-title` so the browser's own slow grey tip cannot double it;
  // it is put back the moment the pointer moves off (or the layer unmounts).
  const [nativeTitle, setNativeTitle] = useState<string | null>(null);
  const titleHostRef = useRef<HTMLElement | null>(null);
  const [awake, setAwake] = useState(false);
  // A held mouse button — the press half of the click state. Skins contract
  // / flare / spin on it; the hit-test kind above says WHAT, this says ENGAGED.
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);

  // Priority: a HoverTooltip label, then a control's kind label, then the
  // native title the pointer is over. A scrub value outranks all of them and
  // keeps the light value chip.
  const tooltip = scrub ? null : (cursorLabel?.text ?? label ?? nativeTitle);
  // The chord follows whichever source won the text — never a stray cap left
  // over from the last trigger. A native `title` has no chord to teach.
  const tooltipKeys = scrub
    ? null
    : cursorLabel
      ? (cursorLabel.keys ?? null)
      : label
        ? labelKeys
        : null;

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
      labelX.set(snapToDevicePixel(fitsRight ? LABEL_DX : -(w + LABEL_MARGIN)));
      labelY.set(snapToDevicePixel(fitsBelow ? LABEL_DY : -(h + LABEL_MARGIN)));
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
      x.set(snapToDevicePixel(clientX));
      y.set(snapToDevicePixel(clientY));
      width.set(DOT);
      height.set(DOT);
      seatLabel(clientX, clientY);
    };

    const paintGlyph = (clientX: number, clientY: number) => {
      x.set(snapToDevicePixel(clientX));
      y.set(snapToDevicePixel(clientY));
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
        const centerX = snapToDevicePixel(box.left + box.width / 2);
        const centerY = snapToDevicePixel(box.top + box.height / 2);
        x.set(centerX);
        y.set(centerY);
        width.set(box.width);
        height.set(box.height);
        seatLabel(centerX, centerY);
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
        setLabelKeys(hit?.dataset.cursorKeys ?? null);
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
      pressedRef.current = false;
      setKind('idle');
      setLabel(null);
      setLabelKeys(null);
      setPressed(false);
      setAwake(false);
    };

    // Press rides the window, not the hit — a drag that leaves its target
    // stays engaged, and pointer capture keeps the up event off the element.
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pressedRef.current = true;
      setPressed(true);
    };

    const onUp = () => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      setPressed(false);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      restoreTitle();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, x, y, width, height, seatLabel]);

  if (!enabled) return null;

  // A scrub value outranks any label — mid-drag the hand wants the number, and
  // it keeps the light value chip. Every plain hover label (a HoverTooltip that
  // handed its text over, or a control's `data-cursor-label`) is the SAME black
  // tooltip chip — one skin for "what is this", never two chips on one pointer.
  const readout = scrub;
  const Cursor = skin.Cursor;
  const Shell = skin.Shell;
  // The shell is the trailing half of the mark — present while awake, gone
  // while box-wearing (the control's box is the statement) or scrubbing.
  const shellUp = Shell !== null && awake && kind !== 'morph' && !scrub;

  return (
    <>
      {Shell ? (
        <motion.div
          aria-hidden
          data-testid="morph-cursor-shell"
          data-cursor-skin={skinId}
          className="pointer-events-none fixed left-0 top-0 z-tooltip"
          style={{ x: shellX, y: shellY, willChange: 'transform' }}
          animate={{ opacity: shellUp ? 1 : 0 }}
          transition={motionRole.cursor.morph.transition}
        >
          <div data-cursor-halo="" style={HALO_ANCHOR}>
            <Shell
              kind={kind}
              pressed={pressed}
              color={staffHex}
              width={width}
              height={height}
              marginLeft={marginLeft}
              marginTop={marginTop}
            />
          </div>
        </motion.div>
      ) : null}
      <motion.div
        aria-hidden
        data-testid="morph-cursor"
        data-cursor-skin={skinId}
        data-cursor-state={scrub ? 'scrub' : kind}
        data-cursor-pressed={pressed ? 'true' : undefined}
        className="pointer-events-none fixed left-0 top-0 z-tooltip"
        style={{ x, y, opacity: awake ? 1 : 0, willChange: 'transform' }}
      >
      {/* The glued core. The wrapper wears the FIND-ME HALO — a white rim
          (drop-shadow follows the mark's exact silhouette, chevrons and
          brackets included): a staff-green mark over a staff-green control
          keeps its outline, over any surface. Applies to core AND shell from
          this one constant; the chip and readout below keep their own ground
          and are deliberately outside it. */}
      <div data-cursor-halo="" style={HALO_ANCHOR}>
        <Cursor
          kind={kind}
          pressed={pressed}
          color={staffHex}
          width={width}
          height={height}
          marginLeft={marginLeft}
          marginTop={marginTop}
        />
      </div>
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
          // Skin and content order come from the chip SoT; this host owns only
          // where the chip SITS (a fixed follower seated off the hotspot).
          className={cn(
            cornerClass('control'),
            'absolute left-0 top-0',
            tooltipChipClass({ row: Boolean(tooltipKeys) }),
          )}
        >
          <TooltipChipBody label={tooltip} chord={tooltipKeys} />
        </motion.span>
      ) : null}
    </motion.div>
    </>
  );
}
