import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';

export type TestingView =
  | 'testing'
  | 'pairing'
  | 'checklist'
  | 'manuals'
  | 'ticket'
  | 'timeline';

export interface TestingTerminalInput {
  primaryLabel: string;
  primaryTitle: string;
  primaryDisabled: boolean;
  isPrinting: boolean;
  onPrimary: () => void | Promise<void>;
  /** Linked customer ticket rendered by the shared SupportContextHub. */
  ticketId?: number | null;
  /** Shared ticket composer bridge used by the station terminal dock. */
  ticketBridge?: ThreadComposerBridge | null;
  /** Failed testing with no ticket — dock becomes File claim. */
  claimFailedNoTicket?: boolean;
  onFileClaim?: () => void;
}
