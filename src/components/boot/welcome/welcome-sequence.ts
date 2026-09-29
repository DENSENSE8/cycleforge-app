export type WelcomePhaseId = 'header' | 'sidebar' | 'main';
export type WelcomeStep = 'wait' | 'lock' | 'focus' | 'settled' | 'skipped';

export const WELCOME_PHASES: readonly WelcomePhaseId[] = ['header', 'sidebar', 'main'];
export const WELCOME_PHASE_LABELS: Readonly<Record<WelcomePhaseId, string>> = {
  header: 'Header',
  sidebar: 'Sidebar',
  main: 'Workspace',
};

export interface WelcomeSequenceState {
  readonly cursor: number;
  readonly steps: Partial<Record<WelcomePhaseId, WelcomeStep>>;
}

export const INITIAL_WELCOME_SEQUENCE: WelcomeSequenceState = {
  cursor: -1,
  steps: {},
};

export interface WelcomeAdvancePlan {
  readonly skipped: readonly WelcomePhaseId[];
  readonly nextIndex: number;
}

/** Pure scheduling decision: absent regions are skipped without consuming a beat. */
export function planWelcomeAdvance(
  from: number,
  absent: ReadonlySet<WelcomePhaseId>,
): WelcomeAdvancePlan {
  const skipped: WelcomePhaseId[] = [];
  for (let index = Math.max(0, from); index < WELCOME_PHASES.length; index++) {
    const phase = WELCOME_PHASES[index];
    if (absent.has(phase)) {
      skipped.push(phase);
      continue;
    }
    return { skipped, nextIndex: index };
  }
  return { skipped, nextIndex: WELCOME_PHASES.length };
}

export type WelcomeSequenceAction =
  | { type: 'advance'; plan: WelcomeAdvancePlan }
  | { type: 'step'; phase: WelcomePhaseId; step: WelcomeStep };

export function welcomeSequenceReducer(
  state: WelcomeSequenceState,
  action: WelcomeSequenceAction,
): WelcomeSequenceState {
  if (action.type === 'step') {
    if (state.steps[action.phase] === action.step) return state;
    return { ...state, steps: { ...state.steps, [action.phase]: action.step } };
  }

  const steps = { ...state.steps };
  for (const phase of action.plan.skipped) steps[phase] = 'skipped';
  const next = WELCOME_PHASES[action.plan.nextIndex];
  if (next) steps[next] = 'wait';
  return { cursor: action.plan.nextIndex, steps };
}

export function currentWelcomePhase(state: WelcomeSequenceState): WelcomePhaseId | null {
  return state.cursor >= 0 && state.cursor < WELCOME_PHASES.length
    ? WELCOME_PHASES[state.cursor]
    : null;
}

export function welcomeSequenceDone(state: WelcomeSequenceState): boolean {
  return state.cursor >= WELCOME_PHASES.length;
}
