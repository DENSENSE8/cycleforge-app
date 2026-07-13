'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  framerDuration,
  framerTransition,
  signInStepVariants,
  signInStepVariantsReduced,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { TextField } from '@/design-system/primitives';

/** Min height during step crossfade — chip + password field + Forgot link row */
const STEP_VIEWPORT_MIN_H = '7.5rem';

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
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();
  const stepVariants = reduceMotion ? signInStepVariantsReduced : signInStepVariants;
  const stepTransition = useMotionTransition(framerTransition.signInStepSlide);

  useEffect(() => {
    if (authStep !== 'password') {
      setShowPassword(false);
      return;
    }
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
              className="group inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-surface-canvas py-1 pl-1.5 pr-3 text-role-caption font-semibold text-text-muted transition hover:text-text-default"
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
            <div className="w-full space-y-1.5">
              <TextField
                ref={passwordRef}
                id="password"
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={onPasswordChange}
                tone="blue"
                trailing={
                  <button
                    type="button"
                    // Keep focus in the input so toggling never breaks the flow.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-faint transition hover:bg-surface-canvas hover:text-text-soft"
                  >
                    {showPassword ? (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                }
              />
              <div className="flex justify-end">
                <a
                  href="/signin/reset"
                  className="text-role-caption font-semibold text-blue-600 hover:text-blue-700"
                >
                  Forgot password?
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
