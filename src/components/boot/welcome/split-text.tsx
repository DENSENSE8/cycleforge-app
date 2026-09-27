'use client';

/**
 * SplitText — a line of text entering / leaving glyph by glyph.
 *
 * Graphemes (Intl.Segmenter; Array.from fallback) so emoji / accented names
 * never split mid-character. Each word is one no-wrap inline-block (a word
 * never breaks between its glyphs); the whitespace between words stays plain
 * text, so lines still wrap and spacing matches the static twins exactly.
 * Glyphs are aria-hidden; one sr-only copy carries the string (opt out with
 * `announce={false}` inside an already aria-hidden surface).
 *
 * Several SplitTexts can form ONE orchestrated line: `enterSeq` / `exitSeq`
 * place this instance's first glyph within the line's glyph sequence, so the
 * stagger runs continuously across instances. 'out' runs the sequence in
 * reverse (last glyph leaves first). Motion is transform / opacity only and
 * every timing comes from the motion grammar. `reduced` = the whole string
 * crossfades, no per-glyph motion.
 */

import { useEffect, useMemo, type ElementType } from 'react';
import { motion, type Variants } from 'motion/react';
import type { WelcomeCharVariant } from './welcome-theme';
import { charEnter, charExit, charFlicker, charStaggerFor, reducedMotion, settle } from './motion-grammar';

export type SplitTextState = 'hidden' | 'in' | 'out' | 'rest';

/** This instance's place in an orchestrated line: its first glyph's index and the line's glyph count. */
export interface SplitSequence {
  offset: number;
  count: number;
}

export interface SplitTextProps {
  text: string;
  variant: WelcomeCharVariant;
  /** 'rest' = shown with no motion; 'hidden' = not shown yet. */
  animate: SplitTextState;
  as?: 'span' | 'p' | 'div';
  className?: string;
  /** Classes on every glyph (e.g. the name's metallic ink). */
  glyphClassName?: string;
  /** Seconds before the first glyph of the line enters. */
  delay?: number;
  /** Position in the entering line (default: this text alone). */
  enterSeq?: SplitSequence;
  /** Position in the leaving line (default: this text alone); the stagger runs in reverse. */
  exitSeq?: SplitSequence;
  /** Whole-string crossfade, no per-glyph motion. */
  reduced?: boolean;
  /** Render the sr-only copy (default true). */
  announce?: boolean;
  /** Fires once this instance's last glyph (in stagger order) has finished 'in' or 'out'. */
  onComplete?: (state: 'in' | 'out') => void;
}

interface Glyph {
  char: string;
  /** Index of this grapheme within the text (whitespace counted, so word gaps keep their rhythm). */
  index: number;
}

type Token = { kind: 'word'; glyphs: Glyph[] } | { kind: 'space'; text: string };

const WHITESPACE = /^\s+$/u;

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

/** Grapheme count — for placing several SplitTexts in one orchestrated line (`enterSeq` / `exitSeq`). */
export function countGlyphs(text: string): number {
  return graphemes(text).length;
}

function tokenize(text: string): { tokens: Token[]; length: number } {
  const tokens: Token[] = [];
  const parts = graphemes(text);
  let word: Glyph[] = [];
  let space = '';
  parts.forEach((char, index) => {
    if (WHITESPACE.test(char)) {
      if (word.length) tokens.push({ kind: 'word', glyphs: word });
      word = [];
      space += char;
      return;
    }
    if (space) tokens.push({ kind: 'space', text: space });
    space = '';
    word.push({ char, index });
  });
  if (word.length) tokens.push({ kind: 'word', glyphs: word });
  if (space) tokens.push({ kind: 'space', text: space });
  return { tokens, length: parts.length };
}

interface GlyphTiming {
  inDelay: number;
  outDelay: number;
}

