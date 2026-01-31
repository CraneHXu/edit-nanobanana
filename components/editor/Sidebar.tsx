"use client";

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { Eye, EyeOff, Square } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function Sidebar() {
  const { textElements, selectedElementId, setSelectedElement, toggleShowBackground, toggleShowText, canvas } = useEditorStore();
  const { t } = useI18n();

  const elements = Array.from(textElements.values());

  const handleSelectElement = (id: number) => {
    setSelectedElement(id);

    // Also select in canvas
    const element = textElements.get(id);
    if (element?.fabricObject && canvas) {
      canvas.setActiveObject(element.fabricObject);
      canvas.renderAll();
    }
  };

  const handleToggleBackground = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    toggleShowBackground(id);
  };

  const handleToggleText = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    toggleShowText(id);
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
            {/* Toggle buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={(e) => handleToggleBackground(e, element.id)}
                className={`
                  p-1 rounded transition-colors
                  ${selectedElementId === element.id
                    ? 'hover:bg-primary-foreground/20'
                    : 'hover:bg-gray-300'
                  }
                  ${element.showBackground ? 'opacity-100' : 'opacity-40'}
                `}
                title={t('controls.showBackground')}
              >
                <Square className="w-3.5 h-3.5" />
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
