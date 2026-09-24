import { describe, expect, it } from "vitest";

import { diffGitHubRepository, githubRepositoryFromUrl } from "./github-scan";

describe("GitHub repository monitor", () => {
  it("normalizes repository and nested source URLs", () => {
    expect(githubRepositoryFromUrl("https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem")).toEqual({
      key: "modelcontextprotocol/servers",
      url: "https://github.com/modelcontextprotocol/servers",
      apiUrl: "https://api.github.com/repos/modelcontextprotocol/servers",
    });
    expect(githubRepositoryFromUrl("https://example.com/org/repo")).toBeNull();
  });

  it("records repository activity, archival and default branch changes", () => {
    expect(
      diffGitHubRepository(
        { pushedAt: "2026-01-01T00:00:00Z", updatedAt: null, defaultBranch: "master", archived: false },
        { pushedAt: "2026-01-02T00:00:00Z", updatedAt: null, defaultBranch: "main", archived: true },
      ).map((change) => change.type),
    ).toEqual(["repository_updated", "repository_archived", "default_branch_changed"]);
  });
});
