import type { PhotoAspect } from './photo-aspects';

/** The phone's SERIAL_UNIT capture surface: `/m/unit-photos/{id}?…` (stage omitted when testing). */
export function unitPhotoCaptureHref(
  serialUnitId: number,
  opts: {
    requestId?: string | null;
    unit?: string | null;
    stage?: 'testing' | 'prepack' | 'packing';
    aspect?: PhotoAspect | null;
    packerLogId?: number | null;
    poRef?: string | null;
    back?: string | null;
    title?: string | null;
  } = {},
): string {
  const qs = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) qs.set(key, v);
  };
  set('requestId', opts.requestId);
  set('unit', opts.unit);
  if (opts.stage && opts.stage !== 'testing') qs.set('stage', opts.stage);
  set('aspect', opts.aspect);
  if (opts.packerLogId != null && Number.isFinite(opts.packerLogId) && opts.packerLogId > 0) {
    qs.set('packerLogId', String(opts.packerLogId));
  }
  set('poRef', opts.poRef);
  set('back', opts.back);
  set('title', opts.title);
  const suffix = qs.toString();
  return `/m/unit-photos/${serialUnitId}${suffix ? `?${suffix}` : ''}`;
}
