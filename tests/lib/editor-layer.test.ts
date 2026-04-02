import { beforeEach, describe, expect, it } from 'vitest';
import { buildRestoreOriginalPatch, composeCurrentLayer, resolvePreviewBackground } from '@/lib/editor-layer';
import { useEditorStore } from '@/store/editorStore';
import type { AutoChange, ImagePatch, PageModel, TextElement } from '@/types/canvas';

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
  });

  it('applyPatch supports undo/redo with async actions', async () => {
    const pageModel = createPageModel();
    useEditorStore.setState({
      pageModel,
      historyPast: [],
      historyFuture: [],
      selectedElementId: pageModel.regions[0]?.id ?? null,
    });

    const patch = createPatch({ id: 'history-1', createdAt: 11 });
    useEditorStore.getState().applyPatch(patch);

    expect(useEditorStore.getState().pageModel?.patches?.[0]?.id).toBe('history-1');
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

    const redoResult = useEditorStore.getState().redo();
    expect(redoResult).toBeInstanceOf(Promise);
    await redoResult;

    const patchAfterRedo = useEditorStore
      .getState()
      .pageModel?.patches?.find((item) => item.id === 'history-1');
    expect(patchAfterRedo?.applied).toBe(true);
    expect(patchAfterRedo?.reverted).toBe(false);
  });

  it('applyAutoPatch stores auto changes', () => {
    const pageModel = createPageModel();
    useEditorStore.setState({ pageModel, historyPast: [], historyFuture: [] });

    const patch = createPatch({ id: 'auto-1', createdAt: 22 });
    const autoChange = createAutoChange(patch);

    useEditorStore.getState().applyAutoPatch(patch, autoChange);

    const stored = useEditorStore.getState().pageModel?.autoChanges?.[0];
    expect(stored?.id).toBe(autoChange.id);
  });

  it('reset clears sessionHydrated and restores current preview mode', () => {
    useEditorStore.setState({ sessionHydrated: true, previewMode: 'original' });

    useEditorStore.getState().reset();

    const state = useEditorStore.getState();
    expect(state.sessionHydrated).toBe(false);
    expect(state.previewMode).toBe('current');
  });

  it.todo('deleteElement applies restore_original patch for removed regions');
});
