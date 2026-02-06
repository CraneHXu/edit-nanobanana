/**
 * API Client for Backend Communication
 * Uses Next.js API routes for Vercel deployment
 * Supports SSE streaming for long-running OCR requests
 */

import { DetectionResponse } from '@/types/ocr';

// Use relative paths for API routes (works on Vercel and locally)
const API_BASE_URL = '';

// Compress to 1MB to speed up OCR processing (smaller = faster)
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

interface CompressResult {
  file: File;
  scale: number; // 1 means no compression, < 1 means compressed
}

async function compressImage(file: File, maxSize: number): Promise<CompressResult> {
  // If already small enough, return as-is
  if (file.size <= maxSize) {
    return { file, scale: 1 };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate scale factor based on file size ratio
      const ratio = Math.sqrt(maxSize / file.size);
      const width = Math.floor(img.width * ratio);
      const height = Math.floor(img.height * ratio);

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
            reject(new Error('Failed to compress image'));
            return;
          }
          resolve({
            file: new File([blob], file.name, { type: 'image/jpeg' }),
            scale: ratio,
          });
        },
        'image/jpeg',
        0.8 // Slightly lower quality for faster OCR
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

export async function detectText(
  imageFile: File,
  onProgress?: ProgressCallback
): Promise<DetectionResponse> {
  // Compress image for faster OCR processing
  const { file: processedFile, scale } = await compressImage(imageFile, MAX_FILE_SIZE);

  onProgress?.('compressing', `Image compressed to ${(processedFile.size / 1024).toFixed(0)}KB`);

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

  // If image was compressed, scale coordinates back to original size
  if (scale < 1) {
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
      fontSize: Math.round(detection.fontSize * inverseScale),
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
