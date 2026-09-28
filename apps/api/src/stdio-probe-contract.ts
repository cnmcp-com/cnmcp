import type { McpTool } from "./mcp";

export const STDIO_RUNNER_VERSION = "container-v1";
export const STDIO_PROBE_TIMEOUT_MS = 180_000;

export type StdioLauncher = "npx" | "uvx" | "uv";

export type StdioProbeStatus =
  | "queued"
  | "verified"
  | "credential_required"
  | "unsupported_launcher"
  | "unsafe_config"
  | "package_not_found"
  | "install_failed"
  | "startup_failed"
  | "startup_timeout"
  | "protocol_failed"
  | "runner_failed";

export type StdioLaunch = {
  launcher: StdioLauncher;
  args: string[];
  packageName: string;
  packageIndex: number;
  registry: "npm" | "pypi";
  mode: "direct" | "uv-with" | "uv-tool";
  packageSpec: string;
  pinnedVersion: string | null;
};

export type StdioLaunchDecision =
  | { ok: true; launch: StdioLaunch }
  | { ok: false; status: Exclude<StdioProbeStatus, "queued" | "verified">; error: string };

export type StdioProbeJob = {
  runId: string;
  serverId: string;
  launcher: StdioLauncher;
  args: string[];
  packageName: string;
  resolvedPackageVersion: string;
  timeoutMs: number;
};

export type StdioProbeResult = {
  status: Exclude<StdioProbeStatus, "queued" | "credential_required" | "unsupported_launcher" | "unsafe_config">;
  ok: boolean;
  error?: string;
  errorCode?: string;
  latencyMs: number | null;
  protocolVersion: string | null;
  tools: McpTool[];
  containerDeploymentId?: string | null;
};

type RecordValue = Record<string, unknown>;

function recordOf(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function packageParts(value: string, registry: "npm" | "pypi"): { name: string; version: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:https?:|git\+|file:|\.|\/|~|[A-Za-z]:[\\/])/.test(trimmed)) return null;
  if (registry === "npm") {
    const splitAt = trimmed.startsWith("@") ? trimmed.lastIndexOf("@") : trimmed.indexOf("@");
    const hasVersion = splitAt > (trimmed.startsWith("@") ? trimmed.indexOf("/") : 0);
    const name = hasVersion ? trimmed.slice(0, splitAt) : trimmed;
    const version = hasVersion ? trimmed.slice(splitAt + 1) : null;
    if (!/^(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/i.test(name)) return null;
    return { name, version: version && version !== "latest" ? version : null };
  }

  const withoutExtras = trimmed.replace(/\[[^\]]+\]/, "");
  const match = withoutExtras.match(/^([a-z0-9._-]+)(?:==|@)([^\s]+)$/i);
  const name = match?.[1] ?? withoutExtras;
  if (!/^[a-z0-9._-]+$/i.test(name)) return null;
  return { name, version: match?.[2] && match[2] !== "latest" ? match[2] : null };
}

function unsafeArgument(value: string): boolean {
  return value.length > 300 || /[\0\r\n]/.test(value) || /\{\{|\}\}|<[^>]+>|YOUR[_ -]|PATH_TO|\/Users\/|[A-Za-z]:\\/i.test(value);
}

function exactVersion(value: string | null): string | null {
  if (!value) return null;
  return /^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value) ? value : null;
}

