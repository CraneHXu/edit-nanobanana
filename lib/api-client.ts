/**
 * API Client for Backend Communication
 * Uses Next.js API routes for Vercel deployment
 */

import { DetectionResponse } from '@/types/ocr';

// Use relative paths for API routes (works on Vercel and locally)
const API_BASE_URL = '';

export async function detectText(imageFile: File): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await fetch(`${API_BASE_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Text detection failed: ${response.statusText}`);
  }

  return response.json();
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error('Health check failed');
  }

  return response.json();
}
