import type { ReadmeBlock } from "./index";

const PLAZA_NAMESPACE = "cloud.tencent.com";

export function sourceLabelOf(input: { namespace?: string | null; srcUrl?: string | null; author?: string | null }): string | null {
  const src = input.srcUrl?.trim();
  if (src) {
    try {
      const url = new URL(src);
      const host = url.hostname.replace(/^www\./i, "");
      const parts = url.pathname.split("/").filter(Boolean);
      const owner = parts[0];
      const repo = parts[1];
      if (/(^|\.)github\.com$/i.test(host) && owner && repo) {
        return `github.com/${owner}/${repo.replace(/\.git$/i, "")}`;
      }
      if (host && host !== PLAZA_NAMESPACE && host !== "developer.cloud.tencent.com") return host;
    } catch {
      // 来源链接不是 URL 时，继续用作者或非广场 namespace。
    }
  }
  const namespace = input.namespace?.trim();
  if (namespace && namespace !== PLAZA_NAMESPACE) return namespace;
  return input.author?.trim() || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function htmlToLines(raw: string): string {
  return decodeEntities(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => `\n\`\`\`\n${inner.replace(/<[^>]+>/g, "")}\n\`\`\`\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<h([1-3])[^>]*>/gi, (_, level: string) => `\n${"#".repeat(Number(level))} `)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a [^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "");
}

function cleanInline(value: string): string {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function readmeToBlocks(raw: string | null | undefined): ReadmeBlock[] {
  if (!raw?.trim()) return [];
  const lines = htmlToLines(raw.slice(0, 24_000)).replace(/\r\n/g, "\n").split("\n");
  const blocks: ReadmeBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  function flushParagraph() {
    const text = cleanInline(paragraph.join(" "));
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", text });
  }

  function flushList() {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  }

  for (const line of lines) {
    if (blocks.length >= 80) break;
    if (code) {
      if (line.trim().startsWith("```")) {
        const text = code.join("\n").trim().slice(0, 4000);
        code = null;
        if (text) blocks.push({ type: "code", text });
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const marks = heading[1];
      const text = cleanInline(heading[2] ?? "");
      if (marks && text) blocks.push({ type: "heading", level: marks.length as 1 | 2 | 3, text });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      flushParagraph();
      const text = cleanInline(item[1] ?? "");
      if (text) list.push(text);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (!code) {
    flushParagraph();
    flushList();
  }
  return blocks.slice(0, 80);
}
