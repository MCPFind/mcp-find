// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CodeBlock } from '../ui/code-block';
import { trackConfigCopied } from '@/lib/analytics';
vi.mock('@/lib/analytics', () => ({ trackConfigCopied: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const context = { server_slug: 'example', client: 'cursor', format: 'config' as const };
it('records a successful copy without sending the configuration', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<CodeBlock code='private configuration' copyContext={context} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(trackConfigCopied).toHaveBeenCalledExactlyOnceWith(context));
  expect(writeText).toHaveBeenCalledWith('private configuration');
});
it('shows a recoverable message and sends no conversion when clipboard access fails', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  render(<CodeBlock code='configuration' copyContext={context} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Select and copy'));
  expect(trackConfigCopied).not.toHaveBeenCalled();
});
