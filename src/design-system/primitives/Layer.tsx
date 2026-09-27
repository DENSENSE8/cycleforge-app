'use client';

import {
  useEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/_cn';
import { zIndex, type ZIndexToken } from '@/design-system/tokens/z-index';

// ─── Layer ───────────────────────────────────────────────────────────────────

interface LayerProps extends HTMLAttributes<HTMLDivElement> {
  /** Stacking band token from the scale (e.g. 'modal', 'panelPopover', 'toast'). */
  level: ZIndexToken;
  /** Render through a portal to <body>. */
  portal?: boolean;
  /** Offset from the band (e.g. +1 for a panel that must sit over its backdrop). */
  offset?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Resolve a scale token to its numeric z-index — for inline styles, Motion
 * `animate`, canvas, or any non-className context.
 */
function useZIndex(level: ZIndexToken, offset = 0): number {
  return zIndex[level] + offset;
}

export function Layer({
  level,
  portal = true,
  offset = 0,
  className,
  style,
  children,
  ...rest
}: LayerProps) {
  // Only mount the portal target on the client (App Router SSR safety).
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.body);
  }, []);

  const node = (
    <div className={cn(className)} style={{ zIndex: zIndex[level] + offset, ...style }} {...rest}>
      {children}
    </div>
  );

  if (!portal) return node;
  if (!target) return null;
  return createPortal(node, target);
}
