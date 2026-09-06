'use client';

/**
 * Cursor SKINS — the paintable design families the desk cursor can wear.
 *
 * v2 architecture — the modern cursor idiom (motion.dev's own Cursor works
 * this way): every mark is TWO speeds. A glued CORE (the hotspot, instant,
 * never lags the hand — `cursorFollow` law) and a spring-trailing SHELL
 * that chases the core on the travelling-marker spring, so the mark reads
 * as one liquid object in motion instead of a stamp. The layer owns both
 * hosts; skins only paint them.
 *
 * One skin renders EVERY state from the same inputs: `idle` · `click` ·
 * `resize-x` / `resize-y` · `grab` / `grabbing` · `morph` box-wear, plus the
 * `pressed` modifier that crosses all of them. State accents (center dots,
 * chevrons, flares) are ALWAYS MOUNTED and animate opacity/scale in — a
 * state change is a crossfade on springs, never a DOM pop. Press is
 * COUNTER-motion per skin (core grows while shell contracts, or spins
 * against it) — a single uniform scale-down is the tell of a lazy cursor.
 *
 * Chrome is the deliberate exception: it is the OS cursor, faithful — one
 * glued mark, no shell, no flourish. The other four are the shop cursors.
 *
 * Physics law: every change rides `motionRole.cursor.morph` — the
 * travelling-marker spring. No inline physics, no velocity smear.
 *
 * Catalog identity lives in `./cursor-skin.ts`; this file maps each id to
 * its paint.
 */

import type { FC } from 'react';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { MotionValue } from './framer';
import { AnimatePresence, motion } from './framer';
import { motionRole } from './roles';
import { CURSOR_GLYPH_SIZE, type CursorKind } from './cursor-scrub';
import type { CursorSkinId } from './cursor-skin';

/**
 * Everything a skin paint consumes. `width` / `height` / margins are the
 * layer's travelling springs — DOT at idle, GLYPH on a kind, the target box
 * on morph — so a skin that drives its shape with them morphs seamlessly
 * between every state. Numbers are accepted for static previews.
 */
export interface CursorSkinCursorProps {
  kind: CursorKind | 'idle';
  pressed: boolean;
  color: string;
  width: MotionValue<number> | number;
  height: MotionValue<number> | number;
  marginLeft: MotionValue<number> | number;
  marginTop: MotionValue<number> | number;
}

export interface CursorSkin {
  id: CursorSkinId;
  /** Picker card title. */
  label: string;
  /** Picker card one-liner — what the skin feels like, not SVG trivia. */
  hint: string;
  /** The glued core: hotspot mark + box-wear. Always present. */
  Cursor: FC<CursorSkinCursorProps>;
  /**
   * The trailing shell — painted inside the layer's spring-followed host so
   * it chases the core. Hidden by the layer during morph/scrub (box-wear is
   * the statement) and while asleep. `null` = this skin is single-speed
   * (chrome, the faithful OS cursor).
   */
  Shell: FC<CursorSkinCursorProps> | null;
}

const GLYPH = CURSOR_GLYPH_SIZE;
/** One spring to rule every skin's animation — never inline physics. */
const morphTransition = motionRole.cursor.morph.transition;

/* ── shared accents — always mounted, animated in, never popped in ───────── */

/**
 * Center dot accent. Stays mounted; `show` crossfades opacity and scale on
 * the house spring so a kind arriving feels like the mark blooming, not a
 * new element stamping in.
 */
function AccentDot({ show, color, size = 4 }: { show: boolean; color: string; size?: number }) {
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, backgroundColor: color }}
      animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.3 }}
      transition={morphTransition}
    />
  );
}

/**
 * Axis chevron pair — the resize affordance. One right-pointing path per
 * seat, translated along the axis then rotated in place, ±9px from center,
 * pointing outward (right/left on x, down/up on y). Always mounted; hidden
 * kinds collapse into the center behind the shell's edge.
 */
const AXIS_CHEVRON_SEATS = {
  x: [
    { rotate: 0, dx: 9, dy: 0 },
    { rotate: 180, dx: -9, dy: 0 },
  ],
  y: [
    { rotate: 90, dx: 0, dy: 9 },
    { rotate: -90, dx: 0, dy: -9 },
  ],
} as const;

