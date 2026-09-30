/**
 * Execute one print press over any mix of documents — shipping labels on 4×6
 * and paperwork (packing slips, manuals) on letter. Each stock takes its own
 * resolved {@link LabelPrintRoute}; documents print in the order given; one
 * that cannot be read or sent is reported and never stops the rest. Printed
 * ledger labels are then logged as one label batch and printed order
 * paperwork as one paperwork batch, each with the station it printed at.
 */
import { beginWork } from '@/lib/background-work/store';
import { printRawToProfile, type PaperSize } from '@/lib/print/browserPrint';
import type { DesktopPrintOptions } from '@/lib/print/desktop-print-host';
import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { createLabelCanvas, labelCanvasToRawCommands } from '@/lib/print/labelFaceBitmap';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { recordLabelPrintBatch, recordPaperworkPrintBatch } from './http-client';
import { rasterizeDocument, type LabelPages } from './label-raster';
import type { PaperworkPrintItem } from './contracts';
import type { LabelPrintRoute, PrintStock } from './print-route';

/** One printable thing on the desk. */
export interface DeskDocument {
  /** Stable per desk selection: `label:12`, `doc:88`, `manual:4`. */
  key: string;
  kind: 'label' | 'packing_slip' | 'manual';
  title: string;
  /** Same-origin bytes (PDF or image). */
  src: string;
  stock: PrintStock;
  /** Set for ledger labels — those print rows are logged. */
  ingestionId: number | null;
  /** The order the document belongs to; paperwork prints log per order. */
  orderId: number | null;
  /** Packing slip `documents.id`. */
  documentId: number | null;
  /** Manual `product_manuals.id`. */
  manualId: number | null;
}

/** The print station a press ran at (`readPrintStation()`), logged with each batch. */
export interface PrintStationRef {
  id: string;
  name: string;
}

export interface PrintOutcome {
  /** The route each stock in this press took. */
  routes: Partial<Record<PrintStock, LabelPrintRoute>>;
  printed: DeskDocument[];
  failed: Array<{ doc: DeskDocument; reason: string }>;
  /** Documents never sent because the press was cancelled part-way. */
  cancelled: DeskDocument[];
  /** Set when documents printed but a print log (labels or paperwork) could not be written. */
  logError: string | null;
}

const MICRONS_PER_INCH = 25_400;

/** One page per image, sized to the stock; `autoPrint` drives the browser dialog. */
function pagesHtml(pages: readonly string[], paper: PaperSize, autoPrint: boolean): string {
  const body = pages.map((src) => `<div class="page"><img src="${src}" alt="" /></div>`).join('\n');
  const script = autoPrint
    ? `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250);};</script>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Print</title>
<style>
  @page{size:${paper.widthIn}in ${paper.heightIn}in;margin:0}
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff}
  .page{width:${paper.widthIn}in;height:${paper.heightIn}in;overflow:hidden;break-after:page}
  .page:last-child{break-after:auto}
  .page img{display:block;width:100%;height:100%;object-fit:contain}
</style></head><body>
${body}
${script}
</body></html>`;
}

/** Decode a rastered page back onto a stock-sized canvas for the raw thermal path. */
async function pageCanvas(src: string, paper: PaperSize): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const { canvas, context, width, height } = createLabelCanvas(paper);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/** Send one document's pages silently; the refusal reason, or null. */
async function sendSilently(pages: LabelPages, route: LabelPrintRoute): Promise<string | null> {
  if (route.channel === 'THERMAL_USB' || route.channel === 'THERMAL_SERIAL') {
    for (const src of pages) {
      const commands = labelCanvasToRawCommands(await pageCanvas(src, route.paper), route.profile, route.paper);
      const sent = await printRawToProfile(commands, route.profile);
      if (!sent.success) return sent.reason ?? 'The thermal printer refused the job.';
    }
    return null;
  }
  if (route.channel === 'DESKTOP_HOST') {
    const options: DesktopPrintOptions = {
      deviceName: route.printerName,
      pageSize: { width: route.paper.widthIn * MICRONS_PER_INCH, height: route.paper.heightIn * MICRONS_PER_INCH },
      margins: { marginType: 'none' },
      copies: 1,
      color: route.paper.heightIn > 6,
      printBackground: true,
    };
    const sent = await route.host.printHtml(pagesHtml(pages, route.paper, false), options);
    return sent.success ? null : (sent.reason ?? 'The desktop app refused the job.');
  }
  return null;
}

