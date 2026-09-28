/** How a print channel reads to an operator — the rail, the header and the print log agree. */
import type { LabelPrintChannel } from '@/lib/label-prints/contracts';

export const CHANNEL_FACE: Record<LabelPrintChannel, string> = {
  THERMAL_USB: 'Thermal · USB',
  THERMAL_SERIAL: 'Thermal · serial',
  DESKTOP_HOST: 'Desktop app',
  BROWSER_DIALOG: 'Print dialog',
};
