import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "提交 MCP 资源或更正",
  description: "向 CNMCP 提交新的 MCP 资源、发布方更正或验证申诉。",
  robots: { index: false, follow: false },
};

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
