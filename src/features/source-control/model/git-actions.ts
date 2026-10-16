import { gitPrDetails, type GitPrDetails } from "../../../platform/tauri/fs";
import { githubPrAction } from "../../inbox/model/githubTasks";
import type { BuiltinSkill } from "../../skills/model/skills";
import type { AgentGitAction } from "./git-action-prompts";

export type MergeMethod = "squash" | "merge" | "rebase";

export type GitActionCommand =
  | { action: Exclude<AgentGitAction, "pr">; note: string }
  | { action: "pr"; draft: boolean; note: string }
  | { action: "merge"; method?: MergeMethod };

function builtin(name: string, description: string): BuiltinSkill {
  return {
    kind: "builtin",
    name,
    invocation: name,
    description,
    scope: "builtin",
    source: "monocode",
  };
}

export const GIT_ACTION_COMMANDS: readonly BuiltinSkill[] = [
  builtin("commit", "Have the agent review the diff, commit, and push."),
  builtin(
    "pr",
    "Have the agent commit, push, and open a pull request. Add “draft” for a draft PR.",
  ),
  builtin(
    "fix-conflicts",
    "Have the agent merge the base branch and resolve conflicts.",
  ),
  builtin("fix-checks", "Have the agent fix the PR's failing CI checks."),
  builtin(
    "review",
    "Have the agent review this branch's changes without editing files.",
  ),
  builtin("merge", "Merge this branch's pull request on GitHub."),
];

export const GIT_ACTION_COMMAND_NAMES: ReadonlySet<string> = new Set(
  GIT_ACTION_COMMANDS.map((command) => command.name),
);

const MERGE_METHODS: readonly MergeMethod[] = ["squash", "merge", "rebase"];

/** Parse a leading git action command, or null when the text is a normal prompt. */
export function parseGitActionCommand(text: string): GitActionCommand | null {
  const match = text.match(/^\s*\/([a-z-]+)(?=\s|$)([\s\S]*)$/);
  if (!match || !GIT_ACTION_COMMAND_NAMES.has(match[1]!)) return null;
  const action = match[1] as AgentGitAction | "merge";
  const rest = match[2]!.trim();
  if (action === "merge") {
    const method = MERGE_METHODS.find((entry) => entry === rest.toLowerCase());
    return method ? { action, method } : { action };
  }
  if (action === "pr") {
    const draft = /^draft(?=\s|$)/i.test(rest);
    return { action, draft, note: draft ? rest.slice(5).trim() : rest };
  }
  return { action, note: rest };
}

export function parseGithubRepo(url: string): string | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/);
  return match?.[1] ?? null;
}

export type MergeTarget = Pick<
  GitPrDetails,
  "number" | "url" | "branch" | "headOid"
>;

/** Why a fresh PR read no longer matches what the user confirmed, if it does not. */
export function mergeTargetMismatch(
  target: MergeTarget,
  fresh: GitPrDetails | null,
): string | null {
  if (!fresh || fresh.number !== target.number || fresh.url !== target.url)
    return "The pull request for this branch changed. Review it again.";
  if (fresh.branch !== target.branch)
    return "The checked-out branch changed. Review the pull request again.";
  if (fresh.state !== "open") return `The pull request is ${fresh.state}.`;
  if (fresh.isDraft) return "The pull request is a draft.";
  if (fresh.headOid !== target.headOid)
    return "New commits were pushed to the pull request. Review it again.";
  return null;
}

/** Merge after re-reading the PR, so a stale dialog can never merge the wrong one. */
export async function mergePullRequest(
  cwd: string,
  target: MergeTarget,
  method: MergeMethod,
): Promise<{ merged: boolean; fresh: GitPrDetails | null }> {
  const fresh = await gitPrDetails(cwd);
  const mismatch = mergeTargetMismatch(target, fresh);
  if (mismatch) throw new MergeTargetChanged(mismatch, fresh);
  const repo = parseGithubRepo(target.url);
  if (!repo) throw new Error("Only GitHub pull requests can be merged here.");
  const next = await githubPrAction(cwd, repo, target.number, method);
  return { merged: next.state.trim().toLowerCase() === "merged", fresh };
}

export class MergeTargetChanged extends Error {
  constructor(
    message: string,
    readonly fresh: GitPrDetails | null,
  ) {
    super(message);
  }
}
