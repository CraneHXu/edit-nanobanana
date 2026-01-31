"use client";

import React, { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { TextControls } from '@/components/editor/TextControls';
import { Toolbar } from '@/components/editor/Toolbar';
import { Sidebar } from '@/components/editor/Sidebar';
import { preloadCommonFonts } from '@/lib/font-loader';

export default function Home() {
  const { originalImage } = useEditorStore();

  // Preload common fonts on mount
  useEffect(() => {
    preloadCommonFonts();
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Text List */}
        <div className={`w-64 bg-white border-r overflow-y-auto ${!originalImage ? 'hidden' : ''}`}>
          <Sidebar />
        </div>

        {/* Center - Canvas or Upload */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          {!originalImage ? (
            <div className="max-w-xl w-full">
              <ImageUploader />
            </div>
          ) : null}

          {/* Canvas is always rendered, just hidden when no image */}
          <div className={!originalImage ? 'hidden' : 'w-full'}>
            <CanvasEditor />
          </div>
        </div>

        {/* Right Sidebar - Controls */}
        <div className={`w-80 bg-white border-l overflow-y-auto ${!originalImage ? 'hidden' : ''}`}>
          <TextControls />
        </div>
      </div>
    </div>
  );
}
