/**
 * App surface SoT — chrome / canvas / page-wash backgrounds.
 *
 * Appearance → Page background stamps `data-app-wash` on `<html>`; wash hosts
 * read `--ds-wash-from` / `--ds-wash-to` via {@link appWashClass}. Chrome and
 * canvas pin to theme surface tokens so Theme + wash stay one system.
 *
 * Nested cards/inputs keep `bg-surface-card` / `bg-surface-canvas` utilities.
 * Only page/shell **roots** should import these classes.
 */

export const WASH_NAMES = ['mint', 'cool', 'slate', 'dawn', 'flat'] as const;
export type WashName = (typeof WASH_NAMES)[number];

export const DEFAULT_WASH: WashName = 'mint';

interface WashPreset {
  id: WashName;
  label: string;
  hint: string;
  /** Light-theme authoring reference (CSS vars override per theme + wash). */
  previewFrom: string;
  previewTo: string;
}

export const WASH_PRESETS: Record<WashName, WashPreset> = {
  // previewTo is light-theme CANVAS (#eef2f7), not surface white: a wash host
  // is a ground plane for cards, so no stop may land on card white — see the
  // GROUND-PLANE RULE beside the `--ds-wash-*` blocks in styles/globals.css.
  mint: {
    id: 'mint',
    label: 'Mint',
    hint: 'Unbox / receiving wash',
    previewFrom: '#f5fbfa',
    previewTo: '#eef2f7',
  },
  cool: {
    id: 'cool',
    label: 'Cool',
    hint: 'Soft teal fade',
    previewFrom: '#f8fbfb',
    previewTo: '#eef2f7',
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    hint: 'Admin workbench fade',
    previewFrom: '#ffffff',
    previewTo: '#f5f7fa',
  },
  dawn: {
    id: 'dawn',
    label: 'Dawn',
    hint: 'Cool gray schedule wash',
    previewFrom: '#f8fafc',
    previewTo: '#eef2f7',
  },
  flat: {
    id: 'flat',
    label: 'Flat',
    hint: 'Solid canvas — no gradient',
    previewFrom: '#f8fafc',
    previewTo: '#f8fafc',
  },
};

/**
 * Sidebar, GlobalHeader, body frame, scan bands — theme `background-surface`.
 * Depth 2: **flat** chrome (no card shadow). Never pair with
 * {@link appWorkCanvasClass} elevation on the same plane.
 */
export const appChromeClass = 'bg-surface-card';

/**
 * Frosted chrome (GlobalHeader / sticky main headers). Full utility string so
 * Tailwind’s content scanner sees the `/95` opacity variant.
 */
export const appChromeMutedClass = 'bg-surface-card/95';

/** Flat full-bleed work hosts — theme `background-canvas`. */
export const appCanvasClass = 'bg-surface-canvas';

/**
 * Depth-plane edge stroke — readable against chrome / page wash (mint / dark).
 * Owned by the desktop content shell (`appContentShellClass`) so every page
 * gets the same radius hairline. Do **not** use near-invisible
 * `border-hairline` here; that token is for internal row dividers, not the
 * content-corner / chrome join.
 */
export const appWorkCanvasEdgeClass = 'border border-border-soft';

/**
 * Inset bottom rule for primary chrome bands (scan / identity / pane headers).
 * Theme `border-default` — same contrast language as the canvas edge, not a
 * raw hex fork.
 */
export const appChromeBandHairlineClass =
  'shadow-[inset_0_-1px_0_0_var(--ds-color-border-default)]';

/**
 * Depth 1 — layout shell for station work roots (Unbox / Triage / Pack).
 * No fill — use when the root sits on the receiving
 * `CONTEXT_PANEL_HOST` shared ground so a full-bleed card cannot shear
 * outset rail chrome. Pair with an inner content fill, or use
 * {@link appWorkCanvasClass} when the station owns the full host alone
 * (e.g. Pack).
 */
export const appWorkCanvasLayoutClass =
  'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden';

/**
 * Depth 1 — elevated station work fill (layout + card surface).
 * The rounded cutout + depth-edge hairline live on the outer desktop content
 * shell (`appContentShellClass`) so they render on every page, not only
 * stations that opt into this host. No drop shadow — a box-shadow at the soft
 * join casts a gray strip into the sidebar cutout.
 *
 * Do **not** use this full-bleed card as the workspace sibling under a
 * receiving context rail — use {@link appWorkCanvasLayoutClass} instead.
 */
export const appWorkCanvasClass = `${appWorkCanvasLayoutClass} bg-surface-card`;

/**
 * Page wash hosts (Unbox, receiving, admin tabs). Gradient stops come from
 * `html[data-app-wash]` CSS vars — class defined in globals.css (`.app-wash`).
 * Depth 3 — behind chrome and the work canvas. One host per stack.
 */
export const appWashClass = 'app-wash';

export function resolveWash(name: string | null | undefined): WashName {
  if (name && (WASH_NAMES as readonly string[]).includes(name)) return name as WashName;
  return DEFAULT_WASH;
}

export function applyAppWash(name: WashName | string | null | undefined = DEFAULT_WASH): WashName {
  const wash = resolveWash(name);
  if (typeof document === 'undefined') return wash;
  document.documentElement.setAttribute('data-app-wash', wash);
  return wash;
}
