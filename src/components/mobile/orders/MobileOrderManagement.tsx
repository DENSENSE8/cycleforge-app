/**
 * Compatibility export for the former page-local Order Management fork.
 *
 * `/m/orders` and the legacy `/m/work` route now mount one queue. Keep this
 * file as an import-safe bridge while callers migrate; do not add filtering,
 * status derivation, or row presentation here.
 */
export { default } from '@/components/mobile/redesign/AssignedOrders';
