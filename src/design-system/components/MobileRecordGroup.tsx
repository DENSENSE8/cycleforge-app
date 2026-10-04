import type { ReactNode } from 'react';
import { RECORD_GROUP_TITLE_CLASS } from '@/design-system/components/record-ledger/RecordGroup';
import { cn } from '@/utils/_cn';

/** Flat V2 record group: the mobile counterpart of desktop RecordGroup. */
export const MOBILE_RECORD_GROUP_CLASS = 'bg-surface-card';
export const MOBILE_RECORD_GROUP_TITLE_CLASS = RECORD_GROUP_TITLE_CLASS;
export const MOBILE_RECORD_ROW_CLASS =
  'flex min-h-mode-hit items-center gap-3 px-mode-page py-2.5 text-role-data text-text-default';

/** Sentence-case record category with one uniform surface and one body rule. */
export function MobileRecordGroup({
  id,
  title,
  summary,
  children,
  className,
}: {
  id: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn(MOBILE_RECORD_GROUP_CLASS, className)}>
      <header className="flex min-h-mode-hit items-center gap-3 px-mode-page py-2">
        <h2 id={id} className={cn(MOBILE_RECORD_GROUP_TITLE_CLASS, 'flex-1')}>
          {title}
        </h2>
        {summary ? <div className="shrink-0 text-role-caption text-text-muted">{summary}</div> : null}
      </header>
      <div className="border-t border-border-soft">{children}</div>
    </section>
  );
}

/** Uniform label/value evidence rows within a MobileRecordGroup. */
export function MobileRecordFacts({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-border-soft">
      {children}
    </dl>
  );
}

export function MobileRecordFact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className={MOBILE_RECORD_ROW_CLASS}>
      <dt className="min-w-0 flex-1 text-role-caption text-text-muted">{label}</dt>
      <dd className={cn('shrink-0 text-right text-role-data font-semibold text-text-default', mono && 'font-mono')}>
        {value == null || value === '' ? '—' : value}
      </dd>
    </div>
  );
}
