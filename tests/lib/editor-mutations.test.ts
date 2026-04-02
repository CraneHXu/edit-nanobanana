import { describe, expect, it } from 'vitest';
import { applyPageMutation, createManualTextElement } from '@/lib/editor-mutations';
import type { PageModel, TextElement } from '@/types/canvas';

const bounds = { x: 0, y: 0, width: 16, height: 8 };

function createSnapshot(text: string): TextElement['original'] {
  return {
    bbox: { ...bounds },
    text,
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
  };
}

function createBaseRegion(overrides: Partial<TextElement> = {}): TextElement {
  const base: TextElement = {
    id: 1,
    removed: false,
    sourceBounds: { ...bounds },
    bbox: { ...bounds },
    rotation: 0,
    layoutOffsetY: 0,
    text: 'Hello',
    confidence: 0.97,
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
    original: createSnapshot('Hello'),
    sourcePolygon: undefined,
    source: 'ocr',
    excludedFromClean: false,
    confirmed: false,
    lowConfidence: false,
  };

  const merged: TextElement = {
    ...base,
    ...overrides,
    original: overrides.original ? { ...base.original, ...overrides.original } : base.original,
  };

  return merged;
}

describe('editor mutations helpers', () => {
  it('remove-region marks OCR region as removed and excluded from clean', () => {
    const pageModel: PageModel = {
      imageId: 'page',
      originalWidth: 1,
      originalHeight: 1,
      regions: [createBaseRegion()],
    };

    const next = applyPageMutation(pageModel, { type: 'remove-region', regionId: 1 });

    expect(next.regions[0].removed).toBe(true);
    expect(next.regions[0].excludedFromClean).toBe(true);
  });

  it('manual region defaults to confirmed manual source and excluded from clean', () => {
    const manual = createManualTextElement({
      id: 42,
      text: '手工补充',
      bbox: { x: 1, y: 2, width: 10, height: 4 },
    });

    expect(manual.source).toBe('manual');
    expect(manual.excludedFromClean).toBe(true);
    expect(manual.confirmed).toBe(true);
  });
});
