"use client";

import React, { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GOOGLE_FONTS, loadGoogleFont } from '@/lib/font-loader';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

interface FontSelectorProps {
  value: string;
  onValueChange: (font: string) => void;
  disabled?: boolean;
}

export function FontSelector({ value, onValueChange, disabled }: FontSelectorProps) {
  const { t } = useI18n();

  // Load font when selected
  useEffect(() => {
    if (value) {
      loadGoogleFont(value);
    }
  }, [value]);

  const handleValueChange = async (fontName: string) => {
    // Load the font before applying it
    await loadGoogleFont(fontName);
    onValueChange(fontName);
  };

  return (
    <div className="space-y-2">
      <Label>{t('controls.fontFamily')}</Label>
      <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('controls.selectFont')} />
        </SelectTrigger>
        <SelectContent>
          {/* Sans-serif fonts */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {t('font.sansSerif')}
          </div>
          {GOOGLE_FONTS.filter(f => f.category === 'sans-serif' && !f.cjk).map((font) => (
            <SelectItem
              key={font.name}
              value={font.name}
              style={{ fontFamily: font.name }}
            >
              {font.name}
            </SelectItem>
          ))}

          {/* Serif fonts */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
            {t('font.serif')}
          </div>
          {GOOGLE_FONTS.filter(f => f.category === 'serif' && !f.cjk).map((font) => (
            <SelectItem
              key={font.name}
              value={font.name}
              style={{ fontFamily: font.name }}
            >
              {font.name}
            </SelectItem>
          ))}

          {/* Monospace fonts */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
            {t('font.monospace')}
          </div>
          {GOOGLE_FONTS.filter(f => f.category === 'monospace').map((font) => (
            <SelectItem
              key={font.name}
              value={font.name}
              style={{ fontFamily: font.name }}
            >
              {font.name}
            </SelectItem>
          ))}

          {/* Handwriting fonts */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
            {t('font.handwriting')}
          </div>
          {GOOGLE_FONTS.filter(f => f.category === 'handwriting' && !f.cjk).map((font) => (
            <SelectItem
              key={font.name}
              value={font.name}
              style={{ fontFamily: font.name }}
            >
              {font.name}
            </SelectItem>
          ))}

          {/* Chinese fonts */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
            {t('font.chinese')}
          </div>
          {GOOGLE_FONTS.filter(f => f.cjk).map((font) => (
            <SelectItem
              key={font.name}
              value={font.name}
              style={{ fontFamily: font.name }}
            >
              {font.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