export function stdioLaunchOf(value: unknown): StdioLaunchDecision {
  const root = recordOf(value);
  const config = recordOf(root?.config) ?? root;
  const servers = recordOf(config?.mcpServers);
  const entry = servers ? recordOf(Object.values(servers)[0]) : null;
  if (!entry || typeof entry.command !== "string") {
    return { ok: false, status: "unsupported_launcher", error: "no_reliable_stdio_config" };
  }
  const env = recordOf(entry.env);
  const headers = recordOf(entry.headers);
  if ((env && Object.keys(env).length > 0) || (headers && Object.keys(headers).length > 0)) {
    return { ok: false, status: "credential_required", error: "environment_variables_required" };
  }
  const launcher = entry.command.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") as StdioLauncher | undefined;
  if (!launcher || !(["npx", "uvx", "uv"] as string[]).includes(launcher)) {
    return { ok: false, status: "unsupported_launcher", error: `unsupported_launcher:${launcher ?? "unknown"}` };
  }
  const args = Array.isArray(entry.args) ? entry.args.filter((item): item is string => typeof item === "string") : [];
  if (args.some((arg) => /(?:api[-_]?key|access[-_]?token|client[-_]?secret|password|authorization|bearer|--header)/i.test(arg))) {
    return { ok: false, status: "credential_required", error: "credential_argument_not_allowed" };
  }
  if (!args.length || args.length > 64 || args.some(unsafeArgument)) {
    return { ok: false, status: "unsafe_config", error: "unsafe_or_missing_arguments" };
  }
  if (launcher === "npx" && args.some((arg) => arg === "-c" || arg === "--call" || arg.startsWith("--script-shell"))) {
    return { ok: false, status: "unsafe_config", error: "npx_shell_execution_not_allowed" };
  }

  let packageIndex = -1;
  let registry: StdioLaunch["registry"] = launcher === "npx" ? "npm" : "pypi";
  let mode: StdioLaunch["mode"] = "direct";
  if (launcher === "npx" || launcher === "uvx") {
    packageIndex = args.findIndex((arg) => !arg.startsWith("-"));
  } else if (args[0] === "run" && args.includes("--with")) {
    packageIndex = args.indexOf("--with") + 1;
    mode = "uv-with";
  } else if (args[0] === "tool" && args[1] === "run") {
    packageIndex = args.findIndex((arg, index) => index > 1 && !arg.startsWith("-"));
    mode = "uv-tool";
  }
  if (packageIndex < 0 || !args[packageIndex]) {
    return { ok: false, status: "unsupported_launcher", error: "package_target_not_found" };
  }
  const packageSpec = args[packageIndex];
  if (!packageSpec) return { ok: false, status: "unsupported_launcher", error: "package_target_not_found" };
  const parts = packageParts(packageSpec, registry);
  if (!parts) return { ok: false, status: "unsafe_config", error: "unsupported_package_spec" };
  return {
    ok: true,
    launch: {
      launcher,
      args,
      packageName: parts.name,
      packageIndex,
      registry,
      mode,
      packageSpec,
      pinnedVersion: exactVersion(parts.version),
    },
  };
}

async function registryVersion(launch: StdioLaunch, fetcher: typeof fetch): Promise<string> {
  if (launch.pinnedVersion) return launch.pinnedVersion;
  const url = launch.registry === "npm"
    ? `https://registry.npmjs.org/${encodeURIComponent(launch.packageName)}/latest`
    : `https://pypi.org/pypi/${encodeURIComponent(launch.packageName)}/json`;
  const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "cnmcp-stdio-resolver/0.1" } });
  if (!response.ok) throw new Error(response.status === 404 ? "package_not_found" : `registry_http_${response.status}`);
  const body = await response.json<Record<string, unknown>>();
  const version = launch.registry === "npm"
    ? body.version
    : recordOf(body.info)?.version;
  if (typeof version !== "string" || !version.trim()) throw new Error("registry_version_missing");
  return version.trim();
}

export async function resolveStdioLaunch(launch: StdioLaunch, fetcher: typeof fetch = fetch): Promise<{ args: string[]; version: string }> {
  const version = await registryVersion(launch, fetcher);
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,100}$/.test(version)) throw new Error("registry_version_invalid");
  const args = [...launch.args];
  if (launch.registry === "npm") {
    args[launch.packageIndex] = `${launch.packageName}@${version}`;
  } else if (launch.mode === "uv-with") {
    const requirement = launch.packageSpec.replace(/(?:==|@)[^@=]+$/, "");
    args[launch.packageIndex] = `${requirement}==${version}`;
  } else if (launch.mode === "uv-tool") {
    args.splice(launch.packageIndex, 0, "--from", `${launch.packageName}==${version}`);
  } else if (!launch.pinnedVersion) {
    args[launch.packageIndex] = launch.packageName;
    args.splice(launch.packageIndex, 0, "--from", `${launch.packageName}==${version}`);
  }
  return { args, version };
}
