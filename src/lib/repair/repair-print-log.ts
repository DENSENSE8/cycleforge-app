/** Repair print log — who printed which repair document, when, and where. */

export type RepairPrintDocument = 'receipt' | 'label' | 'manual';

/** Where the paper came out: the staff app, a phone-sent station job, or the kiosk tablet. */
export type RepairPrintVia = 'staff' | 'station' | 'kiosk';

export interface RepairPrintLogEntry {
  id: number;
  /** Server-stamped `audit_logs.created_at`. */
  at: string;
  actorName: string | null;
  document: RepairPrintDocument;
  via: RepairPrintVia;
  /** Kiosk device label, or the print station's name, when known. */
  deviceLabel: string | null;
  reprint: boolean;
  manualId: number | null;
}

export interface RepairPrintLog {
  /** `repair_service.label_printed_at` — first 2×1 label print (first print wins). */
  labelPrintedAt: string | null;
  entries: RepairPrintLogEntry[];
}

export const REPAIR_PRINT_DOCUMENT_TITLE: Record<RepairPrintDocument, string> = {
  receipt: 'Repair receipt',
  label: 'Repair label',
  manual: 'Manual',
};

const VIA_FACE: Record<RepairPrintVia, string> = {
  staff: 'Staff app',
  station: 'Station',
  kiosk: 'Kiosk',
};

export interface RepairPrintAuditRow {
  id: number | string;
  created_at: string | Date;
  action: string;
  metadata: Record<string, unknown> | null;
  actor_name: string | null;
}

/** One audit row → one log entry; null for rows that are not a repair print. */
export function repairPrintLogEntry(row: RepairPrintAuditRow): RepairPrintLogEntry | null {
  const meta = row.metadata ?? {};
  const at = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  const base = { id: Number(row.id), at, actorName: row.actor_name ?? null, manualId: null };
  switch (row.action) {
    case 'repair_service.label_printed':
      return { ...base, document: 'label', via: 'staff', deviceLabel: null, reprint: meta.alreadyPrinted === true };
    case 'kiosk.visit_print':
      return {
        ...base,
        document: meta.kind === 'label' ? 'label' : 'receipt',
        via: 'kiosk',
        deviceLabel: typeof meta.device_label === 'string' ? meta.device_label : null,
        reprint: meta.reprint === true,
      };
    case 'repair_service.document_printed': {
      const document = meta.document === 'manual' ? 'manual' : 'receipt';
      const manualId = Number(meta.manual_id);
      return {
        ...base,
        document,
        via: 'station',
        deviceLabel: typeof meta.station_name === 'string' && meta.station_name ? meta.station_name : null,
        reprint: false,
        manualId: document === 'manual' && Number.isInteger(manualId) && manualId > 0 ? manualId : null,
      };
    }
    default:
      return null;
  }
}

/** "Station · Michael" / "Kiosk (Front counter) · Ajax" — the where/who half of a log line. */
export function repairPrintWhere(entry: RepairPrintLogEntry): string {
  const where = entry.deviceLabel ? `${VIA_FACE[entry.via]} (${entry.deviceLabel})` : VIA_FACE[entry.via];
  return entry.actorName ? `${where} · ${entry.actorName}` : where;
}
