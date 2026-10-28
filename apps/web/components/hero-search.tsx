"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 首页大搜索框：提交 → /search?q=…，空关键词禁提交（phase2 §2.1） */
export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <form
      className="srch"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed) return;
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="搜索项目、仓库或关键词…"
        aria-label="搜索项目、仓库或关键词"
        type="search"
        name="q"
      />
      <button className="go" type="submit" disabled={!trimmed} aria-label="搜索">
        搜索
      </button>
    </form>
  );
}
