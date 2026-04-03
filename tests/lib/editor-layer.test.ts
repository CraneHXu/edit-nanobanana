import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePatchIntoImage } from '@/lib/api-client';
import { clampBounds } from '@/components/editor/CanvasEditor';
import { buildRestoreOriginalPatch, composeCurrentLayer, resolvePreviewBackground } from '@/lib/editor-layer';
import { getRoiOverlapRegionIds, useEditorStore } from '@/store/editorStore';
import type { AutoChange, ImagePatch, PageModel, TextElement } from '@/types/canvas';
import type { OCRDetection } from '@/types/ocr';

vi.mock('@/lib/text-layout', () => ({
  estimateFontSizeToBox: () => 12,
}));

vi.mock('@/lib/api-client', () => ({
  detectText: vi.fn(),
  inpaintRegion: vi.fn(),
  mergePatchIntoImage: vi.fn(async (baseImageDataUrl: string, patchDataUrl: string) => (
    `${baseImageDataUrl}>${patchDataUrl}`
  )),
}));

const bounds = { x: 0, y: 0, width: 10, height: 4 };

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

function createPageModel(): PageModel {
  return {
    imageId: 'page',
    originalWidth: 100,
    originalHeight: 100,
    cleanLayer: 'clean-0',
    regions: [createRegion()],
  };
}

function createPatch(overrides: Partial<ImagePatch> = {}): ImagePatch {
  return {
    id: overrides.id ?? 'patch-1',
    kind: overrides.kind ?? 'local_clean',
    regionIds: overrides.regionIds ?? [1],
    createdAt: overrides.createdAt ?? 1,
    applied: overrides.applied ?? true,
    reverted: overrides.reverted ?? false,
    previewMode: overrides.previewMode,
    roiId: overrides.roiId,
    description: overrides.description,
    crop: overrides.crop,
    imageDataUrl: overrides.imageDataUrl,
  };
}

function createAutoChange(patch: ImagePatch): AutoChange {
  return {
    id: `auto-${patch.id}`,
    patchId: patch.id,
    patchKind: patch.kind,
    regionIds: patch.regionIds,
    createdAt: patch.createdAt,
    applied: patch.applied,
    reverted: patch.reverted,
    previewMode: patch.previewMode,
    description: patch.description,
  };
}

describe('editor layer helpers', () => {
  it('buildRestoreOriginalPatch creates an applied restore patch', () => {
    const patch = buildRestoreOriginalPatch({ id: 'restore-1', regionIds: [1], createdAt: 123 });

    expect(patch.kind).toBe('restore_original');
    expect(patch.regionIds).toEqual([1]);
    expect(patch.createdAt).toBe(123);
    expect(patch.applied).toBe(true);
    expect(patch.reverted).toBe(false);
  });

  it('composeCurrentLayer replays patches in created order', () => {
    const baseLayer = ['base'];
    const patches = [
      createPatch({ id: 'late', createdAt: 30 }),
      createPatch({ id: 'early', createdAt: 10 }),
      createPatch({ id: 'skipped', createdAt: 20, applied: false }),
    ];

    const result = composeCurrentLayer({
      baseLayer,
      patches,
      applyPatch: (layer, patch) => [...layer, patch.id],
    });

    expect(result).toEqual(['base', 'early', 'late']);
  });

  it('resolvePreviewBackground prefers current layer when in current mode', () => {
    const background = resolvePreviewBackground({
      previewMode: 'current',
      originalImage: 'original',
      baseAutoLayer: 'auto',
      currentLayer: 'current',
    });

    expect(background).toBe('current');
  });
});

