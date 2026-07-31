/**
 * PrintNode PDF dispatch for outbound documents (JIT pack Phase 1).
 * contentType pdf_base64 — separate from ZPL /api/print/dispatch label classes.
 */

export interface OutboundPrintNodeResult {
  ok: boolean;
  dispatched: boolean;
  jobId?: number;
  error?: string;
  reason?: 'NO_API_KEY' | 'HTTP_ERROR' | 'THREW';
}

export async function dispatchPrintNodePdf(input: {
  printerExternalId: string;
  title: string;
  pdfBase64: string;
  source?: string;
}): Promise<OutboundPrintNodeResult> {
  const apiKey = process.env.PRINTNODE_API_KEY;
  if (!apiKey) {
    return { ok: false, dispatched: false, reason: 'NO_API_KEY', error: 'PRINTNODE_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.printnode.com/printjobs', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerId: Number(input.printerExternalId),
        title: input.title,
        contentType: 'pdf_base64',
        content: input.pdfBase64,
        source: input.source ?? 'cycleforge.outbound',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        dispatched: false,
        reason: 'HTTP_ERROR',
        error: `PrintNode ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const jobId = Number(await res.json());
    return {
      ok: true,
      dispatched: true,
      jobId: Number.isFinite(jobId) ? jobId : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      dispatched: false,
      reason: 'THREW',
      error: err instanceof Error ? err.message : 'PrintNode dispatch threw',
    };
  }
}
