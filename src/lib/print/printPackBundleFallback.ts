import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { printOutboundDocuments, type PrintableOutboundDocument } from '@/lib/print/printOutboundDocuments';

/**
 * Pack-bundle browser fallback (JIT Phase 2–3).
 * Manuals prefer `/api/documents/[id]/content` when promoted; else product-manuals proxy.
 * Labels + slip print in ONE dialog: documents by id, paired labels (no documents
 * row yet) by the `src` the server sent.
 */

export function printPackBundleFallback(
  items: Array<{
    kind?: string;
    documentId?: number;
    productManualId?: number;
    src?: string;
    isPdf?: boolean;
  }>,
): boolean {
  const papers: PrintableOutboundDocument[] = [];
  for (const item of items) {
    if (item.kind === 'manual') continue;
    if (item.kind === 'label_ingestion') {
      if (item.src?.startsWith('/') && !item.src.startsWith('//')) papers.push({ src: item.src, isPdf: true });
    } else if (Number(item.documentId) > 0) {
      papers.push({ id: Number(item.documentId), isPdf: item.isPdf !== false });
    }
  }
  const manuals = items.filter((i) => {
    if (i.kind !== 'manual') return false;
    return Number(i.documentId) > 0 || Number(i.productManualId) > 0;
  });

  const printed = printOutboundDocuments(papers);
  if (manuals.length === 0) return printed;

  const pages = manuals
    .map((m) => {
      const src =
        Number(m.documentId) > 0
          ? `/api/documents/${Number(m.documentId)}/content`
          : `/api/product-manuals/${Number(m.productManualId)}/content`;
      return `<div class="doc-page"><embed src="${src}" type="application/pdf" /></div>`;
    })
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Print manuals</title>
<style>
  @page{margin:0}
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;width:100%;height:100%}
  .doc-page{width:100vw;height:100vh;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .doc-page:last-child{page-break-after:auto}
  .doc-page embed{width:100%;height:100%;object-fit:contain}
</style></head><body>
${pages}
<script>
window.onload=function(){
  setTimeout(function(){window.focus();window.print();},700);
};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;

  return (
    printHtmlInIframe(html, { name: 'Product manuals', removeAfterMs: 90_000 }) ||
    printed
  );
}
