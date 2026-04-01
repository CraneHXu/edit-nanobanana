/**
 * Browser-side text style inference for OCR detections.
 * Keeps OCR focused on geometry/text, then infers font size and colors locally.
 */

import { loadGoogleFont } from '@/lib/font-loader';
import { fitTextLayoutToBox } from '@/lib/text-layout';
import type { FontWeight, TextAlign } from '@/types/canvas';
import { BoundingBox, OCRDetection, RGBColor } from '@/types/ocr';

const DEFAULT_FONT_FAMILY = 'Noto Sans SC';
const DEFAULT_FONT_WEIGHT: FontWeight = 'normal';
const DEFAULT_TEXT_ALIGN: TextAlign = 'left';
const DEFAULT_BG_COLOR: RGBColor = { r: 255, g: 255, b: 255 };
const DEFAULT_TEXT_COLOR: RGBColor = { r: 0, g: 0, b: 0 };
const COLOR_BUCKET_SIZE = 24;

const DISPLAY_PALETTE: RGBColor[] = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 165, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 255, b: 255 },
  { r: 0, g: 0, b: 255 },
  { r: 128, g: 0, b: 255 },
];

interface SampledPixel extends RGBColor {
  luminance: number;
  distanceToBackground: number;
  edgeStrength: number;
}

interface ColorCandidate {
  color: RGBColor;
  score: number;
}

interface TextColorAnalysis {
  rawColor: RGBColor;
  quantizedColor: RGBColor;
}

interface RegionStyleInput {
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  fontWeight?: FontWeight;
  textAlign?: TextAlign;
}

interface StyleInferenceContext {
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface SampledRegionStyle {
  bgColor: RGBColor;
  textColorRaw: RGBColor;
  textColorQuantized: RGBColor;
  fontWeight: FontWeight;
  textAlign: TextAlign;
}

export async function enhanceDetectionsWithStyles(
  detections: OCRDetection[],
  imageUrl: string,
): Promise<OCRDetection[]> {
  const context = await createStyleInferenceContext(imageUrl);
  await loadGoogleFont(DEFAULT_FONT_FAMILY);

  return Promise.all(detections.map(async (detection) => {
    const sampledStyle = inferRegionStyleFromContext(context, detection);
    const fontWeight = sampledStyle.fontWeight;
    const renderBounds = deriveRenderBounds(detection.bbox, detection.bounds);
    const layout = await fitTextLayoutToBox(detection.text, renderBounds, DEFAULT_FONT_FAMILY, fontWeight);

    return {
      ...detection,
      bgColor: sampledStyle.bgColor,
      textColor: sampledStyle.textColorRaw,
      textColorRaw: sampledStyle.textColorRaw,
      textColorQuantized: sampledStyle.textColorQuantized,
      fontSize: layout.fontSize,
      fontWeight,
      textAlign: sampledStyle.textAlign,
    };
  }));
}

export async function sampleRegionStyle(
  imageUrl: string,
  target: RegionStyleInput,
): Promise<SampledRegionStyle> {
  const context = await createStyleInferenceContext(imageUrl);
  return inferRegionStyleFromContext(context, target);
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

async function createStyleInferenceContext(imageUrl: string): Promise<StyleInferenceContext> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to create canvas context for style inference');
  }

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  return { image, canvas, ctx };
}

function inferRegionStyleFromContext(
  context: StyleInferenceContext,
  target: RegionStyleInput,
): SampledRegionStyle {
  const bgColor = sampleBackgroundColor(
    context.ctx,
    context.image.width,
    context.image.height,
    target.bounds,
  );
  const colorAnalysis = sampleTextColor(
    context.ctx,
    context.image.width,
    context.image.height,
    target.bounds,
    bgColor,
  );

  return {
    bgColor,
    textColorRaw: colorAnalysis.rawColor,
    textColorQuantized: colorAnalysis.quantizedColor,
    fontWeight: target.fontWeight ?? DEFAULT_FONT_WEIGHT,
    textAlign: target.textAlign ?? DEFAULT_TEXT_ALIGN,
  };
}

function deriveRenderBounds(
  polygon: [number, number][],
  fallbackBounds: BoundingBox,
): BoundingBox {
  if (!polygon || polygon.length < 4) {
    return fallbackBounds;
  }

  const [p0, p1, , p3] = polygon;
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const height = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);

  if (width < 1 || height < 1) {
    return fallbackBounds;
  }

  return {
    x: p0[0],
    y: p0[1],
    width,
    height,
  };
}

