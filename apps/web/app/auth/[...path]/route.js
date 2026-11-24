import { oauthNavigationResponse } from '../../../lib/login.mjs';
import { proxy } from '../../../lib/server-api.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  return oauthNavigationResponse(request, await proxy(request));
}
export const POST = proxy;
