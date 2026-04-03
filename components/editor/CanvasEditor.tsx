"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Canvas as FabricCanvas } from 'fabric';
import { detectText, inpaintRegion, mergePatchIntoImage } from '@/lib/api-client';
import { enhanceDetectionsWithStyles } from '@/lib/color-sampler';
import { loadGoogleFont } from '@/lib/font-loader';
import { generateCleanBackground } from '@/lib/clean-background';
import { isAiEnabled } from '@/lib/deploy-target';
import { useEditorStore, getRoiOverlapRegionIds } from '@/store/editorStore';
import type { EraserPath, PageModel } from '@/types/canvas';
import type { BoundingBox } from '@/types/ocr';
import {
  createTextObject,
  expandBoundingBox,
  FabricTextObject,
  projectLocalOffset,
  scaleBoundingBox,
  syncTextObject,
} from '@/lib/fabric-utils';
import { resolvePreviewBackground } from '@/lib/editor-layer';

const DEFAULT_FONT = 'Noto Sans SC';

type RuntimeBinding = {
  textObj: FabricTextObject;
};

type DraftBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let fabricModule: typeof import('fabric') | null = null;
let fabricPromise: Promise<typeof import('fabric')> | null = null;

function loadFabric() {
  if (fabricModule) {
    return Promise.resolve(fabricModule);
  }
  if (!fabricPromise) {
    fabricPromise = import('fabric')
      .then((module) => {
        fabricModule = module;
        return fabricModule;
      })
      .catch((error) => {
        console.error('Failed to import fabric:', error);
        fabricPromise = null;
        throw error;
      });
  }
  return fabricPromise;
}

function isCanvasValid(canvas: FabricCanvas | null): canvas is FabricCanvas {
  if (!canvas) return false;
  try {
    return !!(canvas as any).lowerCanvasEl;
  } catch {
    return false;
  }
}

export function getFabricModule() {
  return fabricModule;
}

function roundToImagePixel(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeDraftBox(start: { x: number; y: number }, end: { x: number; y: number }): DraftBox {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function toImageBounds(draftBox: DraftBox, scale: number): BoundingBox {
  return {
    x: roundToImagePixel(draftBox.x / scale),
    y: roundToImagePixel(draftBox.y / scale),
    width: Math.max(1, roundToImagePixel(draftBox.width / scale)),
    height: Math.max(1, roundToImagePixel(draftBox.height / scale)),
  };
}

export function clampBounds(bounds: BoundingBox, width: number, height: number): BoundingBox | null {
  const x = Math.max(0, Math.floor(bounds.x));
  const y = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));

  if (right <= x || bottom <= y) {
    return null;
  }

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

async function loadImageElement(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageDataUrl;
  });
}

async function cropImageAsset(
  imageDataUrl: string,
  bounds: BoundingBox,
  fileName: string,
): Promise<{ dataUrl: string; file: File }> {
  const image = await loadImageElement(imageDataUrl);
  const crop = clampBounds(bounds, image.width, image.height);
  if (!crop) {
    throw new Error('ROI crop does not intersect the image bounds');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create crop canvas context');
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const file = await new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to build crop blob'));
        return;
      }

      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    file,
  };
}

async function buildRestorePatchAsset(
  imageDataUrl: string,
  regionBounds: BoundingBox,
  eraserPaths: EraserPath[],
): Promise<{ dataUrl: string; crop: BoundingBox } | null> {
  if (eraserPaths.length === 0) {
    return null;
  }

  const image = await loadImageElement(imageDataUrl);
  const expandedBounds = expandBoundingBox(regionBounds);
  const crop = clampBounds(expandedBounds, image.width, image.height);
  if (!crop) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create restore patch canvas context');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  eraserPaths.forEach((path) => {
    const centerX = expandedBounds.x + path.x - crop.x;
    const centerY = expandedBounds.y + path.y - crop.y;

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, path.radius, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    context.restore();
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    crop,
  };
}

async function composePendingPreviewLayer(
  baseLayer: string,
  pageModel: PageModel,
  skipRegionIds: number[],
): Promise<string> {
  let nextLayer = baseLayer;
  const pageSize = {
    width: pageModel.originalWidth,
    height: pageModel.originalHeight,
  };

  const pendingPatches = [...(pageModel.autoChanges ?? [])]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((change) => change.patch)
    .filter((patch): patch is NonNullable<typeof patch> => (
      !!patch?.imageDataUrl
      && !!patch.crop
      && !patch.regionIds.some((regionId) => skipRegionIds.includes(regionId))
    ));

  for (const patch of pendingPatches) {
    nextLayer = await mergePatchIntoImage(nextLayer, patch.imageDataUrl!, patch.crop!, pageSize);
  }

  return nextLayer;
}

