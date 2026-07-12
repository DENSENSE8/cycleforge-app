'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  framerDuration,
  framerTransition,
  signInStepVariants,
  signInStepVariantsReduced,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { TextField } from '@/design-system/primitives';

/** Min height during step crossfade — chip + floating-label password field */
const STEP_VIEWPORT_MIN_H = '6.25rem';

export interface SignInAuthStepPanelsProps {
  authStep: 'email' | 'password';
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBackToEmail: () => void;
}

export function SignInAuthStepPanels({
  authStep,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onBackToEmail,
}: SignInAuthStepPanelsProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const stepVariants = reduceMotion ? signInStepVariantsReduced : signInStepVariants;
  const stepTransition = useMotionTransition(framerTransition.signInStepSlide);

  useEffect(() => {
    if (authStep !== 'password') return;
    const delayMs = reduceMotion ? 0 : Math.round(framerDuration.signInStepSlide * 1000);
    const t = window.setTimeout(() => passwordRef.current?.focus(), delayMs);
    return () => window.clearTimeout(t);
  }, [authStep, reduceMotion]);

  return (
    <div
      className="relative flex w-full flex-col justify-end overflow-visible px-0.5"
      style={{ height: STEP_VIEWPORT_MIN_H }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {authStep === 'email' ? (
          <motion.div
            key="email-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={stepTransition}
            className="flex h-full w-full flex-col justify-end"
          >
            <TextField
              id="email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={onEmailChange}
              tone="blue"
            />
          </motion.div>
        ) : (
          <motion.div
            key="password-step"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={stepTransition}
            className="flex h-full w-full flex-col justify-end space-y-3"
          >
            <button
              type="button"
              onClick={onBackToEmail}
              className="group inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-surface-canvas py-1 pl-1.5 pr-3 text-caption font-semibold text-text-muted transition hover:text-text-default"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-faint transition group-hover:-translate-x-0.5 group-hover:text-text-soft"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span className="truncate">{email.trim()}</span>
            </button>
            <div className="relative w-full">
              <a
                href="/signin/reset"
                className="absolute right-3.5 top-1.5 z-raised text-caption font-semibold text-blue-600 hover:text-blue-700"
              >
                Forgot?
              </a>
              <TextField
                ref={passwordRef}
                id="password"
                name="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={onPasswordChange}
                tone="blue"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
