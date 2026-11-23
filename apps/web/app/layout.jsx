import './styles.css';
export const metadata = {
  title: { default: 'CNMCP · 开源讨论与资源发现', template: '%s · CNMCP' },
  description: '分享开源工具和实践经验，发现视频、游戏与 AI 等领域的资源。',
  metadataBase: new URL('https://www.cnmcp.com'),
  icons: { icon: { url: '/cnmcp-icon.svg?v=2', type: 'image/svg+xml', sizes: 'any' } }
};
export default function RootLayout({ children }) {
  return <html lang="zh-CN" suppressHydrationWarning><body>{children}</body></html>;
}
