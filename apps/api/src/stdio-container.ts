import { Container, ContainerProxy } from "@cloudflare/containers";

import { STDIO_PROBE_TIMEOUT_MS, type StdioProbeJob, type StdioProbeResult } from "./stdio-probe-contract";

export { ContainerProxy };

const decoder = new TextDecoder();

function runnerFailure(error: unknown): StdioProbeResult {
  return {
    status: "runner_failed",
    ok: false,
    error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    errorCode: "runner_failed",
    latencyMs: null,
    protocolVersion: null,
    tools: [],
  };
}

export class StdioProbeContainer extends Container {
  sleepAfter = "30s";
  entrypoint = [
    "sh",
    "-lc",
    "rm -f /tmp/cnmcp-ready && cp /etc/cloudflare/certs/cloudflare-containers-ca.crt /usr/local/share/ca-certificates/cloudflare-containers-ca.crt && update-ca-certificates >/dev/null 2>&1 && touch /tmp/cnmcp-ready && exec node -e 'setInterval(() => {}, 2147483647)'",
  ];
  enableInternet = false;
  interceptHttps = true;
  allowedHosts = ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org"];

  async runProbe(job: StdioProbeJob): Promise<StdioProbeResult> {
    const timeoutMs = Math.min(STDIO_PROBE_TIMEOUT_MS, Math.max(10_000, job.timeoutMs));
    let stage = "runtime";
    try {
      const runtime = this.ctx.container;
      if (!runtime) return runnerFailure("container_runtime_unavailable");
      stage = "start";
      if (!runtime.running) await this.start({ enableInternet: false });
      stage = "readiness";
      const readiness = await runtime.exec([
        "node",
        "-e",
        "const fs=require('node:fs');let n=0;const t=setInterval(()=>{if(fs.existsSync('/tmp/cnmcp-ready')){clearInterval(t);process.exit(0)}if(++n>=100){clearInterval(t);process.exit(1)}},100)",
      ]);
      const readinessOutput = await readiness.output();
      if (readinessOutput.exitCode !== 0) return runnerFailure("container_readiness_timeout");
      stage = "exec";
      const encoded = encodeURIComponent(JSON.stringify({ ...job, timeoutMs }));
      const process = await runtime.exec(["node", "/opt/cnmcp/probe.mjs", encoded], {
        cwd: "/tmp",
        user: "10001:10001",
        env: {
          HOME: "/tmp/cnmcp",
          NPM_CONFIG_CACHE: "/tmp/npm-cache",
          NPM_CONFIG_AUDIT: "false",
          NPM_CONFIG_FUND: "false",
          NPM_CONFIG_UPDATE_NOTIFIER: "false",
          NPM_CONFIG_CAFILE: "/etc/ssl/certs/ca-certificates.crt",
          NODE_OPTIONS: "--use-openssl-ca",
          SSL_CERT_FILE: "/etc/ssl/certs/ca-certificates.crt",
          UV_CACHE_DIR: "/tmp/uv-cache",
          UV_NO_PROGRESS: "1",
          UV_PYTHON_DOWNLOADS: "never",
          UV_SYSTEM_CERTS: "true",
        },
      });
      stage = "output";
      const timer = setTimeout(() => process.kill(9), timeoutMs + 5_000);
      try {
        const output = await process.output();
        const stdout = decoder.decode(output.stdout).trim();
        if (!stdout) return runnerFailure(`runner_exit_${output.exitCode}:${decoder.decode(output.stderr).slice(-500)}`);
        const parsed = JSON.parse(stdout) as StdioProbeResult;
        return { ...parsed, containerDeploymentId: parsed.containerDeploymentId ?? null };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const message = `${stage}:${error instanceof Error ? error.message : String(error)}`;
      console.error(JSON.stringify({ path: "stdio-container", runId: job.runId, serverId: job.serverId, stage, error: message.slice(0, 1000) }));
      return runnerFailure(message);
    } finally {
      await this.destroy().catch(() => undefined);
    }
  }
}
