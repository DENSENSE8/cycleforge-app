'use client';

import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { cn } from '@/utils/_cn';
import type { IncomingIntakeKind } from '@/lib/inbound/incoming-intake';

const KINDS: readonly { id: IncomingIntakeKind; title: string; meta: string }[] = [
  { id: 'po', title: 'Purchase order', meta: 'Marketplace or vendor PO' },
  { id: 'return', title: 'Return', meta: 'Return + support ticket' },
];

export function IncomingAddKindRail({
  kind,
  onSelect,
  onClose,
  embedded = false,
}: {
  kind: IncomingIntakeKind;
  onSelect: (next: IncomingIntakeKind) => void;
  onClose?: () => void;
  embedded?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!embedded ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline px-4 py-2">
          <p className="min-w-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
            Add inbound
          </p>
          {onClose ? (
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel="Close add inbound"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={onClose}
            />
          ) : null}
        </div>
      ) : null}
      <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Inbound add kind">
        {KINDS.map((row) => {
          const selected = row.id === kind;
          return (
            <Button
              key={row.id}
              type="button"
              variant="ghost"
              data-testid={`incoming-add-kind-${row.id}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(row.id)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 border-b border-border-hairline px-4 py-3 text-left',
                selected ? 'bg-surface-sunken' : 'bg-surface-card hover:bg-surface-sunken/60',
              )}
            >
              <span className="text-role-caption font-semibold text-text-default">{row.title}</span>
              <span className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">
                {row.meta}
              </span>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
