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
    .filter((region) => !region.removed)
    .map((region) => ({
      sourceBounds: cloneBounds(region.sourceBounds),
      sourcePolygon: clonePolygon(region.sourcePolygon),
      eraserPaths: region.eraserPaths.map((path) => ({ ...path })),
    }));
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
