'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { queryPath, resourceKinds } from '@cnmcp/contracts';
import { api } from '../lib/client.mjs';

export const CommunityContext = createContext(null);
export function useCommunity() { return useContext(CommunityContext); }

export function scopePath(section, params = {}) {
  return queryPath(section === 'overview' ? '/' : '/' + section,
    Object.fromEntries(Object.entries(params).filter(([, value]) => value !== 'all')));
}
export function nameOf(items, id) { return items.find(item => item.id === id)?.name || id; }
export function facets(taxonomy, domain, key) {
  const map = key === 'nodes' ? taxonomy.domain_nodes : taxonomy.domain_tags;
  const field = key === 'nodes' ? 'node_id' : 'tag_id';
  return taxonomy[key].filter(item => map.some(row => row[field] === item.id && (!domain || domain === 'all' || row.domain_id === domain)));
}
const day = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium' });
export function DateLabel({ value }) {
  if (!value) return null;
  const date = new Date(value * 1000);
  return <time dateTime={date.toISOString()}>{day.format(date)}</time>;
}

export function Panel({ title, action, children, className = '' }) {
  return <section className={'panel ' + className}>
    {title && <div className="panel-title"><h2>{title}</h2>{action}</div>}{children}
  </section>;
}

export function Empty({ title = '暂无内容', text, children }) {
  return <div className="empty-state"><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}

export function Alert({ message }) { return message ? <p className="field-error" role="alert">{message}</p> : null; }

export function TopicRow({ item }) {
  const { taxonomy, domain } = useCommunity(), url = queryPath('/topic/' + item.id, { domain });
  return <article className="feed-row">
    <span className="avatar" aria-hidden="true">{item.author?.slice(0, 1) || '话'}</span>
    <div><a className="feed-title" href={url}>{item.title}</a>
      <div className="row-meta">
        <a href={scopePath('topics', { domain: item.domain_id })}>{nameOf(taxonomy.domains, item.domain_id)}</a>
        <a href={scopePath('topics', { domain: item.domain_id, node: item.node_id })}>{nameOf(taxonomy.nodes, item.node_id)}</a>
        <span>{item.author}</span><DateLabel value={item.created_at}/>
        {!!item.resource_count && <span>{item.resource_count} 个资源引用</span>}
      </div>
    </div>
    <a className="reply-count" href={url + '#replies'} aria-label={item.reply_count + ' 条回复'}>{item.reply_count}</a>
  </article>;
}

export function Signals({ item, full = false }) {
  return <div className="resource-signals">
    <span>{item.stars == null ? (item.stars_source_url ? 'Star 待同步' : 'Star 不适用') : item.stars.toLocaleString('zh-CN') + ' Star'}</span>
    <span>{item.discussion_reference_count} 讨论引用</span><span>{item.bookmark_count} 收藏</span>
    {full && <><span>{item.comment_count} 评论</span><span>{item.helpful_count} 有帮助</span></>}
  </div>;
}

export function ResourceAvatar({ item, size = 36 }) {
  const [failed, setFailed] = useState(null);
  const src = item.avatar_url;
  return <span className="avatar resource-avatar" style={{ width: size, height: size }} aria-hidden="true">
    {src && src !== failed ? <img src={src} width={size} height={size} alt="" loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailed(src)}/> : (resourceKinds[item.kind] || '资源')[0]}
  </span>;
}

