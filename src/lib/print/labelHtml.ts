/**
 * HTML-escape a value for safe interpolation into label markup.
 *
 * Lives in its own dependency-free module (not `printLabel.ts`, its original
 * home) so face-model builders like `labelFace.ts` can escape text without
 * inheriting the print shell's bwip-js barcode engine (~250 KB gz) in their
 * client bundle. `printLabel.ts` re-exports it, so existing import sites keep
 * working.
 */
export function escapeLabelHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
