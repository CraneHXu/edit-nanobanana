"use client";

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { detectText } from '@/lib/api-client';
import { enhanceDetectionsWithStyles } from '@/lib/color-sampler';
import { generateCleanBackground } from '@/lib/clean-background';
import { useI18n } from '@/lib/i18n';

export function ImageUploader() {
  const {
    loadImage,
    initializeFromDetections,
    setIsDetecting,
    setIsCleaningBackground,
    setCleanLayer,
    setPreviewMode,
  } = useEditorStore();
  const { t } = useI18n();

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
      try {
        const nextPageModel = useEditorStore.getState().pageModel;
        if (!nextPageModel) {
          throw new Error('Page model is missing after OCR initialization');
        }

        console.log('Generating initial clean background...');
        const cleanLayer = await generateCleanBackground(imageUrl, nextPageModel);
        setCleanLayer(cleanLayer);
        setPreviewMode('final');
      } catch (error) {
        console.error('Failed to generate initial clean background:', error);
        alert(`${t('toolbar.refreshCleanBackground')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsCleaningBackground(false);
      }
      setIsDetecting(false);
    } catch (error) {
      console.error('Failed to process image:', error);
      setIsDetecting(false);
      setIsCleaningBackground(false);
      alert(`${t('uploader.failed')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [initializeFromDetections, loadImage, setCleanLayer, setIsCleaningBackground, setIsDetecting, setPreviewMode, t]);

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