function AxisChevrons({ axis, show, color }: { axis: 'x' | 'y'; show: boolean; color: string }) {
  return (
    <>
      {AXIS_CHEVRON_SEATS[axis].map((seat) => (
        <motion.svg
          key={`${seat.rotate}:${seat.dx},${seat.dy}`}
          width="7"
          height="7"
          viewBox="0 0 8 8"
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            marginLeft: -3.5,
            marginTop: -3.5,
            transform: `translate(${seat.dx}px, ${seat.dy}px) rotate(${seat.rotate}deg)`,
            stroke: color,
            strokeWidth: 1.75,
            fill: 'none',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
          animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.4 }}
          transition={morphTransition}
        >
          <path d="M2 1 5.5 4 2 7" />
        </motion.svg>
      ))}
    </>
  );
}

/* ── chrome — the faithful OS cursor: one glued mark, no shell ───────────── */

/**
 * Per-kind HOTSPOT anchors, derived from each path's ink bounding box in the
 * 24-unit viewBox, scaled to CSS px (× 18/24 = 0.75). Measured 2026-09-06:
 * anchoring the svg BOX left the arrow's tip 3.0/2.6px past the pointer and
 * the grab hand's ink (+0.94, +0.75)px off-centre — the mark read lopsided.
 *
 * · `click` anchors the drawn TIP (path point 4, 3.5) on the hotspot, the
 *   way every OS arrow works — the pointy end IS the pointer.
 * · resize arrows are ink-centred already (bbox centre 12,12 → no correction).
 * · the hand's ink bbox is x 7→19.5 (centre 13.25), y 7→19 / 10→19, so it
 *   gets the box-centring shift minus the ink offset.
 */
const GLYPH_HOTSPOT: Record<CursorKind, { dx: number; dy: number }> = {
  click: { dx: -3.0, dy: -2.6 },
  'resize-x': { dx: -9, dy: -9 },
  'resize-y': { dx: -9, dy: -9 },
  grab: { dx: -9.9, dy: -9.8 },
  grabbing: { dx: -9.9, dy: -10.9 },
  morph: { dx: 0, dy: 0 },
};

/** Where a glyph's press tilt pivots — the arrow pivots at its tip. */
const GLYPH_ORIGIN: Record<CursorKind, string> = {
  click: '3px 2.6px',
  'resize-x': '50% 50%',
  'resize-y': '50% 50%',
  grab: '50% 50%',
  grabbing: '50% 50%',
  morph: '50% 50%',
};

/**
 * Chrome-style KIND glyphs — the house default, verbatim geometry: arrow /
 * resize arrows / grab hand.
 */
function CursorGlyph({ kind, color }: { kind: CursorKind; color: string }) {
  // BLOCK, never inline: an inline svg rides the line-box baseline and the
  // glyph lands ~half its height below the hotspot math (measured +9px on an
  // 18px glyph) — the "lopsided cursor" bug. Block pins it to the wrapper.
  const box = { display: 'block' as const, width: GLYPH, height: GLYPH };
  const stroke = { stroke: color, strokeWidth: 1.6, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'click') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden style={box}>
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
      <svg viewBox="0 0 24 24" aria-hidden style={box}>
        <path d="M3 12h18M7 8 3 12l4 4M17 8l4 4-4 4" {...stroke} />
      </svg>
    );
  }
  if (kind === 'resize-y') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden style={box}>
        <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" {...stroke} />
      </svg>
    );
  }
  if (kind === 'grab' || kind === 'grabbing') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden style={box}>
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

