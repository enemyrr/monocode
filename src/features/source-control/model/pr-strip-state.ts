import type { GitPrDetails } from "../../../platform/tauri/fs";

export type PrStripTone = "success" | "danger" | "warning" | "merged" | "muted";
export type PrStripAction = "pr" | "fix-conflicts" | "fix-checks" | "merge";

export type PrStripState = {
  label: string;
  tone: PrStripTone;
  action: PrStripAction | null;
};

export type PrStripInput = {
  pr: GitPrDetails | null;
  branch: string | null;
  defaultBranch: string | null;
  hasRemote: boolean;
  /** Commits ahead of the default branch or uncommitted changes. */
  hasWork: boolean;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** What the strip says about the branch's PR, or null when there is nothing to show. */
export function prStripState({
  pr,
  branch,
  defaultBranch,
  hasRemote,
  hasWork,
}: PrStripInput): PrStripState | null {
  if (!pr) {
    const featureBranch =
      !!branch && !!defaultBranch && branch !== defaultBranch;
    return featureBranch && hasRemote && hasWork
      ? { label: "No pull request", tone: "muted", action: "pr" }
      : null;
  }
  if (pr.state === "merged")
    return { label: "Merged", tone: "merged", action: null };
  if (pr.state !== "open")
    return { label: "Closed", tone: "muted", action: null };
  if (pr.mergeable === "CONFLICTING")
    return { label: "Conflicts", tone: "warning", action: "fix-conflicts" };
  if (pr.checks.failed > 0)
    return {
      label: plural(pr.checks.failed, "failing check"),
      tone: "danger",
      action: "fix-checks",
    };
  if (pr.isDraft) return { label: "Draft", tone: "muted", action: null };
  if (pr.checks.pending > 0)
    return { label: "Checks running", tone: "warning", action: null };
  return { label: "Ready to merge", tone: "success", action: "merge" };
}
