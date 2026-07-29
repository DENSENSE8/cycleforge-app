import Link from 'next/link';
import {
  Boxes,
  Inbox,
  Layers,
  MessageSquare,
  Monitor,
  Search,
} from '@/components/Icons';
import type { ParkedSurfaceKey } from '@/lib/dogfood/parked-surfaces';
import { getParkedSurfaceMeta } from '@/lib/dogfood/parked-surfaces';

export const PARKED_SURFACE_ICONS: Record<
  ParkedSurfaceKey,
  (props: { className?: string }) => JSX.Element
> = {
  home: Inbox,
  operations: Monitor,
  sourcing: Search,
  fba: Boxes,
  studio: Layers,
  'ai-chat': MessageSquare,
};

export interface ParkedSurfaceProps {
  surface: ParkedSurfaceKey;
  className?: string;
  /**
   * `page` — full main-pane stand-in (default).
   * `sidebar` — compact context rail under MasterNav.
   */
  variant?: 'page' | 'sidebar';
}

/**
 * Friendly “work in progress” stand-in when someone lands on a surface that
 * isn’t ready yet. Used for main content and the shell sidebar so the real
 * workspace never mounts while the surface is locked.
 */
export function ParkedSurface({
  surface,
  className = '',
  variant = 'page',
}: ParkedSurfaceProps) {
  const meta = getParkedSurfaceMeta(surface);
  const Icon = PARKED_SURFACE_ICONS[surface];
  const isSidebar = variant === 'sidebar';

  return (
    <div
      className={
        isSidebar
          ? `flex h-full min-h-0 w-full flex-col px-3 py-4 ${className}`
          : `flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center bg-surface-canvas px-4 py-10 ${className}`
      }
      data-parked-surface={surface}
      data-parked-variant={variant}
      role="status"
      aria-live="polite"
    >
      <div
        className={
          isSidebar
            ? 'space-y-3 rounded-xl border border-dashed border-border-soft bg-surface-canvas px-3 py-4 text-left'
            : 'w-full max-w-md space-y-4 rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-8 text-center'
        }
      >
        <div
          className={
            isSidebar
              ? 'flex h-9 w-9 items-center justify-center rounded-full bg-surface-card ring-1 ring-inset ring-border-soft'
              : 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-card ring-1 ring-inset ring-border-soft'
          }
        >
          <Icon className={isSidebar ? 'h-4 w-4 text-text-soft' : 'h-5 w-5 text-text-soft'} aria-hidden />
        </div>

        <div className="space-y-1.5">
          <p className="text-role-eyebrow uppercase tracking-widest text-amber-700">
            Work in progress
          </p>
          {!isSidebar ? (
            <h1 className="text-lg font-semibold text-text-default">{meta.label}</h1>
          ) : (
            <h2 className="text-role-caption font-semibold text-text-default">{meta.label}</h2>
          )}
          <p className={isSidebar ? 'text-xs font-medium text-text-muted' : 'text-sm font-medium text-text-muted'}>
            {meta.blurb}
          </p>
        </div>

        <div
          className={
            isSidebar
              ? 'flex flex-col gap-1.5 pt-0.5'
              : 'flex flex-col items-stretch gap-2 pt-1 sm:flex-row sm:justify-center'
          }
        >
          <Link
            href={meta.primaryCta.href}
            className={
              isSidebar
                ? 'inline-flex items-center justify-center rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500'
                : 'inline-flex items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500'
            }
          >
            {meta.primaryCta.label}
          </Link>
          {meta.secondaryCta ? (
            <Link
              href={meta.secondaryCta.href}
              className={
                isSidebar
                  ? 'inline-flex items-center justify-center rounded-lg bg-surface-card px-2.5 py-1.5 text-xs font-semibold text-text-default ring-1 ring-inset ring-border-soft hover:bg-surface-canvas'
                  : 'inline-flex items-center justify-center rounded-lg bg-surface-card px-3.5 py-2 text-sm font-semibold text-text-default ring-1 ring-inset ring-border-soft hover:bg-surface-canvas'
              }
            >
              {meta.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}