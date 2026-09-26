/** **THE ADAPTER-PARITY LAW — a family may not leave a shared face dark by accident.** */

import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';

/** The faces a shared compound cell paints from a view field, and what each one costs the row when it is dark. */
export const SHARED_COMPOUND_FACES = {
  identityFace: 'the Id chip’s first line — the row’s operator-facing handle',
  orderId: 'the Id chip’s order line, and the marketplace deep link',
  platformValue: 'the channel dot beside the order id (resolveMarketplacePlatformMeta)',
  tracking: 'the Id chip’s second line, and the carrier dot derived from it',
  thumbUrl: 'the product thumbnail the item cell paints',
  titleHref: 'the listing link on the title',
  orderedAt: 'the DATES chrome’s Hash line',
  amount: 'the money track',
} as const;

export type SharedCompoundFace = keyof typeof SHARED_COMPOUND_FACES;

/** A face left dark, paired with the family's stated reason (or none). */
export interface ParityFinding {
  face: SharedCompoundFace;
  /** What the shared cell cannot paint without it. */
  cost: string;
}

export interface CompoundViewParityOptions {
  /** Faces this family leaves dark ON PURPOSE, each with a one-line reason. */
  absent?: Partial<Record<SharedCompoundFace, string>>;
}

/**
 * Faces that are dark WITHOUT a declared reason. Empty ⇒ the adapter is at
 * parity with its peers for this row.
 */
export function compoundViewParityGaps(
  view: CompoundRowView,
  options: CompoundViewParityOptions = {},
): ParityFinding[] {
  const declared = options.absent ?? {};
  const gaps: ParityFinding[] = [];
  for (const face of Object.keys(SHARED_COMPOUND_FACES) as SharedCompoundFace[]) {
    if (declared[face]) continue;
    const value = view[face];
    if (value === null || value === undefined) {
      gaps.push({ face, cost: SHARED_COMPOUND_FACES[face] });
    }
  }
  return gaps;
}

/** Throws with the dark faces named, for use in a family's row-view test. */
export function assertCompoundViewParity(
  view: CompoundRowView,
  options: CompoundViewParityOptions = {},
): void {
  const gaps = compoundViewParityGaps(view, options);
  if (gaps.length === 0) return;
  const lines = gaps.map((g) => `  - ${g.face}: ${g.cost}`).join('\n');
  throw new Error(
    'compound adapter parity: shared faces are dark with no declared reason.\n' +
      `${lines}\n` +
      'Feed the fact, or declare the absence with a reason in `absent` — see ' +
      'src/components/tables/compound/compound-row-view-parity.ts.',
  );
}
