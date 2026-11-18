'use client';

import { useEffect, useState } from 'react';
import { memberTabs, queryPath, reportReasons } from '@cnmcp/contracts';
import { api } from '../lib/client.mjs';
import { MemberGate, retrievePending, useAction, useData } from './actions.jsx';
import { Alert, DateLabel, Editor, Empty, facets, Panel, useCommunity } from './shared.jsx';

export function Publish({ params }) {
  const { member } = useCommunity();
  const draft = useData(member && params.draft ? '/me/drafts/' + encodeURIComponent(params.draft) : null);
  const editId = params.edit || draft.data?.editing_topic_id;
  const edit = useData(editId ? '/topics/' + encodeURIComponent(editId) : null);
  if (draft.error || edit.error) return <Panel><Empty title="无法打开编辑内容"><Alert message={draft.error || edit.error}/></Empty></Panel>;
  if (params.draft && !member) return <MemberGate/>;
  if ((params.draft && !draft.data) || (editId && !edit.data)) return <Panel><Empty title="正在读取编辑内容"/></Panel>;
  if (edit.data && edit.data.author_id !== member?.id) return <MemberGate>
    <Panel><Empty title="只能编辑自己发布的主题"/></Panel></MemberGate>;
  return <PublishForm initial={draft.data || edit.data} topic={edit.data} params={params}/>;
}

