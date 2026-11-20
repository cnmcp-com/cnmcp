'use client';

import { queryPath, resourceKinds } from '@cnmcp/contracts';
import { facets, nameOf, ResourceAvatar, scopePath, TopicRow, useCommunity } from './shared.jsx';

const discussionIdeas = [
  { label: '求一个方案', node: 'solution-requests', description: '写下你想做什么、卡在哪里，以及试过哪些办法。' },
  { label: '分享一次实践', node: 'solution-sharing', description: '说说你用了什么工具、怎么做的，最后效果如何。' }
];

function ResourceCard({ item, domain }) {
  const { taxonomy } = useCommunity();
  const domains = domain ? '' : item.domain_ids.map(id => nameOf(taxonomy.domains, id)).join(' · ');
  return <article className="overview-resource">
    <ResourceAvatar item={item} size={40}/>
    <h3><a href={queryPath('/resource/' + item.id, { domain })}>{item.name}<span aria-hidden="true">↗</span></a></h3>
    {item.summary && <p>{item.summary}</p>}
    <div className="overview-resource-meta">
      <span>{domains || resourceKinds[item.kind]}</span>
      {item.stars > 0 && <span>{item.stars.toLocaleString('zh-CN')} Star</span>}
    </div>
  </article>;
}

export function Overview({ data }) {
  const { taxonomy, domain } = useCommunity();
  const selected = taxonomy.domains.find(item => item.id === domain);
  const hasLocalResources = data.recentResources.length > 0;
  const resources = hasLocalResources ? data.recentResources : data.otherResources ?? [];
  const resourceDomain = hasLocalResources ? domain : '';
  const topics = data.recentTopics;
  const nodes = facets(taxonomy, domain, 'nodes');
  const hasResources = resources.length > 0;

  return <div className="overview">
    <section className="panel overview-intro" aria-labelledby="overview-title">
      <div className="overview-intro-content">
        <h1 id="overview-title">{selected ? selected.name + ' · 社区概览' : '发现开源工具，交流实战经验'}</h1>
        <p>{selected?.description || '找视频制作、游戏开发、AI 与开发工具的开源项目，分享你跑通的方法和遇到的问题。'}</p>
        <div className="overview-actions">
          <a className="button primary" href={hasResources ? scopePath('resources', { domain: resourceDomain, sort: 'new' }) : scopePath('publish-resource', { domain })}>
            {hasLocalResources ? '浏览资源' : hasResources ? '浏览全部资源' : '发布资源'} <span aria-hidden="true">→</span>
          </a>
          <a className="button" href={scopePath('publish', { domain })}>发布主题</a>
        </div>
      </div>
      {taxonomy.domains.length > 0 && <nav className="overview-domains" aria-label="按领域浏览">
        <a href="/" aria-current={!domain ? 'page' : undefined}>全部领域</a>
        {taxonomy.domains.map(item => <a href={scopePath('overview', { domain: item.id })} key={item.id}
          aria-current={item.id === domain ? 'page' : undefined}>{item.name}</a>)}
      </nav>}
    </section>

    {hasResources && <section className="overview-resource-section" aria-labelledby="overview-resources">
      <div className="overview-section-header">
        <div>
          <h2 id="overview-resources">{hasLocalResources ? '最新收录' : '其他领域的开源资源'}</h2>
          {!hasLocalResources && <p>{selected?.name}领域正在征集资源。</p>}
        </div>
        <a href={scopePath('resources', { domain: resourceDomain, sort: 'new' })}>查看全部 <span aria-hidden="true">→</span></a>
      </div>
      <div className="overview-resource-grid">
        {resources.map(item => <ResourceCard item={item} domain={resourceDomain} key={item.id}/>)}
      </div>
    </section>}

    {topics.length > 0 ? <section className="overview-topic-section" aria-labelledby="overview-topics">
      <div className="overview-section-header">
        <h2 id="overview-topics">最近讨论</h2>
        <a href={scopePath('topics', { domain })}>查看全部 <span aria-hidden="true">→</span></a>
      </div>
      <div className="panel overview-topic-list">{topics.map(item => <TopicRow key={item.id} item={item}/>)}</div>
    </section> : <section className="overview-topic-section" aria-labelledby="overview-topics">
      <div className="overview-section-header"><h2 id="overview-topics">发起讨论</h2></div>
      <div className="overview-ideas">{discussionIdeas.map(idea => <a className="panel overview-idea" key={idea.node}
        href={scopePath('publish', { domain, node: nodes.some(node => node.id === idea.node) ? idea.node : undefined })}>
        <div><h3>{idea.label}</h3><p>{idea.description}</p></div><span aria-hidden="true">→</span>
      </a>)}</div>
    </section>}
  </div>;
}
