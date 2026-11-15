const API_BASE = '/api/v1';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token ?? null;
}

export class ApiError extends Error {
  constructor(status, code = 'UNKNOWN', message = '', body = null, requestId = null) {
    super(message || `API error: ${status}`);
    this.status = status;
    this.code = code;
    this.body = body;
    this.requestId = requestId;
  }
}

export function newKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function send(path, { method, body, form, idempotencyKey, recoveryAuthorization }) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE_METHODS.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (recoveryAuthorization) headers['X-Teachmi-Recovery-Authorization'] = recoveryAuthorization;

  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
}

export async function request(path, { method = 'GET', body, form, idempotencyKey, recoveryAuthorization, retried = false } = {}) {
  let response;
  try {
    response = await send(path, { method, body, form, idempotencyKey, recoveryAuthorization });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }

  if (response.status === 204) return null;

  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401) csrfToken = null;
    if (response.status === 403 && data?.code === 'CSRF_TOKEN_INVALID' && !retried) {
      const me = await request('/auth/me').catch(() => null);
      if (me?.csrfToken) {
        csrfToken = me.csrfToken;
        return request(path, { method, body, form, idempotencyKey, recoveryAuthorization, retried: true });
      }
    }
    const reference = response.headers.get('X-Teachmi-Request-Id');
    const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference ?? '') ? reference : null;
    throw new ApiError(response.status, data?.code ?? 'UNKNOWN', data?.message ?? '', data, requestId);
  }

  if (!isJson) throw new ApiError(response.status, 'NOT_JSON');
  return data;
}
