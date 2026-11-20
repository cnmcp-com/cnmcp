'use client';

import { useEffect, useRef, useState } from 'react';
import { queryPath, reportReasons, resourceKinds } from '@cnmcp/contracts';
import { retrievePending, useAction, useData } from './actions.jsx';
import { Alert, DateLabel, Editor, Empty, Markdown, nameOf, Panel, ResourceAvatar, ResourceRow, scopePath, Signals, TopicRow, useCommunity } from './shared.jsx';

function Report({ kind, id, close, pendingKey, initial }) {
  const dialog = useRef(null);
  const { member } = useCommunity();
  const action = useAction();
  const [receipt, setReceipt] = useState(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = await action.perform('/reports', { method: 'POST',
      body: { kind, id, reason: fields.get('reason'), detail: fields.get('detail') }, idempotent: true, pendingKey });
    if (result) setReceipt(result.id);
  }
  return <dialog className="modal" ref={dialog} onClose={close} aria-labelledby="report-heading">
    <div className="modal-heading"><h2 id="report-heading">提交内容反馈</h2><button className="icon-button"
      onClick={() => dialog.current.close()} aria-label="关闭反馈">×</button></div>
    {receipt ? <div className="full-form"><p role="status">反馈已提交。</p>
      <a href={queryPath('/me', { report: receipt })}>查看我的反馈回执</a></div> : <form onSubmit={submit} className="full-form">
      <label>反馈原因<select name="reason" defaultValue={initial?.reason}>{Object.entries(reportReasons).map(([value,name]) =>
        <option key={value} value={value}>{name}</option>)}</select></label>
      <label>说明（选填）<textarea name="detail" rows={4} maxLength={2000} defaultValue={initial?.detail}/></label>
      <Alert message={action.error}/><button className="button primary" disabled={action.busy}>
        {member ? '提交反馈' : '登录后提交反馈'}</button>
    </form>}
  </dialog>;
}

