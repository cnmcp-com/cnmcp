'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client.mjs';
import { Alert, Empty, Panel, useCommunity } from './shared.jsx';

export function retrievePending(key) {
  try {
    const name = 'cnmcp:pending:' + key;
    const value = JSON.parse(sessionStorage.getItem(name));
    sessionStorage.removeItem(name);
    return value;
  } catch { return null; }
}

export function useAction() {
  const { member, login, ready } = useCommunity();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const last = useRef(null), lock = useRef(false);
  async function perform(path, { method, body, idempotent = false, pendingKey } = {}) {
    if (lock.current || !ready) return null;
    const signedOut = () => {
      if (pendingKey && body) {
        try { sessionStorage.setItem('cnmcp:pending:' + pendingKey, JSON.stringify(body)); } catch {}
      }
      window.location.assign(login);
    };
    if (!member) { signedOut(); return null; }
    lock.current = true;
    setBusy(true); setError(''); setStatus(null);
    const fingerprint = JSON.stringify([path, method, body]);
    if (last.current?.fingerprint !== fingerprint) last.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const data = await api(path, { method, body, requestKey: idempotent ? last.current.key : undefined });
      last.current = null;
      return data;
    } catch (err) {
      if (err.status === 401) signedOut();
      else { setError(err.message); setStatus(err.status || null); }
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, status, perform };
}

export function useData(path) {
  const [state, setState] = useState({ path: null, data: null, error: '' });
  const [revision, revise] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ path, data, error: '' });
    }, error => {
      if (!controller.signal.aborted) setState({ path, data: null, error: error.message });
    });
    return () => controller.abort();
  }, [path, revision]);
  return { data: state.path === path ? state.data : null, error: state.path === path ? state.error : '',
    refresh: () => revise(x => x + 1) };
}

export function MemberGate({ children }) {
  const { member, ready, memberError, login, refreshMember } = useCommunity();
  if (!ready) return <Panel><Empty title="正在读取登录状态"/></Panel>;
  if (memberError) return <Panel><Empty title="无法读取账号"><Alert message={memberError}/>
    <button className="button" onClick={refreshMember}>重试</button></Empty></Panel>;
  if (!member) return <Panel><Empty title="请先登录社区">
    <a className="button primary" href={login}>使用 GitHub 登录</a></Empty></Panel>;
  return children;
}
