'use client';

import type { ReactNode } from 'react';

/** Shared "rail row" anatomy primitive — one row, one skeleton, one size. */

export interface RailRowVM {
  /** Optional line above the title (e.g. "#8101 · eBay · assignee"). Bring your own span colors. */
  eyebrow?: ReactNode;
  /** Right-aligned affordance on the eyebrow line (e.g. a hover chevron). */
  eyebrowTrailing?: ReactNode;
  /** Primary anchor line. Truncates to one line. */
  title: ReactNode;
  /** Native tooltip for the (truncated) title. */
  titleAttr?: string;
  /** Inline node directly after the title (e.g. a PKG chip). */
  titleAccessory?: ReactNode;
  /** Secondary line, left-aligned. The adapter owns its own truncation/emphasis. */
  meta?: ReactNode;
  /** Right-aligned chips on the meta line (e.g. condition + quantity). */
  metaTrailing?: ReactNode;
}

export function RailRowBody({
  vm,
  className,
}: {
  vm: RailRowVM;
  className?: string;
}) {
  const hasEyebrow = vm.eyebrow != null || vm.eyebrowTrailing != null;
  const hasMeta = vm.meta != null || vm.metaTrailing != null;

  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      {hasEyebrow ? (
        <div className="flex items-center justify-between gap-2 text-role-eyebrow text-text-soft">
          <div className="flex min-w-0 items-center gap-1.5">{vm.eyebrow}</div>
          {vm.eyebrowTrailing != null ? <div className="shrink-0">{vm.eyebrowTrailing}</div> : null}
        </div>
      ) : null}

      {/* Title line — the anchor. Render identical content regardless of
          selection (selection is a pure ring on the host frame); any size shift
          here would jostle neighbours. */}
      <div className={`flex min-w-0 items-center gap-1.5 ${hasEyebrow ? 'mt-0.5' : ''}`}>
        {/* ds-allow-title: truncation tooltip on a non-interactive CSS-clipped (`truncate`) title line */}
        <p className="truncate text-role-caption font-semibold text-text-default" title={vm.titleAttr}>
          {vm.title}
        </p>
        {vm.titleAccessory}
      </div>

      {hasMeta ? (
        <div className="flex items-center gap-1.5 text-role-micro">
          {vm.meta != null ? <div className="min-w-0 flex-1">{vm.meta}</div> : <span className="flex-1" />}
          {vm.metaTrailing != null ? (
            <div className="ml-auto flex shrink-0 items-center gap-1">{vm.metaTrailing}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
