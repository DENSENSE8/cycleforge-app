'use client';

/**
 * Client executor for the `print_handling_unit_labels` UI tool — the only
 * place chat-driven printing lives, so the desktop-host dependency stays out
 * of the chat hook. Uses the SAME per-label job the tote UI uses
 * (printHandlingUnitLabelJob → printLabelJob → desktop silent print / WebUSB
 * / iframe), never a second print path.
 */

import { printHandlingUnitLabelJob } from '@/lib/print/printHandlingUnitLabel';
import { SESSION_ARTIFACT_EVENT } from '@/lib/app-events';

function report(title: string, body: string): void {
  window.dispatchEvent(
    new CustomEvent(SESSION_ARTIFACT_EVENT, {
      detail: {
        kind: 'timeline',
        title,
        subject: 'Label printer',
        items: [{ at: new Date().toISOString(), actor: 'printer', action: body, detail: null }],
      },
    }),
  );
}

export async function printHandlingUnitLabelsFromChat(handlingUnitIds: number[]): Promise<void> {
  let printed = 0;
  const failed: number[] = [];
  for (const id of handlingUnitIds) {
    try {
      const result = await printHandlingUnitLabelJob({ handlingUnitId: id });
      if (result === 'skipped') failed.push(id);
      else printed += 1;
    } catch {
      failed.push(id);
    }
  }
  if (failed.length > 0) {
    report(
      'Label print',
      `Printed ${printed} of ${handlingUnitIds.length} — failed/skipped: ${failed.join(', ')}`,
    );
  } else {
    report('Label print', `Printed ${printed} label${printed === 1 ? '' : 's'}.`);
  }
}
