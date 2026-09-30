export type StaffRole = 'technician' | 'packer';

export type StaffUpdatePayload = {
  id: number;
  name?: string;
  role?: StaffRole;
  employee_id?: string;
  active?: boolean;
  color_hex?: string;
  default_home_path?: string | null;
};

export function toNullableDateInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Curated list of paths the admin can pick as a per-staff default landing page. */
export const STAFF_HOME_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '/',            label: 'Tasks' },
  { value: '/operations',  label: 'Operations' },
  { value: '/receiving',   label: 'Receiving' },
  { value: '/test',        label: 'Quality Control' },
  { value: '/pick',        label: 'Picker' },
  { value: '/pack',        label: 'Packing' },
  { value: '/inventory',   label: 'Inventory' },
  { value: '/warehouse',   label: 'Warehouse' },
  { value: '/products',    label: 'Products' },
  { value: '/walk-in',     label: 'Walk-in' },
  { value: '/fba',         label: 'Amazon Prep' },
  { value: '/inventory?section=replenish', label: 'Replenish' },
];
