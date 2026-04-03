"use client";

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { detectText, inpaintRegion, mergePatchIntoImage } from '@/lib/api-client';
import { buildAutoRepairCandidates, shouldDropAsyncResult, shouldUseAutoAi } from '@/lib/auto-repair';
import { enhanceDetectionsWithStyles } from '@/lib/color-sampler';
import { estimateRegionComplexity, generateCleanBackground } from '@/lib/clean-background';
import { useI18n } from '@/lib/i18n';
import type { AutoChange, ImagePatch, TextElement } from '@/types/canvas';
import type { BoundingBox } from '@/types/ocr';

function isAutoRepairRegion(region: TextElement | undefined): region is TextElement {
  if (!region || region.removed || region.excludedFromClean) {
    return false;
  }

  const source = region.source ?? 'ocr';
  return source === 'ocr' || source === 'roi_ocr';
}

function buildAutoAiEntry(
  regionId: number,
  patchId: string,
  createdAt: number,
  crop: BoundingBox,
  imageDataUrl: string,
): {
  patch: ImagePatch;
  autoChange: AutoChange;
} {
  const patch: ImagePatch = {
    id: patchId,
    kind: 'auto_ai',
    regionIds: [regionId],
    crop,
    imageDataUrl,
    previewMode: 'current',
    createdAt,
    applied: true,
    reverted: false,
    description: `Auto AI repair for region ${regionId}`,
  };

  return {
    patch,
    autoChange: {
      id: `change-${patchId}`,
      patchId,
      patchKind: patch.kind,
      previewMode: patch.previewMode,
      regionIds: patch.regionIds,
      createdAt,
      applied: true,
      reverted: false,
      description: patch.description,
      status: 'new',
    },
  };
}

