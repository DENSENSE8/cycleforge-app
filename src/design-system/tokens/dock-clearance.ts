/** Floating-dock bottom clearance — ONE value for every floating composer / action dock that sits on the bottom edge of a station column. */
export const FLOATING_DOCK_BOTTOM_PAD =
  'pb-[env(safe-area-inset-bottom)]';

/**
 * The floating job CTA's width (`DetailDock placement="float"`, owner 2026-09-28): one
 * fixed measure, centred, the SAME on every phone — never stretched edge to edge.
 * 20rem fits the narrowest supported phone (360px) inside the page inset.
 */
export const FLOATING_CTA_WIDTH = 'mx-auto w-full max-w-xs';