describe('editor store history actions', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    vi.mocked(mergePatchIntoImage).mockClear();
  });

  it('applyPatch supports undo/redo with async actions', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
      selectedElementId: pageModel.regions[0]?.id ?? null,
    });

    const patch = createPatch({ id: 'history-1', createdAt: 11 });
    useEditorStore.getState().applyPatch(patch, 'clean-1');

    expect(useEditorStore.getState().pageModel?.patches?.[0]?.id).toBe('history-1');
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-1');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-1');
    expect(useEditorStore.getState().currentLayer).toBe('clean-1');
    expect(useEditorStore.getState().historyPast).toHaveLength(1);
    expect(useEditorStore.getState().historyFuture).toHaveLength(0);

    const undoResult = useEditorStore.getState().undo();
    expect(undoResult).toBeInstanceOf(Promise);
    await undoResult;

    const patchAfterUndo = useEditorStore
      .getState()
      .pageModel?.patches?.find((item) => item.id === 'history-1');
    expect(patchAfterUndo?.applied).toBe(false);
    expect(patchAfterUndo?.reverted).toBe(true);
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0');

    const redoResult = useEditorStore.getState().redo();
    expect(redoResult).toBeInstanceOf(Promise);
    await redoResult;

    const patchAfterRedo = useEditorStore
      .getState()
      .pageModel?.patches?.find((item) => item.id === 'history-1');
    expect(patchAfterRedo?.applied).toBe(true);
    expect(patchAfterRedo?.reverted).toBe(false);
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-1');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-1');
    expect(useEditorStore.getState().currentLayer).toBe('clean-1');
  });

  it('applyAutoPatch stores auto changes and replays current layer history', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
    });

    const patch = createPatch({ id: 'auto-1', createdAt: 22 });
    const autoChange = createAutoChange(patch);

    useEditorStore.getState().applyAutoPatch(patch, autoChange, 'current-1');

    const stored = useEditorStore.getState().pageModel?.autoChanges?.[0];
    expect(stored?.id).toBe(autoChange.id);
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('current-1');

    await useEditorStore.getState().undo();
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0');

    await useEditorStore.getState().redo();
    expect(useEditorStore.getState().currentLayer).toBe('current-1');
  });

  it('revertAutoChange recomputes current layer from baseAutoLayer and remaining auto patches', async () => {
    const pageModel = createPageModel();
    const firstPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const secondPatch = createPatch({
      id: 'auto-2',
      kind: 'auto_ai',
      createdAt: 20,
      imageDataUrl: 'patch-2',
      crop: { x: 5, y: 6, width: 7, height: 8 },
    });
    const firstChange = { ...createAutoChange(firstPatch), status: 'new' as const };
    const secondChange = { ...createAutoChange(secondPatch), status: 'seen' as const };

    useEditorStore.setState({
      pageModel: {
        ...pageModel,
        patches: [firstPatch, secondPatch],
        autoChanges: [firstChange, secondChange],
      },
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0>patch-1>patch-2',
    });

    await useEditorStore.getState().revertAutoChange(firstChange.id);

    expect(useEditorStore.getState().currentLayer).toBe('clean-0>patch-2');
    expect(useEditorStore.getState().pageModel?.patches?.find((patch) => patch.id === firstPatch.id)).toMatchObject({
      applied: false,
      reverted: true,
    });
    expect(useEditorStore.getState().pageModel?.autoChanges?.find((change) => change.id === firstChange.id)).toMatchObject({
      applied: false,
      reverted: true,
      status: 'reverted',
    });
    expect(vi.mocked(mergePatchIntoImage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mergePatchIntoImage)).toHaveBeenCalledWith(
      'clean-0',
      'patch-2',
      { x: 5, y: 6, width: 7, height: 8 },
      { width: 100, height: 100 },
    );
  });

  it('reset clears sessionHydrated and restores current preview mode', () => {
    useEditorStore.setState({ sessionHydrated: true, previewMode: 'original' });

    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.sessionHydrated).toBe(false);
    expect(state.previewMode).toBe('current');
  });

  it.todo('deleteElement applies restore_original patch for removed regions');

  it('getRoiOverlapRegionIds excludes manual regions from ROI overlap matching', () => {
    const regions = [
      createRegion({ id: 1, source: 'ocr', sourceBounds: { x: 10, y: 10, width: 20, height: 12 } }),
      createRegion({ id: 2, source: 'manual', sourceBounds: { x: 12, y: 12, width: 18, height: 10 } }),
      createRegion({ id: 3, source: 'ocr', sourceBounds: { x: 80, y: 80, width: 8, height: 8 } }),
    ];

    expect(getRoiOverlapRegionIds(regions, { x: 8, y: 8, width: 30, height: 20 })).toEqual([1]);
  });

  it('mergeRoiDetections only removes overlapping non-manual regions', () => {
    const manualRegion = createRegion({
      id: 2,
      source: 'manual',
      sourceBounds: { x: 12, y: 12, width: 18, height: 10 },
      bbox: { x: 12, y: 12, width: 18, height: 10 },
      original: {
        bbox: { x: 12, y: 12, width: 18, height: 10 },
      },
    });
    const pageModel = {
      ...createPageModel(),
      regions: [
        createRegion({ id: 1, sourceBounds: { x: 10, y: 10, width: 20, height: 12 }, bbox: { x: 10, y: 10, width: 20, height: 12 } }),
        manualRegion,
      ],
    };
    const detection: OCRDetection = {
      index: 0,
      text: 'ROI',
      confidence: 0.96,
      bbox: [
        [1, 1],
        [11, 1],
        [11, 7],
        [1, 7],
      ],
      bounds: { x: 1, y: 1, width: 10, height: 6 },
      textColor: { r: 0, g: 0, b: 0 },
      bgColor: { r: 255, g: 255, b: 255 },
    };

    useEditorStore.setState({
      pageModel,
      nextRegionId: 3,
      historyPast: [],
      historyFuture: [],
      selectedElementId: 1,
    });

    useEditorStore.getState().mergeRoiDetections({ x: 8, y: 8, width: 30, height: 20 }, [detection]);

    const regions = useEditorStore.getState().pageModel?.regions ?? [];
    expect(regions.find((region) => region.id === 1)?.removed).toBe(true);
    expect(regions.find((region) => region.id === 2)?.removed).toBe(false);
    expect(regions.find((region) => region.id === 3)?.source).toBe('roi_ocr');
  });
});

describe('preview mode cleanup', () => {
  it('removes legacy preview mode strings from UI entrypoints', () => {
    const root = process.cwd();
    const files = [
      'app/page.tsx',
      'components/editor/ImageUploader.tsx',
      'components/editor/Toolbar.tsx',
      'components/editor/CanvasEditor.tsx',
    ];
    const legacyTokens = [
      "setPreviewMode('final')",
      "setPreviewMode('clean')",
      "previewMode === 'final'",
      "previewMode === 'clean'",
      'value="final"',
      'value="clean"',
    ];

    for (const file of files) {
      const content = readFileSync(resolve(root, file), 'utf-8');
      for (const token of legacyTokens) {
        expect(content.includes(token)).toBe(false);
      }
    }
  });
});

describe('CanvasEditor clampBounds', () => {
  it('returns null instead of fabricating a blank 1x1 crop outside the image edge', () => {
    expect(clampBounds({ x: 100, y: 20, width: 5, height: 5 }, 100, 100)).toBeNull();
    expect(clampBounds({ x: 10, y: 100, width: 5, height: 5 }, 100, 100)).toBeNull();
  });

  it('preserves a 1px crop when the ROI still overlaps the image edge', () => {
    expect(clampBounds({ x: 99.2, y: 20, width: 5, height: 5 }, 100, 100)).toEqual({
      x: 99,
      y: 20,
      width: 1,
      height: 5,
    });
  });
});
