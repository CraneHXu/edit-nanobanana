import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergePatchIntoImage } from '@/lib/api-client';
import { clampBounds } from '@/components/editor/CanvasEditor';
import { buildRestoreOriginalPatch, composeCurrentLayer, resolvePreviewBackground } from '@/lib/editor-layer';
import { generateCleanBackground } from '@/lib/clean-background';
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

vi.mock('@/lib/clean-background', () => ({
  generateCleanBackground: vi.fn(async () => 'clean-rebuilt'),
  estimateRegionComplexity: vi.fn(async () => 0.5),
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
    patch,
    status: 'new',
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
    vi.mocked(generateCleanBackground).mockClear();
  });

  it('initializeFromDetections assigns source=ocr for initial regions', () => {
    const detection: OCRDetection = {
      index: 1,
      text: 'INIT',
      confidence: 0.99,
      bbox: [
        [0, 0],
        [10, 0],
        [10, 5],
        [0, 5],
      ],
      bounds: { x: 0, y: 0, width: 10, height: 5 },
      textColor: { r: 0, g: 0, b: 0 },
      bgColor: { r: 255, g: 255, b: 255 },
    };

    useEditorStore.setState({
      imageMeta: { width: 100, height: 100 },
      imageFile: null,
    });

    useEditorStore.getState().initializeFromDetections([detection]);

    expect(useEditorStore.getState().pageModel?.regions[0]?.source).toBe('ocr');
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
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
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
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-1');
    expect(useEditorStore.getState().currentLayer).toBe('clean-1');
  });

  it('applyAutoPatch stores pending auto preview without mutating confirmed patches', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
    });

    const patch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 22,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = createAutoChange(patch);

    useEditorStore.getState().applyAutoPatch(patch, autoChange, 'clean-0>patch-1');

    const stored = useEditorStore.getState().pageModel?.autoChanges?.[0];
    expect(stored?.id).toBe(autoChange.id);
    expect(stored?.patch).toMatchObject({ id: 'auto-1' });
    expect(useEditorStore.getState().pageModel?.patches ?? []).toHaveLength(0);
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0>patch-1');
  });

  it('confirmAutoChange promotes a pending preview into the confirmed base layer', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
    });

    const patch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 22,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = createAutoChange(patch);

    useEditorStore.getState().applyAutoPatch(patch, autoChange, 'clean-0>patch-1');
    await useEditorStore.getState().confirmAutoChange(autoChange.id);

    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(0);
    expect(useEditorStore.getState().pageModel?.patches?.map((item) => item.id)).toEqual(['auto-1']);
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0>patch-1');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0>patch-1');
    expect(vi.mocked(mergePatchIntoImage)).toHaveBeenCalledWith(
      'clean-0',
      'patch-1',
      { x: 1, y: 2, width: 3, height: 4 },
      { width: 100, height: 100 },
    );
  });

  it('discardAutoChange removes the pending preview and restores the confirmed base layer', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
    });

    const patch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 22,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = createAutoChange(patch);

    useEditorStore.getState().applyAutoPatch(patch, autoChange, 'clean-0>patch-1');
    await useEditorStore.getState().discardAutoChange(autoChange.id);

    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(0);
    expect(useEditorStore.getState().pageModel?.patches ?? []).toHaveLength(0);
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0');
  });

  it('confirmAllAutoChanges promotes every pending preview into the confirmed base layer', async () => {
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
      regionIds: [2],
      createdAt: 20,
      imageDataUrl: 'patch-2',
      crop: { x: 5, y: 6, width: 7, height: 8 },
    });

    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0>patch-1>patch-2',
      historyPast: [],
      historyFuture: [],
    });

    useEditorStore.getState().applyAutoPatch(firstPatch, createAutoChange(firstPatch), 'clean-0>patch-1');
    useEditorStore.getState().applyAutoPatch(secondPatch, createAutoChange(secondPatch), 'clean-0>patch-1>patch-2');
    await useEditorStore.getState().confirmAllAutoChanges();

    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(0);
    expect((useEditorStore.getState().pageModel?.patches ?? []).map((item) => item.id)).toEqual(['auto-1', 'auto-2']);
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0>patch-1>patch-2');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0>patch-1>patch-2');
  });

  it('manual patch application invalidates existing auto changes', () => {
    const autoPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = { ...createAutoChange(autoPatch), status: 'new' as const };
    const pageModel = {
      ...createPageModel(),
      patches: [autoPatch],
      autoChanges: [autoChange],
    };

    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'auto-base',
      currentLayer: 'auto-current',
      historyPast: [],
      historyFuture: [],
    });

    useEditorStore.getState().applyPatch(createPatch({ id: 'manual-1', kind: 'manual_ai', createdAt: 20 }), 'manual-layer');

    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(0);
    expect((useEditorStore.getState().pageModel?.patches ?? []).map((patch) => patch.id)).toEqual(['manual-1']);
    expect(useEditorStore.getState().currentLayer).toBe('manual-layer');
  });

  it('addManualElement preserves existing background layers and pending auto changes', () => {
    const autoPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = { ...createAutoChange(autoPatch), status: 'new' as const };
    const pageModel = {
      ...createPageModel(),
      patches: [autoPatch],
      autoChanges: [autoChange],
    };

    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'auto-base',
      currentLayer: 'auto-current',
      previewMode: 'current',
      historyPast: [],
      historyFuture: [],
      nextRegionId: 9,
    });

    useEditorStore.getState().addManualElement({ x: 10, y: 12, width: 80, height: 24 });

    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(1);
    expect((useEditorStore.getState().pageModel?.patches ?? []).filter((patch) => patch.kind === 'auto_ai')).toHaveLength(1);
    expect(useEditorStore.getState().baseAutoLayer).toBe('auto-base');
    expect(useEditorStore.getState().currentLayer).toBe('auto-current');
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBe('clean-0');
  });

  it('undo after manual patch does not resurrect invalidated auto layers', async () => {
    const autoPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const autoChange = { ...createAutoChange(autoPatch), status: 'new' as const };
    const pageModel = {
      ...createPageModel(),
      patches: [autoPatch],
      autoChanges: [autoChange],
    };

    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'auto-base',
      currentLayer: 'auto-current',
      historyPast: [],
      historyFuture: [],
    });

    useEditorStore.getState().applyPatch(createPatch({ id: 'manual-1', kind: 'manual_ai', createdAt: 20 }), 'manual-layer');
    await useEditorStore.getState().undo();

    expect(useEditorStore.getState().currentLayer).toBe('auto-current');
    expect(useEditorStore.getState().pageModel?.autoChanges ?? []).toHaveLength(1);
  });

  it('discardAutoChange recomputes current layer from baseAutoLayer and remaining pending previews', async () => {
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
    const firstChange = createAutoChange(firstPatch);
    const secondChange = createAutoChange(secondPatch);

    useEditorStore.setState({
      pageModel: {
        ...pageModel,
        autoChanges: [firstChange, secondChange],
      },
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0>patch-1>patch-2',
    });

    await useEditorStore.getState().discardAutoChange(firstChange.id);

    expect(useEditorStore.getState().currentLayer).toBe('clean-0>patch-2');
    expect((useEditorStore.getState().pageModel?.autoChanges ?? []).map((change) => change.id)).toEqual([secondChange.id]);
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

  it('deleteElement invalidates only related auto-ai patches', async () => {
    const firstPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      regionIds: [1],
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const secondPatch = createPatch({
      id: 'auto-2',
      kind: 'auto_ai',
      regionIds: [2],
      createdAt: 20,
      imageDataUrl: 'patch-2',
      crop: { x: 5, y: 6, width: 7, height: 8 },
    });
    const pageModel = {
      ...createPageModel(),
      regions: [
        createRegion({ id: 1 }),
        createRegion({
          id: 2,
          sourceBounds: { x: 12, y: 12, width: 18, height: 10 },
          bbox: { x: 12, y: 12, width: 18, height: 10 },
          original: {
            bbox: { x: 12, y: 12, width: 18, height: 10 },
          },
        }),
      ],
      patches: [firstPatch, secondPatch],
      autoChanges: [
        { ...createAutoChange(firstPatch), status: 'new' as const },
        { ...createAutoChange(secondPatch), status: 'seen' as const },
      ],
    };

    useEditorStore.setState({
      originalImage: 'original',
      pageModel,
      baseAutoLayer: 'auto-base',
      currentLayer: 'auto-current',
      historyPast: [],
      historyFuture: [],
      selectedElementId: 1,
    });

    await useEditorStore.getState().deleteElement(1);

    expect(
      (useEditorStore.getState().pageModel?.patches ?? [])
        .filter((patch) => patch.applied && !patch.reverted)
        .map((patch) => patch.id),
    ).toEqual(['auto-2']);
    expect(
      (useEditorStore.getState().pageModel?.autoChanges ?? [])
        .filter((change) => change.applied && !change.reverted)
        .map((change) => change.patchId),
    ).toEqual(['auto-2']);
  });

  it('deleteElement removes pending auto previews for removed regions so confirmAllAutoChanges will not promote them', async () => {
    const pageModel = {
      ...createPageModel(),
      regions: [
        createRegion({ id: 1 }),
        createRegion({
          id: 2,
          sourceBounds: { x: 12, y: 12, width: 18, height: 10 },
          bbox: { x: 12, y: 12, width: 18, height: 10 },
          original: {
            bbox: { x: 12, y: 12, width: 18, height: 10 },
          },
        }),
      ],
    };

    useEditorStore.setState({
      originalImage: 'original',
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
      selectedElementId: 1,
    });

    const removedPatch = createPatch({
      id: 'auto-1',
      kind: 'auto_ai',
      regionIds: [1],
      createdAt: 10,
      imageDataUrl: 'patch-1',
      crop: { x: 1, y: 2, width: 3, height: 4 },
    });
    const remainingPatch = createPatch({
      id: 'auto-2',
      kind: 'auto_ai',
      regionIds: [2],
      createdAt: 20,
      imageDataUrl: 'patch-2',
      crop: { x: 5, y: 6, width: 7, height: 8 },
    });

    useEditorStore.getState().applyAutoPatch(removedPatch, createAutoChange(removedPatch), 'clean-0>patch-1');
    useEditorStore.getState().applyAutoPatch(remainingPatch, createAutoChange(remainingPatch), 'clean-0>patch-1>patch-2');

    await useEditorStore.getState().deleteElement(1);

    expect((useEditorStore.getState().pageModel?.autoChanges ?? []).map((change) => change.patchId)).toEqual(['auto-2']);

    await useEditorStore.getState().confirmAllAutoChanges();

    expect((useEditorStore.getState().pageModel?.patches ?? []).map((patch) => patch.id)).toEqual(['auto-2']);
  });

  it('getRoiOverlapRegionIds excludes manual regions from ROI overlap matching', () => {
    const regions = [
      createRegion({ id: 1, source: 'ocr', sourceBounds: { x: 10, y: 10, width: 20, height: 12 } }),
      createRegion({ id: 2, source: 'manual', sourceBounds: { x: 12, y: 12, width: 18, height: 10 } }),
      createRegion({ id: 3, source: 'ocr', sourceBounds: { x: 80, y: 80, width: 8, height: 8 } }),
    ];

    expect(getRoiOverlapRegionIds(regions, { x: 8, y: 8, width: 30, height: 20 })).toEqual([1]);
  });

  it('mergeRoiDetections only removes overlapping non-manual regions', async () => {
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
      originalImage: 'original',
      pageModel,
      nextRegionId: 3,
      historyPast: [],
      historyFuture: [],
      selectedElementId: 1,
    });

    await useEditorStore.getState().mergeRoiDetections({ x: 8, y: 8, width: 30, height: 20 }, [detection]);

    const regions = useEditorStore.getState().pageModel?.regions ?? [];
    expect(regions.find((region) => region.id === 1)?.removed).toBe(true);
    expect(regions.find((region) => region.id === 2)?.removed).toBe(false);
    expect(regions.find((region) => region.id === 3)?.source).toBe('roi_ocr');
  });

  it('mergeRoiDetections only updates regions and invalidates the stale clean layer', async () => {
    const pageModel = createPageModel();
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
      originalImage: 'original',
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0',
      historyPast: [],
      historyFuture: [],
      nextRegionId: 2,
      selectedElementId: 1,
    });

    await useEditorStore.getState().mergeRoiDetections({ x: 8, y: 8, width: 30, height: 20 }, [detection]);

    expect(vi.mocked(generateCleanBackground)).toHaveBeenCalledTimes(0);
    expect(useEditorStore.getState().pageModel?.cleanLayer).toBeNull();
    expect(useEditorStore.getState().baseAutoLayer).toBe('clean-0');
    expect(useEditorStore.getState().currentLayer).toBe('clean-0');
  });

  it('mergeRoiDetections preserves unrelated pending auto previews outside the ROI', async () => {
    const pageModel = {
      ...createPageModel(),
      regions: [
        createRegion({ id: 1, sourceBounds: { x: 10, y: 10, width: 20, height: 12 }, bbox: { x: 10, y: 10, width: 20, height: 12 } }),
        createRegion({ id: 2, sourceBounds: { x: 70, y: 70, width: 12, height: 10 }, bbox: { x: 70, y: 70, width: 12, height: 10 } }),
      ],
    };
    const pendingPatch = createPatch({
      id: 'auto-2',
      kind: 'auto_ai',
      regionIds: [2],
      createdAt: 20,
      imageDataUrl: 'patch-2',
      crop: { x: 70, y: 70, width: 12, height: 10 },
    });
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
      originalImage: 'original',
      pageModel: {
        ...pageModel,
        autoChanges: [createAutoChange(pendingPatch)],
      },
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0>patch-2',
      nextRegionId: 3,
      historyPast: [],
      historyFuture: [],
      selectedElementId: 1,
    });

    await useEditorStore.getState().mergeRoiDetections({ x: 8, y: 8, width: 30, height: 20 }, [detection]);

    expect((useEditorStore.getState().pageModel?.autoChanges ?? []).map((change) => change.patchId)).toEqual(['auto-2']);
  });

  it('applyPatch keeps unrelated pending auto previews when applying a local patch', () => {
    const pageModel = {
      ...createPageModel(),
      autoChanges: [
        createAutoChange(createPatch({
          id: 'auto-2',
          kind: 'auto_ai',
          regionIds: [2],
          createdAt: 20,
          imageDataUrl: 'patch-2',
          crop: { x: 70, y: 70, width: 12, height: 10 },
        })),
      ],
    };

    useEditorStore.setState({
      pageModel,
      baseAutoLayer: 'clean-0',
      currentLayer: 'clean-0>patch-2',
      historyPast: [],
      historyFuture: [],
    });

    useEditorStore.getState().applyPatch(createPatch({
      id: 'local-1',
      kind: 'local_clean',
      regionIds: [1],
      createdAt: 30,
      imageDataUrl: 'local-1',
      crop: { x: 10, y: 10, width: 20, height: 12 },
    }), 'clean-0>local-1>patch-2');

    expect((useEditorStore.getState().pageModel?.autoChanges ?? []).map((change) => change.patchId)).toEqual(['auto-2']);
    expect(useEditorStore.getState().currentLayer).toBe('clean-0>local-1>patch-2');
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
