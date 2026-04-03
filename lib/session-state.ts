import type { PageModel } from '@/types/canvas';

interface ImageMeta {
  width: number;
  height: number;
}

interface StoredPageModel extends PageModel {
  baseAutoLayer?: string | null;
  currentLayer?: string | null;
}

interface SessionStateSnapshot {
  originalImage: string | null;
  imageMeta: ImageMeta | null;
  pageModel: PageModel | null;
  baseAutoLayer?: string | null;
  currentLayer?: string | null;
}

export interface SerializedEditorSession {
  originalImage: string;
  imageMeta: ImageMeta;
  pageModel: StoredPageModel;
}

export interface DeserializedEditorSession {
  originalImage: string;
  imageMeta: ImageMeta;
  pageModel: PageModel;
  baseAutoLayer: string | null;
  currentLayer: string | null;
}

export function serializeEditorSession(state: SessionStateSnapshot): SerializedEditorSession | null {
  if (!state.originalImage || !state.imageMeta || !state.pageModel) {
    return null;
  }

  const baseAutoLayer = state.baseAutoLayer ?? state.pageModel.cleanLayer ?? null;
  const currentLayer = state.currentLayer ?? baseAutoLayer;

  return {
    originalImage: state.originalImage,
    imageMeta: { ...state.imageMeta },
    pageModel: {
      ...state.pageModel,
      baseAutoLayer,
      currentLayer,
    },
  };
}

export function deserializeEditorSession(raw: string | null): DeserializedEditorSession | null {
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as Partial<SerializedEditorSession> | null;
    if (!payload || typeof payload.originalImage !== 'string' || !payload.imageMeta || !payload.pageModel) {
      return null;
    }

    const storedPageModel = payload.pageModel as StoredPageModel;
    const {
      baseAutoLayer: storedBaseAutoLayer = null,
      currentLayer: storedCurrentLayer = null,
      ...pageModel
    } = storedPageModel;

    return {
      originalImage: payload.originalImage,
      imageMeta: {
        width: payload.imageMeta.width,
        height: payload.imageMeta.height,
      },
      pageModel: pageModel as PageModel,
      baseAutoLayer: storedBaseAutoLayer ?? pageModel.cleanLayer ?? null,
      currentLayer: storedCurrentLayer ?? storedBaseAutoLayer ?? pageModel.cleanLayer ?? null,
    };
  } catch {
    return null;
  }
}
