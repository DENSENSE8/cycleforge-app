/** Browser-side still-photo quality gate (pack slip: blur / dark / glare). */

import { gateStillFrame } from '@/lib/vision/frame-quality';

const GATE_DIMENSION = 160;

/** True when the photo passes the still-frame gate, or cannot be decoded here. */
export async function qualityGatePhoto(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const width = GATE_DIMENSION;
    const height = Math.max(1, Math.round((width * image.naturalHeight) / image.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return true;
    context.drawImage(image, 0, 0, width, height);
    return gateStillFrame(context.getImageData(0, 0, width, height)).ok;
  } catch {
    // A device-native format the browser cannot decode should still be handed
    // to the uploader, which owns its normal format fallback/error handling.
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}
