import { BoundingBox } from '@/types/ocr';

interface EraserPath {
  x: number;
  y: number;
  radius: number;
}

interface CleanRegionPayload {
  sourceBounds: BoundingBox;
  sourcePolygon?: [number, number][];
  eraserPaths: EraserPath[];
}

interface CleanBackgroundWorkerRequest {
  type: 'generate-clean-layer';
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  regions: CleanRegionPayload[];
}

const MIN_PADDING = 8;
const MAX_PADDING = 40;
const PADDING_RATIO = 0.25;
const QUANTIZATION = 16;
const BACKGROUND_EXPAND_FACTOR = 0.1;

interface ColorBucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function expandBounds(bounds: BoundingBox, imageWidth: number, imageHeight: number): BoundingBox {
  const padding = clamp(
    Math.round(Math.max(bounds.width, bounds.height) * PADDING_RATIO),
    MIN_PADDING,
    MAX_PADDING,
  );
  const x = clamp(Math.floor(bounds.x - padding), 0, imageWidth);
  const y = clamp(Math.floor(bounds.y - padding), 0, imageHeight);
  const right = clamp(Math.ceil(bounds.x + bounds.width + padding), 0, imageWidth);
  const bottom = clamp(Math.ceil(bounds.y + bounds.height + padding), 0, imageHeight);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function expandEraserBounds(bounds: BoundingBox): BoundingBox {
  const expandX = bounds.width * BACKGROUND_EXPAND_FACTOR;
  const expandY = bounds.height * BACKGROUND_EXPAND_FACTOR;

  return {
    x: bounds.x - expandX,
    y: bounds.y - expandY,
    width: bounds.width + (expandX * 2),
    height: bounds.height + (expandY * 2),
  };
}

async function decodeImageBitmap(imageDataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(imageDataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function createMaskCanvas(
  cropWidth: number,
  cropHeight: number,
  region: CleanRegionPayload,
  cropX: number,
  cropY: number,
): OffscreenCanvas {
  const maskCanvas = new OffscreenCanvas(cropWidth, cropHeight);
  const maskContext = maskCanvas.getContext('2d');
  if (!maskContext) {
    throw new Error('Failed to create clean background mask context');
  }

  maskContext.clearRect(0, 0, cropWidth, cropHeight);
  maskContext.fillStyle = 'rgba(255,255,255,1)';

  if (region.sourcePolygon && region.sourcePolygon.length >= 3) {
    maskContext.beginPath();
    region.sourcePolygon.forEach(([x, y], index) => {
      const localX = x - cropX;
      const localY = y - cropY;
      if (index === 0) {
        maskContext.moveTo(localX, localY);
      } else {
        maskContext.lineTo(localX, localY);
      }
    });
    maskContext.closePath();
    maskContext.fill();
    return maskCanvas;
  }

  const localX = region.sourceBounds.x - cropX;
  const localY = region.sourceBounds.y - cropY;
  maskContext.fillRect(localX, localY, region.sourceBounds.width, region.sourceBounds.height);
  return maskCanvas;
}

function estimateBackgroundColor(
  cropPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  cropWidth: number,
  cropHeight: number,
): { r: number; g: number; b: number } {
  const buckets = new Map<string, ColorBucket>();

  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const offset = (y * cropWidth + x) * 4;
      if (maskPixels[offset + 3] > 8) {
        continue;
      }

      const r = cropPixels[offset];
      const g = cropPixels[offset + 1];
      const b = cropPixels[offset + 2];
      const key = [
        Math.round(r / QUANTIZATION),
        Math.round(g / QUANTIZATION),
        Math.round(b / QUANTIZATION),
      ].join(':');

      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }

  if (!buckets.size) {
    return { r: 255, g: 255, b: 255 };
  }

  const bestBucket = Array.from(buckets.values()).reduce<ColorBucket | null>((best, bucket) => {
    if (!best || bucket.count > best.count) {
      return bucket;
    }
    return best;
  }, null);

  return {
    r: Math.round((bestBucket?.r ?? 255) / (bestBucket?.count ?? 1)),
    g: Math.round((bestBucket?.g ?? 255) / (bestBucket?.count ?? 1)),
    b: Math.round((bestBucket?.b ?? 255) / (bestBucket?.count ?? 1)),
  };
}

function blendFillIntoCrop(
  cropPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  fillColor: { r: number; g: number; b: number },
): void {
  for (let offset = 0; offset < cropPixels.length; offset += 4) {
    const alpha = maskPixels[offset + 3] / 255;
    if (alpha <= 0) {
      continue;
    }

    const inverseAlpha = 1 - alpha;
    cropPixels[offset] = Math.round((cropPixels[offset] * inverseAlpha) + (fillColor.r * alpha));
    cropPixels[offset + 1] = Math.round((cropPixels[offset + 1] * inverseAlpha) + (fillColor.g * alpha));
    cropPixels[offset + 2] = Math.round((cropPixels[offset + 2] * inverseAlpha) + (fillColor.b * alpha));
    cropPixels[offset + 3] = 255;
  }
}

async function generateCleanLayer(
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  regions: CleanRegionPayload[],
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Current browser does not support OffscreenCanvas');
  }

  const bitmap = await decodeImageBitmap(imageDataUrl);
  const sourceCanvas = new OffscreenCanvas(imageWidth, imageHeight);
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) {
    throw new Error('Failed to create clean background source context');
  }
  sourceContext.clearRect(0, 0, imageWidth, imageHeight);
  sourceContext.drawImage(bitmap, 0, 0, imageWidth, imageHeight);

  const canvas = new OffscreenCanvas(imageWidth, imageHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to create clean background canvas context');
  }

  context.clearRect(0, 0, imageWidth, imageHeight);
  context.drawImage(bitmap, 0, 0, imageWidth, imageHeight);

  regions.forEach((region) => {
    const crop = expandBounds(region.sourceBounds, imageWidth, imageHeight);
    const cropImage = context.getImageData(crop.x, crop.y, crop.width, crop.height);
    const maskCanvas = createMaskCanvas(crop.width, crop.height, region, crop.x, crop.y);
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) {
      throw new Error('Failed to read clean background mask data');
    }

    const maskImage = maskContext.getImageData(0, 0, crop.width, crop.height);
    const fillColor = estimateBackgroundColor(cropImage.data, maskImage.data, crop.width, crop.height);
    blendFillIntoCrop(cropImage.data, maskImage.data, fillColor);
    context.putImageData(cropImage, crop.x, crop.y);
  });

  regions.forEach((region) => {
    if (!region.eraserPaths.length) {
      return;
    }

    const expandedBounds = expandEraserBounds(region.sourceBounds);
    region.eraserPaths.forEach((path) => {
      const centerX = expandedBounds.x + path.x;
      const centerY = expandedBounds.y + path.y;

      context.save();
      context.beginPath();
      context.arc(centerX, centerY, path.radius, 0, Math.PI * 2);
      context.clip();
      context.drawImage(sourceCanvas, 0, 0, imageWidth, imageHeight);
      context.restore();
    });
  });

  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (event: MessageEvent<CleanBackgroundWorkerRequest>) => {
  const payload = event.data;
  if (payload.type !== 'generate-clean-layer') {
    return;
  }

  try {
    const blob = await generateCleanLayer(
      payload.imageDataUrl,
      payload.imageWidth,
      payload.imageHeight,
      payload.regions,
    );

    self.postMessage({
      type: 'success',
      blob,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to generate clean background',
    });
  }
};
