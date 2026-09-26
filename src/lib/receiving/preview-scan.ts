/** Unbox PREVIEW resolution — read-only lookup for the scan bar's Preview stance. */

import { extractCanonicalTracking } from '@/lib/tracking-format';
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';

/** Scan vocabulary the Unbox bar can arm. `auto` = let the ladder decide. */
export type UnboxPreviewMode = 'ticket' | 'tracking' | 'order' | 'auto';

/** Which typed identity the face leads with — drives the CopyChip family. */
export type UnboxPreviewIdKind = 'tracking' | 'po' | 'ticket' | 'carton';

export interface UnboxPreviewHit {
  receivingId: number;
  idKind: UnboxPreviewIdKind;
  /** FULL identifier — the chip renders last-8 and copies this. */
  idValue: string;
  poNumber: string | null;
  ticketNumber: string | null;
  /** Least-advanced line status = the carton's honest position. */
  status: string | null;
  lineCount: number;
  unitCount: number;
  /** First line's item name, for the one-line face. */
  title: string | null;
  sourcePlatform: string | null;
  /** Already opened on a bench — preview must not restamp it. */
  openedAt: string | null;
}

export interface UnboxPreviewResult {
  matched: boolean;
  /** The vocabulary the ladder actually used (never `auto` on the way out). */
  resolvedMode: Exclude<UnboxPreviewMode, 'auto'>;
  value: string;
  hit: UnboxPreviewHit | null;
}

export interface PreviewSummaryRow {
  id: number;
  po_number: string | null;
  zendesk_ticket: string | null;
  source_platform: string | null;
  opened_at: string | null;
  line_count: number | string | null;
  unit_count: number | string | null;
  title: string | null;
  status: string | null;
}

export interface PreviewScanDeps {
  loadSummary: (orgId: string, receivingId: number) => Promise<PreviewSummaryRow | null>;
  resolveTracking: (value: string, orgId: string) => Promise<number | null>;
  resolveTicket: (orgId: string, value: string) => Promise<number | null>;
  resolvePo: (orgId: string, value: string) => Promise<number | null>;
}

function toCount(raw: number | string | null): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve the ladder for `auto`. Mirrors `classifyUnboxScan`'s hint vocabulary
 * on the client, but the server is the one that actually tries each table — an
 * un-armed preview must deep-scan the same three the real scan would.
 */
function ladderFor(mode: UnboxPreviewMode, value: string): Array<Exclude<UnboxPreviewMode, 'auto'>> {
  if (mode !== 'auto') return [mode];
  return looksLikeTicketScan(value)
    ? ['ticket', 'tracking', 'order']
    : ['tracking', 'order', 'ticket'];
}

export async function previewUnboxScan(
  orgId: string,
  rawValue: string,
  mode: UnboxPreviewMode = 'auto',
  deps: PreviewScanDeps,
): Promise<UnboxPreviewResult> {
  const value = rawValue.trim();
  const ladder = ladderFor(mode, value);
  const miss = (): UnboxPreviewResult => ({
    matched: false,
    resolvedMode: ladder[0],
    value,
    hit: null,
  });
  if (!value) return miss();

  for (const step of ladder) {
    const receivingId =
      step === 'ticket'
        ? await deps.resolveTicket(orgId, value)
        : step === 'order'
          ? await deps.resolvePo(orgId, value)
          : await deps.resolveTracking(value, orgId);
    if (receivingId == null) continue;

    const row = await deps.loadSummary(orgId, receivingId);
    if (!row) continue;

    // The face leads with the identity the operator actually presented, so a
    // ticket scan does not come back wearing a PO chip.
    const idValue =
      step === 'tracking'
        ? extractCanonicalTracking(value) || value
        : step === 'order'
          ? (row.po_number ?? value)
          : value;

    return {
      matched: true,
      resolvedMode: step,
      value,
      hit: {
        receivingId,
        idKind: step === 'order' ? 'po' : step,
        idValue,
        poNumber: row.po_number,
        ticketNumber: row.zendesk_ticket,
        status: row.status,
        lineCount: toCount(row.line_count),
        unitCount: toCount(row.unit_count),
        title: row.title,
        sourcePlatform: row.source_platform,
        openedAt: row.opened_at,
      },
    };
  }

  return miss();
}
