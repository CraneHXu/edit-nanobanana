"use client";

import React from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { useI18n } from '@/lib/i18n';

type Translate = ReturnType<(typeof useI18n)['getState']>['t'];

function getSourceBadgeLabel(source: string | undefined, t: Translate) {
  switch (source) {
    case 'manual':
      return t('sidebar.badgeManual');
    case 'roi_ocr':
      return t('sidebar.badgeRoiOcr');
    case 'ocr':
    default:
      return t('sidebar.badgeOcr');
  }
}

export function Sidebar() {
  const {
    pageModel,
    selectedElementId,
    setSelectedElement,
    deleteElement,
    toggleShowText,
    canvas,
  } = useEditorStore();
  const { t } = useI18n();

  const elements = (pageModel?.regions ?? []).filter((element) => !element.removed);

  const handleSelectElement = (id: number) => {
    setSelectedElement(id);

    if (!canvas) return;

    const targetObject = canvas
      .getObjects()
      .find((obj: any) => obj.get?.('data')?.elementId === id);

    if (targetObject) {
      canvas.setActiveObject(targetObject);
      canvas.renderAll();
    }
  };

  const handleToggleText = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    toggleShowText(id);
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteElement(id);
  };

  if (elements.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-sm">{t('sidebar.noText')}</p>
        <p className="text-xs mt-2">{t('sidebar.uploadHint')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <h3 className="font-semibold text-sm text-gray-700 mb-3">
        {t('sidebar.detectedText')} ({elements.length})
      </h3>

      <div className="space-y-1">
        {elements.map((element) => (
          <div
            key={element.id}
            onClick={() => handleSelectElement(element.id)}
            className={`
              w-full text-left px-3 py-2 rounded-md text-sm cursor-pointer
              transition-colors flex items-center gap-2
              ${selectedElementId === element.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }
            `}
          >
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={(e) => handleDelete(e, element.id)}
                className={`
                  p-1 rounded transition-colors
                  ${selectedElementId === element.id
                    ? 'hover:bg-primary-foreground/20'
                    : 'hover:bg-red-100 text-red-600'
                  }
                `}
                title={t('controls.deleteRegion')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => handleToggleText(e, element.id)}
                className={`
                  p-1 rounded transition-colors
                  ${selectedElementId === element.id
                    ? 'hover:bg-primary-foreground/20'
                    : 'hover:bg-gray-300'
                  }
                  ${element.showText ? 'opacity-100' : 'opacity-40'}
                `}
                title={t('controls.showText')}
              >
                {element.showText ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs mb-1">
                [{element.id}]
              </div>
              <div className="mb-1 flex flex-wrap gap-1">
                <span
                  className={`
                    rounded-full px-1.5 py-0.5 text-[10px] font-medium
                    ${selectedElementId === element.id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-slate-200 text-slate-700'
                    }
                  `}
                >
                  {getSourceBadgeLabel(element.source, t)}
                </span>
                {element.excludedFromClean && (
                  <span
                    className={`
                      rounded-full px-1.5 py-0.5 text-[10px] font-medium
                      ${selectedElementId === element.id
                        ? 'bg-amber-200/40 text-primary-foreground'
                        : 'bg-amber-100 text-amber-700'
                      }
                    `}
                  >
                    {t('sidebar.badgeExcluded')}
                  </span>
                )}
                {element.lowConfidence && (
                  <span
                    className={`
                      rounded-full px-1.5 py-0.5 text-[10px] font-medium
                      ${selectedElementId === element.id
                        ? 'bg-rose-200/40 text-primary-foreground'
                        : 'bg-rose-100 text-rose-700'
                      }
                    `}
                  >
                    {t('sidebar.badgeLowConfidence')}
                  </span>
                )}
              </div>
              <div className={`truncate ${!element.showText ? 'line-through opacity-50' : ''}`}>
                {element.text || t('sidebar.empty')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
