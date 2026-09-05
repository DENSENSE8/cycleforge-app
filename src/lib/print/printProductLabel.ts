import { getProfileForRole, printRawToProfile, resolvePaperSize } from '@/lib/print/browserPrint';
import {
  printHtmlInIframe,
  reserveLegacyPrintPopup,
} from '@/lib/print/iframePrint';
import { isSilentPrintEnabled } from '@/lib/print/printMode';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  productLabelFace,
  type PrintProductLabelInput,
} from '@/lib/print/unitLabelCore';

export {
  buildUnitPayload,
  unitLabelToFace,
  type PrintProductLabelInput,
} from '@/lib/print/unitLabelCore';

const PRODUCT_LABEL_SIZE = resolvePaperSize('2x1');

const COLOR_WORDS = [
  'space gray',
  'space grey',
  'rose gold',
  'starlight',
  'midnight',
  'graphite',
  'champagne',
  'platinum',
  'silver',
  'black',
  'white',
  'titanium',
  'purple',
  'yellow',
  'orange',
  'green',
  'beige',
  'brown',
  'coral',
  'gold',
  'gray',
  'grey',
  'blue',
  'pink',
  'red',
  'tan',
];

export function deriveColorFromTitle(title: string | null | undefined): string {
  const t = String(title ?? '').toLowerCase();
  if (!t) return '';
  for (const word of COLOR_WORDS) {
    if (t.includes(word)) {
      return word.replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }
  return '';
}

export function resolveTestingLineTitle(
  row: Pick<ReceivingLineRow, 'zoho_item_title' | 'catalog_product_title' | 'item_name'>,
): string {
  return (
    (row.zoho_item_title ?? '').trim() ||
    (row.catalog_product_title ?? '').trim() ||
    (row.item_name ?? '').trim()
  );
}

/**
 * Print a product/testing unit label. Renders the same face as the on-screen
 * preview and drives the browser print pipeline: WebUSB/Web Serial raw
 * TSPL/ZPL to the paired thermal printer when silent mode is on, then
 * hidden-iframe dialog fallback.
 */
export async function printProductLabelJob(
  input: PrintProductLabelInput,
): Promise<'usb' | 'iframe' | 'skipped'> {
  if (typeof window === 'undefined') return 'skipped';

  const built = productLabelFace(input);
  if (!built) return 'skipped';

  const { sku, matrix } = built;
  const silent = isSilentPrintEnabled();
  const legacyPopup = reserveLegacyPrintPopup();

  const [{ printLabelJob, buildLabelHtml }, { buildProductLabelBitmapCommands, buildProductLabelCommands }] =
    await Promise.all([
      import('@/lib/print/printLabel'),
      import('@/lib/print/productLabelCommands'),
    ]);

  if (silent) {
    const labelProfile = getProfileForRole('label');
    if (labelProfile && labelProfile.kind !== 'os') {
      const commands =
        labelProfile.language === 'tspl'
          ? buildProductLabelBitmapCommands(input, PRODUCT_LABEL_SIZE, labelProfile.copies)
          : buildProductLabelCommands(
              input,
              labelProfile.language,
              PRODUCT_LABEL_SIZE,
              labelProfile.copies,
            );
      const res = await printRawToProfile(commands, labelProfile);
      if (res.success) {
        legacyPopup?.close();
        return 'usb';
      }
      console.warn('printProductLabel: browser raw print failed, falling back:', res.reason);
    }
    return printLabelJob({
      name: `Label ${sku}`,
      ...built,
      dataMatrix: matrix,
      face: built.face,
      legacyPopup,
    });
  }

  const html = buildLabelHtml({
    name: `Label ${sku}`,
    ...built,
    dataMatrix: matrix,
  });
  printHtmlInIframe(html, { name: `Label ${sku}`, legacyPopup });
  return 'iframe';
}

export function printProductLabel(input: PrintProductLabelInput): void {
  void printProductLabelJob(input);
}

export type PrintProductLabelsInput = {
  sku: string;
  title?: string;
  serialNumbers: string[];
  gtin?: string;
  /** Tenant slug — forwarded so a batch encodes the same string a single print
   *  would. Dropping it here would re-create the per-path fork on the bulk lane. */
  orgSlug?: string | null;
  qrPayloads?: Array<string | null | undefined>;
  condition?: string | null;
  color?: string | null;
  staggerMs?: number;
};

export function printProductLabels(input: PrintProductLabelsInput): void {
  if (typeof window === 'undefined') return;

  const sku = input.sku?.trim();
  if (!sku) return;

  const serials = (input.serialNumbers ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
  if (serials.length === 0) return;

  const stagger = input.staggerMs ?? 200;
  const payloads = input.qrPayloads ?? [];

  serials.forEach((serialNumber, i) => {
    window.setTimeout(() => {
      printProductLabel({
        sku,
        title: input.title,
        serialNumber,
        gtin: input.gtin,
        orgSlug: input.orgSlug,
        qrPayload: payloads[i] ?? undefined,
        condition: input.condition,
        color: input.color,
      });
    }, i * stagger);
  });
}
