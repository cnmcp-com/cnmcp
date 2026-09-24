const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.error(`缺少 Cloudflare 发布凭据：${missing.join(", ")}`);
  process.exit(1);
}

if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID)) {
  console.error("CLOUDFLARE_ACCOUNT_ID 格式不正确，应为 32 位十六进制字符串。");
  process.exit(1);
}

console.log("Cloudflare 发布凭据已配置。");