export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const imageScaleRef = useRef(1);
  const runtimeBindingsRef = useRef(new Map<number, RuntimeBinding>());
  const suppressCanvasWritebackRef = useRef(false);
  const pageModelRef = useRef(useEditorStore.getState().pageModel);
  const eraserSizeRef = useRef(useEditorStore.getState().eraserSize);
  const eraserMutatedRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [fabricReady, setFabricReady] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);
  const isDrawingRef = useRef(false);
  const erasedRegionIdsRef = useRef(new Set<number>());
  const aiEnabled = isAiEnabled();

  const {
    originalImage,
    pageModel,
    canvasScale,
    setCanvas,
    setCanvasScale,
    setIsCleaningBackground,
    setSelectedElement,
    updateElement,
    addManualElement,
    mergeRoiDetections,
    isDetecting,
    editorMode,
    pendingRoiAction,
    eraserSize,
    isComparing,
    previewMode,
    baseAutoLayer,
    currentLayer,
    viewportZoom,
    setViewportZoom,
    setEditorMode,
    setPendingRoiAction,
    setIsDetecting,
    applyPatch,
    setPreviewMode,
    isCleaningBackground,
  } = useEditorStore();

  useEffect(() => {
    pageModelRef.current = pageModel;
  }, [pageModel]);

  useEffect(() => {
    eraserSizeRef.current = eraserSize;
  }, [eraserSize]);

  useEffect(() => {
    Promise.all([loadFabric(), loadGoogleFont(DEFAULT_FONT)])
      .then(([fabric]) => {
        if (fabric) {
          setFabricReady(true);
          setFontLoaded(true);
        }
      })
      .catch((error) => {
        console.error('Failed to load Fabric.js or fonts:', error);
      });
  }, []);

  useEffect(() => {
    if (!fabricReady || !fabricModule || !wrapperRef.current) return;
    if (fabricCanvasRef.current && isCanvasValid(fabricCanvasRef.current)) return;

    const canvasEl = document.createElement('canvas');
    canvasEl.width = 800;
    canvasEl.height = 600;
    wrapperRef.current.appendChild(canvasEl);

    const fabricCanvas = new fabricModule.Canvas(canvasEl, {
      width: 800,
      height: 600,
      backgroundColor: '#f5f5f5',
    });

    fabricCanvasRef.current = fabricCanvas;
    setCanvas(fabricCanvas);

    return () => {
      runtimeBindingsRef.current.clear();
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      setCanvas(null);
      if (wrapperRef.current) {
        wrapperRef.current.innerHTML = '';
      }
    };
  }, [fabricReady, setCanvas]);

  useEffect(() => {
    if (!fabricReady || !fabricModule || !originalImage) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const backgroundSource = isComparing
        ? originalImage
        : resolvePreviewBackground({
          previewMode,
          originalImage,
          baseAutoLayer: baseAutoLayer ?? pageModel?.cleanLayer ?? null,
          currentLayer,
        }) ?? originalImage;

    fabricModule.FabricImage.fromURL(backgroundSource)
      .then((img) => {
        if (!isCanvasValid(fabricCanvasRef.current)) return;

        const imgWidth = img.width || 1;
        const imgHeight = img.height || 1;
        const containerWidth = containerRef.current?.clientWidth || 800;
        const maxHeight = 600;

        let scale: number;
        if (imgWidth / imgHeight > containerWidth / maxHeight) {
          scale = Math.min(1, containerWidth / imgWidth);
        } else {
          scale = Math.min(containerWidth / imgWidth, maxHeight / imgHeight);
        }

        scale = Math.max(scale, 0.1);
        imageScaleRef.current = scale;
        setCanvasScale(scale);

        fabricCanvasRef.current!.setWidth(imgWidth * scale);
        fabricCanvasRef.current!.setHeight(imgHeight * scale);

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: 0,
          top: 0,
        });

        fabricCanvasRef.current!.backgroundImage = img;
        fabricCanvasRef.current!.renderAll();
      })
      .catch((error) => {
        console.error('Failed to load background image:', error);
      });
  }, [baseAutoLayer, currentLayer, fabricReady, isComparing, originalImage, pageModel?.cleanLayer, previewMode, setCanvasScale]);

  const commitTextboxToModel = useCallback((elementId: number) => {
    if (suppressCanvasWritebackRef.current) return;

    const binding = runtimeBindingsRef.current.get(elementId);
    if (!binding) return;
    const region = pageModelRef.current?.regions.find((item) => item.id === elementId);
    if (!region) return;

    const scale = imageScaleRef.current || 1;
    const { textObj } = binding;
    const angle = typeof textObj.angle === 'number' ? textObj.angle : region.rotation;
    const scaledOffset = projectLocalOffset(0, region.layoutOffsetY * scale, angle);
    const nextScaleX = textObj.scaleX || 1;
    const nextScaleY = textObj.scaleY || 1;
    const baseWidth = Number(textObj.width || textObj.getScaledWidth() || 0);
    const baseHeight = Number(textObj.height || textObj.getScaledHeight() || 0);
    const isManualRegion = region.source === 'manual';
    const nextBbox = {
      x: roundToImagePixel(((textObj.left || 0) - scaledOffset.x) / scale),
      y: roundToImagePixel(((textObj.top || 0) - scaledOffset.y) / scale),
      width: isManualRegion
        ? roundToImagePixel(region.bbox.width * nextScaleX)
        : roundToImagePixel((baseWidth * nextScaleX) / scale),
      height: isManualRegion
        ? roundToImagePixel(region.bbox.height * nextScaleY)
        : roundToImagePixel((((region.layoutOffsetY * scale) + (baseHeight * nextScaleY)) / scale)),
    };

    updateElement(elementId, {
      text: textObj.text ?? '',
      bbox: nextBbox,
      fontSize: Math.max(1, roundToImagePixel(((textObj.fontSize || 0) * nextScaleY) / scale)),
      rotation: angle,
      layoutOffsetY: roundToImagePixel((region.layoutOffsetY * nextScaleY)),
    });
  }, [updateElement]);

  const applyEraserRestorePatches = useCallback(async () => {
    const state = useEditorStore.getState();
    if (!state.originalImage || !state.pageModel) {
      return;
    }

    try {
      const regionIds = Array.from(erasedRegionIdsRef.current);
      if (regionIds.length === 0) {
        return;
      }

      const pageSize = {
        width: state.pageModel.originalWidth,
        height: state.pageModel.originalHeight,
      };

      for (const regionId of regionIds) {
        const latestState = useEditorStore.getState();
        if (!latestState.originalImage || !latestState.pageModel) {
          return;
        }

        const region = latestState.pageModel.regions.find((item) => item.id === regionId && !item.removed);
        if (!region || region.eraserPaths.length === 0) {
          continue;
        }

        const restoreAsset = await buildRestorePatchAsset(
          latestState.originalImage,
          region.sourceBounds,
          region.eraserPaths,
        );
        if (!restoreAsset) {
          continue;
        }

        const confirmedBaseLayer = latestState.baseAutoLayer ?? latestState.pageModel.cleanLayer ?? latestState.originalImage;
        const nextConfirmedLayer = await mergePatchIntoImage(
          confirmedBaseLayer,
          restoreAsset.dataUrl,
          restoreAsset.crop,
          pageSize,
        );
        const nextLayer = await composePendingPreviewLayer(nextConfirmedLayer, latestState.pageModel, [regionId]);
        const createdAt = Date.now();

        applyPatch({
          id: `restore-original-${regionId}-${createdAt}`,
          kind: 'restore_original',
          regionIds: [regionId],
          roiId: `eraser-${regionId}`,
          previewMode: 'current',
          createdAt,
          applied: true,
          reverted: false,
          description: `Restore original background for region ${regionId}`,
          crop: restoreAsset.crop,
          imageDataUrl: restoreAsset.dataUrl,
        }, nextLayer);
      }
    } catch (error) {
      console.error('Failed to apply eraser restore patch:', error);
    }
  }, [applyPatch]);

  const applyRoiAction = useCallback(async (roiBounds: BoundingBox) => {
    const state = useEditorStore.getState();
    if (!state.originalImage || !state.pageModel || !state.pendingRoiAction) {
      return;
    }

    if (state.isDetecting || state.isCleaningBackground) {
      return;
    }

    const overlappingRegionIds = getRoiOverlapRegionIds(state.pageModel.regions, roiBounds);
    const pageSize = {
      width: state.pageModel.originalWidth,
      height: state.pageModel.originalHeight,
    };

    if (state.pendingRoiAction === 'ocr') {
      state.setIsDetecting(true);
      try {
        const createdAt = Date.now();
        const crop = await cropImageAsset(state.originalImage, roiBounds, 'roi-ocr.png');
        const response = await detectText(crop.file);
        const detections = await enhanceDetectionsWithStyles(response.detections, crop.dataUrl);
        await mergeRoiDetections(roiBounds, detections);

        const latestState = useEditorStore.getState();
        if (!latestState.originalImage || !latestState.pageModel) {
          return;
        }

        const cleanLayer = await generateCleanBackground(latestState.originalImage, latestState.pageModel);
        useEditorStore.setState((storeState) => {
          if (!storeState.pageModel) {
            return storeState;
          }

          return {
            pageModel: {
              ...storeState.pageModel,
              cleanLayer,
            },
          };
        });

        const confirmedBaseLayer = latestState.baseAutoLayer ?? latestState.originalImage;
        const patchAsset = await cropImageAsset(cleanLayer, roiBounds, 'roi-ocr-clean.png');
        const nextRegionIds = getRoiOverlapRegionIds(useEditorStore.getState().pageModel?.regions ?? [], roiBounds);
        const nextConfirmedLayer = await mergePatchIntoImage(confirmedBaseLayer, patchAsset.dataUrl, roiBounds, pageSize);
        const nextLayer = await composePendingPreviewLayer(nextConfirmedLayer, latestState.pageModel, nextRegionIds);

        applyPatch({
          id: `roi-ocr-clean-${createdAt}`,
          kind: 'local_clean',
          regionIds: nextRegionIds,
          roiId: `roi-ocr-${createdAt}`,
          previewMode: 'current',
          createdAt,
          applied: true,
          reverted: false,
          description: 'ROI OCR local clean',
        }, nextLayer);
        setPreviewMode('current');
      } catch (error) {
        console.error('ROI OCR failed:', error);
        alert(`ROI OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        useEditorStore.getState().setIsDetecting(false);
      }
      return;
    }

    state.setIsCleaningBackground(true);
    try {
      const createdAt = Date.now();
      const confirmedBaseLayer = state.baseAutoLayer ?? state.pageModel.cleanLayer ?? state.originalImage;

      if (state.pendingRoiAction === 'local-repair') {
        const cleanLayer = await generateCleanBackground(state.originalImage, state.pageModel);
        const patchAsset = await cropImageAsset(cleanLayer, roiBounds, 'roi-local-repair.png');
        const nextConfirmedLayer = await mergePatchIntoImage(confirmedBaseLayer, patchAsset.dataUrl, roiBounds, pageSize);
        const nextLayer = await composePendingPreviewLayer(nextConfirmedLayer, state.pageModel, overlappingRegionIds);

        applyPatch({
          id: `local-clean-${createdAt}`,
          kind: 'local_clean',
          regionIds: overlappingRegionIds,
          roiId: `roi-${createdAt}`,
          previewMode: 'current',
          createdAt,
          applied: true,
          reverted: false,
          description: 'Manual ROI local repair',
        }, nextLayer);
        setPreviewMode('current');
        return;
      }

      const response = await inpaintRegion({
        imageDataUrl: confirmedBaseLayer,
        source: confirmedBaseLayer === state.originalImage ? 'original' : 'cleanLayer',
        sourceBounds: roiBounds,
        pageSize,
      });
      const patchImage = response.patch ?? response.imageDataUrl;
      const patchCrop = response.crop ?? roiBounds;
      if (!patchImage) {
        throw new Error('AI repair returned no patch image');
      }

      const previewBaseLayer = state.currentLayer ?? confirmedBaseLayer;
      const nextLayer = await mergePatchIntoImage(previewBaseLayer, patchImage, patchCrop, pageSize);
      applyPatch({
        id: response.patchId ?? `manual-ai-${createdAt}`,
        kind: 'manual_ai',
        regionIds: overlappingRegionIds,
        roiId: `roi-${createdAt}`,
        previewMode: 'current',
        createdAt,
        applied: true,
        reverted: false,
        description: 'Manual ROI AI repair',
      }, nextLayer);
      setPreviewMode('current');
    } catch (error) {
      console.error('ROI repair failed:', error);
      alert(`${state.pendingRoiAction === 'ai-repair' ? 'AI repair' : 'Local repair'} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      useEditorStore.getState().setIsCleaningBackground(false);
    }
  }, [applyPatch, mergeRoiDetections, setPreviewMode]);

  useEffect(() => {
    if (!fabricReady || !fabricModule || !fontLoaded) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const regions = (pageModel?.regions ?? []).filter((region) => !region.removed);
    const activeIds = new Set(regions.map((region) => region.id));
    const shouldShowComposite = !isComparing && previewMode === 'current';

    suppressCanvasWritebackRef.current = true;
    try {
      for (const [id, binding] of runtimeBindingsRef.current.entries()) {
        if (activeIds.has(id)) continue;
        currentCanvas.remove(binding.textObj);
        runtimeBindingsRef.current.delete(id);
      }

      for (const region of regions) {
        let binding = runtimeBindingsRef.current.get(region.id);
        if (!binding) {
          const textObj = createTextObject(fabricModule, region, imageScaleRef.current);
          textObj.on('modified', () => commitTextboxToModel(region.id));
          textObj.on('editing:exited', () => commitTextboxToModel(region.id));
          currentCanvas.add(textObj);
          binding = { textObj };
          runtimeBindingsRef.current.set(region.id, binding);
        }

        syncTextObject(binding.textObj, region, imageScaleRef.current);
        binding.textObj.set('visible', shouldShowComposite && region.showText);

        (currentCanvas as any).bringObjectToFront?.(binding.textObj);
      }
    } finally {
      suppressCanvasWritebackRef.current = false;
    }

    currentCanvas.renderAll();
  }, [commitTextboxToModel, fabricReady, fontLoaded, isComparing, pageModel, previewMode]);

  useEffect(() => {
    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    if (editorMode === 'eraser') {
      currentCanvas.selection = false;
      currentCanvas.discardActiveObject();
      currentCanvas.forEachObject((obj: any) => {
        obj._prevSelectable = obj.selectable;
        obj.selectable = false;
        obj.evented = false;
      });

      currentCanvas.defaultCursor = 'none';
      currentCanvas.hoverCursor = 'none';

      const findElementAtPointer = (pointer: { x: number; y: number }) => {
        const regions = pageModelRef.current?.regions.filter((region) => !region.removed) ?? [];
        const scale = imageScaleRef.current || 1;

        for (const region of regions) {
          const expandedBounds = scaleBoundingBox(expandBoundingBox(region.sourceBounds), scale);
          const left = expandedBounds.x;
          const top = expandedBounds.y;
          const right = left + expandedBounds.width;
          const bottom = top + expandedBounds.height;

          if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom) {
            return { id: region.id, bounds: expandedBounds };
          }
        }

        return null;
      };

      const doEraserDraw = (pointer: { x: number; y: number }) => {
        const found = findElementAtPointer(pointer);
        if (!found) return;

        const region = pageModelRef.current?.regions.find((item) => item.id === found.id);
        if (!region) return;

        const scale = imageScaleRef.current || 1;
        const newPath: EraserPath = {
          x: roundToImagePixel((pointer.x - found.bounds.x) / scale),
          y: roundToImagePixel((pointer.y - found.bounds.y) / scale),
          radius: roundToImagePixel((eraserSizeRef.current / 2) / scale),
        };

        eraserMutatedRef.current = true;
        erasedRegionIdsRef.current.add(found.id);
        updateElement(found.id, {
          eraserPaths: [...region.eraserPaths, newPath],
        });
      };

      const handleMouseDown = (e: any) => {
        isDrawingRef.current = true;
        if (e.pointer) {
          doEraserDraw(e.pointer);
        }
      };

      const handleMouseMove = (e: any) => {
        if (!e.pointer) return;
        setCursorPos({ x: e.pointer.x, y: e.pointer.y });
        if (isDrawingRef.current) {
          doEraserDraw(e.pointer);
        }
      };

      const handleMouseUp = () => {
        isDrawingRef.current = false;
        if (eraserMutatedRef.current) {
          eraserMutatedRef.current = false;
          void applyEraserRestorePatches().finally(() => {
            erasedRegionIdsRef.current.clear();
          });
          return;
        }
        erasedRegionIdsRef.current.clear();
      };

      const handleMouseOut = () => {
        setCursorPos(null);
      };

      currentCanvas.on('mouse:down', handleMouseDown);
      currentCanvas.on('mouse:move', handleMouseMove);
      currentCanvas.on('mouse:up', handleMouseUp);
      currentCanvas.on('mouse:out', handleMouseOut);

      return () => {
        if (!isCanvasValid(fabricCanvasRef.current)) return;

        fabricCanvasRef.current.off('mouse:down', handleMouseDown);
        fabricCanvasRef.current.off('mouse:move', handleMouseMove);
        fabricCanvasRef.current.off('mouse:up', handleMouseUp);
        fabricCanvasRef.current.off('mouse:out', handleMouseOut);
        fabricCanvasRef.current.selection = true;
        fabricCanvasRef.current.forEachObject((obj: any) => {
          if (obj._prevSelectable !== undefined) {
            obj.selectable = obj._prevSelectable;
            obj.evented = true;
            delete obj._prevSelectable;
          }
        });
        setCursorPos(null);
        erasedRegionIdsRef.current.clear();
      };
    }

    if (editorMode === 'add-text' || editorMode === 'roi') {
      currentCanvas.selection = false;
      currentCanvas.discardActiveObject();
      currentCanvas.forEachObject((obj: any) => {
        obj._prevSelectable = obj.selectable;
        obj.selectable = false;
        obj.evented = false;
      });
      currentCanvas.defaultCursor = 'crosshair';
      currentCanvas.hoverCursor = 'crosshair';

      const handleMouseDown = (e: any) => {
        if (editorMode === 'roi') {
          const latestState = useEditorStore.getState();
          if (latestState.isDetecting || latestState.isCleaningBackground) {
            return;
          }
        }

        if (!e.pointer) {
          return;
        }

        dragStartRef.current = { x: e.pointer.x, y: e.pointer.y };
        setDraftBox({ x: e.pointer.x, y: e.pointer.y, width: 0, height: 0 });
      };

      const handleMouseMove = (e: any) => {
        if (editorMode === 'roi') {
          const latestState = useEditorStore.getState();
          if (latestState.isDetecting || latestState.isCleaningBackground) {
            dragStartRef.current = null;
            setDraftBox(null);
            return;
          }
        }

        if (!e.pointer || !dragStartRef.current) {
          return;
        }

        setDraftBox(normalizeDraftBox(dragStartRef.current, e.pointer));
      };

      const handleMouseUp = (e: any) => {
        if (editorMode === 'roi') {
          const latestState = useEditorStore.getState();
          if (latestState.isDetecting || latestState.isCleaningBackground) {
            dragStartRef.current = null;
            setDraftBox(null);
            return;
          }
        }

        const start = dragStartRef.current;
        if (!start || !e.pointer) {
          dragStartRef.current = null;
          setDraftBox(null);
          return;
        }

        const nextDraftBox = normalizeDraftBox(start, e.pointer);
        dragStartRef.current = null;
        setDraftBox(null);

        if (nextDraftBox.width < 4 || nextDraftBox.height < 4) {
          return;
        }

        const bounds = toImageBounds(nextDraftBox, imageScaleRef.current || 1);
        if (editorMode === 'add-text') {
          addManualElement(bounds);
          return;
        }

        void applyRoiAction(bounds).finally(() => {
          setEditorMode('select');
          setPendingRoiAction(null);
        });
      };

      const handleMouseOut = () => {
        dragStartRef.current = null;
        setDraftBox(null);
      };

      currentCanvas.on('mouse:down', handleMouseDown);
      currentCanvas.on('mouse:move', handleMouseMove);
      currentCanvas.on('mouse:up', handleMouseUp);
      currentCanvas.on('mouse:out', handleMouseOut);

      return () => {
        if (!isCanvasValid(fabricCanvasRef.current)) return;

        fabricCanvasRef.current.off('mouse:down', handleMouseDown);
        fabricCanvasRef.current.off('mouse:move', handleMouseMove);
        fabricCanvasRef.current.off('mouse:up', handleMouseUp);
        fabricCanvasRef.current.off('mouse:out', handleMouseOut);
        fabricCanvasRef.current.selection = true;
        fabricCanvasRef.current.forEachObject((obj: any) => {
          if (obj._prevSelectable !== undefined) {
            obj.selectable = obj._prevSelectable;
            obj.evented = true;
            delete obj._prevSelectable;
          }
        });
        dragStartRef.current = null;
        setDraftBox(null);
      };
    }

    currentCanvas.selection = true;
    currentCanvas.forEachObject((obj: any) => {
      if (obj._prevSelectable !== undefined) {
        obj.selectable = obj._prevSelectable;
        obj.evented = true;
        delete obj._prevSelectable;
      }
    });
    currentCanvas.defaultCursor = 'default';
    currentCanvas.hoverCursor = 'move';
    setCursorPos(null);
    dragStartRef.current = null;
    setDraftBox(null);
  }, [addManualElement, applyEraserRestorePatches, applyRoiAction, editorMode, isCleaningBackground, isDetecting, setEditorMode, setPendingRoiAction, updateElement]);

  useEffect(() => {
    if (!fabricReady) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const handleSelection = (e: any) => {
      const activeObject = e.selected?.[0];
      const elementId = activeObject?.get?.('data')?.elementId;
      setSelectedElement(typeof elementId === 'number' ? elementId : null);
    };

    const handleClear = () => {
      setSelectedElement(null);
    };

    currentCanvas.on('selection:created', handleSelection);
    currentCanvas.on('selection:updated', handleSelection);
    currentCanvas.on('selection:cleared', handleClear);

    return () => {
      if (!isCanvasValid(fabricCanvasRef.current)) return;
      fabricCanvasRef.current.off('selection:created', handleSelection);
      fabricCanvasRef.current.off('selection:updated', handleSelection);
      fabricCanvasRef.current.off('selection:cleared', handleClear);
    };
  }, [fabricReady, setSelectedElement]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      e.preventDefault();
      let newZoom = viewportZoom * (0.999 ** e.deltaY);
      newZoom = Math.min(Math.max(newZoom, 0.25), 4);
      setViewportZoom(newZoom);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setViewportZoom, viewportZoom]);

  const autoChangedRegionIds = new Set(
    (aiEnabled ? (pageModel?.autoChanges ?? []) : [])
      .filter((change) => change.status === 'new')
      .flatMap((change) => change.regionIds),
  );
  const highlightedRegions = (pageModel?.regions ?? []).filter((region) => (
    !region.removed && autoChangedRegionIds.has(region.id)
  ));

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center bg-gray-100 rounded-lg p-4 relative overflow-auto max-h-[70vh] min-h-[400px]"
    >
      <div
        className={`relative ${isComparing ? 'opacity-100' : ''}`}
        style={{
          transform: `scale(${viewportZoom})`,
          transformOrigin: 'center center',
        }}
      >
        <div ref={wrapperRef} className="relative">
          {highlightedRegions.map((region) => (
            <div
              key={`auto-change-${region.id}`}
              className="pointer-events-none absolute rounded-md border-2 border-emerald-500 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
              style={{
                left: region.sourceBounds.x * canvasScale,
                top: region.sourceBounds.y * canvasScale,
                width: region.sourceBounds.width * canvasScale,
                height: region.sourceBounds.height * canvasScale,
              }}
            >
              <div
                aria-hidden="true"
                className="absolute left-1 top-1 h-2 w-2 rounded-full bg-emerald-600/80 shadow-[0_0_0_1px_rgba(255,255,255,0.55)]"
              />
            </div>
          ))}
          {editorMode === 'eraser' && cursorPos && (
            <div
              className="absolute pointer-events-none border-2 border-red-500 rounded-full bg-red-500/20"
              style={{
                left: cursorPos.x - eraserSize / 2,
                top: cursorPos.y - eraserSize / 2,
                width: eraserSize,
                height: eraserSize,
              }}
            />
          )}
          {draftBox && (
            <div
              className={`absolute pointer-events-none border-2 ${editorMode === 'add-text' ? 'border-sky-500 bg-sky-500/10' : 'border-amber-500 bg-amber-500/10'}`}
              style={{
                left: draftBox.x,
                top: draftBox.y,
                width: draftBox.width,
                height: draftBox.height,
              }}
            />
          )}
        </div>
      </div>

      {isComparing && (
        <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 rounded text-sm z-10">
          Comparing with original
        </div>
      )}

      {isDetecting && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 rounded-lg">
          <div className="text-center bg-white/90 rounded-lg p-6 shadow-lg">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mx-auto mb-3"></div>
            <p className="text-gray-700 font-medium">Detecting text...</p>
          </div>
        </div>
      )}
    </div>
  );
}
