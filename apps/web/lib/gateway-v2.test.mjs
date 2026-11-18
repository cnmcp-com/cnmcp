import test from 'node:test';
import assert from 'node:assert/strict';
import { browserResponse, targetPath, upstreamHeaders } from './gateway.mjs';

test('BFF only forwards supported routes, headers and session cookies', () => {
  assert.equal(targetPath('/api/v1/resources/id/discussions', 'GET'), '/v1/resources/id/discussions');
  assert.equal(targetPath('/auth/github/callback', 'GET'), '/auth/github/callback');
  assert.equal(targetPath('/auth/logout', 'GET'), null);
  assert.equal(targetPath('/api/v1/%2e%2e/admin', 'GET'), null);
  assert.equal(targetPath('/admin', 'GET'), null);
  const headers = upstreamHeaders(new Headers({
    cookie: '__Host-cnmcp_session=test; other=value; __Host-cnmcp_oauth=state',
    origin: 'https://www.cnmcp.com',
    'x-user-id': 'untrusted'
  }));
  assert.equal(headers.get('cookie'), '__Host-cnmcp_session=test; __Host-cnmcp_oauth=state');
  assert.equal(headers.get('origin'), 'https://www.cnmcp.com');
  assert.equal(headers.has('x-user-id'), false);
});

test('BFF keeps secure host-only OAuth cookies and disables shared caching', () => {
  const secure = '__Host-cnmcp_session=testing; Path=/; HttpOnly; Secure; SameSite=Lax';
  const response = browserResponse(new Response(null, { status: 302, headers: [
    ['Location', '/'], ['Set-Cookie', secure], ['Set-Cookie', secure + '; Domain=example.com'],
    ['Set-Cookie', 'another=invalid; Path=/; HttpOnly; Secure; SameSite=Lax'],
    ['Set-Cookie', '__Host-cnmcp_oauth=invalid; Path=/; Secure; SameSite=Lax'],
    ['Cache-Control', 'public']
  ] }));
  assert.equal(response.status, 302);
  assert.deepEqual(response.headers.getSetCookie(), [secure]);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
