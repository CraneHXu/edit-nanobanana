/**
 * Editor state management with a model-only text region store.
 */

import { create } from 'zustand';
import { OCRDetection } from '@/types/ocr';
import { PageModel, TextElement } from '@/types/canvas';

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
  canvas: any | null;
  canvasScale: number;
  viewportZoom: number;
  viewportPan: { x: number; y: number };
  selectedElementId: number | null;
  editorMode: EditorMode;
  eraserSize: number;
  isComparing: boolean;
  isLoading: boolean;
  isDetecting: boolean;
  sessionHydrated: boolean;
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
  toggleShowBackground: (id: number) => void;
  toggleShowText: (id: number) => void;
  resetElement: (id: number) => void;
  restoreAll: () => void;
  setSelectedElement: (id: number | null) => void;
  setIsDetecting: (isDetecting: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setEraserSize: (size: number) => void;
  setIsComparing: (isComparing: boolean) => void;
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

function createTextElement(detection: OCRDetection): TextElement {
  const base: Omit<TextElement, 'original'> = {
    id: detection.index,
    bbox: { ...detection.bounds },
    polygon: detection.bbox.map(([x, y]) => [x, y] as [number, number]),
    text: detection.text,
    confidence: detection.confidence,
    fontFamily: 'Noto Sans SC',
    fontSize: detection.fontSize,
    fontWeight: 'normal',
    textAlign: 'left',
    fontColor: { ...detection.textColor },
    textColorRaw: { ...detection.textColor },
    textColorMode: 'auto',
    textColorQuantized: { ...detection.textColor },
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

function replaceRegion(regions: TextElement[], id: number, updater: (region: TextElement) => TextElement): TextElement[] {
  return regions.map((region) => (region.id === id ? updater(region) : region));
}

export const useEditorStore = create<EditorState>((set, get) => ({
  originalImage: null,
  imageFile: null,
  imageMeta: null,
  pageModel: null,
  canvas: null,
  canvasScale: 1,
  viewportZoom: 1,
  viewportPan: { x: 0, y: 0 },
  selectedElementId: null,
  editorMode: 'select',
  eraserSize: 20,
  isComparing: false,
  isLoading: false,
  isDetecting: false,
  sessionHydrated: false,

  loadImage: async (file: File) => {
    set({ isLoading: true });
    try {
      const { dataUrl, width, height } = await readImageData(file);
      set({
        originalImage: dataUrl,
        imageFile: file,
        imageMeta: { width, height },
        pageModel: null,
        canvasScale: 1,
        isLoading: false,
        selectedElementId: null,
        isComparing: false,
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

    set({
      pageModel: {
        imageId: imageFile?.name || `image-${Date.now()}`,
        originalWidth: imageMeta.width,
        originalHeight: imageMeta.height,
        regions: detections.map(createTextElement),
        cleanLayer: null,
      },
      selectedElementId: detections[0]?.index ?? null,
    });
  },

  hydrateSession: ({ originalImage, imageMeta, pageModel }) => {
    set({
      originalImage,
      imageMeta,
      imageFile: null,
      pageModel,
      selectedElementId: pageModel.regions[0]?.id ?? null,
      sessionHydrated: true,
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
    const { pageModel } = get();
    if (!pageModel) return;

    set({
      pageModel: {
        ...pageModel,
        regions: replaceRegion(pageModel.regions, id, (region) => ({ ...region, ...updates })),
      },
    });
  },

  replaceElements: (elements: TextElement[]) => {
    const { pageModel } = get();
    if (!pageModel) return;
    set({
      pageModel: {
        ...pageModel,
        regions: elements,
      },
    });
  },

  toggleShowBackground: (id: number) => {
    const { pageModel } = get();
    if (!pageModel) return;

    set({
      pageModel: {
        ...pageModel,
        regions: replaceRegion(pageModel.regions, id, (region) => ({ ...region, showBackground: !region.showBackground })),
      },
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

    set({
      pageModel: {
        ...pageModel,
        regions: replaceRegion(pageModel.regions, id, (region) => ({
          ...region,
          ...region.original,
          bbox: { ...region.original.bbox },
          fontColor: { ...region.original.fontColor },
          textColorRaw: { ...region.original.textColorRaw },
          bgColor: region.original.bgColor ? { ...region.original.bgColor } : null,
          eraserPaths: [],
        })),
      },
    });
  },

  restoreAll: () => {
    const { pageModel } = get();
    if (!pageModel) return;

    set({
      pageModel: {
        ...pageModel,
        regions: pageModel.regions.map((region) => ({
          ...region,
          ...region.original,
          bbox: { ...region.original.bbox },
          fontColor: { ...region.original.fontColor },
          textColorRaw: { ...region.original.textColorRaw },
          bgColor: region.original.bgColor ? { ...region.original.bgColor } : null,
          eraserPaths: [],
        })),
      },
      selectedElementId: pageModel.regions[0]?.id ?? null,
    });
  },

  setSelectedElement: (id: number | null) => set({ selectedElementId: id }),
  setIsDetecting: (isDetecting: boolean) => set({ isDetecting }),
  setEditorMode: (mode: EditorMode) => set({ editorMode: mode }),
  setEraserSize: (size: number) => set({ eraserSize: size }),
  setIsComparing: (isComparing: boolean) => set({ isComparing }),

  reset: () => {
    set({
      originalImage: null,
      imageFile: null,
      imageMeta: null,
      pageModel: null,
      canvas: null,
      canvasScale: 1,
      viewportZoom: 1,
      viewportPan: { x: 0, y: 0 },
      selectedElementId: null,
      editorMode: 'select',
      eraserSize: 20,
      isComparing: false,
      isLoading: false,
      isDetecting: false,
    });
  },
}));