function Discussion({ kind, item, params, privateState, onRefresh, report }) {
  const topic = kind === 'topic', entries = topic ? item.replies : item.comments;
  const { member, reload } = useCommunity();
  const [body, setBody] = useState(''), [quote, setQuote] = useState(null);
  const [related, setRelated] = useState(''), [note, setNote] = useState('');
  const action = useAction();
  const key = kind + ':' + item.id + ':response';
  useEffect(() => {
    const pending = retrievePending(key);
    if (pending) { setBody(pending.body); setQuote(pending.quoteId || null); setRelated(pending.referencedTopicId || ''); }
  }, [key]);
  async function vote(entry) {
    const voted = privateState?.voted?.includes(entry.id);
    if (await action.perform('/me/helpful-votes', { method: voted ? 'DELETE' : 'PUT',
      body: { kind: topic ? 'reply' : 'comment', id: entry.id } })) { onRefresh(); reload(); }
  }
  async function post(event) {
    event.preventDefault();
    if (!body.trim()) { setNote('请填写正文。'); return; }
    let relatedId = related.trim();
    if (relatedId.startsWith('/') || relatedId.startsWith('https://')) {
      try {
        const url = new URL(relatedId, window.location.origin);
        relatedId = url.origin === window.location.origin ? /^\/topic\/([\w-]+)\/?$/.exec(url.pathname)?.[1] : null;
      } catch { relatedId = null; }
      if (!relatedId) { setNote('请填写本站主题的链接或 ID。'); return; }
    }
    const data = { body, ...(quote && { quoteId: quote }), ...(relatedId && !topic && { referencedTopicId: relatedId }) };
    const endpoint = (topic ? '/topics/' : '/resources/') + item.id + (topic ? '/replies' : '/comments');
    if (await action.perform(endpoint, { method: 'POST', body: data, idempotent: true, pendingKey: key })) {
      setBody(''); setQuote(null); setRelated(''); setNote('已发布。'); reload();
    }
  }
  const page = Number(params.page || 1), selected = quote && entries.find(entry => entry.id === quote);
  const noun = topic ? '回复' : '评论';
  return <Panel title={noun + ' · ' + (topic ? item.reply_count : item.comment_count)}>
    <div id={topic ? 'replies' : 'comments'}/>
    {entries.length ? entries.map(entry => {
      const quoted = entry.quote_reply_id || entry.quote_comment_id;
      const voteActive = !!privateState?.voted?.includes(entry.id);
      return <article className="discussion-row" id={entry.id} key={entry.id}>
        <div className="topic-meta"><strong>{entry.author}</strong><DateLabel value={entry.created_at}/></div>
        {quoted && <a className="quote-link" href={'#' + quoted}>引用{noun}</a>}
        <Markdown text={entry.body}/>
        {entry.referenced_topic_id && <a className="quote-link" href={'/topic/' + entry.referenced_topic_id}>查看相关主题</a>}
        <div className="context-actions">
          <button onClick={() => { setQuote(entry.id); document.getElementById('compose').scrollIntoView(); }}>引用{noun}</button>
          <button disabled={action.busy} aria-pressed={voteActive} onClick={() => vote(entry)}>{voteActive ? '取消有帮助' : '有帮助'} · {entry.helpful_count}</button>
          <button onClick={() => report({ kind: topic ? 'reply' : 'comment', id: entry.id })}>反馈</button>
        </div>
      </article>;
    }) : <Empty title={'暂无' + noun}/>}
    {(item.nextPage || page > 1) && <nav className="list-footer pagination">
      {page > 1 && <a className="button" href={queryPath('/' + kind + '/' + item.id, { ...params, page: page - 1 })}>上一页</a>}
      {item.nextPage && <a className="button" href={queryPath('/' + kind + '/' + item.id, { ...params, page: item.nextPage })}>下一页</a>}
    </nav>}
    <form className="full-form reply-composer" id="compose" onSubmit={post}>
      {quote && <div className="notice">正在引用{selected ? ' ' + selected.author + ' 的' : '所选'}{noun}
        <button type="button" className="text-button" onClick={() => setQuote(null)}>取消引用</button></div>}
      <Editor value={body} onChange={value => { setBody(value); setNote(''); }} label={'撰写' + noun} rows={4}/>
      {!topic && <label>相关主题链接（选填）<input value={related} maxLength={400} onChange={e => setRelated(e.target.value)}/></label>}
      <Alert message={action.error}/>{note && <p role="status">{note}</p>}
      <div><button className="button primary" disabled={action.busy}>{member ? '提交' + noun : '登录后' + noun}</button></div>
    </form>
  </Panel>;
}

