import type { UseClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';

export type TestingView = 'testing' | 'pairing' | 'checklist' | 'manuals' | 'claim';

export interface TestingTerminalInput {
  primaryLabel: string;
  primaryTitle: string;
  primaryDisabled: boolean;
  isPrinting: boolean;
  onPrimary: () => void | Promise<void>;
  /** Linked Zendesk ticket id — when set on claim tab, dock becomes Send/Add note. */
  claimTicketId?: number | null;
  /** Failed testing with no ticket — dock becomes File claim. */
  claimFailedNoTicket?: boolean;
  claimReply?: UseClaimTicketReply | null;
  onFileClaim?: () => void;
}
