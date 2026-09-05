import { getProfileForRole, printRawToProfile, resolvePaperSize } from '@/lib/print/browserPrint';
import {
  printHtmlInIframe,
  reserveLegacyPrintPopup,
} from '@/lib/print/iframePrint';
import { buildFaceInfoHtml } from '@/lib/print/labelFace';
import { isSilentPrintEnabled } from '@/lib/print/printMode';
import {
  receivingPayloadToFace,
  type ReceivingLabelPayload,
} from '@/lib/print/printReceivingLabel';

const RECEIVING_LABEL_SIZE = resolvePaperSize('2x1');

const loadLabelRenderers = () =>
  Promise.all([import('@/lib/print/printLabel'), import('@/lib/print/labelCommands')]);

/**
 * Awaitable carton print — WebUSB/Web Serial first, then iframe dialog.
 * Station Print buttons must wait on this (via {@link printStationLabel}).
 */
export async function printReceivingLabelJob(
  payload: ReceivingLabelPayload,
): Promise<'usb' | 'iframe' | 'skipped'> {
  if (typeof window === 'undefined') return 'skipped';
  const face = receivingPayloadToFace(payload);
  if (!face.matrix.value) return 'skipped';

  const silent = isSilentPrintEnabled();
  const legacyPopup = reserveLegacyPrintPopup();
  const [
    { buildLabelHtml, printLabelJob },
    { buildReceivingLabelBitmapCommands, buildReceivingLabelCommands },
  ] = await loadLabelRenderers();

  const html = buildLabelHtml({
    name: 'Label',
    ...buildFaceInfoHtml(face),
    dataMatrix: face.matrix,
    hri: face.hri,
  });
  if (silent) {
    const labelProfile = getProfileForRole('label');
    if (labelProfile && labelProfile.kind !== 'os') {
      const commands =
        labelProfile.language === 'tspl'
          ? buildReceivingLabelBitmapCommands(payload, RECEIVING_LABEL_SIZE, labelProfile.copies)
          : buildReceivingLabelCommands(
              payload,
              labelProfile.language,
              RECEIVING_LABEL_SIZE,
              labelProfile.copies,
            );
      const res = await printRawToProfile(commands, labelProfile);
      if (res.success) {
        legacyPopup?.close();
        return 'usb';
      }
      console.warn('printReceivingLabel: browser raw print failed, falling back:', res.reason);
    }
    return printLabelJob({
      name: 'Label',
      ...buildFaceInfoHtml(face),
      dataMatrix: face.matrix,
      hri: face.hri,
      face,
      legacyPopup,
    });
  }
  printHtmlInIframe(html, { name: 'Receiving label', legacyPopup });
  return 'iframe';
}

export function printReceivingLabel(payload: ReceivingLabelPayload): void {
  void printReceivingLabelJob(payload);
}