export function ImageUploader() {
  const {
    loadImage,
    initializeFromDetections,
    setIsDetecting,
    setIsCleaningBackground,
    setCleanLayer,
    setBaseAutoLayer,
    setCurrentLayer,
    setPreviewMode,
    applyAutoPatch,
  } = useEditorStore();
  const { t } = useI18n();

  const runAutoAiQueue = useCallback(async (imageUrl: string) => {
    const initialPageModel = useEditorStore.getState().pageModel;
    if (!initialPageModel) {
      return;
    }

    const candidates = buildAutoRepairCandidates(initialPageModel);
    for (const candidate of candidates) {
      const stateBeforeComplexity = useEditorStore.getState();
      const regionBeforeComplexity = stateBeforeComplexity.pageModel?.regions.find(
        (region) => region.id === candidate.regionId,
      );
      if (!isAutoRepairRegion(regionBeforeComplexity)) {
        continue;
      }

      try {
        const complexity = await estimateRegionComplexity(imageUrl, regionBeforeComplexity);
        if (!shouldUseAutoAi(complexity)) {
          continue;
        }

        const submittedRevision = useEditorStore.getState().autoAiRevision;
        const baseLayerForApply = stateBeforeComplexity.currentLayer ?? stateBeforeComplexity.baseAutoLayer ?? imageUrl;
        const response = await inpaintRegion({
          imageDataUrl: baseLayerForApply,
          source: baseLayerForApply === imageUrl ? 'original' : 'cleanLayer',
          sourceBounds: candidate.sourceBounds,
          sourcePolygon: candidate.sourcePolygon,
          pageSize: {
            width: stateBeforeComplexity.pageModel?.originalWidth ?? initialPageModel.originalWidth,
            height: stateBeforeComplexity.pageModel?.originalHeight ?? initialPageModel.originalHeight,
          },
        });
        if (response.success === false) {
          throw new Error('Inpaint API returned an unsuccessful result');
        }

        const latestState = useEditorStore.getState();
        if (shouldDropAsyncResult(submittedRevision, latestState.autoAiRevision)) {
          continue;
        }

        const latestRegion = latestState.pageModel?.regions.find((region) => region.id === candidate.regionId);
        if (!isAutoRepairRegion(latestRegion)) {
          continue;
        }

          const patchImage = response.patch ?? response.imageDataUrl;
          const patchCrop = response.crop ?? candidate.sourceBounds;
          if (!patchImage) {
            throw new Error('Inpaint API returned no patch image');
          }

          const nextCurrentLayer = await mergePatchIntoImage(
            baseLayerForApply,
            patchImage,
            patchCrop,
            {
              width: latestState.pageModel?.originalWidth ?? initialPageModel.originalWidth,
              height: latestState.pageModel?.originalHeight ?? initialPageModel.originalHeight,
            },
          );

          const stateBeforeApply = useEditorStore.getState();
          if (shouldDropAsyncResult(submittedRevision, stateBeforeApply.autoAiRevision)) {
            continue;
          }

          const createdAt = Date.now();
          const patchId = response.patchId ?? `auto-ai-${candidate.regionId}-${createdAt}`;
          const { patch, autoChange } = buildAutoAiEntry(
            candidate.regionId,
            patchId,
            createdAt,
            patchCrop,
            patchImage,
          );
          applyAutoPatch(patch, autoChange, nextCurrentLayer);
          useEditorStore.getState().setCurrentLayer(nextCurrentLayer);
        } catch (error) {
          console.error(`Failed to auto repair region ${candidate.regionId}:`, error);
        }
    }
  }, [applyAutoPatch]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    console.log('Image selected:', file.name, file.size, 'bytes');

    try {
      // Load image into store
      console.log('Loading image...');
      await loadImage(file);
      console.log('Image loaded successfully');

      // Get the image data URL for color sampling
      const imageUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      // Trigger text detection
      console.log('Starting text detection...');
      setIsDetecting(true);
      const response = await detectText(file);
      console.log('Text detection complete:', response.count, 'regions found');

      // Enhance detections with browser-side style inference
      console.log('Inferring font size and colors from image...');
      const enhancedDetections = await enhanceDetectionsWithStyles(
        response.detections,
        imageUrl
      );
      console.log('Style inference complete');

      initializeFromDetections(enhancedDetections);
      setIsCleaningBackground(true);
      let shouldStartAutoAi = false;
      try {
        const nextPageModel = useEditorStore.getState().pageModel;
        if (!nextPageModel) {
          throw new Error('Page model is missing after OCR initialization');
        }

        console.log('Generating initial clean background...');
        const cleanLayer = await generateCleanBackground(imageUrl, nextPageModel);
        setCleanLayer(cleanLayer);
        setBaseAutoLayer(cleanLayer);
        setCurrentLayer(cleanLayer);
        setPreviewMode('current');
        shouldStartAutoAi = true;
      } catch (error) {
        console.error('Failed to generate initial clean background:', error);
        alert(`${t('toolbar.refreshCleanBackground')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsCleaningBackground(false);
      }
      setIsDetecting(false);
      if (shouldStartAutoAi) {
        void runAutoAiQueue(imageUrl);
      }
    } catch (error) {
      console.error('Failed to process image:', error);
      setIsDetecting(false);
      setIsCleaningBackground(false);
      alert(`${t('uploader.failed')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [
    initializeFromDetections,
    loadImage,
    runAutoAiQueue,
    setBaseAutoLayer,
    setCleanLayer,
    setCurrentLayer,
    setIsCleaningBackground,
    setIsDetecting,
    setPreviewMode,
    t,
  ]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    multiple: false,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-12
        flex flex-col items-center justify-center
        cursor-pointer transition-colors
        ${isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-gray-300 hover:border-primary/50'
        }
      `}
      suppressHydrationWarning
    >
      <input {...getInputProps()} suppressHydrationWarning />
      <Upload className="w-12 h-12 text-gray-400 mb-4" />
      {isDragActive ? (
        <p className="text-lg text-primary font-medium">{t('uploader.dropHere')}</p>
      ) : (
        <>
          <p className="text-lg font-medium text-gray-700 mb-2">
            {t('uploader.dropOrClick')}
          </p>
          <p className="text-sm text-gray-500">
            {t('uploader.formats')}
          </p>
        </>
      )}
    </div>
  );
}
