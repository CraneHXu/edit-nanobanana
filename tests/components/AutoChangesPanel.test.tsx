import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AutoChangesPanel } from '@/components/editor/AutoChangesPanel';
import { useI18n } from '@/lib/i18n';
import type { AutoChange } from '@/types/canvas';

function createAutoChange(overrides: Partial<AutoChange> = {}): AutoChange {
  return {
    id: overrides.id ?? 'change-1',
    patchId: overrides.patchId ?? 'patch-1',
    patchKind: overrides.patchKind ?? 'auto_ai',
    previewMode: overrides.previewMode ?? 'current',
    regionIds: overrides.regionIds ?? [7],
    createdAt: overrides.createdAt ?? Date.UTC(2026, 3, 3, 10, 0, 0),
    applied: overrides.applied ?? true,
    reverted: overrides.reverted ?? false,
    description: overrides.description ?? 'Auto AI repair for region 7',
    status: Object.prototype.hasOwnProperty.call(overrides, 'status') ? overrides.status : 'new',
  };
}

describe('AutoChangesPanel', () => {
  it('renders recent auto changes and calls handlers', () => {
    useI18n.setState({ locale: 'en' });
    const onRevert = vi.fn();
    const onMarkSeen = vi.fn();
    const onConfirmAll = vi.fn();

    render(
      <AutoChangesPanel
        autoChanges={[
          createAutoChange(),
          createAutoChange({
            id: 'change-2',
            patchId: 'patch-2',
            createdAt: Date.UTC(2026, 3, 3, 9, 0, 0),
            status: 'seen',
            description: 'Older change',
          }),
        ]}
        onRevert={onRevert}
        onMarkSeen={onMarkSeen}
        onConfirmAll={onConfirmAll}
      />,
    );

    expect(screen.getByText('Auto changes')).toBeInTheDocument();
    expect(screen.getByText('Auto AI repair for region 7')).toBeInTheDocument();
    expect(screen.getByText('Older change')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onMarkSeen).toHaveBeenCalledWith('change-1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Discard' })[0]);
    expect(onRevert).toHaveBeenCalledWith('change-1');
  });

  it('only shows confirm for auto changes with explicit new status', () => {
    useI18n.setState({ locale: 'en' });

    render(
      <AutoChangesPanel
        autoChanges={[
          createAutoChange({ id: 'change-new', status: 'new' }),
          createAutoChange({
            id: 'change-implicit',
            patchId: 'patch-implicit',
            status: undefined,
            applied: true,
            reverted: false,
            description: 'Implicit status change',
          }),
        ]}
        onRevert={vi.fn()}
        onMarkSeen={vi.fn()}
        onConfirmAll={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1);
    expect(screen.getByText('Implicit status change')).toBeInTheDocument();
  });

  it('confirms all pending changes with one click', () => {
    useI18n.setState({ locale: 'en' });
    const onMarkSeen = vi.fn();

    render(
      <AutoChangesPanel
        autoChanges={[
          createAutoChange({ id: 'change-1', createdAt: Date.UTC(2026, 3, 3, 10, 0, 0), status: 'new' }),
          createAutoChange({ id: 'change-2', patchId: 'patch-2', createdAt: Date.UTC(2026, 3, 3, 9, 0, 0), status: 'new' }),
          createAutoChange({ id: 'change-3', patchId: 'patch-3', createdAt: Date.UTC(2026, 3, 3, 8, 0, 0), status: 'seen' }),
        ]}
        onRevert={vi.fn()}
        onMarkSeen={onMarkSeen}
        onConfirmAll={() => {
          onMarkSeen('change-1');
          onMarkSeen('change-2');
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm all' }));
    expect(onMarkSeen).toHaveBeenCalledWith('change-1');
    expect(onMarkSeen).toHaveBeenCalledWith('change-2');
    expect(onMarkSeen).toHaveBeenCalledTimes(2);
  });
});