export async function printDocuments(
  docs: readonly DeskDocument[],
  routeFor: (stock: PrintStock) => LabelPrintRoute,
  opts?: {
    onProgress?(done: number, total: number): void;
    station?: PrintStationRef | null;
    /** The header item's id — the station host keys it by request id so a sender's control finds it. */
    workId?: string;
  },
): Promise<PrintOutcome> {
  const printed: DeskDocument[] = [];
  const failed: PrintOutcome['failed'] = [];
  let cancelled: DeskDocument[] = [];
  // The browser dialog is ONE job per stock, sent after every page is rastered.
  const dialogPages: Partial<Record<PrintStock, string[]>> = {};
  const stocks = new Set(docs.map((doc) => doc.stock));
  const routes: PrintOutcome['routes'] = {};
  for (const stock of stocks) routes[stock] = routeFor(stock);
  // Silent documents go one at a time, so a pause or cancel lands between them; a dialog press is one job.
  const controllable = [...stocks].every((stock) => routes[stock]?.channel !== 'BROWSER_DIALOG');
  const work = beginWork({
    kind: 'print',
    label: stocks.size > 1 ? 'Labels & paperwork' : stocks.has('paper') ? 'Paperwork' : 'Labels',
    total: docs.length,
    id: opts?.workId,
    ...(controllable ? { controls: { pause: true, cancel: true } } : {}),
  });

  for (const [index, doc] of docs.entries()) {
    if (!(await work.checkpoint())) {
      cancelled = docs.slice(index);
      break;
    }
    const route = (routes[doc.stock] ??= routeFor(doc.stock));
    try {
      const pages = await rasterizeDocument(doc.src, route.paper);
      if (route.channel === 'BROWSER_DIALOG') {
        (dialogPages[doc.stock] ??= []).push(...pages);
        printed.push(doc);
      } else {
        const refused = await sendSilently(pages, route);
        if (refused) failed.push({ doc, reason: refused });
        else printed.push(doc);
      }
    } catch (error) {
      failed.push({ doc, reason: error instanceof Error ? error.message : String(error) });
    }
    work.progress(index + 1, docs.length);
    opts?.onProgress?.(index + 1, docs.length);
  }

  for (const [stock, pages] of Object.entries(dialogPages) as [PrintStock, string[]][]) {
    const route = routes[stock];
    if (route && pages.length > 0) {
      printHtmlInIframe(pagesHtml(pages, route.paper, true), { name: stock === 'label' ? 'Labels' : 'Paperwork', removeAfterMs: 5 * 60_000 });
    }
  }

  const station = opts?.station?.id ? { stationId: opts.station.id, stationName: opts.station.name.trim() || null } : {};
  const logs: Promise<unknown>[] = [];
  const labelRoute = routes.label;
  const ingestionIds = [...new Set(printed.flatMap((doc) => (doc.kind === 'label' && doc.ingestionId != null ? [doc.ingestionId] : [])))];
  if (labelRoute && ingestionIds.length > 0) {
    logs.push(recordLabelPrintBatch({ batchId: safeRandomUUID(), channel: labelRoute.channel, printerName: labelRoute.printerName, ...station, ingestionIds }));
  }
  const paperRoute = routes.paper;
  // One item per document per order: the same manual on two orders logs for each.
  const seen = new Set<string>();
  const items: PaperworkPrintItem[] = [];
  for (const doc of printed) {
    const dedupeKey = `${doc.orderId}:${doc.key}`;
    if (doc.orderId == null || seen.has(dedupeKey)) continue;
    if (doc.kind === 'packing_slip' && doc.documentId != null) items.push({ orderId: doc.orderId, kind: 'packing_slip', documentId: doc.documentId });
    else if (doc.kind === 'manual' && doc.manualId != null) items.push({ orderId: doc.orderId, kind: 'manual', manualId: doc.manualId });
    else continue;
    seen.add(dedupeKey);
  }
  if (paperRoute && items.length > 0) {
    logs.push(recordPaperworkPrintBatch({ batchId: safeRandomUUID(), channel: paperRoute.channel, printerName: paperRoute.printerName, ...station, items }));
  }
  const logFailures = (await Promise.allSettled(logs)).flatMap((result) =>
    result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : [],
  );
  if (cancelled.length > 0) work.cancelled(`Cancelled · ${printed.length} of ${docs.length} printed`);
  else if (failed.length > 0 && printed.length === 0) work.fail(`${failed.length} of ${docs.length} did not print — ${failed[0].reason}`);
  else work.finish(failed.length > 0 ? `${printed.length} printed, ${failed.length} failed` : `${printed.length} printed`);
  return { routes, printed, failed, cancelled, logError: logFailures.length > 0 ? logFailures.join(' ') : null };
}
