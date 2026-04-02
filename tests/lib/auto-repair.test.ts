import { describe, expect, it } from 'vitest';
import { buildAutoRepairCandidates, shouldDropAsyncResult } from '@/lib/auto-repair';
import type { PageModel, TextElement } from '@/types/canvas';

const bounds = { x: 10, y: 12, width: 80, height: 24 };

function createRegion(overrides: Partial<TextElement> = {}): TextElement {
  const base: TextElement = {
    id: 1,
    removed: false,
    sourceBounds: { ...bounds },
    bbox: { ...bounds },
    rotation: 0,
    layoutOffsetY: 0,
    text: '示例',
    confidence: 0.9,
    fontFamily: 'Noto Sans SC',
    fontSize: 12,
    fontWeight: 'normal',
    textAlign: 'left',
    fontColor: { r: 0, g: 0, b: 0 },
    textColorRaw: { r: 0, g: 0, b: 0 },
    textColorMode: 'auto',
    textColorQuantized: { r: 0, g: 0, b: 0 },
    bgColor: { r: 255, g: 255, b: 255 },
    bgMode: 'fill',
    showBackground: true,
    showText: true,
    eraserPaths: [],
    original: {
      bbox: { ...bounds },
      text: '示例',
      fontFamily: 'Noto Sans SC',
      fontSize: 12,
      layoutOffsetY: 0,
      fontWeight: 'normal',
      textAlign: 'left',
      fontColor: { r: 0, g: 0, b: 0 },
      textColorRaw: { r: 0, g: 0, b: 0 },
      textColorMode: 'auto',
      bgColor: { r: 255, g: 255, b: 255 },
      bgMode: 'fill',
      showBackground: true,
      showText: true,
    },
    sourcePolygon: undefined,
    source: 'ocr',
    excludedFromClean: false,
    confirmed: false,
    lowConfidence: false,
  };

  return {
    ...base,
    ...overrides,
    original: overrides.original ? { ...base.original, ...overrides.original } : base.original,
  };
}

function createPageModel(regions: TextElement[]): PageModel {
  return {
    imageId: 'page',
    originalWidth: 200,
    originalHeight: 120,
    regions,
  };
}

describe('buildAutoRepairCandidates', () => {
  it('只包含 active 的 OCR-like 区域', () => {
    const pageModel = createPageModel([
      createRegion({ id: 1, source: 'ocr' }),
      createRegion({ id: 2, source: 'roi_ocr' }),
      createRegion({ id: 3, source: 'ocr', removed: true }),
      createRegion({ id: 4, source: 'manual' }),
    ]);

    const candidates = buildAutoRepairCandidates(pageModel);

    expect(candidates.map((candidate) => candidate.regionId)).toEqual([1, 2]);
  });

  it('manual 和 excludedFromClean 区域不会进入自动队列', () => {
    const pageModel = createPageModel([
      createRegion({ id: 10, source: 'manual', excludedFromClean: false }),
      createRegion({ id: 11, source: 'ocr', excludedFromClean: true }),
      createRegion({ id: 12, source: 'roi_ocr', excludedFromClean: true }),
    ]);

    const candidates = buildAutoRepairCandidates(pageModel);

    expect(candidates).toEqual([]);
  });
});

describe('shouldDropAsyncResult', () => {
  it('revision 变化时返回 true', () => {
    expect(shouldDropAsyncResult(3, 4)).toBe(true);
    expect(shouldDropAsyncResult(5, 5)).toBe(false);
  });
});
