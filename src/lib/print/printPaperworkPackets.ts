/** Print order paperwork from the desk when the packer print station is down — one order (the Labels walk's Print all) or many (the orders… */

import { loadPdfjs } from '@/lib/manuals/pdfThumbnail';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { PaperworkPacket, PaperworkPacketItem } from '@/lib/documents/paperwork-packet';

/** One request's cap — mirrors `PAPERWORK_PACKET_MAX_ORDERS` on the server. */
const MAX_ORDERS_PER_REQUEST = 100;
/** Render width for a PDF page: ~150 dpi across a letter page. */
const PAGE_RENDER_WIDTH_PX = 1275;
const JPEG_QUALITY = 0.9;

export interface PaperworkPrintOutcome {
  /** Orders that contributed at least one printed page. */
  ordersPrinted: number;
  pages: number;
  /** Orders with nothing on file to print. */
  emptyOrderIds: number[];
  /** Documents that could not be fetched or rendered. */
  failed: Array<{ orderId: number; name: string | null; reason: string }>;
}

async function requestPackets(orderIds: readonly number[]): Promise<PaperworkPacket[]> {
  const packets: PaperworkPacket[] = [];
  for (let i = 0; i < orderIds.length; i += MAX_ORDERS_PER_REQUEST) {
    const chunk = orderIds.slice(i, i + MAX_ORDERS_PER_REQUEST);
    const res = await fetch('/api/orders/print-packet', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: chunk, batchId: safeRandomUUID() }),
    });
    const data = (await res.json().catch(() => ({}))) as { packets?: PaperworkPacket[]; error?: string };
    if (!res.ok || !Array.isArray(data.packets)) {
      throw new Error(data.error || 'Could not load the paperwork to print.');
    }
    packets.push(...data.packets);
  }
  return packets;
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

async function renderPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, PAGE_RENDER_WIDTH_PX / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d canvas');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdfjs typings drift between majors (`canvasContext` vs `canvas`).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      page.cleanup();
      pages.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    }
  } finally {
    task.destroy().catch(() => {});
  }
  return pages;
}

async function renderItem(item: PaperworkPacketItem): Promise<string[]> {
  const res = await fetch(item.src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (isPdfBytes(bytes) || blob.type.includes('pdf')) {
    return renderPdfPages(new Uint8Array(await blob.arrayBuffer()));
  }
  if (blob.type.startsWith('image/')) return [await blobToDataUrl(blob)];
  throw new Error(`cannot print ${blob.type || 'this file type'}`);
}

/** The print document: one full-bleed page per rendered page, then print. */
export function buildPaperworkPrintHtml(pages: readonly string[]): string {
  const body = pages.map((src) => `<div class="page"><img src="${src}" alt="" /></div>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Print paperwork</title>
<style>
  @page{margin:0}
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  .page{width:100vw;height:100vh;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .page:last-child{page-break-after:auto}
  .page img{max-width:100%;max-height:100%;object-fit:contain}
</style></head><body>
${body}
<script>
window.onload=function(){setTimeout(function(){window.focus();window.print();},300);};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;
}

/**
 * Fetch, render and print the paperwork for `orderIds` in one dialog.
 * Resolves with what printed and what could not — the caller tells the
 * operator. Throws only when the packet itself could not be loaded.
 */
export async function printPaperworkPackets(orderIds: readonly number[]): Promise<PaperworkPrintOutcome> {
  const ids = [...new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0))];
  const packets = await requestPackets(ids);

  const pages: string[] = [];
  const failed: PaperworkPrintOutcome['failed'] = [];
  const emptyOrderIds: number[] = [];
  let ordersPrinted = 0;

  for (const packet of packets) {
    if (packet.items.length === 0) {
      emptyOrderIds.push(packet.orderId);
      continue;
    }
    let printedAny = false;
    for (const item of packet.items) {
      try {
        const rendered = await renderItem(item);
        pages.push(...rendered);
        if (rendered.length > 0) printedAny = true;
      } catch (error) {
        failed.push({
          orderId: packet.orderId,
          name: item.name,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (printedAny) ordersPrinted += 1;
  }

  if (pages.length > 0) {
    printHtmlInIframe(buildPaperworkPrintHtml(pages), {
      name: 'Order paperwork',
      removeAfterMs: 5 * 60_000,
    });
  }
  return { ordersPrinted, pages: pages.length, emptyOrderIds, failed };
}

/** One toast line for an outcome — shared by every door so they agree. */
export function describePaperworkPrint(outcome: PaperworkPrintOutcome): { ok: boolean; message: string } {
  if (outcome.pages === 0) {
    return {
      ok: false,
      message: outcome.failed.length > 0
        ? `Nothing printed — ${outcome.failed.length} document${outcome.failed.length === 1 ? '' : 's'} could not be read`
        : 'Nothing to print — no label, slip or manual on file',
    };
  }
  const parts = [
    `Printing ${outcome.pages} page${outcome.pages === 1 ? '' : 's'} for ${outcome.ordersPrinted} order${outcome.ordersPrinted === 1 ? '' : 's'}`,
  ];
  if (outcome.emptyOrderIds.length > 0) parts.push(`${outcome.emptyOrderIds.length} had no paperwork`);
  if (outcome.failed.length > 0) parts.push(`${outcome.failed.length} document${outcome.failed.length === 1 ? '' : 's'} could not be read`);
  return { ok: outcome.failed.length === 0, message: parts.join(' · ') };
}
