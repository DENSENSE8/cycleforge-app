/**
 * Strip the PDF-viewer hash (`#toolbar=1`) so a fetch hits the network URL.
 * Hash fragments never leave the browser; leaving them on a `fetch()` src is
 * harmless, but splitting is the one place iframe `src` and `fetch` agree.
 */
export function documentNetworkUrl(src: string): string {
  return src.split('#')[0] || src;
}
