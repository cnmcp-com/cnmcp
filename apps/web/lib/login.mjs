import { queryPath } from '@cnmcp/contracts';

export const loginPath = path => queryPath('/login', { return: path });
export const githubLoginPath = path => queryPath('/auth/github/start', { return: path });

export function oauthNavigationResponse(request, response) {
  if (response.status < 400 || !request.headers.get('accept')?.includes('text/html')) return response;

  const { pathname, searchParams } = new URL(request.url);
  if (pathname !== '/auth/github/start' && pathname !== '/auth/github/callback') return response;

  const error = response.status >= 500 ? 'unavailable' :
    searchParams.get('error') === 'access_denied' ? 'cancelled' : 'expired';
  return new Response(null, { status: 303, headers: {
    Location: queryPath('/login', { error, return: searchParams.get('return') }),
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer'
  } });
}
