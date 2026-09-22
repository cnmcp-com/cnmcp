"use client";

import { useEffect, useState } from "react";

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("cnmcp-toast", { detail: message }));
}

export function ToastHost() {
  const [message, setMessage] = useState("已复制");
  const [on, setOn] = useState(false);

  useEffect(() => {
    let timer = 0;
    function onToast(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      setMessage(detail || "已复制");
      setOn(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOn(false), 1500);
    }
    window.addEventListener("cnmcp-toast", onToast);
    return () => {
      window.removeEventListener("cnmcp-toast", onToast);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`toast${on ? " on" : ""}`} role="status">
      {message}
    </div>
  );
}
