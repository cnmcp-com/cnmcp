import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = new URL(process.argv[2] || process.env.CNMCP_SMOKE_ORIGIN);
assert.equal(origin.protocol, 'https:');

async function get(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, path);
  return response.json();
}

const status = await get('/health');
assert.equal(status.version, '2.0');
assert.equal(status.domains, 6);
const taxonomy = await get('/api/v1/taxonomy');
assert.deepEqual(taxonomy.domains.map(row => row.id), ['video','game','ai','dev','productivity','self-hosting']);
for (const domain of ['video','game','ai','dev']) {
  const resources = await get('/api/v1/resources?limit=30&domain=' + domain);
  assert.ok(resources.items.length >= 25);
  const detail = await get('/api/v1/resources/' + resources.items[0].id);
  assert.ok(detail.sources.length);
}
const page = await fetch(new URL('/', origin), { signal: AbortSignal.timeout(15000) });
assert.equal(page.status, 200);
const homepage = await page.text();
assert.ok(homepage.includes('id="overview-title"'), 'Community overview is missing');
assert.ok(homepage.includes('id="overview-domains"'), 'Domain discovery is missing');
assert.ok(homepage.includes('id="overview-resources"'), 'Recent resources are missing');
assert.ok(/最近讨论|发起讨论/.test(homepage), 'Discussion section is missing');
assert.ok(homepage.includes('class="brand"'), 'Site brand is missing');
assert.ok(homepage.includes('/cnmcp-icon.svg?v=2'), 'Site Logo is missing');
const logo = await fetch(new URL('/cnmcp-icon.svg?v=2', origin), { signal: AbortSignal.timeout(15000) });
assert.equal(logo.status, 200);
assert.match(logo.headers.get('content-type') ?? '', /^image\/svg\+xml\b/);
assert.equal(await logo.text(), await readFile(new URL('../apps/web/public/cnmcp-icon.svg', import.meta.url), 'utf8'));
const hero = await fetch(new URL('/open-source-studio.jpg', origin), { signal: AbortSignal.timeout(15000) });
assert.equal(hero.status, 200);
assert.match(hero.headers.get('content-type') ?? '', /^image\/jpeg\b/);
const guided = await get('/api/v1/resources?domain=video&guide=1');
assert.ok(guided.items.length > 0, 'No resources with a guide');
const guide = await get('/api/v1/resources/' + guided.items[0].id);
assert.ok(guide.overview_markdown?.trim(), 'Resource guide content is missing');
const resourcePage = await fetch(new URL('/resource/' + guide.id + '?domain=video', origin),
  { signal: AbortSignal.timeout(15000) });
assert.equal(resourcePage.status, 200);
assert.ok((await resourcePage.text()).includes('项目导读'), 'Resource guide is missing from the detail page');
const legacy = await fetch(new URL('/admin', origin), { signal: AbortSignal.timeout(15000) });
assert.equal(legacy.status, 404);
console.log('CNMCP 2.0 production smoke checks passed at', origin.origin);
