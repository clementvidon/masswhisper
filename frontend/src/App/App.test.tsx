import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ emoji: '☀️', text: 'Mocked!' }),
      }),
    ) as unknown as typeof fetch;
  });

  it('affiche le titre fallback dans un h1', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('MassWhisper');
  });
});
