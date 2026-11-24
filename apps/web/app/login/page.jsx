import { githubLoginPath } from '../../lib/login.mjs';

export const metadata = { title: '登录', robots: { index: false } };

const messages = new Map([
  ['unavailable', 'GitHub 登录暂不可用，请稍后重试。'],
  ['cancelled', '你已取消 GitHub 授权，可以重新登录。'],
  ['expired', '这次登录请求已失效，请重新登录。']
]);

export default async function LoginPage({ searchParams }) {
  const { return: returnTo, error } = await searchParams;
  const message = messages.get(error);

  return <main className="site-main">
    <section className="panel padded login-panel" aria-labelledby="login-title">
      <h1 id="login-title">登录 CNMCP</h1>
      {message && <p className="login-message" role="alert">{message}</p>}
      <div className="login-actions">
        <a className="button primary" href={githubLoginPath(typeof returnTo === 'string' ? returnTo : undefined)}>
          使用 GitHub 登录
        </a>
        <a className="button quiet" href="/">返回首页</a>
      </div>
    </section>
  </main>;
}
