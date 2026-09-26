// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueKind =
  | 'all'
  | 'email_po'
  | 'unmatched_receiving'
  | 'station_exception'
  | 'checked';

export interface QueueRow {
  kind: Exclude<QueueKind, 'all' | 'checked'>;
  source_id: string;
  organization_id: string;
  product_title: string | null;
  serial_numbers: string | null;
  context: string | null;
  created_at: string;
  zendesk_ticket_id: string | null;
  zendesk_synced_at: string | null;
  usa_team_note: string | null;
  vietnam_team_note: string | null;
  follow_up_at: string | null;
  checked: boolean;
  checked_at: string | null;
}

interface PatchBody {
  zendesk_ticket_id?: string | null;
  usa_team_note?: string | null;
  vietnam_team_note?: string | null;
  checked?: boolean;
}

// Match the trailing " · PO:
const PO_SUFFIX_RE = / · PO:\s*(.+?)\s*$/;

function splitPoContext(context: string | null): {
  prefix: string;
  poNumbers: string[];
} {
  if (!context) return { prefix: '', poNumbers: [] };
  const match = context.match(PO_SUFFIX_RE);
  if (!match) return { prefix: context, poNumbers: [] };
  const prefix = context.slice(0, match.index).trim();
  const poNumbers = match[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { prefix, poNumbers };
}
