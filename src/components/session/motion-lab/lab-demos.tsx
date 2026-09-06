'use client';

/**
 * The Motion Lab's demo stages — one component per card. Each runs its
 * entrance on MOUNT; the card's `key={nonce}` remount is the replay mechanism
 * (see MotionLab.tsx).
 *
 * Physics never appears here that isn't in the catalog / roles; Motion+
 * components import from `@/design-system/motion/plus` — the sole Plus import
 * site. Every demo carries its reduced-motion branch so the lab doubles as
 * the parity checker.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import { motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import {
  framerDuration,
  framerGesture,
  framerTransition,
  framerVariants,
} from '@/design-system/foundations/motion-framer';
import { AnimateNumber, AnimateText, ScrambleText, Typewriter } from '@/design-system/motion/plus';
import { ChatTurn } from '@/components/ai/ChatTurn';
import { StreamingCaret } from '@/components/ai/StreamingCaret';

const DEMO_TURNS = [
  { role: 'user' as const, text: "What's stuck on the floor right now?" },
  {
    role: 'assistant' as const,
    text: 'Two things need you: 12 received-never-listed units (9 days) and one packing lane at 71% of pace. The rest is humming.',
  },
];

export function TurnEntranceDemo() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (visible >= DEMO_TURNS.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 420);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <div className="flex flex-col gap-2.5">
      {DEMO_TURNS.slice(0, visible).map((t) =>
        t.role === 'user' ? (
          <ChatTurn
            key={t.text}
            className="ml-8 rounded-lg bg-blue-50 px-3 py-1.5 text-role-caption leading-5 text-blue-900 ring-1 ring-inset ring-blue-100"
          >
            <p className="whitespace-pre-wrap">{t.text}</p>
          </ChatTurn>
        ) : (
          <ChatTurn key={t.text} className="mr-2 text-role-caption leading-5 text-text-default">
            {t.text}
          </ChatTurn>
        ),
      )}
      {visible === 0 ? <p className="text-role-micro text-text-faint">Watch a turn land…</p> : null}
    </div>
  );
}

export function LandDemo() {
  const { presence, transition } = useMotionRole(motionRole.chat.land);
  return (
    <motion.p
      {...presence}
      transition={transition}
      className="mx-auto w-fit font-serif text-xl italic leading-snug"
    >
      {/* The greeting's own gradient — identical hexes to AgentSessionPanel's
          shine, because this demo IS that line (the token debate is open in
          the ink backlog; the demo must not drift from the real surface). */}
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: 'linear-gradient(90deg, #2563eb 0%, #6d28d9 55%, #f59e0b 100%)' }}
      >
        your business, beautifully in hand.
      </span>
    </motion.p>
  );
}

export function WordCascadeDemo() {
  const reduced = useReducedMotion();
  if (reduced) {
    return <p className="text-center font-serif text-lg italic text-text-muted">we&apos;re ready when you are.</p>;
  }
  return (
    <motion.p
      className="text-center font-serif text-lg italic text-text-default"
      variants={framerVariants.chatWordRiseContainer}
      initial="hidden"
      animate="show"
    >
      <AnimateText type="word" variants={framerVariants.chatWordRiseWord}>
        we&apos;re ready when you are.
      </AnimateText>
    </motion.p>
  );
}

const TYPE_TEXT =
  'Packing is 148 boxes out the door — nice pace. One lane is trailing; I left the exception on your board.';

export function TypewriterDemo() {
  return (
    <p className="text-role-caption leading-6 text-text-default">
      <Typewriter speed="fast" variance="natural" cursorBlinkRepeat={2}>
        {TYPE_TEXT}
      </Typewriter>
    </p>
  );
}

const PHRASES = [
  'Reading the packing KPIs…',
  'Checking receiving exceptions…',
  'Counting received-never-listed units…',
  'Weighing dead stock for the gap tile…',
];

export function PhaseMorphDemo() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="flex items-center gap-1.5 text-role-caption leading-5 text-text-muted">
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      {reduced ? (
        <span>{PHRASES[index]}</span>
      ) : (
        <ScrambleText duration={framerDuration.chatPhaseScramble} interval={0.04} className="min-w-0">
          {PHRASES[index]}
        </ScrambleText>
      )}
    </p>
  );
}

export function CaretDemo() {
  return (
    <p className="text-role-caption leading-6 text-text-default">
      The answer arrives as it is being thought
      <StreamingCaret className="ml-0.5" />
    </p>
  );
}

export function NumberRollDemo() {
  // 0 on mount, roll to the real figure one beat later — the digit-spin is
  // the demo, and AnimateNumber only animates on CHANGE.
  const [value, setValue] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setValue(2049), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="flex items-baseline gap-2 text-role-caption text-text-default">
      <AnimateNumber transition={framerTransition.chatMicroSettle} className="font-semibold tabular-nums">
        {value}
      </AnimateNumber>
      <span className="text-text-muted">units stuck across six leak signals</span>
    </p>
  );
}

export function GestureDemo() {
  const reduced = useReducedMotion();
  const settle = useMotionTransition(framerTransition.chatMicroSettle);
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {["What's on my day?", 'Daily checks', 'My tasks'].map((s) => (
          <motion.button
            key={s}
            type="button"
            whileHover={reduced ? undefined : framerGesture.chatHover}
            whileTap={reduced ? undefined : framerGesture.chatPress}
            transition={settle}
            className="rounded-full border border-border-hairline px-2.5 py-1 text-role-micro font-medium text-text-muted hover:bg-surface-sunken"
          >
            {s}
          </motion.button>
        ))}
      </div>
      <div className="relative">
        {reduced ? null : (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-2xl ring-1 ring-text-info/35"
            initial={{ opacity: 0, scale: 0.996 }}
            animate={{ opacity: focused ? 1 : 0, scale: focused ? 1.004 : 0.996 }}
            transition={settle}
          />
        )}
        {/* ds-raw-input: demo staging, not a field — a plain input is the
            point (the bloom ring around an unstyled box), so TextField chrome
            would demo something the real composer does not do. */}
        <input
          aria-label="Composer bloom demo"
          placeholder="Tab here — the mouth blooms, the box never scales"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full rounded-2xl border border-border-hairline bg-surface-card px-3 py-2 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      </div>
    </div>
  );
}
