'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { queryPath } from '@cnmcp/contracts';
import { api, readLocal, writeLocal } from '../lib/client.mjs';
import { loginPath } from '../lib/login.mjs';
import { CommunityContext, Markdown, nameOf, Panel, scopePath } from './shared.jsx';
import { Browse, Guide, Search } from './browse.jsx';
import { Detail } from './detail.jsx';
import { MemberPage, Notifications, Publish, PublishResource, Settings } from './member.jsx';
import { Overview, OverviewHeader } from './overview.jsx';

const historyKey = 'cnmcp:v2:history';
const themeKey = 'cnmcp:v2:theme';

function useRecentVisit(section, data, domain) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let saved = readLocal(historyKey, []);
    if (!Array.isArray(saved)) saved = [];
    saved = saved.filter(item => item && typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id)
      && ['topic','resource'].includes(item.kind));
    if (data && ['topic','resource'].includes(section)) {
      saved = [{ id: data.id, kind: section, domain },
        ...saved.filter(item => item.id !== data.id || item.kind !== section)].slice(0, 20);
      writeLocal(historyKey, saved);
    }
    const controller = new AbortController();
    (async () => {
      const latest = [];
      for (let i = 0; i < saved.length && latest.length < 5 && !controller.signal.aborted; i += 5) {
        const verified = await Promise.all(saved.slice(i, i + 5).map(async entry => {
          try {
            const item = await api('/' + entry.kind + 's/' + entry.id, { signal: controller.signal });
            return { ...entry, title: item.title || item.name };
          } catch (error) { return error.status === 404 || controller.signal.aborted ? null : { ...entry, unavailable: true }; }
        }));
        latest.push(...verified.filter(Boolean));
      }
      if (!controller.signal.aborted) setItems(latest.slice(0, 5));
    })();
    return () => controller.abort();
  }, [section, data?.id, domain]);
  return [items, () => { writeLocal(historyKey, []); setItems([]); }];
}

function Sidebar({ member, domain, sidebar, history, clearHistory, login, overview }) {
  const hot = sidebar?.todayHot ?? [];
  const waiting = sidebar?.waitingCount ?? 0;
  return <aside className={'sidebar' + (overview ? ' overview-sidebar' : '')} aria-label="社区侧栏">
    {overview && <Panel className="overview-contribute" title="参与社区">
      <div className="overview-contribute-links">
        <a href={scopePath('publish-resource', { domain })}><span><strong>推荐开源项目</strong><small>分享你用过的项目和用途。</small></span><span aria-hidden="true">→</span></a>
        <a href="/guide"><span><strong>社区指南</strong><small>了解怎样发帖和引用资源。</small></span><span aria-hidden="true">→</span></a>
      </div>
    </Panel>}
    {(!overview || member) && <Panel className="welcome-panel">
      <strong>{member ? member.display_name : 'CNMCP 开源社区'}</strong>
      {member ? <>
        <div className="account-stats">{[['bookmarks','收藏',member.bookmark_count],['followed-topics','关注',member.followed_topic_count],
          ['topics','主题',member.my_topic_count]].map(([tab, name, count]) => <a key={tab} href={queryPath('/me', { tab })}>
            <strong>{count}</strong><span>{name}</span></a>)}</div>
        <div className="sidebar-inline"><a href="/notifications">通知{member.unread_count ? ' · ' + member.unread_count : ''}</a>
          <a href="/settings">设置</a></div>
      </> : <><p className="welcome-copy">交流制作经验，发现可以动手尝试的开源资源。</p>
        <a className="button" href={login}>使用 GitHub 登录</a><a className="guide-link" href="/guide">社区指南</a></>}
    </Panel>}
    {(!overview || waiting > 0) && <Panel title="参与讨论"><div className="side-actions">
      {!overview && <a href={scopePath('publish', { domain })}>发布新主题 <span>→</span></a>}
      <a href={scopePath('topics', { domain, unanswered: 1 })}>待回应 <span>{waiting} 个主题</span></a>
    </div></Panel>}
    {(!overview || hot.length > 0) && <Panel title={overview ? '今日有回复' : '今日热议'}><div className="side-actions">
      {hot.length ? hot.map(item => <a key={item.id} href={queryPath('/topic/' + item.id, { domain })}>
        {item.title}<span>{item.today_reply_count} 条回复</span></a>) : <p className="side-copy">今天还没有收到回复的讨论。</p>}
    </div></Panel>}
    {(!overview || history.length > 0) && <Panel title="最近浏览" action={history.length > 0 && <button className="text-button" onClick={clearHistory}>清空</button>}>
      <div className="side-actions">{history.length ? history.map(item => item.unavailable ?
        <p className="side-copy" key={item.kind + item.id}>一条浏览记录暂时无法读取</p> :
        <a key={item.kind + item.id} href={queryPath('/' + item.kind + '/' + item.id, { domain: item.domain })}>
          {item.title}<span>{item.kind === 'topic' ? '主题' : '资源'}</span></a>) : <p className="side-copy">浏览记录仅保存在本机。</p>}</div>
    </Panel>}
  </aside>;
}

