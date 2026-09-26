/** The row-anchored ACTION PLANE gesture — engine-owned, family-agnostic. */

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
