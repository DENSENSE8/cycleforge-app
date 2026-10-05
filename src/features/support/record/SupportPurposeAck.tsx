'use client';

/**
 * "Customer or internal?" — an inline prompt, shown only while the item is
 * unclassified (the staffer must answer before anything drafts for or sends
 * to a customer). A suggestion (and its reason) is a hint, never preselected.
 */

import { Button } from '@/design-system/primitives/Button';
import type { SupportItemView } from '@/lib/support/conversation/model';
import { toast } from '@/lib/toast';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';

const CHOICE_LABEL = { customer_conversation: 'Customer', internal_record: 'Internal record' } as const;

export function SupportPurposeAck({ item }: { item: Pick<SupportItemView, 'id' | 'purposeSuggestion' | 'purposeSuggestionReason'> }) {
  const { setPurpose } = useSupportItemActions(item.id);
  const choose = (purpose: keyof typeof CHOICE_LABEL) => setPurpose.mutate(purpose, { onError: (err) => toast.error(err.message) });
  const pending = setPurpose.isPending ? setPurpose.variables : null;

  return (
    <div role="group" aria-label="Customer or internal?" className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="support-purpose">
      <span className="text-role-data font-semibold text-text-warning">Customer or internal?</span>
      {item.purposeSuggestion ? (
        <span className="text-role-caption text-text-muted" data-testid="support-purpose-suggestion">
          Suggested: {CHOICE_LABEL[item.purposeSuggestion]}
          {item.purposeSuggestionReason ? ` — ${item.purposeSuggestionReason}` : ''}
        </span>
      ) : null}
      <span className="ml-auto flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={pending === 'customer_conversation'}
          disabled={setPurpose.isPending}
          onClick={() => choose('customer_conversation')}
          data-testid="support-purpose-customer"
        >
          Customer
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={pending === 'internal_record'}
          disabled={setPurpose.isPending}
          onClick={() => choose('internal_record')}
          data-testid="support-purpose-internal"
        >
          Internal record
        </Button>
      </span>
    </div>
  );
}