export function Detail({ kind, item, params }) {
  const topic = kind === 'topic';
  const { taxonomy, domain, member, reload } = useCommunity();
  const state = useData(member ? queryPath('/me/state', { kind, id: item.id }) : null);
  const action = useAction();
  const [report, setReport] = useState(null), [tab, setTab] = useState('comments'), [share, setShare] = useState('');
  const reportKey = 'report:' + kind + ':' + item.id;
  useEffect(() => {
    const pending = retrievePending(reportKey);
    if (pending) setReport(pending);
  }, [reportKey]);
  const discussions = useData(!topic && tab === 'discussions' ? '/resources/' + item.id + '/discussions' : null);
  const bookmark = !!state.data?.bookmarked, following = !!state.data?.followed;
  const domains = topic ? [item.domain_id] : item.domain_ids;
  async function update(path, isOn, body) {
    if (await action.perform(path, { method: isOn ? 'DELETE' : 'PUT', body })) {
      state.refresh(); reload();
    }
  }
  return <>
    <Panel><div className="topic-header">
      <div className="breadcrumb"><a href={scopePath(topic ? 'topics' : 'resources', { domain })}>{topic ? '主题' : '资源发现'}</a>
        {domains.map(id => <a key={id} href={scopePath(topic ? 'topics' : 'resources', { domain: id })}>{nameOf(taxonomy.domains, id)}</a>)}
        {topic && <a href={scopePath('topics', { domain: item.domain_id, node: item.node_id })}>{nameOf(taxonomy.nodes, item.node_id)}</a>}</div>
      {topic ? <h1>{item.title}</h1> : <h1 className="resource-title"><ResourceAvatar item={item} size={48}/>{item.name}</h1>}
      <div className="topic-meta">{topic ? <strong>{item.author}</strong> : <span className="badge resource">{resourceKinds[item.kind]}</span>}
        <DateLabel value={item.created_at}/></div>
    </div><div className="topic-content">
      {topic ? <>
        <Markdown text={item.body}/>
        {item.progress_note && <div className="result-block"><strong>作者后续反馈</strong><Markdown text={item.progress_note}/></div>}
      </> : <>
        <p>{item.summary || '暂无资源用途说明。'}</p>
        <Signals item={item} full/>
        <div className="source-list">
          {item.stars_observed_at != null && <small>GitHub Star 快照 · <DateLabel value={item.stars_observed_at}/></small>}
          <small>代码许可 {item.code_license || '待确认'}{item.kind === 'model' && ' · 权重许可 ' + (item.weights_license || '待确认')}</small>
          {item.sources.map(source => <div key={source.canonical_url}>
            <a href={source.canonical_url} rel="noreferrer" target="_blank">{source.canonical_url} ↗</a>
            {source.metadata.language && <small> · {source.metadata.language}</small>}
            {source.metadata.archived && <small> · 仓库已归档</small>}
            {source.metadata.curatedUrl && <div><a href={source.metadata.curatedUrl} rel="noreferrer" target="_blank">
              HelloGitHub 第 {source.metadata.curatedIssue} 期 ↗</a></div>}
          </div>)}
        </div>
      </>}
      <div className="context-actions">
        <button disabled={action.busy} aria-pressed={bookmark} onClick={() => update('/me/bookmarks', bookmark, { kind, id: item.id })}>
          {bookmark ? '取消收藏' : '收藏'}</button>
        {topic && <button disabled={action.busy} aria-pressed={following}
          onClick={() => update('/me/followed-topics/' + item.id, following)}>{following ? '取消关注' : '关注回复'}</button>}
        <button onClick={async () => { try { await navigator.clipboard.writeText(location.href); setShare('链接已复制。'); }
          catch { setShare(location.href); } }}>分享链接</button>
        <button onClick={() => setReport({ kind, id: item.id })}>{topic ? '反馈' : '资料纠错'}</button>
        {topic && member?.id === item.author_id && <a href={queryPath('/publish', { edit: item.id, domain })}>编辑主题或补充进展</a>}
      </div>
      <Alert message={action.error || state.error}/>{share && <p role="status">{share}</p>}
    </div></Panel>
    {topic && item.resources.length > 0 && <Panel title="提及的资源">{item.resources.map(resource => <ResourceRow key={resource.id} item={resource}/>)}</Panel>}
    {!topic && <Panel><div className="feed-tabs">
      <button aria-pressed={tab === 'comments'} onClick={() => setTab('comments')}>资源评论 · {item.comment_count}</button>
      <button aria-pressed={tab === 'discussions'} onClick={() => setTab('discussions')}>引用主题 · {item.discussion_reference_count}</button>
    </div></Panel>}
    {topic || tab === 'comments' ? <Discussion kind={kind} item={item} params={params} privateState={state.data}
      onRefresh={state.refresh} report={setReport}/> : <Panel title="引用这个资源的主题">
      <Alert message={discussions.error}/>
      {discussions.data ? discussions.data.items.length ? discussions.data.items.map(entry => <TopicRow key={entry.id} item={entry}/>) :
        <Empty title="暂无引用主题"/> : !discussions.error && <Empty title="正在读取引用主题"/>}
    </Panel>}
    {report && <Report kind={report.kind} id={report.id} initial={report} pendingKey={reportKey} close={() => setReport(null)}/>}
  </>;
}
