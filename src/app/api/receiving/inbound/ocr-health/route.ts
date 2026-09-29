/** GET — private readiness probe for the 5070 Ti Unlimited OCR model. */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  resolveUnlimitedOcrConfig,
  unlimitedOcrHeaders,
  UNLIMITED_OCR_DISPLAY_NAME,
} from '@/lib/document-intake/unlimited-ocr-client';

export const runtime = 'nodejs';

export const GET = withAuth(async () => {
  const config = resolveUnlimitedOcrConfig();
  if (!config) {
    return NextResponse.json({
      ok: false,
      service: UNLIMITED_OCR_DISPLAY_NAME,
      configured: false,
      error: 'UNLIMITED_OCR_BASE_URL is not configured.',
    }, { status: 503 });
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: unlimitedOcrHeaders(config),
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        service: UNLIMITED_OCR_DISPLAY_NAME,
        configured: true,
        model: config.model,
        latencyMs: Date.now() - startedAt,
        error: `Model endpoint returned HTTP ${response.status}.`,
      }, { status: 503 });
    }

    const body = await response.json().catch(() => ({})) as {
      data?: Array<{ id?: string }>;
    };
    const models = (body.data ?? []).map((entry) => String(entry.id ?? '')).filter(Boolean);
    const loaded = models.includes(config.model)
      || models.includes(config.model.replace(/:latest$/, ''));

    return NextResponse.json({
      ok: loaded,
      service: UNLIMITED_OCR_DISPLAY_NAME,
      configured: true,
      model: config.model,
      loaded,
      latencyMs: Date.now() - startedAt,
      ...(!loaded ? { error: `The endpoint is reachable but ${config.model} is not installed.` } : {}),
    }, { status: loaded ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      service: UNLIMITED_OCR_DISPLAY_NAME,
      configured: true,
      model: config.model,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unlimited OCR is unreachable.',
    }, { status: 503 });
  }
}, { permission: 'receiving.view' });