export function ResourceRow({ item }) {
  const { domain, taxonomy } = useCommunity();
  const tags = [...new Map(item.tags.filter(tag => !domain || domain === tag.domain_id)
    .map(tag => [tag.tag_id, tag])).values()];
  return <article className="feed-row resource-row">
    <ResourceAvatar item={item}/>
    <div className="resource-row-content">
      <a className="feed-title" href={queryPath('/resource/' + item.id, { domain })}>{item.name}</a>
      <span className="badge resource row-kind">{resourceKinds[item.kind]}</span>
      {item.summary && <p className="resource-row-summary">{item.summary}</p>}
      <div className="resource-domain-links">{item.domain_ids.map(id => <a key={id} href={scopePath('resources', { domain: id })}>
        {nameOf(taxonomy.domains, id)}</a>)}{!item.domain_ids.length && <span className="muted">领域待整理</span>}</div>
      {tags.length > 0 && <div className="inline-resource-tags">{tags.map(tag => <a className="resource-tag" key={tag.tag_id}
        href={scopePath('resources', { domain, tag: tag.tag_id })}>#{tag.name}</a>)}</div>}
      <Signals item={item} full/>
    </div>
  </article>;
}

function safeHref(value) {
  if (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function inline(source) {
  const pieces = [];
  let cursor = 0;
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|`([^`\n]+)`|\*\*([^*]+)\*\*|(https:\/\/[^\s<>）)\]，。；！？]+)/g;
  for (const match of source.matchAll(pattern)) {
    pieces.push(source.slice(cursor, match.index));
    const [, label, url, code, bold, raw] = match;
    const href = url || raw ? safeHref((url || raw).replace(/[.,;]+$/, '')) : null;
    pieces.push(href ? <a key={match.index} href={href} rel="ugc noreferrer">{label || raw}</a> :
      code ? <code key={match.index}>{code}</code> : bold ? <strong key={match.index}>{bold}</strong> : match[0]);
    cursor = match.index + match[0].length;
  }
  pieces.push(source.slice(cursor));
  return pieces;
}

export function Markdown({ text = '' }) {
  const sections = text.split(/(^```[^\n]*\n[\s\S]*?^```\s*$)/m);
  return <div className="prose">{sections.flatMap((section, group) => {
    if (section.startsWith('```')) return <pre key={group}><code>{section.replace(/^```[^\n]*\n|\n```\s*$/g, '')}</code></pre>;
    return section.trim().split(/\n\s*\n/).filter(Boolean).map((block, index) => {
      const key = group + ':' + index;
      if (/^#{1,3} /.test(block)) return <h3 key={key}>{inline(block.replace(/^#{1,3} /, ''))}</h3>;
      const lines = block.split('\n');
      if (lines.every(line => /^[-*] /.test(line))) return <ul key={key}>
        {lines.map((line, i) => <li key={i}>{inline(line.slice(2))}</li>)}</ul>;
      if (lines.every(line => /^\d+\. /.test(line))) return <ol key={key}>
        {lines.map((line, i) => <li key={i}>{inline(line.replace(/^\d+\. /, ''))}</li>)}</ol>;
      if (lines.every(line => /^> /.test(line))) return <blockquote key={key}>{inline(lines.map(line => line.slice(2)).join('\n'))}</blockquote>;
      return <p key={key}>{inline(block)}</p>;
    });
  })}</div>;
}

export function Editor({ value, onChange, label, rows = 7 }) {
  const [preview, setPreview] = useState(false), [picker, setPicker] = useState(null), [results, setResults] = useState([]);
  const [active, setActive] = useState(0), [status, setStatus] = useState('');
  const textarea = useRef(null), root = useRef(null);
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController();
    const find = setTimeout(async () => {
      try {
        const options = { signal: controller.signal };
        const data = picker.query ? await api(queryPath('/search', { query: picker.query, kind: 'resource' }), options)
          : await api('/resources?limit=8', options);
        setResults((data.resources || data.items).slice(0, 8));
        setActive(0);
        setStatus('');
      } catch (error) {
        if (!controller.signal.aborted) { setResults([]); setStatus(error.message); }
      }
    }, 140);
    return () => { clearTimeout(find); controller.abort(); };
  }, [picker]);
  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setPicker(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function insert(item) {
    if (!picker) return;
    const link = '[' + item.name.replace(/[\[\]]/g, '') + '](/resource/' + item.id + ')';
    const index = picker.start + link.length;
    onChange(value.slice(0, picker.start) + link + value.slice(picker.end));
    setPicker(null);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(index, index); });
  }
  function keyboard(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || !picker) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setPicker(null);
      textarea.current?.focus();
    } else if (results.length && ['ArrowUp','ArrowDown','Enter'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Enter') insert(results[active]);
      else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    }
  }
  return <div className="compact-editor" ref={root}>
    <div className="editor-toolbar">
      <div><button type="button" className="button quiet" aria-pressed={!preview} onClick={() => { setPreview(false); setPicker(null); }}>正文</button>
        <button type="button" className="button quiet" aria-pressed={preview} onClick={() => { setPreview(true); setPicker(null); }}>预览</button></div>
      <button type="button" className="insert-resource" aria-expanded={!!picker} onClick={() => {
        setPicker(picker ? null : { query: '', start: textarea.current?.selectionStart ?? value.length,
          end: textarea.current?.selectionEnd ?? value.length, manual: true }); setPreview(false);
      }}>＠ 引用资源</button>
    </div>
    <div className="editor-surface">
      {preview ? <div className="compact-preview"><Markdown text={value}/>{!value && <p className="muted">暂无正文</p>}</div> :
        <textarea ref={textarea} aria-label={label} value={value} rows={rows} onKeyDown={keyboard}
          placeholder="支持 Markdown，可输入 @ 引用资源或直接粘贴 HTTPS 链接。" onChange={event => {
            const text = event.target.value, end = event.target.selectionStart;
            onChange(text);
            const match = /(?:^|[\s(（])@([^\s@]{0,40})$/.exec(text.slice(0, end));
            setPicker(match ? { query: match[1], start: end - match[1].length - 1, end } : null);
          }}/>}
      {picker && <div className="resource-picker">
        <div className="picker-heading"><strong>引用站点资源</strong>
          <button className="icon-button" aria-label="关闭资源选择器" type="button" onClick={() => { setPicker(null); textarea.current?.focus(); }}>×</button></div>
        {picker.manual && <input autoFocus aria-label="搜索可引用资源" value={picker.query} onKeyDown={keyboard}
          onChange={e => setPicker({ ...picker, query: e.target.value })}/>}
        <div role="listbox" aria-label="资源候选">{results.map((item, i) =>
          <button type="button" role="option" aria-selected={i === active} key={item.id} onMouseDown={e => e.preventDefault()}
            onClick={() => insert(item)}><ResourceAvatar item={item} size={24}/>
            <span><strong>{item.name}</strong><small>{item.summary}</small></span></button>)}</div>
        {!results.length && <p className="picker-empty">{status || '可直接粘贴新资源的 HTTPS 链接。'}</p>}
      </div>}
    </div>
  </div>;
}
