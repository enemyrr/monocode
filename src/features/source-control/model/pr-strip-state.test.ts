import { describe, expect, it } from "vitest";
import type { GitPrDetails } from "../../../platform/tauri/fs";
import { prStripState, type PrStripInput } from "./pr-strip-state";

const pr: GitPrDetails = {
  number: 4,
  title: "Add x",
  url: "https://github.com/acme/web/pull/4",
  state: "open",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "main",
  headRefName: "feat",
  headOid: "abc",
  branch: "feat",
  checks: { passed: 3, failed: 0, pending: 0 },
};

const input: PrStripInput = {
  pr,
  branch: "feat",
  defaultBranch: "main",
  hasRemote: true,
  hasWork: true,
};

function action(next: Partial<GitPrDetails> | null) {
  return prStripState({ ...input, pr: next && { ...pr, ...next } })?.action;
}

describe("prStripState", () => {
  it("offers to merge a green pull request", () => {
    expect(prStripState(input)).toEqual({
      label: "Ready to merge",
      tone: "success",
      action: "merge",
    });
  });

  it("offers the fix for what blocks the merge", () => {
    expect(action({ mergeable: "CONFLICTING" })).toBe("fix-conflicts");
    expect(action({ checks: { passed: 1, failed: 2, pending: 0 } })).toBe(
      "fix-checks",
    );
    expect(action({ checks: { passed: 1, failed: 0, pending: 1 } })).toBeNull();
    expect(action({ isDraft: true })).toBeNull();
  });

  it("shows a finished pull request without an action", () => {
    expect(prStripState({ ...input, pr: { ...pr, state: "merged" } })).toEqual({
      label: "Merged",
      tone: "merged",
      action: null,
    });
    expect(action({ state: "closed" })).toBeNull();
  });

  it("offers a pull request only for work on a feature branch", () => {
    expect(action(null)).toBe("pr");
    expect(prStripState({ ...input, pr: null, branch: "main" })).toBeNull();
    expect(prStripState({ ...input, pr: null, hasWork: false })).toBeNull();
    expect(prStripState({ ...input, pr: null, hasRemote: false })).toBeNull();
  });
});
