"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, Rect } from 'fabric';
import { loadGoogleFont } from '@/lib/font-loader';
import { useEditorStore } from '@/store/editorStore';
import type { EraserPath, TextElement } from '@/types/canvas';
import {
  createBackgroundRect,
  createTextObject,
  FabricTextObject,
  projectLocalOffset,
  rgbToString,
  syncBackgroundRect,
  syncTextObject,
} from '@/lib/fabric-utils';

const DEFAULT_FONT = 'Noto Sans SC';

type RuntimeBinding = {
  textObj: FabricTextObject;
  bgRect?: Rect;
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

export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const imageScaleRef = useRef(1);
  const runtimeBindingsRef = useRef(new Map<number, RuntimeBinding>());
  const suppressCanvasWritebackRef = useRef(false);
  const pageModelRef = useRef(useEditorStore.getState().pageModel);
  const eraserSizeRef = useRef(useEditorStore.getState().eraserSize);
  const [fabricReady, setFabricReady] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);

  const {
    originalImage,
    pageModel,
    setCanvas,
    setCanvasScale,
    setSelectedElement,
    updateElement,
    isDetecting,
    editorMode,
    eraserSize,
    isComparing,
    viewportZoom,
    setViewportZoom,
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

    fabricModule.FabricImage.fromURL(originalImage)
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
  }, [fabricReady, originalImage, setCanvasScale]);

  const applyEraserPaths = useCallback((rect: Rect, paths: EraserPath[], bgColor: TextElement['bgColor']) => {
    if (!fabricModule) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const fillColor = bgColor ?? { r: 255, g: 255, b: 255 };
    if (!paths.length) {
      rect.set({ fill: rgbToString(fillColor) });
      rect.dirty = true;
      return;
    }

    const rectWidth = Math.max(1, Math.round(rect.width || 0));
    const rectHeight = Math.max(1, Math.round(rect.height || 0));
    const scale = imageScaleRef.current || 1;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = rectWidth;
    offCanvas.height = rectHeight;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = rgbToString(fillColor);
    ctx.fillRect(0, 0, rectWidth, rectHeight);
    ctx.globalCompositeOperation = 'destination-out';

    paths.forEach((path) => {
      ctx.beginPath();
      ctx.arc(path.x * scale, path.y * scale, path.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    rect.set({
      fill: new fabricModule.Pattern({
        source: offCanvas,
        repeat: 'no-repeat',
      }),
    });
    rect.dirty = true;
  }, []);

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
    const nextBbox = {
      x: roundToImagePixel(((textObj.left || 0) - scaledOffset.x) / scale),
      y: roundToImagePixel(((textObj.top || 0) - scaledOffset.y) / scale),
      width: roundToImagePixel((baseWidth * nextScaleX) / scale),
      height: roundToImagePixel((((region.layoutOffsetY * scale) + (baseHeight * nextScaleY)) / scale)),
    };

    updateElement(elementId, {
      text: textObj.text ?? '',
      bbox: nextBbox,
      fontSize: Math.max(1, roundToImagePixel(((textObj.fontSize || 0) * nextScaleY) / scale)),
      rotation: angle,
      layoutOffsetY: roundToImagePixel((region.layoutOffsetY * nextScaleY)),
    });
  }, [updateElement]);

  useEffect(() => {
    if (!fabricReady || !fabricModule || !fontLoaded) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const regions = pageModel?.regions ?? [];
    const activeIds = new Set(regions.map((region) => region.id));

    suppressCanvasWritebackRef.current = true;
    try {
      for (const [id, binding] of runtimeBindingsRef.current.entries()) {
        if (activeIds.has(id)) continue;
        if (binding.bgRect) currentCanvas.remove(binding.bgRect);
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

        if (region.showBackground) {
          if (!binding.bgRect) {
            binding.bgRect = createBackgroundRect(fabricModule, region, imageScaleRef.current);
            currentCanvas.add(binding.bgRect);
          }
          syncBackgroundRect(binding.bgRect, region, imageScaleRef.current);
          applyEraserPaths(binding.bgRect, region.eraserPaths, region.bgColor);
          currentCanvas.sendObjectToBack(binding.bgRect);
        } else if (binding.bgRect) {
          currentCanvas.remove(binding.bgRect);
          binding.bgRect = undefined;
        }

        (currentCanvas as any).bringObjectToFront?.(binding.textObj);
      }
    } finally {
      suppressCanvasWritebackRef.current = false;
    }

    currentCanvas.renderAll();
  }, [applyEraserPaths, commitTextboxToModel, fabricReady, fontLoaded, pageModel]);

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
        for (const [id, binding] of runtimeBindingsRef.current.entries()) {
          if (!binding.bgRect) continue;

          const rect = binding.bgRect;
          const left = rect.left || 0;
          const top = rect.top || 0;
          const right = left + rect.getScaledWidth();
          const bottom = top + rect.getScaledHeight();

          if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom) {
            return { id, rect };
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
          x: roundToImagePixel((pointer.x - (found.rect.left || 0)) / scale),
          y: roundToImagePixel((pointer.y - (found.rect.top || 0)) / scale),
          radius: roundToImagePixel((eraserSizeRef.current / 2) / scale),
        };

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
  }, [editorMode, updateElement]);

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
    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    currentCanvas.getObjects().forEach((obj: any) => {
      if (isComparing) {
        obj._wasVisible = obj.visible;
        obj.visible = false;
      } else if (obj._wasVisible !== undefined) {
        obj.visible = obj._wasVisible;
        delete obj._wasVisible;
      }
    });

    currentCanvas.renderAll();
  }, [isComparing]);

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
