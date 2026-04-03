/**
 * Editor state management with a model-only text region store.
 */

import { create } from 'zustand';
import { mergePatchIntoImage } from '@/lib/api-client';
import { generateCleanBackground } from '@/lib/clean-background';
import { applyPageMutation, createManualTextElement, PageMutation } from '@/lib/editor-mutations';
import { estimateFontSizeToBox } from '@/lib/text-layout';
import { BoundingBox, OCRDetection } from '@/types/ocr';
import { AutoChange, ImagePatch, PageModel, PreviewMode, TextElement } from '@/types/canvas';

export type EditorMode = 'select' | 'eraser' | 'add-text' | 'roi';
export type RoiAction = 'ocr' | 'local-repair' | 'ai-repair';

interface ImageMeta {
  width: number;
  height: number;
}

interface EditorState {
  originalImage: string | null;
  imageFile: File | null;
  imageMeta: ImageMeta | null;
  pageModel: PageModel | null;
  baseAutoLayer: string | null;
  currentLayer: string | null;
  autoAiRevision: number;
  canvas: any | null;
  canvasScale: number;
  viewportZoom: number;
  viewportPan: { x: number; y: number };
  selectedElementId: number | null;
  editorMode: EditorMode;
  pendingRoiAction: RoiAction | null;
  previewMode: PreviewMode;
  eraserSize: number;
  isComparing: boolean;
  isLoading: boolean;
  isDetecting: boolean;
  isCleaningBackground: boolean;
  sessionHydrated: boolean;
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  nextRegionId: number;
  bumpAutoAiRevision: () => number;
  loadImage: (file: File) => Promise<void>;
  initializeFromDetections: (detections: OCRDetection[]) => void;
  hydrateSession: (payload: { originalImage: string; imageMeta: ImageMeta; pageModel: PageModel }) => void;
  markSessionHydrated: () => void;
  setCanvas: (canvas: any) => void;
  setCanvasScale: (scale: number) => void;
  setViewportZoom: (zoom: number) => void;
  setViewportPan: (pan: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  updateElement: (id: number, updates: Partial<TextElement>) => void;
  replaceElements: (elements: TextElement[]) => void;
  addManualElement: (bounds: BoundingBox) => number | null;
  mergeRoiDetections: (roiBounds: BoundingBox, detections: OCRDetection[]) => Promise<void>;
  deleteElement: (id: number) => Promise<void>;
  toggleShowText: (id: number) => void;
  resetElement: (id: number) => void;
  restoreAll: () => void;
  setSelectedElement: (id: number | null) => void;
  setIsDetecting: (isDetecting: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setPendingRoiAction: (action: RoiAction | null) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setEraserSize: (size: number) => void;
  setIsComparing: (isComparing: boolean) => void;
  setIsCleaningBackground: (isCleaningBackground: boolean) => void;
  setCleanLayer: (cleanLayer: string | null) => void;
  setBaseAutoLayer: (layer: string | null) => void;
  setCurrentLayer: (layer: string | null) => void;
  applyPatch: (patch: ImagePatch, nextLayer?: string | null) => void;
  applyAutoPatch: (patch: ImagePatch, autoChange: AutoChange, nextLayer?: string | null) => void;
  confirmAutoChange: (changeId: string) => Promise<void>;
  confirmAllAutoChanges: () => Promise<void>;
  discardAutoChange: (changeId: string) => Promise<void>;
  revertAutoChange: (changeId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  reset: () => void;
}

async function readImageData(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<ImageMeta>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = reject;
    image.src = dataUrl;
  });

  return { dataUrl, ...dimensions };
}

function buildOriginalSnapshot(region: Omit<TextElement, 'original'>): TextElement['original'] {
  return {
    bbox: { ...region.bbox },
    text: region.text,
    fontFamily: region.fontFamily,
    fontSize: region.fontSize,
    layoutOffsetY: region.layoutOffsetY,
    fontWeight: region.fontWeight,
    textAlign: region.textAlign,
    fontColor: { ...region.fontColor },
    textColorRaw: { ...region.textColorRaw },
    textColorMode: region.textColorMode,
    bgColor: region.bgColor ? { ...region.bgColor } : null,
    bgMode: region.bgMode,
    showBackground: region.showBackground,
    showText: region.showText,
  };
}

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

function distanceBetween(a: [number, number], b: [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function deriveRenderGeometry(
  polygon: [number, number][] | undefined,
  fallbackBounds: BoundingBox,
): { bbox: BoundingBox; rotation: number } {
  if (!polygon || polygon.length < 4) {
    return {
      bbox: cloneBounds(fallbackBounds),
      rotation: 0,
    };
  }

  const [p0, p1, , p3] = polygon;
  const width = distanceBetween(p0, p1);
  const height = distanceBetween(p0, p3);

  if (width < 1 || height < 1) {
    return {
      bbox: cloneBounds(fallbackBounds),
      rotation: 0,
    };
  }

  return {
    bbox: {
      x: p0[0],
      y: p0[1],
      width,
      height,
    },
    rotation: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * (180 / Math.PI),
  };
}

function createTextElement(detection: OCRDetection): TextElement {
  const sourcePolygon = clonePolygon(detection.bbox.map(([x, y]) => [x, y] as [number, number]));
  const sourceBounds = cloneBounds(detection.bounds);
  const geometry = deriveRenderGeometry(sourcePolygon, sourceBounds);
  const fontWeight = detection.fontWeight ?? 'normal';
  const fontSize = detection.fontSize ?? estimateFontSizeToBox(detection.text, geometry.bbox, 'Noto Sans SC', fontWeight);
  const textColorRaw = detection.textColorRaw ?? detection.textColor;
  const textColorQuantized = detection.textColorQuantized ?? detection.textColor;

  const base: Omit<TextElement, 'original'> = {
    id: detection.index,
    source: 'ocr',
    removed: false,
    sourceBounds,
    bbox: geometry.bbox,
    sourcePolygon,
    rotation: geometry.rotation,
    layoutOffsetY: 0,
    text: detection.text,
    confidence: detection.confidence,
    fontFamily: 'Noto Sans SC',
    fontSize,
    fontWeight,
    textAlign: detection.textAlign ?? 'left',
    fontColor: { ...detection.textColor },
    textColorRaw: { ...textColorRaw },
    textColorMode: 'auto',
    textColorQuantized: { ...textColorQuantized },
    bgColor: { ...detection.bgColor },
    bgMode: 'fill',
    showBackground: true,
    showText: true,
    eraserPaths: [],
  };

  return {
    ...base,
    original: buildOriginalSnapshot(base),
  };
}

function normalizeTextElement(region: any): TextElement {
  const normalizedSource =
    region.source === 'manual' || region.source === 'roi_ocr' || region.source === 'ocr'
      ? region.source
      : 'ocr';
  const sourcePolygon = clonePolygon(region.sourcePolygon ?? region.polygon);
  const sourceBounds = cloneBounds(region.sourceBounds ?? region.original?.bbox ?? region.bbox);
  const geometry = deriveRenderGeometry(sourcePolygon, sourceBounds);
  const bbox = cloneBounds(region.bbox ?? geometry.bbox);
  const fontWeight = region.fontWeight === 'bold' ? 'bold' : 'normal';
  const textAlign = region.textAlign === 'center' || region.textAlign === 'right' ? region.textAlign : 'left';
  const fontSize = typeof region.fontSize === 'number'
    ? region.fontSize
    : estimateFontSizeToBox(String(region.text || ''), bbox, region.fontFamily || 'Noto Sans SC', fontWeight);

  const normalized: Omit<TextElement, 'original'> = {
    id: region.id,
    source: normalizedSource,
    removed: region.removed === true,
    sourceBounds,
    bbox,
    sourcePolygon,
    rotation: typeof region.rotation === 'number' ? region.rotation : geometry.rotation,
    layoutOffsetY: typeof region.layoutOffsetY === 'number' ? region.layoutOffsetY : 0,
    text: String(region.text || ''),
    confidence: typeof region.confidence === 'number' ? region.confidence : 0,
    fontFamily: region.fontFamily || 'Noto Sans SC',
    fontSize,
    fontWeight,
    textAlign,
    fontColor: region.fontColor ?? { r: 0, g: 0, b: 0 },
    textColorRaw: region.textColorRaw ?? region.fontColor ?? { r: 0, g: 0, b: 0 },
    textColorMode: region.textColorMode === 'manual' ? 'manual' : 'auto',
    textColorQuantized: region.textColorQuantized ?? region.textColorRaw ?? region.fontColor ?? { r: 0, g: 0, b: 0 },
    bgColor: region.bgColor ?? { r: 255, g: 255, b: 255 },
    bgMode: region.bgMode === 'manual' || region.bgMode === 'none' || region.bgMode === 'inpaint' ? region.bgMode : 'fill',
    showBackground: true,
    showText: region.showText !== false,
    eraserPaths: Array.isArray(region.eraserPaths) ? region.eraserPaths : [],
  };

  return {
    ...normalized,
    original: region.original
      ? {
          ...buildOriginalSnapshot(normalized),
          ...region.original,
          bbox: cloneBounds(region.original.bbox ?? normalized.bbox),
          layoutOffsetY: typeof region.original.layoutOffsetY === 'number' ? region.original.layoutOffsetY : normalized.layoutOffsetY,
          fontColor: region.original.fontColor ?? normalized.fontColor,
          textColorRaw: region.original.textColorRaw ?? normalized.textColorRaw,
          bgColor: region.original.bgColor ?? normalized.bgColor,
          showBackground: true,
        }
      : buildOriginalSnapshot(normalized),
  };
}

function normalizePageModel(pageModel: PageModel): PageModel {
  return {
    ...pageModel,
    regions: Array.isArray(pageModel.regions) ? pageModel.regions.map(normalizeTextElement) : [],
    cleanLayer: pageModel.cleanLayer ?? null,
  };
}

function replaceRegion(regions: TextElement[], id: number, updater: (region: TextElement) => TextElement): TextElement[] {
  return regions.map((region) => (region.id === id ? updater(region) : region));
}

function getActiveRegions(regions: TextElement[]): TextElement[] {
  return regions.filter((region) => !region.removed);
}

function shouldInvalidateCleanLayer(updates: Partial<TextElement>): boolean {
  return (
    'sourceBounds' in updates
    || 'sourcePolygon' in updates
  );
}

function normalizePreviewMode(mode: PreviewMode | string): PreviewMode {
  if (mode === 'original' || mode === 'auto' || mode === 'current') {
    return mode;
  }
  return 'current';
}

interface HistoryEntry {
  undo: PageMutation[];
  redo: PageMutation[];
  selectedElementId?: number | null;
  nextSelectedElementId?: number | null;
  previousLayerState?: LayerHistoryState;
  nextLayerState?: LayerHistoryState;
  previousAutoChanges?: AutoChange[];
  nextAutoChanges?: AutoChange[];
}

interface LayerHistoryState {
  cleanLayer: string | null;
  baseAutoLayer: string | null;
  currentLayer: string | null;
}

function applyMutations(pageModel: PageModel, mutations: PageMutation[]): PageModel {
  return mutations.reduce((model, mutation) => applyPageMutation(model, mutation), pageModel);
}

function deriveNextRegionId(regions: TextElement[]): number {
  return regions.reduce((maxId, region) => Math.max(maxId, region.id), 0) + 1;
}

function updateAutoChange(
  pageModel: PageModel,
  changeId: string,
  updater: (change: AutoChange) => AutoChange,
): PageModel {
  const nextAutoChanges = pageModel.autoChanges?.map((change) => (
    change.id === changeId ? updater(change) : change
  ));

  const targetChange = pageModel.autoChanges?.find((change) => change.id === changeId);
  const nextPatches = targetChange
    ? pageModel.patches?.map((patch) => (
        patch.id === targetChange.patchId
          ? { ...patch, applied: false, reverted: true }
          : patch
      ))
    : pageModel.patches;

  return {
    ...pageModel,
    autoChanges: nextAutoChanges,
    patches: nextPatches,
  };
}

function getPendingAutoPatch(change: AutoChange): ImagePatch | null {
  const patch = change.patch;
  if (!patch?.imageDataUrl || !patch.crop) {
    return null;
  }
  return patch;
}

function collectRemovedRegionIds(pageModel: PageModel): Set<number> {
  return new Set(pageModel.regions.filter((region) => region.removed).map((region) => region.id));
}

function autoChangeTargetsRemovedRegion(change: AutoChange, removedRegionIds: Set<number>): boolean {
  return change.regionIds.some((regionId) => removedRegionIds.has(regionId));
}

function removePendingAutoChangesForRegions(
  pageModel: PageModel,
  removedRegionIds: number[],
): { nextPageModel: PageModel; removedChanges: AutoChange[] } {
  const confirmedPatchIds = new Set((pageModel.patches ?? []).map((patch) => patch.id));
  const removedChanges: AutoChange[] = [];

  const remainingChanges = (pageModel.autoChanges ?? []).filter((change) => {
    const isPendingPreview = getPendingAutoPatch(change) != null && !confirmedPatchIds.has(change.patchId);
    const overlapsRemoved = change.regionIds.some((regionId) => removedRegionIds.includes(regionId));
    if (isPendingPreview && overlapsRemoved) {
      removedChanges.push(change);
      return false;
    }
    return true;
  });

  if (removedChanges.length === 0) {
    return { nextPageModel: pageModel, removedChanges };
  }

  return {
    nextPageModel: {
      ...pageModel,
      autoChanges: remainingChanges,
    },
    removedChanges,
  };
}

function sortByCreatedAt<T extends { createdAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt);
}

function patchesOverlapByRegionIds(left: Pick<ImagePatch, 'regionIds'>, right: Pick<ImagePatch, 'regionIds'>): boolean {
  return left.regionIds.some((regionId) => right.regionIds.includes(regionId));
}

function shouldReplaceConfirmedPatch(existing: ImagePatch, nextPatch: ImagePatch): boolean {
  if (existing.reverted) {
    return false;
  }

  if (existing.kind === 'restore_original' && nextPatch.kind === 'restore_original') {
    return patchesOverlapByRegionIds(existing, nextPatch);
  }

  const replaceableKinds: ImagePatch['kind'][] = ['local_clean', 'manual_ai', 'auto_ai'];
  return replaceableKinds.includes(existing.kind)
    && replaceableKinds.includes(nextPatch.kind)
    && patchesOverlapByRegionIds(existing, nextPatch);
}

function removeConflictingConfirmedPatches(
  patches: ImagePatch[] | undefined,
  nextPatch: ImagePatch,
): ImagePatch[] {
  return (patches ?? []).filter((patch) => !shouldReplaceConfirmedPatch(patch, nextPatch));
}

function removeConflictingPendingAutoChanges(
  autoChanges: AutoChange[] | undefined,
  nextPatch: ImagePatch,
): AutoChange[] {
  return (autoChanges ?? []).filter((change) => {
    const pendingPatch = getPendingAutoPatch(change);
    if (!pendingPatch) {
      return true;
    }
    return !patchesOverlapByRegionIds(pendingPatch, nextPatch);
  });
}

function intersectsBoundingBox(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function getRoiOverlapRegionIds(regions: TextElement[], roiBounds: BoundingBox): number[] {
  return regions
    .filter((region) => !region.removed && region.source !== 'manual' && intersectsBoundingBox(region.sourceBounds, roiBounds))
    .map((region) => region.id);
}

function captureLayerState(state: Pick<EditorState, 'pageModel' | 'baseAutoLayer' | 'currentLayer'>): LayerHistoryState {
  return {
    cleanLayer: state.pageModel?.cleanLayer ?? null,
    baseAutoLayer: state.baseAutoLayer,
    currentLayer: state.currentLayer,
  };
}

function createClearedLayerState(): LayerHistoryState {
  return {
    cleanLayer: null,
    baseAutoLayer: null,
    currentLayer: null,
  };
}

function captureInvalidatedAutoLayerState(
  state: Pick<EditorState, 'pageModel' | 'baseAutoLayer'>,
): LayerHistoryState {
  const cleanLayer = state.pageModel?.cleanLayer ?? null;
  const confirmedBaseLayer = state.baseAutoLayer ?? cleanLayer;
  return {
    cleanLayer,
    baseAutoLayer: confirmedBaseLayer,
    currentLayer: confirmedBaseLayer,
  };
}

function invalidateAutoChanges(pageModel: PageModel): PageModel {
  return {
    ...pageModel,
    autoChanges: [],
  };
}

function applyLayerState(pageModel: PageModel, layerState: LayerHistoryState): PageModel {
  return {
    ...pageModel,
    cleanLayer: layerState.cleanLayer,
  };
}

async function rebuildLayerStateFromPageModel(
  originalImage: string,
  pageModel: PageModel,
): Promise<LayerHistoryState> {
  const cleanLayer = await generateCleanBackground(originalImage, pageModel);
  const pageSize = {
    width: pageModel.originalWidth,
    height: pageModel.originalHeight,
  };

  let confirmedLayer = cleanLayer;
  const activeConfirmedPatches = (pageModel.patches ?? [])
    .filter((patch) => patch.applied && !patch.reverted)
    .filter((patch) => patch.imageDataUrl && patch.crop)
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const patch of activeConfirmedPatches) {
    if (!patch.imageDataUrl || !patch.crop) {
      throw new Error(`Patch ${patch.id} is missing layer asset data`);
    }
    confirmedLayer = await mergePatchIntoImage(confirmedLayer, patch.imageDataUrl, patch.crop, pageSize);
  }

  return {
    cleanLayer,
    baseAutoLayer: confirmedLayer,
    currentLayer: confirmedLayer,
  };
}

async function rebuildCurrentLayerFromPendingAutoChanges(
  baseLayer: string | null,
  pageModel: PageModel,
): Promise<string | null> {
  if (!baseLayer) {
    return null;
  }

  const pendingAutoPatches = sortByCreatedAt(pageModel.autoChanges ?? [])
    .map((change) => getPendingAutoPatch(change))
    .filter((patch): patch is ImagePatch => patch != null);

  if (pendingAutoPatches.length === 0) {
    return baseLayer;
  }

  const pageSize = {
    width: pageModel.originalWidth,
    height: pageModel.originalHeight,
  };

  let previewLayer = baseLayer;
  for (const patch of pendingAutoPatches) {
    previewLayer = await mergePatchIntoImage(previewLayer, patch.imageDataUrl!, patch.crop!, pageSize);
  }

  return previewLayer;
}

function getRelatedAutoPatches(pageModel: PageModel, regionIds: number[]): Array<{ patch: ImagePatch; autoChange?: AutoChange }> {
  const relatedPatches = (pageModel.patches ?? [])
    .filter((patch) => patch.kind === 'auto_ai')
    .filter((patch) => patch.regionIds.some((regionId) => regionIds.includes(regionId)));

  return relatedPatches.map((patch) => ({
    patch,
    autoChange: pageModel.autoChanges?.find((change) => change.patchId === patch.id),
  }));
}

function shiftDetectionToPage(
  detection: OCRDetection,
  offsetX: number,
  offsetY: number,
  nextId: number,
): OCRDetection {
  return {
    ...detection,
    index: nextId,
    bbox: detection.bbox.map(([x, y]) => [x + offsetX, y + offsetY] as [number, number]),
    bounds: {
      x: detection.bounds.x + offsetX,
      y: detection.bounds.y + offsetY,
      width: detection.bounds.width,
      height: detection.bounds.height,
    },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  originalImage: null,
  imageFile: null,
  imageMeta: null,
  pageModel: null,
  baseAutoLayer: null,
  currentLayer: null,
  autoAiRevision: 0,
  canvas: null,
  canvasScale: 1,
  viewportZoom: 1,
  viewportPan: { x: 0, y: 0 },
  selectedElementId: null,
  editorMode: 'select',
  pendingRoiAction: null,
  previewMode: 'current',
  eraserSize: 20,
  isComparing: false,
  isLoading: false,
  isDetecting: false,
  isCleaningBackground: false,
  sessionHydrated: false,
  historyPast: [],
  historyFuture: [],
  nextRegionId: 1,
  bumpAutoAiRevision: () => {
    const nextRevision = get().autoAiRevision + 1;
    set({ autoAiRevision: nextRevision });
    return nextRevision;
  },

  loadImage: async (file: File) => {
    set({ isLoading: true });
    try {
      const { dataUrl, width, height } = await readImageData(file);
      const nextRevision = get().autoAiRevision + 1;
      set({
        originalImage: dataUrl,
        imageFile: file,
        imageMeta: { width, height },
        pageModel: null,
        baseAutoLayer: null,
        currentLayer: null,
        canvasScale: 1,
        isLoading: false,
        selectedElementId: null,
        isComparing: false,
        previewMode: 'current',
        pendingRoiAction: null,
        sessionHydrated: false,
        historyPast: [],
        historyFuture: [],
        nextRegionId: 1,
        autoAiRevision: nextRevision,
      });
    } catch (error) {
      console.error('Failed to load image:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  initializeFromDetections: (detections: OCRDetection[]) => {
    const { imageMeta, imageFile } = get();
    if (!imageMeta) {
      throw new Error('Image metadata is missing');
    }

    const regions = detections.map(createTextElement);
    const nextRegionId = deriveNextRegionId(regions);
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: {
        imageId: imageFile?.name || `image-${Date.now()}`,
        originalWidth: imageMeta.width,
        originalHeight: imageMeta.height,
        regions,
        cleanLayer: null,
      },
      selectedElementId: regions[0]?.id ?? null,
      previewMode: 'current',
      pendingRoiAction: null,
      baseAutoLayer: null,
      currentLayer: null,
      historyPast: [],
      historyFuture: [],
      nextRegionId,
      autoAiRevision: nextRevision,
    });
  },

  hydrateSession: ({ originalImage, imageMeta, pageModel }) => {
    const normalizedPageModel = normalizePageModel(pageModel);
    const nextRevision = get().autoAiRevision + 1;
    set({
      originalImage,
      imageMeta,
      imageFile: null,
      pageModel: normalizedPageModel,
      selectedElementId: normalizedPageModel.regions[0]?.id ?? null,
      previewMode: 'current',
      pendingRoiAction: null,
      sessionHydrated: true,
      baseAutoLayer: null,
      currentLayer: null,
      historyPast: [],
      historyFuture: [],
      nextRegionId: deriveNextRegionId(normalizedPageModel.regions),
      autoAiRevision: nextRevision,
    });
  },

  markSessionHydrated: () => set({ sessionHydrated: true }),

  setCanvas: (canvas: any) => set({ canvas }),
  setCanvasScale: (scale: number) => set({ canvasScale: scale }),

  setViewportZoom: (zoom: number) => {
    const clampedZoom = Math.min(Math.max(zoom, 0.25), 4);
    set({ viewportZoom: clampedZoom });
  },

  setViewportPan: (pan: { x: number; y: number }) => set({ viewportPan: pan }),

  zoomIn: () => {
    const { viewportZoom, setViewportZoom } = get();
    setViewportZoom(viewportZoom * 1.2);
  },

  zoomOut: () => {
    const { viewportZoom, setViewportZoom } = get();
    setViewportZoom(viewportZoom / 1.2);
  },

  resetZoom: () => set({ viewportZoom: 1, viewportPan: { x: 0, y: 0 } }),

  updateElement: (id: number, updates: Partial<TextElement>) => {
    const { pageModel, previewMode } = get();
    if (!pageModel) return;
    const invalidateCleanLayer = shouldInvalidateCleanLayer(updates);
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: {
        ...pageModel,
        regions: replaceRegion(pageModel.regions, id, (region) => ({ ...region, ...updates })),
        cleanLayer: invalidateCleanLayer ? null : (pageModel.cleanLayer ?? null),
      },
      baseAutoLayer: invalidateCleanLayer ? null : get().baseAutoLayer,
      currentLayer: invalidateCleanLayer ? null : get().currentLayer,
      previewMode: invalidateCleanLayer ? 'current' : previewMode,
      autoAiRevision: nextRevision,
    });
  },

  replaceElements: (elements: TextElement[]) => {
    const { pageModel } = get();
    if (!pageModel) return;
    const nextRevision = get().autoAiRevision + 1;
    set({
      pageModel: {
        ...pageModel,
        regions: elements,
        cleanLayer: null,
      },
      baseAutoLayer: null,
      currentLayer: null,
      previewMode: 'current',
      nextRegionId: deriveNextRegionId(elements),
      autoAiRevision: nextRevision,
    });
  },

  addManualElement: (bounds: BoundingBox) => {
    const state = get();
    const { pageModel, historyPast, selectedElementId, nextRegionId } = state;
    if (!pageModel) {
      return null;
    }

    const element = createManualTextElement({
      id: nextRegionId,
      text: '',
      bbox: cloneBounds(bounds),
      sourceBounds: cloneBounds(bounds),
      fontSize: Math.max(16, Math.round(bounds.height * 0.65)),
    });
    const nextPageModel = applyMutations(pageModel, [{ type: 'add-region', element }]);
    const nextRevision = get().autoAiRevision + 1;
    const previousLayerState = captureLayerState(state);
    const nextLayerState = previousLayerState;

    set({
      pageModel: applyLayerState(nextPageModel, nextLayerState),
      baseAutoLayer: nextLayerState.baseAutoLayer,
      currentLayer: nextLayerState.currentLayer,
      selectedElementId: element.id,
      editorMode: 'select',
      pendingRoiAction: null,
      previewMode: 'current',
      historyPast: [
        ...historyPast,
        {
          undo: [{ type: 'remove-region', regionId: element.id }],
          redo: [{ type: 'restore-region', regionId: element.id }],
          selectedElementId,
          nextSelectedElementId: element.id,
          previousLayerState,
          nextLayerState,
          previousAutoChanges: pageModel.autoChanges,
          nextAutoChanges: nextPageModel.autoChanges,
        },
      ],
      historyFuture: [],
      nextRegionId: element.id + 1,
      autoAiRevision: nextRevision,
    });

    return element.id;
  },

  mergeRoiDetections: async (roiBounds: BoundingBox, detections: OCRDetection[]) => {
    const state = get();
    const { pageModel, historyPast, nextRegionId, selectedElementId } = state;
    if (!pageModel || !state.originalImage) {
      return;
    }

    const overlappingRegionIds = getRoiOverlapRegionIds(pageModel.regions, roiBounds);
    const nextRegions = detections.map((detection, index) => {
      const shifted = shiftDetectionToPage(detection, roiBounds.x, roiBounds.y, nextRegionId + index);
      return {
        ...createTextElement(shifted),
        source: 'roi_ocr' as const,
        confirmed: true,
        excludedFromClean: false,
        lowConfidence: false,
      };
    });

    if (overlappingRegionIds.length === 0 && nextRegions.length === 0) {
      return;
    }

    const initialMutations: PageMutation[] = [
      ...overlappingRegionIds.map((regionId) => ({ type: 'remove-region', regionId }) as const),
      ...nextRegions.map((element) => ({ type: 'add-region', element }) as const),
    ];
    const undo: PageMutation[] = [
      ...overlappingRegionIds.map((regionId) => ({ type: 'restore-region', regionId }) as const),
      ...nextRegions.map((element) => ({ type: 'remove-region', regionId: element.id }) as const),
    ];
    const redo: PageMutation[] = [
      ...overlappingRegionIds.map((regionId) => ({ type: 'remove-region', regionId }) as const),
      ...nextRegions.map((element) => ({ type: 'restore-region', regionId: element.id }) as const),
    ];
    const pageModelWithRelevantPendingAutoChanges = removePendingAutoChangesForRegions(pageModel, overlappingRegionIds).nextPageModel;
    const nextPageModel = applyMutations(pageModelWithRelevantPendingAutoChanges, initialMutations);
    const nextActiveRegions = getActiveRegions(nextPageModel.regions);
    const nextSelectedElementId = nextRegions[0]?.id ?? nextActiveRegions[0]?.id ?? null;
    const nextRevision = get().autoAiRevision + 1;
    const previousLayerState = captureInvalidatedAutoLayerState(state);
    const nextLayerState = {
      cleanLayer: null,
      baseAutoLayer: previousLayerState.baseAutoLayer,
      currentLayer: previousLayerState.currentLayer,
    };

    set({
      pageModel: applyLayerState(nextPageModel, nextLayerState),
      baseAutoLayer: nextLayerState.baseAutoLayer,
      currentLayer: nextLayerState.currentLayer,
      selectedElementId: nextSelectedElementId,
      editorMode: 'select',
      pendingRoiAction: null,
      previewMode: 'current',
      historyPast: [
        ...historyPast,
        {
          undo,
          redo,
          selectedElementId,
          nextSelectedElementId,
          previousLayerState,
          nextLayerState,
          previousAutoChanges: pageModel.autoChanges,
          nextAutoChanges: nextPageModel.autoChanges,
        },
      ],
      historyFuture: [],
      nextRegionId: deriveNextRegionId(nextPageModel.regions),
      autoAiRevision: nextRevision,
    });
  },

  deleteElement: async (id: number) => {
    const state = get();
    const { pageModel, historyPast, selectedElementId } = state;
    if (!pageModel || !state.originalImage) return;

    const relatedAutoEntries = getRelatedAutoPatches(pageModel, [id]);
    const redo: PageMutation[] = [
      ...relatedAutoEntries.map(({ patch, autoChange }) => ({
        type: 'revert-patch' as const,
        patchId: patch.id,
        autoChangeId: autoChange?.id,
      })),
      { type: 'remove-region', regionId: id },
    ];
    const undo: PageMutation[] = [
      { type: 'restore-region', regionId: id },
      ...relatedAutoEntries.map(({ patch, autoChange }) => ({
        type: 'apply-patch' as const,
        patch,
        autoChange,
      })),
    ];
    const mutatedPageModel = applyMutations(pageModel, redo);
    const { nextPageModel } = removePendingAutoChangesForRegions(mutatedPageModel, [id]);
    const nextSelected = getActiveRegions(nextPageModel.regions).find((region) => region.id !== id)?.id ?? null;
    const nextRevision = get().autoAiRevision + 1;
    const previousLayerState = captureLayerState(state);
    const rebuiltLayerState = await rebuildLayerStateFromPageModel(state.originalImage, nextPageModel);
    const nextPreviewLayer = await rebuildCurrentLayerFromPendingAutoChanges(rebuiltLayerState.baseAutoLayer, nextPageModel);
    const nextLayerState = {
      ...rebuiltLayerState,
      currentLayer: nextPreviewLayer ?? rebuiltLayerState.currentLayer,
    };

    set({
      pageModel: applyLayerState(nextPageModel, nextLayerState),
      baseAutoLayer: nextLayerState.baseAutoLayer,
      currentLayer: nextLayerState.currentLayer,
      selectedElementId: nextSelected,
      previewMode: 'current',
      historyPast: [
        ...historyPast,
        {
          redo,
          undo,
          selectedElementId,
          nextSelectedElementId: nextSelected,
          previousLayerState,
          nextLayerState,
          previousAutoChanges: pageModel.autoChanges,
          nextAutoChanges: nextPageModel.autoChanges,
        },
      ],
      historyFuture: [],
      autoAiRevision: nextRevision,
    });
  },

  toggleShowText: (id: number) => {
    const { pageModel } = get();
    if (!pageModel) return;

    set({
      pageModel: {
        ...pageModel,
        regions: replaceRegion(pageModel.regions, id, (region) => ({ ...region, showText: !region.showText })),
      },
    });
  },

  resetElement: (id: number) => {
    const { pageModel } = get();
    if (!pageModel) return;
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: {
        ...invalidateAutoChanges(pageModel),
        regions: replaceRegion(pageModel.regions, id, (region) => ({
          ...region,
          ...region.original,
          removed: false,
          showBackground: true,
          bbox: { ...region.original.bbox },
          layoutOffsetY: region.original.layoutOffsetY,
          fontColor: { ...region.original.fontColor },
          textColorRaw: { ...region.original.textColorRaw },
          bgColor: region.original.bgColor ? { ...region.original.bgColor } : null,
          eraserPaths: [],
        })),
        cleanLayer: null,
      },
      baseAutoLayer: null,
      currentLayer: null,
      previewMode: 'current',
      autoAiRevision: nextRevision,
    });
  },

  restoreAll: () => {
    const { pageModel } = get();
    if (!pageModel) return;
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: {
        ...invalidateAutoChanges(pageModel),
        regions: pageModel.regions.map((region) => ({
          ...region,
          ...region.original,
          removed: false,
          showBackground: true,
          bbox: { ...region.original.bbox },
          layoutOffsetY: region.original.layoutOffsetY,
          fontColor: { ...region.original.fontColor },
          textColorRaw: { ...region.original.textColorRaw },
          bgColor: region.original.bgColor ? { ...region.original.bgColor } : null,
          eraserPaths: [],
        })),
        cleanLayer: null,
      },
      baseAutoLayer: null,
      currentLayer: null,
      selectedElementId: pageModel.regions[0]?.id ?? null,
      previewMode: 'current',
      autoAiRevision: nextRevision,
    });
  },

  setSelectedElement: (id: number | null) => set({ selectedElementId: id }),
  setIsDetecting: (isDetecting: boolean) => set({ isDetecting }),
  setEditorMode: (mode: EditorMode) => set((state) => ({
    editorMode: mode,
    pendingRoiAction: mode === 'roi' ? state.pendingRoiAction : null,
  })),
  setPendingRoiAction: (action: RoiAction | null) => set({ pendingRoiAction: action }),
  setPreviewMode: (mode: PreviewMode) => set({ previewMode: normalizePreviewMode(mode) }),
  setEraserSize: (size: number) => set({ eraserSize: size }),
  setIsComparing: (isComparing: boolean) => set({ isComparing }),
  setIsCleaningBackground: (isCleaningBackground: boolean) => set({ isCleaningBackground }),
  setCleanLayer: (cleanLayer: string | null) => {
    const { pageModel, previewMode } = get();
    if (!pageModel) return;
    const nextRevision = get().autoAiRevision + 1;
    const nextPageModel = invalidateAutoChanges(pageModel);

    set({
      pageModel: applyLayerState(nextPageModel, {
        cleanLayer,
        baseAutoLayer: cleanLayer,
        currentLayer: cleanLayer,
      }),
      baseAutoLayer: cleanLayer,
      currentLayer: cleanLayer,
      previewMode: cleanLayer ? previewMode : 'current',
      autoAiRevision: nextRevision,
    });
  },
  setBaseAutoLayer: (layer: string | null) => set({ baseAutoLayer: layer }),
  setCurrentLayer: (layer: string | null) => set({ currentLayer: layer }),
  applyPatch: (patch: ImagePatch, nextLayer?: string | null) => {
    const state = get();
    const { pageModel, historyPast } = state;
    if (!pageModel) return;
    const basePageModel = patch.kind === 'auto_ai'
      ? pageModel
      : {
          ...pageModel,
          autoChanges: removeConflictingPendingAutoChanges(pageModel.autoChanges, patch),
        };
    const replaceablePageModel = {
      ...basePageModel,
      patches: removeConflictingConfirmedPatches(basePageModel.patches, patch),
    };

    const redo: PageMutation[] = [{ type: 'apply-patch', patch }];
    const undo: PageMutation[] = [{ type: 'revert-patch', patchId: patch.id }];
    const nextPageModel = applyMutations(replaceablePageModel, redo);
    const nextRevision = get().autoAiRevision + 1;
    const previousLayerState = captureLayerState(state);
    const nextLayerState = nextLayer == null
      ? previousLayerState
      : {
          cleanLayer: previousLayerState.cleanLayer,
          baseAutoLayer: nextLayer,
          currentLayer: nextLayer,
        };

    set({
      pageModel: applyLayerState(nextPageModel, nextLayerState),
      baseAutoLayer: nextLayerState.baseAutoLayer,
      currentLayer: nextLayerState.currentLayer,
      historyPast: [
        ...historyPast,
        {
          redo,
          undo,
          previousLayerState,
          nextLayerState,
          previousAutoChanges: pageModel.autoChanges,
          nextAutoChanges: nextPageModel.autoChanges,
        },
      ],
      historyFuture: [],
      autoAiRevision: nextRevision,
    });
  },
  applyAutoPatch: (patch: ImagePatch, autoChange: AutoChange, nextLayer?: string | null) => {
    const state = get();
    const { pageModel } = state;
    if (!pageModel) return;

    const remainingAutoChanges = removeConflictingPendingAutoChanges(pageModel.autoChanges, patch);
    const nextPageModel = {
      ...pageModel,
      autoChanges: [
        ...remainingAutoChanges,
        {
          ...autoChange,
          patch,
          status: 'new' as const,
          applied: true,
          reverted: false,
        },
      ],
    };
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: nextPageModel,
      baseAutoLayer: state.baseAutoLayer,
      currentLayer: nextLayer ?? state.currentLayer,
      autoAiRevision: nextRevision,
    });
  },
  confirmAutoChange: async (changeId: string) => {
    const state = get();
    if (!state.pageModel) return;
    const submittedRevision = state.autoAiRevision + 1;
    set({ autoAiRevision: submittedRevision });

    const targetChange = state.pageModel.autoChanges?.find((change) => change.id === changeId);
    const patch = targetChange ? getPendingAutoPatch(targetChange) : null;
    if (!targetChange || !patch) {
      if (get().autoAiRevision === submittedRevision) {
        set({ autoAiRevision: submittedRevision });
      }
      return;
    }

    const removedRegionIds = collectRemovedRegionIds(state.pageModel);
    if (autoChangeTargetsRemovedRegion(targetChange, removedRegionIds)) {
      const nextPageModel = {
        ...state.pageModel,
        autoChanges: (state.pageModel.autoChanges ?? []).filter((change) => change.id !== changeId),
      };
      const nextCurrentLayer = await rebuildCurrentLayerFromPendingAutoChanges(
        state.baseAutoLayer ?? state.pageModel.cleanLayer ?? state.originalImage ?? null,
        nextPageModel,
      );

      if (get().autoAiRevision !== submittedRevision) {
        return;
      }

      set({
        pageModel: nextPageModel,
        currentLayer: nextCurrentLayer,
        autoAiRevision: submittedRevision,
      });
      return;
    }

    const baseLayer = state.baseAutoLayer ?? state.pageModel.cleanLayer ?? state.originalImage;
    if (!baseLayer) {
      if (get().autoAiRevision !== submittedRevision) {
        return;
      }
      set({ autoAiRevision: submittedRevision });
      return;
    }

    const pageSize = {
      width: state.pageModel.originalWidth,
      height: state.pageModel.originalHeight,
    };
    const nextBaseAutoLayer = await mergePatchIntoImage(baseLayer, patch.imageDataUrl!, patch.crop!, pageSize);

    if (get().autoAiRevision !== submittedRevision) {
      return;
    }

    const nextPageModel = {
      ...state.pageModel,
      patches: [
        ...removeConflictingConfirmedPatches(state.pageModel.patches, patch),
        patch,
      ],
      autoChanges: (state.pageModel.autoChanges ?? []).filter((change) => change.id !== changeId),
    };
    const nextCurrentLayer = await rebuildCurrentLayerFromPendingAutoChanges(nextBaseAutoLayer, nextPageModel);

    if (get().autoAiRevision !== submittedRevision) {
      return;
    }

    set({
      pageModel: nextPageModel,
      baseAutoLayer: nextBaseAutoLayer,
      currentLayer: nextCurrentLayer,
      autoAiRevision: submittedRevision,
    });
  },
  confirmAllAutoChanges: async () => {
    const state = get();
    if (!state.pageModel) return;
    const removedRegionIds = collectRemovedRegionIds(state.pageModel);
    const pendingChanges = sortByCreatedAt(state.pageModel.autoChanges ?? [])
      .filter((change) => getPendingAutoPatch(change) != null)
      .filter((change) => !autoChangeTargetsRemovedRegion(change, removedRegionIds));
    if (pendingChanges.length === 0) {
      const stalePreviewIds = new Set(
        sortByCreatedAt(state.pageModel.autoChanges ?? [])
          .filter((change) => getPendingAutoPatch(change) != null)
          .filter((change) => autoChangeTargetsRemovedRegion(change, removedRegionIds))
          .map((change) => change.id),
      );
      if (stalePreviewIds.size > 0) {
        set({
          pageModel: {
            ...state.pageModel,
            autoChanges: (state.pageModel.autoChanges ?? []).filter((change) => !stalePreviewIds.has(change.id)),
          },
        });
      }
      return;
    }

    const submittedRevision = state.autoAiRevision + 1;
    set({ autoAiRevision: submittedRevision });

    const currentConfirmedOrPreviewLayer = state.currentLayer ?? state.baseAutoLayer ?? state.pageModel.cleanLayer ?? state.originalImage;
    const nextBaseAutoLayer = currentConfirmedOrPreviewLayer ?? null;
    const confirmedPatches = pendingChanges
      .map((change) => getPendingAutoPatch(change))
      .filter((patch): patch is ImagePatch => patch != null);

    const nextPageModel = {
      ...state.pageModel,
      patches: confirmedPatches.reduce(
        (patches, patch) => [...removeConflictingConfirmedPatches(patches, patch), patch],
        state.pageModel.patches ?? [],
      ),
      autoChanges: [],
    };

    if (get().autoAiRevision !== submittedRevision) {
      return;
    }

    set({
      pageModel: nextPageModel,
      baseAutoLayer: nextBaseAutoLayer,
      currentLayer: nextBaseAutoLayer,
      autoAiRevision: submittedRevision,
    });
  },
  discardAutoChange: async (changeId: string) => {
    const state = get();
    if (!state.pageModel) return;
    const submittedRevision = state.autoAiRevision + 1;
    set({ autoAiRevision: submittedRevision });

    const nextPageModel = {
      ...state.pageModel,
      autoChanges: (state.pageModel.autoChanges ?? []).filter((change) => change.id !== changeId),
    };

    const nextCurrentLayer = await rebuildCurrentLayerFromPendingAutoChanges(
      state.baseAutoLayer ?? state.pageModel.cleanLayer ?? state.originalImage ?? null,
      nextPageModel,
    );

    if (get().autoAiRevision !== submittedRevision) {
      return;
    }

    set({
      pageModel: nextPageModel,
      currentLayer: nextCurrentLayer,
      autoAiRevision: submittedRevision,
    });
  },
  revertAutoChange: async (changeId: string) => {
    await get().discardAutoChange(changeId);
  },
  undo: async () => {
    const { historyPast, historyFuture, pageModel, selectedElementId } = get();
    if (!pageModel || historyPast.length === 0) return;

    const entry = historyPast[historyPast.length - 1];
    const nextPageModel = applyMutations(pageModel, entry.undo);
    const nextRevision = get().autoAiRevision + 1;
    const pageModelWithLayers = entry.previousLayerState ? applyLayerState(nextPageModel, entry.previousLayerState) : nextPageModel;
    const pageModelWithAutoChanges = entry.previousAutoChanges !== undefined
      ? { ...pageModelWithLayers, autoChanges: entry.previousAutoChanges }
      : pageModelWithLayers;

    set({
      pageModel: pageModelWithAutoChanges,
      baseAutoLayer: entry.previousLayerState?.baseAutoLayer ?? get().baseAutoLayer,
      currentLayer: entry.previousLayerState?.currentLayer ?? get().currentLayer,
      historyPast: historyPast.slice(0, -1),
      historyFuture: [entry, ...historyFuture],
      selectedElementId: entry.selectedElementId ?? selectedElementId,
      autoAiRevision: nextRevision,
    });
  },
  redo: async () => {
    const { historyPast, historyFuture, pageModel, selectedElementId } = get();
    if (!pageModel || historyFuture.length === 0) return;

    const entry = historyFuture[0];
    const nextPageModel = applyMutations(pageModel, entry.redo);
    const nextRevision = get().autoAiRevision + 1;
    const pageModelWithLayers = entry.nextLayerState ? applyLayerState(nextPageModel, entry.nextLayerState) : nextPageModel;
    const pageModelWithAutoChanges = entry.nextAutoChanges !== undefined
      ? { ...pageModelWithLayers, autoChanges: entry.nextAutoChanges }
      : pageModelWithLayers;

    set({
      pageModel: pageModelWithAutoChanges,
      baseAutoLayer: entry.nextLayerState?.baseAutoLayer ?? get().baseAutoLayer,
      currentLayer: entry.nextLayerState?.currentLayer ?? get().currentLayer,
      historyPast: [...historyPast, entry],
      historyFuture: historyFuture.slice(1),
      selectedElementId: entry.nextSelectedElementId ?? selectedElementId,
      autoAiRevision: nextRevision,
    });
  },

  reset: () => {
    const nextRevision = get().autoAiRevision + 1;
    set({
      originalImage: null,
      imageFile: null,
      imageMeta: null,
      pageModel: null,
      baseAutoLayer: null,
      currentLayer: null,
      canvas: null,
      canvasScale: 1,
      viewportZoom: 1,
      viewportPan: { x: 0, y: 0 },
      selectedElementId: null,
      editorMode: 'select',
      pendingRoiAction: null,
      previewMode: 'current',
      eraserSize: 20,
      isComparing: false,
      isLoading: false,
      isDetecting: false,
      isCleaningBackground: false,
      sessionHydrated: false,
      historyPast: [],
      historyFuture: [],
      nextRegionId: 1,
      autoAiRevision: nextRevision,
    });
  },
}));
