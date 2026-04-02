import type { BoundingBox, RGBColor } from '@/types/ocr';
import type {
  AutoChange,
  FontWeight,
  ImagePatch,
  PageModel,
  TextAlign,
  TextElement,
  TextElementSnapshot,
} from '@/types/canvas';

const DEFAULT_FONT_COLOR: RGBColor = { r: 0, g: 0, b: 0 };

export interface ManualTextElementParams {
  id: number;
  text: string;
  bbox: BoundingBox;
  sourceBounds?: BoundingBox;
  sourcePolygon?: [number, number][];
  rotation?: number;
  layoutOffsetY?: number;
  confidence?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  textAlign?: TextAlign;
  fontColor?: RGBColor;
  textColorRaw?: RGBColor;
  textColorQuantized?: RGBColor;
  bgColor?: RGBColor | null;
}

function buildSnapshot(region: Omit<TextElement, 'original'>): TextElementSnapshot {
  return {
    bbox: { ...region.bbox },
    text: region.text,
    fontFamily: region.fontFamily,
    fontSize: region.fontSize,
    layoutOffsetY: region.layoutOffsetY,
    fontWeight: region.fontWeight,
    textAlign: region.textAlign,
    fontColor: { ...region.fontColor },
    textColorRaw: { ...region.textColorRaw },
    textColorMode: region.textColorMode,
    bgColor: region.bgColor ? { ...region.bgColor } : null,
    bgMode: region.bgMode,
    showBackground: region.showBackground,
    showText: region.showText,
  };
}

export function createManualTextElement(params: ManualTextElementParams): TextElement {
  const fontColor = params.fontColor ?? DEFAULT_FONT_COLOR;
  const textColorRaw = params.textColorRaw ?? fontColor;
  const textColorQuantized = params.textColorQuantized ?? textColorRaw;
  const normalizedBBox = { ...params.bbox };
  const normalizedSourceBounds = params.sourceBounds ? { ...params.sourceBounds } : { ...params.bbox };
  const base: Omit<TextElement, 'original'> = {
    id: params.id,
    source: 'manual',
    removed: false,
    excludedFromClean: true,
    confirmed: true,
    lowConfidence: false,
    sourceBounds: normalizedSourceBounds,
    bbox: normalizedBBox,
    sourcePolygon: params.sourcePolygon,
    rotation: params.rotation ?? 0,
    layoutOffsetY: params.layoutOffsetY ?? 0,
    text: params.text,
    confidence: params.confidence ?? 0,
    fontFamily: params.fontFamily ?? 'Noto Sans SC',
    fontSize: params.fontSize ?? 16,
    fontWeight: params.fontWeight ?? 'normal',
    textAlign: params.textAlign ?? 'left',
    fontColor: { ...fontColor },
    textColorRaw: { ...textColorRaw },
    textColorMode: 'manual',
    textColorQuantized: { ...textColorQuantized },
    bgColor: params.bgColor ?? null,
    bgMode: 'manual',
    showBackground: params.bgColor != null,
    showText: true,
    eraserPaths: [],
  };

  return {
    ...base,
    original: buildSnapshot(base),
  };
}

function mapRegionById(
  regions: TextElement[],
  id: number,
  updater: (region: TextElement) => TextElement,
): TextElement[] {
  return regions.map((region) => (region.id === id ? updater(region) : region));
}

function flagPatch(patch: ImagePatch, applied: boolean, reverted: boolean): ImagePatch {
  return { ...patch, applied, reverted };
}

function flagAutoChange(change: AutoChange, applied: boolean, reverted: boolean): AutoChange {
  return { ...change, applied, reverted };
}

export type PageMutation =
  | { type: 'remove-region'; regionId: number }
  | { type: 'restore-region'; regionId: number }
  | { type: 'add-region'; element: TextElement }
  | { type: 'replace-roi-regions'; regions: TextElement[] }
  | { type: 'apply-patch'; patch: ImagePatch; autoChange?: AutoChange }
  | { type: 'revert-patch'; patchId: string; autoChangeId?: string };

export function applyPageMutation(pageModel: PageModel, mutation: PageMutation): PageModel {
  switch (mutation.type) {
    case 'remove-region': {
      return {
        ...pageModel,
        regions: mapRegionById(pageModel.regions, mutation.regionId, (region) => ({
          ...region,
          removed: true,
          excludedFromClean: true,
        })),
      };
    }
    case 'restore-region': {
      return {
        ...pageModel,
        regions: mapRegionById(pageModel.regions, mutation.regionId, (region) => ({
          ...region,
          removed: false,
          confirmed: true,
        })),
      };
    }
    case 'add-region': {
      return {
        ...pageModel,
        regions: [...pageModel.regions, mutation.element],
      };
    }
    case 'replace-roi-regions': {
      const remaining = pageModel.regions.filter((region) => region.source !== 'roi_ocr');
      return {
        ...pageModel,
        regions: [...remaining, ...mutation.regions],
      };
    }
    case 'apply-patch': {
      const nextPatches = [
        ...(pageModel.patches ?? []).filter((patch) => patch.id !== mutation.patch.id),
        flagPatch(mutation.patch, true, false),
      ];
      const autoChange = mutation.autoChange;
      const nextAutoChanges =
        autoChange != null
          ? [
              ...(pageModel.autoChanges ?? []).filter((change) => change.id !== autoChange.id),
              flagAutoChange(autoChange, true, false),
            ]
          : pageModel.autoChanges;

      return {
        ...pageModel,
        patches: nextPatches,
        autoChanges: nextAutoChanges,
      };
    }
    case 'revert-patch': {
      const nextPatches = pageModel.patches
        ? pageModel.patches.map((patch) =>
            patch.id === mutation.patchId ? flagPatch(patch, false, true) : patch,
          )
        : undefined;
      const nextAutoChanges =
        mutation.autoChangeId && pageModel.autoChanges
          ? pageModel.autoChanges.map((change) =>
              change.id === mutation.autoChangeId ? flagAutoChange(change, false, true) : change,
            )
          : pageModel.autoChanges;

      return {
        ...pageModel,
        patches: nextPatches,
        autoChanges: nextAutoChanges,
      };
    }
  }

  assertNever(mutation);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled page mutation ${JSON.stringify(value)}`);
}
