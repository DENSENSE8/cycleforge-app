/**
 * One dispatch for station Print buttons (QC / Unbox / Triage / tote).
 * Always await this (or {@link useStationLabelPrint}) so a USB job actually
 * leaves before the UI claims the label printed.
 */

import type { AsListedLabelPayload } from '@/lib/print/printAsListedLabel';
import type { HandlingUnitLabelPayload } from '@/lib/print/printHandlingUnitLabel';
import type { PrintProductLabelInput } from '@/lib/print/printProductLabel';
import type { ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';
import type { TicketLabelPayload } from '@/lib/print/printTicketLabel';

export type StationLabelVia = 'usb' | 'iframe' | 'skipped';

export type StationLabelJob =
  | { kind: 'unit'; input: PrintProductLabelInput }
  | { kind: 'carton'; payload: ReceivingLabelPayload }
  | { kind: 'as_listed'; payload: AsListedLabelPayload }
  | { kind: 'ticket_minimal'; payload: TicketLabelPayload }
  | { kind: 'handling_unit'; payload: HandlingUnitLabelPayload };

export async function printStationLabel(job: StationLabelJob): Promise<StationLabelVia> {
  switch (job.kind) {
    case 'unit': {
      const { printProductLabelJob } = await import('@/lib/print/printProductLabel');
      return printProductLabelJob(job.input);
    }
    case 'carton': {
      const { printReceivingLabelJob } = await import('@/lib/print/printReceivingDispatch');
      return printReceivingLabelJob(job.payload);
    }
    case 'as_listed': {
      const { printAsListedLabelJob } = await import('@/lib/print/printAsListedLabel');
      return printAsListedLabelJob(job.payload);
    }
    case 'ticket_minimal': {
      const { printTicketLabelJob } = await import('@/lib/print/printTicketLabel');
      return printTicketLabelJob(job.payload);
    }
    case 'handling_unit': {
      const { printHandlingUnitLabelJob } = await import('@/lib/print/printHandlingUnitLabel');
      return printHandlingUnitLabelJob(job.payload);
    }
  }
}
