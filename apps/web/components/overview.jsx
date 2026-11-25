'use client';

import { queryPath, resourceKinds } from '@cnmcp/contracts';
import { facets, nameOf, ResourceAvatar, scopePath, TopicRow, useCommunity } from './shared.jsx';

const discussionIdeas = [
  { label: '求一个方案', node: 'solution-requests', description: '描述遇到的问题，听听社区怎么做。' },
  { label: '分享一次实践', node: 'solution-sharing', description: '把跑通的方法写下来，让更多人用得上。' }
];

export function OverviewHeader() {
  const { taxonomy, domain } = useCommunity();
  const selected = taxonomy.domains.find(item => item.id === domain);
  return <header className="discovery-header">
    <section className="discovery-hero" aria-labelledby="overview-title">
      <img className="discovery-art" src="/open-source-studio.jpg" alt="" fetchPriority="high" width="768" height="512"/>
      <div className="discovery-copy">
        <a className="hero-channel" href={scopePath('resources', { domain })}>开源资源库 <span aria-hidden="true">↗</span></a>
        <h1 id="overview-title">{selected ? '探索' + selected.name + '开源项目' : '发现开源好工具'}</h1>
        <p>{selected?.description || '从社区收录的项目出发，发现好工具，交流使用经验。'}</p>
        <a className="hero-cta" href={scopePath('resources', { domain, sort: 'new' })}>浏览项目 <span aria-hidden="true">→</span></a>
      </div>
    </section>
    {!!taxonomy.domains.length && <nav className="discovery-domains" aria-label="按领域浏览">
      <a href="/" aria-current={!domain ? 'page' : undefined}>全部领域</a>
      {taxonomy.domains.map(item => <a href={scopePath('overview', { domain: item.id })} key={item.id}
        aria-current={item.id === domain ? 'page' : undefined}>{item.name}</a>)}
    </nav>}
  </header>;
}

function ResourceCard({ item, domain, lead, ranking }) {
  const { taxonomy } = useCommunity();
  const labels = [...new Set((item.tags ?? []).filter(tag => !domain || tag.domain_id === domain).map(tag => tag.name))];
  const category = nameOf(taxonomy.domains, domain || item.domain_ids?.[0]);
  const signals = [
    [item.discussion_reference_count, '次主题引用'], [item.comment_count, '条评论'],
    [item.bookmark_count, '次收藏'], [item.helpful_count, '次有帮助']
  ].filter(([value]) => value).slice(0, 2).map(([value, label]) => value + ' ' + label);
  return <article className={'discovery-project' + (lead ? ' lead-project' : '')}>
    <ResourceAvatar item={item} size={lead ? 54 : 40}/>
    <div className="project-copy">
      <div className="project-meta">{[resourceKinds[item.kind], labels[0] || category].filter(Boolean).join(' / ')}</div>
      <h3><a href={queryPath('/resource/' + item.id, { domain })}>{item.name}</a></h3>
      {item.summary && <p>{item.summary}</p>}
      {ranking === 'activity' && <div className="discovery-signal">{signals.join(' · ')}</div>}
    </div>
    <span className="project-arrow" aria-hidden="true">↗</span>
  </article>;
}

export function Overview({ data }) {
  const { taxonomy, domain } = useCommunity();
  const local = data.recentResources.length > 0;
  const resources = local ? data.recentResources : data.otherResources ?? [];
  const resourceDomain = local ? domain : '';
  const nodes = facets(taxonomy, domain, 'nodes');

  const tags = resources.flatMap(item => item.tags ?? []).filter(tag => !resourceDomain || tag.domain_id === resourceDomain);
  const resourceTags = [...new Map(tags.map(tag => [tag.tag_id, tag])).values()].slice(0, 4);
  return <div className="discovery-feed">
    {resources.length > 0 && <section aria-labelledby="overview-resources">
      <div className="discovery-section-head"><h2 id="overview-resources">{local ? '新入库项目' : '其他领域的项目'}</h2>
        <a href={scopePath('resources', { domain: resourceDomain, sort: 'new' })}>全部资源 →</a></div>
      <div className="discovery-projects">{resources.map((item, index) => <ResourceCard key={item.id} item={item}
        domain={resourceDomain} lead={index === 0 && resources.length > 2}/>)}</div>
      {resourceTags.length > 0 && <nav className="discovery-tags" aria-label="按用途找资源"><span>按用途找</span>
        {resourceTags.map(tag => <a key={tag.tag_id} href={scopePath('resources', { domain: resourceDomain, tag: tag.tag_id })}>
          {tag.name}</a>)}
      </nav>}
    </section>}
    <section className="panel star-leaderboard" aria-labelledby="star-leaderboard-title">
      <div className="star-leaderboard-header">
        <h2 id="star-leaderboard-title">GitHub Star 排行</h2>
        <a href={scopePath('resources', { domain, sort: 'stars' })}>完整排行 →</a>
      </div>
      {data.starRanking?.length ? <ol>{data.starRanking.map(item => <li key={item.id}>
        <a href={queryPath('/resource/' + item.id, { domain })}>
          <ResourceAvatar item={item} size={30}/>
          <span className="star-leaderboard-name">{item.name}</span>
          <strong><span aria-hidden="true">★</span> {item.stars.toLocaleString('zh-CN')}</strong>
        </a>
      </li>)}</ol> : <p>当前领域还没有已同步的高星项目。</p>}
    </section>
    {!!data.featuredResources?.length && <section aria-labelledby="overview-ranking">
      <div className="discovery-section-head">
        <h2 id="overview-ranking">社区热门项目</h2>
        <a href={scopePath('resources', { domain, sort: 'activity' })}>查看排行 →</a>
      </div>
      <div className="discovery-projects">{data.featuredResources.map(item => <ResourceCard key={item.id} item={item}
        domain={domain} ranking="activity"/>)}</div>
    </section>}
    {!!taxonomy.domains.length && <section aria-labelledby="overview-domains">
      <div className="discovery-section-head"><h2 id="overview-domains">按领域探索</h2></div>
      <div className="discovery-domain-grid">{taxonomy.domains.filter(item => item.id !== domain).map(item =>
        <a href={scopePath('resources', { domain: item.id, sort: 'new' })} key={item.id}>
          <strong>{item.name}</strong><span>{item.description}</span><span aria-hidden="true">→</span>
        </a>)}</div>
    </section>}
    <section aria-labelledby="overview-topics">
      <div className="discovery-section-head"><h2 id="overview-topics">{data.recentTopics.length ? '最近讨论' : '发起讨论'}</h2>
        {data.recentTopics.length > 0 && <a href={scopePath('topics', { domain })}>全部主题 →</a>}</div>
      {data.recentTopics.length > 0 ? <div className="panel overview-topic-list">{data.recentTopics.map(item =>
        <TopicRow key={item.id} item={item}/>)}</div> : <div className="overview-ideas">{discussionIdeas.map(idea =>
        <a className="panel overview-idea" key={idea.node} href={scopePath('publish', { domain,
          node: nodes.some(node => node.id === idea.node) ? idea.node : undefined })}>
          <div><h3>{idea.label}</h3><p>{idea.description}</p></div><span aria-hidden="true">→</span>
        </a>)}</div>}
    </section>
  </div>;
}
