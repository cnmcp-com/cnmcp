import assert from 'node:assert/strict';

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
assert.match(await page.text(), /最近讨论/);
const legacy = await fetch(new URL('/admin', origin), { signal: AbortSignal.timeout(15000) });
assert.equal(legacy.status, 404);
console.log('CNMCP 2.0 production smoke checks passed at', origin.origin);
