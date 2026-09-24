const [url, expected = "web"] = process.argv.slice(2);

if (!url) {
  console.error("用法：node scripts/smoke-deployment.mjs <url> [api|web]");
  process.exit(1);
}

const attempts = 18;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = await response.text();
    const valid = response.ok && (expected !== "api" || /"ok"\s*:\s*true/.test(body));
    if (valid) {
      console.log(`发布验证通过：${url} (${response.status})`);
      process.exit(0);
    }
    console.log(`第 ${attempt}/${attempts} 次检查未通过：HTTP ${response.status}`);
  } catch (error) {
    console.log(`第 ${attempt}/${attempts} 次检查失败：${String(error)}`);
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10_000));
}

console.error(`发布后验证超时：${url}`);
process.exit(1);
