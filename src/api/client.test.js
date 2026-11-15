import { afterEach, expect, it, vi } from 'vitest';
import { request, setCsrfToken } from './client';

afterEach(() => vi.unstubAllGlobals());

it('keeps the exact recovery header and body across a pre-dispatch CSRF refresh, and never retries uncertainty', async () => {
  setCsrfToken('old-test-csrf');
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'CSRF_TOKEN_INVALID' }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'new-test-csrf' }), { headers: { 'Content-Type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'AI_GENERATION_UNCERTAIN' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(request('/sessions/test/problems/p2/attempts', { method: 'POST', body: { answer: ' x ', work: ' y ' },
    idempotencyKey: 'original-key', recoveryAuthorization: '619e6188-7dc2-4c2e-9b37-80afcfac318d' })).rejects.toMatchObject({ status: 503 });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[2][1].body);
  for (const i of [0, 2]) {
    expect(fetch.mock.calls[i][1].headers['Idempotency-Key']).toBe('original-key');
    expect(fetch.mock.calls[i][1].headers['X-Teachmi-Recovery-Authorization']).toBe('619e6188-7dc2-4c2e-9b37-80afcfac318d');
  }
});

it('captures only a bounded UUID support header and never retries a 503', async () => {
  const requestId = '1860997b-fc79-4659-95cb-dc6913b903c1';
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'AI_GENERATION_UNCERTAIN' }), {
    status: 503, headers: { 'Content-Type': 'application/json', 'X-Teachmi-Request-Id': requestId },
  }));
  vi.stubGlobal('fetch', fetch);
  await expect(request('/sessions/test/mode', { method: 'PUT', body: { mode: 'first' }, idempotencyKey: 'same-key' }))
    .rejects.toMatchObject({ status: 503, requestId });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(new Response('{}', { status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Teachmi-Request-Id': 'untrusted-header' } }));
  await expect(request('/sessions/test')).rejects.toMatchObject({ requestId: null });
});
