import {
  defineStateMotionContract,
  motionContentSwap,
  type Transition,
  type Variants,
} from '@/design-system/motion';

/**
 * Motion has no authority over domain state. The product decides which phase
 * is true; this model only maps that truth to a visual target.
 */
export type ListingButtonPhase = 'idle' | 'working' | 'done';

export interface ListingButtonVisual {
  width: number;
  radius: number;
  scale: number;
  background: string;
  foreground: string;
  border: string;
  ariaLabel: string;
  statusCopy: string;
}

/** One persistent button, three visual targets. Geometry never lives in JSX. */
export const LISTING_BUTTON_VISUAL: Readonly<Record<ListingButtonPhase, ListingButtonVisual>> = {
  idle: {
    width: 166,
    radius: 14,
    scale: 1,
    background: '#000000',
    foreground: '#ffffff',
    border: 'rgba(0, 0, 0, 0)',
    ariaLabel: 'Create listing',
    statusCopy: 'Magnetic pull · split text · spring morph',
  },
  working: {
    width: 48,
    radius: 24,
    scale: 1,
    background: '#000000',
    foreground: '#ffffff',
    border: 'rgba(0, 0, 0, 0)',
    ariaLabel: 'Creating listing',
    statusCopy: 'Creating listing…',
  },
  done: {
    width: 48,
    radius: 24,
    scale: 1.04,
    background: '#ffffff',
    foreground: '#000000',
    border: 'rgba(0, 0, 0, 0.14)',
    ariaLabel: 'Listing ready',
    statusCopy: 'Listing ready',
  },
};

/** Near-critical response: decisive travel, one almost-imperceptible settle. */
export const SHAPE_SPRING: Transition = {
  type: 'spring',
  stiffness: 360,
  damping: 30,
  mass: 0.7,
};

/** Small glyphs can settle faster than the container without reading as bounce. */
export const GLYPH_SPRING: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 28,
  mass: 0.55,
};

/** Exit finishes before enter; keyed content can never overlap. */
export const CONTENT_EXIT = motionContentSwap.exit;
export const CONTENT_ENTER = motionContentSwap.enter;

/** Reference implementation of the state → target contract used for migrations. */
export const LISTING_BUTTON_CONTRACT = defineStateMotionContract<
  ListingButtonPhase,
  ListingButtonVisual
>({
  targets: LISTING_BUTTON_VISUAL,
  transition: SHAPE_SPRING,
  reducedTransition: { duration: 0 },
});

/** Demo-only clock. A real async owner drives phases from its request lifecycle. */
export const DEMO_PHASE_MS = {
  workingToDone: 820,
  doneToIdle: 1800,
  reducedWorkingToDone: 240,
  reducedDoneToIdle: 900,
} as const;

export const LABEL_VARIANTS: Variants = {
  rest: { transition: { staggerChildren: 0.012 } },
  hover: { transition: { staggerChildren: 0.018 } },
};

export const GLYPH_VARIANTS: Variants = {
  rest: { y: 0 },
  hover: {
    y: [0, -3, 0],
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  },
};
