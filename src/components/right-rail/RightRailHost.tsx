'use client';

/**
 * RightRailHost — the ONE owner of the right-edge slot.
 *
 * Renders exactly the top occupant inside an inset rounded overlay card
 * (`DetailStackFrame` layout tokens) with a viewport backdrop, one
 * `AnimatePresence mode="wait"` crossfade keyed on occupant id, and
 * scale+opacity enter/exit (`framerPresence.detailStackOverlay`).
 *
 * Desktop-first; the inset card is also shown on narrow viewports (width
 * clamps to viewport minus inset).
 */

import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import {
  framerDuration,
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import {
  useAnyOverlayOpen,
  useBodyScrollLock,
  useEscapeClose,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import {
  DETAIL_STACK_RESIZE,
  assistantDockAsideClassName,
  assistantDockAsideStyle,
  detailStackAsideClassName,
  detailStackAsideElevatedClassName,
  detailStackAsideStyle,
  detailStackBackdropClassName,
  detailStackBackdropElevatedClassName,
} from '@/components/right-rail/DetailStackFrame';
import {
  getRightRailTop,
  getServerRightRailTop,
  subscribeRightRail,
} from '@/lib/right-rail/store';

const BACKDROP_FADE = {
  duration: framerDuration.detailStackOverlayMount * 0.75,
  ease: motionBezier.easeOut,
} as const;

export function RightRailHost() {
  const top = useSyncExternalStore(subscribeRightRail, getRightRailTop, getServerRightRailTop);
  const presence = useMotionPresence(framerPresence.detailStackOverlay);
  const transition = useMotionTransition(framerTransition.detailStackOverlayMount);

  const renderable = top && top.node != null ? top : null;
  const isAssistantDock = renderable?.id === 'assistant';
  const isElevated = !!renderable?.elevated;
  // Modality is a per-occupant contract (`RightRailPanel.modal`, default true).
  // The assistant dock has always been non-modal by identity; it now flows
  // through the same flag instead of an id check, so a detail inspector can opt
  // out too (dashboard order inspector — see the execution plan §3).
  const isModal = !isAssistantDock && renderable?.modal !== false;

  // The innermost open overlay owns Escape: while a popover / menu / cell editor
  // is up, Escape dismisses THAT, not the whole inspector underneath it.
  const overlayOpen = useAnyOverlayOpen();

  useBodyScrollLock(!!renderable && isModal);
  useEscapeClose(!!renderable?.onClose && !overlayOpen, renderable?.onClose ?? (() => {}));

  // Drag-to-resize, non-modal occupants only. A modal panel dims what it covers,
  // so its width is a fixed design decision; a non-modal inspector coexists with
  // the collection map, and how much map to trade is the operator's call. The
  // assistant dock keeps its own flush-right geometry.
  const isResizable = !!renderable && !isModal && !isAssistantDock;
  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: DETAIL_STACK_RESIZE.storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: DETAIL_STACK_RESIZE.maxWidthPadPx,
    enabled: isResizable,
    label: 'Resize details panel',
    testId: 'detail-inspector-resize',
  });

  return (
    <>
      <AnimatePresence initial={false}>
        {renderable?.onClose && isModal ? (
          <motion.div
            key={`${renderable.id}-backdrop`}
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_FADE}
            onClick={renderable.onClose}
            className={isElevated ? detailStackBackdropElevatedClassName : detailStackBackdropClassName}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        {renderable ? (
          <motion.aside
            key={renderable.id}
            // Modal occupants keep the blocking dialog semantics. Non-modal ones
            // are a named region: the page underneath stays scrollable, clickable
            // and readable, so announcing a modal dialog would be a lie (and the
            // host installs no focus trap — deliberately).
            role={isModal ? 'dialog' : 'region'}
            aria-modal={isModal ? true : undefined}
            aria-label={renderable.ariaLabel ?? (isModal ? undefined : 'Details')}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            style={
              isAssistantDock
                ? assistantDockAsideStyle()
                : detailStackAsideStyle(isResizable ? width : undefined)
            }
            className={
              isAssistantDock
                ? assistantDockAsideClassName
                : isElevated
                  ? detailStackAsideElevatedClassName
                  : detailStackAsideClassName
            }
          >
            {isResizable ? (
              <div
                {...edgeHandleProps}
                className={cn(
                  // Inside the card (not `-left-*`): the aside clips at its
                  // rounded corners, so an outset handle would be sheared off.
                  'absolute inset-y-0 left-0 z-raised w-1.5 cursor-col-resize',
                  'hover:bg-accent-bg/40 active:bg-accent-bg/60',
                  isDragging && 'bg-accent-bg/60',
                )}
              />
            ) : null}
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              {renderable.node}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
