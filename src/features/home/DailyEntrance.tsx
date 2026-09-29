'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion, useAnimationControls, type Variants } from 'motion/react';
import { DROP, grammar, ms } from '@/components/boot/welcome/motion-grammar';
import { getWelcomeStage, subscribeWelcomeStage } from '@/components/boot/welcome/welcome-stage';
import { useReducedMotion } from '@/design-system/motion';
import { elevationClass } from '@/design-system/tokens/shadows';

export type EntrancePhase = 'hidden' | 'rising' | 'rows' | 'revealed';

const HIDDEN_TRANSFORM = `translate3d(0, 100vh, 0) scale(${DROP.LIFT_SCALE})`;
const ELEVATED_TRANSFORM = `translate3d(0, 0, 0) scale(${DROP.LIFT_SCALE})`;
const FLUSH_TRANSFORM = 'translate3d(0, 0, 0) scale(1)';

export interface DailyEntranceProps {
  children: ReactNode;
  ready: boolean;
  onPhase: (phase: EntrancePhase) => void;
}

export function DailyEntrance({ children, ready, onPhase }: DailyEntranceProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const controls = useAnimationControls();
  const plateControls = useAnimationControls();
  const [phase, setPhase] = useState<EntrancePhase>('revealed');
  const phaseRef = useRef<EntrancePhase>('revealed');
  const seenNonce = useRef(0);
  const sequence = useRef(0);

  const contentVariants = useMemo<Variants>(
    () =>
      reduceMotion
        ? {
            hidden: { opacity: 0 },
            elevated: { opacity: 1, transition: grammar(true).move },
            flush: { opacity: 1, transition: grammar(true).move },
          }
        : {
            hidden: { transform: HIDDEN_TRANSFORM },
            elevated: { transform: ELEVATED_TRANSFORM, transition: DROP.SPRING },
            flush: { transform: FLUSH_TRANSFORM, transition: { ...DROP.SPRING, delay: DROP.HOLD_S } },
          },
    [reduceMotion],
  );

  const plateVariants = useMemo<Variants>(
    () =>
      reduceMotion
        ? { hidden: { opacity: 0 }, elevated: { opacity: 0 }, flush: { opacity: 0 } }
        : {
            hidden: { opacity: 1, transform: HIDDEN_TRANSFORM },
            elevated: { opacity: 1, transform: ELEVATED_TRANSFORM, transition: DROP.SPRING },
            flush: {
              opacity: 0,
              transform: FLUSH_TRANSFORM,
              transition: { ...DROP.SPRING, delay: DROP.HOLD_S },
            },
          },
    [reduceMotion],
  );

  const commitPhase = useCallback((next: EntrancePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const run = useCallback(
    (label: 'elevated' | 'flush') => Promise.all([controls.start(label), plateControls.start(label)]),
    [controls, plateControls],
  );

  const startRise = useCallback(
    async (skipped: boolean, sequenceId: number) => {
      if (skipped) {
        controls.set('flush');
        plateControls.set('flush');
        commitPhase('revealed');
        return;
      }
      commitPhase('rising');
      if (!reduceMotion) await run('elevated');
      if (sequence.current !== sequenceId) return;
      await run('flush');
      if (sequence.current !== sequenceId) return;
      commitPhase('rows');
    },
    [commitPhase, controls, plateControls, reduceMotion, run],
  );

  useLayoutEffect(() => {
    let mounted = true;
    const apply = () => {
      if (!mounted) return;
      const stage = getWelcomeStage();
      if (stage.variant === 'elevation' && stage.phase === 'greeting' && stage.nonce !== seenNonce.current) {
        seenNonce.current = stage.nonce;
        sequence.current += 1;
        controls.set('hidden');
        plateControls.set('hidden');
        commitPhase('hidden');
      } else if (stage.phase === 'released' && phaseRef.current === 'hidden') {
        const sequenceId = sequence.current;
        void startRise(stage.skipped, sequenceId);
      }
    };
    apply();
    const unsubscribe = subscribeWelcomeStage(apply);
    return () => {
      mounted = false;
      sequence.current += 1;
      unsubscribe();
    };
  }, [commitPhase, controls, plateControls, startRise]);

  useEffect(() => {
    onPhase(phase);
  }, [onPhase, phase]);

  useEffect(() => {
    if (phase !== 'rows' || !ready) return;
    const timer = window.setTimeout(
      () => commitPhase('revealed'),
      ms(DROP.STAGGER_CAP * DROP.STAGGER_S + DROP.ROW_SETTLE_S),
    );
    return () => window.clearTimeout(timer);
  }, [commitPhase, phase, ready]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col"
      data-daily-entrance-phase={phase}
    >
      <motion.div
        aria-hidden
        initial={false}
        animate={plateControls}
        variants={plateVariants}
        className={`pointer-events-none absolute inset-0 rounded-xl ${elevationClass('overlay')}`}
        style={{
          opacity: 0,
          willChange: phase === 'hidden' || phase === 'rising' ? 'transform, opacity' : 'auto',
        }}
      />
      <motion.div
        initial={false}
        animate={controls}
        variants={contentVariants}
        inert={phase === 'hidden' || phase === 'rising'}
        className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${
          phase === 'hidden' || phase === 'rising' ? 'rounded-xl' : ''
        }`}
        style={{ willChange: phase === 'hidden' || phase === 'rising' ? 'transform, opacity' : 'auto' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
