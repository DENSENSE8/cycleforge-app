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
import {
  framerDuration,
  framerPresence,
  framerTransition,
  motionBezier,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
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
  detailStackDismissLayerClassName,
  detailStackDismissLayerElevatedClassName,
} from '@/components/right-rail/DetailStackFrame';
import {
  getRightRailTop,
  getServerRightRailTop,
  subscribeRightRail,
} from '@/lib/right-rail/store';
import { cn } from '@/utils/_cn';

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
  // Invisible dismiss layer: non-modal + opt-in. Restores click-off close without
  // the dimming scrim. Dashboard leaves this off so the grid stays live.
  const showDismissLayer =
    !!renderable?.onClose && !isModal && !isAssistantDock && !!renderable.closeOnOutsideClick;
  const showModalBackdrop = !!renderable?.onClose && isModal;

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
        {showModalBackdrop || showDismissLayer ? (
          <motion.div
            key={`${renderable!.id}-backdrop`}
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_FADE}
            onClick={overlayOpen ? undefined : renderable!.onClose}
            className={
              showModalBackdrop
                ? isElevated
                  ? detailStackBackdropElevatedClassName
                  : detailStackBackdropClassName
                : isElevated
                  ? detailStackDismissLayerElevatedClassName
                  : detailStackDismissLayerClassName
            }
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
                : cn(
                    isElevated
                      ? detailStackAsideElevatedClassName
                      : detailStackAsideClassName,
                    // Outset grip sits outside the card; clip content on an
                    // inner shell so the pill is not sheared by overflow-hidden
                    // (same pattern as the receiving context rail).
                    isResizable && 'overflow-visible',
                  )
            }
          >
            {isResizable ? (
              <HorizontalEdgeResizeHandle
                edgeHandleProps={edgeHandleProps}
                isDragging={isDragging}
                edge="leading"
                placement="outset"
              />
            ) : null}
            <div
              className={cn(
                'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
                isResizable && 'rounded-[inherit]', // ds-allow-radius: clip shell inherits the aside card radius
              )}
            >
              {renderable.node}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
