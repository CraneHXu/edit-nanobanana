import type { BoundingBox } from '@/types/ocr';
import type { PageModel, RegionSource, TextElement } from '@/types/canvas';

export interface AutoRepairCandidate {
  regionId: number;
  source: RegionSource;
  sourceBounds: BoundingBox;
  sourcePolygon?: [number, number][];
}

const DEFAULT_COMPLEXITY_THRESHOLD = 0.35;

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

function resolveRegionSource(region: TextElement): RegionSource {
  return region.source ?? 'ocr';
}

function isAutoRepairEligible(region: TextElement): boolean {
  if (region.removed || region.excludedFromClean) {
    return false;
  }

  const source = resolveRegionSource(region);
  return source === 'ocr' || source === 'roi_ocr';
}

export function buildAutoRepairCandidates(pageModel: PageModel): AutoRepairCandidate[] {
  return pageModel.regions
    .filter(isAutoRepairEligible)
    .map((region) => ({
      regionId: region.id,
      source: resolveRegionSource(region),
      sourceBounds: cloneBounds(region.sourceBounds),
      sourcePolygon: clonePolygon(region.sourcePolygon),
    }));
}

export function shouldUseAutoAi(complexity: number | null, threshold = DEFAULT_COMPLEXITY_THRESHOLD): boolean {
  if (complexity == null || Number.isNaN(complexity)) {
    return false;
  }

  return complexity >= threshold;
}

export function shouldDropAsyncResult(submittedRevision: number, currentRevision: number): boolean {
  return submittedRevision !== currentRevision;
}
