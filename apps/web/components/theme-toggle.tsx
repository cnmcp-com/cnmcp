"use client";

import { useEffect, useState } from "react";

function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("cnmcp-theme", next);
    } catch {
      /* ignore quota / private mode */
    }
    setTheme(next);
  }

  return (
    <button type="button" className="tgl" onClick={toggle} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
      ◐
    </button>
  );
}
