import type { Metadata } from "next";

import { SubmitForm } from "@/components/submit-form";

export const metadata: Metadata = {
  title: "提交项目",
  description: "粘贴 GitHub 仓库地址，可附一段推荐语。仓库会自动上架，检查在后台继续。",
  alternates: { canonical: "/submit" },
};

export default function SubmitPage() {
  return (
    <div className="wrap stack" style={{ padding: "28px 0 48px", maxWidth: 760 }}>
      <h1>提交项目</h1>
      <p>只收公开 GitHub 仓库。新仓库会立刻出现在列表里。安全检查还在进行时显示为未完成，这不是风险，也不会拦住上架。</p>
      <SubmitForm />
    </div>
  );
}
