/**
 * Editor State Management with Zustand
 */

import { create } from 'zustand';
import { OCRDetection } from '@/types/ocr';
import { TextElement } from '@/types/canvas';

export type EditorMode = 'select' | 'eraser';

interface EditorState {
  // Image data
  originalImage: string | null;
  imageFile: File | null;

  // Detections and elements
  detections: OCRDetection[];
  textElements: Map<number, TextElement>;

  // Canvas (using any to avoid SSR issues with fabric)
  canvas: any | null;
  canvasScale: number; // Scale factor for display (1/scale = export multiplier)

  // Viewport zoom and pan
  viewportZoom: number;
  viewportPan: { x: number; y: number };

  // Selection
  selectedElementId: number | null;

  // Editor mode
  editorMode: EditorMode;
  eraserSize: number;

  // Compare mode
  isComparing: boolean;

  // Loading states
  isLoading: boolean;
  isDetecting: boolean;

  // Actions
  loadImage: (file: File) => Promise<void>;
  setCanvas: (canvas: any) => void;
  setCanvasScale: (scale: number) => void;
  setViewportZoom: (zoom: number) => void;
  setViewportPan: (pan: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setDetections: (detections: OCRDetection[]) => void;
  setTextElements: (elements: Map<number, TextElement>) => void;
  updateElement: (id: number, updates: Partial<TextElement>) => void;
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

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  originalImage: null,
  imageFile: null,
  detections: [],
  textElements: new Map(),
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

  // Actions
  loadImage: async (file: File) => {
    set({ isLoading: true });
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      set({
        originalImage: imageData,
        imageFile: file,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to load image:', error);
      set({ isLoading: false });
    }
  },

  setCanvas: (canvas: any) => {
    set({ canvas });
  },

  setCanvasScale: (scale: number) => {
    set({ canvasScale: scale });
  },

  setViewportZoom: (zoom: number) => {
    // Clamp zoom between 0.25 and 4
    const clampedZoom = Math.min(Math.max(zoom, 0.25), 4);
    set({ viewportZoom: clampedZoom });
    // Don't use Fabric's setZoom - we use CSS transform instead
  },

  setViewportPan: (pan: { x: number; y: number }) => {
    set({ viewportPan: pan });
    // Pan is handled by scroll container
  },

  zoomIn: () => {
    const { viewportZoom, setViewportZoom } = get();
    setViewportZoom(viewportZoom * 1.2);
  },

  zoomOut: () => {
    const { viewportZoom, setViewportZoom } = get();
    setViewportZoom(viewportZoom / 1.2);
  },

  resetZoom: () => {
    set({ viewportZoom: 1, viewportPan: { x: 0, y: 0 } });
  },

  setDetections: (detections: OCRDetection[]) => {
    set({ detections });
  },

  setTextElements: (elements: Map<number, TextElement>) => {
    set({ textElements: elements });
  },

  updateElement: (id: number, updates: Partial<TextElement>) => {
    const { textElements } = get();
    const element = textElements.get(id);
    if (element) {
      const updatedElement = { ...element, ...updates };
      const newMap = new Map(textElements);
      newMap.set(id, updatedElement);
      set({ textElements: newMap });
    }
  },

  toggleShowBackground: (id: number) => {
    const { textElements } = get();
    const element = textElements.get(id);
    if (element) {
      const newMap = new Map(textElements);
      newMap.set(id, { ...element, showBackground: !element.showBackground });
      set({ textElements: newMap });
    }
  },

  toggleShowText: (id: number) => {
    const { textElements } = get();
    const element = textElements.get(id);
    if (element) {
      const newMap = new Map(textElements);
      newMap.set(id, { ...element, showText: !element.showText });
      set({ textElements: newMap });
    }
  },

  resetElement: (id: number) => {
    const { textElements, canvas } = get();
    const element = textElements.get(id);
    if (element && canvas) {
      const { detection, originalTransform } = element;

      // Reset fabric object transform
      if (element.fabricObject) {
        element.fabricObject.set({
          left: originalTransform.left,
          top: originalTransform.top,
          scaleX: originalTransform.scaleX,
          scaleY: originalTransform.scaleY,
          angle: originalTransform.angle,
          text: detection.text,
          fontSize: detection.fontSize,
          fill: `rgb(${detection.textColor.r}, ${detection.textColor.g}, ${detection.textColor.b})`,
          fontFamily: 'Noto Sans SC',
        });
        element.fabricObject.setCoords();
      }

      // Reset element state
      const newMap = new Map(textElements);
      newMap.set(id, {
        ...element,
        text: detection.text,
        fontFamily: 'Noto Sans SC',
        fontSize: detection.fontSize,
        fontColor: detection.textColor,
        bgColor: detection.bgColor,
        showBackground: true,
        showText: true,
        eraserPaths: [], // Clear eraser paths
      });
      set({ textElements: newMap });

      // Clear clipPath on the background rect
      if (element.fabricBgRect) {
        element.fabricBgRect.clipPath = undefined;
      }

      canvas.renderAll();
    }
  },

  restoreAll: () => {
    const { textElements, canvas } = get();
    if (!canvas) return;

    const newMap = new Map<number, TextElement>();

    textElements.forEach((element, id) => {
      const { detection, originalTransform } = element;

      // Reset fabric object transform
      if (element.fabricObject) {
        element.fabricObject.set({
          left: originalTransform.left,
          top: originalTransform.top,
          scaleX: originalTransform.scaleX,
          scaleY: originalTransform.scaleY,
          angle: originalTransform.angle,
          text: detection.text,
          fontSize: detection.fontSize,
          fill: `rgb(${detection.textColor.r}, ${detection.textColor.g}, ${detection.textColor.b})`,
          fontFamily: 'Noto Sans SC',
          visible: true,
        });
        element.fabricObject.setCoords();
      }

      // Clear clipPath on background rect
      if (element.fabricBgRect) {
        element.fabricBgRect.clipPath = undefined;
      }

      newMap.set(id, {
        ...element,
        text: detection.text,
        fontFamily: 'Noto Sans SC',
        fontSize: detection.fontSize,
        fontColor: detection.textColor,
        bgColor: detection.bgColor,
        showBackground: true,
        showText: true,
        eraserPaths: [], // Clear eraser paths
      });
    });

    set({ textElements: newMap });
    canvas.renderAll();
  },

  setSelectedElement: (id: number | null) => {
    set({ selectedElementId: id });
  },

  setIsDetecting: (isDetecting: boolean) => {
    set({ isDetecting });
  },

  setEditorMode: (mode: EditorMode) => {
    set({ editorMode: mode });
  },

  setEraserSize: (size: number) => {
    set({ eraserSize: size });
  },

  setIsComparing: (isComparing: boolean) => {
    set({ isComparing });
  },

  reset: () => {
    const { canvas } = get();
    if (canvas) {
      canvas.dispose();
    }
    set({
      originalImage: null,
      imageFile: null,
      detections: [],
      textElements: new Map(),
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
