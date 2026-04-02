import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('smoke test', () => {
  it('renders a basic React node', () => {
    const node = React.createElement('div', { 'data-testid': 'smoke' }, 'smoke');
    render(node);
    expect(screen.getByTestId('smoke').textContent).toBe('smoke');
  });
});
