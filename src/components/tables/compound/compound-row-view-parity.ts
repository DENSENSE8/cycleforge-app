/**
 * **THE ADAPTER-PARITY LAW — a family may not leave a shared face dark by accident.**
 *
 * Every slot-table family hands the SAME shared cells a {@link CompoundRowView}.
 * Those cells paint more than text: the Id chip resolves a marketplace dot from
 * `platformValue` and a carrier dot from the tracking, the `person` face
 * resolves `staff.color_hex` from a staff id, the item cell resolves a listing
 * link from the title href. A family that passes `null` for one of those gets a
 * table that LOOKS hand-rolled while being fully on the engine — which is the
 * worst failure mode available, because every structural gate still passes.
 *
 * That is exactly what happened to `report-packer-day` on 2026-09-16. Operator:
 * *"Why did you not reuse the exact same formatting from the slot data table
 * that's used in shipping? … the packer should display with the circle of the
 * staff color not just all green, the order number should have the color dot
 * for the order number platform."* Both defects were the same mistake, and
 * neither was in the view layer:
 *
 * - the projection had no `staff.id`, so the person face could not colour the
 *   bubble and drew the default for everybody;
 * - the projection had no `account_source`, so the Id chip could not resolve
 *   its channel mark.
 *
 * The adapter dutifully passed `null` for both and nothing complained.
 * `CompoundRowView` types every face as nullable — correctly, since most rows
 * genuinely have nothing to say on most faces — so `null` is always legal and
 * a forgotten fact is indistinguishable from an absent one.
 *
 * **This module makes the difference declarable.** A family states which faces
 * it leaves dark and WHY; a fixture row then proves every other face is fed.
 * Same discipline as `TableSurfaceBinding.recordPlane: { kind: 'none', reason }`
 * — honest absence is written down, not inferred from a null.
 *
 * ## How to use it when porting a family
 *
 * ```ts
 * // <family>-row-view.test.ts
 * test('adapter parity — no shared face is dark by accident', () => {
 *   assertCompoundViewParity(myCompoundView(fullyPopulatedFixture()), {
 *     absent: {
 *       thumbUrl: 'a pack scan has no product image on the row',
 *       amount: 'no money on a pack scan',
 *     },
 *   });
 * });
 * ```
 *
 * The fixture must be FULLY POPULATED — every optional fact present. That is
 * the point: it turns "does the row type even carry this?" into a compile-time
 * question and "does the adapter pass it?" into a test failure.
 */

import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';

/**
 * The faces a shared compound cell paints from a view field, and what each one
 * costs the row when it is dark. Keys are `CompoundRowView` fields.
 *
 * Deliberately NOT every field on the model: this is the set whose absence is
 * visible as a FORMATTING difference from the family's peers — the class of
 * defect the law exists to catch. Facts that are purely textual (`title`,
 * `stateLabel`) fail loudly on screen and need no guard.
 */
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
  /**
   * Faces this family leaves dark ON PURPOSE, each with a one-line reason.
   *
   * The reason is not decoration — it is the thing a reviewer reads to decide
   * whether the absence is honest or a forgotten column. "not applicable" is
   * not a reason; name the fact the row does not have.
   */
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
