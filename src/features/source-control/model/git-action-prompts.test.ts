import { describe, expect, it } from "vitest";
import { buildGitActionRequest } from "./git-action-prompts";

describe("buildGitActionRequest", () => {
  it("shows a short message and sends the full instructions", () => {
    const request = buildGitActionRequest("commit");
    expect(request.text).toBe("Commit and push");
    expect(request.instructions).toContain("Do not force-push");
  });

  it("names the branches of a pull request", () => {
    const request = buildGitActionRequest("pr", {
      branch: "feat/x",
      base: "main",
      draft: true,
    });
    expect(request.text).toBe("Create a draft pull request");
    expect(request.instructions).toContain("Current branch: feat/x.");
    expect(request.instructions).toContain("Target branch: main.");
    expect(request.instructions).toContain("gh pr create --draft");
  });

  it("asks the agent to resolve unknown branches", () => {
    const { instructions } = buildGitActionRequest("pr");
    expect(instructions).toContain("git branch --show-current");
    expect(instructions).toContain("default branch");
    expect(instructions).not.toContain("--draft");
  });

  it("reviews against the merge base without editing files", () => {
    const { instructions } = buildGitActionRequest("review", {
      base: "origin/main",
      prUrl: "https://github.com/acme/web/pull/3",
    });
    expect(instructions).toContain("git merge-base origin/main HEAD");
    expect(instructions).toContain("https://github.com/acme/web/pull/3");
    expect(instructions).toContain("Do not modify any files");
  });

  it("merges the base branch to resolve conflicts", () => {
    const { instructions } = buildGitActionRequest("fix-conflicts", {
      base: "develop",
    });
    expect(instructions).toContain("merge the latest develop");
    expect(instructions).toContain("Do not force-push");
  });

  it("carries the user's note into both the message and the instructions", () => {
    const request = buildGitActionRequest("fix-checks", {
      note: "only the lint job",
    });
    expect(request.text).toBe("Fix failing checks: only the lint job");
    expect(request.instructions).toContain("only the lint job");
  });
});
