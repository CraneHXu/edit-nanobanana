"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { createTextObject, createBackgroundRect } from '@/lib/fabric-utils';
import { TextElement, EraserPath } from '@/types/canvas';
import { loadGoogleFont } from '@/lib/font-loader';
import type { Canvas as FabricCanvas } from 'fabric';

// Default font for CJK support
const DEFAULT_FONT = 'Noto Sans SC';

// Store fabric module classes (v6 API)
let fabricModule: typeof import('fabric') | null = null;
let fabricPromise: Promise<typeof import('fabric')> | null = null;

function loadFabric() {
  if (fabricModule) {
    return Promise.resolve(fabricModule);
  }
  if (!fabricPromise) {
    fabricPromise = import('fabric').then((module) => {
      fabricModule = module;
      return fabricModule;
    }).catch((error) => {
      console.error('Failed to import fabric:', error);
      fabricPromise = null;
      throw error;
    });
  }
  return fabricPromise;
}

// Helper to check if canvas is still valid (not disposed)
function isCanvasValid(canvas: FabricCanvas | null): canvas is FabricCanvas {
  if (!canvas) return false;
  try {
    // Check if the canvas element still exists
    return !!(canvas as any).lowerCanvasEl;
  } catch {
    return false;
  }
}

// Export fabric module for other components
export function getFabricModule() {
  return fabricModule;
}

