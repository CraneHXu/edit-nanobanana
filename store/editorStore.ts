/**
 * Editor state management with a model-only text region store.
 */

import { create } from 'zustand';
import { applyPageMutation, PageMutation } from '@/lib/editor-mutations';
import { buildRestoreOriginalPatch } from '@/lib/editor-layer';
import { estimateFontSizeToBox } from '@/lib/text-layout';
import { BoundingBox, OCRDetection } from '@/types/ocr';
import { AutoChange, ImagePatch, PageModel, PreviewMode, TextElement } from '@/types/canvas';

export type EditorMode = 'select' | 'eraser';

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
  deleteElement: (id: number) => Promise<void>;
  toggleShowText: (id: number) => void;
  resetElement: (id: number) => void;
  restoreAll: () => void;
  setSelectedElement: (id: number | null) => void;
  setIsDetecting: (isDetecting: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setEraserSize: (size: number) => void;
  setIsComparing: (isComparing: boolean) => void;
  setIsCleaningBackground: (isCleaningBackground: boolean) => void;
  setCleanLayer: (cleanLayer: string | null) => void;
  setBaseAutoLayer: (layer: string | null) => void;
  setCurrentLayer: (layer: string | null) => void;
  applyPatch: (patch: ImagePatch) => void;
  applyAutoPatch: (patch: ImagePatch, autoChange: AutoChange) => void;
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
}

function applyMutations(pageModel: PageModel, mutations: PageMutation[]): PageModel {
  return mutations.reduce((model, mutation) => applyPageMutation(model, mutation), pageModel);
}

function deriveNextRegionId(regions: TextElement[]): number {
  return regions.reduce((maxId, region) => Math.max(maxId, region.id), 0) + 1;
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
      previewMode: 'current',
      nextRegionId: deriveNextRegionId(elements),
      autoAiRevision: nextRevision,
    });
  },

  deleteElement: async (id: number) => {
    const { pageModel, historyPast, selectedElementId } = get();
    if (!pageModel) return;

    const patch = buildRestoreOriginalPatch({ regionIds: [id] });
    const redo: PageMutation[] = [
      { type: 'remove-region', regionId: id },
      { type: 'apply-patch', patch },
    ];
    const undo: PageMutation[] = [
      { type: 'restore-region', regionId: id },
      { type: 'revert-patch', patchId: patch.id },
    ];
    const nextPageModel = applyMutations(pageModel, redo);
    const nextSelected = getActiveRegions(nextPageModel.regions).find((region) => region.id !== id)?.id ?? null;
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: {
        ...nextPageModel,
        cleanLayer: null,
      },
      selectedElementId: nextSelected,
      previewMode: 'current',
      historyPast: [
        ...historyPast,
        {
          redo,
          undo,
          selectedElementId,
          nextSelectedElementId: nextSelected,
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
        ...pageModel,
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
        ...pageModel,
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
      selectedElementId: pageModel.regions[0]?.id ?? null,
      previewMode: 'current',
      autoAiRevision: nextRevision,
    });
  },

  setSelectedElement: (id: number | null) => set({ selectedElementId: id }),
  setIsDetecting: (isDetecting: boolean) => set({ isDetecting }),
  setEditorMode: (mode: EditorMode) => set({ editorMode: mode }),
  setPreviewMode: (mode: PreviewMode) => set({ previewMode: normalizePreviewMode(mode) }),
  setEraserSize: (size: number) => set({ eraserSize: size }),
  setIsComparing: (isComparing: boolean) => set({ isComparing }),
  setIsCleaningBackground: (isCleaningBackground: boolean) => set({ isCleaningBackground }),
  setCleanLayer: (cleanLayer: string | null) => {
    const { pageModel, previewMode } = get();
    if (!pageModel) return;

    set({
      pageModel: {
        ...pageModel,
        cleanLayer,
      },
      previewMode: cleanLayer ? previewMode : 'current',
    });
  },
  setBaseAutoLayer: (layer: string | null) => set({ baseAutoLayer: layer }),
  setCurrentLayer: (layer: string | null) => set({ currentLayer: layer }),
  applyPatch: (patch: ImagePatch) => {
    const { pageModel, historyPast } = get();
    if (!pageModel) return;

    const redo: PageMutation[] = [{ type: 'apply-patch', patch }];
    const undo: PageMutation[] = [{ type: 'revert-patch', patchId: patch.id }];
    const nextPageModel = applyMutations(pageModel, redo);
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: nextPageModel,
      historyPast: [...historyPast, { redo, undo }],
      historyFuture: [],
      autoAiRevision: nextRevision,
    });
  },
  applyAutoPatch: (patch: ImagePatch, autoChange: AutoChange) => {
    const { pageModel, historyPast } = get();
    if (!pageModel) return;

    const redo: PageMutation[] = [{ type: 'apply-patch', patch, autoChange }];
    const undo: PageMutation[] = [{ type: 'revert-patch', patchId: patch.id, autoChangeId: autoChange.id }];
    const nextPageModel = applyMutations(pageModel, redo);
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: nextPageModel,
      historyPast: [...historyPast, { redo, undo }],
      historyFuture: [],
      autoAiRevision: nextRevision,
    });
  },
  undo: async () => {
    const { historyPast, historyFuture, pageModel, selectedElementId } = get();
    if (!pageModel || historyPast.length === 0) return;

    const entry = historyPast[historyPast.length - 1];
    const nextPageModel = applyMutations(pageModel, entry.undo);
    const nextRevision = get().autoAiRevision + 1;

    set({
      pageModel: nextPageModel,
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

    set({
      pageModel: nextPageModel,
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
