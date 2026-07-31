'use client';

/**
 * Row-aligned collapse affordance for the receiving context panel.
 *
 * Mounted as a **host sibling** (not inside the card) so it paints in the
 * canvas gutter above the workspace and is not clipped by the card shell.
 * Appears when the pointer is over a `[data-rail-row]` or this gutter strip at
 * that row's Y — click collapses the rail via the parent.
 *
 * The hit strip starts past {@link CONTEXT_PANEL_COLLAPSE.cueOutsetPx} so it
 * does not cover the trailing resize pill.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { ChevronLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CONTEXT_PANEL_COLLAPSE } from '@/components/sidebar/context-panel-column';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

function findRowAtClientY(panel: HTMLElement, clientY: number): DOMRect | null {
  const rows = panel.querySelectorAll<HTMLElement>('[data-rail-row]');
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return r;
  }
  return null;
}

type GutterBox = {
  left: number;
  top: number;
  height: number;
};

type CueLayout = GutterBox & { midY: number };

export function ContextPanelCollapseCue({
  panelRef,
  hostRef,
  onCollapse,
}: {
  panelRef: RefObject<HTMLElement | null>;
  hostRef: RefObject<HTMLElement | null>;
  onCollapse: () => void;
}) {
  const [gutter, setGutter] = useState<GutterBox | null>(null);
  const [midY, setMidY] = useState<number | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measureGutter = useCallback((): GutterBox | null => {
    const panel = panelRef.current;
    const host = hostRef.current;
    if (!panel || !host) return null;
    const hostRect = host.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      left: panelRect.right - hostRect.left + CONTEXT_PANEL_COLLAPSE.cueOutsetPx,
      top: panelRect.top - hostRect.top,
      height: panelRect.height,
    };
  }, [panelRef, hostRef]);

  const clearCue = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setMidY(null);
  }, []);

  const scheduleClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      setMidY(null);
    }, 120);
  }, []);

  const showAtClientY = useCallback(
    (clientY: number) => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      const panel = panelRef.current;
      const host = hostRef.current;
      if (!panel || !host) {
        setMidY(null);
        return;
      }
      const rowRect = findRowAtClientY(panel, clientY);
      const box = measureGutter();
      if (!rowRect || !box) {
        setMidY(null);
        return;
      }
      setGutter(box);
      // Host-relative vertical center of the hovered row.
      setMidY(rowRect.top - host.getBoundingClientRect().top + rowRect.height / 2);
    },
    [panelRef, hostRef, measureGutter],
  );

  // Keep the parked gutter strip aligned with the panel (resize / layout).
  useEffect(() => {
    const sync = () => setGutter(measureGutter());
    sync();
    const panel = panelRef.current;
    if (!panel) return;
    const ro = new ResizeObserver(sync);
    ro.observe(panel);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [panelRef, measureGutter]);

  useEffect(() => () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  }, []);

  // Row hover inside the card.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-rail-row]')) return;
      showAtClientY(e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-rail-row]')) {
        showAtClientY(e.clientY);
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      if (e.clientX >= panelRect.right - 4) return;
      scheduleClear();
    };

    const onPointerLeave = (e: PointerEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Element && next.closest('[data-context-panel-collapse-gutter]')) {
        return;
      }
      scheduleClear();
    };

    panel.addEventListener('pointerover', onPointerOver);
    panel.addEventListener('pointermove', onPointerMove);
    panel.addEventListener('pointerleave', onPointerLeave);
    return () => {
      panel.removeEventListener('pointerover', onPointerOver);
      panel.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [panelRef, showAtClientY, scheduleClear]);

  const visible = midY != null;
  const cue: CueLayout | null =
    gutter && midY != null
      ? { ...gutter, midY }
      : null;

  return (
    <div
      data-context-panel-collapse-gutter
      className="absolute z-raised"
      style={
        gutter
          ? {
              left: gutter.left,
              top: gutter.top,
              width: CONTEXT_PANEL_COLLAPSE.gutterHitPx,
              height: gutter.height,
            }
          : { left: 0, top: 0, width: 0, height: 0 }
      }
      onPointerMove={(e) => showAtClientY(e.clientY)}
      onPointerLeave={clearCue}
    >
      <div
        className={cn(
          'absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100',
          visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={cue ? { top: cue.midY - cue.top } : { top: 0 }}
      >
        <HoverTooltip label="Hide sidebar" asChild openDelayMs={400}>
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel="Hide sidebar"
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
            onClick={onCollapse}
            className="rounded-md bg-surface-card shadow-sm ring-1 ring-inset ring-border-soft"
            data-testid="context-panel-collapse"
          />
        </HoverTooltip>
      </div>
    </div>
  );
}
