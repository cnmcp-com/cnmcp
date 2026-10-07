const PLAZA_ID_RE = /^cloud\.tencent\.com\/(\d+)$/i;

/** 本站公开路径。广场服务不用腾讯域名当路径。 */
export function serverPublicPath(id: string): string {
  const match = id.trim().match(PLAZA_ID_RE);
  if (match?.[1]) return `/servers/plaza/${match[1]}`;
  return `/servers/${encodeURIComponent(id.trim())}`;
}

export type ServerRoute = { id: string } | { redirect: string };

/** 把 /servers 后面的路径段还原成内部 id，或指出应跳到的公开路径。 */
export function resolveServerRoute(segments: string[]): ServerRoute | null {
  const parts = segments.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts.length === 2 && parts[0] === "plaza" && /^\d+$/.test(parts[1] ?? "")) {
    return { id: `cloud.tencent.com/${parts[1]}` };
  }
  if (parts.length === 2 && /^cloud\.tencent\.com$/i.test(parts[0] ?? "") && /^\d+$/.test(parts[1] ?? "")) {
    return { redirect: `/servers/plaza/${parts[1]}` };
  }
  if (parts.length !== 1 || !parts[0]) return null;
  const id = parts[0];
  const canonical = serverPublicPath(id);
  if (canonical !== `/servers/${encodeURIComponent(id)}`) return { redirect: canonical };
  return { id };
}
