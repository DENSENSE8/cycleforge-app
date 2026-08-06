import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';

/** Keep in sync with `threadKey` in TicketThreadCard — avoid a circular import. */
const receivingThreadKey = (ticketId: number) =>
  ['receiving', 'ticket-thread', ticketId] as const;

export interface UseClaimTicketReply {
  /** The reply text being composed. */
  body: string;
  setBody: (v: string) => void;
  /** false = internal note (default); true = public reply that emails the customer. */
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  /** CC emails for public replies. */
  ccs: string[];
  setCcs: (emails: string[]) => void;
  sending: boolean;
  /** POST the reply to the ticket as an internal note or public (emailed) reply. */
  send: () => Promise<void>;
}

interface Params {
  open: boolean;
  /** The filed/linked ticket's numeric id, or null until one exists. */
  ticketId: number | null;
}

/**
 * Owns the "reply on ticket" composer shown once a claim ticket exists. Posts to
 * the receiving-scoped thread route, which adds the comment via the Zendesk API.
 * Defaults to an INTERNAL note; flipping to public emails the requester
 * (customer). Reset whenever the modal opens or the ticket changes.
 */
export function useClaimTicketReply({ open, ticketId }: Params): UseClaimTicketReply {
  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(false); // internal-first by default
  const [ccs, setCcs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setBody('');
    setIsPublic(false);
    setCcs([]);
  }, [open, ticketId]);

  const send = async () => {
    const text = body.trim();
    if (sending || !ticketId || !text) return;
    setSending(true);
    try {
      const emailCcs = isPublic && ccs.length ? ccs : undefined;
      const res = await fetch('/api/receiving/zendesk-claim/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          body: text,
          public: isPublic,
          ...(emailCcs ? { emailCcs } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not post the reply');
        return;
      }
      toast.success(
        isPublic
          ? `Public reply sent — customer emailed${emailCcs ? ` · ${emailCcs.length} cc'd` : ''}`
          : 'Internal note added',
      );
      setBody('');
      setCcs([]);
      void queryClient.invalidateQueries({ queryKey: receivingThreadKey(ticketId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSending(false);
    }
  };

  return { body, setBody, isPublic, setIsPublic, ccs, setCcs, sending, send };
}
