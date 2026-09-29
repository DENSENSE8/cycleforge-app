import type { Transition } from './react';

/**
 * A state-motion contract projects semantic product state into visual targets.
 * It never owns state, performs work, or advances time.
 */
export interface StateMotionContract<State extends string, Target extends object> {
  readonly targets: Readonly<Record<State, Readonly<Target>>>;
  readonly transition: Transition;
  readonly reducedTransition: Transition;
}

/** Preserve literal state keys and targets while checking the contract shape. */
export function defineStateMotionContract<State extends string, Target extends object>(
  contract: StateMotionContract<State, Target>,
): StateMotionContract<State, Target> {
  return contract;
}

/** The only lookup a renderer needs: semantic state in, visual target out. */
export function motionTargetFor<State extends string, Target extends object>(
  contract: StateMotionContract<State, Target>,
  state: State,
): Readonly<Target> {
  return contract.targets[state];
}

/** Shared content-swap law: departure completes before the next arrival. */
export const motionContentSwap = {
  enter: { duration: 0.14, ease: [0.16, 1, 0.3, 1] } satisfies Transition,
  exit: { duration: 0.1, ease: [0.7, 0, 0.84, 0] } satisfies Transition,
} as const;
