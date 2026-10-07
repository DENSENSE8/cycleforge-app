/** Split the carton editor off the `/unbox` first load. A scan prefetches it. */

export function loadReceivingLineWorkspace() {
  return import('@/components/receiving/workspace/ReceivingLineWorkspace');
}
