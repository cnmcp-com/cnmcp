import { getCloudflareContext } from '@opennextjs/cloudflare';
import { browserResponse, targetPath, upstreamHeaders } from './gateway.mjs';

export async function backend(path, init = {}) {
  const url = process.env.CNMCP_LOCAL_API_URL ??
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8787' : undefined);
  if (url) {
    const origin = new URL(url);
    if (['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) {
      return fetch(new URL(path, origin), { ...init, cache: 'no-store', redirect: 'manual' });
    }
  }
  const { env } = await getCloudflareContext({ async: true }).catch(() => ({}));
  if (env?.COMMUNITY) return env.COMMUNITY.fetch(new Request('https://community.internal' + path, init));
  throw new Error('Community service binding unavailable');
}

async function boundedBody(request) {
  if (!request.body || ['GET','HEAD'].includes(request.method)) return undefined;
  const limit = 300000;
  if (Number(request.headers.get('content-length')) > limit) return null;
  const reader = request.body.getReader(), parts = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return new Blob(parts).arrayBuffer();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
}

export async function proxy(request) {
  const { pathname, search } = new URL(request.url);
  const { method } = request;
  const path = targetPath(pathname, method);
  if (!path) return Response.json({ error: { code: 'NOT_FOUND', message: '接口不存在。' } }, { status: 404 });
  try {
    const body = await boundedBody(request);
    if (body === null) return new Response(null, { status: 413 });
    return browserResponse(await backend(path + search, { method, headers: upstreamHeaders(request.headers), body }));
  } catch {
    return Response.json({ error: { code: 'BACKEND_UNAVAILABLE', message: '社区服务暂不可用，请稍后重试。' } },
      { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

export async function load(path) {
  const response = await backend(path);
  if (!response.ok) {
    const error = new Error('社区服务返回 ' + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
