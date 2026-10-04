import type { CustomerOrderStats } from '@/lib/customers/customer-order-stats';
import { sourcePlatformLabel } from '@/lib/source-platform';

export interface StatsResponse extends CustomerOrderStats { ok: true }

export async function getCustomerJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Could not load customers');
  return payload as T;
}

export function customerDateFace(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function customerDateTimeFace(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function customerMoney(value: number | null, currency: string | null): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`;
  }
}

export function customerPlatformFace(value: string | null): string {
  const label = sourcePlatformLabel(value);
  if (label !== 'Unknown') return label;
  const raw = String(value ?? '').trim().replace(/[_-]+/g, ' ');
  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown platform';
}
