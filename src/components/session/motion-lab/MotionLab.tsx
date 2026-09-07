'use client';

/**
 * MotionLab — the chat surface's motion showcase, opened from the session
 * panel (⌘⇧M or the corner Sparkles). One card per chat-motion job; Replay
 * remounts the stage so the operator can taste a preset before it ships (the
 * "look at it" step of the design-system loop protocol, made into a surface
 * instead of a screenshot ritual).
 *
 * Laws this obeys by construction:
 * - No physics appear here that aren't in the catalog / roles — the lab
 *   DEMONSTRATES house presets, it does not invent rival ones.
 * - `prefers-reduced-motion`: every demo collapses to its reduced form and
 *   the header says so, so the lab doubles as the parity checker.
 * - Keyboard: Esc closes; Replay buttons are real buttons in tab order.
 * - Motion+ components (AnimateText / Typewriter / ScrambleText /
 *   AnimateNumber) import from `@/design-system/motion/plus` — the sole Plus
 *   import site.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, X } from '@/components/Icons';
import { motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import {
  CaretDemo,
  GestureDemo,
  LandDemo,
  NumberRollDemo,
  PhaseMorphDemo,
  TurnEntranceDemo,
  TypewriterDemo,
  WordCascadeDemo,
} from './lab-demos';

/**
 * One showcase card. Replay = remount the stage (`key={nonce}`): every demo
 * is written to run its entrance on MOUNT, so one mechanism replays them all
 * and no demo carries reset plumbing.
 */
function LabCard({
  title,
  intent,
  source,
  children,
}: {
  title: string;
  intent: string;
  /** Catalog path the demo exercises — the card's provenance line. */
  source: string;
  children: React.ReactNode;
}) {
  const [nonce, setNonce] = useState(0);
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-xl border border-border-hairline bg-surface-card p-3.5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-role-caption font-semibold text-text-default">{title}</h3>
          <p className="mt-0.5 text-role-micro leading-4 text-text-muted">{intent}</p>
          <p className="mt-1 font-mono text-role-micro leading-3 text-text-faint">{source}</p>
        </div>
        {/* ds-raw-button (×2, this file): Replay pill + close glyph — demo
            chrome inside a taste-testing overlay, matching the session
            surface's own chip convention (see the BoardTile raw-button
            precedent in design-system-ideas-LOOP). */}
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="ds-raw-button flex shrink-0 items-center gap-1 rounded-full border border-border-hairline px-2 py-1 text-role-micro font-medium text-text-muted transition-colors hover:bg-surface-sunken"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Replay
        </button>
      </header>
      <div key={nonce} className="min-h-24 rounded-lg bg-surface-sunken p-3" data-lab-stage>
        {children}
      </div>
    </section>
  );
}

/** The lab's own entrance is the chat.turn presence — the lab demos itself. */
function LabPanel({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { presence, transition } = useMotionRole(motionRole.chat.turn);
  const fade = useMotionTransition(framerTransition.overlayScrim);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Motion lab"
    >
      <motion.div
        className="absolute inset-0 bg-scrim/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        style={{ zIndex: zIndex.modalBackdrop }}
        onClick={onClose}
      />
      <motion.div
        {...presence}
        transition={transition}
        className={cn(
          'relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl',
          'border border-border-hairline bg-surface-canvas',
          elevationClass('overlay'),
        )}
        style={{ zIndex: zIndex.modal }}
      >
        {children}
      </motion.div>
    </div>
  );
}


// ─── The lab ─────────────────────────────────────────────────────────────────

export function MotionLab({ onClose }: { onClose: () => void }) {
  const reduced = useReducedMotion();
  return (
    <LabPanel onClose={onClose}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-hairline px-4 py-3">
        <div>
          <h2 className="text-role-body font-semibold text-text-default">Motion lab — the chat surface</h2>
          <p className="mt-0.5 text-role-micro text-text-muted">
            Every entrance the transcript now has, replayable. springConcierge = stiffness 170 · damping 22 ·
            mass 1. Esc closes.
          </p>
          {reduced ? (
            <p className="mt-1 text-role-micro font-medium text-text-info">
              Reduced motion is ON — previews collapse to their reduced forms (this is the parity check).
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close motion lab"
          onClick={onClose}
          className="ds-raw-button rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-default"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
      <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
        <LabCard
          title="Turn entrance"
          intent="A reply lands placed, not snapped — rise + 2% settle on the concierge spring. Replaces the hard cut."
          source="motionRole.chat.turn"
        >
          <TurnEntranceDemo />
        </LabCard>
        <LabCard
          title="Landing deblur-rise"
          intent="The greeting's second line resolves from blur(6px) while rising — hero text coming into focus."
          source="motionRole.chat.land"
        >
          <LandDemo />
        </LabCard>
        <LabCard
          title="Word cascade"
          intent="Motion+ splits the line; one word every 45ms rises and deblurs on the same spring."
          source="framerVariants.chatWordRise* + AnimateText"
        >
          <WordCascadeDemo />
        </LabCard>
        <LabCard
          title="Typewriter (Motion+)"
          intent="Natural-variance typing with a real caret — the replay-of-record for streamed prose feel."
          source="motion-plus/react · Typewriter"
        >
          <TypewriterDemo />
        </LabCard>
        <LabCard
          title="Phase-line morph"
          intent="Tool swaps settle out of a character scramble — the agent's status reads as one continuous line of work."
          source="framerDuration.chatPhaseScramble + ScrambleText"
        >
          <PhaseMorphDemo />
        </LabCard>
        <LabCard
          title="Streaming caret breath"
          intent="easeInOut opacity + scaleY loop. Replaces animate-pulse's flat 50%-duty blink."
          source="motionRole.chat.stream"
        >
          <CaretDemo />
        </LabCard>
        <LabCard
          title="Number roll (Motion+)"
          intent="Digits spin to their neighbours instead of text-swapping — counts become events."
          source="motion-plus/react · AnimateNumber"
        >
          <NumberRollDemo />
        </LabCard>
        <LabCard
          title="Micro-gestures + composer bloom"
          intent="Chips lift 1px and dimple on press; the mouth blooms a focus ring that never scales the box (popover anchors stay put)."
          source="framerGesture.chatHover/chatPress · chatMicroSettle"
        >
          <GestureDemo />
        </LabCard>
      </div>
    </LabPanel>
  );
}
