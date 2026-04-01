/**
 * Color sampling utilities for extracting background and foreground colors.
 */

import { OCRDetection, RGBColor } from '@/types/ocr';

interface SampledPixel extends RGBColor {
  luminance: number;
  distanceToBackground: number;
}

export async function enhanceDetectionsWithColors(
  detections: OCRDetection[],
  imageUrl: string
): Promise<OCRDetection[]> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return detections;

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  return detections.map((detection) => {
    const bgColor = sampleBackgroundColor(ctx, image.width, image.height, detection.bounds);
    const textColor = sampleTextColor(ctx, image.width, image.height, detection.bounds, bgColor);

    return {
      ...detection,
      bgColor,
      textColor,
    };
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  margin: number = 6
): RGBColor {
  const { x, y, width, height } = bounds;
  const colors: RGBColor[] = [];

  if (y > margin) {
    colors.push(...sampleStrip(ctx, x, Math.max(0, y - margin), width, margin, imgWidth, imgHeight));
  }
  if (y + height + margin < imgHeight) {
    colors.push(...sampleStrip(ctx, x, y + height, width, margin, imgWidth, imgHeight));
  }
  if (x > margin) {
    colors.push(...sampleStrip(ctx, Math.max(0, x - margin), y, margin, height, imgWidth, imgHeight));
  }
  if (x + width + margin < imgWidth) {
    colors.push(...sampleStrip(ctx, x + width, y, margin, height, imgWidth, imgHeight));
  }

  return colors.length ? medianColor(colors) : { r: 255, g: 255, b: 255 };
}

function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  background: RGBColor,
): RGBColor {
  const x1 = Math.max(0, Math.round(bounds.x));
  const y1 = Math.max(0, Math.round(bounds.y));
  const x2 = Math.min(imgWidth, Math.round(bounds.x + bounds.width));
  const y2 = Math.min(imgHeight, Math.round(bounds.y + bounds.height));
  const width = x2 - x1;
  const height = y2 - y1;

  if (width <= 0 || height <= 0) {
    return { r: 0, g: 0, b: 0 };
  }

  try {
    const imageData = ctx.getImageData(x1, y1, width, height);
    const pixels = imageData.data;
    const sampledPixels: SampledPixel[] = [];

    for (let index = 0; index < pixels.length; index += 4) {
      const pixel = {
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
      };
      sampledPixels.push({
        ...pixel,
        luminance: getLuminance(pixel),
        distanceToBackground: colorDistance(pixel, background),
      });
    }

    if (!sampledPixels.length) {
      return { r: 0, g: 0, b: 0 };
    }

    const backgroundLuminance = getLuminance(background);
    const sortedByDistance = [...sampledPixels].sort((a, b) => b.distanceToBackground - a.distanceToBackground);
    const contrastCandidates = sortedByDistance.slice(0, Math.max(8, Math.floor(sortedByDistance.length * 0.2)));
    const darkCandidates = contrastCandidates.filter((pixel) => pixel.luminance <= backgroundLuminance);
    const lightCandidates = contrastCandidates.filter((pixel) => pixel.luminance > backgroundLuminance);

    const preferred = backgroundLuminance >= 128 ? darkCandidates : lightCandidates;
    const fallback = preferred.length ? preferred : contrastCandidates;

    if (fallback.length) {
      return medianColor(fallback);
    }

    return sortedByDistance[0] || { r: 0, g: 0, b: 0 };
  } catch {
    return { r: 0, g: 0, b: 0 };
  }
}

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

  if (x2 <= x1 || y2 <= y1) return colors;

  try {
    const imageData = ctx.getImageData(x1, y1, x2 - x1, y2 - y1);
    const pixels = imageData.data;
    const step = Math.max(1, Math.floor(pixels.length / 4 / 100));

    for (let index = 0; index < pixels.length; index += 4 * step) {
      colors.push({
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
      });
    }
  } catch {
    return colors;
  }

  return colors;
}

function getLuminance(color: RGBColor): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  return Math.sqrt(
    ((a.r - b.r) ** 2) +
    ((a.g - b.g) ** 2) +
    ((a.b - b.b) ** 2)
  );
}

function medianColor(colors: RGBColor[]): RGBColor {
  const reds = colors.map((color) => color.r).sort((a, b) => a - b);
  const greens = colors.map((color) => color.g).sort((a, b) => a - b);
  const blues = colors.map((color) => color.b).sort((a, b) => a - b);
  const middle = Math.floor(colors.length / 2);

  return {
    r: reds[middle],
    g: greens[middle],
    b: blues[middle],
  };
}
