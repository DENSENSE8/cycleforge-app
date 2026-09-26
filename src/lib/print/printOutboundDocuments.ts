import { printHtmlInIframe } from '@/lib/print/iframePrint';

/** Combine shipping label + packing slip into ONE print job (docs/outbound-documents-plan.md Phase 2 — "Print Both"). */

export interface PrintableOutboundDocument {
  id: number;
  /** True → render via <embed type="application/pdf">; false → <img>. */
  isPdf: boolean;
}

function docPageHtml(doc: PrintableOutboundDocument): string {
  const src = `/api/documents/${doc.id}/content`;
  const body = doc.isPdf
    ? `<embed src="${src}" type="application/pdf" />`
    : `<img src="${src}" alt="" />`;
  return `<div class="doc-page">${body}</div>`;
}

export function buildOutboundDocumentsPrintHtml(docs: PrintableOutboundDocument[]): string {
  const pages = docs.map(docPageHtml).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Print documents</title>
<style>
  @page{margin:0}
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;width:100%;height:100%}
  .doc-page{width:100vw;height:100vh;page-break-after:always;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .doc-page:last-child{page-break-after:auto}
  .doc-page embed,.doc-page img{width:100%;height:100%;object-fit:contain}
</style></head><body>
${pages}
<script>
window.onload=function(){
  // PDFs render async inside <embed> — give the plugin a beat to paint before printing.
  setTimeout(function(){window.focus();window.print();},700);
};
window.onafterprint=function(){setTimeout(function(){window.close();},80);};
</script>
</body></html>`;
}

/** Print one or both outbound documents as a single combined job. No-op if `docs` is empty. */
export function printOutboundDocuments(docs: PrintableOutboundDocument[]): boolean {
  if (docs.length === 0) return false;
  const html = buildOutboundDocumentsPrintHtml(docs);
  return printHtmlInIframe(html, { name: 'Outbound documents', removeAfterMs: 90_000 });
}