export default function Community({ section, id, params, taxonomy, data, sidebar, sitePages = [] }) {
  const router = useRouter();
  const [member, setMember] = useState(null), [ready, setReady] = useState(false), [memberError, setMemberError] = useState('');
  const [theme, setTheme] = useState('light');
  const validDomain = taxonomy.domains.some(item => item.id === params.domain);
  const domain = validDomain && params.domain || '';
  const locationPath = queryPath(section === 'overview' ? '/' : '/' + section + (id ? '/' + id : ''), params);
  const login = loginPath(locationPath);
  const [history, clearHistory] = useRecentVisit(section, data, domain);
  async function refreshMember() {
    try {
      const user = await api('/me');
      setMember(user); setTheme(user.theme_preference); setMemberError('');
    } catch (error) {
      if (error.status === 401) { setMember(null); setMemberError(''); }
      else setMemberError(error.message);
    } finally { setReady(true); }
  }
  useEffect(() => {
    setTheme(readLocal(themeKey, 'light') === 'dark' ? 'dark' : 'light');
    refreshMember();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeLocal(themeKey, theme);
  }, [theme]);
  function reload() { router.refresh(); refreshMember(); }
  const guide = sitePages.find(page => page.slug === 'guide');
  const columns = [['overview','首页'],['topics','主题'],['resources','资源发现']];
  const value = { taxonomy, domain, member, ready, memberError, login, theme, setTheme, reload, refreshMember };

  return <CommunityContext.Provider value={value}>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href={scopePath('overview', { domain })}>
        <img src="/cnmcp-icon.svg?v=2" width="30" height="30" alt="" />
        CNMCP
      </a>
      <nav className="site-columns" aria-label="站点栏目">{columns.map(([key, label]) =>
        <a key={key} href={scopePath(key, { domain })} aria-current={section === key ? 'page' : undefined}>{label}</a>)}</nav>
      <form className="search-box compact" action="/search" role="search">
        {domain && <input type="hidden" name="domain" value={domain}/>}
        <input name="q" aria-label="搜索主题或资源" placeholder={domain ? '搜索' + nameOf(taxonomy.domains, domain) + '领域' : '搜索主题或资源'}
          defaultValue={params.q || ''} maxLength={150}/><button className="icon-button" type="submit" aria-label="搜索">⌕</button>
      </form>
      <div className="header-actions">
        <a href="/guide" className="button quiet">指南</a>
        {member && <a href="/notifications" className="button quiet">通知{member.unread_count > 0 && <span className="badge">{member.unread_count}</span>}</a>}
        <a href={member ? '/me' : login} className="button quiet">{member ? '工作台' : '登录'}</a>
        <a href={scopePath('publish', { domain })} className="button primary">＋ 发布</a>
      </div>
    </div></header>
    <main className={'site-main two-column' + (section === 'overview' ? ' discovery-home' : '')}>
      {section === 'overview' && <OverviewHeader/>}
      <div className="main-column">
        {section === 'overview' && <>
          {sitePages.filter(page => page.slug === 'notice' || page.slug === 'home').map(page =>
            <Panel key={page.slug} title={page.title}><div className="padded"><Markdown text={page.body}/></div></Panel>)}
          <Overview data={data}/>
        </>}
        {['topics','resources'].includes(section) && <Browse section={section} data={data} params={params}/>}
        {section === 'search' && <Search data={data} params={params}/>}
        {section === 'guide' && (guide ? <Panel title={guide.title}><div className="guide-content"><Markdown text={guide.body}/></div></Panel> : <Guide/>)}
        {['topic','resource'].includes(section) && <Detail key={id} kind={section} item={data} params={params}/>}
        {section === 'publish' && <Publish key={params.draft || params.edit || 'new'} params={params}/>}
        {section === 'publish-resource' && <PublishResource/>}
        {section === 'me' && <MemberPage params={params}/>}
        {section === 'notifications' && <Notifications params={params}/>}
        {section === 'settings' && <Settings/>}
      </div>
      <Sidebar member={member} domain={domain} sidebar={sidebar} history={history} clearHistory={clearHistory} login={login}
        overview={section === 'overview'}/>
    </main>
    <footer className="site-footer"><div><strong>CNMCP.</strong></div>
      <nav><a href="/guide">社区指南</a><a href="/settings">设置</a></nav>
    </footer>
  </CommunityContext.Provider>;
}
