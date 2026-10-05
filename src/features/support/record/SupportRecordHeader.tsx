'use client';

/**
 * The Support item's identity line in the record header (DeskRecordPlane
 * `subtitle`): the LOCAL number first ("Support #12"; a provider number is
 * quiet metadata after it), Customer / Internal / Unclassified, the exact
 * order it is about, the platform and account (the account only when it is
 * not the platform's own name), the customer through the ONE contact face
 * (never a relay address), the owners, and the states that need someone.
 * It paints from the list row at once and from the bundle once read.
 */

import { Package } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { SUPPORT_CHANNEL_LABEL, type SupportPurpose } from '@/lib/support/conversation/model';
import { supportContactLine } from '@/lib/support/contact-face';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { supportOrdersHref } from '@/lib/support/order-support-routes';
import { SupportChip } from '@/components/ui/SupportChip';
import { SUPPORT_PURPOSE_LABEL, supportHeaderFlags, type SupportChipTone } from '@/lib/support/record/support-record-model';
import { useSupportItem } from '@/lib/support/record/use-support-item';

const PURPOSE_TONE: Readonly<Record<SupportPurpose, SupportChipTone>> = {
  customer_conversation: 'default',
  internal_record: 'secondary',
  unclassified: 'warning',
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function SupportRecordHeader({ itemId, row, nowMs: _nowMs }: { itemId: number; row?: SupportListRow | null; nowMs: number }) {
  const { data } = useSupportItem(itemId);
  const item = data?.item ?? null;
  const fallback = row && row.itemId === itemId ? row : null;

  const purpose = item?.purpose ?? fallback?.purpose ?? null;
  const platform = item ? (item.platform?.label ?? null) : (fallback?.platform?.label ?? null);
  const account = item ? item.accountLabel : (fallback?.account?.label ?? null);
  const accountText = account && !same(account, platform) ? account : null;
  const order = item?.primaryOrder
    ? { orderId: item.primaryOrder.orderId, orderNumber: item.primaryOrder.orderNumber, platformLabel: item.primaryOrder.platform }
    : (fallback?.primaryOrder ?? null);
  const orderPlatform =
    order?.platformLabel && !same(order.platformLabel, platform) && !same(order.platformLabel, account) ? order.platformLabel : null;
  const contact = item
    ? supportContactLine(item.requester)
    : fallback?.contact.label
      ? fallback.contact.detail
        ? `${fallback.contact.label} · ${fallback.contact.detail}`
        : fallback.contact.label
      : null;
  const owners = item ? (item.task?.assignees ?? []) : (fallback?.assignees ?? []);
  const flags = item?.flags ?? fallback?.flags ?? null;
  const providerNumber = item ? item.externalTicketId : (fallback?.externalTicketId ?? null);
  const channel = item?.channel ?? fallback?.transport ?? null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-role-caption text-text-muted" data-testid="support-record-header">
      <span className="font-semibold tabular-nums text-text-default" data-testid="support-item-number">
        Support #{itemId}
      </span>
      {providerNumber && channel ? (
        <span className="tabular-nums">
          {SUPPORT_CHANNEL_LABEL[channel]} #{providerNumber}
        </span>
      ) : null}
      {purpose ? <SupportChip tone={PURPOSE_TONE[purpose]} label={SUPPORT_PURPOSE_LABEL[purpose]} testId="support-purpose-state" /> : null}
      {platform || accountText ? (
        <span data-testid="support-platform-account">{[platform, accountText].filter(Boolean).join(' · ')}</span>
      ) : null}
      {order ? (
        <Button
          variant="ghost"
          size="sm"
          radius="pill"
          href={supportOrdersHref(order.orderId)}
          icon={<Package aria-hidden />}
          className="h-6 px-2 font-semibold text-text-info"
          data-testid="support-primary-order"
        >
          {order.orderNumber ? `#${order.orderNumber}` : `Order ${order.orderId}`}
          {orderPlatform ? ` · ${orderPlatform}` : ''}
        </Button>
      ) : null}
      {contact ? (
        <span className="text-text-default" data-testid="support-contact">
          {contact}
        </span>
      ) : null}
      {owners.length > 0 ? <span>{owners.map((owner) => owner.name.split(' ')[0]).join(', ')}</span> : null}
      {flags
        ? supportHeaderFlags(flags).map((f) => (
            <SupportChip key={f.flag} tone={f.tone} label={f.label} testId={`support-flag-${f.flag}`} />
          ))
        : null}
    </span>
  );
}
