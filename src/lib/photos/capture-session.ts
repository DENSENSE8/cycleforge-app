/** Platform-neutral capture facts shared by every mobile photo adapter. */

export type PhotoCaptureSource = 'web-camera' | 'native-camera' | 'photo-library';

export interface CapturedShot {
  id: string;
  blob: Blob;
  previewUrl: string;
  capturedAtMs: number;
  source: PhotoCaptureSource;
}

export const CONTINUOUS_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

export function canUseContinuousWebCamera(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** Keep camera output dimensions honest when metadata has not loaded yet. */
export function captureFrameDimensions(videoWidth: number, videoHeight: number) {
  return {
    width: Math.max(1, Math.round(videoWidth || 1280)),
    height: Math.max(1, Math.round(videoHeight || 720)),
  };
}

export function captureFileName(capturedAtMs: number): string {
  return `cycleforge-${Math.trunc(capturedAtMs)}.jpg`;
}
