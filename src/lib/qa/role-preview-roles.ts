export const QA_PREVIEW_ROLES = [
  { key: 'admin', label: 'QA Admin' },
  { key: 'receiver', label: 'QA Receiver' },
  { key: 'technician', label: 'QA Technician' },
  { key: 'packer', label: 'QA Packer' },
  { key: 'shipper', label: 'QA Shipper' },
] as const;

export type QaPreviewRoleKey = (typeof QA_PREVIEW_ROLES)[number]['key'];
