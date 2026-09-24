import type { Grade } from "@cnmcp/schema";

import { GRADE_COLOR, GRADE_TEXT } from "@/lib/ui";

const SIZES = {
  card: { r: 20, w: 4, fs: 17 },
  rank: { r: 11, w: 3, fs: 0 },
  detail: { r: 38, w: 6, fs: 26 },
} as const;

export function ScoreRing({
  score,
  grade,
  size = "card",
}: {
  score: number | null;
  grade: Grade | null;
  size?: keyof typeof SIZES;
}) {
  const { r, w, fs } = SIZES[size];
  const circumference = 2 * Math.PI * r;
  const box = (r + w) * 2;
  const scored = score !== null;
  const operational = scored && grade !== null;
  const color = operational ? GRADE_COLOR[grade] : scored ? "var(--info)" : "var(--tx-3)";
  const offset = scored ? circumference * (1 - Math.max(0, Math.min(100, score)) / 100) : circumference;
  const label = operational ? `动态验证 ${score}，${GRADE_TEXT[grade]}` : scored ? `公开证据完整度 ${score}` : "暂无证据评分";

  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label}>
      <circle cx={r + w} cy={r + w} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={w} />
      {scored ? (
        <circle
          cx={r + w}
          cy={r + w}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={w}
          strokeLinecap="round"
          strokeDasharray={circumference.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          transform={`rotate(-90 ${r + w} ${r + w})`}
        />
      ) : null}
      {fs ? (
        <text
          x={r + w}
          y={r + w}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="ui-monospace, SF Mono, Menlo, monospace"
          fontSize={fs}
          fontWeight={500}
          fill="var(--tx)"
        >
          {scored ? score : "—"}
        </text>
      ) : null}
    </svg>
  );
}
