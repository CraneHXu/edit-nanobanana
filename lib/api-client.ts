/**
 * API Client for Backend Communication
 * Uses Next.js API routes for Vercel deployment
 * Supports SSE streaming for long-running OCR requests
 */

import type { BoundingBox, DetectionResponse } from '@/types/ocr';

// Use relative paths for API routes (works on Vercel and locally)
const API_BASE_URL = '';

// Match OCRPDF-TO-PPT: normalize OCR input scale by targeting ~1080px image height.
const TARGET_IMAGE_HEIGHT = 1080;
const HEIGHT_TOLERANCE = 100;

interface ScaleResult {
  file: File;
  scale: number; // 1 means no scaling, >1 means upscaled, <1 means downscaled
}

async function scaleImageForOCR(file: File, targetHeight: number): Promise<ScaleResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.width <= 0 || img.height <= 0) {
        reject(new Error('Invalid image dimensions'));
        return;
      }

      if (Math.abs(img.height - targetHeight) < HEIGHT_TOLERANCE) {
        resolve({ file, scale: 1 });
        return;
      }

      const scale = targetHeight / Math.max(1, img.height);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, targetHeight);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to scale image for OCR'));
            return;
          }
          resolve({
            file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' }),
            scale,
          });
        },
        'image/png'
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

interface ProgressCallback {
  (stage: string, message: string): void;
}

export interface InpaintRequest {
  imageDataUrl: string;
  source: 'original';
  sourceBounds: BoundingBox;
  sourcePolygon?: [number, number][];
}

export interface InpaintResponse {
  success?: boolean;
  patchId?: string;
  imageDataUrl?: string;
}

export async function detectText(
  imageFile: File,
  onProgress?: ProgressCallback
): Promise<DetectionResponse> {
  const { file: processedFile, scale } = await scaleImageForOCR(imageFile, TARGET_IMAGE_HEIGHT);

  onProgress?.(
    'scaling',
    scale === 1
      ? `Image kept at original height (${TARGET_IMAGE_HEIGHT}px target window)`
      : `Image scaled for OCR: ${Math.round(scale * 100)}% (${processedFile.size / 1024 > 1024
          ? `${(processedFile.size / 1024 / 1024).toFixed(2)}MB`
          : `${Math.round(processedFile.size / 1024)}KB`})`
  );

  const formData = new FormData();
  formData.append('image', processedFile);

  const response = await fetch(`${API_BASE_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Text detection failed: ${response.statusText}`);
  }

  // Handle SSE streaming response
  const result = await parseSSEResponse(response, onProgress);

  // Map OCR coordinates back into original image space after fixed-height scaling.
  if (scale !== 1) {
    const inverseScale = 1 / scale;
    result.detections = result.detections.map((detection) => ({
      ...detection,
      bbox: detection.bbox.map(([x, y]) => [x * inverseScale, y * inverseScale]) as [number, number][],
      bounds: {
        x: detection.bounds.x * inverseScale,
        y: detection.bounds.y * inverseScale,
        width: detection.bounds.width * inverseScale,
        height: detection.bounds.height * inverseScale,
      },
      fontSize: detection.fontSize === null ? null : Math.round(detection.fontSize * inverseScale),
    }));
  }

  return result;
}

async function parseSSEResponse(
  response: Response,
  onProgress?: ProgressCallback
): Promise<DetectionResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let result: DetectionResponse | null = null;
  let error: string | null = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    let currentEvent = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);

          switch (currentEvent) {
            case 'connected':
              onProgress?.('connected', parsed.message);
              break;
            case 'progress':
              onProgress?.(parsed.stage, parsed.message);
              break;
            case 'result':
              result = parsed as DetectionResponse;
              break;
            case 'error':
              error = parsed.error;
              break;
          }
        } catch {
          // Ignore JSON parse errors for incomplete data
        }
        currentEvent = '';
      }
    }
  }

  if (error) {
    throw new Error(error);
  }

  if (!result) {
    throw new Error('No result received from OCR');
  }

  return result;
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  return response.json();
}

export async function inpaintRegion(request: InpaintRequest): Promise<InpaintResponse> {
  const response = await fetch(`${API_BASE_URL}/api/inpaint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Inpaint failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
