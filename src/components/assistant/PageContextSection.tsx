'use client';

/**
 * PageContextSection — exact working-set readout the assistant sends with each
 * turn (page, station, mode, selection) plus the live route and query. Read-only.
 */

import type { ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Layers } from '@/components/Icons';
import { useActiveAssistantContext } from '@/hooks/useAssistantContext';

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-canvas px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-hairline">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-0.5">
      <dt className="text-role-micro font-semibold uppercase tracking-widest text-text-faint">
        {label}
      </dt>
      <dd className="min-w-0 break-all font-mono text-role-micro text-text-default">{value}</dd>
    </div>
  );
}

function pathPageLabel(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return 'Home';
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

export function PageContextSection({
  variant = 'chips',
}: {
  variant?: 'chips' | 'working-set';
} = {}) {
  const ctx = useActiveAssistantContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageLabel = ctx?.page ?? pathPageLabel(pathname);
  const query = searchParams.toString();
  const skill = ctx?.skill?.trim() ?? '';

  if (variant === 'working-set') {
    return (
      <div className="px-3 py-2" data-testid="composer-ask-working-set">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">This page</p>
        <dl className="mt-1.5">
          <Fact label="route" value={pathname || '/'} />
          <Fact label="query" value={query || '—'} />
          <Fact label="page" value={ctx?.page ?? pageLabel} />
          <Fact label="station" value={ctx?.station?.trim() || '—'} />
          <Fact label="mode" value={ctx?.mode?.trim() || '—'} />
          <Fact
            label="selection"
            value={
              ctx?.selection
                ? `${ctx.selection.kind} · ${String(ctx.selection.id)}`
                : '—'
            }
          />
          <Fact
            label="skill"
            value={skill ? `${skill.length} chars loaded` : '—'}
          />
        </dl>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">This page</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
          <Layers className="h-3 w-3" /> {pageLabel}
        </span>
        {ctx?.station ? <Chip>{ctx.station}</Chip> : null}
        {ctx?.mode ? <Chip>{ctx.mode}</Chip> : null}
        {ctx?.selection ? (
          <Chip>
            {ctx.selection.kind} · {String(ctx.selection.id)}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}
