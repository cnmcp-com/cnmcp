import type { ServerDetail } from "@cnmcp/schema";

function escape(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

export function renderBadge(detail: ServerDetail | null): string {
  const label = "CNMCP";
  const message = !detail ? "not found" : detail.score === null ? (detail.status === "dead" ? "dead" : "unverified") : `${detail.grade} ${detail.score}`;
  const color = !detail || detail.score === null ? "#6E6E69" : detail.grade === "A" ? "#0F6E56" : detail.grade === "B" ? "#185FA5" : detail.grade === "C" ? "#854F0B" : "#A32D2D";
  const leftWidth = 54;
  const rightWidth = 72;
  const width = leftWidth + rightWidth;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escape(label)}: ${escape(message)}">
  <title>${escape(label)}: ${escape(message)}</title>
  <rect width="${leftWidth}" height="20" fill="#534AB7"/>
  <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
  <text x="6" y="14" fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${escape(label)}</text>
  <text x="${leftWidth + 8}" y="14" fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${escape(message)}</text>
</svg>`;
}
