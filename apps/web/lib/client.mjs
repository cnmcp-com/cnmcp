import { API_PREFIX } from '@cnmcp/contracts';

export async function api(path, options = {}) {
  const { method = 'GET', body, requestKey, signal } = options;
  const url = path.startsWith('/auth/') ? path : API_PREFIX + path;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requestKey) headers['Idempotency-Key'] = requestKey;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(result?.error?.message || '请求失败，请稍后重试。');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
