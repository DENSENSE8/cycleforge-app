'use client';

import { Collapsible as CollapsiblePrimitive } from 'radix-ui';

/**
 * shadcn/ui Collapsible — vendored 2026-09-05 for the nav spine's section
 * disclosures.
 *
 * **No new dependency.** `radix-ui` (the unified package this repo already
 * takes for Dialog / Tooltip / Slot) bundles `@radix-ui/react-collapsible`
 * and re-exports it as `Collapsible`, so this file is the shadcn wrapper
 * around a primitive that was already installed — same import shape as
 * `sheet.tsx` and `tooltip.tsx`.
 *
 * ## Why Radix owns the state and CSS owns the height
 *
 * Radix gives the things a hand-rolled disclosure keeps getting wrong:
 * `aria-expanded` on the trigger, keyboard activation on both Enter and
 * Space, and unmounting the closed body so its links leave the tab order.
 *
 * One caveat, measured rather than assumed: **a FOLDED trigger carries no
 * `aria-controls`.** Radix emits it only while open —
 * `"aria-controls": context.open ? context.contentId : undefined`
 * (`@radix-ui/react-collapsible@1.1.20/dist/index.mjs:66`) — because the
 * region it would name is not in the DOM at that moment, and pointing at a
 * missing id is worse than omitting the attribute. `aria-expanded="false"` is
 * what announces the state in that case. Do not "fix" this with a hand-rolled
 * id: it would name an element that does not exist.
 *
 * It also publishes `--radix-collapsible-content-height` and holds the body
 * mounted for the length of a CSS animation, which is what
 * `.spine-collapsible-content` in `globals.css` animates.
 *
 * Do NOT wrap {@link CollapsibleContent} in `AnimatePresence` to tween the
 * height in JS: Radix writes `hidden={!isOpen}` on the content element, so an
 * exit animation is painted on an element the browser has already stopped
 * rendering. Height belongs to the CSS var; motion in the spine is reserved
 * for the trigger's chevron.
 */
export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
export const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;
