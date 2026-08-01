'use client';

/**
 * My Day rail — the ranked personal work column (Do next · Assigned to me ·
 * Needs attention · Queues).
 *
 * Phase F0 of `docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`: lifted
 * verbatim out of `MyDayWorkspace` so the one rail can later be mounted beside
 * other surfaces instead of being welded to Home Today. **This pass changes no
 * behavior and no tokens** — same one-row anatomy, same `bg-blue-50` +
 * `ring-blue-400` selected state, same 380px column shell.
 *
 * Mounted on Home Today only. The Dashboard context-rail and Unbox
 * station-context mounts the plan calls for are deliberately NOT wired yet —
 * open question OQ1 (replace vs. compose the existing context panel) has no
 * operator answer, and shipping either shape would settle it by fait accompli.
 *
 * The rail owns display only: `data` comes from `useMyDayFeed` at the
 * composition root, and selection stays the caller's state.
 */

import { type ReactNode } from 'react';
import Link from 'next/link';
import { Inbox, Zap, AlertCircle, Layout } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { MyDayFeed, MyDaySelectedItem } from '@/lib/my-day/my-day-types';
import { workOrderHref } from '@/lib/my-day/my-day-href';
import { useMyDayOnboardingVisible } from './useMyDayOnboardingVisible';

function MyDayRow({
  title,
  subtitle,
  meta,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  meta: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col px-4 py-1.5 text-left transition-colors',
        selected
          ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
          : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-role-caption font-semibold text-gray-900">{title}</span>
        <span className="shrink-0 rounded bg-gray-50 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-widest text-gray-700 ring-1 ring-inset ring-gray-200">
          {meta}
        </span>
      </div>
      <span className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
        {subtitle}
      </span>
    </button>
  );
}

function SectionHeader({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-hairline bg-surface-card/95 px-4 py-2 backdrop-blur-sm">
      <span className="inline-flex items-center gap-1.5 text-role-eyebrow uppercase tracking-widest text-gray-500">
        {icon}
        {label}
      </span>
      {count != null && count > 0 ? (
        <span className="text-role-eyebrow uppercase tracking-widest text-gray-400 tabular-nums">
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function MyDayRail({
  data,
  selectedId,
  onSelect,
}: {
  data: MyDayFeed;
  selectedId: string | null;
  onSelect: (item: MyDaySelectedItem) => void;
}) {
  // Onboarding is already teaching the next action, so the "nothing assigned"
  // box would be a second, contradictory empty state. Read the same flag the
  // onboarding panel reads rather than threading it through as a prop.
  const onboardingVisible = useMyDayOnboardingVisible();

  const hasListContent =
    data.doNext != null ||
    data.assigned.length > 0 ||
    data.interrupts.length > 0 ||
    data.queueCards.length > 0;

  return (
    <div className="flex w-full max-w-md flex-col border-r border-border-soft bg-surface-card shadow-sm lg:w-[380px]">
      <div className="flex items-center justify-between border-b border-border-hairline px-4 py-3">
        <h1 className="inline-flex items-center gap-2 text-h3 font-semibold">
          <Inbox className="h-5 w-5 text-emerald-600" />
          My Day
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border-hairline">
        {data.doNext ? (
          <section>
            <SectionHeader icon={<Zap className="h-3.5 w-3.5" />} label="Do next" />
            <MyDayRow
              title={data.doNext.title}
              subtitle={data.doNext.subtitle}
              meta={data.doNext.queueLabel}
              selected={selectedId === data.doNext.id}
              onClick={() => onSelect({ kind: 'work_order', row: data.doNext! })}
            />
            <div className="border-t border-border-hairline px-4 py-2">
              <Link
                href={workOrderHref(data.doNext)}
                className="text-role-caption font-semibold text-emerald-700 hover:underline"
              >
                Start now →
              </Link>
            </div>
          </section>
        ) : null}

        {data.assigned.length > 0 ? (
          <section>
            <SectionHeader
              icon={<Inbox className="h-3.5 w-3.5" />}
              label="Assigned to me"
              count={data.assigned.length}
            />
            <div className="divide-y divide-border-hairline">
              {data.assigned.map((row) => (
                <MyDayRow
                  key={row.id}
                  title={row.title}
                  subtitle={row.subtitle}
                  meta={row.queueLabel}
                  selected={selectedId === row.id}
                  onClick={() => onSelect({ kind: 'work_order', row })}
                />
              ))}
            </div>
          </section>
        ) : null}

        {data.interrupts.length > 0 ? (
          <section>
            <SectionHeader
              icon={<AlertCircle className="h-3.5 w-3.5" />}
              label="Needs attention"
              count={data.interrupts.length}
            />
            <div className="divide-y divide-border-hairline">
              {data.interrupts.map((item) => (
                <MyDayRow
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  meta={item.kind === 'support_followup' ? 'Support' : 'Tech'}
                  selected={selectedId === item.id}
                  onClick={() => onSelect({ kind: 'interrupt', item })}
                />
              ))}
            </div>
          </section>
        ) : null}

        {data.queueCards.length > 0 ? (
          <section>
            <SectionHeader icon={<Layout className="h-3.5 w-3.5" />} label="Queues" />
            <div className="divide-y divide-border-hairline">
              {data.queueCards.map((card) => (
                <Link
                  key={card.key}
                  href={card.href}
                  className="flex items-center justify-between px-4 py-2 hover:bg-gray-50"
                >
                  <span className="text-role-caption font-semibold text-gray-900">{card.label}</span>
                  <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-widest text-gray-700 ring-1 ring-inset ring-gray-200 tabular-nums">
                    {card.count}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!hasListContent && !onboardingVisible ? (
          <div className="px-4 py-8">
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
              <p className="text-role-caption font-semibold text-gray-600">Nothing assigned right now.</p>
              <p className="mt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
                Open a queue or station when work arrives.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
