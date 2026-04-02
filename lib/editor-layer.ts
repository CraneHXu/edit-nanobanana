import type { ImagePatch, PreviewMode } from '@/types/canvas';

export interface RestoreOriginalPatchOptions {
  id?: string;
  regionIds: number[];
  roiId?: string;
  createdAt?: number;
  previewMode?: PreviewMode;
  description?: string;
}

function buildPatchId(createdAt: number): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `restore-${crypto.randomUUID()}`;
  }
  return `restore-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildRestoreOriginalPatch(options: RestoreOriginalPatchOptions): ImagePatch {
  const createdAt = options.createdAt ?? Date.now();
  const id = options.id ?? buildPatchId(createdAt);

  return {
    id,
    kind: 'restore_original',
    regionIds: options.regionIds,
    roiId: options.roiId,
    previewMode: options.previewMode ?? 'original',
    createdAt,
    applied: true,
    reverted: false,
    description: options.description,
  };
}

export function composeCurrentLayer<TLayer>(params: {
  baseLayer: TLayer | null;
  patches?: ImagePatch[];
  applyPatch: (layer: TLayer, patch: ImagePatch) => TLayer;
}): TLayer | null {
  if (params.baseLayer == null) {
    return null;
  }

  const ordered = (params.patches ?? [])
    .map((patch, index) => ({ patch, index }))
    .filter(({ patch }) => patch.applied && !patch.reverted)
    .sort((a, b) => {
      const timeDelta = a.patch.createdAt - b.patch.createdAt;
      return timeDelta !== 0 ? timeDelta : a.index - b.index;
    })
    .map(({ patch }) => patch);

  return ordered.reduce((layer, patch) => params.applyPatch(layer, patch), params.baseLayer);
}

export function resolvePreviewBackground(params: {
  previewMode: PreviewMode;
  originalImage: string | null;
  baseAutoLayer: string | null;
  currentLayer: string | null;
}): string | null {
  switch (params.previewMode) {
    case 'original':
      return params.originalImage;
    case 'auto':
      return params.baseAutoLayer ?? params.originalImage;
    case 'current':
      return params.currentLayer ?? params.baseAutoLayer ?? params.originalImage;
  }
}
