import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { queryPath } from '@cnmcp/contracts';
import { load } from '../../lib/server-api.mjs';
import Community from '../../components/community.jsx';

export const dynamic = 'force-dynamic';
const names = {
  overview: '社区概览', topics: '主题', resources: '资源发现', search: '搜索', publish: '发布主题',
  'publish-resource': '发布资源', me: '工作台', notifications: '通知', guide: '社区指南', settings: '设置',
  topic: '主题详情', resource: '资源详情'
};
const detail = new Set(['topic','resource']);

function context(segment = [], values = {}) {
  const section = segment[0] || 'overview', id = segment[1];
  const segments = detail.has(section) ? 2 : Number(section !== 'overview');
  if (!Object.hasOwn(names, section) || segment.length !== segments || (id && !/^[\w-]{1,100}$/.test(id))) notFound();
  const query = Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'string'));
  return { section, id, query };
}

const getDetail = cache((section, id, page) => load(queryPath('/v1/' + section + 's/' + id, { page })));

async function resourcesFor(params) {
  return (await load(queryPath('/v1/resources', params)).catch(() => null))?.items ?? [];
}

async function loadOverview(domain) {
  const [data, latest, active, starred] = await Promise.all([
    load(queryPath('/v1/overview', { domain })),
    resourcesFor({ domain, sort: 'new', limit: 16 }),
    resourcesFor({ domain, sort: 'activity', limit: 4 }),
    resourcesFor({ domain, sort: 'stars', limit: 5 })
  ]);
  const starRanking = starred.filter(item => item.stars > 0);
  const rankedIds = new Set(starRanking.map(item => item.id));
  const featuredResources = active.filter(item => !rankedIds.has(item.id) &&
    (item.discussion_reference_count || item.comment_count || item.bookmark_count || item.helpful_count));
  const ignored = new Set([...rankedIds, ...featuredResources.map(item => item.id)]);
  const recentResources = (latest.length ? latest : data.recentResources)
    .filter(item => !ignored.has(item.id)).slice(0, 8);
  const otherResources = domain && !latest.length && !data.recentResources.length
    ? await resourcesFor({ sort: 'new', limit: 8 }) : [];
  return { ...data, recentResources, otherResources, featuredResources, starRanking };
}

async function loadResourcePage(id, page, preferredDomain) {
  const resource = await getDetail('resource', id, page);
  const domain = resource.domain_ids.includes(preferredDomain) ? preferredDomain : resource.domain_ids[0];
  const tag = resource.tags.find(item => item.domain_id === domain)?.tag_id;
  if (!domain) return resource;

  const related = tag ? await resourcesFor({ domain, tag, sort: 'activity', limit: 5 }) : [];
  const candidates = related.filter(item => item.id !== id);
  if (candidates.length < 4) {
    const known = new Set([id, ...candidates.map(item => item.id)]);
    const more = await resourcesFor({ domain, sort: 'activity', limit: 5 });
    candidates.push(...more.filter(item => !known.has(item.id)));
  }
  return { ...resource, relatedResources: candidates.slice(0, 4), relatedDomain: domain };
}

function pageData(section, id, query) {
  const { domain, node, tag, sort, unanswered, cursor, page, kind, q } = query;
  if (section === 'resource') return loadResourcePage(id, page, domain);
  if (section === 'topic') return getDetail(section, id, page);
  switch (section) {
    case 'overview': return loadOverview(domain);
    case 'topics': return load(queryPath('/v1/topics', { domain, node, sort, unanswered, cursor }));
    case 'resources': return load(queryPath('/v1/resources', { domain, tag, sort, page, kind }));
    case 'search': return load(queryPath('/v1/search', { domain, query: q, kind }));
    default: return null;
  }
}

export async function generateMetadata({ params, searchParams }) {
  const { section, id, query } = context((await params).segment, await searchParams);
  if (!detail.has(section)) return { title: names[section],
    robots: ['me','notifications','publish','publish-resource','settings','search'].includes(section) ? { index: false } : undefined };
  try {
    const data = await getDetail(section, id, query.page);
    return { title: data.title || data.name, description: (data.github_readme?.introduction || data.summary || data.body || '').slice(0, 160),
      alternates: { canonical: '/' + section + '/' + id } };
  } catch { return { title: names[section] }; }
}

export default async function Page({ params, searchParams }) {
  const { section, id, query } = context((await params).segment, await searchParams);
  if (section === 'overview' && query.view === 'topics') redirect(queryPath('/topics', { domain: query.domain, node: query.node }));
  if (section === 'overview' && Object.keys(query).some(name => name !== 'domain')) redirect(queryPath('/', { domain: query.domain }));
  try {
    const sidebarData = load(queryPath('/v1/sidebar', { domain: query.domain }));
    const siteData = ['overview','guide'].includes(section) ? load('/v1/site-pages').catch(() => null) : null;
    const [taxonomy, data, sidebar, pages] = await Promise.all([
      load('/v1/taxonomy'), pageData(section, id, query), section === 'overview' ? sidebarData.catch(() => null) : sidebarData, siteData
    ]);
    return <Community section={section} id={id} params={query} taxonomy={taxonomy} data={data} sidebar={sidebar} sitePages={pages?.pages}/>;
  } catch (error) {
    if (error.status === 404) notFound();
    return <main className="site-main"><section className="panel padded">
      <h1>{error.status === 400 ? '筛选条件无效' : '社区暂时无法加载'}</h1>
      {section === 'overview' && error.status !== 400 ?
        <a className="button" href={queryPath('/', { domain: query.domain })}>重新加载</a> :
        <a className="button" href="/">回到社区概览</a>}
    </section></main>;
  }
}
