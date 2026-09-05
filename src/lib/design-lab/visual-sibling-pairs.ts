/**
 * Sibling-diff pairs for the visual walk — plan §7.4 step 5.
 *
 * A screen that should match its sibling is compared to the sibling, not to
 * itself. Drift between the pair is a fork showing up as pixels before it
 * shows up as code. Declared as data so the spec and the catalog tripwire
 * cannot disagree about which ids exist.
 */
export const VISUAL_SIBLING_PAIRS = [
  {
    a: 'desk:orders',
    b: 'desk:exceptions',
    why: 'To-ship vs Exceptions — same orders engine, different row source.',
  },
  {
    a: 'station:pack',
    b: 'station:unbox',
    why: 'Pack vs Unbox — same overlay shell, different station skin.',
  },
] as const;

export type VisualSiblingPair = (typeof VISUAL_SIBLING_PAIRS)[number];
