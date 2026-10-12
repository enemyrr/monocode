import { describe, expect, it } from "vitest";
import type { GitPrDetails } from "../../../platform/tauri/fs";
import {
  mergeTargetMismatch,
  parseGitActionCommand,
  parseGithubRepo,
} from "./git-actions";

describe("parseGitActionCommand", () => {
  it("reads agent commands with the user's note", () => {
    expect(parseGitActionCommand("/commit")).toEqual({
      action: "commit",
      note: "",
    });
    expect(parseGitActionCommand("  /review focus on auth\n")).toEqual({
      action: "review",
      note: "focus on auth",
    });
    expect(parseGitActionCommand("/fix-checks")).toEqual({
      action: "fix-checks",
      note: "",
    });
  });

  it("reads /pr draft as a draft pull request", () => {
    expect(parseGitActionCommand("/pr")).toEqual({
      action: "pr",
      draft: false,
      note: "",
    });
    expect(parseGitActionCommand("/pr draft target release")).toEqual({
      action: "pr",
      draft: true,
      note: "target release",
    });
    expect(parseGitActionCommand("/pr drafting notes")).toEqual({
      action: "pr",
      draft: false,
      note: "drafting notes",
    });
  });

  it("reads an optional merge method", () => {
    expect(parseGitActionCommand("/merge")).toEqual({ action: "merge" });
    expect(parseGitActionCommand("/merge rebase")).toEqual({
      action: "merge",
      method: "rebase",
    });
  });

  it("leaves other prompts alone", () => {
    expect(parseGitActionCommand("please /commit this")).toBeNull();
    expect(parseGitActionCommand("/committed")).toBeNull();
    expect(parseGitActionCommand("/compact")).toBeNull();
  });
});

describe("parseGithubRepo", () => {
  it("reads the repository from a pull request URL", () => {
    expect(parseGithubRepo("https://github.com/acme/web/pull/12")).toBe(
      "acme/web",
    );
    expect(
      parseGithubRepo("https://gitlab.com/acme/web/-/merge_requests/1"),
    ).toBeNull();
  });
});

describe("mergeTargetMismatch", () => {
  const pr: GitPrDetails = {
    number: 12,
    title: "Add x",
    url: "https://github.com/acme/web/pull/12",
    state: "open",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    baseRefName: "main",
    headRefName: "feat",
    headOid: "abc",
    branch: "feat",
    checks: { passed: 1, failed: 0, pending: 0 },
  };

  it("accepts the pull request the user confirmed", () => {
    expect(mergeTargetMismatch(pr, { ...pr, title: "Renamed" })).toBeNull();
  });

  it("refuses a different, moved, or closed pull request", () => {
    expect(mergeTargetMismatch(pr, null)).not.toBeNull();
    expect(mergeTargetMismatch(pr, { ...pr, number: 13 })).not.toBeNull();
    expect(mergeTargetMismatch(pr, { ...pr, branch: "other" })).not.toBeNull();
    expect(mergeTargetMismatch(pr, { ...pr, headOid: "def" })).not.toBeNull();
    expect(mergeTargetMismatch(pr, { ...pr, state: "merged" })).not.toBeNull();
    expect(mergeTargetMismatch(pr, { ...pr, isDraft: true })).not.toBeNull();
  });
});
