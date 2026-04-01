"use client";

import React, { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { TextControls } from '@/components/editor/TextControls';
import { Toolbar } from '@/components/editor/Toolbar';
import { Sidebar } from '@/components/editor/Sidebar';
import { preloadCommonFonts } from '@/lib/font-loader';

const SESSION_STORAGE_KEY = 'image-editor-web-session-v2';

export default function Home() {
  const {
    originalImage,
    sessionHydrated,
    hydrateSession,
    markSessionHydrated,
  } = useEditorStore();

  useEffect(() => {
    preloadCommonFonts();
  }, []);

  useEffect(() => {
    if (sessionHydrated || typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      markSessionHydrated();
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (payload?.originalImage && payload?.imageMeta && payload?.pageModel) {
        hydrateSession(payload);
      } else {
        markSessionHydrated();
      }
    } catch {
      markSessionHydrated();
    }
  }, [hydrateSession, markSessionHydrated, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated || typeof window === 'undefined') return;

    const unsubscribe = useEditorStore.subscribe((state) => {
      try {
        if (!state.originalImage || !state.imageMeta || !state.pageModel) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }

        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          originalImage: state.originalImage,
          imageMeta: state.imageMeta,
          pageModel: state.pageModel,
        }));
      } catch (error) {
        console.error('Failed to persist editor session:', error);
      }
    });

    return unsubscribe;
  }, [sessionHydrated]);

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

          {/* Canvas only rendered when image is loaded */}
          {originalImage && (
            <div className="w-full">
              <CanvasEditor />
            </div>
          )}
        </div>

        {/* Right Sidebar - Controls */}
        <div className={`w-80 bg-white border-l overflow-y-auto ${!originalImage ? 'hidden' : ''}`}>
          <TextControls />
        </div>
      </div>
    </div>
  );
}
