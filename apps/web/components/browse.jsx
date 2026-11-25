'use client';

import { queryPath, resourceKinds } from '@cnmcp/contracts';
import { Empty, facets, Panel, ResourceRow, scopePath, TopicRow, useCommunity } from './shared.jsx';

export function Browse({ section, data, params }) {
  const { taxonomy, domain } = useCommunity();
  const resources = section === 'resources';
  const facetKey = resources ? 'tag' : 'node';
  const selected = params[facetKey] || 'all';
  const available = facets(taxonomy, domain, resources ? 'tags' : 'nodes');
  const domains = [{ id: 'all', name: '全部' }, ...taxonomy.domains];
  const base = resources ? { kind: params.kind, sort: params.sort } : { sort: params.sort, unanswered: params.unanswered };
  const next = resources ? data.nextPage : data.nextCursor;
  const filters = { domain, ...base, [facetKey]: selected };
  return <Panel className={'browse-panel browse-' + section} title={resources ? '资源发现' : undefined}
    action={resources && <a className="button primary" href={scopePath('publish-resource', { domain })}>发布资源</a>}>
    <div className="browse-navigation">
      <nav className="domain-links" aria-label="领域">{domains.map(item => {
        const id = item.id === 'all' ? '' : item.id;
        const allowed = facets(taxonomy, id, resources ? 'tags' : 'nodes').some(x => x.id === selected);
        return <a key={item.id} href={scopePath(section, { ...base, domain: id, [facetKey]: allowed ? selected : undefined })}
          aria-current={(!domain && !id) || domain === id ? 'page' : undefined}>{item.name}</a>;
      })}</nav>
      <nav className="topic-node-links" aria-label={resources ? '资源标签' : '主题节点'}>
        {[{ id: 'all', name: resources ? '不限标签' : '全部节点' }, ...available].map(item =>
          <a key={item.id} href={scopePath(section, { ...base, domain, [facetKey]: item.id })}
            aria-current={item.id === selected ? 'page' : undefined}>{item.name}</a>)}
      </nav>
    </div>
    <div className="browse-body">
        <form className={resources ? 'resource-controls filters' : 'list-controls filters'} action={resources ? '/resources' : '/topics'}>
          {domain && <input type="hidden" name="domain" value={domain}/>}
          {selected !== 'all' && <input type="hidden" name={facetKey} value={selected}/>}
          {resources ? <label>类型 <select name="kind" defaultValue={params.kind || 'all'}>
            <option value="all">全部类型</option>{Object.entries(resourceKinds).map(([id, name]) =>
              <option key={id} value={id}>{name}</option>)}</select></label> :
            <label className="inline-check"><input type="checkbox" name="unanswered" value="1"
              defaultChecked={['1','true'].includes(params.unanswered)}/>只看待回应</label>}
          <label>排序 <select name="sort" defaultValue={params.sort || (resources ? 'activity' : 'new')}>
            {resources ? <><option value="activity">社区互动</option><option value="stars">GitHub Star</option>
              <option value="new">最新发现</option></> : <><option value="new">最新</option><option value="active">活跃</option></>}
          </select></label><button type="submit" className="button">应用</button>
        </form>
        {data.items.length ? data.items.map(item => resources ? <ResourceRow key={item.id} item={item}/> :
          <TopicRow key={item.id} item={item}/>) : <Empty title={resources ? '没有符合条件的资源' : '没有符合条件的主题'}>
          <a className="button" href={scopePath(section, { domain })}>清除筛选</a></Empty>}
        {(next || params.page || params.cursor) && <nav className="list-footer pagination" aria-label="分页">
          {params.page && Number(params.page) > 1 && <a className="button"
            href={scopePath(section, { ...filters, page: Number(params.page) - 1 })}>上一页</a>}
          {params.cursor && <a className="button" href={scopePath(section, filters)}>回到第一页</a>}
          {next && <a className="button" href={scopePath(section, { ...filters, [resources ? 'page' : 'cursor']: next })}>下一页</a>}
        </nav>}
    </div>
  </Panel>;
}

export function Search({ data, params }) {
  const { domain } = useCommunity();
  const text = params.q || '';
  return <Panel title={text ? '搜索「' + text + '」' : '搜索社区'}>
    <nav className="feed-tabs link-tabs" aria-label="搜索类型">{[['all','全部'],['topic','主题'],['resource','资源']].map(([kind, label]) =>
      <a className="button quiet" aria-current={(params.kind || 'all') === kind ? 'page' : undefined} key={kind}
        href={scopePath('search', { domain, q: text, kind })}>{label}</a>)}</nav>
    {data.topics.length > 0 && <><div className="panel-title"><h2>主题</h2></div>
      {data.topics.map(item => <TopicRow key={item.id} item={item}/>)}</>}
    {data.resources.length > 0 && <><div className="panel-title"><h2>资源</h2></div>
      {data.resources.map(item => <ResourceRow key={item.id} item={item}/>)}</>}
    {!data.topics.length && !data.resources.length && <Empty title={text ? '没有找到匹配内容' : '输入关键词'}
      text={text ? undefined : '可以用主题名称、工具名称或你想完成的任务搜索。'}>
      {text && <a className="button primary" href={scopePath('publish', { domain, title: text })}>提出这个问题</a>}
    </Empty>}
  </Panel>;
}

export function Guide() {
  const { taxonomy } = useCommunity();
  return <Panel title="社区指南">
    <div className="guide-content">
      <h2>参与讨论</h2><p>提出具体问题，分享可复现的做法、使用条件和实际结果。主题回复与资源评论分别保存。</p>
      <h2>选择领域与节点</h2><p>每个主题选择一个领域和一个适用节点。同一个节点可以在多个领域使用。</p>
      <dl>{taxonomy.domains.map(domain => <div key={domain.id}><dt><strong>{domain.name}</strong> · {domain.description}</dt>
        <dd>{facets(taxonomy, domain.id, 'nodes').map(node => node.name).join('、')}</dd></div>)}</dl>
      <h2>发布与引用资源</h2><p>在资源发现中可以直接发布 HTTPS 链接。编辑主题、回复或评论时，也可以粘贴新链接，或输入 @ 引用站点已有资源。</p>
      <h2>反馈</h2><p>资料有误、链接失效或内容违规时，可从页面提交反馈并查看自己的回执。</p>
    </div>
  </Panel>;
}