export function CanvasEditor() {
  // Use a wrapper div instead of a canvas ref - Fabric will create its own canvas
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const imageScaleRef = useRef<number>(1);
  const [fabricReady, setFabricReady] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);
  const isDrawingRef = useRef(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const {
    originalImage,
    detections,
    textElements,
    setCanvas,
    setCanvasScale,
    setTextElements,
    setSelectedElement,
    selectedElementId,
    updateElement,
    isDetecting,
    editorMode,
    eraserSize,
    isComparing,
  } = useEditorStore();

  // Load fabric.js and fonts on mount
  useEffect(() => {
    Promise.all([
      loadFabric(),
      loadGoogleFont(DEFAULT_FONT)
    ]).then(([fabric]) => {
      if (fabric) {
        setFabricReady(true);
        setFontLoaded(true);
      }
    }).catch((error) => {
      console.error('Failed to load Fabric.js or fonts:', error);
    });
  }, []);

  // Initialize canvas when fabric is ready
  useEffect(() => {
    if (!fabricReady || !fabricModule || !wrapperRef.current) {
      return;
    }

    // If we already have a valid canvas, don't recreate
    if (fabricCanvasRef.current && isCanvasValid(fabricCanvasRef.current)) {
      return;
    }

    // Create a canvas element programmatically
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
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      // Clean up the wrapper content
      if (wrapperRef.current) {
        wrapperRef.current.innerHTML = '';
      }
    };
  }, [fabricReady, setCanvas]);

  // Load background image
  useEffect(() => {
    if (!fabricReady || !fabricModule || !originalImage) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    // Fabric.js v6 uses Promise-based API
    fabricModule.FabricImage.fromURL(originalImage).then((img) => {
      // Check canvas is still valid after async operation
      if (!isCanvasValid(fabricCanvasRef.current)) return;

      // Scale image to fit canvas
      const canvasWidth = 800;
      const canvasHeight = 600;
      const scale = Math.min(
        canvasWidth / (img.width || 1),
        canvasHeight / (img.height || 1)
      );

      // Store the scale for detection coordinate transformation
      imageScaleRef.current = scale;
      setCanvasScale(scale);

      // Update canvas size to match image
      const scaledWidth = (img.width || 0) * scale;
      const scaledHeight = (img.height || 0) * scale;

      // Set dimensions using the width/height properties directly
      fabricCanvasRef.current!.setWidth(scaledWidth);
      fabricCanvasRef.current!.setHeight(scaledHeight);

      // Set image scale and position
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: 0,
        top: 0,
      });

      // Set as background (non-selectable) - v6 API
      fabricCanvasRef.current!.backgroundImage = img;
      fabricCanvasRef.current!.renderAll();
    }).catch((error) => {
      console.error('Failed to load background image:', error);
    });
  }, [fabricReady, originalImage]);

  // Create text objects from detections
  useEffect(() => {
    if (!fabricReady || !fabricModule || !fontLoaded || !detections.length) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const scale = imageScaleRef.current;

    // Clear existing objects (but keep background)
    const objects = currentCanvas.getObjects();
    objects.forEach((obj) => currentCanvas.remove(obj));

    // Create new text elements
    const newElements = new Map<number, TextElement>();

    detections.forEach((detection) => {
      // Scale the detection bounds to match canvas scale
      const scaledDetection = {
        ...detection,
        bounds: {
          x: detection.bounds.x * scale,
          y: detection.bounds.y * scale,
          width: detection.bounds.width * scale,
          height: detection.bounds.height * scale,
        },
        fontSize: detection.fontSize * scale,
      };

      // Create text object (always visible initially)
      const fabricText = createTextObject(fabricModule!, scaledDetection, DEFAULT_FONT);

      // Store original transform for reset
      const originalTransform = {
        left: fabricText.left || 0,
        top: fabricText.top || 0,
        scaleX: fabricText.scaleX || 1,
        scaleY: fabricText.scaleY || 1,
        angle: fabricText.angle || 0,
      };

      // Add to canvas
      currentCanvas.add(fabricText);

      // Store in state - default: showBackground=true, showText=true
      newElements.set(detection.index, {
        id: detection.index,
        detection: scaledDetection,
        text: detection.text,
        fontFamily: DEFAULT_FONT,
        fontSize: scaledDetection.fontSize,
        fontColor: detection.textColor,
        bgColor: detection.bgColor,
        showBackground: true,
        showText: true,
        fabricObject: fabricText,
        fabricBgRect: undefined,
        eraserPaths: [],
        originalTransform,
      });

      // Add selection handler
      fabricText.on('selected', () => {
        setSelectedElement(detection.index);
      });
    });

    setTextElements(newElements);
    currentCanvas.renderAll();
  }, [fabricReady, fontLoaded, detections, setTextElements, setSelectedElement]);

  // Handle visibility changes for text elements (show/hide background and text)
  useEffect(() => {
    if (!fabricReady || !fabricModule) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    textElements.forEach((element) => {
      const hasRect = !!element.fabricBgRect;
      const needsRect = element.showBackground;

      // Handle background rect
      if (needsRect && !hasRect) {
        // Add background rect with element's bgColor
        const rect = createBackgroundRect(fabricModule!, element.detection.bounds, element.bgColor);
        currentCanvas.add(rect);
        // Send to back (but in front of background image)
        currentCanvas.sendObjectToBack(rect);
        // Update element with rect reference
        updateElement(element.id, { fabricBgRect: rect });
      } else if (!needsRect && hasRect) {
        // Remove background rect
        currentCanvas.remove(element.fabricBgRect);
        updateElement(element.id, { fabricBgRect: undefined });
      } else if (needsRect && hasRect) {
        // Update existing rect color if it changed
        element.fabricBgRect.set({ fill: `rgb(${element.bgColor.r}, ${element.bgColor.g}, ${element.bgColor.b})` });
      }

      // Handle text visibility
      if (element.fabricObject) {
        element.fabricObject.set({ visible: element.showText });
      }
    });

    currentCanvas.renderAll();
  }, [fabricReady, textElements, updateElement]);

  // Apply eraser effect by modifying the rect's fill using a pattern with holes
  const applyEraserPaths = useCallback((elementId: number, rect: any, paths: EraserPath[], bgColor: { r: number; g: number; b: number }) => {
    if (!fabricModule || !rect) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    if (!paths || paths.length === 0) {
      // Restore solid fill
      rect.set({ fill: `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})` });
      rect.dirty = true;
      currentCanvas.renderAll();
      return;
    }

    const rectWidth = rect.width || 0;
    const rectHeight = rect.height || 0;
    const rectLeft = rect.left || 0;
    const rectTop = rect.top || 0;

    // Create an off-screen canvas to draw the mask
    const offCanvas = document.createElement('canvas');
    offCanvas.width = rectWidth;
    offCanvas.height = rectHeight;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;

    // Fill with background color
    ctx.fillStyle = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;
    ctx.fillRect(0, 0, rectWidth, rectHeight);

    // Cut out circles (make them transparent)
    ctx.globalCompositeOperation = 'destination-out';
    paths.forEach((path) => {
      ctx.beginPath();
      ctx.arc(path.x - rectLeft, path.y - rectTop, path.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Create a pattern from the canvas
    const pattern = new fabricModule.Pattern({
      source: offCanvas,
      repeat: 'no-repeat',
    });

    rect.set({ fill: pattern });
    rect.dirty = true;
    currentCanvas.renderAll();
  }, []);

  // Apply eraser paths from element state
  useEffect(() => {
    if (!fabricReady || !fabricModule) return;
    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    textElements.forEach((element) => {
      if (element.fabricBgRect) {
        applyEraserPaths(element.id, element.fabricBgRect, element.eraserPaths, element.bgColor);
      }
    });
  }, [fabricReady, textElements, applyEraserPaths]);

  // Use refs for values needed in event handlers to avoid stale closures
  const textElementsRef = useRef(textElements);
  const eraserSizeRef = useRef(eraserSize);

  useEffect(() => {
    textElementsRef.current = textElements;
  }, [textElements]);

  useEffect(() => {
    eraserSizeRef.current = eraserSize;
  }, [eraserSize]);

  // Handle editor mode changes
  useEffect(() => {
    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    if (editorMode === 'eraser') {
      // Disable selection in eraser mode
      currentCanvas.selection = false;
      currentCanvas.discardActiveObject();
      currentCanvas.forEachObject((obj: any) => {
        obj._prevSelectable = obj.selectable;
        obj.selectable = false;
        obj.evented = false;
      });

      // Hide default cursor
      currentCanvas.defaultCursor = 'none';
      currentCanvas.hoverCursor = 'none';

      // Find which element's background rect contains the pointer
      const findElementAtPointer = (pointer: { x: number; y: number }) => {
        const elements = textElementsRef.current;
        for (const [id, element] of elements) {
          if (!element.fabricBgRect || !element.showBackground) continue;

          const rect = element.fabricBgRect;
          const rectLeft = rect.left || 0;
          const rectTop = rect.top || 0;
          const rectRight = rectLeft + (rect.width || 0);
          const rectBottom = rectTop + (rect.height || 0);

          if (pointer.x >= rectLeft && pointer.x <= rectRight &&
              pointer.y >= rectTop && pointer.y <= rectBottom) {
            return { id, element };
          }
        }
        return null;
      };

      const doEraserDraw = (pointer: { x: number; y: number }) => {
        const found = findElementAtPointer(pointer);
        if (!found) return;

        const { id, element } = found;
        const newPath: EraserPath = {
          x: pointer.x,
          y: pointer.y,
          radius: eraserSizeRef.current / 2,
        };
        const newPaths = [...(element.eraserPaths || []), newPath];
        updateElement(id, { eraserPaths: newPaths });
      };

      const handleMouseDown = (e: any) => {
        isDrawingRef.current = true;
        if (e.pointer) {
          doEraserDraw(e.pointer);
        }
      };

      const handleMouseMove = (e: any) => {
        if (e.pointer) {
          setCursorPos({ x: e.pointer.x, y: e.pointer.y });
          if (isDrawingRef.current) {
            doEraserDraw(e.pointer);
          }
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
        if (isCanvasValid(fabricCanvasRef.current)) {
          fabricCanvasRef.current.off('mouse:down', handleMouseDown);
          fabricCanvasRef.current.off('mouse:move', handleMouseMove);
          fabricCanvasRef.current.off('mouse:up', handleMouseUp);
          fabricCanvasRef.current.off('mouse:out', handleMouseOut);
          // Restore selection
          fabricCanvasRef.current.selection = true;
          fabricCanvasRef.current.forEachObject((obj: any) => {
            if (obj._prevSelectable !== undefined) {
              obj.selectable = obj._prevSelectable;
              obj.evented = true;
              delete obj._prevSelectable;
            }
          });
        }
        setCursorPos(null);
      };
    } else {
      // Restore normal cursors and selection
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
    }
  }, [editorMode, updateElement]);

  // Handle canvas selection events
  useEffect(() => {
    if (!fabricReady || !fabricModule) return;

    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const handleSelection = (e: any) => {
      const activeObject = e.selected?.[0];
      if (activeObject) {
        const data = activeObject.get('data') as { detectionIndex?: number };
        if (data?.detectionIndex !== undefined) {
          setSelectedElement(data.detectionIndex);
        }
      } else {
        setSelectedElement(null);
      }
    };

    const handleClear = () => {
      setSelectedElement(null);
    };

    currentCanvas.on('selection:created', handleSelection);
    currentCanvas.on('selection:updated', handleSelection);
    currentCanvas.on('selection:cleared', handleClear);

    return () => {
      if (isCanvasValid(fabricCanvasRef.current)) {
        fabricCanvasRef.current.off('selection:created', handleSelection);
        fabricCanvasRef.current.off('selection:updated', handleSelection);
        fabricCanvasRef.current.off('selection:cleared', handleClear);
      }
    };
  }, [fabricReady, setSelectedElement]);

  // Handle compare mode - hide/show all objects
  useEffect(() => {
    const currentCanvas = fabricCanvasRef.current;
    if (!isCanvasValid(currentCanvas)) return;

    const objects = currentCanvas.getObjects();
    objects.forEach((obj: any) => {
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

  if (isDetecting) {
    return (
      <div className="flex items-center justify-center w-full h-[600px] bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Detecting text...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4 relative">
      <div ref={wrapperRef} className={`relative ${isComparing ? 'opacity-100' : ''}`}>
        {/* Eraser cursor overlay */}
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
      {isComparing && (
        <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 rounded text-sm">
          Comparing with original
        </div>
      )}
    </div>
  );
}
