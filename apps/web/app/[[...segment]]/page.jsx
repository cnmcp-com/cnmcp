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

async function loadOverview(domain) {
  const data = await load(queryPath('/v1/overview', { domain }));
  if (!domain || data.recentResources.length) return data;

  const fallback = await load('/v1/overview').catch(() => null);
  return { ...data, otherResources: fallback?.recentResources ?? [] };
}

function pageData(section, id, query) {
  const { domain, node, tag, sort, unanswered, cursor, page, kind, q } = query;
  if (detail.has(section)) return getDetail(section, id, page);
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
    return { title: data.title || data.name, description: (data.summary || data.body || '').slice(0, 160),
      alternates: { canonical: '/' + section + '/' + id } };
  } catch { return { title: names[section] }; }
}

export default async function Page({ params, searchParams }) {
  const { section, id, query } = context((await params).segment, await searchParams);
  if (section === 'overview' && query.view === 'topics') redirect(queryPath('/topics', { domain: query.domain, node: query.node }));
  if (section === 'overview' && Object.keys(query).some(name => name !== 'domain')) redirect(queryPath('/', { domain: query.domain }));
  try {
    const sidebarData = load(queryPath('/v1/sidebar', { domain: query.domain }));
    const [taxonomy, data, sidebar] = await Promise.all([
      load('/v1/taxonomy'), pageData(section, id, query), section === 'overview' ? sidebarData.catch(() => null) : sidebarData
    ]);
    return <Community section={section} id={id} params={query} taxonomy={taxonomy} data={data} sidebar={sidebar}/>;
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
