import test from 'node:test';
import assert from 'node:assert/strict';
import { browserResponse, targetPath, upstreamHeaders } from './gateway.mjs';
import { githubLoginPath, loginPath, oauthNavigationResponse } from './login.mjs';

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

test('OAuth browser errors return to the login page and preserve the retry destination', () => {
  const origin = 'https://www.cnmcp.com';
  const returnTo = '/publish-resource?domain=video';
  assert.equal(new URL(loginPath(returnTo), origin).searchParams.get('return'), returnTo);
  const start = new Request(new URL(githubLoginPath(returnTo), origin), { headers: { accept: 'text/html' } });
  const unavailable = new Response(null, { status: 503 });
  const redirect = oauthNavigationResponse(start, unavailable);
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  const retry = new URL(redirect.headers.get('location'), origin);
  assert.equal(retry.pathname, '/login');
  assert.equal(retry.searchParams.get('error'), 'unavailable');
  assert.equal(retry.searchParams.get('return'), returnTo);
  const callback = new Request(origin + '/auth/github/callback?error=access_denied&state=private', {
    headers: { accept: 'text/html' }
  });
  const cancelled = oauthNavigationResponse(callback, new Response(null, { status: 400 }));
  assert.equal(cancelled.headers.get('location'), '/login?error=cancelled');
  assert.equal(cancelled.headers.get('referrer-policy'), 'no-referrer');
  const success = new Response(null, { status: 302, headers: { location: 'https://github.com/login/oauth/authorize' } });
  assert.equal(oauthNavigationResponse(start, success), success);
  assert.equal(oauthNavigationResponse(new Request(start.url), unavailable), unavailable);
});
