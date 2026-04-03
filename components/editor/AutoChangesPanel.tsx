"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import type { AutoChange } from '@/types/canvas';

interface AutoChangesPanelProps {
  autoChanges: AutoChange[];
  onRevert: (changeId: string) => void;
  onMarkSeen: (changeId: string) => void;
}

type Translate = ReturnType<(typeof useI18n)['getState']>['t'];

function formatTimestamp(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

function getStatusClasses(status: 'new' | 'seen' | 'reverted'): string {
  switch (status) {
    case 'new':
      return 'bg-emerald-100 text-emerald-700';
    case 'seen':
      return 'bg-slate-100 text-slate-600';
    case 'reverted':
      return 'bg-amber-100 text-amber-700';
  }
}

function getStatusLabel(status: 'new' | 'seen' | 'reverted', t: Translate): string {
  switch (status) {
    case 'new':
      return t('toolbar.autoChangeStatus.new');
    case 'seen':
      return t('toolbar.autoChangeStatus.seen');
    case 'reverted':
      return t('toolbar.autoChangeStatus.reverted');
  }
}

export function AutoChangesPanel({ autoChanges, onRevert, onMarkSeen }: AutoChangesPanelProps) {
  const { t } = useI18n();
  const recentChanges = [...autoChanges].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="w-[360px] rounded-lg border bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('toolbar.autoChanges')}</h3>
          <p className="text-xs text-slate-500">
            {t('toolbar.autoChangesSummary').replace('{count}', String(recentChanges.length))}
          </p>
        </div>
      </div>

      {recentChanges.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
          {t('toolbar.autoChangesEmpty')}
        </div>
      ) : (
        <div className="space-y-2">
          {recentChanges.map((change) => {
            const status = change.status ?? 'seen';
            return (
              <div key={change.id} className="rounded-md border border-slate-200 px-3 py-2">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {change.description || t('toolbar.autoChangesFallback')}
                    </p>
                    <p className="text-xs text-slate-500">{formatTimestamp(change.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusClasses(status)}`}>
                    {getStatusLabel(status, t)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {t('toolbar.autoChangesRegions').replace('{count}', String(change.regionIds.length))}
                  </p>
                  <div className="flex items-center gap-2">
                    {status === 'new' && (
                      <Button variant="ghost" size="sm" onClick={() => onMarkSeen(change.id)}>
                        {t('toolbar.markSeen')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRevert(change.id)}
                      disabled={status === 'reverted'}
                    >
                      {t('toolbar.revertAutoChange')}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