/** Per-variant glyph motion: all transform / opacity; `custom` = the glyph's delays. */
const GLYPH_VARIANTS: Readonly<Record<WelcomeCharVariant, Variants>> = {
  // Default: each glyph lifts into place and lifts away.
  rise: {
    hidden: { opacity: 0, y: '0.45em' },
    rest: { opacity: 1, y: 0 },
    in: ({ inDelay }: GlyphTiming) => ({ opacity: 1, y: 0, transition: { ...charEnter, delay: inDelay } }),
    out: ({ outDelay }: GlyphTiming) => ({ opacity: 0, y: '-0.3em', transition: { ...charExit, delay: outDelay } }),
  },
  // Candlelight: glyphs catch, gutter and hold; leave by guttering out.
  flicker: {
    hidden: { opacity: 0 },
    rest: { opacity: 1 },
    in: ({ inDelay }: GlyphTiming) => ({
      opacity: [0, 0.9, 0.3, 0.85, 1],
      transition: { ...charFlicker, delay: inDelay },
    }),
    out: ({ outDelay }: GlyphTiming) => ({ opacity: [1, 0.35, 0], transition: { ...charExit, delay: outDelay } }),
  },
  // Snowfall: glyphs fall into place and settle; leave by falling on.
  drop: {
    hidden: { opacity: 0, y: '-0.6em' },
    rest: { opacity: 1, y: 0 },
    in: ({ inDelay }: GlyphTiming) => ({
      opacity: 1,
      y: 0,
      transition: { y: { ...settle, delay: inDelay }, opacity: { ...charEnter, delay: inDelay } },
    }),
    out: ({ outDelay }: GlyphTiming) => ({ opacity: 0, y: '0.4em', transition: { ...charExit, delay: outDelay } }),
  },
  // Quiet: opacity only.
  fade: {
    hidden: { opacity: 0 },
    rest: { opacity: 1 },
    in: ({ inDelay }: GlyphTiming) => ({ opacity: 1, transition: { ...charEnter, delay: inDelay } }),
    out: ({ outDelay }: GlyphTiming) => ({ opacity: 0, transition: { ...charExit, delay: outDelay } }),
  },
};

const WHOLE_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  rest: { opacity: 1 },
  in: (delay: number) => ({ opacity: 1, transition: { ...reducedMotion.enter, delay } }),
  out: { opacity: 0, transition: reducedMotion.exit },
};

const WORD_CLASS = 'inline-block whitespace-nowrap';
const GLYPH_CLASS = 'inline-block';

export function SplitText({
  text,
  variant,
  animate,
  as = 'span',
  className,
  glyphClassName,
  delay = 0,
  enterSeq,
  exitSeq,
  reduced = false,
  announce = true,
  onComplete,
}: SplitTextProps) {
  const Tag = as as ElementType;
  const { tokens, length } = useMemo(() => tokenize(text), [text]);
  const enter = enterSeq ?? { offset: 0, count: length };
  const leave = exitSeq ?? { offset: 0, count: length };
  const enterStagger = charStaggerFor(enter.count);
  const leaveStagger = charStaggerFor(leave.count);

  /** The glyph that finishes last in each direction: the last glyph entering, the first leaving. */
  const { lastIn, lastOut } = useMemo(() => {
    let first = -1;
    let last = -1;
    for (const token of tokens) {
      if (token.kind !== 'word') continue;
      for (const glyph of token.glyphs) {
        if (first < 0) first = glyph.index;
        last = glyph.index;
      }
    }
    return { lastIn: last, lastOut: first };
  }, [tokens]);

  // Nothing to animate (empty / whitespace-only): complete at once.
  const settleNow = lastIn < 0 && (animate === 'in' || animate === 'out');
  useEffect(() => {
    if (settleNow && (animate === 'in' || animate === 'out')) onComplete?.(animate);
  }, [settleNow, animate, onComplete]);

  const initial = animate === 'in' || animate === 'hidden' ? 'hidden' : false;
  const handleComplete = (definition: unknown) => {
    if (definition === 'in' || definition === 'out') onComplete?.(definition);
  };

  if (reduced) {
    return (
      <Tag className={className}>
        {announce && <span className="sr-only">{text}</span>}
        <motion.span
          aria-hidden
          custom={delay}
          variants={WHOLE_VARIANTS}
          initial={initial}
          animate={animate}
          onAnimationComplete={handleComplete}
        >
          {text}
        </motion.span>
      </Tag>
    );
  }

  const variants = GLYPH_VARIANTS[variant];
  return (
    <Tag className={className}>
      {announce && <span className="sr-only">{text}</span>}
      <span aria-hidden>
        {tokens.map((token, t) =>
          token.kind === 'space' ? (
            token.text
          ) : (
            <span key={t} className={WORD_CLASS}>
              {token.glyphs.map((glyph) => {
                const timing: GlyphTiming = {
                  inDelay: delay + (enter.offset + glyph.index) * enterStagger,
                  outDelay: (leave.count - 1 - (leave.offset + glyph.index)) * leaveStagger,
                };
                const tracks =
                  (animate === 'in' && glyph.index === lastIn) || (animate === 'out' && glyph.index === lastOut);
                return (
                  <motion.span
                    key={glyph.index}
                    className={glyphClassName ? `${GLYPH_CLASS} ${glyphClassName}` : GLYPH_CLASS}
                    custom={timing}
                    variants={variants}
                    initial={initial}
                    animate={animate}
                    onAnimationComplete={tracks ? handleComplete : undefined}
                  >
                    {glyph.char}
                  </motion.span>
                );
              })}
            </span>
          ),
        )}
      </span>
    </Tag>
  );
}
