import { beforeEach, expect, it, vi } from 'vitest';
import { read } from './api';

beforeEach(() => vi.restoreAllMocks());
it('does not start a network request for an already cancelled view', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const controller = new AbortController(); controller.abort();
  await expect(read('/services', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
});
it('cancels superseded reads without turning cancellation into a connection error', async () => {
  vi.stubGlobal('fetch', (_: unknown, options: RequestInit) => new Promise((_, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
  }));
  const controller = new AbortController(); const pending = read('/services', controller.signal);
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('gives an actionable message when the network is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(read('/services')).rejects.toMatchObject({ status: 0, message: 'Unable to reach Relay. Check your connection and try again.' });
});
