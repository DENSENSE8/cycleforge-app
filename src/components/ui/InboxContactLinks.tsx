'use client';

/**
 * The contacts a follow-up alert carries, painted compactly — one small tag
 * per contact (`customer@x.com · sales@ · Order 12345`, `Ticket #10022`), each
 * a door where the house has one (ticket / order / repair desk, `mailto:` for
 * an address, the carrier page for tracking). Owner 2026-09-30: the recipient
 * sees "the exact contacts linked". Mounted by the inbox's Alerts row, the
 * phone QuickAccess alerts and the alert composers' preview.
 */

import { inboxContactFace } from '@/lib/notifications/inbox-contacts';
import type { InboxContact } from '@/lib/notifications/types';
import { cn } from '@/utils/_cn';

export function InboxContactLinks({
  contacts,
  surface,
  className,
}: {
  contacts: readonly InboxContact[];
  surface: 'desk' | 'phone';
  className?: string;
}) {
  if (contacts.length === 0) return null;
  const tag = 'max-w-full truncate rounded-md bg-surface-sunken px-1.5 py-px text-text-default';
  return (
    <span
      className={cn('flex min-w-0 flex-wrap items-center gap-1 text-role-micro', className)}
      data-testid="inbox-contacts"
    >
      {contacts.map((contact) => {
        const face = inboxContactFace(contact, surface);
        return face.href ? (
          <a
            key={face.key}
            href={face.href}
            // A mail client opens in place; a carrier page in a new tab.
            {...(face.external && !face.href.startsWith('mailto:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={(event) => event.stopPropagation()}
            className={cn(tag, 'pointer-events-auto hover:bg-surface-hover hover:underline')}
            data-inbox-contact={contact.kind}
          >
            {face.text}
          </a>
        ) : (
          <span key={face.key} className={tag} data-inbox-contact={contact.kind}>
            {face.text}
          </span>
        );
      })}
    </span>
  );
}
