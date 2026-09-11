/**
 * The row-anchored ACTION PLANE gesture — engine-owned, family-agnostic.
 *
 * ## Why this is here and not in `lib/outbound`
 *
 * It was written for CYC-82 (To-ship's assign manifold) and lived under
 * `lib/outbound/morphing-row-action.ts`. It had already stopped being an
 * outbound rule before this move: `TasksWorkbench` calls it too, and the
 * compound gutter that fires it is shared chrome on every compound family. A
 * gesture three unrelated surfaces obey, named after one of them, is a fork
 * waiting for the fourth surface to re-derive it slightly differently.
 *
 * So the RULE moves to the engine and `morphing-row-action.ts` re-exports it —
 * one implementation, every existing caller and every existing grep intact.
 *
 * The rule itself: **the checkbox ALWAYS toggles, including unselect.** Opening
 * the plane is a side-effect of becoming selected, never a substitute for the
 * toggle. Shift is the range walk. Adding another row, or unselecting one while
 * others remain, MUST NOT unmount the plane — bulk verbs ride that one bar.
 */

let livePlanes = 0;

/** Morphing / row-plane hosts call this while they are painted. */
export function rememberRowPlaneOpen(open: boolean): void {
  livePlanes += open ? 1 : -1;
  if (livePlanes < 0) livePlanes = 0;
}

/** What one gutter click means: does it extend a range, and does the plane open? */
export function compoundRowPlaneGutterClick(args: {
  isChecked: boolean;
  shiftKey: boolean;
}): { extend: boolean; menu: 'open' | 'close' | 'keep' } {
  if (args.shiftKey) return { extend: true, menu: 'keep' };
  if (!args.isChecked) return { extend: false, menu: livePlanes > 0 ? 'keep' : 'open' };
  return { extend: false, menu: 'keep' };
}

/** Apply {@link compoundRowPlaneGutterClick}: toggle first, then open or leave the plane. */
export function applyCompoundRowPlaneGutterClick(args: {
  isChecked: boolean;
  shiftKey: boolean;
  onToggle: (event: { shiftKey: boolean }) => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
}): void {
  const intent = compoundRowPlaneGutterClick({
    isChecked: args.isChecked,
    shiftKey: args.shiftKey,
  });
  args.onToggle({ shiftKey: intent.extend });
  if (intent.menu === 'open') args.onOpenMenu();
  else if (intent.menu === 'close') args.onCloseMenu();
}