function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  margin: number = 6,
): RGBColor {
  const { x, y, width, height } = bounds;
  const samples: RGBColor[] = [];

  if (y > margin) {
    samples.push(...sampleStrip(ctx, x, Math.max(0, y - margin), width, margin, imgWidth, imgHeight));
  }
  if (y + height + margin < imgHeight) {
    samples.push(...sampleStrip(ctx, x, y + height, width, margin, imgWidth, imgHeight));
  }
  if (x > margin) {
    samples.push(...sampleStrip(ctx, Math.max(0, x - margin), y, margin, height, imgWidth, imgHeight));
  }
  if (x + width + margin < imgWidth) {
    samples.push(...sampleStrip(ctx, x + width, y, margin, height, imgWidth, imgHeight));
  }

  const dominant = pickDominantBucketColor(samples, null);
  return dominant?.color ?? DEFAULT_BG_COLOR;
}

function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  background: RGBColor,
): TextColorAnalysis {
  const pixels = sampleRegionPixels(ctx, imgWidth, imgHeight, bounds, background);
  if (!pixels.length) {
    return {
      rawColor: DEFAULT_TEXT_COLOR,
      quantizedColor: quantizeDisplayColor(DEFAULT_TEXT_COLOR),
    };
  }

  const bgLuminance = getLuminance(background);
  const candidates = [
    pickDominantBucketColor(topContrastPixels(pixels), background),
    pickDominantBucketColor(filterByTone(pixels, background, 'darker'), background),
    pickDominantBucketColor(filterByTone(pixels, background, 'lighter'), background),
    pickDominantBucketColor(filterEdgePixels(pixels), background),
    pickDominantBucketColor(pixels.filter((pixel) => pixel.distanceToBackground >= 22), background),
  ].filter((candidate): candidate is ColorCandidate => candidate !== null);

  let bestCandidate = chooseBestCandidate(candidates, background);

  if (!bestCandidate) {
    const fallbackPool = bgLuminance >= 128
      ? [...pixels].sort((a, b) => a.luminance - b.luminance)
      : [...pixels].sort((a, b) => b.luminance - a.luminance);
    bestCandidate = {
      color: { r: fallbackPool[0].r, g: fallbackPool[0].g, b: fallbackPool[0].b },
      score: 0,
    };
  }

  return {
    rawColor: bestCandidate.color,
    quantizedColor: quantizeDisplayColor(bestCandidate.color),
  };
}

function sampleRegionPixels(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  background: RGBColor,
): SampledPixel[] {
  const x1 = Math.max(0, Math.round(bounds.x));
  const y1 = Math.max(0, Math.round(bounds.y));
  const x2 = Math.min(imgWidth, Math.round(bounds.x + bounds.width));
  const y2 = Math.min(imgHeight, Math.round(bounds.y + bounds.height));
  const width = x2 - x1;
  const height = y2 - y1;

  if (width <= 0 || height <= 0) {
    return [];
  }

  const imageData = ctx.getImageData(x1, y1, width, height);
  const pixels = imageData.data;
  const gray = new Array<number>(width * height);

  for (let index = 0, pixelIndex = 0; index < pixels.length; index += 4, pixelIndex += 1) {
    gray[pixelIndex] = getLuminance({
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
    });
  }

  const sampledPixels: SampledPixel[] = [];
  const stride = Math.max(1, Math.floor((width * height) / 2500));

  for (let py = 0; py < height; py += stride) {
    for (let px = 0; px < width; px += stride) {
      const pixelIndex = py * width + px;
      const dataIndex = pixelIndex * 4;
      const pixel = {
        r: pixels[dataIndex],
        g: pixels[dataIndex + 1],
        b: pixels[dataIndex + 2],
      };

      sampledPixels.push({
        ...pixel,
        luminance: gray[pixelIndex],
        distanceToBackground: colorDistance(pixel, background),
        edgeStrength: estimateEdgeStrength(gray, width, height, px, py),
      });
    }
  }

  return sampledPixels;
}

function topContrastPixels(pixels: SampledPixel[]): SampledPixel[] {
  const sorted = [...pixels].sort((a, b) => b.distanceToBackground - a.distanceToBackground);
  return sorted.slice(0, Math.max(10, Math.floor(sorted.length * 0.3)));
}

