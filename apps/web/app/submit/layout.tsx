import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "提交项目",
  description: "提交一个 GitHub 仓库，自动上架到 CNMCP。",
  robots: { index: false, follow: false },
};

export default function SubmitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
