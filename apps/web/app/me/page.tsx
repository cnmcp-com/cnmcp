import type { Metadata } from "next";

import { MePanel } from "@/components/me-panel";

export const metadata: Metadata = { title: "我的", robots: { index: false, follow: false } };

export default function MePage() {
  return (
    <div className="wrap" style={{ padding: "28px 0 48px" }}>
      <MePanel />
    </div>
  );
}