function filterByTone(
  pixels: SampledPixel[],
  background: RGBColor,
  direction: 'darker' | 'lighter',
): SampledPixel[] {
  const bgLuminance = getLuminance(background);
  return pixels.filter((pixel) => {
    const delta = pixel.luminance - bgLuminance;
    return direction === 'darker'
      ? delta <= -10 && pixel.distanceToBackground >= 14
      : delta >= 10 && pixel.distanceToBackground >= 14;
  });
}

function filterEdgePixels(pixels: SampledPixel[]): SampledPixel[] {
  const sortedByEdge = [...pixels].sort((a, b) => b.edgeStrength - a.edgeStrength);
  return sortedByEdge
    .slice(0, Math.max(10, Math.floor(sortedByEdge.length * 0.25)))
    .filter((pixel) => pixel.distanceToBackground >= 16);
}

function pickDominantBucketColor(
  pixels: Array<RGBColor | SampledPixel>,
  background: RGBColor | null,
): ColorCandidate | null {
  if (!pixels.length) {
    return null;
  }

  const buckets = new Map<string, {
    totalR: number;
    totalG: number;
    totalB: number;
    totalContrast: number;
    count: number;
  }>();

  for (const pixel of pixels) {
    const bucketKey = [
      Math.round(pixel.r / COLOR_BUCKET_SIZE),
      Math.round(pixel.g / COLOR_BUCKET_SIZE),
      Math.round(pixel.b / COLOR_BUCKET_SIZE),
    ].join(':');

    const bucket = buckets.get(bucketKey) ?? {
      totalR: 0,
      totalG: 0,
      totalB: 0,
      totalContrast: 0,
      count: 0,
    };

    bucket.totalR += pixel.r;
    bucket.totalG += pixel.g;
    bucket.totalB += pixel.b;
    bucket.count += 1;
    bucket.totalContrast += background ? colorDistance(pixel, background) : 0;

    buckets.set(bucketKey, bucket);
  }

  let bestCandidate: ColorCandidate | null = null;

  for (const bucket of buckets.values()) {
    const color = {
      r: Math.round(bucket.totalR / bucket.count),
      g: Math.round(bucket.totalG / bucket.count),
      b: Math.round(bucket.totalB / bucket.count),
    };
    const contrast = background ? bucket.totalContrast / bucket.count : 0;
    const score = background
      ? contrast * 2 + bucket.count
      : bucket.count;
    const candidate = { color, score };

    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function chooseBestCandidate(
  candidates: ColorCandidate[],
  background: RGBColor,
): ColorCandidate | null {
  if (!candidates.length) {
    return null;
  }

  return candidates.reduce<ColorCandidate | null>((best, candidate) => {
    const contrastBonus = colorDistance(candidate.color, background);
    const nextScore = candidate.score + contrastBonus;

    if (!best) {
      return { color: candidate.color, score: nextScore };
    }

    return nextScore > best.score
      ? { color: candidate.color, score: nextScore }
      : best;
  }, null);
}

function quantizeDisplayColor(color: RGBColor): RGBColor {
  return DISPLAY_PALETTE.reduce((best, candidate) => (
    colorDistance(candidate, color) < colorDistance(best, color) ? candidate : best
  ), DISPLAY_PALETTE[0]);
}

function sampleStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  imgWidth: number,
  imgHeight: number,
): RGBColor[] {
  const colors: RGBColor[] = [];
  const x1 = Math.max(0, Math.round(x));
  const y1 = Math.max(0, Math.round(y));
  const x2 = Math.min(imgWidth, Math.round(x + width));
  const y2 = Math.min(imgHeight, Math.round(y + height));

  if (x2 <= x1 || y2 <= y1) {
    return colors;
  }

  const imageData = ctx.getImageData(x1, y1, x2 - x1, y2 - y1);
  const pixels = imageData.data;
  const step = Math.max(1, Math.floor(pixels.length / 4 / 120));

  for (let index = 0; index < pixels.length; index += 4 * step) {
    colors.push({
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
    });
  }

  return colors;
}

function estimateEdgeStrength(
  gray: number[],
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const center = gray[y * width + x];
  const right = gray[y * width + Math.min(width - 1, x + 1)];
  const down = gray[Math.min(height - 1, y + 1) * width + x];
  return Math.abs(center - right) + Math.abs(center - down);
}

function getLuminance(color: RGBColor): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  return Math.sqrt(
    ((a.r - b.r) ** 2) +
    ((a.g - b.g) ** 2) +
    ((a.b - b.b) ** 2),
  );
}
