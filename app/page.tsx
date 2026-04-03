"use client";

import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { ImageUploader } from '@/components/editor/ImageUploader';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { TextControls } from '@/components/editor/TextControls';
import { Toolbar } from '@/components/editor/Toolbar';
import { Sidebar } from '@/components/editor/Sidebar';
import { preloadCommonFonts } from '@/lib/font-loader';
import { generateCleanBackground } from '@/lib/clean-background';
import { deserializeEditorSession, serializeEditorSession } from '@/lib/session-state';

const SESSION_STORAGE_KEY = 'image-editor-web-session-v2';
const SESSION_PERSIST_THROTTLE_MS = 300;

export default function Home() {
  const {
    originalImage,
    imageFile,
    pageModel,
    baseAutoLayer,
    isCleaningBackground,
    sessionHydrated,
    hydrateSession,
    markSessionHydrated,
    setIsCleaningBackground,
    setCleanLayer,
    setPreviewMode,
  } = useEditorStore();
  const didBackfillHydratedCleanLayerRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<ReturnType<typeof serializeEditorSession>>(null);

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
      const payload = deserializeEditorSession(raw);
      if (!payload) {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        markSessionHydrated();
        return;
      }

      hydrateSession({
        originalImage: payload.originalImage,
        imageMeta: payload.imageMeta,
        pageModel: payload.pageModel,
      });
      useEditorStore.setState({
        baseAutoLayer: payload.baseAutoLayer,
        currentLayer: payload.currentLayer,
      });
    } catch (error) {
      console.error('Failed to restore editor session:', error);
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      markSessionHydrated();
    }
  }, [hydrateSession, markSessionHydrated, sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated || typeof window === 'undefined') return;
    pendingPersistRef.current = serializeEditorSession(useEditorStore.getState());

    const flushPersist = () => {
      try {
        const payload = pendingPersistRef.current;
        if (!payload) {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }

        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.error('Failed to persist editor session:', error);
      }
    };

    const unsubscribe = useEditorStore.subscribe((state) => {
      pendingPersistRef.current = serializeEditorSession(state);
      if (persistTimerRef.current !== null) {
        return;
      }

      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        flushPersist();
      }, SESSION_PERSIST_THROTTLE_MS);
    });

    return () => {
      unsubscribe();
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushPersist();
    };
  }, [sessionHydrated]);

  useEffect(() => {
    if (!sessionHydrated || imageFile !== null) {
      return;
    }
    if (didBackfillHydratedCleanLayerRef.current) {
      return;
    }
    if (!originalImage || !pageModel || pageModel.cleanLayer || baseAutoLayer || isCleaningBackground) {
      return;
    }

    didBackfillHydratedCleanLayerRef.current = true;
    setIsCleaningBackground(true);

    void generateCleanBackground(originalImage, pageModel)
      .then((cleanLayer) => {
        setCleanLayer(cleanLayer);
        setPreviewMode('current');
      })
      .catch((error) => {
        console.error('Failed to backfill clean layer for hydrated session:', error);
      })
      .finally(() => {
        setIsCleaningBackground(false);
      });
  }, [
    baseAutoLayer,
    imageFile,
    isCleaningBackground,
    originalImage,
    pageModel,
    sessionHydrated,
    setCleanLayer,
    setIsCleaningBackground,
    setPreviewMode,
  ]);

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
