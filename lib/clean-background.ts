import { EraserPath, PageModel, TextElement } from '@/types/canvas';
import { BoundingBox } from '@/types/ocr';

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

interface CleanBackgroundWorkerSuccess {
  type: 'success';
  blob: Blob;
}

interface CleanBackgroundWorkerFailure {
  type: 'error';
  message: string;
}

type CleanBackgroundWorkerResponse = CleanBackgroundWorkerSuccess | CleanBackgroundWorkerFailure;

const MIN_PADDING = 8;
const MAX_PADDING = 40;
const PADDING_RATIO = 0.25;

function cloneBounds(bounds: BoundingBox): BoundingBox {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function clonePolygon(polygon?: [number, number][]): [number, number][] | undefined {
  return polygon?.map(([x, y]) => [x, y] as [number, number]);
}

function getCleanableRegions(regions: TextElement[]): CleanRegionPayload[] {
  return regions
    .filter((region) => !region.removed && !region.excludedFromClean)
    .map((region) => ({
      sourceBounds: cloneBounds(region.sourceBounds),
      sourcePolygon: clonePolygon(region.sourcePolygon),
      eraserPaths: region.eraserPaths.map((path) => ({ ...path })),
    }));
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

function loadImageElement(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for complexity analysis'));
    image.src = imageDataUrl;
  });
}

function createMaskCanvas(
  cropWidth: number,
  cropHeight: number,
  region: Pick<TextElement, 'sourceBounds' | 'sourcePolygon'>,
  cropX: number,
  cropY: number,
): HTMLCanvasElement {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = cropWidth;
  maskCanvas.height = cropHeight;

  const context = maskCanvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create complexity mask context');
  }

  context.clearRect(0, 0, cropWidth, cropHeight);
  context.fillStyle = 'rgba(255,255,255,1)';

  if (region.sourcePolygon && region.sourcePolygon.length >= 3) {
    context.beginPath();
    region.sourcePolygon.forEach(([x, y], index) => {
      const localX = x - cropX;
      const localY = y - cropY;
      if (index === 0) {
        context.moveTo(localX, localY);
      } else {
        context.lineTo(localX, localY);
      }
    });
    context.closePath();
    context.fill();
    return maskCanvas;
  }

  const localX = region.sourceBounds.x - cropX;
  const localY = region.sourceBounds.y - cropY;
  context.fillRect(localX, localY, region.sourceBounds.width, region.sourceBounds.height);
  return maskCanvas;
}

function measurePixelVariance(
  cropPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
): number {
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let offset = 0; offset < cropPixels.length; offset += 4) {
    if (maskPixels[offset + 3] > 8) {
      continue;
    }

    sumR += cropPixels[offset];
    sumG += cropPixels[offset + 1];
    sumB += cropPixels[offset + 2];
    count += 1;
  }

  if (count < 16) {
    return 1;
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;

  let totalDistance = 0;
  for (let offset = 0; offset < cropPixels.length; offset += 4) {
    if (maskPixels[offset + 3] > 8) {
      continue;
    }

    totalDistance += Math.abs(cropPixels[offset] - meanR);
    totalDistance += Math.abs(cropPixels[offset + 1] - meanG);
    totalDistance += Math.abs(cropPixels[offset + 2] - meanB);
  }

  return clamp((totalDistance / count) / 96, 0, 1);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clean background blob'));
    reader.readAsDataURL(blob);
  });
}

export async function generateCleanBackground(imageDataUrl: string, pageModel: PageModel): Promise<string> {
  const regions = getCleanableRegions(pageModel.regions);
  if (!regions.length) {
    return imageDataUrl;
  }

  if (typeof Worker === 'undefined') {
    throw new Error('Current browser does not support Web Worker');
  }

  const worker = new Worker(new URL('./clean-background.worker.ts', import.meta.url));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = async (event: MessageEvent<CleanBackgroundWorkerResponse>) => {
      const payload = event.data;
      if (payload.type === 'error') {
        cleanup();
        reject(new Error(payload.message));
        return;
      }

      try {
        const dataUrl = await blobToDataUrl(payload.blob);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('Failed to serialize clean background'));
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Clean background worker crashed'));
    };

    const request: CleanBackgroundWorkerRequest = {
      type: 'generate-clean-layer',
      imageDataUrl,
      imageWidth: pageModel.originalWidth,
      imageHeight: pageModel.originalHeight,
      regions,
    };

    worker.postMessage(request);
  });
}

export async function estimateRegionComplexity(
  imageDataUrl: string,
  region: Pick<TextElement, 'sourceBounds' | 'sourcePolygon'>,
): Promise<number> {
  const image = await loadImageElement(imageDataUrl);
  const crop = expandBounds(region.sourceBounds, image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Failed to create complexity canvas context');
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const cropImage = context.getImageData(0, 0, crop.width, crop.height);
  const maskCanvas = createMaskCanvas(crop.width, crop.height, region, crop.x, crop.y);
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskContext) {
    throw new Error('Failed to create complexity mask read context');
  }

  const maskImage = maskContext.getImageData(0, 0, crop.width, crop.height);
  return measurePixelVariance(cropImage.data, maskImage.data);
}