function ChromeCursor({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const glyphKind = kind !== 'idle' && kind !== 'morph' ? kind : null;
  const wear = kind === 'morph';
  return (
    <>
      {/* The dot/wear node — always mounted so idle↔box-wear stays ONE
          spring-driven object. It dissolves (opacity) while a glyph owns
          the pointer and the glyph grows out of the hotspot, so the state
          change is a hand-off, not a swap. */}
      <motion.div
        className={cn(wear ? cornerClass('control') : cornerClass('pill'), wear && 'border')}
        style={{
          width,
          height,
          marginLeft,
          marginTop,
          borderColor: color,
          backgroundColor: wear ? `${color}33` : color,
        }}
        animate={{ scale: pressed ? 0.62 : 1, opacity: glyphKind ? 0 : 1 }}
        transition={morphTransition}
      />
      {/* The glyph — keyed per kind so click→resize→grab crossfade through
          each other (exit shrinks into the hotspot, enter grows out of it),
          anchored on the ink-exact hotspot math above. */}
      <AnimatePresence>
        {glyphKind ? (
          <motion.div
            key={glyphKind}
            className="absolute left-0 top-0"
            style={{
              width: GLYPH,
              height: GLYPH,
              x: GLYPH_HOTSPOT[glyphKind].dx,
              y: GLYPH_HOTSPOT[glyphKind].dy,
              transformOrigin: GLYPH_ORIGIN[glyphKind],
            }}
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: pressed ? 0.88 : 1, rotate: pressed && glyphKind === 'click' ? -10 : 0 }}
            exit={{ opacity: 0, scale: 0.55 }}
            transition={morphTransition}
          >
            <CursorGlyph kind={glyphKind} color={color} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ── orbit — dot core, trailing ring shell ───────────────────────────────── */

function OrbitCursor({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const wear = kind === 'morph';
  if (wear) {
    return (
      <motion.div
        className={cn('absolute rounded-full border', cornerClass('control'))}
        style={{ width, height, marginLeft, marginTop, borderColor: color, backgroundColor: `${color}1f` }}
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={morphTransition}
      />
    );
  }
  // Core: the point. GROWS on press — counter-motion against the shell
  // contracting onto it, so a click reads as a squeeze, not a shrink.
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, backgroundColor: color }}
      animate={{ scale: pressed ? 1.3 : 1 }}
      transition={morphTransition}
    />
  );
}

function OrbitShell({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const hand = kind === 'grab' || kind === 'grabbing';
  const axis = kind === 'resize-x' ? 'x' : kind === 'resize-y' ? 'y' : null;
  return (
    <motion.div
      className={cn('absolute rounded-full border', hand && 'border-dashed')}
      style={{
        width,
        height,
        marginLeft,
        marginTop,
        borderWidth: kind === 'idle' ? 1.5 : 2,
        borderColor: color,
        backgroundColor: kind === 'grabbing' ? `${color}40` : 'transparent',
      }}
      animate={{ scale: pressed ? 0.72 : 1 }}
      transition={morphTransition}
    >
      <AccentDot show={kind === 'click'} color={color} />
      <AxisChevrons axis={axis ?? 'x'} show={axis !== null} color={color} />
    </motion.div>
  );
}

/* ── comet — hot dot core, trailing glow shell ───────────────────────────── */

function CometCursor({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const wear = kind === 'morph';
  if (wear) {
    return (
      <motion.div
        className={cn('absolute rounded-full border', cornerClass('control'))}
        style={{ width, height, marginLeft, marginTop, borderColor: color, backgroundColor: `${color}2e` }}
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={morphTransition}
      />
    );
  }
  // Core: the hot head. Contracts on press while the shell FLARES — the
  // mark reads as energy transferring outward.
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{ width: 8, height: 8, marginLeft: -4, marginTop: -4, backgroundColor: color }}
      animate={{ scale: pressed ? 0.8 : 1 }}
      transition={morphTransition}
    />
  );
}

function CometShell({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const hand = kind === 'grab' || kind === 'grabbing';
  const axis = kind === 'resize-x' ? 'x' : kind === 'resize-y' ? 'y' : null;
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width,
        height,
        marginLeft,
        marginTop,
        borderStyle: hand ? 'dashed' : 'solid',
        borderWidth: hand ? 1.5 : 0,
        borderColor: color,
        backgroundColor: hand ? 'transparent' : `${color}38`,
      }}
      animate={{
        scaleX: axis === 'x' ? 1.55 : 1,
        scaleY: axis === 'y' ? 1.55 : 1,
        opacity: kind === 'idle' ? 0.65 : 1,
      }}
      transition={morphTransition}
    >
      {/* Press flare — expands against the contracting core. */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-6 w-6 rounded-full border-2"
        style={{ borderColor: color, translateX: '-50%', translateY: '-50%' }}
        animate={{ opacity: pressed ? 0.9 : 0, scale: pressed ? 1.2 : 0.6 }}
        transition={morphTransition}
      />
    </motion.div>
  );
}

/* ── reticle — point core, trailing bracket shell ────────────────────────── */

function ReticleCursor({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const wear = kind === 'morph';
  if (wear) {
    return (
      <motion.div
        className="absolute"
        style={{ width, height, marginLeft, marginTop }}
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={morphTransition}
      >
        <span aria-hidden className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border" style={{ borderColor: color, backgroundColor: pressed ? color : 'transparent' }} />
      </motion.div>
    );
  }
  // Core: the exact pixel. Sharpen on press — the instrument focusing.
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{ width: 3, height: 3, marginLeft: -1.5, marginTop: -1.5, backgroundColor: color }}
      animate={{ scale: pressed ? 1.5 : 1 }}
      transition={morphTransition}
    />
  );
}

