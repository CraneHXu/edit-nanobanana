/**
 * API Client for Backend Communication
 * Uses Next.js API routes for Vercel deployment
 */

import { DetectionResponse } from '@/types/ocr';

// Use relative paths for API routes (works on Vercel and locally)
const API_BASE_URL = '';

// Vercel has a ~4.5MB payload limit, compress images to stay under
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB to be safe

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
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export async function detectText(imageFile: File): Promise<DetectionResponse> {
  // Compress image if too large for Vercel
  const { file: processedFile, scale } = await compressImage(imageFile, MAX_FILE_SIZE);

  const formData = new FormData();
  formData.append('image', processedFile);

  const response = await fetch(`${API_BASE_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Text detection failed: ${response.statusText}`);
  }

  const result: DetectionResponse = await response.json();

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

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  return response.json();
}