function PublishForm({ initial, topic, params }) {
  const { taxonomy, domain, member } = useCommunity();
  const [draftId, setDraftId] = useState(params.draft || '');
  const [title, setTitle] = useState(initial?.title || params.title?.slice(0, 100) || '');
  const [body, setBody] = useState(initial?.body || '');
  const [progressNote, setProgress] = useState(topic?.progress_note || '');
  const [version, setVersion] = useState(topic?.version);
  const [domainId, setDomain] = useState(initial?.domain_id || domain || '');
  const [nodeId, setNode] = useState(initial?.node_id || (facets(taxonomy, domain, 'nodes').some(n => n.id === params.node) ? params.node : ''));
  const [note, setNote] = useState(''), [validation, setValidation] = useState('');
  const action = useAction();
  const pending = 'publish:' + (params.draft || topic?.id || 'new');
  useEffect(() => {
    const input = retrievePending(pending);
    if (input) {
      setTitle(input.title);
      setBody(input.body);
      setDomain(input.domainId);
      setNode(input.nodeId);
      if (input.progressNote != null) setProgress(input.progressNote);
    }
  }, [pending]);
  function selectDomain(next) {
    setDomain(next);
    if (nodeId && (!next || !facets(taxonomy, next, 'nodes').some(item => item.id === nodeId))) {
      setNode(''); setNote('该节点不适用于新领域，请重新选择节点。');
    } else setNote('');
  }
  async function saveDraft() {
    setValidation('');
    const result = await action.perform(draftId ? '/me/drafts/' + draftId : '/me/drafts', {
      method: draftId ? 'PATCH' : 'POST', body: { title, body, domainId, nodeId, editingTopicId: topic?.id }, pendingKey: pending
    });
    if (result) { setDraftId(result.id); setNote('草稿已保存。'); }
  }
  async function publish(event) {
    event.preventDefault();
    setValidation('');
    if ([...title.trim()].length < 4 || !domainId || !nodeId) {
      setValidation('请填写至少 4 字的标题，并选择领域和节点。');
      return;
    }
    if ([...body].length > 12000) { setValidation('正文请控制在 12000 字以内。'); return; }
    const result = await action.perform(topic ? '/topics/' + topic.id : '/topics', {
      method: topic ? 'PATCH' : 'POST', idempotent: true, pendingKey: pending,
      body: { title, body, domainId, nodeId, draftId: draftId || undefined,
        ...(topic && { expectedVersion: version, progressNote }) }
    });
    if (result) window.location.assign(queryPath('/topic/' + result.id, { domain: domainId }));
  }
  return <Panel className="minimal-publish">
    <div className="publish-breadcrumb"><a href="/">CNMCP</a> › <h1>{topic ? '编辑主题' : '发布主题'}</h1>
      <span>{[...body].length} / 12000</span></div>
    <form onSubmit={publish}>
      <input className="minimal-title" value={title} aria-label="主题标题" maxLength={100}
        placeholder="用一句话说明你想讨论的内容" onChange={e => setTitle(e.target.value)}/>
      <Editor value={body} onChange={setBody} label="主题正文" rows={12}/>
      <div className="minimal-node classification-fields">
        <label htmlFor="publish-domain">领域</label><select id="publish-domain" value={domainId} onChange={e => selectDomain(e.target.value)}>
          <option value="">请选择领域</option>{taxonomy.domains.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label htmlFor="publish-node">节点</label><select id="publish-node" value={nodeId} disabled={!domainId} onChange={e => setNode(e.target.value)}>
          <option value="">{domainId ? '请选择节点' : '先选择领域'}</option>{facets(taxonomy, domainId, 'nodes').map(item =>
            <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <a href="/guide">分类说明 ↗</a>
      </div>
      {topic && <div className="full-form"><label>后续反馈（选填）<textarea value={progressNote} maxLength={4000} rows={3}
        onChange={e => setProgress(e.target.value)}/></label></div>}
      <div className="status-box"><Alert message={validation || action.error}/>{note && <p role="status">{note}</p>}
        {topic && action.status === 409 && <div className="form-actions">
          <a className="button" href={'/topic/' + topic.id} target="_blank" rel="noreferrer">查看当前主题</a>
          <button className="button" type="button" onClick={async () => {
            try {
              const latest = await api('/topics/' + topic.id);
              setVersion(latest.version);
              setNote('已读取最新版本。请核对内容后重新保存。');
            } catch (error) { setNote(error.message); }
          }}>按最新版本重新确认</button>
        </div>}</div>
      <div className="minimal-actions">
        <button className="button primary" disabled={action.busy}>{member ? topic ? '保存修改' : '发布主题' : '登录后发布'}</button>
        <button className="button" type="button" disabled={action.busy} onClick={saveDraft}>保存草稿</button>
      </div>
    </form>
  </Panel>;
}

function collectionItem(tab, item) {
  switch (tab) {
    case 'bookmarks': return [item.title, item.topic_id ? '/topic/' + item.topic_id : '/resource/' + item.resource_id];
    case 'drafts': return [item.title || '未命名草稿', queryPath('/publish', { draft: item.id })];
    case 'replies': return [item.title, '/topic/' + item.topic_id + '#' + item.id];
    case 'discoveries': return [item.name, '/resource/' + item.id];
    default: return [item.title, '/topic/' + item.id];
  }
}

export function MemberPage({ params }) {
  const { member, refreshMember } = useCommunity();
  const tab = Object.hasOwn(memberTabs, params.tab) ? params.tab : 'bookmarks';
  const reportId = params.report && /^[\w-]{1,100}$/.test(params.report) ? params.report : null;
  const path = reportId ? '/me/reports/' + reportId : queryPath('/me/' + tab, { page: params.page });
  const collection = useData(member ? path : null);
  const action = useAction();
  const [confirm, setConfirm] = useState(null);
  const page = Number(params.page || 1);
  async function deleteDraft(id) {
    if (await action.perform('/me/drafts/' + id, { method: 'DELETE' })) {
      setConfirm(null); collection.refresh(); refreshMember();
    }
  }
  return <MemberGate><Panel title={reportId ? '反馈回执' : '个人工作台'}>
    {!reportId && <nav className="feed-tabs link-tabs" aria-label="工作台分类">{Object.entries(memberTabs).map(([id,name]) =>
      <a className="button quiet" href={queryPath('/me', { tab: id })} key={id} aria-current={tab === id ? 'page' : undefined}>{name}</a>)}</nav>}
    <Alert message={collection.error || action.error}/>
    {collection.data ? reportId ? <div className="full-form">
      <p>{reportReasons[collection.data.reason]} · <DateLabel value={collection.data.created_at}/></p>
      {collection.data.detail && <p>{collection.data.detail}</p>}
    </div> : <>
      {collection.data.items.length ? <div className="member-list">{collection.data.items.map(item => {
        const [label, to] = collectionItem(tab, item);
        return <div className="member-entry" key={item.id || item.topic_id || item.resource_id}>
          <div><a href={to}>{label}</a><small><DateLabel value={item.updated_at || item.created_at}/></small>
            {tab === 'replies' && <p>{item.body.slice(0, 120)}</p>}</div>
          {tab === 'drafts' && <div>{confirm === item.id ? <div className="form-actions">
            <button className="button" disabled={action.busy} onClick={() => deleteDraft(item.id)}>确认删除</button>
            <button className="button" onClick={() => setConfirm(null)}>取消</button></div> :
            <button className="button quiet" aria-label={'删除草稿 ' + label} onClick={() => setConfirm(item.id)}>删除草稿</button>}</div>}
        </div>;
      })}</div> : <Empty title="这个列表还是空的"/>}
      {(page > 1 || collection.data.nextPage) && <nav className="list-footer pagination">
        {page > 1 && <a className="button" href={queryPath('/me', { tab, page: page - 1 })}>上一页</a>}
        {collection.data.nextPage && <a className="button" href={queryPath('/me', { tab, page: collection.data.nextPage })}>下一页</a>}
      </nav>}
    </> : !collection.error && <Empty title="正在加载"/>}
  </Panel></MemberGate>;
}

export function Notifications({ params }) {
  const { member, refreshMember } = useCommunity();
  const unread = params.unread === '1';
  const inbox = useData(member ? queryPath('/me/notifications', { unread: unread ? '1' : null }) : null);
  const action = useAction();
  async function read(body) {
    if (!await action.perform('/me/notifications/read', { method: 'PATCH', body })) return false;
    inbox.refresh(); refreshMember();
    return true;
  }
  return <MemberGate><Panel title="通知" action={<button className="button" disabled={action.busy || !member?.unread_count}
    onClick={() => read({ all: true })}>全部已读</button>}>
    <nav className="feed-tabs link-tabs" aria-label="通知筛选">
      <a className="button quiet" href="/notifications" aria-current={!unread ? 'page' : undefined}>全部</a>
      <a className="button quiet" href="/notifications?unread=1" aria-current={unread ? 'page' : undefined}>未读</a>
    </nav><Alert message={inbox.error || action.error}/>
    {inbox.data ? inbox.data.items.length ? <div className="member-list">{inbox.data.items.map(item => {
      const href = item.topic_id ? '/topic/' + item.topic_id + (item.topic_reply_id ? '#' + item.topic_reply_id : '') :
        '/resource/' + item.resource_id + (item.resource_comment_id ? '#' + item.resource_comment_id : '');
      return <div className="member-entry" key={item.id}><div><a href={href}>{item.reason === 'follow' ? '关注的主题收到回复' : '有人回复了你的主题'}</a>
        <small><DateLabel value={item.created_at}/></small></div>
        {item.read_at == null && <button className="button" onClick={() => read({ ids: [item.id] })}>标为已读</button>}
      </div>;
    })}</div> : <Empty title="暂无通知"/> : !inbox.error && <Empty title="正在读取通知"/>}
  </Panel></MemberGate>;
}

export function Settings() {
  const { member, theme, setTheme, refreshMember, login } = useCommunity();
  const action = useAction();
  async function change(next) {
    if (!member || await action.perform('/me/preferences', { method: 'PATCH', body: { theme: next } })) setTheme(next);
  }
  return <Panel title="账号与阅读设置"><div className="settings-grid">
    <div><strong>{member ? member.display_name : '访客'}</strong>{member ? <p className="form-hint">@{member.handle}</p> :
      <p><a href={login}>使用 GitHub 登录</a></p>}</div>
    <div className="form-actions"><span>阅读外观</span>{[['light','浅色'],['dark','深色']].map(([id, name]) =>
      <button className={'button ' + (theme === id ? 'primary' : '')} key={id} aria-pressed={theme === id}
        onClick={() => change(id)}>{name}</button>)}</div>
    {member && <div><button className="button" disabled={action.busy} onClick={async () => {
      if (await action.perform('/auth/logout', { method: 'POST' })) refreshMember();
    }}>退出登录</button></div>}
    <Alert message={action.error}/>
  </div></Panel>;
}