function ReticleShell({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const hand = kind === 'grab' || kind === 'grabbing';
  const axis = kind === 'resize-x' ? 'x' : kind === 'resize-y' ? 'y' : null;
  const bracket = 'absolute h-1 w-1';
  const bracketBorder = { borderColor: color } as const;
  return (
    <motion.div
      className="absolute"
      style={{ width, height, marginLeft, marginTop }}
      animate={{ scale: pressed ? 0.85 : 1 }}
      transition={morphTransition}
    >
      <span aria-hidden className={cn(bracket, 'left-0 top-0 border-l border-t')} style={bracketBorder} />
      <span aria-hidden className={cn(bracket, 'right-0 top-0 border-r border-t')} style={bracketBorder} />
      <span aria-hidden className={cn(bracket, 'bottom-0 left-0 border-b border-l')} style={bracketBorder} />
      <span aria-hidden className={cn(bracket, 'bottom-0 right-0 border-b border-r')} style={bracketBorder} />
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full border border-dashed"
        style={{ borderColor: color }}
        animate={{ opacity: hand ? 1 : 0, scale: hand ? 1 : 0.85 }}
        transition={morphTransition}
      />
      <AccentDot show={kind === 'click' || kind === 'grabbing'} color={color} />
      <AxisChevrons axis={axis ?? 'x'} show={axis !== null} color={color} />
    </motion.div>
  );
}

/* ── gem — solid diamond core, trailing hollow diamond shell ─────────────── */

function GemCursor({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const wear = kind === 'morph';
  if (wear) {
    return (
      <motion.div
        className="absolute"
        style={{ width, height, marginLeft, marginTop }}
        animate={{ scale: pressed ? 0.97 : 1 }}
        transition={morphTransition}
      >
        <span aria-hidden className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border" style={{ borderColor: color, backgroundColor: pressed ? color : 'transparent' }} />
      </motion.div>
    );
  }
  // Core: the jewel's heart. SPINS on press — counter-rotation against the
  // shell cocking the other way makes the click read as a setting click.
  return (
    <motion.span
      aria-hidden
      className="absolute left-1/2 top-1/2"
      style={{ width: 6, height: 6, marginLeft: -3, marginTop: -3, backgroundColor: color }}
      animate={{ rotate: pressed ? 135 : 45, borderRadius: pressed ? '50%' : 1 }}
      transition={morphTransition}
    />
  );
}

function GemShell({ kind, pressed, color, width, height, marginLeft, marginTop }: CursorSkinCursorProps) {
  const hand = kind === 'grab' || kind === 'grabbing';
  const axis = kind === 'resize-x' ? 'x' : kind === 'resize-y' ? 'y' : null;
  return (
    <motion.div
      className={cn('absolute border', hand && 'border-dashed')}
      style={{
        width,
        height,
        marginLeft,
        marginTop,
        borderWidth: 1.5,
        borderColor: color,
        borderRadius: 2,
        backgroundColor: kind === 'grabbing' ? `${color}40` : 'transparent',
      }}
      animate={{
        rotate: 45 + (pressed ? -20 : 0),
        scaleX: axis === 'x' ? 1.5 : 1,
        scaleY: axis === 'y' ? 1.5 : 1,
      }}
      transition={morphTransition}
    >
      <AccentDot show={kind === 'click'} color={color} />
    </motion.div>
  );
}

/* ── registry ────────────────────────────────────────────────────────────── */

export const CURSOR_SKINS: Record<CursorSkinId, CursorSkin> = {
  chrome: {
    id: 'chrome',
    label: 'Chrome',
    hint: 'The OS cursor, faithful — glyphs on the staff-color dot.',
    Cursor: ChromeCursor,
    Shell: null,
  },
  orbit: {
    id: 'orbit',
    label: 'Orbit',
    hint: 'Dot core in a trailing ring — squeezes closed on click.',
    Cursor: OrbitCursor,
    Shell: OrbitShell,
  },
  comet: {
    id: 'comet',
    label: 'Comet',
    hint: 'Hot dot with a comet tail — flares outward on press.',
    Cursor: CometCursor,
    Shell: CometShell,
  },
  reticle: {
    id: 'reticle',
    label: 'Reticle',
    hint: 'Precision point inside trailing brackets.',
    Cursor: ReticleCursor,
    Shell: ReticleShell,
  },
  gem: {
    id: 'gem',
    label: 'Gem',
    hint: 'Jewel core in a trailing diamond — spins on click.',
    Cursor: GemCursor,
    Shell: GemShell,
  },
};
