/** Floating-dock bottom clearance — ONE value for every floating composer / action dock that sits on the bottom edge of a station column. */
export const FLOATING_DOCK_BOTTOM_PAD =
  'pb-[env(safe-area-inset-bottom)]';

/**
 * Bottom action buttons float (owner 2026-10-03): no bar, no rule, no ground
 * fill behind them — only the buttons, lifted one spacing step plus the
 * safe-area inset off the bottom edge so they never sit flush on it. Every
 * bottom action band (`DetailDock`, `StickyActionBar`, `EvidenceDecisionBar`)
 * takes its bottom clearance from here. Composer docks keep
 * `FLOATING_DOCK_BOTTOM_PAD` (an input hugs the edge; a verb floats).
 */
export const ACTION_DOCK_LIFT = 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]';

/**
 * The air ABOVE floating bottom buttons (owner 2026-10-03): the content's last
 * row never runs up against a button's top edge. Part of the band's flow
 * height, so a list scrolled to its end always stops this far above the buttons.
 */
export const ACTION_DOCK_TOP_GAP = 'pt-4';

/**
 * A floating verb's disabled face: opaque. The house `disabled:opacity-60`
 * would let the content scrolling underneath show through the button.
 */
export const FLOATING_ACTION_DISABLED_FACE =
  'disabled:opacity-100 disabled:bg-mode-panel disabled:text-mode-muted disabled:shadow-none disabled:ring-1 disabled:ring-mode-control';

/**
 * The floating job CTA's width (`DetailDock placement="float"`, owner 2026-09-28): one
 * fixed measure, centred, the SAME on every phone — never stretched edge to edge.
 * 20rem fits the narrowest supported phone (360px) inside the page inset.
 */
export const FLOATING_CTA_WIDTH = 'mx-auto w-full max-w-xs';
