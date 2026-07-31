import { printHtmlInIframe } from '@/lib/print/iframePrint';
import { printOutboundDocuments } from '@/lib/print/printOutboundDocuments';

/**
 * Pack-bundle browser fallback (JIT Phase 2–3).
 * Manuals prefer `/api/documents/[id]/content` when promoted; else product-manuals proxy.
 * Outbound docs reuse printOutboundDocuments (document ids).
 */

export function printPackBundleFallback(
  items: Array<{
    kind?: string;
    documentId?: number;
    productManualId?: number;
    isPdf?: boolean;
  }>,
): boolean {
  const outbound = items.filter(
    (i) => i.kind !== 'manual' && Number(i.documentId) > 0,
  );
  const manuals = items.filter((i) => {
    if (i.kind !== 'manual') return false;
    return Number(i.documentId) > 0 || Number(i.productManualId) > 0;
  });

  let printed = false;
  if (outbound.length > 0) {
    printed =
      printOutboundDocuments(
        outbound.map((d) => ({
          id: Number(d.documentId),
          isPdf: d.isPdf !== false,
        })),
      ) || printed;
  }

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
