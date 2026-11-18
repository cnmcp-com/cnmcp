const accepted = new Set(['__Host-cnmcp_session', '__Host-cnmcp_oauth']);
const auth = new Map([['/auth/github/start','GET'],['/auth/github/callback','GET'],['/auth/logout','POST']]);

export function upstreamHeaders(source) {
  const result = new Headers();
  for (const name of ['content-type', 'origin', 'idempotency-key']) {
    if (source.has(name)) result.set(name, source.get(name));
  }
  const cookies = (source.get('cookie') || '').split(';').map(value => value.trim())
    .filter(value => accepted.has(value.split('=')[0]));
  if (cookies.length) result.set('cookie', cookies.join('; '));
  return result;
}

export function browserResponse(response) {
  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const name of ['content-type','location']) {
    if (response.headers.has(name)) headers.set(name, response.headers.get(name));
  }
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attrs] = cookie.split(';').map(value => value.trim());
    const values = new Set(attrs.map(value => value.toLowerCase()));
    if (accepted.has(pair.split('=')[0]) && values.has('path=/') && values.has('secure') &&
        values.has('httponly') && values.has('samesite=lax') && !attrs.some(value => /^domain=/i.test(value))) {
      headers.append('set-cookie', cookie);
    }
  }
  return new Response(response.body, { status: response.status, headers });
}

export function targetPath(path, method) {
  if (auth.get(path) === method || (path === '/health' && method === 'GET')) return path;
  return /^\/api\/v1\/[\w-]+(?:\/[\w-]+){0,4}$/.test(path) ? path.slice(4) : null;
}
