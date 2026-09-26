/** Repair-intake shapes shared by the domain (receipt rendering, intake logic) and the intake form components. */

export type ContactFieldKey = 'name' | 'phone' | 'email' | 'extras';

export const CONTACT_FIELDS: readonly ContactFieldKey[] = [
    'name',
    'phone',
    'email',
    'extras',
];

export type RepairIntakeStepKey = 'product' | 'issue' | 'contact' | 'review';

export const REPAIR_INTAKE_STEPS: ReadonlyArray<{
  key: RepairIntakeStepKey;
  label: string;
  /** Compact chrome-row label — fits the single-row intake header. */
  shortLabel: string;
}> = [
  { key: 'product', label: 'Repair Service', shortLabel: 'Service' },
  { key: 'issue', label: 'Issue / Reason', shortLabel: 'Issue' },
  { key: 'contact', label: 'Contact Information', shortLabel: 'Contact' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
];

export interface RepairFormData {
    product: {
        type: string;
        model: string;
        sourceSku?: string | null;
    };
    repairReasons: string[];
    repairNotes: string;
    customer: {
        name: string;
        phone: string;
        email: string;
    };
    serialNumber: string;
    price: string;
    notes: string;
    assignedTechId: number | null;
    assignedTechName: string;
    signatureDataUrl?: string | null;
    signatureStrokes?: unknown[] | null;
}
