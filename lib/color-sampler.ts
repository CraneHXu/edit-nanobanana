/**
 * Color sampling utilities for extracting background colors from images
 * Based on backend ocr_service.py implementation
 */

import { OCRDetection, RGBColor } from '@/types/ocr';

/**
 * Enhance detections with sampled colors from the original image
 * Main entry point - samples both text and background colors
 */
export async function enhanceDetectionsWithColors(
  detections: OCRDetection[],
  imageUrl: string
): Promise<OCRDetection[]> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return detections;
  }

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  return detections.map((detection) => {
    const bgColor = sampleBackgroundColor(ctx, img.width, img.height, detection.bounds);
    const textColor = sampleTextColor(ctx, img.width, img.height, detection.bounds);

    return {
      ...detection,
      bgColor,
      textColor,
    };
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Sample background color from strips around the text region
 * Mirrors backend get_background_color implementation
 */
function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  margin: number = 5
): RGBColor {
  const { x, y, width: w, height: h } = bounds;
  const colors: RGBColor[] = [];

  // Sample from strips around the text box (matching backend logic)
  // Top strip
  if (y > margin) {
    const strip = sampleStrip(ctx, x, Math.max(0, y - margin), w, margin, imgWidth, imgHeight);
    colors.push(...strip);
  }

  // Bottom strip
  if (y + h + margin < imgHeight) {
    const strip = sampleStrip(ctx, x, y + h, w, margin, imgWidth, imgHeight);
    colors.push(...strip);
  }

  // Left strip
  if (x > margin) {
    const strip = sampleStrip(ctx, Math.max(0, x - margin), y, margin, h, imgWidth, imgHeight);
    colors.push(...strip);
  }

  // Right strip
  if (x + w + margin < imgWidth) {
    const strip = sampleStrip(ctx, x + w, y, margin, h, imgWidth, imgHeight);
    colors.push(...strip);
  }

  if (colors.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  // Calculate median color (like backend)
  return medianColor(colors);
}

/**
 * Sample text color using Otsu-like thresholding
 * Mirrors backend get_text_color implementation
 */
function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number }
): RGBColor {
  const { x, y, width: w, height: h } = bounds;

  // Clamp bounds to image
  const x1 = Math.max(0, Math.round(x));
  const y1 = Math.max(0, Math.round(y));
  const x2 = Math.min(imgWidth, Math.round(x + w));
  const y2 = Math.min(imgHeight, Math.round(y + h));

  const regionWidth = x2 - x1;
  const regionHeight = y2 - y1;

  if (regionWidth <= 0 || regionHeight <= 0) {
    return { r: 0, g: 0, b: 0 };
  }

  try {
    const imageData = ctx.getImageData(x1, y1, regionWidth, regionHeight);
    const pixels = imageData.data;

    // Calculate grayscale and find threshold using simple method
    const grayValues: number[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      grayValues.push(gray);
    }

    // Simple threshold: use mean as threshold
    const mean = grayValues.reduce((a, b) => a + b, 0) / grayValues.length;

    // Collect text pixels (darker than threshold = text)
    const textPixels: RGBColor[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      // Text is usually darker than background
      if (gray < mean) {
        textPixels.push({
          r: pixels[i],
          g: pixels[i + 1],
          b: pixels[i + 2],
        });
      }
    }

    if (textPixels.length > 0) {
      return medianColor(textPixels);
    }

    // Fallback: return darkest pixels
    const allPixels: RGBColor[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
      allPixels.push({
        r: pixels[i],
        g: pixels[i + 1],
        b: pixels[i + 2],
      });
    }
    allPixels.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
    return allPixels[0] || { r: 0, g: 0, b: 0 };

  } catch {
    return { r: 0, g: 0, b: 0 };
  }
}

/**
 * Sample pixels from a rectangular strip
 */
function sampleStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  imgWidth: number,
  imgHeight: number
): RGBColor[] {
  const colors: RGBColor[] = [];

  const x1 = Math.max(0, Math.round(x));
  const y1 = Math.max(0, Math.round(y));
  const x2 = Math.min(imgWidth, Math.round(x + width));
  const y2 = Math.min(imgHeight, Math.round(y + height));

  const w = x2 - x1;
  const h = y2 - y1;

  if (w <= 0 || h <= 0) return colors;

  try {
    const imageData = ctx.getImageData(x1, y1, w, h);
    const pixels = imageData.data;

    // Sample every few pixels to avoid too many samples
    const step = Math.max(1, Math.floor(pixels.length / 4 / 50));
    for (let i = 0; i < pixels.length; i += 4 * step) {
      colors.push({
        r: pixels[i],
        g: pixels[i + 1],
        b: pixels[i + 2],
      });
    }
  } catch {
    // Ignore sampling errors
  }

  return colors;
}

/**
 * Calculate median color from array of colors
 */
function medianColor(colors: RGBColor[]): RGBColor {
  if (colors.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  const rs = colors.map(c => c.r).sort((a, b) => a - b);
  const gs = colors.map(c => c.g).sort((a, b) => a - b);
  const bs = colors.map(c => c.b).sort((a, b) => a - b);

  const mid = Math.floor(colors.length / 2);

  return {
    r: rs[mid],
    g: gs[mid],
    b: bs[mid],
  };
}
