"use client";

const KEY = "cnmcp-session";

export function readSession(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeSession(value: string | null) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore private mode */
  }
}

export function captureSessionFromHash(): boolean {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = params.get("session");
  if (!session) return false;
  writeSession(session);
  params.delete("session");
  const next = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next ? `#${next}` : ""}`);
  return true;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = readSession();
  if (session) headers.Authorization = `Bearer ${session}`;
  return headers;
}
