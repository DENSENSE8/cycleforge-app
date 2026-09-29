'use client';

import { ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import {
  AnimatePresence,
  MagneticActionField,
  motion,
  motionTargetFor,
} from '@/design-system/motion';
import { AnimateText } from '@/design-system/motion/plus';
import {
  CONTENT_ENTER,
  CONTENT_EXIT,
  GLYPH_SPRING,
  GLYPH_VARIANTS,
  LABEL_VARIANTS,
  LISTING_BUTTON_CONTRACT,
  type ListingButtonPhase,
} from './motion-model';

interface MotionPlusListingButtonProps {
  phase: ListingButtonPhase;
  reduceMotion: boolean;
  onPress: () => void;
}

/**
 * The reusable interaction primitive. It owns no timers and performs no work:
 * phase is controlled by the caller's real operation lifecycle.
 */
export function MotionPlusListingButton({
  phase,
  reduceMotion,
  onPress,
}: MotionPlusListingButtonProps) {
  const visual = motionTargetFor(LISTING_BUTTON_CONTRACT, phase);
  const idle = phase === 'idle';

  return (
    <MagneticActionField
      pull={0.22}
      maxOffset={18}
      disabled={!idle}
      fieldClassName="grid size-64 place-items-center"
      testId="motion-plus-magnetic-zone"
    >
      <motion.button
        type="button"
        disabled={!idle}
        onClick={onPress}
        aria-label={visual.ariaLabel}
        aria-busy={phase === 'working'}
        initial="rest"
        animate={{
          width: visual.width,
          borderRadius: visual.radius,
          scale: visual.scale,
          backgroundColor: visual.background,
          color: visual.foreground,
          borderColor: visual.border,
        }}
        whileHover={idle && !reduceMotion ? 'hover' : undefined}
        whileTap={idle && !reduceMotion ? { scale: 0.965 } : undefined}
        transition={
          reduceMotion
            ? LISTING_BUTTON_CONTRACT.reducedTransition
            : LISTING_BUTTON_CONTRACT.transition
        }
        className="relative flex h-12 items-center justify-center overflow-hidden border bg-black text-white shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_10px_26px_rgba(0,0,0,0.12)] outline-none ring-offset-4 ring-offset-[#f1f0ed] focus-visible:ring-2 focus-visible:ring-black disabled:cursor-default"
      >
        <AnimatePresence initial={false} mode="wait">
          {phase === 'idle' ? (
            <motion.span
              key="idle"
              variants={LABEL_VARIANTS}
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)', transition: CONTENT_ENTER }}
              exit={{ opacity: 0, filter: 'blur(4px)', transition: CONTENT_EXIT }}
              className="flex items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold tracking-[-0.015em]"
            >
              <span className="inline-flex" aria-hidden="true">
                <AnimateText type="char" variants={GLYPH_VARIANTS}>
                  Create listing
                </AnimateText>
              </span>
              <motion.span variants={GLYPH_VARIANTS} className="grid place-items-center" aria-hidden="true">
                <ArrowUpRight className="size-4" strokeWidth={2} />
              </motion.span>
            </motion.span>
          ) : phase === 'working' ? (
            <motion.span
              key="working"
              initial={{ opacity: 0, scale: 0.55, filter: 'blur(3px)' }}
              animate={{ opacity: 1, scale: 1, rotate: 360, filter: 'blur(0px)' }}
              exit={{
                opacity: 0,
                scale: 0.7,
                filter: 'blur(2px)',
                transition: CONTENT_EXIT,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      opacity: CONTENT_ENTER,
                      scale: { type: 'spring', stiffness: 420, damping: 32 },
                      rotate: { duration: 0.7, ease: 'linear', repeat: Infinity },
                    }
              }
              className="grid place-items-center"
            >
              <LoaderCircle className="size-5" strokeWidth={2} aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="done"
              initial={{ opacity: 0, scale: 0.4, filter: 'blur(3px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.7, filter: 'blur(2px)', transition: CONTENT_EXIT }}
              transition={reduceMotion ? { duration: 0 } : GLYPH_SPRING}
              className="grid place-items-center"
            >
              <Check className="size-5" strokeWidth={2} aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </MagneticActionField>
  );
}
