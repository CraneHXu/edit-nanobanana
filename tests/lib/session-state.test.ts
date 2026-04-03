import { describe, expect, it } from 'vitest';
import { deserializeEditorSession, serializeEditorSession } from '@/lib/session-state';
import type { PageModel, TextElement } from '@/types/canvas';

function createRegion(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 1,
    source: 'ocr',
    removed: false,
    excludedFromClean: false,
    confirmed: true,
    lowConfidence: false,
    sourceBounds: { x: 1, y: 2, width: 30, height: 12 },
    bbox: { x: 1, y: 2, width: 30, height: 12 },
    sourcePolygon: [[1, 2], [31, 2], [31, 14], [1, 14]],
    rotation: 0,
    layoutOffsetY: 0,
    text: 'banana',
    confidence: 0.98,
    fontFamily: 'Noto Sans SC',
    fontSize: 14,
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
      bbox: { x: 1, y: 2, width: 30, height: 12 },
      text: 'banana',
      fontFamily: 'Noto Sans SC',
      fontSize: 14,
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
    ...overrides,
  };
}

function createPageModel(): PageModel {
  return {
    imageId: 'image-1',
    originalWidth: 640,
    originalHeight: 480,
    cleanLayer: 'clean-layer-data',
    regions: [createRegion()],
    patches: [{
      id: 'patch-1',
      kind: 'manual_ai',
      regionIds: [1],
      crop: { x: 10, y: 12, width: 60, height: 40 },
      imageDataUrl: 'patch-data',
      createdAt: 123,
      applied: true,
      reverted: false,
      previewMode: 'current',
      description: 'manual patch',
    }],
  };
}

describe('session-state helpers', () => {
  it('serializeEditorSession keeps base/current layers plus patches and regions', () => {
    const payload = serializeEditorSession({
      originalImage: 'original-image-data',
      imageMeta: { width: 640, height: 480 },
      pageModel: createPageModel(),
      baseAutoLayer: 'base-auto-layer-data',
      currentLayer: 'current-layer-data',
      historyPast: [{ ignored: true }],
      historyFuture: [{ ignored: true }],
    });

    expect(payload).toEqual({
      originalImage: 'original-image-data',
      imageMeta: { width: 640, height: 480 },
      pageModel: {
        ...createPageModel(),
        baseAutoLayer: 'base-auto-layer-data',
        currentLayer: 'current-layer-data',
      },
    });
  });

  it('deserializeEditorSession restores serializable session fields but drops runtime history', () => {
    const pageModel = createPageModel();
    const session = deserializeEditorSession(JSON.stringify({
      originalImage: 'original-image-data',
      imageMeta: { width: 640, height: 480 },
      pageModel: {
        ...pageModel,
        baseAutoLayer: 'base-auto-layer-data',
        currentLayer: 'current-layer-data',
      },
      historyPast: [{ shouldNotRestore: true }],
      historyFuture: [{ shouldNotRestore: true }],
    }));

    expect(session).toEqual({
      originalImage: 'original-image-data',
      imageMeta: { width: 640, height: 480 },
      pageModel,
      baseAutoLayer: 'base-auto-layer-data',
      currentLayer: 'current-layer-data',
    });
    expect(session).not.toHaveProperty('historyPast');
    expect(session).not.toHaveProperty('historyFuture');
  });
});
