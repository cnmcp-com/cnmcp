import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { queryPath } from '@cnmcp/contracts';
import { load } from '../../lib/server-api.mjs';
import Community from '../../components/community.jsx';

export const dynamic = 'force-dynamic';
const names = {
  overview: '社区概览', topics: '主题', resources: '资源发现', search: '搜索', publish: '发布主题',
  me: '工作台', notifications: '通知', guide: '社区指南', settings: '设置', topic: '主题详情', resource: '资源详情'
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

function pageData(section, id, query) {
  const { domain, node, tag, sort, unanswered, cursor, page, kind, q } = query;
  if (detail.has(section)) return getDetail(section, id, page);
  switch (section) {
    case 'overview': return load(queryPath('/v1/overview', { domain }));
    case 'topics': return load(queryPath('/v1/topics', { domain, node, sort, unanswered, cursor }));
    case 'resources': return load(queryPath('/v1/resources', { domain, tag, sort, page, kind }));
    case 'search': return load(queryPath('/v1/search', { domain, query: q, kind }));
    default: return null;
  }
}

export async function generateMetadata({ params, searchParams }) {
  const { section, id, query } = context((await params).segment, await searchParams);
  if (!detail.has(section)) return { title: names[section],
    robots: ['me','notifications','publish','settings','search'].includes(section) ? { index: false } : undefined };
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
    const [taxonomy, data, sidebar] = await Promise.all([
      load('/v1/taxonomy'), pageData(section, id, query), load(queryPath('/v1/sidebar', { domain: query.domain }))
    ]);
    return <Community section={section} id={id} params={query} taxonomy={taxonomy} data={data} sidebar={sidebar}/>;
  } catch (error) {
    if (error.status === 404) notFound();
    return <main className="site-main"><section className="panel padded">
      <h1>{error.status === 400 ? '筛选条件无效' : '社区暂时无法加载'}</h1>
      <a className="button" href="/">回到社区概览</a>
    </section></main>;
  }
}
